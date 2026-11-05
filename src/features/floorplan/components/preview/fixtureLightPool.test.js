import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCeiling } from '@/domain/ceilingModels';
import { buildCeilingPreviewObjects } from '@/geometry/ceilingGeometry';
import { MAX_FIXTURE_SHADOW_LIGHTS, applySceneLightBudgets, buildFloorObjectGroup } from './buildPreviewObjects';
import {
  ASSEMBLY_LIGHT_POOL_POLICY,
  FIXTURE_LIGHT_POOL_NAME,
  MODEL_LIGHT_POOL_POLICY,
  disposeFixtureLightPool,
  fixtureLightPoolTargets,
  syncFixtureLightPool,
} from './fixtureLightPool';
import { createMaterialPalette } from './materials';
import { MAX_ACTIVE_FIXTURE_LIGHTS } from './previewPerf';
import { createPreviewSceneCache } from './previewSceneCache';

/**
 * three keys every lit material's program on the visible point/spot counts and
 * their shadow counts, so the pool's whole job is to make those four numbers
 * move in steps rather than with every lamp. These run against the real three
 * (object construction needs no WebGL).
 */

/** Minima that pre-warm four default lamps — what the RCP pane would use if slots were free. */
const WARMED_FOR_FOUR = { ...MODEL_LIGHT_POOL_POLICY, minSpots: 4, minPoints: 4, minSpotShadows: 4 };

function poolSlots(root) {
  const group = root.children.find((child) => child.name === FIXTURE_LIGHT_POOL_NAME);
  const lights = group ? group.children.filter((child) => child.isLight) : [];
  return {
    group,
    lights,
    spot: lights.filter((light) => light.isSpotLight).length,
    point: lights.filter((light) => light.isPointLight).length,
    spotShadows: lights.filter((light) => light.isSpotLight && light.castShadow).length,
    pointShadows: lights.filter((light) => light.isPointLight && light.castShadow).length,
  };
}

describe('fixtureLightPoolTargets', () => {
  it('holds each count on its step, never below the count', () => {
    const rules = { ...MODEL_LIGHT_POOL_POLICY, lightStep: 4, shadowStep: 2 };
    expect(fixtureLightPoolTargets({ spot: 0, point: 0 }, rules)).toEqual({
      spot: 0,
      point: 0,
      spotShadows: 0,
      pointShadows: 0,
    });
    expect(fixtureLightPoolTargets({ spot: 1 }, rules).spot).toBe(4);
    expect(fixtureLightPoolTargets({ spot: 4 }, rules).spot).toBe(4);
    expect(fixtureLightPoolTargets({ spot: 5 }, rules).spot).toBe(8);
    expect(fixtureLightPoolTargets({ point: 3, pointShadows: 1 }, rules)).toMatchObject({ point: 4, pointShadows: 2 });
  });

  it('applies the minima, so an empty pane can be warmed for its first lamps', () => {
    expect(fixtureLightPoolTargets({}, WARMED_FOR_FOUR)).toEqual({
      spot: 4,
      point: 4,
      spotShadows: 4,
      pointShadows: 0,
    });
    // The first four default lamps — spots, casting, one fill each at most —
    // land on exactly the same totals.
    for (let lamps = 1; lamps <= 4; lamps += 1) {
      expect(fixtureLightPoolTargets({ spot: lamps, spotShadows: lamps, point: lamps }, WARMED_FOR_FOUR)).toEqual({
        spot: 4,
        point: 4,
        spotShadows: 4,
        pointShadows: 0,
      });
    }
  });

  it('warms the RCP pane for its first four lamps', () => {
    // The first lamp lands on the same step whatever the minima; these minima
    // put the empty pane on that step already, so it compiles nothing for it.
    expect(fixtureLightPoolTargets({}, ASSEMBLY_LIGHT_POOL_POLICY)).toEqual({
      spot: 4,
      point: 4,
      spotShadows: 4,
      pointShadows: 0,
    });
    expect(fixtureLightPoolTargets({ spot: 1, spotShadows: 1, point: 1 }, ASSEMBLY_LIGHT_POOL_POLICY)).toEqual({
      spot: 4,
      point: 4,
      spotShadows: 4,
      pointShadows: 0,
    });
  });

  it('caps the steps at the light and caster budgets, and leaves a count past the cap alone', () => {
    const rules = { ...MODEL_LIGHT_POOL_POLICY, lightStep: 5, shadowStep: 3 };
    expect(fixtureLightPoolTargets({ spot: 23, spotShadows: 7 }, rules)).toMatchObject({
      spot: MAX_ACTIVE_FIXTURE_LIGHTS,
      spotShadows: MAX_FIXTURE_SHADOW_LIGHTS,
    });
    // Bounce fills are never budgeted, so a scene can hold more points than the cap.
    expect(fixtureLightPoolTargets({ point: 30 }, rules).point).toBe(30);
  });

  it('makes room in the light total for the casting slots', () => {
    // Two real spots, neither casting, but a pane warmed for four casters: the
    // four casting slots are spots too, so the spot total has to hold six.
    const totals = fixtureLightPoolTargets({ spot: 2, spotShadows: 0 }, { minSpots: 0, minSpotShadows: 4 });
    expect(totals.spotShadows).toBe(4);
    expect(totals.spot).toBe(6);
  });
});

describe('syncFixtureLightPool', () => {
  it('adds dark slots that bring each visible count up to its target', () => {
    const root = new THREE.Group();
    const real = { spot: 1, point: 1, spotShadows: 1, pointShadows: 0 };
    const { totals } = syncFixtureLightPool(root, real, ASSEMBLY_LIGHT_POOL_POLICY);
    const slots = poolSlots(root);

    expect(slots.group.parent).toBe(root);
    expect(slots.spot + real.spot).toBe(totals.spot);
    expect(slots.point + real.point).toBe(totals.point);
    expect(slots.spotShadows + real.spotShadows).toBe(totals.spotShadows);
    expect(slots.pointShadows).toBe(0);
  });

  it('builds slots that light nothing and stay out of the fixture passes', () => {
    const root = new THREE.Group();
    syncFixtureLightPool(root, {}, ASSEMBLY_LIGHT_POOL_POLICY);
    const { lights } = poolSlots(root);

    expect(lights.length).toBeGreaterThan(0);
    for (const light of lights) {
      expect(light.intensity).toBe(0);
      expect(light.color.getHex()).toBe(0x000000);
      expect(light.distance).toBe(1);
      expect(light.position.y).toBe(-1e6);
      expect(light.visible).toBe(true);
      expect(light.userData.lightPoolSlot).toBe(true);
      expect(light.userData.isFixtureLight).toBeUndefined();
      if (light.castShadow) {
        expect(light.shadow.mapSize.x).toBe(16);
        expect(light.shadow.mapSize.y).toBe(16);
        expect(light.shadow.autoUpdate).toBe(false);
        expect(light.shadow.needsUpdate).toBe(true);
      }
    }
  });

  it('reports a change only when a total crosses a step, and never on the first sync', () => {
    const root = new THREE.Group();
    const lamps = (n) => ({ spot: n, spotShadows: n, point: Math.min(n, 2) });
    expect(syncFixtureLightPool(root, lamps(0), WARMED_FOR_FOUR).changed).toBe(false);
    for (let n = 1; n <= 4; n += 1) {
      expect(syncFixtureLightPool(root, lamps(n), WARMED_FOR_FOUR).changed, `lamp ${n}`).toBe(false);
    }
    expect(syncFixtureLightPool(root, lamps(5), WARMED_FOR_FOUR).changed).toBe(true);
    expect(syncFixtureLightPool(root, lamps(6), WARMED_FOR_FOUR).changed).toBe(false);
  });

  it('shrinks to the step when lamps go, never below it', () => {
    const root = new THREE.Group();
    syncFixtureLightPool(root, { spot: 7 }, MODEL_LIGHT_POOL_POLICY);
    expect(poolSlots(root).spot).toBe(1);
    const removed = poolSlots(root).lights[0];

    const { changed, totals } = syncFixtureLightPool(root, { spot: 3 }, MODEL_LIGHT_POOL_POLICY);
    expect(changed).toBe(true);
    expect(totals.spot).toBe(4);
    expect(poolSlots(root).spot).toBe(1);
    // Same slot count either side of the drop, so nothing was churned.
    expect(poolSlots(root).lights[0]).toBe(removed);

    syncFixtureLightPool(root, { spot: 0 }, MODEL_LIGHT_POOL_POLICY);
    // Nothing to add: an empty pool leaves the root's graph as it always was.
    expect(poolSlots(root).group).toBeUndefined();
  });

  it('survives the cache clearing the root between builds', () => {
    const root = new THREE.Group();
    syncFixtureLightPool(root, { spot: 1 }, MODEL_LIGHT_POOL_POLICY);
    const first = poolSlots(root).lights;
    root.clear();
    syncFixtureLightPool(root, { spot: 2 }, MODEL_LIGHT_POOL_POLICY);
    const after = poolSlots(root).lights;
    expect(after).toHaveLength(2);
    expect(after.every((light, index) => light === first[index])).toBe(true);
  });

  it('runs without slots under a null policy, still reporting moved counts', () => {
    const root = new THREE.Group();
    syncFixtureLightPool(root, { spot: 1 }, null);
    expect(poolSlots(root).group).toBeUndefined();
    expect(syncFixtureLightPool(root, { spot: 2 }, null).changed).toBe(true);
  });

  it('disposes every slot and takes the group down', () => {
    const root = new THREE.Group();
    syncFixtureLightPool(root, {}, ASSEMBLY_LIGHT_POOL_POLICY);
    const { group, lights } = poolSlots(root);
    let disposed = 0;
    for (const light of lights) {
      const dispose = light.dispose.bind(light);
      light.dispose = () => {
        disposed += 1;
        dispose();
      };
    }
    disposeFixtureLightPool(root);
    expect(disposed).toBe(lights.length);
    expect(group.parent).toBeNull();
    expect(group.children).toHaveLength(0);
  });
});

const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 8000, y: 0 },
  { x: 8000, y: 4000 },
  { x: 0, y: 4000 },
];

function litScene(fixtures) {
  const ceiling = createCeiling('Ceiling', {
    id: 'ceiling_pool',
    floorId: 'floor_pool',
    baseElevation: 2700,
    boundaryPolygon: BOUNDARY,
    detailing: { lighting: { fixtures } },
  });
  const floor = {
    id: 'floor_pool',
    name: 'Ground',
    elevation: 0,
    floorToFloorHeight: 3000,
    walls: [],
    rooms: [],
    slabs: [],
    columns: [],
    beams: [],
  };
  const project = { floors: [floor], ceilings: [ceiling], trussSystems: [] };
  const objects = buildCeilingPreviewObjects(ceiling, project);
  return {
    floors: [{ floorId: floor.id, name: floor.name, elevation: 0, visible: true, objects, sourceKey: { ceiling } }],
    bounds: { minX: 0, maxX: 8000, minY: 0, maxY: 4000, minElevation: 0, maxElevation: 3000 },
  };
}

describe('applySceneLightBudgets', () => {
  it('returns what it left visible and casting, fills counted as points', () => {
    const scene = litScene([
      { id: 'lt_can', u: 1000, v: 1000, fixtureType: 'recessed_can_6' },
      { id: 'lt_can_2', u: 2000, v: 1000, fixtureType: 'recessed_can_6', castShadow: false },
      { id: 'lt_pendant', u: 7000, v: 3000, fixtureType: 'pendant' },
    ]);
    const { entries } = buildFloorObjectGroup(scene.floors[0], createMaterialPalette());
    const counts = applySceneLightBudgets(entries);

    const sources = [...entries.values()].filter((entry) => entry.descriptor.geometry === 'ceilingLightSource');
    const lamps = sources.filter((entry) => entry.descriptor.role !== 'bounce');
    const fills = sources.filter((entry) => entry.descriptor.role === 'bounce');
    const spots = lamps.filter((entry) => entry.descriptor.lightType === 'spot');
    expect(fills.length).toBeGreaterThan(0);
    expect(counts.spot).toBe(spots.length);
    expect(counts.point).toBe(lamps.length - spots.length + fills.length);
    expect(counts.spotShadows + counts.pointShadows).toBe(lamps.filter((entry) => entry.descriptor.castShadow).length);
  });

  it('counts nothing on a floor that is not on screen', () => {
    const scene = litScene([{ id: 'lt_can', u: 1000, v: 1000, fixtureType: 'recessed_can_6' }]);
    const { entries } = buildFloorObjectGroup(scene.floors[0], createMaterialPalette());
    for (const entry of entries.values()) entry.floorVisible = false;
    expect(applySceneLightBudgets(entries)).toEqual({ point: 0, spot: 0, pointShadows: 0, spotShadows: 0 });
  });
});

describe('scene cache with the light pool', () => {
  it('reports lightsChanged only when the pooled totals move', () => {
    const cache = createPreviewSceneCache({ lightPool: ASSEMBLY_LIGHT_POOL_POLICY });
    const palette = createMaterialPalette();
    const fixtures = [];
    const results = [];
    // The pane opens on a ceiling with no lights yet.
    cache.build(litScene([]), palette);
    for (let index = 0; index < 6; index += 1) {
      fixtures.push({ id: `lt_${index}`, u: 500 + index * 1200, v: 1500, fixtureType: 'recessed_can_6' });
      results.push(cache.build(litScene([...fixtures]), palette).lightsChanged);
    }
    // Four lamps inside the warmed totals, then the fifth crosses the spot and
    // caster steps together: one change over six lamps, not one per lamp.
    expect(results).toEqual([false, false, false, false, true, false]);
    const pool = cache.getRoot().children.find((child) => child.name === FIXTURE_LIGHT_POOL_NAME);
    expect(pool).toBeDefined();
    cache.dispose();
    expect(pool.parent).toBeNull();
  });
});
