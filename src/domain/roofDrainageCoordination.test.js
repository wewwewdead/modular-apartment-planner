import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { createDrain, createRoofSystem } from './roofModels';
import { deriveRoofDrainageCoordination, validateRoofDrainageCoordination } from './roofDrainageCoordination';

const rectangle = (width, depth) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: depth },
  { x: 0, y: depth },
];

describe('roof drainage coordination', () => {
  it('accepts a flat-roof drain routed to a modeled wet shaft', () => {
    const project = createProject('Roof drainage');
    project.building.systems.plumbing.shafts = [{ id: 'shaft_1', origin: { x: 2000, y: 2000 } }];
    project.roofSystem = createRoofSystem('Roof', {
      id: 'roof_1',
      roofType: 'flat',
      boundaryPolygon: rectangle(8000, 6000),
      finishSlope: 1,
      drains: [
        createDrain(
          { x: 3000, y: 3000 },
          {
            id: 'drain_1',
            outletRef: { kind: 'plumbing_shaft', id: 'shaft_1' },
            routePoints: [
              { x: 3000, y: 3000 },
              { x: 2000, y: 2000 },
            ],
          },
        ),
      ],
    });
    expect(deriveRoofDrainageCoordination(project)).toMatchObject({ drainCount: 1, routedDrainCount: 1 });
    expect(validateRoofDrainageCoordination(project)).toEqual([]);
  });

  it('reports missing slope, invalid drain position, outlet, and route', () => {
    const project = createProject('Bad roof drainage');
    project.roofSystem = createRoofSystem('Roof', {
      id: 'roof_1',
      roofType: 'flat',
      boundaryPolygon: rectangle(8000, 6000),
      finishSlope: 0,
      drains: [createDrain({ x: 9000, y: 3000 }, { id: 'drain_1' })],
    });
    const rules = validateRoofDrainageCoordination(project).map((entry) => entry.ruleId);
    expect(rules).toEqual(
      expect.arrayContaining([
        'ROOF_DRAINAGE.SLOPE_BELOW_ASSUMPTION',
        'ROOF_DRAINAGE.DRAIN_OUTSIDE_BOUNDARY',
        'ROOF_DRAINAGE.OUTLET_REFERENCE_MISSING',
      ]),
    );
  });
});
