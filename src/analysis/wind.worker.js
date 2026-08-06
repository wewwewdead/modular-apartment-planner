import { computeWindStudy } from './windRunner';

function transferablesOf(result) {
  const grid = result?.grid;
  if (!grid) return [];
  const arrays = [
    grid.obstacles,
    grid.amplification,
    grid.velocityX,
    grid.velocityY,
    grid.pressureCoefficient,
    grid.comfortSpeed,
    grid.safetySpeed,
    grid.categories,
    grid.unsafe,
    grid.counts,
    result?.representativeFlow?.amplification,
    result?.representativeFlow?.velocityX,
    result?.representativeFlow?.velocityY,
  ].filter(Boolean);
  return [...new Set(arrays.map((array) => array.buffer))];
}

self.onmessage = (event) => {
  const { id, project, windStudy, phaseScope } = event.data || {};
  try {
    const result = computeWindStudy({ project, windStudy, phaseScope }, (progress) =>
      self.postMessage({ id, type: 'progress', progress }),
    );
    self.postMessage({ id, type: 'result', result }, transferablesOf(result));
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || 'Wind study failed.' });
  }
};
