import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createRailing, createStair, createWall, createWindow } from '@/domain/models';
import { createCeiling } from '@/domain/ceilingModels';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { MAX_FIXTURE_SHADOW_LIGHTS } from './buildPreviewObjects';
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
  /**
   * Neither cache was the reason an offset wall stayed put in 3D — the bug was
   * in how the descriptors were built — but both sit between the edit and the
   * screen, so this walks the whole way: change nothing but `outboardOffset`,
   * the way the properties panel does, and the mesh has to be rebuilt and to
   * have actually moved. A `sourceKey` compared by reference sees the new floor
   * object, and a descriptor deep-compare sees the new plan position.
   */
  it('moves the mesh when a wall is pushed off the axis it was drawn on', () => {
    const { project, activeFloorId } = buildProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();

    const { meshMap: before } = cache.build(buildPreviewScene(project, { activeFloorId }), palette);
    const wallId = project.floors[0].walls[0].id;
    const [descriptorId, beforeEntry] = [...before].find(([, entry]) => entry.descriptor.metadata?.wallId === wallId);

    const offset = {
      ...project,
      floors: project.floors.map((floor, index) =>
        index === 0
          ? {
              ...floor,
              walls: floor.walls.map((wall) => (wall.id === wallId ? { ...wall, outboardOffset: 500 } : wall)),
            }
          : floor,
      ),
    };
    const { meshMap: after } = cache.build(buildPreviewScene(offset, { activeFloorId }), palette);
    const afterEntry = after.get(descriptorId);

    expect(afterEntry.object).not.toBe(beforeEntry.object);
    // Plan +y is world +z in the preview, and the wall runs along +x.
    expect(afterEntry.object.position.z - beforeEntry.object.position.z).toBeCloseTo(500, 6);
    expect(afterEntry.object.position.x).toBeCloseTo(beforeEntry.object.position.x, 6);

    cache.dispose();
  });
});

/**
 * A shadow pass is charged by the renderer, which has never heard of a floor —
 * so the cap has to be spent once for the building. The hard half is the cache:
 * a floor handed back untouched still holds lights that were granted a shadow
 * under a different set of neighbours, and a cross-floor pass that only visited
 * the floors it had just rebuilt would hand the whole budget to whichever storey
 * the user happened to be editing.
 *
 * Real THREE, no mock, because what is being asserted is the flag on the light
 * the renderer will read.
 */
function buildLitProject() {
  const project = createProject('Lit building');
  const ground = project.floors[0];
  const upper = createFloor('Level 2', 1);

  const boundary = [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 0, y: 4000 },
  ];

  // Five per floor, so ten lamps compete for eight slots — and every lamp
  // upstairs outshines every lamp downstairs, so which floor wins is not a
  // matter of taste.
  const ceilingFor = (floor, elevation, lumens) =>
    createCeiling('Ceiling', {
      id: `ceiling_${floor.id}`,
      floorId: floor.id,
      boundaryPolygon: boundary,
      baseElevation: elevation,
      detailing: {
        lighting: {
          fixtures: Array.from({ length: 5 }, (_, index) => ({
            id: `${floor.id}_lt_${index}`,
            u: 800 + index * 700,
            v: 2000,
            fixtureType: 'recessed_can_6',
            lumensOverride: lumens + index,
            castShadow: true,
          })),
        },
      },
    });

  const walls = (offset) => [
    createWall({ x: offset, y: 0 }, { x: 5000, y: 0 }),
    createWall({ x: 5000, y: 0 }, { x: 5000, y: 4000 }),
  ];

  return {
    project: {
      ...project,
      floors: [
        { ...ground, walls: walls(0) },
        { ...upper, walls: walls(0) },
      ],
      ceilings: [ceilingFor(ground, 2600, 400), ceilingFor(upper, 5600, 4000)],
    },
    groundId: ground.id,
    upperId: upper.id,
  };
}

function widenGroundWall(project) {
  return {
    ...project,
    floors: project.floors.map((floor, index) =>
      index === 0 ? { ...floor, walls: floor.walls.map((wall) => ({ ...wall, thickness: 300 })) } : floor,
    ),
  };
}

/** Every fixture light the renderer would be asked to render a map for. */
function shadowCasters(root) {
  const casters = [];
  root.traverse((node) => {
    if (!node.userData?.isFixtureLight || !node.castShadow) return;
    let floorId = null;
    for (let parent = node.parent; parent && !floorId; parent = parent.parent) {
      floorId = parent.userData?.floorId || null;
    }
    casters.push(floorId);
  });
  return casters;
}

describe('preview scene cache — the shadow budget is spent once for the scene', () => {
  it('caps the whole building rather than every floor of it', () => {
    const { project, upperId } = buildLitProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache({ batch: false });

    const { root } = cache.build(buildPreviewScene(project, {}), palette);
    const casters = shadowCasters(root);

    expect(casters).toHaveLength(MAX_FIXTURE_SHADOW_LIGHTS);
    // Ten lamps asked; the five bright ones upstairs and three of the five below
    // were granted, which is what "eight, brightest first" means for the scene.
    expect(casters.filter((floorId) => floorId === upperId)).toHaveLength(5);

    cache.dispose();
  });

  it('re-judges the floors it handed back untouched', () => {
    const { project, groundId, upperId } = buildLitProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache({ batch: false });

    const first = cache.build(buildPreviewScene(project, {}), palette);
    const upperGroupBefore = first.root.children.find((group) => group.userData.floorId === upperId);

    // A wall on the ground floor: only that floor's `sourceKey` changes, so the
    // upper floor — the one holding the bright lamps — is reused verbatim.
    const second = cache.build(buildPreviewScene(widenGroundWall(project), {}), palette);
    const upperGroupAfter = second.root.children.find((group) => group.userData.floorId === upperId);
    expect(upperGroupAfter).toBe(upperGroupBefore);

    const casters = shadowCasters(second.root);
    // Without the cross-floor pass the rebuilt ground floor would come back with
    // all five of its lamps casting, on top of the five still casting upstairs.
    expect(casters).toHaveLength(MAX_FIXTURE_SHADOW_LIGHTS);
    expect(casters.filter((floorId) => floorId === upperId)).toHaveLength(5);
    expect(casters.filter((floorId) => floorId === groundId)).toHaveLength(3);

    cache.dispose();
  });
});

/**
 * Freezing a graph is only correct if the world matrices are right at the moment
 * it is frozen, and the one moment they are not is a carried-over group being
 * re-attached to a root it has just been detached from.
 */
describe('preview scene cache — frozen matrices survive reuse', () => {
  it('leaves every node frozen with the world matrix its position says it has', () => {
    const { project, activeFloorId } = buildProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache({ batch: false });

    cache.build(buildPreviewScene(project, { activeFloorId }), palette);
    const { root, meshMap } = cache.build(buildPreviewScene(moveStair(project, 3000), { activeFloorId }), palette);

    const nodes = [];
    root.traverse((node) => nodes.push(node));
    expect(nodes.filter((node) => node.matrixAutoUpdate !== false)).toEqual([]);

    // A carried-over wall: detached from last build's group and re-attached to
    // this one, with nothing left to recompose its matrix automatically.
    const wallId = project.floors[0].walls[0].id;
    const [, entry] = [...meshMap].find(([, candidate]) => candidate.descriptor.metadata?.wallId === wallId);
    const world = entry.object.matrixWorld.elements;
    expect(world[12]).toBeCloseTo(entry.object.position.x, 6);
    expect(world[13]).toBeCloseTo(entry.object.position.y, 6);
    expect(world[14]).toBeCloseTo(entry.object.position.z, 6);

    cache.dispose();
  });
});
