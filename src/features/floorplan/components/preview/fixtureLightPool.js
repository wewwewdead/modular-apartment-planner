import * as THREE from 'three';
import { MAX_FIXTURE_SHADOW_LIGHTS, createFixtureWarmupObject } from './buildPreviewObjects';
import { disposeScene } from './disposeScene';
import { MAX_ACTIVE_FIXTURE_LIGHTS } from './previewPerf';

/**
 * Stand-in lights that hold the scene's light counts still while lamps come and go.
 *
 * three r0.183 keys every lit material's shader program on how many point
 * lights, spot lights and shadow-casting ones of each the render list holds
 * (`WebGLLights` hashes the counts; a changed hash re-resolves every material's
 * program, and a count the cache has never seen compiles a fresh one). So
 * placing one downlight used to recompile the whole material set — 17 programs
 * on a ceiling assembly, a second and more of main thread per click, growing
 * with the scene — and deleting it did the same again.
 *
 * Only VISIBLE lights are counted, and a visible light with zero intensity
 * counts exactly like a lit one. That is the whole trick: this pool keeps a few
 * dark lights in the scene so that each of the four counts the renderer hashes
 * sits on a step — `step(n) = max(min, ceil(n / size) × size)` — and only moves
 * when the real count crosses one. A run of placements recompiles once per step
 * instead of once per lamp; with the minima raised (the RCP editor's pane) the
 * first few lamps compile nothing at all.
 *
 * A slot is a light that lights nothing: black, zero intensity, a 1 mm reach,
 * a kilometre below the ground. Its shader loop iteration finds a zero colour
 * and moves on — the spot and point paths both mark a light with no colour as
 * not visible and skip its shadow lookup — so a slot's per-fragment cost is a
 * few ALU ops. A shadow slot renders its 16² map once (its shadow camera, 1 mm
 * deep and far below the model, culls everything) and then holds it.
 *
 * Slots never carry `isFixtureLight`, so the interior-lights switch and the
 * scene light budgets do not see them; they carry `lightPoolSlot` instead.
 *
 * The pool lives under the world root in a group of its own and survives across
 * incremental builds; `disposeFixtureLightPool` takes it down with the cache.
 */

export const FIXTURE_LIGHT_POOL_NAME = 'fixture-light-pool';

/**
 * No minima: a scene pays nothing until it has a lamp, and then recompiles at
 * most once per four lamps and once per four shadow casters.
 */
export const MODEL_LIGHT_POOL_POLICY = Object.freeze({
  lightStep: 4,
  shadowStep: 4,
  minSpots: 0,
  minPoints: 0,
  minSpotShadows: 0,
  minPointShadows: 0,
});

/**
 * The RCP editor's own pane, pre-warmed: its first build compiles the programs
 * for four spots, four points and four spot casters, so the first four lamps
 * placed (each a spot, each casting by default, each bringing at most one
 * bounce fill for its patch of ceiling) compile nothing at all. A fifth lamp
 * crosses the spot and caster steps together, which is one recompile, not
 * two — compiled in the background behind the viewport's compile gate.
 *
 * What the warm-up costs: with NO lamp on the ceiling the twelve dark slots
 * add +14% CPU per refine sample on the 12 × 10 m bench ceiling (0.96 → 1.10
 * ms), against +7.5% for the smaller minima 2 / 1 / 1 the spec offered as a
 * fallback. The fallback was not taken, because the saving exists only while
 * the ceiling has no lamp: the first lamp lifts every count onto the same
 * first step (4 spots, 4 points, 4 casters) under either policy, so from then
 * on the two cost the same per frame — and the fallback would have paid for
 * its empty-ceiling saving with a recompile on the first lamp, the one action
 * every lit ceiling goes through. 0.14 ms a sample, only while refining, buys
 * that recompile away.
 *
 * Steps of four for casters as well as lights: lamps cast by default, so a
 * caster step of two would recompile on every second lamp.
 *
 * `warmFixture` also hangs one hidden downlight in the pool, so the lens and
 * fitting materials a first lamp brings are compiled with everything else.
 */
export const ASSEMBLY_LIGHT_POOL_POLICY = Object.freeze({
  lightStep: 4,
  shadowStep: 4,
  minSpots: 4,
  minPoints: 4,
  minSpotShadows: 4,
  minPointShadows: 0,
  warmFixture: true,
});

/** A layer nothing looks at or picks from: the warm-up fitting lives on it. */
const WARMUP_LAYER = 31;

/**
 * The policy a preview pane builds its scene cache with: the RCP editor's pane
 * ('assembly') or a model view ('model').
 *
 * `localStorage.previewLightPool = 'off'` runs a pane without the pool, for
 * measuring what the slots cost per frame against what they save per edit —
 * the same stored-flag idiom as `previewPerf`, so it works in any build.
 */
export function resolveLightPoolPolicy(kind) {
  try {
    if (typeof window !== 'undefined' && window.localStorage?.getItem('previewLightPool') === 'off') return null;
  } catch {
    // Storage can throw under a locked-down origin; that is the default, not an error.
  }
  return kind === 'assembly' ? ASSEMBLY_LIGHT_POOL_POLICY : MODEL_LIGHT_POOL_POLICY;
}

const SLOT_DEPTH = -1e6;
const SLOT_SHADOW_MAP_SIZE = 16;

const pools = new WeakMap();

function stepUp(count, size, minimum) {
  const step = Math.max(1, Math.floor(size) || 1);
  return Math.max(minimum, Math.ceil(count / step) * step);
}

/**
 * The step a count is held at: never below the count itself, never above the
 * cap unless the count already is (a scene with more bounce fills than the cap
 * simply has them all, with no slots added).
 */
function heldCount(count, size, minimum, cap) {
  if (count >= cap) return count;
  return Math.max(count, Math.min(cap, stepUp(count, size, minimum)));
}

/**
 * The visible totals the pool makes the renderer see for these real counts.
 * Pure, so the step arithmetic can be tested without a scene.
 */
export function fixtureLightPoolTargets(counts = {}, policy = MODEL_LIGHT_POOL_POLICY) {
  const rules = { ...MODEL_LIGHT_POOL_POLICY, ...policy };
  const real = {
    spot: Math.max(0, counts.spot || 0),
    point: Math.max(0, counts.point || 0),
    spotShadows: Math.max(0, counts.spotShadows || 0),
    pointShadows: Math.max(0, counts.pointShadows || 0),
  };
  const spotShadows = heldCount(real.spotShadows, rules.shadowStep, rules.minSpotShadows, MAX_FIXTURE_SHADOW_LIGHTS);
  const pointShadows = heldCount(real.pointShadows, rules.shadowStep, rules.minPointShadows, MAX_FIXTURE_SHADOW_LIGHTS);
  // A casting slot is a light as well as a caster, so the light total has to
  // make room for the casting slots on top of the lamps it already holds.
  const spot = Math.max(
    heldCount(real.spot, rules.lightStep, rules.minSpots, MAX_ACTIVE_FIXTURE_LIGHTS),
    real.spot + (spotShadows - real.spotShadows),
  );
  const point = Math.max(
    heldCount(real.point, rules.lightStep, rules.minPoints, MAX_ACTIVE_FIXTURE_LIGHTS),
    real.point + (pointShadows - real.pointShadows),
  );
  return { spot, point, spotShadows, pointShadows };
}

function createSlot(kind, casting) {
  const light = kind === 'spot' ? new THREE.SpotLight(0x000000, 0, 1) : new THREE.PointLight(0x000000, 0, 1);
  light.name = `${FIXTURE_LIGHT_POOL_NAME}:${kind}${casting ? ':shadow' : ''}`;
  light.position.set(0, SLOT_DEPTH, 0);
  light.userData = { lightPoolSlot: true };
  if (casting) {
    light.castShadow = true;
    light.shadow.mapSize.set(SLOT_SHADOW_MAP_SIZE, SLOT_SHADOW_MAP_SIZE);
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
  }
  return light;
}

function resizeSlots(group, slots, wanted, kind, casting) {
  while (slots.length < wanted) {
    const light = createSlot(kind, casting);
    slots.push(light);
    group.add(light);
  }
  while (slots.length > wanted) {
    const light = slots.pop();
    group.remove(light);
    light.dispose();
  }
}

function sameTotals(a, b) {
  return (
    Boolean(a && b) &&
    a.spot === b.spot &&
    a.point === b.point &&
    a.spotShadows === b.spotShadows &&
    a.pointShadows === b.pointShadows
  );
}

/**
 * Bring the pool under `root` in line with `counts` — what the scene's own
 * lamps and fills leave visible and casting (`applySceneLightBudgets`) — under
 * `policy`. A `null` policy takes the pool away and reports the raw counts.
 *
 * `changed` is whether the totals the renderer will count moved since the last
 * sync, i.e. whether the next frame needs programs it may not have. The very
 * first sync reports no change: a first world compiles its whole material set
 * whatever the lights are, and is not what this is here to smooth over.
 */
export function syncFixtureLightPool(root, counts, policy = MODEL_LIGHT_POOL_POLICY, { materialPalette = null } = {}) {
  let pool = pools.get(root);
  if (!pool) {
    const group = new THREE.Group();
    group.name = FIXTURE_LIGHT_POOL_NAME;
    pool = { group, spot: [], spotShadow: [], point: [], pointShadow: [], totals: null, warmup: null };
    pools.set(root, pool);
  }

  if (policy?.warmFixture && materialPalette && !pool.warmup) {
    pool.warmup = createFixtureWarmupObject(materialPalette);
    pool.warmup.name = `${FIXTURE_LIGHT_POOL_NAME}:warmup`;
    pool.warmup.visible = false;
    pool.warmup.traverse((node) => {
      node.layers.set(WARMUP_LAYER);
      node.userData = { ...node.userData, lightPoolSlot: true };
    });
    pool.group.add(pool.warmup);
  } else if (!policy?.warmFixture && pool.warmup) {
    disposeWarmup(pool);
  }

  const real = {
    spot: counts?.spot || 0,
    point: counts?.point || 0,
    spotShadows: counts?.spotShadows || 0,
    pointShadows: counts?.pointShadows || 0,
  };
  const totals = policy ? fixtureLightPoolTargets(real, policy) : real;
  const spotShadowSlots = totals.spotShadows - real.spotShadows;
  const pointShadowSlots = totals.pointShadows - real.pointShadows;
  resizeSlots(pool.group, pool.spotShadow, spotShadowSlots, 'spot', true);
  resizeSlots(pool.group, pool.spot, totals.spot - real.spot - spotShadowSlots, 'spot', false);
  resizeSlots(pool.group, pool.pointShadow, pointShadowSlots, 'point', true);
  resizeSlots(pool.group, pool.point, totals.point - real.point - pointShadowSlots, 'point', false);

  // The cache clears and refills the root on every build, so the group is put
  // back each time rather than assumed to still be there — and only while it
  // holds a slot, so a scene the pool has nothing to add to keeps exactly the
  // graph it always had.
  if (pool.group.children.length && pool.group.parent !== root) root.add(pool.group);
  else if (!pool.group.children.length) pool.group.parent?.remove(pool.group);

  const changed = pool.totals !== null && !sameTotals(pool.totals, totals);
  pool.totals = totals;
  return { changed, totals };
}

function disposeWarmup(pool) {
  pool.group.remove(pool.warmup);
  disposeScene(pool.warmup, { disposeMaterials: false });
  pool.warmup = null;
}

/** Take the pool down: its lights, their shadow maps, the warm-up fitting, and the group. */
export function disposeFixtureLightPool(root) {
  const pool = pools.get(root);
  if (!pool) return;
  if (pool.warmup) disposeWarmup(pool);
  for (const kind of ['spot', 'spotShadow', 'point', 'pointShadow']) {
    resizeSlots(pool.group, pool[kind], 0, kind.startsWith('spot') ? 'spot' : 'point', false);
  }
  pool.group.parent?.remove(pool.group);
  pools.delete(root);
}
