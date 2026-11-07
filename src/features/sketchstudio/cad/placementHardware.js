// Hardware in chosen holes (Phase M, docs/sketch-studio-hardware-holes.md):
// the Hardware tool's Place stage collects holes before anything is seated,
// and Enter seats ONE hardware part in all of them. The Hardware tool runs
// these rules when placementCuts.js / placementTool.js dispatch here; all pure:
//
//   Place   a click on an attachable hole centre toggles that hole in
//           placement.holes (ordered by first click); Shift+click on a hole
//           of a row toggles the whole row; a plain face or the ground with
//           no hole chosen is the Phase J single free seat (placementCuts)
//   finish  Enter / Seat in N holes / double-click: one part, one instance
//           per chosen hole (draft.newInstance + draft.extraInstances) and
//           one concentric connection per hole (holeIndex when > 0)
//   Shape   no handles; the Chosen holes list rebuilds the result on Remove;
//           Axial offset writes every connection
//   side    (Phase Q, docs/sketch-studio-hardware-seat-side.md) a chosen hole
//           is seated on the opening that was clicked: 'entry' (where it
//           was drilled from) or 'far' (where it comes out; connection
//           side: 'far'); Flip side / F moves every chosen hole that has
//           another opening to the other side, through a stack of coaxial
//           holes (an angle bar on a board: the board's underside)
//
// Nothing new is persisted: placement.holes and draft.extraInstances are
// draft-only, and the result of Apply is what N rounds of the Phase J tool
// would have produced.
import { HARDWARE_TYPES, createHardware, hardwareDimensions } from './hardware.js';
import { numeric, uid } from './model.js';
import { frameToInstance, tidyPoint } from './sketchPlane.js';
// Cycle-safe: these are only called, never used while the modules load
// (placementTool.js and placementCuts.js import this module too).
import { faceLabel, placeFrame } from './placementTool.js';
import { holeCentres, seatOf } from './placementCuts.js';

export const HARDWARE_HINTS = {
  place:
    'Hardware: click the holes it goes in (click one again to remove it · Shift+click picks a whole row) · Enter seats it in the chosen holes · a flat face or empty ground seats a single one · Esc cancels',
  chosen: (count) =>
    `Hardware: ${holesText(count)} chosen · click more holes, or a chosen one to remove it · Enter seats it in them · Esc removes the last one`,
  // Appended while a chosen hole has another opening (Phase Q).
  flip: ' · F flips to the other side',
  // One hole keeps the Phase J text verbatim.
  seated: (count) =>
    count === 1
      ? 'Hardware: seated in the hole you clicked (concentric) · Re-place seats it elsewhere · Enter applies · Esc cancels'
      : `Hardware: seated in ${count} holes (concentric) · Re-place chooses the holes again · Enter applies · Esc cancels`,
};
// A plain face, the ground or a pocket clicked while holes are chosen.
export const HOLES_PENDING =
  'Click another hole centre to add it, or press Enter to seat the hardware in the chosen holes.';
export const NO_HOLES = 'Click the holes the hardware goes in first.';
export const NO_OTHER_SIDE = 'None of the chosen holes comes out of the material: there is no other side to seat on.';

const fmt = (value) => String(Number(Number(value).toFixed(2)));
const num = (value, parameters, fallback = 0) => {
  try {
    return numeric(value, parameters || {});
  } catch {
    return fallback;
  }
};
const holesText = (count) => `${count} ${count === 1 ? 'hole' : 'holes'}`;
const listText = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
export const hardwareName = (feature) =>
  feature ? `${HARDWARE_TYPES[feature.kind] || 'Hardware'} ${feature.size || ''}`.trim() : 'Hardware';

// The identity of a chosen hole: which instance, which hole feature, which
// hole of a row (0 for a single hole). Not the side: a hole is chosen once,
// on one of its openings.
export const holeKey = (hole) => `${hole.instanceId}/${hole.featureId}/${hole.index || 0}`;
const sideOf = (hole) => (hole?.side === 'far' ? 'far' : 'entry');
const infoKey = (info) =>
  holeKey({ instanceId: info.instanceId, featureId: info.holeFeatureId, index: info.holeIndex });
// A click that picks a hole: an attachable hole centre (Alt never snaps).
export const picksHole = (info) =>
  info?.kind === 'face' &&
  info.snapKind === 'hole centre' &&
  Boolean(info.holeFeatureId) &&
  Boolean(info.holeAttachable);
export const chosenHoles = (draft) => draft?.placement?.holes || [];

// The placement while holes are being chosen: the status line says what
// Enter does (operationProblem would say "Click in the viewport…").
// `note`: what a side choice could not do (Phase Q), shown in the hint.
const choosing = (draft, holes, note = '') => ({
  ...draft,
  placement: {
    ...draft.placement,
    holes,
    problem: holes.length ? `${holesText(holes.length)} chosen · Enter seats the hardware in them.` : '',
    sideNote: note,
  },
});

// The chosen-hole record of a click (world mm; normal = the clicked face's
// outward normal). seatOf throws "Rebuild the model…" when the instance has
// no kernel placement yet.
function holeOfClick(draft, info, ctx) {
  const { placement: _placement, ...seat } = seatOf(draft, info, ctx);
  return {
    ...seat,
    featureId: info.holeFeatureId,
    index: info.holeIndex || 0,
    // The opening clicked (Phase Q): the hardware seats on it.
    side: info.holeSide === 'far' ? 'far' : 'entry',
    point: tidyPoint(info.point, 1e-6),
    normal: [...info.normal],
    faceFrame: info.faceFrame || null,
  };
}

// ---------------------------------------------------------------- Place

// A click on an attachable hole centre: add it, or remove it when chosen on
// this opening; the other opening of a chosen hole moves it to this side
// (Phase Q), keeping its place in the list.
export function toggleHole(draft, info, ctx) {
  const holes = chosenHoles(draft);
  const key = infoKey(info);
  const chosen = holes.find((h) => holeKey(h) === key);
  if (chosen && sideOf(chosen) !== sideOf({ side: info.holeSide })) {
    const hole = holeOfClick(draft, info, ctx);
    return choosing(
      draft,
      holes.map((h) => (h === chosen ? hole : h)),
    );
  }
  if (chosen)
    return choosing(
      draft,
      holes.filter((h) => holeKey(h) !== key),
    );
  return choosing(draft, [...holes, holeOfClick(draft, info, ctx)]);
}

// Double-click: the hole under the cursor is chosen on the opening clicked
// (added when absent, never removed: the two clicks of the pair already
// toggled it).
export function chooseHole(draft, info, ctx) {
  if (!picksHole(info)) return draft;
  const holes = chosenHoles(draft);
  const chosen = holes.find((h) => holeKey(h) === infoKey(info));
  if (chosen && sideOf(chosen) === sideOf({ side: info.holeSide })) return draft;
  const hole = holeOfClick(draft, info, ctx);
  return choosing(draft, chosen ? holes.map((h) => (h === chosen ? hole : h)) : [...holes, hole]);
}

// Every centre of a hole row on one instance, as chosen-hole records (empty
// when the snapshot has none, e.g. the instance is not built yet), on the
// `side` opening when every centre has one, else on the drill side.
function rowHoles(ctx, instanceId, featureId, faceFrame = null, side = 'entry') {
  const all = holeCentres(ctx).filter((h) => h.instanceId === instanceId && h.featureId === featureId && h.attachable);
  const entries = all.filter((h) => sideOf(h) === 'entry');
  const far = side === 'far' ? all.filter((h) => h.side === 'far') : [];
  const centres = far.length && far.length === entries.length ? far : entries;
  // The clicked face's frame only fits the side clicked.
  return centres.map((h) => openingRecord(h, ctx, sideOf(h) === side ? faceFrame : null));
}
// A holeCentres candidate as a chosen-hole record.
function openingRecord(h, ctx, faceFrame = null) {
  const instance = ctx.model.instances.find((i) => i.id === h.instanceId);
  const part = ctx.model.parts.find((p) => p.id === instance?.partId);
  return {
    instanceId: h.instanceId,
    partId: instance?.partId || null,
    name: instance?.name || part?.name || 'Part',
    featureId: h.featureId,
    index: h.index || 0,
    side: sideOf(h),
    point: tidyPoint(h.point, 1e-6),
    normal: [...h.normal],
    faceFrame,
  };
}
const isRow = (ctx, instanceId, featureId) => {
  const instance = ctx.model.instances.find((i) => i.id === instanceId);
  const part = ctx.model.parts.find((p) => p.id === instance?.partId);
  return Boolean(part?.features.find((f) => f.id === featureId)?.row);
};

// Shift+click on a hole of a row: every centre of that row on that instance
// on when any is off, else all off. A single hole: a plain click. Phase Q:
// the row takes the clicked opening's side when every centre of the row has
// that opening (else the drill side, and the hint says so); chosen holes of
// the row on the other side move to it.
export function toggleRowHoles(draft, info, ctx) {
  if (!isRow(ctx, info.instanceId, info.holeFeatureId)) return toggleHole(draft, info, ctx);
  // The clicked hole first: it throws when the instance is not built.
  const clicked = holeOfClick(draft, info, ctx);
  const row = rowHoles(ctx, info.instanceId, info.holeFeatureId, info.faceFrame || null, clicked.side);
  if (row.length < 2) return toggleHole(draft, info, ctx);
  const side = sideOf(row[0]);
  const note = side !== clicked.side ? 'not every hole of the row comes out, so the row is on the drill side' : '';
  const holes = chosenHoles(draft);
  const chosen = new Map(holes.map((h) => [holeKey(h), h]));
  const rowKeys = new Set(row.map(holeKey));
  if (row.every((h) => chosen.has(holeKey(h)) && sideOf(chosen.get(holeKey(h))) === side))
    return choosing(
      draft,
      holes.filter((h) => !rowKeys.has(holeKey(h))),
    );
  // The clicked one keeps the exact clicked point; the rest in row order.
  const records = new Map(
    row.map((h) => [holeKey(h), holeKey(h) === holeKey(clicked) && clicked.side === side ? clicked : h]),
  );
  const kept = holes.map((h) => (rowKeys.has(holeKey(h)) && sideOf(h) !== side ? records.get(holeKey(h)) : h));
  const added = row.filter((h) => !chosen.has(holeKey(h))).map((h) => records.get(holeKey(h)));
  return choosing(draft, [...kept, ...added], note);
}

// Attach to selected hole on a hole row (spec §3.4): Place opens with every
// centre of that row on that instance chosen. No snapshot yet: nothing
// chosen, no error.
export function pickRowHoles(draft, preselect, ctx) {
  if (!preselect?.instanceId || !preselect.featureId) return draft;
  const row = rowHoles(ctx, preselect.instanceId, preselect.featureId);
  if (!row.length) return draft;
  const holes = chosenHoles(draft);
  const keys = new Set(holes.map(holeKey));
  return choosing(draft, [...holes, ...row.filter((h) => !keys.has(holeKey(h)))]);
}

// Esc in Place: remove the last chosen hole; null (= cancel) at zero.
export function hardwareStepBack(draft) {
  const p = draft.placement;
  if (p?.stage !== 'place' || !chosenHoles(draft).length) return null;
  return choosing(draft, chosenHoles(draft).slice(0, -1));
}

// Re-place (spec §3.3, the option chosen: drop the old result AT Re-place).
// The Place stage never shows the preview (CadWorkspace displayPreview), so
// keeping it would only leave an applicable feature behind in Place. The
// sizes typed in Shape carry over (placement.hardware); the new part and
// first instance ids are kept so the selection survives.
export function hardwareReplace(draft) {
  const p = draft.placement;
  const { frame: _frame, seat: _seat, label: _label, grid: _grid, snapKind: _snapKind, ...rest } = p;
  return {
    ...draft,
    feature: null,
    extraInstances: [],
    connections: [],
    placement: {
      ...rest,
      stage: 'place',
      hardware: draft.feature ? { ...draft.feature } : p.hardware,
      holes: [],
      problem: '',
      sideNote: '',
    },
  };
}

// ---------------------------------------------------------------- finish

// Enter / Seat in N holes / double-click: the whole result in one step. Every
// pose comes from the chosen holes (the context is not needed; kept in the
// signature so all placement rules read alike).
export function finishHardware(draft, _ctx = null) {
  const p = draft.placement;
  const holes = chosenHoles(draft);
  if (!holes.length) throw new Error(NO_HOLES);
  const feature = draft.feature || { ...p.hardware, id: uid('hardware') };
  const created = draft.newPart ? null : createHardware(feature);
  const newPart = draft.newPart || { ...created.part, features: [] };
  // An instance keeps its id while its hole stays chosen (Remove in Shape
  // rebuilds the rest); the first reuses the draft's new instance.
  const previous = new Map(
    (draft.connections || []).map((c) => [
      holeKey({ instanceId: c.to, featureId: c.toFeatureId, index: c.holeIndex }),
      c.from,
    ]),
  );
  const firstId = draft.newInstance?.id || created?.instance.id || uid('instance');
  const used = new Set([firstId]);
  const instances = holes.map((hole, i) => {
    let id = i === 0 ? firstId : previous.get(holeKey(hole));
    if (i > 0 && (!id || used.has(id))) id = uid('instance');
    used.add(id);
    const pose = frameToInstance(placeFrame(hole.point, hole.normal));
    if (i === 0)
      return { ...(draft.newInstance || created?.instance || { visible: true }), id, partId: newPart.id, ...pose };
    return { id, partId: newPart.id, ...pose, visible: true };
  });
  const connections = holes.map((hole, i) => ({
    id: uid('connection'),
    type: 'concentric',
    from: instances[i].id,
    to: hole.instanceId,
    fromFeatureId: feature.id,
    toFeatureId: hole.featureId,
    // Which hole of a row (Phase K); omitted for the first so a single
    // hole's connection stays byte-identical to the Phase J one.
    ...(hole.index > 0 ? { holeIndex: hole.index } : {}),
    // Seated on the far opening (Phase Q); the drill side writes no key.
    ...(hole.side === 'far' ? { side: 'far' } : {}),
    offset: draft.connections?.[0]?.offset ?? 0,
  }));
  const first = holes[0];
  const frame = placeFrame(first.point, first.normal);
  return {
    ...draft,
    partId: newPart.id,
    newPart,
    newInstance: instances[0],
    extraInstances: instances.slice(1),
    feature,
    connections,
    placement: {
      ...p,
      stage: 'shape',
      frame,
      seat: { instanceId: first.instanceId, partId: first.partId, name: first.name },
      label: faceLabel(first.normal),
      grid: first.faceFrame || frame,
      snapKind: 'hole centre',
      hostInstanceId: instances[0].id,
      holes,
      problem: '',
      sideNote: '',
    },
  };
}

// The Chosen holes list's Remove: in Place the toggle; in Shape the result is
// rebuilt with the shorter list, and removing the last goes back to Place.
export function removeChosenHole(draft, key, ctx) {
  const holes = chosenHoles(draft).filter((h) => holeKey(h) !== key);
  if (draft.placement?.stage !== 'shape') return choosing(draft, holes);
  if (!holes.length) return hardwareReplace(draft);
  return finishHardware({ ...draft, placement: { ...draft.placement, holes } }, ctx);
}

// ---------------------------------------------------------------- side

// The other opening of a chosen hole (a holeCentres candidate), or null: a
// hole that stops in the material has only its drill side.
function otherOpening(hole, centres) {
  return (
    centres.find(
      (h) =>
        h.instanceId === hole.instanceId &&
        h.featureId === hole.featureId &&
        (h.index || 0) === (hole.index || 0) &&
        sideOf(h) !== sideOf(hole),
    ) || null
  );
}

// Openings this close (mm) are one: parts stacked face to face.
const STACKED = 0.05;
// The other side of a chosen hole: through it to its other opening, then on
// through every attachable hole of a part stacked against that opening on
// the same axis (its opening on the same spot, facing back): an angle bar
// lying on a board with coaxial holes flips from the bar's top to the
// board's underside, where a screw from below puts its head. null: the hole
// stops in the material.
function otherSide(hole, centres) {
  let end = otherOpening(hole, centres);
  if (!end) return null;
  const passed = new Set([holeKey(hole)]);
  for (;;) {
    const next = centres.find(
      (h) =>
        h.attachable &&
        !passed.has(holeKey(h)) &&
        Math.hypot(...h.point.map((v, i) => v - end.point[i])) <= STACKED &&
        h.normal.reduce((sum, v, i) => sum + v * end.normal[i], 0) < -0.999,
    );
    const beyond = next ? otherOpening(next, centres) : null;
    if (!beyond) return end;
    passed.add(holeKey(next));
    end = beyond;
  }
}

// Whether Flip side can move any chosen hole (the button, F and the hint).
export function canFlipSide(draft, ctx, centres = null) {
  const holes = chosenHoles(draft);
  if (draft?.placement?.tool !== 'hardware' || !holes.length) return false;
  const list = centres || holeCentres(ctx);
  return holes.some((hole) => otherOpening(hole, list));
}

// Flip side (Phase Q §4.5, tight areas): every chosen hole that has the
// other opening moves to the other side (otherSide: through a stack of
// coaxial holes to its far end), in Place (the rings move) and seated in
// Shape (the result is rebuilt; ids of holes that stay and the offset are
// kept). Holes with no other opening stay, and the hint says how many; two
// chosen holes of one stack end up as one. Draft-only: Apply is one history
// step.
export function flipHardwareSide(draft, ctx) {
  const p = draft.placement;
  const holes = chosenHoles(draft);
  if (p?.tool !== 'hardware' || !holes.length) throw new Error(NO_HOLES);
  const centres = holeCentres(ctx);
  let stuck = 0;
  const seen = new Set();
  const flipped = holes
    .map((hole) => {
      const other = otherSide(hole, centres);
      if (other) return openingRecord(other, ctx);
      stuck += 1;
      return hole;
    })
    .filter((hole) => !seen.has(holeKey(hole)) && seen.add(holeKey(hole)));
  if (stuck === holes.length) throw new Error(NO_OTHER_SIDE);
  const note = stuck ? `${holesText(stuck)} ${stuck === 1 ? 'has' : 'have'} no far opening` : '';
  if (p.stage !== 'shape' || !draft.connections?.length) return choosing(draft, flipped, note);
  const next = finishHardware({ ...draft, placement: { ...p, holes: flipped } }, ctx);
  return { ...next, placement: { ...next.placement, sideNote: note } };
}

// Axial offset (mm, or an expression): the same offset on every connection.
export function setHardwareOffset(draft, offset) {
  if (!draft.connections?.length) return draft;
  return { ...draft, connections: draft.connections.map((c) => ({ ...c, offset })) };
}

// ---------------------------------------------------------------- view

// The head / body radius of the hardware being seated (the hover ghost and
// the rings), 5 mm when its sizes do not resolve.
export function hardwareRadius(feature, parameters = {}) {
  try {
    const d = hardwareDimensions(feature, parameters);
    return Math.max(d.headDiameter, d.bodyDiameter, d.diameter) / 2;
  } catch {
    return 5;
  }
}

// A ring at every chosen centre, in the hole's face plane.
export function hardwareRings(draft, ctx) {
  const radius = hardwareRadius(draft.feature || draft.placement?.hardware, ctx.parameters || {});
  return chosenHoles(draft).map((h) => ({ frame: placeFrame(h.point, h.normal), radius }));
}

// The view parts for the layer: chosen keys (HUD; the value is the side
// chosen), the hint and the rings.
export function chosenView(draft, ctx, view) {
  const p = draft.placement;
  const holes = chosenHoles(draft);
  view.place = {
    ...view.place,
    chosen: Object.fromEntries(holes.map((h) => [holeKey(h), sideOf(h)])),
    chosenCount: holes.length,
  };
  if (p.stage === 'place') view.hint = holes.length ? HARDWARE_HINTS.chosen(holes.length) : HARDWARE_HINTS.place;
  const seated = p.stage === 'shape' && draft.connections?.length;
  if (seated) view.hint = HARDWARE_HINTS.seated(holes.length || draft.connections.length);
  // Phase Q: what Flip side could not move, and F while it can move one.
  if (holes.length && (p.stage === 'place' || seated)) {
    if (p.sideNote) view.hint += ` · ${p.sideNote}`;
    if (canFlipSide(draft, ctx, view.holeCentres || null)) view.hint += HARDWARE_HINTS.flip;
  }
  if (holes.length && (p.stage === 'place' || seated))
    view.shape = { kind: 'rings', circles: hardwareRings(draft, ctx) };
  return view;
}

// ---------------------------------------------------------------- panel

const featureOf = (ctx, hole) => {
  const instance = ctx.model.instances.find((i) => i.id === hole.instanceId);
  const part = ctx.model.parts.find((p) => p.id === (hole.partId || instance?.partId));
  return part?.features.find((f) => f.id === hole.featureId) || null;
};
// How many holes the row has (the kernel's centres, else the stored count).
const rowCountOf = (ctx, hole, feature) => {
  const instance = ctx.model.instances.find((i) => i.id === hole.instanceId);
  const metrics = ctx.snapshot?.parts?.find((p) => p.id === (hole.partId || instance?.partId))?.features?.[
    hole.featureId
  ];
  return metrics?.row?.centres?.length || num(feature?.row?.count, ctx.parameters, 0) || null;
};

// "Hole 2 of 4 · Board" for a row centre, "Hole · Board · Ø 6.6" for a
// single hole.
export function holeLabel(hole, ctx) {
  const feature = featureOf(ctx, hole);
  const count = feature?.row ? rowCountOf(ctx, hole, feature) : null;
  // Seated on the far opening (Phase Q).
  const far = sideOf(hole) === 'far' ? ' · far side' : '';
  if (count) return `Hole ${(hole.index || 0) + 1} of ${count} · ${hole.name}${far}`;
  const diameter = feature ? num(feature.diameter, ctx.parameters, null) : null;
  return `Hole · ${hole.name}${diameter != null ? ` · Ø ${fmt(diameter)}` : ''}${far}`;
}

// Hardware already seated in this hole (washers and nuts stack): the part
// names of the existing concentric connections to it.
function seatedIn(hole, ctx) {
  return (ctx.model.connections || [])
    .filter(
      (c) =>
        c.type === 'concentric' &&
        c.to === hole.instanceId &&
        c.toFeatureId === hole.featureId &&
        (Number.isInteger(c.holeIndex) ? c.holeIndex : 0) === (hole.index || 0),
    )
    .map((c) => {
      const instance = ctx.model.instances.find((i) => i.id === c.from);
      return instance?.name || ctx.model.parts.find((p) => p.id === instance?.partId)?.name || null;
    })
    .filter(Boolean);
}

// The Chosen holes list rows: { key, label, removeLabel }.
export function chosenHoleRows(draft, ctx) {
  return chosenHoles(draft).map((hole) => {
    const label = holeLabel(hole, ctx);
    const has = seatedIn(hole, ctx);
    const [what, ...rest] = label.split(' · ');
    const on = rest.filter((part) => part !== hole.name && part !== 'far side');
    const far = sideOf(hole) === 'far' ? ', far side' : '';
    return {
      key: holeKey(hole),
      label: has.length ? `${label} · has ${listText(has)}` : label,
      removeLabel: `Remove ${[what.toLowerCase(), ...on].join(' ')} on ${hole.name}${far}`,
    };
  });
}

// "Board", "Board and Bracket", "2 × Bracket".
function hostsText(holes) {
  const groups = [];
  const seen = new Set();
  for (const hole of holes) {
    if (seen.has(hole.instanceId)) continue;
    seen.add(hole.instanceId);
    const group = groups.find((g) => g.name === hole.name);
    if (group) group.count += 1;
    else groups.push({ name: hole.name, count: 1 });
  }
  return listText(groups.map((g) => (g.count > 1 ? `${g.count} × ${g.name}` : g.name)));
}

// The placement line ('' when this module has nothing to say: the caller
// keeps the Phase J text for no holes and for one seated hole).
export function hardwareSummary(draft, ctx) {
  const p = draft.placement;
  const holes = chosenHoles(draft);
  const name = draft.newPart?.name || hardwareName(draft.feature || p.hardware);
  if (p.stage === 'place')
    return holes.length ? `${name} · ${holesText(holes.length)} chosen on ${hostsText(holes)} · Enter seats it` : '';
  if (holes.length < 2 || !draft.connections?.length) return '';
  const line = `${name} in ${holesText(holes.length)} on ${hostsText(holes)}`;
  const one = holes.every((h) => h.instanceId === holes[0].instanceId && h.featureId === holes[0].featureId);
  if (!one || !featureOf(ctx, holes[0])?.row) return line;
  const numbers = [...new Set(holes.map((h) => (h.index || 0) + 1))].sort((a, b) => a - b);
  return `${line} · holes ${listText(numbers.map(String))} of the row`;
}
