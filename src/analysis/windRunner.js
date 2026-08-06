import { buildAnalysisMassing } from './buildingMassing';
import { buildWindDomain, buildWindResultGrid, sampleLocalFieldAtWorld } from './windDomain';
import { solveD2Q9 } from './lbmSolver';
import { classifyComfortGrid, WIND_COMFORT_CATEGORIES } from './windComfort';
import { createWindStudyState, normalizeWindRose } from './windState';
import { computeVentilationNetwork } from './ventilationNetwork';
import { siteExposure } from './windExposure';

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

function runDirection({ masses, grid, settings, northAngle, directionDeg, onProgress }) {
  const domain = buildWindDomain({
    masses,
    directionDeg,
    northAngle,
    sliceHeight: settings.sliceHeight,
    resolution: settings.resolution,
    domainPadding: settings.domainPadding,
  });
  if (!domain) return null;
  const solved = solveD2Q9({
    columns: domain.columns,
    rows: domain.rows,
    obstacles: domain.obstacles,
    iterations: settings.iterations,
    relaxationTime: settings.relaxationTime,
    onProgress,
  });
  return { ...resampleRun(domain, solved, grid), solver: { iterations: solved.iterations, residual: solved.residual } };
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
  const mode = phaseScope?.phaseViewMode;
  return {
    activePhaseId: phaseScope?.activePhaseId || null,
    phaseViewMode: PHASE_VIEW_MODES.includes(mode) ? mode : 'all',
  };
}

export function computeWindStudy({ project, windStudy, phaseScope = null }, onProgress = null) {
  const settings = { ...createWindStudyState(), ...(windStudy || {}) };
  if (!settings.enabled) return null;
  const masses = buildAnalysisMassing(project, { includeRoof: false });
  const grid = buildWindResultGrid({
    masses,
    sliceHeight: settings.sliceHeight,
    resolution: settings.resolution,
    domainPadding: settings.domainPadding,
  });
  if (!grid) return null;
  const site = project?.building?.site || {};
  const northAngle = site.northAngle || 0;
  const cellCount = grid.columns * grid.rows;

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
   * residual: `solveD2Q9` runs to `settings.iterations` unless it converges
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

  if (settings.mode === 'direction') {
    const run = runDirection({
      masses,
      grid,
      settings,
      northAngle,
      directionDeg: settings.directionDeg,
      onProgress: (progress) => onProgress?.({ stage: 'solve', directionDeg: settings.directionDeg, ...progress }),
    });
    if (!run) return null;
    const directionGrid = { ...grid, ...run };
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
      summary: summarizeDirection(run.amplification, grid.obstacles, siteReferenceSpeed),
      ventilation,
      model,
    };
  }

  const windRose = normalizeWindRose(settings.windRose);
  if (!windRose) throw new Error('Comfort study needs a valid wind rose.');
  // The rose is reported unchanged — it is the SITE climate, quoted at 10 m,
  // and rewriting it would leave nothing to trace the result back to. Only the
  // copy the classifier consumes carries the slice-height scales.
  const siteRose = windRose.map((sector) => ({ ...sector, weibullC: sector.weibullC * exposure.factor }));
  const sectorCount = windRose.length;
  const sectorAmplifications = new Float32Array(cellCount * sectorCount);
  const solverRuns = [];
  const representativeSectorIndex = windRose.reduce(
    (bestIndex, sector, index) => (sector.frequency > windRose[bestIndex].frequency ? index : bestIndex),
    0,
  );
  let representativeFlow = null;

  for (let sectorIndex = 0; sectorIndex < sectorCount; sectorIndex += 1) {
    const sector = windRose[sectorIndex];
    const run = runDirection({
      masses,
      grid,
      settings,
      northAngle,
      directionDeg: sector.directionDeg,
      onProgress: (progress) =>
        onProgress?.({
          stage: 'sector',
          sector: sectorIndex + 1,
          sectors: sectorCount,
          directionDeg: sector.directionDeg,
          overall: (sectorIndex + progress.iteration / progress.iterations) / sectorCount,
          ...progress,
        }),
    });
    if (!run) continue;
    sectorAmplifications.set(run.amplification, sectorIndex * cellCount);
    solverRuns.push({ directionDeg: sector.directionDeg, ...run.solver });
    if (sectorIndex === representativeSectorIndex) {
      representativeFlow = {
        directionDeg: sector.directionDeg,
        frequency: sector.frequency,
        // The Weibull scale is used only to pace the visual particles. The
        // dimensionless LBM vectors still carry the actual local pattern. It is
        // the slice-height scale, not the 10 m one: the particles are drawn at
        // pedestrian height and have to move at pedestrian-height speeds.
        referenceSpeed: siteRose[sectorIndex].weibullC,
        amplification: run.amplification,
        velocityX: run.velocityX,
        velocityY: run.velocityY,
      };
    }
  }

  onProgress?.({ stage: 'classify', overall: 1 });
  const comfort = classifyComfortGrid({
    sectorAmplifications,
    sectorCount,
    cellCount,
    obstacles: grid.obstacles,
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
    grid: { ...grid, ...comfort },
    representativeFlow,
    summary: {
      fractions,
      unsafeFraction: comfort.unsafeFraction,
      assessedCellCount: comfort.assessedCellCount,
    },
    solverRuns,
    model,
  };
}
