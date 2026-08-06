import { buildAnalysisMassing } from './buildingMassing';
import { buildWindDomain, buildWindResultGrid, sampleLocalFieldAtWorld } from './windDomain';
import { solveD2Q9 } from './lbmSolver';
import { classifyComfortGrid, WIND_COMFORT_CATEGORIES } from './windComfort';
import { createWindStudyState, normalizeWindRose } from './windState';
import { computeVentilationNetwork } from './ventilationNetwork';

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

export function computeWindStudy({ project, windStudy }, onProgress = null) {
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
  const northAngle = project?.building?.site?.northAngle || 0;
  const cellCount = grid.columns * grid.rows;

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
    const ventilation = computeVentilationNetwork({
      project,
      grid: directionGrid,
      referenceSpeed: settings.referenceSpeed,
      // Only used if a facade sample fails its sanity test and the empirical
      // fallback needs an incidence angle.
      directionDeg: settings.directionDeg,
      northAngle,
    });
    return {
      mode: 'direction',
      directionDeg: settings.directionDeg,
      sliceHeight: settings.sliceHeight,
      grid: directionGrid,
      summary: summarizeDirection(run.amplification, grid.obstacles, settings.referenceSpeed),
      ventilation,
      model: { kind: 'D2Q9-BGK-2D', screeningOnly: true },
    };
  }

  const windRose = normalizeWindRose(settings.windRose);
  if (!windRose) throw new Error('Comfort study needs a valid wind rose.');
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
        // dimensionless LBM vectors still carry the actual local pattern.
        referenceSpeed: sector.weibullC,
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
    windRose,
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
    model: { kind: 'D2Q9-BGK-2D', screeningOnly: true },
  };
}
