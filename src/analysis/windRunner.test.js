import { describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import { computeWindStudy } from './windRunner';
import { createWindStudyState } from './windState';

function projectWithBlock() {
  const project = createProject('Wind');
  const corners = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ];
  project.floors[0].walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 500, { height: 9000 }),
  );
  return project;
}

describe('wind study runner', () => {
  it('returns an amplification field for one meteorological direction', () => {
    const result = computeWindStudy({
      project: projectWithBlock(),
      windStudy: createWindStudyState({
        enabled: true,
        mode: 'direction',
        resolution: 48,
        iterations: 150,
        domainPadding: 10000,
      }),
    });
    expect(result.mode).toBe('direction');
    expect(result.grid.amplification).toHaveLength(result.grid.columns * result.grid.rows);
    expect(result.summary.peakAmplification).toBeGreaterThan(1);
    expect(result.model.screeningOnly).toBe(true);
  });

  it('runs a multi-sector Weibull comfort classification', () => {
    const windRose = [
      { directionDeg: 0, frequency: 0.6, weibullK: 2, weibullC: 3 },
      { directionDeg: 180, frequency: 0.4, weibullK: 2, weibullC: 3 },
    ];
    const progress = [];
    const result = computeWindStudy(
      {
        project: projectWithBlock(),
        windStudy: createWindStudyState({
          enabled: true,
          mode: 'comfort',
          windRose,
          windRoseSource: 'user',
          resolution: 48,
          iterations: 120,
          domainPadding: 10000,
        }),
      },
      (entry) => progress.push(entry),
    );
    expect(result.mode).toBe('comfort');
    expect(result.grid.categories).toHaveLength(result.grid.columns * result.grid.rows);
    expect(result.representativeFlow.directionDeg).toBe(0);
    expect(result.representativeFlow.frequency).toBeCloseTo(0.6);
    expect(result.representativeFlow.velocityX).toHaveLength(result.grid.columns * result.grid.rows);
    expect(result.summary.fractions.reduce((sum, entry) => sum + entry.fraction, 0)).toBeCloseTo(1, 5);
    expect(result.windRoseSource).toBe('user');
    expect(progress.some((entry) => entry.stage === 'classify')).toBe(true);
  });

  it('returns null when disabled or no pedestrian-height massing exists', () => {
    expect(
      computeWindStudy({ project: projectWithBlock(), windStudy: createWindStudyState({ enabled: false }) }),
    ).toBeNull();
    expect(
      computeWindStudy({ project: createProject('Empty'), windStudy: createWindStudyState({ enabled: true }) }),
    ).toBeNull();
  });
});
