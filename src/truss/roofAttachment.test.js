import { describe, expect, it } from 'vitest';
import { createTrussSystem } from '@/domain/trussModels';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { deriveRoofStateFromTrussSystem } from './roofAttachment';

// Layout line along +x, so the truss span axis (perpendicular of the layout
// line) is +y: each truss copy is LOW at y = -span/2 (start support, profile
// x=0) and HIGH at y = +span/2 (end support).
function createShedTrussSystem(overrides = {}) {
  return createTrussSystem('Shed System', {
    floorId: 'floor_1',
    baseElevation: 0,
    trussInstances: [
      {
        trussTypeId: 'truss_type_shed',
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 8000, y: 0 },
        span: 6000,
        rise: 1200,
        spacing: 2000,
        count: 5,
        overhangs: { start: 0, end: 0 },
        ...overrides,
      },
    ],
  });
}

describe('deriveRoofStateFromTrussSystem', () => {
  it('points the shed pitch direction downhill (toward the truss low support)', () => {
    const roofState = deriveRoofStateFromTrussSystem(createShedTrussSystem());

    expect(roofState.roofType).toBe('shed');
    // Truss rises toward +y, and pitch directions point downhill app-wide, so
    // the derived direction must be -y.
    expect(roofState.pitch.direction.x).toBeCloseTo(0, 6);
    expect(roofState.pitch.direction.y).toBeCloseTo(-1, 6);
  });

  it('keeps the gable pitch direction on the span axis', () => {
    const roofState = deriveRoofStateFromTrussSystem(
      createShedTrussSystem({ trussTypeId: 'truss_type_gable', rise: 1500 }),
    );

    expect(roofState.roofType).toBe('gable');
    expect(roofState.pitch.direction.x).toBeCloseTo(0, 6);
    expect(roofState.pitch.direction.y).toBeCloseTo(1, 6);
  });

  it('builds an attached shed roof that rises with the truss, gaining the truss rise across the span', () => {
    const trussSystem = createShedTrussSystem();
    const roofSystem = createRoofSystemForProject({ trussSystems: [trussSystem] }, {});
    expect(roofSystem).not.toBeNull();

    const geometry = buildRoofPlaneGeometry(roofSystem);
    const lowSupport = { x: 4000, y: -3000 };
    const highSupport = { x: 4000, y: 3000 };
    const elevationAtLow = geometry.getSurfaceElevation(lowSupport, 'top');
    const elevationAtHigh = geometry.getSurfaceElevation(highSupport, 'top');

    // The roof must slope the same way as the truss it traces: high where the
    // truss peaks, and the elevation gained between the two supports must be
    // exactly the truss rise (shed pitch = rise/span, run between supports =
    // span, so gain = rise).
    expect(elevationAtHigh).toBeGreaterThan(elevationAtLow);
    expect(elevationAtHigh - elevationAtLow).toBeCloseTo(1200, 3);
  });
});
