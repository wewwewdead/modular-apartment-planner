import * as THREE from 'three';
import { createCollisionIndex } from './previewCollisionIndex';
import {
  WALK_BOB_AMPLITUDE,
  WALK_BOB_PHASE_PER_MM,
  WALK_BODY_RADIUS,
  WALK_EYE_HEIGHT,
  WALK_GRAVITY,
  WALK_HEAD_CLEARANCE,
  WALK_JUMP_SPEED,
  WALK_STAIR_SMOOTHING_RATE,
  WALK_STEP_HEIGHT,
  WALK_TERMINAL_SPEED,
} from './previewConfig';

/**
 * The physical half of walk mode: a raycast character controller.
 *
 * No physics engine — the body is three horizontal rays and one vertical one,
 * cast against the same meshes the preview draws. That is enough for what a
 * tour needs (walls stop you, floors hold you, stairs carry you between them,
 * an open slab edge lets you fall off) and it keeps the walk working against
 * whatever the scene cache is currently holding, with nothing to sync.
 *
 * Door leaves are deliberately passable: the preview draws every door closed,
 * and a tour that has to stop at each of them is a tour of the hallway.
 *
 * What the rays are cast *against* is `previewCollisionIndex`, not the scene
 * graph: which meshes can be hit, and where they are, is settled once per world
 * change instead of being rediscovered on each of the nine to fifteen rays a
 * step casts. The set it holds is exactly the one this file used to filter for
 * per hit.
 */

/** The wall rays' heights above the feet. The lowest sits above the step
 * height so a stair riser reads as a step, not a wall; the middle catches
 * sills and furniture; the top catches beams and headers near the head. */
const WALL_RAY_HEIGHTS = [WALK_STEP_HEIGHT + 80, 900, 1500];

/** How far above the feet the ground probe starts — just past the step height,
 * so a tread within stepping reach is seen and a taller ledge is not. */
const GROUND_PROBE_LIFT = WALK_STEP_HEIGHT + 20;

const GROUND_PROBE_RANGE = 200000;

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export function createWalkPhysics({
  camera,
  getCollisionSources,
  getGroundLevel,
  eyeHeight = WALK_EYE_HEIGHT,
  bodyRadius = WALK_BODY_RADIUS,
  stepHeight = WALK_STEP_HEIGHT,
}) {
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0;
  const collisionIndex = createCollisionIndex();
  const rayOrigin = new THREE.Vector3();
  const remaining = new THREE.Vector3();
  const moveDirection = new THREE.Vector3();
  const wallNormal = new THREE.Vector3();
  const assistNormal = new THREE.Vector3();
  const supportOrigin = new THREE.Vector3();

  let verticalVelocity = 0;
  let grounded = false;
  let bobPhase = 0;
  let bobAmplitude = 0;
  let bobOffset = 0;

  /**
   * Nearest collidable hit along a ray.
   *
   * Nearest-only at every call site: a wall ray wants the first thing in the
   * way, and a ground probe wants the top surface it would land on. Nothing here
   * has ever wanted the list, which is why the index returns one hit rather than
   * an array to sort and discard.
   */
  const castRay = (origin, direction, far) => {
    raycaster.set(origin, direction);
    raycaster.far = far;
    return collisionIndex.raycastNearest(raycaster);
  };

  /** Nearest blocking hit along a horizontal direction, over the body's height. */
  const nearestWallHit = (direction, far, feetY) => {
    let nearest = null;
    for (const height of WALL_RAY_HEIGHTS) {
      rayOrigin.set(camera.position.x, feetY + height, camera.position.z);
      const hit = castRay(rayOrigin, direction, far);
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
    }
    return nearest;
  };

  /**
   * Nearest blocking hit for a move at a given feet level, and how far the
   * body may advance toward it.
   *
   * The body radius is a perpendicular clearance from the wall; along an
   * oblique ray the wall is that much further away than the clearance is, so
   * the stop distance grows by the ray-to-normal cosine — floored so a grazing
   * ray cannot demand metres of clearance and pin the body far from a wall it
   * is only brushing past. A near-horizontal face means the ray grazed a tread
   * edge or a soffit; sliding along "up" is nonsense, so it reports no usable
   * normal and the caller treats it as a plain stop.
   */
  const advanceBudget = (direction, distance, feetY, normalTarget) => {
    const hit = nearestWallHit(direction, distance + 4 * bodyRadius, feetY);
    if (!hit) return { hit: null, free: distance, hasWallNormal: false };

    let clearanceAlongRay = bodyRadius;
    let hasWallNormal = false;
    if (hit.face) {
      normalTarget.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      normalTarget.y = 0;
      if (normalTarget.lengthSq() >= 0.09) {
        normalTarget.normalize();
        hasWallNormal = true;
        clearanceAlongRay = bodyRadius / Math.max(Math.abs(direction.dot(normalTarget)), 0.25);
      }
    }

    return { hit, free: Math.max(0, Math.min(hit.distance - clearanceAlongRay, distance)), hasWallNormal };
  };

  /**
   * Whether a blocked move is really just the next stair riser.
   *
   * The wall rays alone deadlock at a stair's base whenever the tread depth is
   * no bigger than the body radius (the app's default stair is exactly 250 mm
   * both ways): the lowest ray hits the SECOND riser and pins the body with
   * its centre still short of the first tread, so the ground probe never sees
   * the step it should climb. The classic character-controller answer: re-test
   * the move with the rays one step height higher, and if the way is clear up
   * there AND there is a landable surface just before the blocking face —
   * a genuine step up, not the floor running under a bench or a knee rail —
   * take the move and let the grounded smoothing lift the feet.
   */
  const stepUpClears = (direction, leftover, feetY, blockingHit) => {
    const raised = advanceBudget(direction, leftover, feetY + stepHeight, assistNormal);
    if (raised.hit && raised.free < leftover) return false;

    supportOrigin.set(
      blockingHit.point.x - direction.x * 50,
      feetY + GROUND_PROBE_LIFT,
      blockingHit.point.z - direction.z * 50,
    );
    const support = castRay(supportOrigin, DOWN, GROUND_PROBE_RANGE);
    if (!support) return false;

    const stepDelta = support.point.y - feetY;
    return stepDelta > 20 && stepDelta <= stepHeight;
  };

  const moveHorizontally = (moveVector, feetY) => {
    remaining.copy(moveVector);
    let travelled = 0;

    // Collide-and-slide, two passes: the first blocked pass converts the move
    // into one along the wall, the second applies it (or finds the corner).
    for (let pass = 0; pass < 2 && remaining.lengthSq() > 1e-6; pass += 1) {
      const distance = remaining.length();
      moveDirection.copy(remaining).divideScalar(distance);

      const { hit, free, hasWallNormal } = advanceBudget(moveDirection, distance, feetY, wallNormal);
      if (!hit || free >= distance) {
        camera.position.x += remaining.x;
        camera.position.z += remaining.z;
        travelled += distance;
        break;
      }

      camera.position.x += moveDirection.x * free;
      camera.position.z += moveDirection.z * free;
      travelled += free;

      const leftover = distance - free;
      if (leftover <= 1) break;

      // Grounded only: mid-jump the feet-relative rays are already lifted,
      // and assisting there would ghost the body through low walls.
      if (grounded && stepUpClears(moveDirection, leftover, feetY, hit)) {
        camera.position.x += moveDirection.x * leftover;
        camera.position.z += moveDirection.z * leftover;
        travelled += leftover;
        break;
      }

      if (!hasWallNormal) break;
      moveDirection.addScaledVector(wallNormal, -moveDirection.dot(wallNormal));
      if (moveDirection.lengthSq() < 1e-6) break;
      remaining.copy(moveDirection.normalize()).multiplyScalar(leftover);
    }

    return travelled;
  };

  /**
   * The surface the body is standing over.
   *
   * A footprint, not a point: five probes across the body's stance, taking the
   * highest support found. A single centre probe falls down any hole its point
   * crosses — and an upper-floor stair rises over the stairwell void with a
   * gap between the slab-opening edge and the first step, which is exactly
   * where the wall pinch parks the body. With half a body on the slab behind
   * and half on the tread ahead, a person does not fall down the shaft.
   *
   * `supported: false` means nothing under any probe at all (the ground disc
   * may be switched off with the style) and the site datum is standing in.
   */
  const footRadius = bodyRadius * 0.7;
  const probeGround = (feetY) => {
    let groundY = null;
    for (let index = 0; index < 5; index += 1) {
      const offsetX = index === 1 ? footRadius : index === 2 ? -footRadius : 0;
      const offsetZ = index === 3 ? footRadius : index === 4 ? -footRadius : 0;
      rayOrigin.set(camera.position.x + offsetX, feetY + GROUND_PROBE_LIFT, camera.position.z + offsetZ);
      const hit = castRay(rayOrigin, DOWN, GROUND_PROBE_RANGE);
      if (hit && (groundY === null || hit.point.y > groundY)) groundY = hit.point.y;
    }
    if (groundY === null) return { groundY: getGroundLevel(), supported: false };
    return { groundY, supported: true };
  };

  return {
    step({ moveVector, jumpRequested = false, deltaSeconds }) {
      if (!deltaSeconds) return;
      // The world is still read through the callback every step — `worldRoot`
      // and the ground disc are swapped underneath this module — but the reading
      // is now one cheap comparison: `sync` rebuilds the index only when the
      // sources, or the floor groups under them, actually changed.
      collisionIndex.sync(getCollisionSources().filter(Boolean));
      let feetY = camera.position.y - eyeHeight - bobOffset;

      let travelled = 0;
      if (moveVector && moveVector.lengthSq() > 0) {
        travelled = moveHorizontally(moveVector, feetY);
      }

      if (grounded && jumpRequested) {
        verticalVelocity = WALK_JUMP_SPEED;
        grounded = false;
      }

      const { groundY, supported } = probeGround(feetY);

      if (grounded) {
        const delta = groundY - feetY;
        if (delta >= -stepHeight && delta <= stepHeight + GROUND_PROBE_LIFT) {
          // Ride the surface — exact exponential so the stair climb is frame
          // rate independent. Snapped once it is sub-millimetre: an eye that
          // keeps creeping by microns is a progressive refine that keeps
          // restarting.
          feetY =
            Math.abs(delta) < 0.5 ? groundY : feetY + delta * (1 - Math.exp(-WALK_STAIR_SMOOTHING_RATE * deltaSeconds));
        } else if (delta < -stepHeight) {
          // Walked off an edge.
          grounded = false;
        }
      }

      if (!grounded) {
        verticalVelocity = Math.max(verticalVelocity - WALK_GRAVITY * deltaSeconds, -WALK_TERMINAL_SPEED);

        if (verticalVelocity > 0) {
          const rise = verticalVelocity * deltaSeconds;
          rayOrigin.set(camera.position.x, feetY + eyeHeight, camera.position.z);
          if (castRay(rayOrigin, UP, rise + WALK_HEAD_CLEARANCE)) {
            verticalVelocity = 0;
          }
        }

        const nextFeetY = feetY + verticalVelocity * deltaSeconds;
        // Land only on a surface the feet are already near or crossing this
        // frame. The footprint probe reports the HIGHEST support under the
        // stance, so a body falling past a stair would otherwise "land" by
        // teleporting sideways-up onto a tread it merely brushed. The datum
        // fallback is exempt: it is the out-of-world recovery, and there is
        // nothing legitimate to be below.
        const canLand = feetY >= groundY - stepHeight || !supported;
        if (verticalVelocity <= 0 && nextFeetY <= groundY && canLand) {
          feetY = groundY;
          verticalVelocity = 0;
          grounded = true;
        } else {
          feetY = nextFeetY;
        }
      }

      // Head bob: stride phase advances with distance walked, and the
      // amplitude eases in and out so stopping is a settle, not a snap. It has
      // to reach exactly zero — a camera that never stops moving is a
      // progressive refine that never starts.
      const striding = grounded && travelled > 0.5;
      if (striding) bobPhase += travelled * WALK_BOB_PHASE_PER_MM;
      const targetAmplitude = striding ? WALK_BOB_AMPLITUDE : 0;
      bobAmplitude += (targetAmplitude - bobAmplitude) * (1 - Math.exp(-8 * deltaSeconds));
      // The phase holds while the amplitude fades, so stopping is a settle;
      // only once the bob is genuinely gone does the stride reset.
      if (!striding && bobAmplitude < 0.05) {
        bobAmplitude = 0;
        bobPhase = 0;
      }
      bobOffset = Math.sin(bobPhase) * bobAmplitude;

      camera.position.y = feetY + eyeHeight + bobOffset;
    },

    /** After any teleport — a restored pose, a floor switch, a mode toggle.
     * Ungrounded on purpose: gravity re-finding the floor is the cheapest way
     * to be correct about wherever the camera just landed. */
    reset() {
      verticalVelocity = 0;
      grounded = false;
      bobPhase = 0;
      bobAmplitude = 0;
      bobOffset = 0;
    },

    /**
     * The world content changed: throw the collision index away.
     *
     * The explicit half of the staleness guard. `sync` would catch a swapped
     * root or a rebuilt floor group on its own from the structural signature it
     * keeps, but a collider that let the body walk through a wall built one
     * frame ago is not a bug anyone would think to look for here, so the two
     * paths that change the world say so directly as well.
     */
    invalidateCollisions() {
      collisionIndex.invalidate();
    },

    getState() {
      return { grounded, verticalVelocity };
    },

    /** What the collision index is holding. Diagnostic; used by the tests. */
    getCollisionStats() {
      return collisionIndex.getStats();
    },
  };
}
