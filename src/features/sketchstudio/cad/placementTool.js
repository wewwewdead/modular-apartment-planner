// Direct placement for the guided solid operations (Phase H). A pure stage
// machine over the operation draft (operations.js): the draft gains a
// draft-only `placement` record, never persisted, and this module turns
// viewport clicks and completed handle drags into draft patches, and the
// draft into the "view" the viewport draws (ghost, handles, hint).
//
//   Place  → the next click fixes where the operation goes (a face, the
//            ground, a path corner, a loft section, a reference face, a plane)
//   Shape  → handles (distance arrow, slide square, grips, plane arrow, the
//            boolean tool gizmo) and the panel fields
//   Apply  → unchanged (CadWorkspace applyOperation)
//
// World frames follow sketchPlane.js ({ origin, x, y, normal }, uprightAxes).
// Stored sketches use the existing fields only: for an existing part they are
// in its part coordinates (unmapFrame through the kernel placement); for a
// new part the sketch is XY at the origin and the instance carries the frame
// (frameToInstance), exactly as the Phase A sketch flow does.
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { createPart, numeric, uid, vector } from './model.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import { cleanRotation } from './movement.js';
import { sampleArc } from './sketchProfile.js';
import { nextPartName } from './sketchOperations.js';
import {
  cross,
  dot,
  frameToInstance,
  frameToSketchFields,
  makeFrame,
  mapFrame,
  normalize,
  sketchLocalFrame,
  sketchWorldFrame,
  tidyPoint,
  toPlane,
  toWorld,
  unmapFrame,
  uprightAxes,
} from './sketchPlane.js';
import { clampMagnitude, snapValue } from './placementHandles.js';
// Phase J: Hole, Pocket, Hardware and Transform (cycle-safe: only called).
import {
  applyCutDrag,
  cutDepthText,
  cutDragView,
  cutPlacementView,
  cutSummary,
  hoverCutShape,
  ownsTool,
  placeCut,
  startCutPlacement,
} from './placementCuts.js';
// Phase K: hole rows (docs/sketch-studio-hole-row.md); cycle-safe, only called.
import { finishRowSeed, rowDragView, rowReadout, rowStepBack, shiftRowExtras } from './placementRows.js';
// Phase M: hardware in chosen holes (docs/sketch-studio-hardware-holes.md); cycle-safe, only called.
import { chooseHole, finishHardware, hardwareReplace, hardwareStepBack } from './placementHardware.js';

export const DEFAULT_LENGTH = 18;
export const MIN_LENGTH = 0.1;
export const DEFAULT_SQUARE = 40;
export const DEFAULT_SECTION_RADIUS = 5;
export const LOFT_RADIUS = 20;
export const REVOLVE_PROFILE = { width: 10, height: 40 };
// Distance of a ground revolve's axis from the click (mm).
export const GROUND_AXIS_OFFSET = 30;
// An edge picked as a revolve axis must lie in the profile plane (mm).
export const IN_PLANE_TOLERANCE = 0.05;
// A clicked face matches a kernel reference plane within this (mm).
export const REFERENCE_TOLERANCE = 0.05;

export const BOOLEAN_TOOLS = ['union', 'subtract', 'intersect'];
const REFERENCE_TOOLS = ['fillet', 'chamfer', 'shell'];
const PLANE_TOOLS = ['mirror', 'trim'];
const TITLES = {
  extrude: 'Extrude',
  revolve: 'Revolve',
  sweep: 'Sweep',
  loft: 'Loft',
  union: 'Union',
  subtract: 'Subtract',
  intersect: 'Intersect',
  fillet: 'Fillet',
  chamfer: 'Chamfer',
  shell: 'Shell',
  mirror: 'Mirror',
  trim: 'Trim',
  pattern: 'Pattern',
  transform: 'Transform',
  sketch: 'Extrude',
};
// Colours: the sketch "preview" blue, a cut red (spec §3.4).
export const PLACEMENT_BLUE = '#2f9be6';
export const PLACEMENT_RED = '#d2403c';
export const CURVED_FACE = 'Pick a flat face. Curved faces cannot hold a profile; click a flat face or empty ground.';
export const NO_REFERENCE = "This face is not one of the part's six boundary planes; choose a reference below";

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);
const len = (a) => Math.hypot(...a);
const tidy = (value, step = 1e-6) => {
  const result = Math.round(value / step) * step;
  const out = Number(result.toFixed(Math.max(0, Math.ceil(-Math.log10(step)))));
  return Object.is(out, -0) || Math.abs(out) < step ? 0 : out;
};
const fmt = (value) => String(Number(Number(value).toFixed(2)));
// A parameter value as a number, or `fallback` when it does not resolve.
const num = (value, parameters, fallback = 0) => {
  try {
    return numeric(value, parameters || {});
  } catch {
    return fallback;
  }
};
const clean = (sketch) => Object.fromEntries(Object.entries(sketch).filter(([, value]) => value !== undefined));
const title = (tool) => TITLES[tool] || tool;

// ---------------------------------------------------------------- labels

const FACE_NAMES = [
  [[0, 0, 1], 'top'],
  [[0, 0, -1], 'bottom'],
  [[0, -1, 0], 'front'],
  [[0, 1, 0], 'rear'],
  [[-1, 0, 0], 'left'],
  [[1, 0, 0], 'right'],
];
// "top face" for a world +Z normal, … ; "face" otherwise.
export function faceLabel(normal) {
  for (const [n, name] of FACE_NAMES) if (dot(n, normal) > 0.9999) return `${name} face`;
  return 'face';
}
// "+Z" for an axis direction, else the rounded vector.
export function directionLabel(direction) {
  const names = ['X', 'Y', 'Z'];
  for (let i = 0; i < 3; i++)
    if (Math.abs(Math.abs(direction[i]) - 1) < 1e-6) return `${direction[i] > 0 ? '+' : '-'}${names[i]}`;
  return `(${direction.map((v) => fmt(v)).join(', ')})`;
}

// ---------------------------------------------------------------- frames

// The placement frame at a point on a face: uprightAxes, as Sketch on face.
export function placeFrame(point, normal) {
  const axes = uprightAxes(normal);
  return makeFrame(point, axes.x, axes.normal);
}
export const GROUND_FRAME = Object.freeze({
  origin: [0, 0, 0],
  x: [1, 0, 0],
  y: [0, 1, 0],
  normal: [0, 0, 1],
});

// Kernel placement operations for a plain instance pose (kernel.js place()).
export function instanceOperations(instance, parameters = {}) {
  const rotation = vector(instance.rotation || [0, 0, 0], parameters);
  const ops = rotation
    .map((angle, i) => ({ angle, axis: [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0], origin: [0, 0, 0] }))
    .filter((op) => op.angle);
  ops.push({ translation: vector(instance.position || [0, 0, 0], parameters) });
  return ops;
}

// The kernel placement of the instance a draft shapes (its new instance, or
// the clicked / selected one), or null when the model has not been built.
export function hostOperations(draft, ctx) {
  if (draft.newInstance) return instanceOperations(draft.newInstance, ctx.parameters);
  const id = draft.placement?.hostInstanceId;
  const instances = ctx.snapshot?.instances || [];
  const placed = instances.find((i) => i.id === id)?.placement;
  if (placed) return placed;
  const first = ctx.model.instances.find((i) => i.partId === draft.partId);
  return instances.find((i) => i.id === first?.id)?.placement || null;
}
const hostInstanceId = (draft, ctx) =>
  draft.newInstance?.id ||
  draft.placement?.hostInstanceId ||
  ctx.model.instances.find((i) => i.partId === draft.partId)?.id ||
  null;
// World and part-coordinate boxes of the shaped part (null for a new part).
const hostWorldBounds = (draft, ctx) =>
  draft.newInstance ? null : ctx.snapshot?.instances.find((i) => i.id === hostInstanceId(draft, ctx))?.bounds || null;
const hostLocalBounds = (draft, ctx) =>
  draft.newPart ? null : ctx.snapshot?.parts?.find((p) => p.id === draft.partId)?.bounds || null;

// How deep the part reaches behind a plane (point, outward normal; both in
// part coordinates): the largest distance of a box corner against the normal.
export function depthInto(bounds, point, normal) {
  if (!bounds) return Infinity;
  const [min, max] = bounds;
  let depth = 0;
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) depth = Math.max(depth, dot(sub(point, [x, y, z]), normal));
  return depth;
}
// The same for a world frame, through the host placement.
function frameDepth(draft, ctx, frame) {
  const bounds = hostLocalBounds(draft, ctx),
    ops = hostOperations(draft, ctx);
  if (!bounds || !ops) return Infinity;
  return depthInto(bounds, unmapPlacement(frame.origin, ops), unmapPlacement(frame.normal, ops, true));
}

// ---------------------------------------------------------------- profiles

const RECT = (width, height, center = [0, 0]) => ({
  type: 'rectangle',
  width,
  height,
  origin: [tidy(center[0] - width / 2), tidy(center[1] - height / 2)],
});
const CIRCLE = (radius, center = [0, 0]) => ({ type: 'circle', radius, center: [...center] });

// Sample a profile's outer outline and holes as closed loops of [u, v].
export function profileLoops(profile, parameters = {}) {
  if (!profile) return [];
  const p2 = (point) => [num(point?.[0], parameters), num(point?.[1], parameters)];
  let outer = [];
  if (profile.type === 'rectangle') {
    const w = num(profile.width, parameters, 1),
      h = num(profile.height, parameters, 1),
      [x, y] = p2(profile.origin || [0, 0]);
    outer = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  } else if (profile.type === 'circle') {
    const r = num(profile.radius, parameters, 1),
      [cx, cy] = p2(profile.center || [0, 0]);
    outer = Array.from({ length: 48 }, (_, i) => {
      const t = (i / 48) * Math.PI * 2;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    });
  } else if (profile.type === 'polygon') outer = (profile.points || []).map(p2);
  else if (profile.type === 'path') {
    let at = p2(profile.start || [0, 0]);
    outer = [at];
    for (const segment of profile.segments || []) {
      if (segment.construction) continue;
      const end = p2(segment.end);
      if (segment.type === 'arc') outer.push(...sampleArc(at, p2(segment.mid), end, 24).slice(1));
      else if (segment.type === 'spline') {
        const c1 = p2(segment.control1),
          c2 = p2(segment.control2);
        for (let i = 1; i <= 16; i++) {
          const t = i / 16,
            s = 1 - t;
          outer.push(
            [0, 1].map((k) => s * s * s * at[k] + 3 * s * s * t * c1[k] + 3 * s * t * t * c2[k] + t * t * t * end[k]),
          );
        }
      } else outer.push(end);
      at = end;
    }
    if (profile.closed === false) return [outer];
  }
  return [outer, ...(profile.holes || []).flatMap((hole) => profileLoops(hole, parameters))].filter((l) => l.length);
}

// Centre of a profile's outer outline box, in its sketch plane.
export function profileCentre(profile, parameters = {}) {
  if (profile?.type === 'circle') return [num(profile.center?.[0], parameters), num(profile.center?.[1], parameters)];
  const loop = profileLoops(profile, parameters)[0] || [[0, 0]];
  const us = loop.map((p) => p[0]),
    vs = loop.map((p) => p[1]);
  return [(Math.min(...us) + Math.max(...us)) / 2, (Math.min(...vs) + Math.max(...vs)) / 2];
}

// The default profile edge for a face: min(40, half its smaller side).
export function defaultSquare(outline = []) {
  if (!outline?.length) return DEFAULT_SQUARE;
  const points = outline.flat();
  const us = points.map((p) => p[0]),
    vs = points.map((p) => p[1]);
  const span = Math.min(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs));
  if (!(span > 0)) return DEFAULT_SQUARE;
  return Math.max(1, Math.min(DEFAULT_SQUARE, Math.round((span / 2) * 10) / 10));
}

// Area centroid of a face given its triangles (world positions xyz, index,
// triangle list) — the "face centre" snap candidate. For a face with holes
// this is the centroid of the material, i.e. of the outline polygon.
export function faceCentroid(positions, index, triangles) {
  let area = 0;
  const sum = [0, 0, 0];
  const point = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (const t of triangles) {
    const a = point(index[t * 3]),
      b = point(index[t * 3 + 1]),
      c = point(index[t * 3 + 2]);
    const w = len(cross(sub(b, a), sub(c, a))) / 2;
    area += w;
    for (let k = 0; k < 3; k++) sum[k] += (w * (a[k] + b[k] + c[k])) / 3;
  }
  return area > 0 ? sum.map((v) => v / area) : null;
}

// ---------------------------------------------------------------- sweep bends

// A planar polyline (2D points, start first) with every corner rounded by a
// tangent arc of `radius`: each corner trims both of its segments by
// r · tan(φ/2) (φ = the turning angle; = r / tan(θ/2) for the interior angle
// θ) and inserts { type: 'arc', mid, end } for the kernel's threePointsArcTo.
// radius 0 keeps sharp corners. Refuses (throws) a segment too short for the
// trims at both its ends, coinciding points and a path that turns back.
export function polylineWithBends(points, radius = 0) {
  if (!points || points.length < 2) throw new Error('A sweep path needs at least two points.');
  const n = points.length;
  const dirs = [],
    lengths = [];
  for (let i = 0; i < n - 1; i++) {
    const d = [points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]];
    const l = Math.hypot(...d);
    if (l < 1e-9) throw new Error(`Path points ${i + 1} and ${i + 2} coincide.`);
    dirs.push([d[0] / l, d[1] / l]);
    lengths.push(l);
  }
  const t2 = (p) => tidyPoint(p, 1e-6);
  const r = Number(radius) || 0;
  if (!(r > 0) || n === 2)
    return { start: t2(points[0]), segments: points.slice(1).map((end) => ({ type: 'line', end: t2(end) })) };
  const trim = new Array(n).fill(0);
  const turnLeft = new Array(n).fill(null);
  for (let i = 1; i < n - 1; i++) {
    const a = dirs[i - 1],
      b = dirs[i];
    const turn = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    if (turn < 1e-7) continue;
    if (Math.PI - turn < 1e-6) throw new Error(`The path turns back on itself at point ${i + 1}.`);
    trim[i] = r * Math.tan(turn / 2);
    turnLeft[i] = a[0] * b[1] - a[1] * b[0] > 0;
  }
  for (let i = 0; i < n - 1; i++)
    if (trim[i] + trim[i + 1] > lengths[i] + 1e-9)
      throw new Error(
        `Segment ${i + 1} (${fmt(lengths[i])} mm) is too short for a ${fmt(r)} mm bend radius. Lower the bend radius or lengthen the segment.`,
      );
  const segments = [];
  let at = points[0];
  for (let i = 1; i < n; i++) {
    const corner = points[i];
    const end = trim[i] ? [corner[0] - dirs[i - 1][0] * trim[i], corner[1] - dirs[i - 1][1] * trim[i]] : corner;
    if (Math.hypot(end[0] - at[0], end[1] - at[1]) > 1e-9) segments.push({ type: 'line', end: t2(end) });
    at = end;
    if (i < n - 1 && trim[i]) {
      const a = dirs[i - 1];
      const normal = turnLeft[i] ? [-a[1], a[0]] : [a[1], -a[0]];
      const centre = [end[0] + normal[0] * r, end[1] + normal[1] * r];
      const toCorner = [corner[0] - centre[0], corner[1] - centre[1]];
      const l = Math.hypot(...toCorner);
      const mid = [centre[0] + (toCorner[0] / l) * r, centre[1] + (toCorner[1] / l) * r];
      const next = [corner[0] + dirs[i][0] * trim[i], corner[1] + dirs[i][1] * trim[i]];
      segments.push({ type: 'arc', mid: t2(mid), end: t2(next) });
      at = next;
    }
  }
  return { start: t2(points[0]), segments };
}

// ---------------------------------------------------------------- references

// The kernel reference whose plane contains a clicked face: `references` are
// kernel.js referenceOptions ({ plane, offset, label, edges, faces }); the
// point and normal are in part coordinates. The kernel builds a reference
// plane as Replicad's named plane at offset · its normal (XY → +Z, XZ → -Y,
// YZ → +X), so the offset is compared with that signed coordinate.
const REFERENCE_AXIS = { XY: [2, 1], XZ: [1, -1], YZ: [0, 1] };
export function matchReference(references, kind, point, normal, tolerance = REFERENCE_TOLERANCE) {
  for (const reference of references || []) {
    const spec = REFERENCE_AXIS[reference.plane];
    if (!spec || !(reference[kind] > 0)) continue;
    const [axis, sign] = spec;
    if (Math.abs(Math.abs(normal[axis]) - 1) > 1e-4) continue;
    if (Math.abs(point[axis] - sign * Number(reference.offset)) <= tolerance) return reference;
  }
  return null;
}

// ---------------------------------------------------------------- start

// The placement record a new or edited operation starts with, or null when
// the operation keeps fields only (Transform; editing a sweep, loft or
// revolve). `chosenSketch`: a closed sketch selected in the tree.
export function startPlacement({
  type,
  existingFeature = null,
  chosenSketch = null,
  hostInstanceId = null,
  hardware = null,
  template = null,
  row = false,
}) {
  if (ownsTool(type)) return startCutPlacement({ type, existingFeature, hostInstanceId, hardware, template, row });
  const base = { tool: type, hostInstanceId, inferOperation: false };
  if (existingFeature) {
    if (type === 'extrude') return { ...base, stage: 'shape', mode: 'stored' };
    if (BOOLEAN_TOOLS.includes(type)) return { ...base, stage: 'shape', mode: 'tool' };
    if (REFERENCE_TOOLS.includes(type)) return { ...base, stage: 'shape', mode: 'reference' };
    if (PLANE_TOOLS.includes(type)) return { ...base, stage: 'shape', mode: 'plane', offset: 0 };
    if (type === 'pattern') return { ...base, stage: 'shape', mode: 'step' };
    return null;
  }
  if (chosenSketch && type === 'extrude') return { ...base, stage: 'shape', mode: 'stored' };
  // Revolve / Sweep / Loft from a sketch chosen in the tree: fields, as before.
  if (chosenSketch && ['revolve', 'sweep', 'loft'].includes(type)) return null;
  if (['extrude', 'revolve'].includes(type)) return { ...base, stage: 'place', mode: 'placed', inferOperation: true };
  if (type === 'sweep')
    return {
      ...base,
      stage: 'place',
      mode: 'placed',
      inferOperation: false,
      points: [],
      section: { type: 'circle', radius: DEFAULT_SECTION_RADIUS, width: 10, height: 10, wall: 0 },
      bendRadius: null,
    };
  if (type === 'loft') return { ...base, stage: 'place', mode: 'placed', sections: [] };
  if (REFERENCE_TOOLS.includes(type)) return { ...base, stage: 'shape', mode: 'reference' };
  if (PLANE_TOOLS.includes(type)) return { ...base, stage: 'place', mode: 'plane', offset: 0 };
  if (BOOLEAN_TOOLS.includes(type)) return { ...base, stage: 'shape', mode: 'tool' };
  if (type === 'pattern') return { ...base, stage: 'shape', mode: 'step' };
  return null;
}

// Phase A "Sketch on face → Extrude / Cut": the same distance arrow on the
// finished sketch. Inference needs a face support (the part it was drawn on).
export function sketchFlowPlacement(draft) {
  return { tool: 'sketch', stage: 'shape', mode: 'sketch', inferOperation: draft.sketchFlow.inferOperation !== false };
}

// What a click does in the current stage.
export function pickOf(placement) {
  if (!placement) return null;
  if (placement.stage === 'axis') return 'edge';
  if (placement.mode === 'reference') return 'reference';
  if (placement.stage !== 'place') return null;
  // A hole row after its first click: the last hole on the seed's plane, as
  // Sweep corners (the layer's pathAt).
  if (placement.row?.seed) return 'path';
  if (placement.mode === 'plane') return 'plane';
  return (
    {
      extrude: 'face',
      revolve: 'face',
      sweep: 'path',
      loft: 'section',
      hole: 'face',
      pocket: 'face',
      hardware: 'face',
    }[placement.tool] || null
  );
}

// ---------------------------------------------------------------- targets

// "The part you click is the part you shape": a face of part A shapes A's
// definition; empty ground makes a new part.
function clickTarget(draft, info, ctx) {
  if (info.kind === 'ground') return { new: true };
  if (draft.newInstance && info.instanceId === draft.newInstance.id)
    throw new Error('Click a face of an existing part, or empty ground for a new part.');
  const instance = ctx.model.instances.find((i) => i.id === info.instanceId);
  if (!instance) throw new Error('Click a face of a part in the saved model.');
  if (!ctx.snapshot?.instances.some((i) => i.id === instance.id && i.placement))
    throw new Error('Rebuild the model before placing on this part.');
  const part = ctx.model.parts.find((p) => p.id === instance.partId);
  return { instanceId: instance.id, partId: instance.partId, name: instance.name || part?.name || 'Part' };
}

// Point the draft at its target: an existing definition, or a new part whose
// instance pose is `frame` (ids kept across re-placements).
function withTarget(draft, target, frame, ctx) {
  if (!target.new) return { ...draft, partId: target.partId, newPart: null, newInstance: null };
  const created = createPart();
  const part = draft.newPart || { ...created.part, name: nextPartName(ctx.model), features: [] };
  const instance = {
    ...(draft.newInstance || { ...created.instance, partId: part.id }),
    partId: part.id,
    ...frameToInstance(frame),
  };
  return {
    ...draft,
    partId: part.id,
    newPart: part,
    newInstance: instance,
    placement: { ...draft.placement, hostInstanceId: instance.id },
  };
}

// Stored plane fields of a world frame on the shaped part. The primary frame
// of a new part is XY at its origin (its instance carries the frame).
function sketchFields(draft, ctx, frame, primary = false) {
  if (draft.newInstance && primary) return { plane: 'XY', origin: [0, 0, 0], normal: undefined, xDirection: undefined };
  const ops = hostOperations(draft, ctx);
  if (!ops) throw new Error('Rebuild the model before placing on this part.');
  return frameToSketchFields(tidyFrame(unmapFrame(frame, ops)));
}

// Picked points and normals come from the float32 display mesh: on a turned
// part their part coordinates carry ~1e-5 mm, and a face normal (from three
// float32 corners) ~1e-5 of noise. Snap direction components within 2e-5 of
// 0 or ±1 (0.001°) and points to 1e-4 mm, so a face square to the part stays
// a named plane and the JSON stays readable.
export const tidyDirection = (direction) =>
  normalize(direction.map((v) => (Math.abs(v) < 2e-5 ? 0 : Math.abs(Math.abs(v) - 1) < 2e-5 ? Math.sign(v) : v))).map(
    (v) => tidy(v, 1e-9),
  );
export const tidyFrame = (frame) =>
  makeFrame(tidyPoint(frame.origin, 1e-4), tidyDirection(frame.x), tidyDirection(frame.normal));
const sketchEntry = (id, name, fields, profile) =>
  clean({ id, name, ...fields, profile, primitives: [], constrained: false });
const replaceSketches = (sketches, next) => [...sketches.filter((s) => !next.some((n) => n.id === s.id)), ...next];
const sketchOf = (draft, ctx, id) =>
  draft.sketches.find((s) => s.id === id) || ctx.model.sketches.find((s) => s.id === id) || null;

// ---------------------------------------------------------------- clicks

// Apply a viewport click (info from CadViewport: { kind: 'face' | 'ground' |
// 'path' | 'edge', instanceId, partId, point, normal, planar, faceFrame,
// outline, snapKind }) to the draft.
export function placeClick(draft, info, ctx) {
  const placement = draft.placement;
  if (!placement) throw new Error('This operation has no viewport placement.');
  const pick = pickOf(placement);
  if (ownsTool(placement.tool)) return placeCut(draft, info, ctx);
  if (info.kind === 'face' && !info.planar)
    throw new Error(pick === 'plane' || pick === 'reference' ? 'Pick a flat face of the part.' : CURVED_FACE);
  if (pick === 'face') return placeProfile(draft, info, ctx);
  if (pick === 'edge') return placeRevolveAxis(draft, info, ctx);
  if (pick === 'path') return placeSweepPoint(draft, info, ctx);
  if (pick === 'section') return placeLoftSection(draft, info, ctx);
  if (pick === 'reference') return pickReferenceFace(draft, info, ctx);
  if (pick === 'plane') return placePlane(draft, info, ctx);
  throw new Error('Nothing to place now.');
}

// Extrude / Revolve: the profile on the clicked face (or ground).
function placeProfile(draft, info, ctx) {
  const target = clickTarget(draft, info, ctx);
  const normal = info.kind === 'ground' ? [0, 0, 1] : info.normal;
  const p = draft.placement;
  let frame = placeFrame(info.point, normal);
  const placement = {
    ...p,
    stage: 'shape',
    target,
    frame,
    grid: info.faceFrame || GROUND_FRAME,
    label: info.kind === 'ground' ? 'ground' : faceLabel(normal),
    snapKind: info.snapKind || null,
    hostInstanceId: target.instanceId || null,
    size: p.size || defaultSquare(info.outline),
  };
  if (p.tool === 'revolve') {
    const axis = revolveAxisFor(info, frame);
    placement.axis = axis;
    frame = revolveFrame(info.point, normal, axis);
    placement.frame = frame;
  }
  return buildProfile(withTarget({ ...draft, placement }, target, frame, ctx), ctx);
}

function distance2ToSegment(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// A revolve profile frame: x along the axis, the click on the +y side.
export function revolveFrame(point, normal, axis) {
  const direction = normalize(sub(axis.b, axis.a));
  let frame = makeFrame(point, direction, normal);
  if (dot(sub(point, axis.a), frame.y) < 0) frame = makeFrame(point, scale(direction, -1), normal);
  return frame;
}

// The revolve profile kept on the click's side of the axis: centred on the
// click along the axis, radially centred unless that would cross the axis.
function fitRevolveProfile(profile, frame, axis) {
  const distance = Math.max(0, dot(sub(frame.origin, axis.a), frame.y));
  const width = Number(profile.width) || REVOLVE_PROFILE.width,
    height = Number(profile.height) || REVOLVE_PROFILE.height;
  return {
    type: 'rectangle',
    width,
    height,
    origin: [tidy(-width / 2), tidy(Math.max(-height / 2, -distance))],
  };
}

// (Re)build the sketch, new part pose and feature of a placed Extrude or
// Revolve from placement.frame, keeping the profile size and feature values.
function buildProfile(draft, ctx) {
  const p = draft.placement;
  const sketchId = p.ids?.sketchId || draft.feature?.sketchId || uid('sketch');
  const existing = draft.sketches.find((s) => s.id === sketchId);
  let profile;
  if (p.tool === 'revolve')
    profile = fitRevolveProfile(
      existing?.profile?.type === 'rectangle' ? existing.profile : REVOLVE_PROFILE,
      p.frame,
      p.axis,
    );
  else if (existing?.profile) {
    // Keep the size; re-centre on the frame origin (the placed point).
    const pr = existing.profile;
    profile =
      pr.type === 'rectangle'
        ? RECT(num(pr.width, ctx.parameters, p.size), num(pr.height, ctx.parameters, p.size))
        : pr.type === 'circle'
          ? CIRCLE(num(pr.radius, ctx.parameters, p.size / 2))
          : pr;
  } else profile = RECT(p.size, p.size);
  let next = draft;
  if (draft.newInstance) next = { ...draft, newInstance: { ...draft.newInstance, ...frameToInstance(p.frame) } };
  const sketch = sketchEntry(
    sketchId,
    existing?.name || (p.tool === 'revolve' ? 'Revolve profile' : 'Extrusion profile'),
    sketchFields(next, ctx, p.frame, true),
    profile,
  );
  let feature = next.feature
    ? { ...next.feature, sketchId }
    : {
        id: uid('feature'),
        type: p.tool,
        operation: 'add',
        sketchId,
        ...(p.tool === 'extrude' ? { length: DEFAULT_LENGTH, reverse: false } : { angle: 360 }),
      };
  if (next.newPart && feature.operation === 'cut') {
    const rest = { ...feature, operation: 'add' };
    delete rest.throughAll;
    feature = rest;
  }
  if (p.tool === 'revolve') {
    const ops = hostOperations(next, ctx);
    feature = {
      ...feature,
      axis: tidyDirection(unmapPlacement(normalize(sub(p.axis.b, p.axis.a)), ops, true)),
      origin: tidyPoint(unmapPlacement(p.axis.a, ops), 1e-4),
    };
  }
  return {
    ...next,
    sketches: replaceSketches(next.sketches, [sketch]),
    feature,
    placement: { ...p, ids: { ...p.ids, sketchId }, problem: '' },
  };
}

// Revolve: a clicked edge becomes the axis (it must lie in the profile plane).
function placeRevolveAxis(draft, info, ctx) {
  const p = draft.placement;
  if (info.kind !== 'edge') throw new Error('Click an edge to use as the axis.');
  const off = (q) => Math.abs(dot(sub(q, p.frame.origin), p.frame.normal));
  if (off(info.a) > IN_PLANE_TOLERANCE || off(info.b) > IN_PLANE_TOLERANCE)
    throw new Error('Edge must lie in the profile plane.');
  if (len(sub(info.b, info.a)) < 1e-6) throw new Error('Pick a straight edge with length.');
  const axis = { a: [...info.a], b: [...info.b] };
  const frame = revolveFrame(p.frame.origin, p.frame.normal, axis);
  return buildProfile({ ...draft, placement: { ...p, stage: 'shape', axis, frame } }, ctx);
}

// Sweep: the first click fixes the start and the path plane; later clicks
// (already projected onto that plane and snapped by the viewport) add corners.
function placeSweepPoint(draft, info, ctx) {
  const p = draft.placement;
  if (!p.points.length) {
    const target = clickTarget(draft, info, ctx);
    const normal = info.kind === 'ground' ? [0, 0, 1] : info.normal;
    const frame = placeFrame(info.point, normal);
    const placement = {
      ...p,
      target,
      frame,
      grid: frame,
      label: info.kind === 'ground' ? 'ground' : faceLabel(normal),
      hostInstanceId: target.instanceId || null,
      points: [[...info.point]],
    };
    return buildSweep(withTarget({ ...draft, placement }, target, frame, ctx), ctx);
  }
  const last = p.points.at(-1);
  // On the path plane, whatever the viewport sent.
  const onPlane = sub(info.point, scale(p.frame.normal, dot(sub(info.point, p.frame.origin), p.frame.normal)));
  if (len(sub(onPlane, last)) < 1e-6) return draft; // the second click of a double-click
  return buildSweep({ ...draft, placement: { ...p, points: [...p.points, onPlane] } }, ctx);
}

export const sectionRadius = (section) =>
  section.type === 'circle'
    ? Number(section.radius) || 0
    : Math.max(Number(section.width) || 0, Number(section.height) || 0) / 2;
export const bendRadiusOf = (placement) =>
  placement.bendRadius == null ? 2 * sectionRadius(placement.section) : Number(placement.bendRadius) || 0;

function sectionProfile(section) {
  const wall = Number(section.wall) || 0;
  if (section.type === 'circle') {
    const r = Number(section.radius);
    if (!(r > 0)) throw new Error('Section radius must be greater than zero.');
    if (wall && wall >= r) throw new Error('Wall thickness must be less than the section radius.');
    return { ...CIRCLE(r), ...(wall > 0 ? { holes: [CIRCLE(tidy(r - wall))] } : {}) };
  }
  const w = Number(section.width),
    h = Number(section.height);
  if (!(w > 0 && h > 0)) throw new Error('Section width and height must be greater than zero.');
  if (wall && (2 * wall >= w || 2 * wall >= h))
    throw new Error('Wall thickness must be less than half the section size.');
  return { ...RECT(w, h), ...(wall > 0 ? { holes: [RECT(tidy(w - 2 * wall), tidy(h - 2 * wall))] } : {}) };
}

// Rebuild the sweep's path and section sketches from the clicked points.
// With fewer than two points the previous feature (if any) is kept, so a
// redrawn path keeps its preview until it has a segment.
function buildSweep(draft, ctx) {
  const p = draft.placement;
  if (p.points.length < 2)
    return {
      ...draft,
      placement: {
        ...p,
        problem: draft.feature
          ? ''
          : p.points.length
            ? 'Click the next corner of the path.'
            : 'Click where the path starts.',
      },
    };
  const ids = { pathId: p.ids?.pathId || uid('sketch'), sectionId: p.ids?.sectionId || uid('sketch'), ...p.ids };
  const local = p.points.map((point) => toPlane(p.frame, point).slice(0, 2));
  let problem = '',
    path;
  try {
    path = polylineWithBends(local, bendRadiusOf(p));
  } catch (error) {
    problem = error.message;
    path = polylineWithBends(local, 0);
  }
  let profile;
  try {
    profile = sectionProfile(p.section);
  } catch (error) {
    problem ||= error.message;
    profile = CIRCLE(DEFAULT_SECTION_RADIUS);
  }
  const fields = sketchFields(draft, ctx, p.frame, true);
  const sketches = [
    sketchEntry(ids.pathId, 'Sweep path', fields, {
      type: 'path',
      start: path.start,
      segments: path.segments,
      closed: false,
    }),
    sketchEntry(ids.sectionId, 'Sweep cross section', { plane: 'XY', origin: [0, 0, 0] }, profile),
  ];
  const feature = {
    ...(draft.feature || { id: uid('feature'), type: 'sweep', operation: 'add' }),
    sketchId: ids.pathId,
    profileId: ids.sectionId,
  };
  return { ...draft, sketches: replaceSketches(draft.sketches, sketches), feature, placement: { ...p, ids, problem } };
}

// Loft: each click adds a circular section on that face, in click order.
function placeLoftSection(draft, info, ctx) {
  const p = draft.placement;
  let next = draft;
  const normal = info.kind === 'ground' ? [0, 0, 1] : info.normal;
  const frame = placeFrame(info.point, normal);
  if (!p.sections.length) {
    const target = clickTarget(draft, info, ctx);
    next = withTarget(
      {
        ...draft,
        placement: {
          ...p,
          target,
          label: info.kind === 'ground' ? 'ground' : faceLabel(normal),
          hostInstanceId: target.instanceId || null,
        },
      },
      target,
      frame,
      ctx,
    );
  } else if (info.kind === 'face' && draft.newInstance?.id === info.instanceId)
    throw new Error('Click a face of an existing part, or the ground.');
  const sections = [...next.placement.sections, { frame, radius: LOFT_RADIUS, id: uid('sketch') }];
  return buildLoft({ ...next, placement: { ...next.placement, sections } }, ctx);
}

function buildLoft(draft, ctx) {
  const p = draft.placement;
  if (p.sections.length < 2)
    return {
      ...draft,
      placement: {
        ...p,
        problem: draft.feature ? '' : 'Click another face for the next section · Enter finishes (2 or more).',
      },
    };
  const sketches = p.sections.map((section, i) =>
    sketchEntry(
      section.id,
      `Loft section ${i + 1}`,
      sketchFields(draft, ctx, section.frame, i === 0),
      CIRCLE(section.radius),
    ),
  );
  const [first, ...rest] = sketches;
  const feature = {
    ...(draft.feature || { id: uid('feature'), type: 'loft', operation: 'add', ruled: false }),
    sketchId: first.id,
    sections: rest.map((s) => s.id),
  };
  return {
    ...draft,
    sketches: replaceSketches(
      draft.sketches.filter((s) => p.sections.some((section) => section.id === s.id)),
      sketches,
    ),
    feature,
    placement: { ...p, problem: '' },
  };
}

// Fillet / Chamfer / Shell: the clicked face picks the reference.
function pickReferenceFace(draft, info, ctx) {
  const p = draft.placement;
  if (info.instanceId !== hostInstanceId(draft, ctx)) throw new Error('Click a face of the selected part.');
  const ops = hostOperations(draft, ctx);
  if (!ops) throw new Error('Rebuild the model first.');
  const kind = draft.feature.type === 'shell' ? 'faces' : 'edges';
  const reference = matchReference(
    draft.references,
    kind,
    unmapPlacement(info.point, ops),
    unmapPlacement(info.normal, ops, true),
  );
  if (!reference) throw new Error(NO_REFERENCE);
  return {
    ...draft,
    feature: {
      ...draft.feature,
      reference: { plane: reference.plane, offset: reference.offset, expectedCount: reference[kind] },
    },
    placement: { ...p, picked: { label: reference.label, outline: info.outlineWorld || [] } },
  };
}

// Mirror / Trim: the clicked face gives the plane. Mirror keeps a named
// plane, so the face must be square to a part axis.
function placePlane(draft, info, ctx) {
  const p = draft.placement;
  if (info.instanceId !== hostInstanceId(draft, ctx)) throw new Error('Click a face of the selected part.');
  const ops = hostOperations(draft, ctx);
  if (!ops) throw new Error('Rebuild the model first.');
  const normal = unmapPlacement(info.normal, ops, true);
  const label = faceLabel(info.normal);
  if (draft.feature.type === 'mirror') {
    const axis = normal.findIndex((v) => Math.abs(Math.abs(v) - 1) < 1e-4);
    if (axis < 0) throw new Error('Mirror needs a face square to X, Y or Z.');
    const placement = { ...p, stage: 'shape', base: [...info.point], normal: [...info.normal], offset: 0, label };
    return applyPlaneOffset(
      { ...draft, feature: { ...draft.feature, plane: ['YZ', 'XZ', 'XY'][axis] }, placement },
      0,
      ctx,
    );
  }
  // Trim: start half-way into the part, so the preview removes something.
  const depth = depthInto(hostLocalBounds(draft, ctx), unmapPlacement(info.point, ops), normal);
  const offset = Number.isFinite(depth) && depth > 0 ? -tidy(depth / 2, 0.1) : 0;
  const placement = { ...p, stage: 'shape', base: [...info.point], normal: [...info.normal], offset, label };
  const next = applyPlaneOffset({ ...draft, placement }, offset, ctx);
  // Keep the half that holds the part's centre; on the plane (a box cut
  // half-way), the half behind the clicked face.
  const bounds = hostLocalBounds(draft, ctx);
  if (!bounds) return next;
  const centre = bounds[0].map((v, i) => (v + bounds[1][i]) / 2);
  const side = dot(sub(centre, next.feature.origin), next.feature.normal) > 1e-6 ? 'positive' : 'negative';
  return { ...next, feature: { ...next.feature, side } };
}

function applyPlaneOffset(draft, offset, ctx) {
  const p = draft.placement;
  const ops = hostOperations(draft, ctx);
  const world = add(p.base, scale(p.normal, offset));
  const origin = tidyPoint(unmapPlacement(world, ops), 1e-4);
  const feature =
    draft.feature.type === 'mirror'
      ? { ...draft.feature, origin }
      : { ...draft.feature, origin, normal: tidyDirection(unmapPlacement(p.normal, ops, true)) };
  return { ...draft, feature, placement: { ...p, offset } };
}

// ---------------------------------------------------------------- stages

// Finish path / sections (Enter, double-click, the panel button); a hole
// row's direction stage takes the default row (needs `ctx`); hardware seats
// in the chosen holes (`pick`: a double-clicked hole centre, chosen first).
export function finishPlacement(draft, ctx = null, pick = null) {
  const p = draft.placement;
  if (p?.tool === 'hardware' && p.stage === 'place') {
    if (!ctx) throw new Error('Choose the holes in the viewport.');
    return finishHardware(pick ? chooseHole(draft, pick, ctx) : draft, ctx);
  }
  if (p?.row?.seed && p.stage === 'place') {
    if (!ctx) throw new Error('Place the last hole in the viewport.');
    return finishRowSeed(draft, ctx);
  }
  if (p?.tool === 'sweep' && p.stage === 'place') {
    if (p.points.length < 2) throw new Error('Click at least two points for the path.');
    return { ...draft, placement: { ...p, stage: 'shape' } };
  }
  if (p?.tool === 'loft' && p.stage === 'place') {
    if (p.sections.length < 2) throw new Error('Click at least two faces for the sections.');
    return { ...draft, placement: { ...p, stage: 'shape' } };
  }
  return draft;
}
// The step back Esc takes: drop the last path point / loft section, leave
// the axis pick; null = cancel the operation.
export function stepBack(draft, ctx) {
  const p = draft.placement;
  if (!p) return null;
  if (p.stage === 'axis') return { ...draft, placement: { ...p, stage: 'shape' } };
  if (p.row?.seed && p.stage === 'place') return rowStepBack(draft);
  if (p.tool === 'hardware') return hardwareStepBack(draft);
  if (p.tool === 'sweep' && p.stage === 'place' && p.points.length) {
    const points = p.points.slice(0, -1);
    if (!points.length)
      return { ...draft, placement: { ...p, points, problem: draft.feature ? '' : 'Click where the path starts.' } };
    return buildSweep({ ...draft, placement: { ...p, points } }, ctx);
  }
  if (p.tool === 'loft' && p.stage === 'place' && p.sections.length) {
    const sections = p.sections.slice(0, -1);
    if (!sections.length)
      return {
        ...draft,
        placement: { ...p, sections, problem: draft.feature ? '' : 'Click a face for the first section.' },
      };
    return buildLoft({ ...draft, placement: { ...p, sections } }, ctx);
  }
  return null;
}
// Re-place / Redraw path: back to Place, keeping the feature so its preview
// stays until the new placement replaces it.
export function replacePlacement(draft) {
  const p = draft.placement;
  if (!p) return draft;
  if (p.mode === 'stored' && !p.memberEnd)
    throw new Error('An existing sketch keeps its place; use Edit sketch to move it.');
  // Hardware chooses its holes again (the old result goes at Re-place).
  if (p.tool === 'hardware') return hardwareReplace(draft);
  if (p.memberEnd)
    // The tube-end start, placed anew: a square profile on the next click.
    return {
      ...draft,
      placement: {
        ...p,
        stage: 'place',
        mode: 'placed',
        memberEnd: false,
        inferOperation: true,
        ids: { sketchId: draft.feature.sketchId },
      },
    };
  return {
    ...draft,
    placement: {
      ...p,
      stage: 'place',
      ...(p.tool === 'sweep' ? { points: [] } : {}),
      ...(p.tool === 'loft' ? { sections: [] } : {}),
      ...(p.row ? { row: { count: p.row.count, pitch: p.row.pitch, seed: false } } : {}),
    },
  };
}
export const startAxisPick = (draft) => ({ ...draft, placement: { ...draft.placement, stage: 'axis' } });
// Choosing an Operation in the panel stops the drag-direction inference.
export const stopInference = (draft) =>
  draft.placement ? { ...draft, placement: { ...draft.placement, inferOperation: false } } : draft;

// Sweep panel options: section type and size, wall, bend radius (null = 2 × r).
export function changeSweepOptions(draft, patch, ctx) {
  const p = draft.placement;
  const next = {
    ...p,
    ...(patch.section ? { section: { ...p.section, ...patch.section } } : {}),
    ...('bendRadius' in patch ? { bendRadius: patch.bendRadius } : {}),
  };
  return buildSweep({ ...draft, placement: next }, ctx);
}

// ---------------------------------------------------------------- drags

// The extrude state for a signed distance along the face normal (spec 4.1):
// outward adds, into an existing part cuts while inference is on, past the
// part's far side is Through all (cuts only).
//   inference: { active, existing, operation, depth }
export function distanceState(inference, value) {
  const into = value < 0;
  let operation = inference.operation || 'add';
  if (inference.active && inference.existing) operation = into ? 'cut' : 'add';
  const cut = operation === 'cut';
  const depth = Number(inference.depth);
  const throughAll = cut && into && Number.isFinite(depth) && -value > depth + 1e-6;
  return { length: Math.max(MIN_LENGTH, tidy(Math.abs(value))), reverse: into, operation, cut, throughAll };
}

// A grip drag: the size it sets from a world point on the handle's plane.
// Rectangles stay centred (width = 2|du|, height = 2|dv|); circles take the
// diameter, snapped (the HUD shows Ø).
export function gripValue(handle, point, { snap = 0, free = false } = {}) {
  const local = toPlane(handle.frame, point);
  const du = local[0] - handle.centre2[0],
    dv = local[1] - handle.centre2[1];
  if (handle.mode === 'rect')
    return {
      width: Math.max(MIN_LENGTH, snapValue(2 * Math.abs(du), snap, free)),
      height: Math.max(MIN_LENGTH, snapValue(2 * Math.abs(dv), snap, free)),
    };
  return { radius: Math.max(MIN_LENGTH / 2, snapValue(2 * Math.hypot(du, dv), snap, free) / 2) };
}

// A completed drag ({ id, value, from }) as a draft patch.
export function applyPlacementDrag(draft, change, ctx) {
  const { id, value, from } = change;
  const p = draft.placement;
  if (!p) throw new Error('This operation has no handles.');
  if (ownsTool(p.tool)) return applyCutDrag(draft, change, ctx);
  if (id === 'distance') {
    const view = placementView(draft, ctx);
    const state = distanceState(view.inference, clampMagnitude(value, MIN_LENGTH));
    const feature = { ...draft.feature, length: state.length, reverse: state.reverse, operation: state.operation };
    if (state.operation === 'cut') feature.throughAll = state.throughAll;
    else delete feature.throughAll;
    return { ...draft, feature };
  }
  if (id === 'slide') {
    const delta = sub(value, from);
    if (p.mode === 'placed') {
      const frame = { ...p.frame, origin: tidyPoint(add(p.frame.origin, delta), 1e-6) };
      return buildProfile({ ...draft, placement: { ...p, frame } }, ctx);
    }
    const sketch = sketchOf(draft, ctx, draft.feature.sketchId);
    const ops = hostOperations(draft, ctx);
    const local = ops ? unmapPlacement(delta, ops, true) : delta;
    if (!(sketch.origin || [0, 0, 0]).every((v) => typeof v === 'number'))
      throw new Error('The sketch origin uses parameters; edit it in the fields.');
    const origin = tidyPoint(add(sketch.origin || [0, 0, 0], local), 1e-6);
    return { ...draft, sketches: replaceSketches(draft.sketches, [{ ...sketch, origin }]) };
  }
  if (id === 'corner' || id === 'radius') {
    const sketch = sketchOf(draft, ctx, draft.feature.sketchId);
    const centre = profileCentre(sketch.profile, ctx.parameters);
    const profile =
      sketch.profile.type === 'circle'
        ? { ...sketch.profile, radius: tidy(value.radius) }
        : { ...sketch.profile, ...RECT(tidy(value.width), tidy(value.height), centre) };
    const next = { ...draft, sketches: replaceSketches(draft.sketches, [{ ...sketch, profile }]) };
    return p.mode === 'placed' && p.tool === 'revolve' ? buildProfile(next, ctx) : next;
  }
  if (id === 'section') {
    const radius = tidy(value.radius);
    return buildSweep({ ...draft, placement: { ...p, section: { ...p.section, type: 'circle', radius } } }, ctx);
  }
  if (id === 'loft-radius') {
    const sections = p.sections.map((s, i) => (i === p.sections.length - 1 ? { ...s, radius: tidy(value.radius) } : s));
    return buildLoft({ ...draft, placement: { ...p, sections } }, ctx);
  }
  if (id === 'plane') {
    if (!p.base) {
      // An edited feature: its stored plane is the base.
      const view = placementView(draft, ctx);
      const handle = view.handles.find((h) => h.id === 'plane');
      return applyPlaneOffset(
        { ...draft, placement: { ...p, base: handle.origin, normal: handle.direction } },
        tidy(value),
        ctx,
      );
    }
    return applyPlaneOffset(draft, tidy(value), ctx);
  }
  if (id === 'step') {
    const view = placementView(draft, ctx);
    const handle = view.handles.find((h) => h.id === 'step');
    const ops = hostOperations(draft, ctx);
    const direction = ops ? unmapPlacement(handle.direction, ops, true) : handle.direction;
    return { ...draft, feature: { ...draft.feature, step: direction.map((v) => tidy(v * value)) } };
  }
  if (id === 'tool')
    return { ...draft, feature: { ...draft.feature, position: value.position, rotation: value.rotation } };
  throw new Error(`Unknown handle: ${id}`);
}

// The Phase A sketch flow: a distance drag as new sketch-operation settings.
export function sketchFlowDistance(draft, value, ctx) {
  const settings = draft.sketchFlow;
  const view = placementView(draft, ctx);
  const state = distanceState(view.inference, clampMagnitude(value, MIN_LENGTH));
  const next = { ...settings, distance: state.length, reverse: state.reverse };
  if (view.inference.active) {
    const support = view.inference.supportId;
    if (state.cut && settings.mode !== 'cut')
      Object.assign(next, { mode: 'cut', target: support, baseTarget: settings.target });
    else if (!state.cut && settings.mode === 'cut')
      Object.assign(next, { mode: 'extrude', target: settings.baseTarget || 'new' });
  }
  if (next.mode === 'cut') next.throughAll = state.throughAll;
  return next;
}

// Boolean tool gizmo: a world move or turn of the tool ghost, expressed in
// the target part's coordinates (kernel transform: X, Y, Z turns about the
// origin, then the position).
export function toolPoseAfterMove(pose, delta, hostOps) {
  const local = unmapPlacement(delta, hostOps, true);
  return {
    position: tidyPoint(add(vector(pose.position || [0, 0, 0]), local), 1e-6),
    rotation: [...(pose.rotation || [0, 0, 0])],
  };
}
export function toolPoseAfterTurn(pose, turn, centre, hostOps) {
  const hostTurn = (() => {
    // The rotation of the host placement, as a quaternion.
    const x = new Vector3(...mapPlacement([1, 0, 0], hostOps, true)),
      y = new Vector3(...mapPlacement([0, 1, 0], hostOps, true)),
      z = new Vector3(...mapPlacement([0, 0, 1], hostOps, true));
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  })();
  const q = new Quaternion(...turn).normalize();
  const local = hostTurn.clone().invert().multiply(q).multiply(hostTurn);
  const c = new Vector3(...unmapPlacement(centre, hostOps));
  const rotation = vector(pose.rotation || [0, 0, 0]).map(MathUtils.degToRad);
  const orientation = local.clone().multiply(new Quaternion().setFromEuler(new Euler(...rotation, 'ZYX')));
  const position = new Vector3(...vector(pose.position || [0, 0, 0])).sub(c).applyQuaternion(local).add(c);
  return { position: tidyPoint(position.toArray(), 1e-6), rotation: cleanRotation(orientation) };
}

// ---------------------------------------------------------------- the view

// Nearest outline edge of a clicked face to the click, as a world axis; for
// the ground (or a face without outline) a line GROUND_AXIS_OFFSET behind it.
export function revolveAxisFor(info, frame) {
  if (info.kind === 'ground' || !info.outline?.length || !info.faceFrame) {
    const a = sub(info.point, scale(frame.y, GROUND_AXIS_OFFSET));
    return { a, b: add(a, frame.x) };
  }
  const local = toPlane(info.faceFrame, info.point).slice(0, 2);
  let best = null;
  for (const [s0, s1] of info.outline) {
    const d = distance2ToSegment(local, s0, s1);
    if (!best || d < best.d) best = { d, s0, s1 };
  }
  return { a: toWorld(info.faceFrame, best.s0), b: toWorld(info.faceFrame, best.s1) };
}

const HINTS = {
  extrude: {
    place:
      'Extrude: click a flat face to place the profile · corners, midpoints, face centres and marks snap · click empty space for a new part on the ground · Esc cancels',
    shape:
      'Extrude: drag the arrow to set the length (into the part cuts) · the square moves the profile, the corner grip resizes it · type a value + Enter while dragging · Enter applies · Esc cancels',
  },
  sketch: {
    shape:
      'Extrude: drag the arrow to set the distance (into the part cuts) · type a value + Enter while dragging · Enter applies · Esc cancels',
  },
  revolve: {
    place:
      'Revolve: click a flat face to place the profile · it turns about the face edge nearest the click · click empty space for a new part · Esc cancels',
    shape:
      'Revolve: the square moves the profile, the corner grip resizes it · Change axis picks another edge · Enter applies · Esc cancels',
    axis: 'Revolve: click an edge to change the axis · it must lie in the profile plane · Esc keeps the current axis',
  },
  sweep: {
    place:
      'Sweep: click where the path starts · then click each corner · double-click, Enter or Finish path ends it · Shift locks horizontal/vertical · Esc removes the last point',
    shape:
      'Sweep: drag the grip to set the section size · Bend radius rounds the corners · Enter applies · Esc cancels',
  },
  loft: {
    place: 'Loft: click a face for each section, in order · Enter finishes (2 or more) · Esc removes the last section',
    shape: 'Loft: drag the grip to size the last section · Enter applies · Esc cancels',
  },
  mirror: {
    place: 'Mirror: click a flat face of the part to mirror across its plane · Esc cancels',
    shape:
      'Mirror: drag the arrow to move the plane along its normal · Re-place picks another face · Enter applies · Esc cancels',
  },
  trim: {
    place: 'Trim: click a flat face of the part to set the cut plane · Esc cancels',
    shape:
      'Trim: drag the arrow to move the plane · Keep other side flips the retained half · Enter applies · Esc cancels',
  },
  pattern: { shape: 'Pattern: drag the arrow to set the spacing · Enter applies · Esc cancels' },
};
const referenceHint = (tool) =>
  `${title(tool)}: click a flat face of the part to ${tool === 'shell' ? 'open (remove) it' : tool === 'chamfer' ? 'bevel all its edges' : 'round all its edges'} · Enter applies · Esc cancels`;
const toolHint = (tool) =>
  `${title(tool)}: drag the tool ghost with the gizmo (M move, R rotate) · faces snap to the part · Enter applies · Esc cancels`;

// Ghost geometry is described in "shapes" the viewport turns into world
// line segments (ghostSegments): prism, flat, tube, sections, plane, outline.
const rectLoop = (w, h, c = [0, 0]) => [
  [c[0] - w / 2, c[1] - h / 2],
  [c[0] + w / 2, c[1] - h / 2],
  [c[0] + w / 2, c[1] + h / 2],
  [c[0] - w / 2, c[1] + h / 2],
];
const circleLoop = (r, c = [0, 0], n = 48) =>
  Array.from({ length: n }, (_, i) => [
    c[0] + r * Math.cos((i / n) * Math.PI * 2),
    c[1] + r * Math.sin((i / n) * Math.PI * 2),
  ]);

// The plane square filling a part's world box, on the plane through `origin`.
export function planeSquare(bounds, origin, normal, margin = 0.08) {
  const frame = placeFrame(origin, normal);
  let us = [0],
    vs = [0];
  if (bounds) {
    us = [];
    vs = [];
    for (const x of [bounds[0][0], bounds[1][0]])
      for (const y of [bounds[0][1], bounds[1][1]])
        for (const z of [bounds[0][2], bounds[1][2]]) {
          const q = toPlane(frame, [x, y, z]);
          us.push(q[0]);
          vs.push(q[1]);
        }
  }
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const mu = Math.max(10, (u1 - u0) * margin),
    mv = Math.max(10, (v1 - v0) * margin);
  return [
    [u0 - mu, v0 - mv],
    [u1 + mu, v0 - mv],
    [u1 + mu, v1 + mv],
    [u0 - mu, v1 + mv],
  ].map((q) => toWorld(frame, q));
}
// Whether a plane (world origin, normal) misses a world box.
export function planeMissesBox(bounds, origin, normal) {
  if (!bounds) return false;
  let below = false,
    above = false;
  for (const x of [bounds[0][0], bounds[1][0]])
    for (const y of [bounds[0][1], bounds[1][1]])
      for (const z of [bounds[0][2], bounds[1][2]]) {
        const d = dot(sub([x, y, z], origin), normal);
        if (d < -1e-6) below = true;
        if (d > 1e-6) above = true;
      }
  return !(below && above);
}

function prismParts(ctx, frame, profile, value, inference, extra = {}) {
  const parameters = ctx.parameters;
  const centre2 = profileCentre(profile, parameters);
  const centre = toWorld(frame, centre2);
  const handles = [
    {
      id: 'distance',
      kind: 'arrow',
      origin: centre,
      direction: [...frame.normal],
      value,
      minAbs: MIN_LENGTH,
      typing: true,
      expression: extra.expression || null,
    },
  ];
  if (extra.slide !== false)
    handles.push({
      id: 'slide',
      kind: 'square',
      at: centre,
      frame: { ...frame, origin: centre },
      grid: extra.grid || frame,
    });
  if (extra.grips !== false) {
    if (profile.type === 'rectangle') {
      const w = num(profile.width, parameters, 1),
        h = num(profile.height, parameters, 1);
      handles.push({
        id: 'corner',
        kind: 'grip',
        mode: 'rect',
        at: toWorld(frame, [centre2[0] + w / 2, centre2[1] + h / 2]),
        frame,
        centre2,
        expression: [profile.width, profile.height].find((v) => typeof v === 'string') || null,
      });
    } else if (profile.type === 'circle') {
      const r = num(profile.radius, parameters, 1);
      handles.push({
        id: 'radius',
        kind: 'grip',
        mode: 'circle',
        at: toWorld(frame, [centre2[0] + r, centre2[1]]),
        frame,
        centre2,
        expression: typeof profile.radius === 'string' ? profile.radius : null,
      });
    }
  }
  const state = distanceState(inference, value);
  return {
    shape: { kind: 'prism', frame, loops: profileLoops(profile, parameters), value },
    handles,
    inference,
    cut: state.cut,
    throughAll: Boolean(extra.throughAll ?? state.throughAll),
  };
}

// The view the viewport draws for a draft (null without a placement):
//   { tool, stage, pick, hint, allowGround, pickInstanceId, names, place,
//     path, shape, handles, extras, cut, inference, toolGizmo, problem }
export function placementView(draft, ctx) {
  const p = draft.placement;
  if (!p) return null;
  const tool = p.tool;
  const parameters = ctx.parameters || {};
  const names = Object.fromEntries(
    ctx.model.instances.map((i) => [
      i.id,
      i.name || ctx.model.parts.find((part) => part.id === i.partId)?.name || 'Part',
    ]),
  );
  const host = hostInstanceId(draft, ctx);
  const view = {
    tool,
    title: title(tool),
    stage: p.stage,
    mode: p.mode,
    pick: pickOf(p),
    hint: HINTS[tool]?.[p.stage] || '',
    allowGround: ['extrude', 'revolve', 'sweep', 'loft'].includes(tool),
    pickInstanceId: ['reference', 'plane'].includes(p.mode) ? host : null,
    hostInstanceId: host,
    names,
    place: {
      size: p.size || DEFAULT_SQUARE,
      radius: tool === 'loft' ? LOFT_RADIUS : tool === 'sweep' ? sectionRadius(p.section) : null,
    },
    path: null,
    shape: null,
    handles: [],
    extras: [],
    cut: false,
    throughAll: false,
    inference: null,
    toolGizmo: null,
    problem: p.problem || '',
  };
  if (p.mode === 'reference') view.hint = referenceHint(tool);
  if (p.mode === 'tool') view.hint = toolHint(tool);
  if (ownsTool(tool)) return cutPlacementView(draft, ctx, view);
  const f = draft.feature;
  if (p.mode === 'sketch') {
    const settings = draft.sketchFlow;
    const source = ctx.model.sketches.find((s) => s.id === settings.sketchId);
    if (!source) return view;
    const { frame } = sketchWorldFrame(ctx.model, ctx.snapshot, source);
    const supportId =
      source.support?.type === 'face' && ctx.model.instances.some((i) => i.id === source.support.instanceId)
        ? source.support.instanceId
        : null;
    const depthTarget = settings.mode === 'cut' ? settings.target : supportId;
    const placement = ctx.snapshot?.instances.find((i) => i.id === depthTarget)?.placement;
    const partId = ctx.model.instances.find((i) => i.id === depthTarget)?.partId;
    const bounds = ctx.snapshot?.parts?.find((part) => part.id === partId)?.bounds;
    const depth =
      placement && bounds
        ? depthInto(bounds, unmapPlacement(frame.origin, placement), unmapPlacement(frame.normal, placement, true))
        : Infinity;
    const inference = {
      active: settings.inferOperation !== false && Boolean(supportId),
      existing: Boolean(supportId) || settings.target !== 'new',
      operation: settings.mode === 'cut' ? 'cut' : 'add',
      depth,
      supportId,
    };
    const distance = num(settings.distance, parameters, DEFAULT_LENGTH);
    const value = settings.reverse ? -distance : distance;
    Object.assign(
      view,
      prismParts(ctx, frame, source.profile, value, inference, {
        slide: false,
        grips: false,
        throughAll: settings.mode === 'cut' && settings.throughAll,
      }),
    );
    return view;
  }
  if (tool === 'extrude' && p.stage !== 'place' && f) {
    const sketch = sketchOf(draft, ctx, f.sketchId);
    const ops = hostOperations(draft, ctx);
    if (!sketch) return view;
    const local = sketchLocalFrame(sketch, parameters);
    const frame = ops ? mapFrame(local, ops) : local;
    const length = num(f.length, parameters, DEFAULT_LENGTH);
    const inference = {
      active: Boolean(p.inferOperation) && !draft.newPart,
      existing: !draft.newPart,
      operation: f.operation || 'add',
      depth: frameDepth(draft, ctx, frame),
    };
    let slide = true,
      grips = !sketch.profile?.holes?.length;
    if (p.mode === 'stored') {
      const shared = ctx.model.parts.some((part) =>
        part.features.some(
          (other) =>
            other.id !== f.id &&
            (other.sketchId === sketch.id || other.profileId === sketch.id || other.sections?.includes(sketch.id)),
        ),
      );
      const plain = (sketch.origin || [0, 0, 0]).every((v) => typeof v === 'number');
      slide = !shared && plain;
      // A shared sketch keeps its size too (it would change the other feature).
      grips &&= !shared;
      if (!slide)
        view.hint += shared
          ? ' · the profile sketch is shared with another feature, so it cannot be moved here'
          : ' · the sketch origin uses parameters; move it in the fields';
    }
    Object.assign(
      view,
      prismParts(ctx, frame, sketch.profile, f.reverse ? -length : length, inference, {
        slide,
        grips,
        grid: p.grid,
        expression: typeof f.length === 'string' ? f.length : null,
        throughAll: f.operation === 'cut' && Boolean(f.throughAll),
      }),
    );
    if (f.operation === 'cut') view.cut = true;
    return view;
  }
  if (tool === 'revolve' && p.stage !== 'place' && f) {
    const sketch = sketchOf(draft, ctx, f.sketchId);
    if (!sketch || !p.frame) return view;
    const parts = prismParts(ctx, p.frame, sketch.profile, 0, { operation: f.operation }, { grid: p.grid });
    view.shape = { kind: 'flat', frame: p.frame, loops: parts.shape.loops };
    view.handles = p.stage === 'axis' ? [] : parts.handles.filter((h) => h.id !== 'distance');
    view.extras.push({ kind: 'axis', a: p.axis.a, b: p.axis.b });
    view.cut = f.operation === 'cut';
    return view;
  }
  if (tool === 'sweep') {
    const radius = sectionRadius(p.section);
    if (p.stage === 'place') {
      if (p.points.length) view.path = { frame: p.frame, points: p.points, radius };
      return view;
    }
    const sketch = sketchOf(draft, ctx, f?.sketchId);
    if (!sketch || !p.frame) return view;
    const path = (profileLoops(sketch.profile, parameters)[0] || []).map((q) => toWorld(p.frame, q));
    view.shape = { kind: 'tube', frame: p.frame, path, radius };
    if (p.section.type === 'circle' && path.length > 1) {
      const start = path[0];
      const tangent = normalize(sub(path[1], start));
      const frame = makeFrame(start, p.frame.normal, tangent);
      view.handles.push({
        id: 'section',
        kind: 'grip',
        mode: 'circle',
        at: add(start, scale(p.frame.normal, radius)),
        frame,
        centre2: [0, 0],
      });
    }
    view.cut = f.operation === 'cut';
    return view;
  }
  if (tool === 'loft') {
    if (p.sections.length)
      view.shape = { kind: 'sections', circles: p.sections.map((s) => ({ frame: s.frame, radius: s.radius })) };
    if (p.stage === 'shape' && p.sections.length) {
      const last = p.sections.at(-1);
      view.handles.push({
        id: 'loft-radius',
        kind: 'grip',
        mode: 'circle',
        at: toWorld(last.frame, [last.radius, 0]),
        frame: last.frame,
        centre2: [0, 0],
      });
    }
    view.cut = f?.operation === 'cut';
    return view;
  }
  if (p.mode === 'reference') {
    if (p.picked?.outline?.length) view.extras.push({ kind: 'outline', segments: p.picked.outline });
    return view;
  }
  if (p.mode === 'plane' && p.stage === 'shape' && f) {
    const ops = hostOperations(draft, ctx);
    if (!ops) return view;
    let base = p.base,
      normal = p.normal,
      value = p.offset || 0;
    if (!base) {
      // An edited feature: the stored plane, offset 0.
      const localNormal =
        f.type === 'mirror'
          ? { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] }[f.plane || 'YZ']
          : vector(f.normal || [0, 0, 1], parameters);
      base = mapPlacement(vector(f.origin || [0, 0, 0], parameters), ops);
      normal = normalize(mapPlacement(localNormal, ops, true));
      value = 0;
    }
    const origin = add(base, scale(normal, value));
    const bounds = hostWorldBounds(draft, ctx);
    view.shape = { kind: 'plane', corners: planeSquare(bounds, origin, normal), normal };
    view.handles.push({ id: 'plane', kind: 'arrow', origin: base, direction: [...normal], value, typing: true });
    if (f.type === 'trim' && planeMissesBox(bounds, origin, normal)) view.hint += ' · The plane misses the part';
    return view;
  }
  if (p.mode === 'step' && f && !f.circular) {
    const bounds = hostWorldBounds(draft, ctx);
    const ops = hostOperations(draft, ctx);
    if (!bounds || !ops) return view;
    const step = vector(f.step || [0, 0, 0], parameters);
    const size = len(step);
    const direction = normalize(mapPlacement(size > 1e-9 ? step : [1, 0, 0], ops, true));
    const centre = bounds[0].map((v, i) => (v + bounds[1][i]) / 2);
    view.handles.push({
      id: 'step',
      kind: 'arrow',
      origin: centre,
      direction,
      value: size,
      typing: true,
      expression: (f.step || []).some((v) => typeof v === 'string') ? 'the step' : null,
    });
    return view;
  }
  if (p.mode === 'tool' && f) {
    const ops = hostOperations(draft, ctx);
    const toolPart = ctx.snapshot?.parts?.find((part) => part.id === f.toolPartId);
    if (!ops || !f.toolPartId) return view;
    view.toolGizmo = {
      partId: f.toolPartId,
      position: vector(f.position || [0, 0, 0], parameters),
      rotation: vector(f.rotation || [0, 0, 0], parameters),
      bounds: toolPart?.bounds || null,
      hostOps: ops,
      hostInstanceId: host,
      hostBounds: hostWorldBounds(draft, ctx),
      expression: [...(f.position || []), ...(f.rotation || [])].some((v) => typeof v === 'string'),
    };
    view.cut = f.type === 'subtract';
    return view;
  }
  return view;
}

// The ghost while hovering in the Place stage. hover: the viewport's click
// info for the point under the cursor (null = nothing placeable).
export function hoverShape(view, hover) {
  if (!view || !hover) return null;
  if (ownsTool(view.tool)) return hoverCutShape(view, hover);
  if (view.pick === 'reference' || view.pick === 'plane') {
    if (!hover.outlineWorld?.length) return null;
    return { kind: 'outline', segments: hover.outlineWorld };
  }
  if (!['face', 'section', 'path'].includes(view.pick)) return null;
  if (hover.kind === 'face' && !hover.planar) return null;
  const normal = hover.kind === 'ground' ? [0, 0, 1] : hover.normal;
  const frame = placeFrame(hover.point, normal);
  if (view.tool === 'extrude') {
    const size = defaultSquare(hover.outline);
    return { kind: 'flat', frame, loops: [rectLoop(size, size)] };
  }
  if (view.tool === 'revolve') {
    const axis = revolveAxisFor(hover, frame);
    const rframe = revolveFrame(hover.point, normal, axis);
    return { kind: 'flat', frame: rframe, loops: profileLoops(fitRevolveProfile(REVOLVE_PROFILE, rframe, axis)), axis };
  }
  const radius = view.place.radius || LOFT_RADIUS;
  return { kind: 'flat', frame, loops: [circleLoop(radius)] };
}

// A view with a handle's live drag value applied (the ghost follows every
// frame; the draft changes once, on release). `meta`: the drag's snap
// { snapKind, step, free } (a hole row's end square rounds with it).
export function dragView(view, id, value, meta = {}) {
  if (view.cutTool && id === 'distance') return cutDragView(view, value);
  if (view.row && (id === 'row-end' || id === 'radius')) return rowDragView(view, id, value, meta);
  const original = view.handles.find((h) => h.id === id);
  const handles = view.handles.map((h) => ({ ...h }));
  const handle = handles.find((h) => h.id === id);
  const next = { ...view, handles, shape: view.shape ? { ...view.shape } : null };
  if (!handle) return next;
  if (handle.kind === 'arrow') {
    handle.value = value;
    if (id === 'distance' && next.shape) {
      next.shape.value = value;
      const state = distanceState(view.inference, value);
      next.cut = state.cut;
      next.throughAll = state.throughAll;
    } else if (id === 'plane' && view.shape?.kind === 'plane') {
      const shift = scale(handle.direction, value - (original.value || 0));
      next.shape.corners = view.shape.corners.map((c) => add(c, shift));
    }
    return next;
  }
  if (id === 'slide') {
    const delta = sub(value, original.at);
    next.handles = handles.map((h) => ({
      ...h,
      ...(h.at ? { at: add(h.at, delta) } : {}),
      ...(h.origin ? { origin: add(h.origin, delta) } : {}),
      ...(h.frame && h.id !== 'slide' ? { frame: { ...h.frame, origin: add(h.frame.origin, delta) } } : {}),
      ...(h.id === 'slide' ? { frame: { ...h.frame, origin: add(h.frame.origin, delta) } } : {}),
    }));
    if (next.shape?.frame) next.shape.frame = { ...view.shape.frame, origin: add(view.shape.frame.origin, delta) };
    if (view.row && view.extras?.length) next.extras = shiftRowExtras(view.extras, delta);
    return next;
  }
  if ((id === 'corner' || id === 'radius') && next.shape) {
    const c = handle.centre2;
    if (value.width != null) {
      next.shape.loops = [rectLoop(value.width, value.height, c)];
      handle.at = toWorld(handle.frame, [c[0] + value.width / 2, c[1] + value.height / 2]);
    } else {
      next.shape.loops = [circleLoop(value.radius, c)];
      handle.at = toWorld(handle.frame, [c[0] + value.radius, c[1]]);
    }
    return next;
  }
  if (id === 'section' && next.shape) {
    next.shape.radius = value.radius;
    handle.at = add(handle.frame.origin, scale(handle.frame.x, value.radius));
    return next;
  }
  if (id === 'loft-radius' && next.shape) {
    next.shape.circles = view.shape.circles.map((c, i, all) =>
      i === all.length - 1 ? { ...c, radius: value.radius } : c,
    );
    handle.at = toWorld(handle.frame, [value.radius, 0]);
    return next;
  }
  return next;
}

const escapeHtml = (text) =>
  String(text).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

// The cursor readout during a handle drag: { text, html }.
export function dragReadout(view, id, value, meta = {}) {
  const handle = view.handles.find((h) => h.id === id);
  let text;
  if (view.cutTool && id === 'distance') text = cutDepthText(view, value);
  else if (id === 'row-end') text = rowReadout(view, value, meta);
  else if (id === 'distance') {
    const state = distanceState(view.inference, value);
    text = state.throughAll
      ? 'Cut through all'
      : `${state.cut ? 'Cut ' : ''}${fmt(state.length)} mm${state.reverse && !state.cut ? ' · flipped' : ''}`;
  } else if (id === 'slide') {
    const q = toPlane(handle.grid || handle.frame, value);
    text = `at (${fmt(q[0])}, ${fmt(q[1])}) mm`;
  } else if (id === 'corner') text = `${fmt(value.width)} × ${fmt(value.height)} mm`;
  else if (['radius', 'section', 'loft-radius'].includes(id)) text = `Ø ${fmt(2 * value.radius)} mm`;
  else if (id === 'plane') text = `${fmt(value)} mm from the face`;
  else if (id === 'step') text = `${fmt(value)} mm spacing`;
  else text = String(value);
  const note = handle?.expression ? ` · replaces ${handle.expression}` : '';
  return {
    text: text + note,
    html: `<span class="cad-gizmo-value">${escapeHtml(text)}</span>${escapeHtml(note)}`,
  };
}

// ---------------------------------------------------------------- segments

const loopSegments = (loop, map, closed = true) => {
  const out = [];
  for (let i = 0; i + 1 < loop.length; i++) out.push([map(loop[i]), map(loop[i + 1])]);
  if (closed && loop.length > 2) out.push([map(loop.at(-1)), map(loop[0])]);
  return out;
};

// A dashed axis line, overshooting the picked edge on both sides.
export function axisSegments(axis, dashes = 24) {
  const d = sub(axis.b, axis.a);
  const a = sub(axis.a, scale(d, 0.25)),
    span = scale(d, 1.5);
  const out = [];
  for (let i = 0; i < dashes; i += 2)
    out.push([add(a, scale(span, i / dashes)), add(a, scale(span, (i + 1) / dashes))]);
  return out;
}

// World line segments ([a, b] pairs) for a ghost shape.
export function ghostSegments(shape) {
  if (!shape) return [];
  if (shape.kind === 'outline') return shape.segments.map(([a, b]) => [[...a], [...b]]);
  if (shape.kind === 'flat' || shape.kind === 'prism') {
    const { frame } = shape;
    const out = [];
    const value = shape.kind === 'prism' ? shape.value || 0 : 0;
    for (const loop of shape.loops) {
      out.push(...loopSegments(loop, (q) => toWorld(frame, q)));
      if (shape.kind === 'prism' && value) {
        out.push(...loopSegments(loop, (q) => toWorld(frame, q, value)));
        const step = Math.max(1, Math.floor(loop.length / 8));
        for (let i = 0; i < loop.length; i += step) out.push([toWorld(frame, loop[i]), toWorld(frame, loop[i], value)]);
      }
    }
    if (shape.axis) out.push(...axisSegments(shape.axis));
    return out;
  }
  if (shape.kind === 'tube') {
    const { radius, frame } = shape;
    // Consecutive duplicates (a rubber band on the last point) have no direction.
    const path = shape.path.filter((q, i, all) => i === 0 || len(sub(q, all[i - 1])) > 1e-9);
    const out = [];
    if (path.length < 2) return out;
    for (const side of [1, -1]) {
      const offset = path.map((q, i) => {
        const t = normalize(sub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]));
        return add(q, scale(cross(frame.normal, t), side * radius));
      });
      out.push(...loopSegments(offset, (q) => q, false));
      out.push(
        ...loopSegments(
          path.map((q) => add(q, scale(frame.normal, side * radius))),
          (q) => q,
          false,
        ),
      );
    }
    for (const [at, next] of [
      [path[0], path[1]],
      [path.at(-1), path.at(-2)],
    ]) {
      const section = makeFrame(at, frame.normal, normalize(sub(next, at)));
      out.push(...loopSegments(circleLoop(radius, [0, 0], 24), (q) => toWorld(section, q)));
    }
    return out;
  }
  if (shape.kind === 'sections') {
    const out = [];
    shape.circles.forEach((c, i) => {
      out.push(...loopSegments(circleLoop(c.radius, [0, 0], 32), (q) => toWorld(c.frame, q)));
      if (i) out.push([shape.circles[i - 1].frame.origin, c.frame.origin]);
    });
    return out;
  }
  // Hardware's chosen holes (Phase M): circles only, never linked.
  if (shape.kind === 'rings')
    return shape.circles.flatMap((c) => loopSegments(circleLoop(c.radius, [0, 0], 32), (q) => toWorld(c.frame, q)));
  if (shape.kind === 'plane') return loopSegments(shape.corners, (q) => q);
  return [];
}

// ---------------------------------------------------------------- panel line

// The read-only placement line at the top of the operation panel.
export function placementSummary(draft, ctx) {
  const p = draft.placement;
  if (!p) return '';
  if (ownsTool(p.tool)) return cutSummary(draft, ctx);
  const parameters = ctx.parameters || {};
  const on = p.target
    ? p.target.new
      ? `New part ${draft.newPart?.name || ''} on the ground`.replace('  ', ' ')
      : `On ${p.target.name} · ${p.label}`
    : '';
  if (p.mode === 'sketch') {
    const s = draft.sketchFlow;
    const source = ctx.model.sketches.find((x) => x.id === s.sketchId);
    const amount = s.mode === 'cut' && s.throughAll ? 'through all' : `${fmt(num(s.distance, parameters))} mm`;
    return `${source?.name || 'Sketch'} · ${s.mode === 'cut' ? 'cut' : 'extrude'} ${amount}${s.reverse && s.mode !== 'cut' ? ' · flipped' : ''}`;
  }
  if (p.tool === 'sweep') {
    if (!p.points.length) return 'Path: click where it starts';
    const local = p.points.map((q) => toPlane(p.frame, q));
    let total = 0;
    for (let i = 1; i < local.length; i++)
      total += Math.hypot(local[i][0] - local[i - 1][0], local[i][1] - local[i - 1][1]);
    const n = p.points.length - 1;
    return `Path: ${n} segment${n === 1 ? '' : 's'}, ${fmt(total)} mm · ${on.replace(/^On /, 'on ')}`;
  }
  if (p.tool === 'loft') {
    if (!p.sections.length) return 'Sections: click a face for the first';
    return `${p.sections.length} section${p.sections.length === 1 ? '' : 's'} · ${on}`;
  }
  if (p.mode === 'reference')
    return p.picked
      ? `Picked ${p.picked.label} in the viewport`
      : 'Click a face in the viewport, or choose a reference below';
  if (p.mode === 'plane')
    return p.stage === 'place'
      ? 'Click a face of the part for the plane'
      : `Plane on the ${p.label || 'stored plane'} · offset ${fmt(p.offset || 0)} mm`;
  if (p.mode === 'tool') return 'Drag the tool ghost in the viewport (M move, R rotate)';
  if (p.mode === 'step') return 'Drag the arrow in the viewport to set the spacing';
  if (p.stage === 'place') return '';
  const sketch = sketchOf(draft, ctx, draft.feature?.sketchId);
  if (!sketch) return on;
  const pr = sketch.profile;
  const size =
    pr.type === 'rectangle'
      ? `${fmt(num(pr.width, parameters))} × ${fmt(num(pr.height, parameters))} mm`
      : pr.type === 'circle'
        ? `Ø ${fmt(2 * num(pr.radius, parameters))} mm`
        : pr.type;
  // A copied tube end keeps its inner openings: say so here, since the stored
  // sketch fields sit under the collapsed Exact placement block.
  const hollow = pr.holes?.length
    ? ` · hollow section kept (${pr.holes.length} inner opening${pr.holes.length === 1 ? '' : 's'})`
    : '';
  if (p.mode === 'stored') return `${sketch.name} · profile ${size}${hollow}`;
  if (p.tool === 'revolve')
    return `${on} · profile ${size} · axis along ${directionLabel(normalize(sub(p.axis.b, p.axis.a)).map((v) => tidy(v)))}`;
  const at = toPlane(p.grid || GROUND_FRAME, p.frame.origin);
  return `${on} · profile ${size} at (${fmt(at[0])}, ${fmt(at[1])}) · along ${directionLabel(p.frame.normal)}`;
}

// The sketch the panel's primary size fields edit (placed Extrude / Revolve).
export function placedSketch(draft) {
  const p = draft.placement;
  if (!p || p.mode !== 'placed' || !draft.feature?.sketchId || !['extrude', 'revolve'].includes(p.tool)) return null;
  return draft.sketches.find((s) => s.id === draft.feature.sketchId) || null;
}
