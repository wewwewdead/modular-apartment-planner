import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { deriveAreaLedger } from './siteModels';

function line(ns, degrees, minutes, ew, distanceMeters) {
  return { ns, degrees, minutes, ew, distance: distanceMeters * 1000 };
}

// Lot 812-I-1-A from a real subdivision sketch plan, titled area 60 sq m.
const LOT_LINES = [
  line('N', 50, 56, 'W', 12.69),
  line('N', 47, 0, 'E', 4.51),
  line('S', 54, 57, 'E', 5.97),
  line('S', 54, 57, 'E', 5.94),
  line('S', 37, 2, 'W', 5.31),
];

function configure(project, overrides = {}) {
  return executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.CONFIGURE_SURVEYED_SITE,
    lines: LOT_LINES,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Road Lot 812-J',
    edgeSetbacks: LOT_LINES.map((_, index) => ({ edgeIndex: index, distance: index === 0 ? 3000 : 1500 })),
    ...overrides,
  });
}

describe('ConfigureSurveyedSite', () => {
  it('builds the boundary polygon from bearings and distances', () => {
    const result = configure(createProject('Surveyed'));

    expect(result.ok).toBe(true);
    const site = result.project.building.site;
    expect(site.boundary).toHaveLength(5);
    // One vertex per boundary line, starting at the origin.
    expect(site.boundary[0]).toEqual({ x: 0, y: 0 });
    expect(site.roadEdges).toEqual([{ edgeIndex: 0, roadName: 'Road Lot 812-J' }]);
  });

  it('reproduces the titled lot area in the feasibility ledger', () => {
    const result = configure(createProject('Surveyed'));
    const ledger = deriveAreaLedger(result.project);

    expect(ledger.lotArea.value / 1_000_000).toBeGreaterThan(59.5);
    expect(ledger.lotArea.value / 1_000_000).toBeLessThan(60.5);
    // Both of the sketch plan's lots are convex, so setbacks derive automatically.
    expect(ledger.buildableArea.value).toBeGreaterThan(0);
  });

  it('classifies the frontage setback as front and the rest as sides', () => {
    const result = configure(createProject('Surveyed'), { frontEdgeIndex: 1 });
    const classifications = result.project.building.site.edgeSetbacks.map((entry) => entry.classification);

    expect(classifications).toEqual(['side', 'front', 'side', 'side', 'side']);
  });

  it('keeps the technical description for round-trip editing', () => {
    const result = configure(createProject('Surveyed'));
    const setup = result.project.building.site.lotSetup;

    expect(setup.kind).toBe('surveyed');
    expect(setup.lines).toHaveLength(5);
    expect(setup.lines[0]).toMatchObject({ ns: 'N', degrees: 50, minutes: 56, ew: 'W', distance: 12_690 });
    expect(setup.frontEdgeIndex).toBe(0);
  });

  it('rotates the lot when a north angle is given', () => {
    const straight = configure(createProject('Surveyed'));
    const rotated = configure(createProject('Surveyed'), { northAngle: 39 });

    expect(rotated.ok).toBe(true);
    expect(rotated.project.building.site.northAngle).toBe(39);
    // Same lot, same area, different orientation.
    const straightLedger = deriveAreaLedger(straight.project);
    const rotatedLedger = deriveAreaLedger(rotated.project);
    expect(rotatedLedger.lotArea.value).toBeCloseTo(straightLedger.lotArea.value, 0);
    expect(rotated.project.building.site.boundary[1].x).not.toBeCloseTo(
      straight.project.building.site.boundary[1].x,
      0,
    );
  });

  it('rejects a traverse that does not close', () => {
    const typo = LOT_LINES.map((entry, index) => (index === 0 ? { ...entry, distance: 11_690 } : entry));
    const result = configure(createProject('Surveyed'), { lines: typo });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('traverse-misclosure');
    // A rejected command must not half-apply.
    expect(result.project.building.site.boundary).toHaveLength(0);
  });

  it.each([
    ['fewer than three lines', { lines: LOT_LINES.slice(0, 2) }, 'invalid-traverse-lines'],
    [
      'a bearing outside its quadrant',
      { lines: [line('N', 95, 0, 'E', 5), ...LOT_LINES.slice(1)] },
      'invalid-traverse-lines',
    ],
    [
      'a non-numeric distance',
      { lines: [{ ...LOT_LINES[0], distance: '12.69' }, ...LOT_LINES.slice(1)] },
      'invalid-traverse-lines',
    ],
    ['a frontage index past the last line', { frontEdgeIndex: 5 }, 'invalid-frontage-edge'],
    ['a non-finite north angle', { northAngle: Number.NaN }, 'invalid-site-orientation'],
    ['missing setbacks', { edgeSetbacks: null }, 'incomplete-edge-setbacks'],
    ['a setback for only some edges', { edgeSetbacks: [{ edgeIndex: 0, distance: 3000 }] }, 'incomplete-edge-setbacks'],
    [
      'a negative setback',
      { edgeSetbacks: LOT_LINES.map((_, index) => ({ edgeIndex: index, distance: index === 2 ? -1 : 1500 })) },
      'invalid-edge-setback',
    ],
  ])('rejects %s', (_label, overrides, code) => {
    const result = configure(createProject('Surveyed'), overrides);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(code);
    expect(result.project.building.site.boundary).toHaveLength(0);
  });
});
