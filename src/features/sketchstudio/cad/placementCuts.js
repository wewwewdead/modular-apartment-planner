// Direct placement for cuts, hardware and Transform (Phase J,
// docs/sketch-studio-cut-placement.md). The Phase H stage machine in
// placementTool.js dispatches here for these tools; this module holds their
// rules, all pure:
//
//   Hole / Pocket  Place: a click on a flat face stores positionedCut
//                  coordinates (part mm, direction into the material); a click
//                  on a round member's curved face stores a member placement
//                  that drills radially. Shape: the depth arrow (past the far
//                  face = through all), the slide square and the size grip.
//   Hardware       Place: a click seats a new hardware part on a face (its
//                  seating plane, part Z = 0, on the face) or stands it on the
//                  ground. Clicks on existing hole centres choose the holes it
//                  goes in, and Enter seats one part in all of them, each
//                  concentric with its hole (Phase M, placementHardware.js).
//                  Shape: the slide square (a free seat only).
//   Transform      Shape: the boolean tool gizmo on a ghost of the part itself.
//
// Nothing new is persisted: features keep their existing fields, and the
// draft's `placement` record is draft-only (Phase H rule).
import { SCREW_KINDS, createHardware, hardwareDimensions } from './hardware.js';
import { numeric, uid, vector } from './model.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import {
  CUT_SIDES,
  createCutFeature,
  cutWidthDirection,
  memberFrame,
  memberPlacementFromPoint,
  positionedCut,
  resolveCutPlacement,
} from './cutPlacement.js';
import { cross, dot, frameToInstance, normalize, tidyPoint, toPlane, toWorld } from './sketchPlane.js';
import {
  GROUND_FRAME,
  MIN_LENGTH,
  depthInto,
  faceLabel,
  hostOperations,
  placeFrame,
  tidyDirection,
} from './placementTool.js';
// Phase K: hole rows (docs/sketch-studio-hole-row.md), a behaviour of the Hole tool.
import {
  ROW_CURVED,
  ROW_HINTS,
  applyRowDrag,
  placeRowEnd,
  rowDirectionText,
  rowPlacement,
  rowSeedView,
  rowSummary,
  rowView,
  seedRow,
} from './placementRows.js';
// Phase M: hardware in chosen holes (docs/sketch-studio-hardware-holes.md).
import {
  HOLES_PENDING,
  chosenHoles,
  chosenView,
  hardwareName,
  hardwareRadius,
  hardwareSummary,
  picksHole,
  toggleHole,
  toggleRowHoles,
} from './placementHardware.js';

// The tools this module owns.
export const CUT_TOOLS = ['hole', 'pocket'];
const OWNED = [...CUT_TOOLS, 'hardware', 'transform'];
export const ownsTool = (tool) => OWNED.includes(tool);
// A clicked curved face that is not a round member.
export const CUT_CURVED = 'Pick a flat face, or a round tube to drill radially.';
// The depth arrow reads Through all from this close to the far face (mm).
export const THROUGH_TOLERANCE = 0.01;
// A clicked point counts as on a round member's surface within this (mm, or
// 5 % of the radius when larger): the display mesh is faceted.
const SURFACE_TOLERANCE = 0.5;
// Template keys "Apply and place another" carries to the next cut.
const TEMPLATE_KEYS = ['diameter', 'holeSpec', 'shape', 'width', 'height', 'depth', 'throughAll'];
const REFERENCE_BREAKERS = ['transform', 'mirror', 'pattern'];

const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);
const neg = (a) => a.map((v) => (v ? -v : 0));
const tidy = (value, step = 1e-6) => {
  const result = Math.round(value / step) * step;
  const out = Number(result.toFixed(Math.max(0, Math.ceil(-Math.log10(step)))));
  return Object.is(out, -0) || Math.abs(out) < step ? 0 : out;
};
const fmt = (value) => String(Number(Number(value).toFixed(2)));
const num = (value, parameters, fallback = 0) => {
  try {
    return numeric(value, parameters || {});
  } catch {
    return fallback;
  }
};
const rectLoop = (w, h) => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];
const circleLoop = (r, n = 48) =>
  Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)]);
const title = (tool) => tool[0].toUpperCase() + tool.slice(1);
const isSketchPocket = (feature) => feature?.type === 'pocket' && feature.shape !== 'rectangle';

const HINTS = {
  hole: {
    place:
      'Hole: click a flat face to drill there · corners, midpoints, face centres, marks and existing hole centres snap · round tubes drill radially · Esc cancels',
    shape:
      'Hole: drag the arrow for the depth (past the far face = through all) · the square moves it on the face · the grip sets the diameter · type a value + Enter while dragging · Enter applies · Esc cancels',
  },
  pocket: {
    place:
      'Pocket: click a flat face to place the rectangle · corners, midpoints, face centres, marks and existing hole centres snap · round tubes cut radially · Esc cancels',
    shape:
      'Pocket: drag the arrow for the depth (past the far face = through all) · the square moves it on the face · the corner grip sets width and length · type a value + Enter while dragging · Enter applies · Esc cancels',
  },
  // The Place hints (and the seated one) are placementHardware.js's.
  hardware: {
    shape:
      'Hardware: the square slides it on the face · sizes are in the panel · Re-place seats it elsewhere · Enter applies · Esc cancels',
  },
  transform: {
    shape:
      "Transform: drag the part's ghost with the gizmo (M move, R rotate) · faces snap to other parts · a drag replaces typed expressions with numbers · Enter applies · Esc cancels",
  },
};

// ---------------------------------------------------------------- start

// The placement record a Hole, Pocket, Hardware or Transform draft starts
// with. `hardware`: the library's hardware feature; `template`: the sizes
// "Apply and place another" carries over.
export function startCutPlacement({
  type,
  existingFeature = null,
  hostInstanceId = null,
  hardware = null,
  template = null,
  row = false,
}) {
  const base = { tool: type, hostInstanceId, inferOperation: false };
  if (type === 'transform') return { ...base, stage: 'shape', mode: 'tool', self: true };
  if (type === 'hardware') return { ...base, stage: 'place', mode: 'placed', hardware };
  // A hole row (Phase K): `row` opens the Hole tool as a row; an edited
  // hole with a row record keeps it (Re-place places a row again).
  const rowRecord = type === 'hole' && (row || existingFeature?.row) ? rowPlacement(template, existingFeature) : null;
  const withRow = rowRecord ? { row: rowRecord } : {};
  if (existingFeature) return { ...base, stage: 'shape', mode: 'cut', ...withRow };
  return { ...base, stage: 'place', mode: 'cut', template, ...withRow };
}

// The sizes a finished cut hands to the next one ("Apply and place another").
// A hole row also hands on its count and spacing (never its direction).
export function cutTemplate(feature) {
  if (!feature || !CUT_TOOLS.includes(feature.type) || isSketchPocket(feature)) return null;
  const template = Object.fromEntries(
    TEMPLATE_KEYS.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]),
  );
  if (feature.type === 'hole' && feature.row) template.row = { count: feature.row.count, pitch: feature.row.pitch };
  return template;
}

// A new cut's sizes on a part: createCutFeature's (a member host keeps
// Ø min(6, span/4) and depth = wall), without its placement. A template's
// row goes to the placement record (startCutPlacement), not the feature.
export function cutDefaults(type, part, parameters = {}, template = null) {
  const { placement: _placement, ...base } = createCutFeature(type, part, parameters);
  if (!template) return base;
  const { row: _row, ...sizes } = template;
  return { ...base, ...sizes };
}

// ---------------------------------------------------------------- frames

// The world frame of a resolved cut: origin at the cut centre on the face,
// x along the kernel's width direction, normal = the cut direction (into the
// material), y = normal × x. A pocket's width runs along x, its height along
// y, exactly as the kernel's Plane(start, widthDirection, direction) builds it.
export function cutFrame(position, direction, widthDirection) {
  const normal = normalize(direction);
  const x = normalize(sub(widthDirection, scale(normal, dot(widthDirection, normal))));
  return { origin: [...position], x, y: cross(normal, x), normal };
}

// The same for a flat face under the cursor (world point, outward normal),
// through the host's kernel placement: what the kernel will cut there.
export function faceCutFrame(point, normal, ops) {
  const outward = normalize(normal);
  const local = normalize(unmapPlacement(neg(outward), ops, true));
  const width = normalize(mapPlacement(cutWidthDirection(local), ops, true));
  return cutFrame(point, neg(outward), width);
}

const enabledMembers = (features) => {
  const enabled = features.filter((f) => !f.suppressed);
  return enabled.filter(
    (f, i) => f.type === 'member' && !enabled.slice(i + 1).some((g) => REFERENCE_BREAKERS.includes(g.type)),
  );
};

// The member placement for a click on a curved face (part coordinates): the
// enabled round member (pipe or round bar) whose surface the point lies on,
// with no transform, mirror or pattern after it. Throws CUT_CURVED otherwise.
export function roundMemberPlacement(features, pointLocal, parameters = {}) {
  let best = null;
  for (const member of enabledMembers(features)) {
    let frame;
    try {
      frame = memberFrame(member, parameters);
    } catch {
      continue;
    }
    const radius = frame.metrics.section.diameter / 2;
    if (!radius) continue;
    const fromStart = sub(pointLocal, frame.start);
    const t = dot(fromStart, frame.axis);
    const off = Math.abs(Math.hypot(...sub(fromStart, scale(frame.axis, t))) - radius);
    if (off > Math.max(SURFACE_TOLERANCE, radius * 0.05)) continue;
    if (!best || off < best.off) best = { member, off };
  }
  if (!best) throw new Error(CUT_CURVED);
  return memberPlacementFromPoint(best.member, pointLocal, parameters);
}

// A hole row on a round member runs along the member axis (Phase K §3.5):
// that axis in world coordinates for a resolved cut, else null.
export function memberAxisWorld(feature, cut, parameters = {}) {
  const member = roundMemberOf(feature, cut.previous, parameters);
  if (!member) return null;
  return normalize(mapPlacement(memberFrame(member, parameters).axis, cut.ops, true));
}

const roundMemberOf = (feature, features, parameters) => {
  if (feature?.placement?.type !== 'member') return null;
  const member = features.find((f) => f.id === feature.placement.featureId && f.type === 'member');
  try {
    return member && memberFrame(member, parameters).metrics.section.diameter ? member : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- the cut

// Where the draft's cut is, resolved as the kernel resolves it (so side- and
// member-placed cuts get handles too), in part and world coordinates.
// Returns null when it cannot be resolved (the preview reports why).
export function resolvedCut(draft, ctx) {
  const f = draft.feature;
  const parameters = ctx.parameters || {};
  const part = ctx.model.parts.find((p) => p.id === draft.partId);
  const ops = hostOperations(draft, ctx);
  if (!f || !part || !ops || isSketchPocket(f)) return null;
  const index = part.features.findIndex((x) => x.id === f.id);
  const previous = index >= 0 ? part.features.slice(0, index) : part.features;
  const metrics = ctx.snapshot?.parts?.find((p) => p.id === part.id);
  const last = previous.filter((x) => !x.suppressed).at(-1);
  // The solid before this cut: what the kernel cuts and measures against.
  const bounds = (index >= 0 ? metrics?.features?.[last?.id]?.bounds : null) || metrics?.bounds || null;
  let cut = null;
  try {
    cut = resolveCutPlacement(f, previous, bounds, parameters);
  } catch {
    const stored = metrics?.features?.[f.id]?.cut;
    if (stored) cut = stored;
    else if (!f.placement && f.position && f.direction) {
      try {
        const direction = normalize(vector(f.direction, parameters));
        cut = { position: vector(f.position, parameters), direction, widthDirection: cutWidthDirection(direction) };
      } catch {
        cut = null;
      }
    }
  }
  if (!cut) return null;
  const position = mapPlacement(cut.position, ops);
  const direction = normalize(mapPlacement(cut.direction, ops, true));
  const widthDirection = mapPlacement(cut.widthDirection, ops, true);
  return {
    local: cut,
    frame: cutFrame(position, direction, widthDirection),
    material: depthInto(bounds, cut.position, neg(cut.direction)),
    previous,
    part,
    ops,
    bounds,
  };
}

// The resolved hole / pocket centres of every part, in world coordinates, as
// snap candidates ('hole centre', spec §7); `skip` = the edited feature.
export function holeCentres(ctx, skip = null) {
  const out = [];
  for (const metrics of ctx.snapshot?.parts || []) {
    const part = ctx.model.parts.find((p) => p.id === metrics.id);
    if (!part) continue;
    for (const [id, entry] of Object.entries(metrics.features || {})) {
      if (!entry?.cut || id === skip) continue;
      const index = part.features.findIndex((f) => f.id === id);
      const feature = part.features[index];
      if (!feature || feature.suppressed) continue;
      const attachable =
        feature.type === 'hole' &&
        !part.features.slice(index + 1).some((f) => !f.suppressed && REFERENCE_BREAKERS.includes(f.type));
      // A hole row (Phase K): one candidate per centre, with its index.
      const centres = entry.row?.centres?.length ? entry.row.centres : [entry.cut.position];
      // The hole's radius (Phase M: hardware picks a hole by its opening).
      const radius = feature.type === 'hole' ? num(feature.diameter, ctx.parameters, 0) / 2 : null;
      for (const instance of ctx.snapshot.instances || []) {
        if (instance.partId !== part.id || !instance.placement) continue;
        const normal = neg(normalize(mapPlacement(entry.cut.direction, instance.placement, true)));
        centres.forEach((centre, index) =>
          out.push({
            instanceId: instance.id,
            featureId: id,
            index,
            type: feature.type,
            attachable,
            point: mapPlacement(centre, instance.placement),
            normal,
            radius,
          }),
        );
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- clicks

export function seatOf(draft, info, ctx) {
  if (draft.newInstance && info.instanceId === draft.newInstance.id)
    throw new Error('Click a face of an existing part, or empty ground.');
  const instance = ctx.model.instances.find((i) => i.id === info.instanceId);
  if (!instance) throw new Error('Click a face of a part in the saved model.');
  const placement = ctx.snapshot?.instances.find((i) => i.id === instance.id)?.placement;
  if (!placement) throw new Error('Rebuild the model before placing on this part.');
  const part = ctx.model.parts.find((p) => p.id === instance.partId);
  return { instanceId: instance.id, partId: instance.partId, name: instance.name || part?.name || 'Part', placement };
}

// A viewport click in the Place stage (info as placementTool.placeClick).
export function placeCut(draft, info, ctx) {
  const p = draft.placement;
  if (p.tool === 'hardware') return placeHardware(draft, info, ctx);
  // A hole row: the second click is the last hole; the first stays in Place.
  if (p.row?.seed) return placeRowEnd(draft, info, ctx);
  if (info.kind !== 'face') throw new Error(`Click a face of a part for the ${p.tool}.`);
  const { placement: ops, ...target } = seatOf(draft, info, ctx);
  if (draft.editing && target.partId !== draft.partId)
    throw new Error(`An edited ${p.tool} stays on its part: click a face of that part.`);
  const parameters = ctx.parameters || {};
  const part = ctx.model.parts.find((x) => x.id === target.partId);
  const base = draft.feature
    ? { ...draft.feature }
    : { id: uid('feature'), ...cutDefaults(p.tool, part, parameters, p.template) };
  if (base.positionLocked) throw new Error('Unlock the hole position before moving it.');
  const index = part.features.findIndex((x) => x.id === base.id);
  const features = index >= 0 ? part.features.slice(0, index) : part.features;
  let feature, label, grid;
  if (!info.planar) {
    // A round member: drill radially, stored as a member placement.
    let placement;
    try {
      placement = roundMemberPlacement(features, unmapPlacement(info.point, ops), parameters);
    } catch (error) {
      // A hole row names its own rule for curved faces.
      throw p.row && error.message === CUT_CURVED ? new Error(ROW_CURVED) : error;
    }
    feature = { ...base, placement };
    delete feature.position;
    delete feature.direction;
    label = `${placement.side} side`;
    grid = null;
  } else {
    feature = positionedCut(
      base,
      tidyPoint(unmapPlacement(info.point, ops), 1e-4),
      tidyDirection(unmapPlacement(neg(info.normal), ops, true)),
    );
    label = faceLabel(info.normal);
    grid = info.faceFrame || null;
  }
  const placed = {
    ...draft,
    partId: target.partId,
    newPart: null,
    newInstance: null,
    feature,
    placement: {
      ...p,
      stage: 'shape',
      target,
      label,
      grid,
      snapKind: info.snapKind || null,
      hostInstanceId: target.instanceId,
      problem: '',
    },
  };
  return p.row ? seedRow(draft, placed, info, ctx) : placed;
}

// Hardware: a click on an attachable hole centre chooses that hole (Phase M:
// placementHardware.js toggles it; Shift+click a whole row) and stays in
// Place. With no hole chosen, a click on a face or the ground is the Phase J
// single free seat: a new part posed so its seating plane lies on the
// clicked face (frameToInstance: part Z = the face normal, bolts and studs
// point into -Z, into the face), or on the ground.
function placeHardware(draft, info, ctx) {
  const p = draft.placement;
  if (picksHole(info)) return info.shift ? toggleRowHoles(draft, info, ctx) : toggleHole(draft, info, ctx);
  if (chosenHoles(draft).length) throw new Error(HOLES_PENDING);
  if (info.kind === 'face' && !info.planar) throw new Error('Pick a flat face, or empty ground, to seat the hardware.');
  let seat = null;
  if (info.kind === 'face') {
    const { placement: _placement, ...rest } = seatOf(draft, info, ctx);
    seat = rest;
  }
  const frame =
    info.kind === 'ground'
      ? { ...GROUND_FRAME, origin: tidyPoint(info.point, 1e-6) }
      : placeFrame(info.point, info.normal);
  const feature = draft.feature || { ...p.hardware, id: uid('hardware') };
  const created = draft.newPart ? null : createHardware(feature);
  const newPart = draft.newPart || { ...created.part, features: [] };
  const newInstance = { ...(draft.newInstance || created.instance), partId: newPart.id, ...frameToInstance(frame) };
  // A free seat has no connection (a hole is seated through the chosen holes).
  return {
    ...draft,
    partId: newPart.id,
    newPart,
    newInstance,
    extraInstances: [],
    feature,
    connections: [],
    placement: {
      ...p,
      stage: 'shape',
      frame,
      seat,
      label: info.kind === 'ground' ? 'ground' : faceLabel(info.normal),
      grid: info.kind === 'ground' ? GROUND_FRAME : info.faceFrame || frame,
      snapKind: info.snapKind || null,
      hostInstanceId: newInstance.id,
      problem: '',
    },
  };
}

// ---------------------------------------------------------------- drags

// A completed handle drag ({ id, value, from }; the row's end square also
// sends { snapKind, step, free }) as a draft patch.
export function applyCutDrag(draft, change, ctx) {
  const { id, value } = change;
  const p = draft.placement;
  const f = draft.feature;
  if (id === 'tool') return { ...draft, feature: { ...f, position: value.position, rotation: value.rotation } };
  if (id === 'row-end') {
    const cut = resolvedCut(draft, ctx);
    return applyRowDrag(draft, change, ctx, cut, cut ? memberAxisWorld(f, cut, ctx.parameters || {}) : null);
  }
  if (p.tool === 'hardware') {
    if (id !== 'slide') throw new Error(`Unknown handle: ${id}`);
    const frame = { ...p.frame, origin: tidyPoint(value, 1e-6) };
    return {
      ...draft,
      newInstance: { ...draft.newInstance, ...frameToInstance(frame) },
      placement: { ...p, frame },
    };
  }
  const cut = resolvedCut(draft, ctx);
  if (id === 'distance') {
    const depth = Math.max(MIN_LENGTH, Number(value));
    if (cut && Number.isFinite(cut.material) && depth >= cut.material - THROUGH_TOLERANCE)
      return { ...draft, feature: { ...f, throughAll: true } };
    return { ...draft, feature: { ...f, depth: tidy(depth), throughAll: false } };
  }
  if (id === 'radius') return { ...draft, feature: { ...f, diameter: Math.max(MIN_LENGTH, tidy(2 * value.radius)) } };
  if (id === 'corner')
    return {
      ...draft,
      feature: {
        ...f,
        width: Math.max(MIN_LENGTH, tidy(value.width)),
        height: Math.max(MIN_LENGTH, tidy(value.height)),
      },
    };
  if (id === 'slide') {
    if (!cut) throw new Error('This cut needs current geometry before moving.');
    const parameters = ctx.parameters || {};
    const local = unmapPlacement(value, cut.ops);
    const member = roundMemberOf(f, cut.previous, parameters);
    if (member) {
      // A round member keeps its member placement: along it and around it.
      if (f.positionLocked) throw new Error('Unlock the hole position before moving it.');
      const { start, axis, rotation, metrics } = memberFrame(member, parameters);
      const t = dot(sub(local, start), axis);
      const distance = Math.max(0, Math.min(metrics.centerline, t - metrics.gapStart));
      const inverse = [...rotation].reverse().map((op) => ({ ...op, angle: -op.angle }));
      const r = mapPlacement(sub(sub(local, start), scale(axis, t)), inverse, true);
      const width = CUT_SIDES[f.placement.side]?.width;
      const limit = metrics.section.diameter / 2 - 0.01;
      const offset = Math.max(-limit, Math.min(limit, dot(r, width || [1, 0, 0])));
      const placement = {
        type: 'member',
        featureId: member.id,
        side: f.placement.side,
        distance: tidy(distance),
        offset: tidy(offset),
      };
      return { ...draft, feature: { ...f, placement } };
    }
    // Coordinates (a side- or member-placed cut becomes exact coordinates,
    // as Move holes does); the direction stays square to the face.
    const direction =
      !f.placement && f.direction?.every((v) => typeof v === 'number')
        ? f.direction
        : tidyDirection(cut.local.direction);
    return { ...draft, feature: positionedCut(f, tidyPoint(local, 1e-4), direction) };
  }
  throw new Error(`Unknown handle: ${id}`);
}

// The live ghost and arrow while the depth arrow is dragged.
export function cutDragView(view, value) {
  const handles = view.handles.map((h) => (h.id === 'distance' ? { ...h, value } : { ...h }));
  const throughAll = Number.isFinite(view.cutDepth) && value >= view.cutDepth - THROUGH_TOLERANCE;
  return { ...view, handles, shape: view.shape ? { ...view.shape, value } : null, cut: true, throughAll };
}
export function cutDepthText(view, value) {
  return Number.isFinite(view.cutDepth) && value >= view.cutDepth - THROUGH_TOLERANCE
    ? 'Through all'
    : `Depth ${fmt(Math.max(MIN_LENGTH, value))} mm`;
}

// ---------------------------------------------------------------- the view

// The draft-only Phase J view parts, filled into placementTool's `view`.
export function cutPlacementView(draft, ctx, view) {
  const p = draft.placement;
  const tool = p.tool;
  const parameters = ctx.parameters || {};
  view.hint = HINTS[tool]?.[p.stage] || view.hint;
  view.allowGround = tool === 'hardware';
  if (tool === 'transform') return transformView(draft, ctx, view);
  view.cutTool = CUT_TOOLS.includes(tool);
  view.holeCentres = holeCentres(ctx, draft.feature?.id);
  if (tool === 'hardware') return hardwareView(draft, ctx, view);
  view.cut = true;
  if (p.row) view.hint = p.stage === 'place' ? ROW_HINTS.place : view.hint;
  if (p.row?.seed && p.stage === 'place') {
    // The direction stage: the seed hole and the rubber row (placementRows).
    view.place = { ...view.place, tool, parameters, instances: {} };
    return rowSeedView(draft, ctx, view);
  }
  if (p.stage === 'place') {
    // What the hover ghost needs for every part: its pose, features and the
    // size a cut would get there.
    const instances = {};
    for (const instance of ctx.model.instances) {
      const part = ctx.model.parts.find((x) => x.id === instance.partId);
      const ops = ctx.snapshot?.instances?.find((i) => i.id === instance.id)?.placement;
      if (!part || !ops) continue;
      let sizes = null;
      try {
        sizes = draft.feature || cutDefaults(tool, part, parameters, p.template);
      } catch {
        sizes = null;
      }
      const index = draft.feature ? part.features.findIndex((x) => x.id === draft.feature.id) : -1;
      instances[instance.id] = { ops, features: index >= 0 ? part.features.slice(0, index) : part.features, sizes };
    }
    view.place = { ...view.place, tool, parameters, instances };
    // Re-placing an edited cut: only its own part.
    if (draft.editing) view.pickInstanceId = view.hostInstanceId;
    return view;
  }
  const f = draft.feature;
  if (!f) return view;
  if (isSketchPocket(f)) {
    view.hint =
      'Pocket: its sketch places it (edit the sketch to move it) · Rectangle in Pocket profile brings the handles back · Enter applies · Esc cancels';
    return view;
  }
  const part = ctx.model.parts.find((x) => x.id === draft.partId);
  const index = part ? part.features.findIndex((x) => x.id === f.id) : -1;
  if (index >= 0 && part.features.slice(index + 1).some((g) => !g.suppressed && REFERENCE_BREAKERS.includes(g.type))) {
    view.hint = `${title(tool)}: a transform, mirror or pattern follows this ${tool} in the part, so it has no handles here; edit it in the fields · Enter applies · Esc cancels`;
    return view;
  }
  const cut = resolvedCut(draft, ctx);
  if (!cut) return view;
  const frame = cut.frame;
  const material = cut.material;
  const depth = f.throughAll && Number.isFinite(material) ? material : num(f.depth, parameters, 5);
  view.cutDepth = material;
  view.throughAll = Boolean(f.throughAll);
  const hole = tool === 'hole';
  const d = num(f.diameter, parameters, 6),
    w = num(f.width, parameters, 12),
    h = num(f.height, parameters, 20);
  view.shape = { kind: 'prism', frame, loops: [hole ? circleLoop(d / 2) : rectLoop(w, h)], value: depth };
  view.handles.push({
    id: 'distance',
    kind: 'arrow',
    origin: [...frame.origin],
    direction: [...frame.normal],
    value: depth,
    min: MIN_LENGTH,
    typing: true,
    expression: typeof f.depth === 'string' && !f.throughAll ? f.depth : null,
  });
  if (!f.positionLocked)
    view.handles.push({ id: 'slide', kind: 'square', at: [...frame.origin], frame, grid: p.grid || frame });
  else view.hint += ' · the hole position is locked (Lock hole position), so it cannot slide';
  if (hole)
    view.handles.push({
      id: 'radius',
      kind: 'grip',
      mode: 'circle',
      at: toWorld(frame, [d / 2, 0]),
      frame,
      centre2: [0, 0],
      expression: typeof f.diameter === 'string' ? f.diameter : null,
    });
  else {
    // The grip on the upper-right corner as seen looking at the face (where
    // Extrude's is), clear of the depth arrow going into the part: the
    // rectangle's own axes, flipped to read upright. Sizes are unsigned.
    const upright = placeFrame(frame.origin, neg(frame.normal));
    const gripFrame = {
      ...frame,
      x: dot(frame.x, upright.x) < 0 ? neg(frame.x) : [...frame.x],
      y: dot(frame.y, upright.y) < 0 ? neg(frame.y) : [...frame.y],
    };
    view.handles.push({
      id: 'corner',
      kind: 'grip',
      mode: 'rect',
      at: toWorld(gripFrame, [w / 2, h / 2]),
      frame: gripFrame,
      centre2: [0, 0],
      expression: [f.width, f.height].find((v) => typeof v === 'string') || null,
    });
  }
  if (f.placement && !roundMemberOf(f, cut.previous, parameters) && !f.positionLocked)
    view.hint += ' · sliding it stores exact part coordinates';
  // A hole row: every hole in the ghost, the row line and the end square.
  if (hole && f.row) return rowView(draft, ctx, view, cut, HINTS.hole.shape, memberAxisWorld(f, cut, parameters));
  return view;
}

function hardwareView(draft, ctx, view) {
  const p = draft.placement;
  const feature = draft.feature || p.hardware;
  const radius = hardwareRadius(feature, ctx.parameters || {});
  view.place = { ...view.place, tool: 'hardware', radius, name: hardwareName(feature) };
  // Phase M: the chosen holes (rings, HUD keys) and the Place / seated hints.
  chosenView(draft, ctx, view);
  if (p.stage !== 'shape' || !p.frame || draft.connections?.length) return view;
  // The single free seat: today's prism ghost and the slide square.
  let length = 0;
  try {
    length = hardwareDimensions(feature, ctx.parameters || {}).length;
  } catch {
    length = 0;
  }
  // Bolts, studs and (Phase N) every screw kind point into the face.
  const into = ['bolt', 'stud'].includes(feature?.kind) || Boolean(SCREW_KINDS[feature?.kind]);
  view.shape = {
    kind: 'prism',
    frame: p.frame,
    loops: [circleLoop(radius, 32)],
    value: (into ? -1 : 1) * length,
  };
  view.handles.push({
    id: 'slide',
    kind: 'square',
    at: [...p.frame.origin],
    frame: p.frame,
    grid: p.grid || p.frame,
  });
  return view;
}

function transformView(draft, ctx, view) {
  const f = draft.feature;
  const parameters = ctx.parameters || {};
  const ops = hostOperations(draft, ctx);
  if (!f || !ops) return view;
  const saved = draft.editing
    ? ctx.model.parts.find((x) => x.id === draft.partId)?.features.find((x) => x.id === f.id)
    : null;
  const pose = (feature) => ({
    position: vector(feature?.position || [0, 0, 0], parameters),
    rotation: vector(feature?.rotation || [0, 0, 0], parameters),
  });
  let current, base;
  try {
    current = pose(f);
    base = pose(saved);
  } catch {
    return view;
  }
  const host = view.hostInstanceId;
  view.toolGizmo = {
    partId: draft.partId,
    self: true,
    ...current,
    // The pose the displayed mesh of the part was built with (the workspace
    // replaces it with `current` while the preview is shown).
    basePose: base,
    bounds: ctx.snapshot?.parts?.find((x) => x.id === draft.partId)?.bounds || null,
    hostOps: ops,
    hostInstanceId: host,
    hostBounds: ctx.snapshot?.instances?.find((i) => i.id === host)?.bounds || null,
    expression: [...(f.position || []), ...(f.rotation || [])].some((v) => typeof v === 'string'),
  };
  return view;
}

// The hover ghost in the Place stage.
export function hoverCutShape(view, hover) {
  if (!view?.place || !hover) return null;
  if (view.tool === 'hardware') {
    if (hover.kind === 'face' && !hover.planar) return null;
    const frame = placeFrame(hover.point, hover.kind === 'ground' ? [0, 0, 1] : hover.normal);
    return { kind: 'flat', frame, loops: [circleLoop(view.place.radius || 5, 32)] };
  }
  if (hover.kind !== 'face') return null;
  const entry = view.place.instances?.[hover.instanceId];
  if (!entry?.sizes) return null;
  const parameters = view.place.parameters || {};
  const s = entry.sizes;
  let frame;
  try {
    if (hover.planar) frame = faceCutFrame(hover.point, hover.normal, entry.ops);
    else {
      const placement = roundMemberPlacement(entry.features, unmapPlacement(hover.point, entry.ops), parameters);
      const cut = resolveCutPlacement(
        { ...s, placement, throughAll: false, depth: 1 },
        entry.features,
        null,
        parameters,
      );
      frame = cutFrame(
        mapPlacement(cut.position, entry.ops),
        normalize(mapPlacement(cut.direction, entry.ops, true)),
        mapPlacement(cut.widthDirection, entry.ops, true),
      );
    }
  } catch {
    return null;
  }
  const loops =
    view.tool === 'hole'
      ? [circleLoop(num(s.diameter, parameters, 6) / 2)]
      : isSketchPocket(s)
        ? [rectLoop(12, 20)]
        : [rectLoop(num(s.width, parameters, 12), num(s.height, parameters, 20))];
  return { kind: 'flat', frame, loops };
}

// The cursor readout over a curved face.
export function curvedHoverText(view, hover) {
  if (!CUT_TOOLS.includes(view?.tool)) return 'Curved face · pick a flat face';
  const entry = view.place?.instances?.[hover.instanceId];
  try {
    if (!entry) throw new Error(CUT_CURVED);
    const placement = roundMemberPlacement(
      entry.features,
      unmapPlacement(hover.point, entry.ops),
      view.place.parameters || {},
    );
    return `Round tube · ${placement.side} side · drills radially`;
  } catch {
    return 'Curved face · pick a flat face or a round tube';
  }
}

// ---------------------------------------------------------------- panel line

export function cutSummary(draft, ctx) {
  const p = draft.placement;
  const parameters = ctx.parameters || {};
  if (p.tool === 'transform') return 'Drag the ghost in the viewport (M move, R rotate)';
  if (p.row?.seed && p.stage === 'place') {
    const host = p.target?.name || 'Part';
    return rowSummary(draft, ctx, {
      host,
      label: p.label || 'face',
      at: toPlane(p.grid || p.frame, p.frame.origin).slice(0, 2),
    });
  }
  // Hardware (Phase M): the chosen holes in Place, several seated holes in Shape.
  const holesLine = p.tool === 'hardware' ? hardwareSummary(draft, ctx) : '';
  if (holesLine) return holesLine;
  if (p.stage === 'place') return '';
  if (p.tool === 'hardware') {
    const name = draft.newPart?.name || hardwareName(draft.feature);
    const at = toPlane(p.grid || GROUND_FRAME, p.frame.origin);
    const where = p.seat ? `on ${p.seat.name} · ${p.label}` : 'on the ground';
    const seated = draft.connections?.length ? ' · concentric with the hole' : '';
    return `${name} ${where} at (${fmt(at[0])}, ${fmt(at[1])})${seated}`;
  }
  const f = draft.feature;
  if (!f) return '';
  if (isSketchPocket(f)) {
    const sketch = ctx.model.sketches.find((s) => s.id === f.sketchId);
    return `Placed by sketch ${sketch?.name || '(choose one below)'}`;
  }
  const host =
    p.target?.name ||
    (() => {
      const instance = ctx.model.instances.find((i) => i.id === p.hostInstanceId);
      return instance?.name || ctx.model.parts.find((x) => x.id === draft.partId)?.name || 'Part';
    })();
  const size =
    f.type === 'hole'
      ? `Ø ${fmt(num(f.diameter, parameters))} mm`
      : `${fmt(num(f.width, parameters))} × ${fmt(num(f.height, parameters))} mm`;
  const extent = f.throughAll ? 'through all' : `depth ${fmt(num(f.depth, parameters))} mm`;
  if (f.placement?.type === 'member' && f.type === 'hole' && f.row) {
    // A row on a round member: the row line, with the member position.
    const cut = resolvedCut(draft, ctx);
    const axis = cut ? memberAxisWorld(f, cut, parameters) : null;
    const where = `${f.placement.side} side · ${fmt(num(f.placement.distance ?? 0, parameters))} mm from the start`;
    const row = cut
      ? rowSummary(draft, ctx, {
          host,
          label: where,
          at: [num(f.placement.offset ?? 0, parameters)],
          size,
          extent,
          cut,
          axis,
        })
      : null;
    if (row) return row.replace(/ · from \([^)]*\) /, ' · ');
  }
  if (f.placement?.type === 'member') {
    const distance =
      f.placement.distance != null
        ? `${fmt(num(f.placement.distance, parameters))} mm from the start`
        : `${fmt(num(f.placement.along ?? 50, parameters))} % along`;
    return `On ${host} · ${f.placement.side} side · ${distance} · offset ${fmt(num(f.placement.offset ?? 0, parameters))} · ${size} · ${extent}`;
  }
  const cut = resolvedCut(draft, ctx);
  if (!cut) return `On ${host} · ${size} · ${extent}`;
  const label = p.label || faceLabel(neg(cut.frame.normal));
  const at = p.grid ? toPlane(p.grid, cut.frame.origin).slice(0, 2) : cut.local.position;
  const row =
    f.type === 'hole' && f.row
      ? rowSummary(draft, ctx, { host, label, at, size, extent, cut, axis: memberAxisWorld(f, cut, parameters) })
      : null;
  if (row) return row;
  return `On ${host} · ${label} · ${size} at (${at.map((v) => fmt(v)).join(', ')}) · ${extent}`;
}

// A hole row's direction for the panel's engraved readout ('' otherwise).
export function cutRowDirection(draft, ctx) {
  if (draft?.feature?.type !== 'hole' || !draft.feature.row || draft.placement?.stage !== 'shape') return '';
  const cut = resolvedCut(draft, ctx);
  return cut ? rowDirectionText(draft, ctx, cut, memberAxisWorld(draft.feature, cut, ctx.parameters || {})) : '';
}

// A feature change from the panel's fields. Choosing an existing sketch for
// a pocket drops the handles (the sketch places it); choosing Rectangle again
// puts it back where it was placed.
export function cutFeatureChange(draft, next) {
  const p = draft.placement;
  const before = draft.feature;
  let feature = next;
  if (p && before && !isSketchPocket(before) && isSketchPocket(next))
    return {
      ...draft,
      feature,
      placement: {
        ...p,
        located: { placement: before.placement, position: before.position, direction: before.direction },
      },
    };
  if (p?.located && isSketchPocket(before) && !isSketchPocket(next)) {
    feature = { ...next, placement: p.located.placement, position: p.located.position, direction: p.located.direction };
    for (const key of ['placement', 'position', 'direction']) if (feature[key] === undefined) delete feature[key];
  }
  return { ...draft, feature };
}
