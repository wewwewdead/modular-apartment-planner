import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createRailing, createStair, createWall, createWindow } from '@/domain/models';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { createMaterialPalette } from './materials';
import { createPreviewSceneCache } from './previewSceneCache';

/**
 * Dragging a stair moves one object. The preview used to answer that by
 * re-triangulating the whole building, because a stair on any floor invalidates
 * every floor's `sourceKey` — railings attach to stairs across floors, so no
 * floor can claim to be independent of them. These run against real THREE
 * geometry (no mock) so what they assert is the actual mesh identity the
 * renderer sees.
 */

function buildProject() {
  const project = createProject('Stair drag');
  const ground = project.floors[0];
  const upper = createFloor('Level 2', 1);

  const populate = (floor) => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }),
      createWall({ x: 6000, y: 0 }, { x: 6000, y: 6000 }),
      createWall({ x: 6000, y: 6000 }, { x: 0, y: 6000 }),
    ];
    return {
      ...floor,
      walls,
      windows: [createWindow(walls[0].id, 2000, 1200)],
      // Railings on both floors: the upper floor's railing is exactly the
      // cross-floor stair dependency that forces its `sourceKey` to change
      // whenever the ground floor's stair moves.
      railings: [createRailing({ x: 500, y: 500 }, { x: 500, y: 4500 })],
    };
  };

  const stair = createStair({ x: 1000, y: 1000 }, 1000, 16, 175, 250);
  return {
    project: { ...project, floors: [{ ...populate(ground), stairs: [stair] }, populate(upper)] },
    stairId: stair.id,
    activeFloorId: ground.id,
  };
}

function moveStair(project, x) {
  return {
    ...project,
    floors: project.floors.map((floor, index) =>
      index === 0
        ? { ...floor, stairs: floor.stairs.map((stair) => ({ ...stair, startPoint: { ...stair.startPoint, x } })) }
        : floor,
    ),
  };
}

function objectsById(meshMap) {
  return new Map([...meshMap].map(([id, entry]) => [id, entry.object]));
}

/** Watch every geometry under an object and report which ones get disposed. */
function watchDisposal(object) {
  const disposed = new Set();
  object.traverse((node) => {
    if (!node.geometry) return;
    node.geometry.addEventListener('dispose', () => disposed.add(node.geometry));
  });
  return disposed;
}

describe('preview scene cache — object reuse inside a rebuilt floor', () => {
  it('rebuilds only the stair when a stair moves, on every floor', () => {
    const { project, stairId, activeFloorId } = buildProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();

    const { meshMap: before } = cache.build(buildPreviewScene(project, { activeFloorId }), palette);
    const objectsBefore = objectsById(before);
    expect(objectsBefore.size).toBeGreaterThan(6);
    expect(objectsBefore.has(stairId)).toBe(true);

    const { meshMap: after } = cache.build(buildPreviewScene(moveStair(project, 3000), { activeFloorId }), palette);
    const objectsAfter = objectsById(after);

    expect(objectsAfter.get(stairId)).not.toBe(objectsBefore.get(stairId));

    const rebuilt = [...objectsAfter].filter(([id, object]) => object !== objectsBefore.get(id)).map(([id]) => id);
    expect(rebuilt).toEqual([stairId]);

    cache.dispose();
  });

  it('disposes the geometry it replaced and keeps the geometry it carried over', () => {
    const { project, stairId, activeFloorId } = buildProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();

    const { meshMap: before } = cache.build(buildPreviewScene(project, { activeFloorId }), palette);
    const stairGeometries = watchDisposal(before.get(stairId).object);
    const survivorId = [...before.keys()].find((id) => id !== stairId);
    const survivorGeometries = watchDisposal(before.get(survivorId).object);
    expect(stairGeometries.size).toBe(0);

    cache.build(buildPreviewScene(moveStair(project, 3000), { activeFloorId }), palette);

    // The replaced stair's buffers are freed; nothing that is still on screen is.
    expect(stairGeometries.size).toBeGreaterThan(0);
    expect(survivorGeometries.size).toBe(0);

    cache.dispose();
  });

  it('still rebuilds an object whose own geometry changed', () => {
    const { project, activeFloorId } = buildProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();

    const { meshMap: before } = cache.build(buildPreviewScene(project, { activeFloorId }), palette);
    const wallId = project.floors[0].walls[0].id;
    const wallObject = [...before].find(([, entry]) => entry.descriptor.metadata?.sourceId === wallId)[0];

    const widened = {
      ...project,
      floors: project.floors.map((floor, index) =>
        index === 0
          ? { ...floor, walls: floor.walls.map((wall) => (wall.id === wallId ? { ...wall, thickness: 300 } : wall)) }
          : floor,
      ),
    };
    const { meshMap: after } = cache.build(buildPreviewScene(widened, { activeFloorId }), palette);

    expect(after.get(wallObject).object).not.toBe(before.get(wallObject).object);

    cache.dispose();
  });
});
