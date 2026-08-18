import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createWalkPhysics } from './createWalkPhysics';
import { WALK_BODY_RADIUS, WALK_EYE_HEIGHT } from './previewConfig';

const DT = 1 / 60;

/** A horizontal surface whose TOP lands at `topY` — the way a slab is stood on. */
function slab(x, z, width, depth, topY, thickness = 200) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth));
  mesh.position.set(x, topY - thickness / 2, z);
  return mesh;
}

/** A vertical slice of wall whose inner face is wherever the box puts it. */
function box(x, y, z, width, height, depth) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  mesh.position.set(x, y, z);
  return mesh;
}

function rig(meshes, { groundLevel = -Infinity, cameraAt = [0, WALK_EYE_HEIGHT, 0] } = {}) {
  const root = new THREE.Group();
  for (const mesh of meshes) root.add(mesh);
  root.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...cameraAt);

  const physics = createWalkPhysics({
    camera,
    getCollisionSources: () => [root],
    getGroundLevel: () => groundLevel,
  });

  const run = (frames, { move = null, jumpAt = -1 } = {}) => {
    const moveVector = move ? new THREE.Vector3(move[0], 0, move[1]) : null;
    let minY = Infinity;
    for (let frame = 0; frame < frames; frame += 1) {
      physics.step({ moveVector, jumpRequested: frame === jumpAt, deltaSeconds: DT });
      minY = Math.min(minY, camera.position.y);
    }
    return minY;
  };

  return { root, camera, physics, run };
}

describe('createWalkPhysics', () => {
  it('falls under gravity and lands with the eye at eye height above the slab', () => {
    const { camera, physics, run } = rig([slab(0, 0, 6000, 6000, 0)], {
      cameraAt: [0, WALK_EYE_HEIGHT + 800, 0],
    });

    run(120);

    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);
  });

  it('lands on the site datum when there is no floor at all', () => {
    const { camera, physics, run } = rig([], {
      groundLevel: -500,
      cameraAt: [0, WALK_EYE_HEIGHT + 300, 0],
    });

    run(120);

    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(-500 + WALK_EYE_HEIGHT, 0);
  });

  it('is stopped by a wall one body radius short of its face', () => {
    // Wall face at x = 2000.
    const { camera, run } = rig([slab(0, 0, 8000, 8000, 0), box(2100, 1350, 0, 200, 2700, 8000)]);

    run(30); // settle onto the slab
    run(240, { move: [25, 0] });

    expect(camera.position.x).toBeGreaterThan(1600); // it did reach the wall
    expect(camera.position.x).toBeLessThanOrEqual(2000 - WALK_BODY_RADIUS + 1);
  });

  it('slides along a wall it is pushed into diagonally', () => {
    const { camera, run } = rig([slab(0, 0, 8000, 12000, 0), box(2100, 1350, 0, 200, 2700, 12000)]);

    run(30);
    run(240, { move: [18, 18] });

    expect(camera.position.x).toBeLessThanOrEqual(2000 - WALK_BODY_RADIUS + 1);
    expect(camera.position.z).toBeGreaterThan(2000); // the blocked axis fed the free one
  });

  it('walks straight through a door leaf', () => {
    const door = box(2100, 1050, 0, 200, 2100, 8000);
    door.userData.previewTarget = { kind: 'door' };
    const { camera, run } = rig([slab(0, 0, 12000, 8000, 0), door]);

    run(30);
    run(150, { move: [25, 0] });

    expect(camera.position.x).toBeGreaterThan(2300);
  });

  it('does not collide with a floor whose group is hidden', () => {
    const hidden = slab(0, 0, 6000, 6000, 500);
    const group = new THREE.Group();
    group.visible = false;
    group.add(hidden);
    const holder = new THREE.Group();
    holder.add(group);

    const { camera, run } = rig([holder], {
      groundLevel: 0,
      cameraAt: [0, WALK_EYE_HEIGHT + 1000, 0],
    });

    run(180);

    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);
  });

  it('climbs a step that is within step height', () => {
    const { camera, physics, run } = rig(
      [
        slab(-2000, 0, 4000, 4000, 0), // lower floor, x in [-4000, 0]
        slab(2000, 0, 4000, 4000, 150, 300), // upper floor, riser 150 at x = 0
      ],
      { cameraAt: [-1000, WALK_EYE_HEIGHT, 0] },
    );

    run(30);
    run(120, { move: [25, 0] });
    run(90); // stand still: bob settles, stair smoothing finishes

    expect(camera.position.x).toBeGreaterThan(500);
    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(150 + WALK_EYE_HEIGHT, 0);
  });

  it('treats a ledge above step height as a wall', () => {
    const { camera, run } = rig(
      [
        slab(-2000, 0, 4000, 4000, 0),
        slab(2000, 0, 4000, 4000, 800, 1600), // riser 800 at x = 0
      ],
      { cameraAt: [-1000, WALK_EYE_HEIGHT, 0] },
    );

    run(30);
    run(240, { move: [25, 0] });
    run(90);

    expect(camera.position.x).toBeLessThanOrEqual(-WALK_BODY_RADIUS + 1);
    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);
  });

  it('falls off an open slab edge onto the ground below', () => {
    const { camera, physics, run } = rig([slab(0, 0, 4000, 4000, 0)], {
      groundLevel: -400,
    });

    run(30);
    run(200, { move: [25, 0] }); // edge is at x = 2000
    run(120);

    expect(camera.position.x).toBeGreaterThan(2000);
    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(-400 + WALK_EYE_HEIGHT, 0);
  });

  it('jumps: leaves the ground, rises, and lands back at eye height', () => {
    const { camera, physics, run } = rig([slab(0, 0, 6000, 6000, 0)]);

    run(30);
    let peak = 0;
    const moveVector = null;
    physics.step({ moveVector, jumpRequested: true, deltaSeconds: DT });
    expect(physics.getState().grounded).toBe(false);
    for (let frame = 0; frame < 180; frame += 1) {
      physics.step({ moveVector, jumpRequested: false, deltaSeconds: DT });
      peak = Math.max(peak, camera.position.y);
    }

    expect(peak).toBeGreaterThan(WALK_EYE_HEIGHT + 300);
    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);
  });

  it('a low ceiling cuts a jump short', () => {
    const { camera, physics, run } = rig([
      slab(0, 0, 6000, 6000, 0),
      box(0, 2250, 0, 6000, 100, 6000), // soffit at 2200
    ]);

    run(30);
    let peak = 0;
    physics.step({ moveVector: null, jumpRequested: true, deltaSeconds: DT });
    for (let frame = 0; frame < 180; frame += 1) {
      physics.step({ moveVector: null, jumpRequested: false, deltaSeconds: DT });
      peak = Math.max(peak, camera.position.y);
    }

    expect(peak).toBeLessThan(2200);
    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);
  });

  it('climbs a default stair from flat ground without jumping', () => {
    // The app's default stair: 250 mm treads, 175 mm risers, built exactly the
    // way createStairObject does — one open-riser box per step. Tread depth
    // equals the body radius here, which is the geometry that used to deadlock
    // the walk at the base until the step-up assist.
    const tread = 250;
    const riser = 175;
    const steps = [];
    for (let index = 0; index < 5; index += 1) {
      steps.push(box(tread * (index + 0.5), riser * (index + 0.5), 0, tread, riser, 1200));
    }
    const landingTop = 5 * riser; // 875
    const { camera, physics, run } = rig(
      [
        slab(-2000, 0, 4000, 4000, 0), // approach floor, x in [-4000, 0]
        ...steps,
        slab(6000 + tread * 5, 0, 12000, 4000, landingTop, 300), // arrival floor
      ],
      { cameraAt: [-1000, WALK_EYE_HEIGHT, 0] },
    );

    run(30);
    run(300, { move: [25, 0] });
    run(120); // stand still: smoothing and bob settle

    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.x).toBeGreaterThan(tread * 5); // topped out onto the landing
    expect(camera.position.y).toBeCloseTo(landingTop + WALK_EYE_HEIGHT, 0);
  });

  it('climbs an upper-floor stair over a stairwell void without falling down the shaft', () => {
    // The 2nd-to-3rd floor case: the stair rises over the stairwell opening,
    // with a small gap between the slab edge and the first step. The wall
    // pinch parks the body with its centre over that gap, and a centre-only
    // ground probe shoots down the shaft — the reported "jump, then suddenly
    // fall down onto the stairs below".
    const tread = 250;
    const riser = 175;
    const floor2 = 3000;
    const gap = 300; // slab opening edge at x=0, stair starts at x=300
    const steps = [];
    for (let index = 0; index < 5; index += 1) {
      steps.push(box(gap + tread * (index + 0.5), floor2 + riser * (index + 0.5), 0, tread, riser, 1200));
    }
    const landingTop = floor2 + 5 * riser; // 3875
    const { camera, physics, run } = rig(
      [
        slab(-2000, 0, 4000, 4000, floor2), // upper floor, opening edge at x = 0
        slab(2000, 0, 8000, 4000, 0), // the floor below, seen down the shaft
        ...steps,
        slab(6000 + gap + tread * 5, 0, 12000, 4000, landingTop, 300), // arrival floor
      ],
      { cameraAt: [-1000, floor2 + WALK_EYE_HEIGHT, 0] },
    );

    run(30);
    const minY = run(300, { move: [25, 0] });
    run(120);

    // Never below the upper floor's eye line — falling down the shaft would
    // read ~1875 here.
    expect(minY).toBeGreaterThan(floor2 + WALK_EYE_HEIGHT - 40);
    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(landingTop + WALK_EYE_HEIGHT, 0);
  });

  it('the step-up assist does not walk through furniture', () => {
    // A bed-height box: the raised rays clear it, but the surface just before
    // its face is the floor, not a step — so it must still block.
    const { camera, run } = rig([slab(0, 0, 8000, 8000, 0), box(1300, 225, 0, 600, 450, 2000)]);

    run(30);
    run(120, { move: [25, 0] });

    expect(camera.position.x).toBeLessThanOrEqual(1000 - WALK_BODY_RADIUS + 1);
    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);
  });

  it('excludes hidden floors and door leaves from the collision index', () => {
    const door = box(2100, 1050, 0, 200, 2100, 8000);
    door.userData.previewTarget = { kind: 'door' };
    const hiddenFloor = new THREE.Group();
    hiddenFloor.visible = false;
    hiddenFloor.add(slab(0, 0, 6000, 6000, 500));
    hiddenFloor.add(slab(0, 0, 6000, 6000, 3000));

    const { physics, run } = rig([slab(0, 0, 12000, 8000, 0), door, hiddenFloor]);

    run(1);

    // The visible slab, and nothing else: the door leaf and both hidden slabs
    // were decided against once, at collect time.
    expect(physics.getCollisionStats().meshes).toBe(1);
  });

  it('is stopped by a wall built into a rebuilt floor group under the same root', () => {
    // The incremental scene cache reuses the root object and swaps the floor
    // groups inside it, so the index cannot key on the root's identity.
    const root = new THREE.Group();
    const floor = new THREE.Group();
    floor.add(slab(0, 0, 8000, 8000, 0));
    root.add(floor);
    root.updateMatrixWorld(true);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, WALK_EYE_HEIGHT, 0);
    const physics = createWalkPhysics({
      camera,
      getCollisionSources: () => [root],
      getGroundLevel: () => -Infinity,
    });

    const walk = (frames, move) => {
      const moveVector = move ? new THREE.Vector3(move, 0, 0) : null;
      for (let frame = 0; frame < frames; frame += 1) {
        physics.step({ moveVector, deltaSeconds: DT });
      }
    };

    walk(30, null);
    walk(30, 25);
    expect(camera.position.x).toBeGreaterThan(500);

    // A wall arrives the way a rebuild delivers one: a brand-new floor group in
    // place of the old one, under the same root.
    const rebuilt = new THREE.Group();
    rebuilt.add(slab(0, 0, 8000, 8000, 0));
    rebuilt.add(box(2100, 1350, 0, 200, 2700, 8000)); // face at x = 2000
    root.clear();
    root.add(rebuilt);
    root.updateMatrixWorld(true);

    walk(240, 25);

    expect(camera.position.x).toBeLessThanOrEqual(2000 - WALK_BODY_RADIUS + 1);
    expect(physics.getCollisionStats().meshes).toBe(2);
  });

  it('follows the world when the collision source is swapped for a new root', () => {
    let root = new THREE.Group();
    root.add(slab(0, 0, 8000, 8000, 0));
    root.updateMatrixWorld(true);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, WALK_EYE_HEIGHT, 0);
    const physics = createWalkPhysics({
      camera,
      getCollisionSources: () => [root],
      getGroundLevel: () => -900,
    });

    for (let frame = 0; frame < 30; frame += 1) physics.step({ moveVector: null, deltaSeconds: DT });
    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);

    // A full rebuild hands back a different root entirely — and this one has no
    // floor in it, so the body should fall to the site datum.
    root = new THREE.Group();
    root.updateMatrixWorld(true);
    physics.invalidateCollisions();

    for (let frame = 0; frame < 180; frame += 1) physics.step({ moveVector: null, deltaSeconds: DT });

    expect(camera.position.y).toBeCloseTo(-900 + WALK_EYE_HEIGHT, 0);
  });

  it('reset drops the body back onto whatever is under the new pose', () => {
    const { camera, physics, run } = rig([slab(0, 0, 6000, 6000, 0), slab(0, 0, 6000, 6000, 3000)]);

    run(60);
    expect(camera.position.y).toBeCloseTo(WALK_EYE_HEIGHT, 0);

    // Teleport above the upper slab, the way a floor switch restores a pose.
    camera.position.set(0, 3000 + WALK_EYE_HEIGHT + 400, 0);
    physics.reset();
    run(120);

    expect(physics.getState().grounded).toBe(true);
    expect(camera.position.y).toBeCloseTo(3000 + WALK_EYE_HEIGHT, 0);
  });
});
