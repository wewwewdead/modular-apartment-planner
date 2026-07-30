import { describe, expect, it } from 'vitest';
import { buildRoofSectionElements } from './roofSectionGeometry';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { createRoofSystem } from '@/domain/roofModels';
import { createSectionCut } from '@/domain/models';

// A shed roof over a 6000 x 4000 footprint whose surface falls off toward +x.
function makeShedRoof() {
  return createRoofSystem('Roof', {
    roofType: 'shed',
    baseElevation: 3000,
    boundaryPolygon: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    pitch: { slope: 0.5, direction: { x: 1, y: 0 }, overhang: 0 },
  });
}

function sectionProfile(roofSystem, direction) {
  const cut = createSectionCut({ x: -500, y: 2000 }, { x: 6500, y: 2000 }, { direction, depth: 4000 });
  const [polygon] = buildRoofSectionElements(roofSystem, cut).polygonElements;
  return polygon;
}

describe('buildRoofSectionElements sloped surfaces', () => {
  it('samples the roof surface at the plan point the view axis actually maps to', () => {
    const roofSystem = makeShedRoof();
    const geometry = buildRoofPlaneGeometry(roofSystem);
    const westElevation = geometry.getSurfaceElevation({ x: 0, y: 2000 }, 'top');
    const eastElevation = geometry.getSurfaceElevation({ x: 6000, y: 2000 }, 'top');
    expect(westElevation).toBeGreaterThan(eastElevation);

    // direction -1 looks north: the view axis runs west -> east, so the high (west) end is left.
    const lookingNorth = sectionProfile(roofSystem, -1);
    expect(lookingNorth.points[0].z).toBeCloseTo(westElevation, 6);
    expect(lookingNorth.points[1].z).toBeCloseTo(eastElevation, 6);

    // direction +1 looks south: the view axis runs east -> west, so the profile is mirrored.
    const lookingSouth = sectionProfile(roofSystem, 1);
    expect(lookingSouth.points[0].z).toBeCloseTo(eastElevation, 6);
    expect(lookingSouth.points[1].z).toBeCloseTo(westElevation, 6);
  });

  it('keeps both view directions on the same along span', () => {
    const roofSystem = makeShedRoof();
    const lookingNorth = sectionProfile(roofSystem, -1);
    const lookingSouth = sectionProfile(roofSystem, 1);

    expect(lookingSouth.points[0].x).toBeCloseTo(lookingNorth.points[0].x, 6);
    expect(lookingSouth.points[1].x).toBeCloseTo(lookingNorth.points[1].x, 6);
  });
});
