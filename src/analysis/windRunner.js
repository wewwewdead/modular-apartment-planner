import { buildAnalysisMassing } from './buildingMassing';
import { buildWindDomain, buildWindResultGrid, sampleLocalFieldAtWorld } from './windDomain';
import { StudyAbortedError, isStudyAborted, solveD2Q9, solveD2Q9Async } from './lbmSolver';
import { classifyComfortGrid, WIND_COMFORT_CATEGORIES } from './windComfort';
import { createWindStudyState, normalizeWindRose } from './windState';
import { computeVentilationNetwork } from './ventilationNetwork';
import { siteExposure } from './windExposure';
import { combinedWindRequestKey, windMassingKey, windNetworkKey } from './studyRequestIdentity';

export { StudyAbortedError, isStudyAborted };

function resampleRun(domain, solved, grid) {
  const cellCount = grid.columns * grid.rows;
  const amplification = new Float32Array(cellCount);
  const velocityX = new Float32Array(cellCount);
  const velocityY = new Float32Array(cellCount);
  const pressureCoefficient = new Float32Array(cellCount);
  for (let row = 0; row < grid.rows; row += 1) {
    const y = grid.origin.y + (row + 0.5) * grid.cellSize;
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;
      if (grid.obstacles[index]) continue;
      const x = grid.origin.x + (column + 0.5) * grid.cellSize;
      const amp = sampleLocalFieldAtWorld(domain, solved.amplification, x, y, 1);
      const localX = sampleLocalFieldAtWorld(domain, solved.velocityX, x, y, 1);
      const localY = sampleLocalFieldAtWorld(domain, solved.velocityY, x, y, 0);
      const cp = sampleLocalFieldAtWorld(domain, solved.pressureCoefficient, x, y, 0);
      amplification[index] = amp;
      velocityX[index] = domain.basis.flow.x * localX + domain.basis.cross.x * localY;
      velocityY[index] = domain.basis.flow.y * localX + domain.basis.cross.y * localY;
      pressureCoefficient[index] = cp;
    }
  }
  return { amplification, velocityX, velocityY, pressureCoefficient };
}

function summarizeDirection(field, obstacles, referenceSpeed) {
  let peakAmplification = 0;
  let totalAmplification = 0;
  let assessed = 0;
  let accelerated = 0;
  let sheltered = 0;
  for (let index = 0; index < field.length; index += 1) {
    if (obstacles[index]) continue;
    const value = field[index];
    peakAmplification = Math.max(peakAmplification, value);
    totalAmplification += value;
    assessed += 1;
    if (value >= 1.5) accelerated += 1;
    if (value <= 0.5) sheltered += 1;
  }
  return {
    referenceSpeed,
    peakAmplification,
    peakSpeed: peakAmplification * referenceSpeed,
    meanAmplification: assessed ? totalAmplification / assessed : 0,
    acceleratedFraction: assessed ? accelerated / assessed : 0,
    shelteredFraction: assessed ? sheltered / assessed : 0,
    assessedCellCount: assessed,
  };
}

/** Phase view modes the editor can be in; anything else reads as unfiltered. */
const PHASE_VIEW_MODES = ['all', 'single', 'cumulative'];

/**
 * What the caller was LOOKING AT when it asked for this run.
 *
 * The runner is handed a project that has already been through
 * `filterProjectByPhase`, so by the time it sees the model there is no way to
 * tell a sealed building from one whose facade a phase view removed. The scope
 * travels with the request and is stamped on the result, so a stored study can
 * still say what it was a study OF. A missing scope is the default view, which
 * hides nothing.
 */
function normalizePhaseScope(phaseScope) {
  return {
    activePhaseId: phaseScope?.activePhaseId || null,
    phaseViewMode: PHASE_VIEW_MODES.includes(phaseScope?.phaseViewMode) ? phaseScope.phaseViewMode : 'all',
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 1 — what the request IS                                              */
/* -------------------------------------------------------------------------- */

/**
 * Everything a run needs that costs nothing to work out, including its identity.
 *
 * This is the cheap half of the old `computeWindStudy` prologue: settings
 * defaulting, site readings, the exposure transform, the disclosure block, the
 * sector list, and the two content keys the worker's cache is filed under.
 * Nothing here rasterizes or solves, so it is safe to run on every request —
 * which is the point, because the keys it produces are how a request finds out
 * that it does not need to do either.
 *
 * @returns {object|null} null when the study is switched off.
 */
export function prepareWindRun({ project, windStudy, phaseScope = null }) {
  const settings = { ...createWindStudyState(), ...(windStudy || {}) };
  if (!settings.enabled) return null;

  const site = project?.building?.site || {};
  const northAngle = site.northAngle || 0;

  /**
   * The 10 m -> slice-height correction, applied EXACTLY ONCE, here.
   *
   * Every speed that enters this runner is a 10 m meteorological figure:
   * `settings.referenceSpeed` is written from the reanalysis `prevailingMeanSpeed`
   * when a site climate loads, and each rose sector's Weibull scale is fitted to
   * `wind_speed_10m` samples. Both are transformed by the same scalar so the two
   * modes stay consistent — a comfort map and a direction run on the same site
   * must not disagree about how fast the wind is.
   *
   * The LBM sees none of this: its amplification field is dimensionless, so the
   * factor multiplies only the reference the field is scaled BY. That is why one
   * multiplication here reaches the summary speeds, the facade dynamic pressure
   * inside the ventilation network, and the comfort quantiles alike.
   */
  const exposure = siteExposure({ exposureClass: site.exposureClass, sliceHeightMm: settings.sliceHeight });

  /**
   * What every result says about itself, before any of it is computed.
   *
   * `convergence` is a disclosure of the ITERATION BUDGET, not of an achieved
   * residual: the solver runs to `settings.iterations` unless it converges
   * first, and at the screening default it does not. The residual it reached is
   * reported separately on `grid.solver`; this names the budget it was given,
   * which is the thing a reader has to know to judge that residual.
   */
  const model = {
    kind: 'D2Q9-BGK-2D',
    screeningOnly: true,
    exposure,
    convergence: `screening-${settings.iterations}`,
    phaseScope: normalizePhaseScope(phaseScope),
  };

  const massingKey = windMassingKey({ project, settings });
  const networkKey = windNetworkKey({ project, settings });

  return {
    project,
    settings,
    site,
    northAngle,
    exposure,
    model,
    massingKey,
    networkKey,
    sourceKey: { massingKey, networkKey },
    key: combinedWindRequestKey({ massingKey, networkKey }),
  };
}

/**
 * The wind rose a comfort run is a mixture over, and the directions it solves.
 *
 * Deferred out of `prepareWindRun` so that a rose bad enough to throw does so
 * only once the run is genuinely going ahead — the same point in the sequence
 * the old single-function runner threw at, after the massing check.
 */
function runSectors(settings) {
  if (settings.mode !== 'comfort') return { windRose: null, directions: [settings.directionDeg] };
  const windRose = normalizeWindRose(settings.windRose);
  if (!windRose) throw new Error('Comfort study needs a valid wind rose.');
  return { windRose, directions: windRose.map((sector) => sector.directionDeg) };
}

/* -------------------------------------------------------------------------- */
/* Stage 2 — the massing raster and the solved fields                         */
/* -------------------------------------------------------------------------- */

/**
 * Rasterize the building. Everything this produces is a function of the
 * massing key and of nothing else, which is why it is cached alongside the
 * fields rather than rebuilt on a network-only change: at production resolution
 * the union and the two rasterizations are a real cost, and repeating them
 * would eat most of what skipping the lattice saves.
 *
 * @returns {{masses: Array, grid: object}|null} null when nothing stands at the slice.
 */
export function buildWindMassing(prepared) {
  const { settings } = prepared;
  const masses = buildAnalysisMassing(prepared.project, { includeRoof: false });
  const grid = buildWindResultGrid({
    masses,
    sliceHeight: settings.sliceHeight,
    resolution: settings.resolution,
    domainPadding: settings.domainPadding,
  });
  if (!grid) return null;
  return { masses, grid };
}

function sectorProgress(prepared, index, count, directionDeg, onProgress) {
  if (!onProgress) return null;
  if (prepared.settings.mode !== 'comfort') {
    return (progress) => onProgress({ stage: 'solve', directionDeg, ...progress });
  }
  return (progress) =>
    onProgress({
      stage: 'sector',
      sector: index + 1,
      sectors: count,
      directionDeg,
      overall: (index + progress.iteration / progress.iterations) / count,
      ...progress,
    });
}

function directionDomain(prepared, massing, directionDeg) {
  const { settings } = prepared;
  return buildWindDomain({
    masses: massing.masses,
    directionDeg,
    northAngle: prepared.northAngle,
    sliceHeight: settings.sliceHeight,
    resolution: settings.resolution,
    domainPadding: settings.domainPadding,
  });
}

function solverArguments(prepared, domain, onProgress) {
  return {
    columns: domain.columns,
    rows: domain.rows,
    obstacles: domain.obstacles,
    iterations: prepared.settings.iterations,
    relaxationTime: prepared.settings.relaxationTime,
    onProgress,
  };
}

function fieldOf(domain, solved, grid, directionDeg) {
  return {
    directionDeg,
    ...resampleRun(domain, solved, grid),
    solver: { iterations: solved.iterations, residual: solved.residual },
  };
}

/**
 * Solve one lattice field per sector, synchronously.
 *
 * The array is positional: entry `i` is the field for `directions[i]`, and a
 * null entry means the domain builder found nothing to flow around at that
 * bearing. Direction mode has exactly one entry.
 */
export function solveWindFields(prepared, massing, directions, onProgress = null) {
  return directions.map((directionDeg, index) => {
    const domain = directionDomain(prepared, massing, directionDeg);
    if (!domain) return null;
    const progress = sectorProgress(prepared, index, directions.length, directionDeg, onProgress);
    const solved = solveD2Q9(solverArguments(prepared, domain, progress));
    return fieldOf(domain, solved, massing.grid, directionDeg);
  });
}

/**
 * The same fields, solved in abandonable chunks.
 *
 * Used only by the worker. `shouldAbort` is consulted between sectors as well as
 * inside each one, so a sixteen-sector comfort study superseded on its second
 * sector stops there rather than after the sixteenth.
 */
export async function solveWindFieldsAsync(prepared, massing, directions, onProgress = null, control = {}) {
  const { shouldAbort = null } = control;
  const fields = [];
  for (let index = 0; index < directions.length; index += 1) {
    if (shouldAbort?.()) throw new StudyAbortedError();
    const directionDeg = directions[index];
    const domain = directionDomain(prepared, massing, directionDeg);
    if (!domain) {
      fields.push(null);
      continue;
    }
    const progress = sectorProgress(prepared, index, directions.length, directionDeg, onProgress);
    const solved = await solveD2Q9Async(solverArguments(prepared, domain, progress), control);
    fields.push(fieldOf(domain, solved, massing.grid, directionDeg));
  }
  return fields;
}

/* -------------------------------------------------------------------------- */
/* Stage 3 — assemble a result from fields that already exist                  */
/* -------------------------------------------------------------------------- */

/**
 * A result-space grid the caller may hand away.
 *
 * The obstacle raster is copied rather than shared because the worker transfers
 * every typed array it posts, and a transferred buffer is DETACHED on this side.
 * Sharing the cached one would work exactly once and then hand out an empty
 * building. The same reasoning applies to every field array copied below.
 */
function resultGrid(grid) {
  return { ...grid, obstacles: Uint8Array.from(grid.obstacles) };
}

function copyOf(field) {
  return Float32Array.from(field);
}

/**
 * Build the study a caller reads from fields that have already been solved.
 *
 * Every remaining cost lives here — the multizone airflow network, the comfort
 * classification, the summaries — and every one of them is a function of the
 * network key. That is the whole shape of the cache: a change that moves only
 * the network key re-runs only this function.
 */
export function assembleWindResult(prepared, massing, fields, windRose, onProgress = null) {
  const { settings, model, project, northAngle, exposure } = prepared;
  const grid = massing.grid;
  const cellCount = grid.columns * grid.rows;

  if (settings.mode !== 'comfort') {
    const run = fields[0];
    if (!run) return null;
    const directionGrid = {
      ...resultGrid(grid),
      amplification: copyOf(run.amplification),
      velocityX: copyOf(run.velocityX),
      velocityY: copyOf(run.velocityY),
      pressureCoefficient: copyOf(run.pressureCoefficient),
      solver: { ...run.solver },
    };
    const siteReferenceSpeed = settings.referenceSpeed * exposure.factor;
    const ventilation = computeVentilationNetwork({
      project,
      grid: directionGrid,
      referenceSpeed: siteReferenceSpeed,
      // Only used if a facade sample fails its sanity test and the empirical
      // fallback needs an incidence angle.
      directionDeg: settings.directionDeg,
      northAngle,
      sliceHeightMm: settings.sliceHeight,
    });
    return {
      mode: 'direction',
      directionDeg: settings.directionDeg,
      sliceHeight: settings.sliceHeight,
      grid: directionGrid,
      summary: summarizeDirection(directionGrid.amplification, directionGrid.obstacles, siteReferenceSpeed),
      ventilation,
      model,
      sourceKey: prepared.sourceKey,
    };
  }

  // The rose is reported unchanged — it is the SITE climate, quoted at 10 m,
  // and rewriting it would leave nothing to trace the result back to. Only the
  // copy the classifier consumes carries the slice-height scales.
  const siteRose = windRose.map((sector) => ({ ...sector, weibullC: sector.weibullC * exposure.factor }));
  const sectorCount = windRose.length;
  const sectorAmplifications = new Float32Array(cellCount * sectorCount);
  /**
   * Every sector's facade pressure field, kept rather than thrown away.
   *
   * Laid out exactly like `sectorAmplifications`: sector-major, so sector `s`
   * occupies `[s * cellCount, (s + 1) * cellCount)` and the sector order is the
   * NORMALIZED rose's order, which is the order `windRose` is reported in.
   *
   * The cost is real and is accepted deliberately: at the default resolution 96
   * and a 16-sector rose this is around half a megabyte of Float32, transferred
   * once out of the worker. What it buys is that a comfort study can answer
   * "what would opening this window do" for any sector without re-solving the
   * lattice — the amplification field alone cannot, because it is a speed
   * magnitude and says nothing about which way a facade is pushed.
   */
  const sectorPressureCoefficients = new Float32Array(cellCount * sectorCount);
  const solverRuns = [];
  const representativeSectorIndex = windRose.reduce(
    (bestIndex, sector, index) => (sector.frequency > windRose[bestIndex].frequency ? index : bestIndex),
    0,
  );
  let representativeFlow = null;
  const comfortGrid = resultGrid(grid);

  for (let sectorIndex = 0; sectorIndex < sectorCount; sectorIndex += 1) {
    const sector = windRose[sectorIndex];
    const run = fields[sectorIndex];
    if (!run) continue;
    sectorAmplifications.set(run.amplification, sectorIndex * cellCount);
    sectorPressureCoefficients.set(run.pressureCoefficient, sectorIndex * cellCount);
    solverRuns.push({ directionDeg: sector.directionDeg, ...run.solver });
    if (sectorIndex === representativeSectorIndex) {
      /**
       * The one speed this sector is read at, built the way direction mode
       * builds its own.
       *
       * Direction mode makes `siteReferenceSpeed` by multiplying the single
       * `settings.referenceSpeed` by the exposure factor. A comfort study has no
       * single reference speed — the rose IS the climate — so the sector's own
       * Weibull scale stands in for it, and `siteRose` has already carried it
       * through the same exposure factor. That is the whole reason this reads
       * `siteRose` rather than applying `exposure.factor` again here: the T11
       * correction is applied exactly once, at the point the site rose is built.
       *
       * It is also, deliberately, the number `referenceSpeed` below already
       * reports. The particles, the facade dynamic pressure and the air-change
       * rates are then all quoted against one speed, so a reader who divides an
       * opening's pressure by 0.5 * rho * U^2 gets back the Cp on the field.
       */
      const sectorReferenceSpeed = siteRose[sectorIndex].weibullC;
      const representativeGrid = {
        ...comfortGrid,
        amplification: copyOf(run.amplification),
        velocityX: copyOf(run.velocityX),
        velocityY: copyOf(run.velocityY),
        pressureCoefficient: copyOf(run.pressureCoefficient),
      };
      representativeFlow = {
        directionDeg: sector.directionDeg,
        frequency: sector.frequency,
        // The Weibull scale is used only to pace the visual particles. The
        // dimensionless LBM vectors still carry the actual local pattern. It is
        // the slice-height scale, not the 10 m one: the particles are drawn at
        // pedestrian height and have to move at pedestrian-height speeds.
        referenceSpeed: sectorReferenceSpeed,
        amplification: representativeGrid.amplification,
        velocityX: representativeGrid.velocityX,
        velocityY: representativeGrid.velocityY,
        pressureCoefficient: representativeGrid.pressureCoefficient,
        /**
         * The airflow network for THIS sector, and no other.
         *
         * It lives inside `representativeFlow` rather than at the top of the
         * result because that is exactly what it is a network of: one wind
         * direction, the most frequent one on the rose. A `ventilation` block
         * at the top level would read as a property of the comfort study, and a
         * comfort study is a mixture over sixteen directions — there is no
         * single set of room pressures it could honestly report.
         */
        ventilation: computeVentilationNetwork({
          project,
          grid: representativeGrid,
          referenceSpeed: sectorReferenceSpeed,
          // Only used if a facade sample fails its sanity test and the empirical
          // fallback needs an incidence angle.
          directionDeg: sector.directionDeg,
          northAngle,
          sliceHeightMm: settings.sliceHeight,
        }),
      };
    }
  }

  onProgress?.({ stage: 'classify', overall: 1 });
  const comfort = classifyComfortGrid({
    sectorAmplifications,
    sectorCount,
    cellCount,
    obstacles: comfortGrid.obstacles,
    // The Lawson thresholds are pedestrian-height speeds, so the mixture they
    // are compared against has to be a pedestrian-height mixture.
    windRose: siteRose,
  });
  const fractions = Array.from(comfort.counts, (count, index) => ({
    id: WIND_COMFORT_CATEGORIES[index].id,
    label: WIND_COMFORT_CATEGORIES[index].label,
    fraction: comfort.assessedCellCount ? count / comfort.assessedCellCount : 0,
  }));

  return {
    mode: 'comfort',
    sliceHeight: settings.sliceHeight,
    windRose,
    windRoseSource: settings.windRoseSource,
    grid: { ...comfortGrid, ...comfort },
    sectorPressureCoefficients,
    representativeFlow,
    summary: {
      fractions,
      unsafeFraction: comfort.unsafeFraction,
      assessedCellCount: comfort.assessedCellCount,
    },
    solverRuns,
    model,
    sourceKey: prepared.sourceKey,
  };
}

/* -------------------------------------------------------------------------- */
/* The three stages, run end to end                                            */
/* -------------------------------------------------------------------------- */

/**
 * One wind study, synchronously, exactly as before the stages were separated.
 *
 * Every physics test, every validation suite and the fixture generator call
 * this. It builds nothing it can reuse and caches nothing: a caller that wants
 * the cache uses the worker.
 */
export function computeWindStudy({ project, windStudy, phaseScope = null }, onProgress = null) {
  const prepared = prepareWindRun({ project, windStudy, phaseScope });
  if (!prepared) return null;
  const massing = buildWindMassing(prepared);
  if (!massing) return null;
  const { windRose, directions } = runSectors(prepared.settings);
  const fields = solveWindFields(prepared, massing, directions, onProgress);
  return assembleWindResult(prepared, massing, fields, windRose, onProgress);
}

/**
 * The sector directions a prepared run will solve, and the rose behind them.
 * Exported for the worker, which has to know the sector list to file solved
 * fields against it.
 */
export function windRunSectors(prepared) {
  return runSectors(prepared.settings);
}
