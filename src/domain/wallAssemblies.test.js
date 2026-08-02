import { describe, expect, it } from 'vitest';
import {
  WALL_ASSEMBLY_PRESETS,
  WALL_BOARD_MATERIALS,
  boardLayerAreaMultiplier,
  createWallAssembly,
  deriveWallAssemblyLayers,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallAssemblyThickness,
} from './wallAssemblies';

describe('wall assemblies', () => {
  it('keeps legacy walls as CHB assemblies using their modeled thickness', () => {
    const assembly = resolveWallAssembly({ thickness: 100 });
    expect(assembly).toMatchObject({ preset: 'chb', system: 'masonry', coreThickness: 100 });
    expect(wallAssemblyThickness(assembly)).toBe(100);
  });

  it('derives total thickness for single and double framed board walls', () => {
    const single = createWallAssembly(WALL_ASSEMBLY_PRESETS.FIBER_CEMENT);
    expect(wallAssemblyThickness(single)).toBe(87);

    const double = createWallAssembly(WALL_ASSEMBLY_PRESETS.FIBER_CEMENT, {
      interior: { material: 'fiber_cement', thickness: 6, layerCount: 2 },
      exterior: { material: 'plywood', thickness: 12, layerCount: 2 },
      framing: { studDepth: 75, frameCount: 2, frameGap: 25 },
    });
    expect(wallAssemblyThickness(double)).toBe(211);
    expect(boardLayerAreaMultiplier(double, WALL_BOARD_MATERIALS.FIBER_CEMENT)).toBe(2);
    expect(boardLayerAreaMultiplier(double, WALL_BOARD_MATERIALS.PLYWOOD)).toBe(2);
  });

  it('places inside and outside boards on opposite sides and supports flipping the inside direction', () => {
    const leftInside = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      interiorSide: 'left',
      interior: { material: 'plywood', thickness: 12, layerCount: 1 },
      exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
    });
    const rightInside = createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
      ...leftInside,
      interiorSide: 'right',
    });

    const leftLayers = deriveWallAssemblyLayers(leftInside);
    const rightLayers = deriveWallAssemblyLayers(rightInside);
    expect(leftLayers.find((layer) => layer.side === 'interior')).toMatchObject({
      sign: -1,
      material: 'plywood',
      buildUp: 12,
    });
    expect(leftLayers.find((layer) => layer.side === 'exterior').sign).toBe(1);
    expect(rightLayers.find((layer) => layer.side === 'interior').sign).toBe(1);
    expect(rightLayers.find((layer) => layer.side === 'exterior').sign).toBe(-1);
  });

  it('lays out two stud rows and frames around door openings', () => {
    const wall = {
      id: 'wall_1',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
      height: 3000,
      thickness: 187,
      assembly: createWallAssembly(WALL_ASSEMBLY_PRESETS.PLYWOOD, {
        framing: { spacing: 400, frameCount: 2, frameGap: 25 },
      }),
    };
    const layout = deriveWallFramingLayout(wall, [
      { id: 'door_1', openingKind: 'door', offset: 2000, width: 900, height: 2100 },
    ]);

    expect(layout.studs.some((stud) => stud.position === 1550)).toBe(true);
    expect(layout.studs.some((stud) => stud.position === 2450)).toBe(true);
    expect(layout.studs.some((stud) => stud.position === 2000)).toBe(false);
    expect(new Set(layout.studs.map((stud) => stud.frameIndex))).toEqual(new Set([0, 1]));
    expect(layout.totalLinearLengthMm).toBeGreaterThan(layout.components.studLength);
  });
});
