/**
 * Seasonal wood movement, and the joinery that fights it.
 *
 * Wood is dimensionally stable along its grain and moves a great deal across
 * it. A solid panel captured on both edges by rigid joinery - a dado at each
 * end, a tenon at each end - cannot move across its width, so the seasonal
 * swelling that would otherwise be harmless turns into compression set in
 * summer and a split in winter. That failure is invisible in the drawing and
 * obvious a year after the build, which is exactly the kind of mistake a
 * design tool should catch.
 *
 * What we warn about
 * ------------------
 * All FOUR conditions must hold. Each one exists to keep the warning honest:
 *
 *   1. Solid lumber. Plywood and MDF cross-laminate away most of the movement
 *      (see `woodProperties`), and metal and acrylic are not hygroscopic at
 *      all. Warning about them would train people to ignore the warning.
 *   2. The part declares a `grainAngle` (Phase 3). Without it we do not know
 *      which of the part's two dimensions is the cross-grain one, and guessing
 *      would be worse than saying nothing.
 *   3. The cross-grain dimension exceeds `MOVEMENT_WARNING_WIDTH_MM`. Below
 *      that the movement is smaller than the glue line can absorb.
 *   4. Rigid joinery captures BOTH ends of that dimension. One captured end is
 *      fine - the panel simply grows towards the free end, which is what a
 *      breadboard end or a single dado is for. Two is the trap.
 *
 * Everything is derived from data the document already carries: the grain
 * angles Phase 3 stores on the entity and the resolved joint graph the joinery
 * kernel already produced. Nothing here re-derives geometry.
 */

import { JOINT_TYPES } from '../../joinery/jointTypes';
import { normalizeGrainAngle } from '../utils/grainUtils';
import { getMaterialById } from '../data/materials';
import { isSolidLumberMaterial, resolveMaterialPhysics, toMovementPercent } from './woodProperties';

/**
 * Indoor moisture-content swing between a heated winter and a humid summer, in
 * percentage points. [WH] Ch.13 Table 13-1 gives recommended indoor EMC around
 * 6-8% for most of the United States, with seasonal excursions to ~12% in
 * unconditioned or humid-summer spaces; 6 points (roughly 6% -> 12%) is the
 * span that reference uses for its own worked examples of interior furniture.
 */
export const DEFAULT_INDOOR_MC_SWING = 6;

/**
 * Cross-grain width below which a captured panel is not worth flagging.
 *
 * At 150mm the worst case in the catalog (white oak, C_T = 0.00365) moves
 * 150 x 0.00365 x 6 = 3.3mm over the seasonal swing, which is already more than
 * a glue line tolerates - so this threshold is a reporting floor chosen by the
 * Phase 4 spec, not a safety limit. Narrower captured parts still move; they
 * just move less than the noise of the rest of the build.
 */
export const MOVEMENT_WARNING_WIDTH_MM = 150;

/**
 * Joints that hold a part rigidly along the mating edge. A butt joint is on
 * this list only when it is glued and screwed, which we cannot know, so it is
 * NOT: butt, dowel and pocket-screw joints are all point fixings that a wide
 * panel can (and does) drag through. The four below capture the full edge.
 */
export const RIGID_JOINT_TYPES = Object.freeze([
  JOINT_TYPES.DADO,
  JOINT_TYPES.RABBET,
  JOINT_TYPES.MORTISE_TENON,
  JOINT_TYPES.TAB_SLOT,
]);

const RIGID_JOINT_TYPE_SET = new Set(RIGID_JOINT_TYPES);

/** Which pair of rect edges bounds each in-plane dimension. */
const WIDTH_EDGES = Object.freeze(['left', 'right']);
const HEIGHT_EDGES = Object.freeze(['top', 'bottom']);

/** How close to 0deg / 90deg a grain angle must sit to name an edge pair. */
const AXIS_TOLERANCE_DEG = 1e-6;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Movement across the grain over one seasonal moisture swing, in mm.
 *
 *   movement = dimension x coefficient x mcSwing
 *
 * The TANGENTIAL coefficient is used deliberately. Tangential movement is
 * roughly double radial for every species in the table, and a flatsawn board -
 * what a lumberyard sells unless you pay for quartersawn - presents its
 * tangential face across the width. Predicting the radial (best) case would
 * under-report by half on the stock people actually buy.
 *
 * @param {object} input
 * @param {object|string} input.material catalog material object or id.
 * @param {number} input.crossGrainDimensionMm part dimension perpendicular to grain.
 * @param {number} [input.mcSwing] moisture-content swing in percentage points.
 * @returns {{movementMm:number, coefficient:number, coefficientPercent:number,
 *   mcSwing:number, crossGrainDimensionMm:number, species:string,
 *   referenceSpecies:string, kind:string, source:string} | null}
 */
export function estimateSeasonalMovement({ material, crossGrainDimensionMm, mcSwing = DEFAULT_INDOOR_MC_SWING } = {}) {
  const physics = resolveMaterialPhysics(material);
  if (!physics?.movement) {
    return null;
  }

  const dimension = toFiniteNumber(crossGrainDimensionMm);
  const swing = toFiniteNumber(mcSwing);
  if (!(dimension > 0) || !(swing > 0)) {
    return null;
  }

  const coefficient = physics.movement.tangential;

  return {
    movementMm: roundTo(dimension * coefficient * swing, 2),
    coefficient,
    coefficientPercent: roundTo(toMovementPercent(coefficient), 4),
    mcSwing: swing,
    crossGrainDimensionMm: roundTo(dimension, 2),
    species: physics.label,
    referenceSpecies: physics.referenceSpecies,
    kind: physics.kind,
    source: physics.source,
  };
}

function getRectSize(entity) {
  const width = Math.abs(entity.width ?? toFiniteNumber(entity.x2) - toFiniteNumber(entity.x1));
  const height = Math.abs(entity.height ?? toFiniteNumber(entity.y2) - toFiniteNumber(entity.y1));
  return { width, height };
}

/**
 * The part dimension running ACROSS the grain, and the two rect edges that bound
 * it, or null when the question has no clean answer.
 *
 * Grain is stored in world degrees from +X; a rotated rect carries its own
 * rotation, so the grain angle IN THE PART'S OWN FRAME is `grainAngle -
 * rotation`. That local angle is what decides which edge pair is which.
 *
 * Only local grain at 0deg or 90deg is resolved. A part drawn with its grain on
 * a diagonal has no single "cross-grain dimension" and no pair of edges that
 * bound it, so we decline rather than pick the nearest axis - `getGrainRotations`
 * makes the same call for the same reason.
 */
export function getCrossGrainDimension(entity) {
  const grainAngle = normalizeGrainAngle(entity?.grainAngle);
  if (grainAngle == null || entity?.type !== 'rect') {
    return null;
  }

  const localGrain = normalizeGrainAngle(grainAngle - toFiniteNumber(entity.rotation));
  const { width, height } = getRectSize(entity);

  if (Math.abs(localGrain) <= AXIS_TOLERANCE_DEG) {
    // Grain runs along the rect's local X, so the cross-grain span is its
    // height, bounded by the top and bottom edges.
    return { dimensionMm: height, alongGrainMm: width, edgeKeys: HEIGHT_EDGES, axis: 'height', localGrain };
  }

  if (Math.abs(localGrain - 90) <= AXIS_TOLERANCE_DEG) {
    return { dimensionMm: width, alongGrainMm: height, edgeKeys: WIDTH_EDGES, axis: 'width', localGrain };
  }

  return null;
}

function isJointRigidAndApplied(joint) {
  if (!joint || joint.enabled === false || !RIGID_JOINT_TYPE_SET.has(joint.type)) {
    return false;
  }

  const status = joint.validationState?.status;
  // An unresolved joint cuts nothing, so it captures nothing. `undefined` means
  // the joint was never run through the resolver (unit tests, legacy data), and
  // we take it at face value rather than dropping it.
  return status !== 'invalid' && status !== 'disabled';
}

/**
 * `partId -> Set(edgeKey)` for every edge a rigid joint holds.
 *
 * Both ends of each joint are recorded: a dado is cut in the target part and
 * the source part's edge is buried in it, and BOTH parts are constrained by the
 * result. Edge keys come from the resolved contact the joinery kernel already
 * computed, falling back to the stored edge reference for joints that have not
 * been through the resolver.
 */
export function buildRigidJointEdgeMap(joints = []) {
  const edgesByPart = new Map();

  const record = (partId, edgeKey) => {
    if (!partId || !edgeKey) {
      return;
    }
    if (!edgesByPart.has(partId)) {
      edgesByPart.set(partId, new Set());
    }
    edgesByPart.get(partId).add(edgeKey);
  };

  for (const joint of joints) {
    if (!isJointRigidAndApplied(joint)) {
      continue;
    }

    record(joint.sourcePartId, joint.resolvedContact?.sourceEdgeKey ?? joint.sourceEdgeRef?.sourceKey);
    record(joint.targetPartId, joint.resolvedContact?.targetEdgeKey ?? joint.targetEdgeRef?.sourceKey);
  }

  return edgesByPart;
}

function buildAdvice(movement) {
  return `allow for movement — elongated holes / panel groove (${movement.movementMm}mm across the grain)`;
}

/**
 * Warning diagnostics for solid panels trapped between rigid joints.
 *
 * Shaped like a joint diagnostic (`status`, `statusLabel`, `message`) so it can
 * render beside them without a second presentation vocabulary.
 *
 * @param {object[]} entities resolved document entities.
 * @param {object[]} joints resolved joints (post `resolveSketchJoinery`).
 * @param {object} [options]
 * @param {number} [options.mcSwing] moisture-content swing, percentage points.
 * @param {Function} [options.lookupMaterial] material resolver, injectable for tests.
 * @returns {object[]} one diagnostic per constrained part, in entity order.
 */
export function buildWoodMovementDiagnostics(entities = [], joints = [], options = {}) {
  const mcSwing = options.mcSwing ?? DEFAULT_INDOOR_MC_SWING;
  const lookupMaterial = options.lookupMaterial ?? getMaterialById;
  const rigidEdgesByPart = buildRigidJointEdgeMap(joints);
  if (!rigidEdgesByPart.size) {
    return [];
  }

  const diagnostics = [];

  for (const entity of entities) {
    const rigidEdges = rigidEdgesByPart.get(entity?.id);
    if (!rigidEdges || rigidEdges.size < 2) {
      continue;
    }

    const material = lookupMaterial(entity.materialId);
    if (!isSolidLumberMaterial(material)) {
      continue;
    }

    const crossGrain = getCrossGrainDimension(entity);
    if (!crossGrain || !(crossGrain.dimensionMm > MOVEMENT_WARNING_WIDTH_MM)) {
      continue;
    }

    // Both ends of the cross-grain span have to be captured. One end free is
    // the correct way to build a wide solid panel, so it must not warn.
    if (!crossGrain.edgeKeys.every((edgeKey) => rigidEdges.has(edgeKey))) {
      continue;
    }

    const movement = estimateSeasonalMovement({
      material,
      crossGrainDimensionMm: crossGrain.dimensionMm,
      mcSwing,
    });
    if (!movement) {
      continue;
    }

    diagnostics.push({
      partId: entity.id,
      status: 'warning',
      statusLabel: 'Movement',
      axis: crossGrain.axis,
      edgeKeys: [...crossGrain.edgeKeys],
      crossGrainDimensionMm: movement.crossGrainDimensionMm,
      movementMm: movement.movementMm,
      mcSwing: movement.mcSwing,
      species: movement.species,
      materialName: material.name ?? entity.materialId,
      message:
        `${entity.id} is ${movement.crossGrainDimensionMm}mm across the grain in ${material.name ?? entity.materialId} ` +
        `and is held rigidly at both the ${crossGrain.edgeKeys[0]} and ${crossGrain.edgeKeys[1]} edges. ` +
        `Expect ${movement.movementMm}mm of seasonal movement across that width ` +
        `(${movement.species}, ${movement.mcSwing}%MC swing) — ${buildAdvice(movement)}.`,
    });
  }

  return diagnostics;
}
