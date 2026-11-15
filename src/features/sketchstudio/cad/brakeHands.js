// The press brake, hands on the sheet (docs/sketch-studio-brake-hands-on.md
// HO-1): the rules the view's grip (brakeGrip.js, hosted by shopLayer.js),
// the viewport and the workspace share. When the sheet turns between two rest
// poses (§5.3), where the handles stand (§5.2), how far a drag has gone, what
// the chips say, the two acts' outcomes worked out before the click (§5.4)
// and the F / T keys (§5.5). HO-2 (§6) adds setting the hit on the sheet: an
// edge's run on the posed sheet and its pick, the order things are picked in
// under the pointer, L from a drag of the backgauge fingers and where the
// fingers are a handle, and the words for all of it. Pure: plain numbers and
// three.js maths only.
import { Quaternion, Matrix4, Vector3 } from 'three';
import { brakePatch, brakeStation, turnAround } from './brakeStation.js';
import { transformPoint } from './sheetMetal.js';

// ---------------------------------------------------------------- the turn rule (§5.3)
// Two flat directions to the backgauge closer than this (2°) are the same edge.
export const BACK_SAME = Math.cos((2 * Math.PI) / 180);

/**
 * The flat-blank direction that points to the backgauge in a pose (§5.3):
 * the bend in the die's normal signed by the side brakeFrame puts back (the
 * fixed side lies on −n, see pressBrake.js backSide), or, with no bend in the
 * die, the blank's own +Y (flatFrame lays it toward the back; −Y turned over).
 * `bend`: the posed bend in the die (its flat `n`), or null; `back`: the
 * frame's 'fixed' | 'moving'.
 */
export function backDirection(bend, back, flipped = false) {
  if (!bend) return [0, flipped ? -1 : 1];
  const sign = back === 'moving' ? 1 : -1;
  return [bend.n[0] * sign, bend.n[1] * sign];
}

/**
 * Whether the sheet turns between two rest poses of one station (§5.3): the
 * side up changed, or the edge of the blank that faces the backgauge did.
 * Each pose: { flipped, back (backDirection), scrub (a made step shown: its
 * own pose, never swung to), film (a replay's pose: only the side up counts,
 * as before) }. A new L, angle, tooling or bend shape changes neither.
 */
export function turnChanged(before, after) {
  if (!before || !after) return false;
  if (Boolean(before.flipped) !== Boolean(after.flipped)) return true;
  if (before.scrub || after.scrub || before.film || after.film || !before.back || !after.back) return false;
  return before.back[0] * after.back[0] + before.back[1] * after.back[1] < BACK_SAME;
}

// ---------------------------------------------------------------- where the hands go (§5.2)
/**
 * The grip's anchor (§5.2): the middle of the part's edge nearest the
 * operator, on the part. `points`: the posed part's outline corners, both
 * faces, in the machine frame (X along the bed, the operator at −Y, Z up).
 * The front is every corner within 2 % of the part's depth (at least 0.5 mm)
 * of the nearest one; the anchor is the middle of their run along X, at the
 * top of them. { point, edge: [x0, x1] (the front's run, where the anchor may
 * slide to stay in view), y, z }, or null with no points.
 */
export function gripAnchor(points) {
  if (!points?.length) return null;
  let minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const near = minY + Math.max(0.5, (maxY - minY) * 0.02);
  let x0 = Infinity,
    x1 = -Infinity,
    z = -Infinity;
  for (const p of points) {
    if (p[1] > near) continue;
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[2] > z) z = p[2];
  }
  return { point: [(x0 + x1) / 2, minY, z], edge: [x0, x1], y: minY, z };
}

/**
 * Where along the front edge the anchor stands (§5.2): the middle when its
 * screen spot lies in the free part of the view, else the sample nearest the
 * middle that does, else the middle (hidden by the caller when off the
 * canvas). `spots`: [{ x (machine mm along the edge), screen: [px, py] }] in
 * the order to try (the middle first); `rect`: { left, top, right, bottom }.
 */
export function slideAnchor(spots, rect) {
  if (!spots.length) return null;
  const inside = ([px, py]) => px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
  return spots.find((s) => inside(s.screen)) || spots[0];
}

/**
 * The free part of the view (§4.9): the canvas less the station's card
 * column on the left, the view cube's corner and the hint line at the foot,
 * with `margin` px to spare. Rects in canvas px ({ left, top, right, bottom }).
 */
export function freeRect({ width, height, cards = [], cube = null, hint = null, margin = 8 }) {
  let left = margin,
    top = margin,
    right = width - margin,
    bottom = height - margin;
  for (const card of cards)
    if (card && card.right > 0 && card.left < width / 2) left = Math.max(left, card.right + margin);
  if (cube) top = Math.max(top, cube.bottom + margin);
  if (hint) bottom = Math.min(bottom, hint.top - margin);
  if (right - left < 40) left = Math.max(margin, right - 40);
  if (bottom - top < 40) top = Math.max(margin, bottom - 40);
  return { left, top, right, bottom };
}

/** Distance (px) from `p` to a screen polyline (the handle's arc as projected); Infinity with none. */
export function polylineDistance(points, p) {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i],
      [bx, by] = points[i + 1];
    const dx = bx - ax,
      dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(p[0] - ax - dx * t, p[1] - ay - dy * t));
  }
  return best;
}

/**
 * The rotation between two placements of the sheet (machine-frame matrices,
 * column-major arrays): q = to · from⁻¹. { axis (unit, or null for no turn),
 * degrees (0 … 180) }.
 */
export function relativeTurn(fromArray, toArray) {
  const qa = new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(fromArray));
  const qb = new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(toArray));
  const q = qb.multiply(qa.invert()).normalize();
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const degrees = (2 * Math.acos(Math.min(1, q.w)) * 180) / Math.PI;
  const s = Math.hypot(q.x, q.y, q.z);
  return { axis: s > 1e-9 ? [q.x / s, q.y / s, q.z / s] : null, degrees };
}

/** The machine axis nearest a direction: 'X' | 'Y' | 'Z' (the colour a handle takes, §5.2). */
export function nearestAxis(axis) {
  const a = (axis || [0, 0, 1]).map(Math.abs);
  return a[0] >= a[1] && a[0] >= a[2] ? 'X' : a[1] >= a[2] ? 'Y' : 'Z';
}

/**
 * A handle's axis before its outcome arrives (§5.4): the flip turns about the
 * machine's Y with a line (a bend in the die keeps its back side at the
 * backgauge, so the sheet swaps ends), about X on a flat blank (flatFrame);
 * the turn always about the vertical.
 */
export const defaultGripAxis = (kind, lined) => (kind === 'turn' ? [0, 0, 1] : lined ? [0, 1, 0] : [1, 0, 0]);

// ---------------------------------------------------------------- the drag (§5.2)
// Pointer travel (px) below which a press and release is a click (the viewport's CLICK_PX).
export const GRIP_CLICK_PX = 4;
// The swept angle at or past which a release commits.
export const COMMIT_DEGREES = 90;

/**
 * A drag on a handle: `travel` (px the pointer has gone from the press) and
 * `degrees` (swept about the handle's axis, either direction). Inside the
 * dead zone it is still a press (`dragging` false, progress 0); past it the
 * sheet is `progress` (0 … 1, swept / 180°) along its turn, and a release
 * now `commit`s at 90° or more.
 */
export function gripDrag({ travel, degrees }) {
  const dragging = travel > GRIP_CLICK_PX;
  const swept = dragging ? Math.abs(degrees) || 0 : 0;
  return { dragging, swept, progress: Math.min(1, swept / 180), commit: dragging && swept >= COMMIT_DEGREES - 1e-9 };
}

// ---------------------------------------------------------------- words (§4.3, §5.2)
export const GRIP_NAMES = Object.freeze({ flip: 'Flip sheet', turn: 'Turn sheet around' });
export const GRIP_KEYS = Object.freeze({ flip: 'F', turn: 'T' });
const DONE = { flip: 'Flipped over', turn: 'Turned around' };
const VERB = { flip: 'flip', turn: 'turn it around' };

// A message as its first sentence (what is wrong) and the rest (the remedy):
// ShopFloor.jsx splitMessage's rule, decimal points are not sentence ends.
const firstSentence = (message) => {
  const at = String(message).search(/[.:;] (?=[A-Z])/);
  return at < 0 ? String(message) : message.slice(0, at + 1);
};

/**
 * What a hit tried with something changed says (the blade picker's cards,
 * brake blades §4.1, and the grip's chips): clears, or its first refusal or
 * collision as the fact, without its remedy or the "This hit:" lead.
 * `option`: { error, refusals, collision (the hit, or null) }. { ok, text }.
 */
export function hitVerdict(option) {
  const message = option.error || option.refusals?.[0]?.message || option.collision?.message || '';
  if (!message) return { ok: true, text: 'Clears this hit' };
  return { ok: false, text: firstSentence(message).replace(/^(This hit|Bend \d+): /, '') };
}

/**
 * A station worked out after an act (§5.4), as the grip uses it: { view (the
 * pose the sheet turns toward), hit (a hit is pending), ok (it passes), fact
 * (the first refusal or collision, else null) }; null for a station that
 * cannot be posed.
 */
export function brakeOutcome(station) {
  if (!station || station.closed || station.error) return null;
  const pending = station.pending;
  if (!pending) return { view: station.view, hit: false, ok: false, fact: null };
  const verdict = hitVerdict({
    error: pending.error,
    refusals: pending.refusals || [],
    collision: pending.collision?.hit || null,
  });
  return { view: station.view, hit: true, ok: verdict.ok, fact: verdict.ok ? null : verdict.text };
}

// The fact inside a chip's sentence: lower case after the colon (not an
// abbreviation like "V10"), no closing full stop.
const inSentence = (fact) => {
  const text = String(fact).replace(/\.$/, '');
  return /^[A-Z][a-z]/.test(text) ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
};

/** The second line of a handle's chip (§5.2): what the act would leave, or null with no hit pending. */
export function outcomeLine(kind, outcome) {
  if (!outcome?.hit) return null;
  return outcome.ok ? `${DONE[kind]} it clears` : `${DONE[kind]}: ${inSentence(outcome.fact)}`;
}

/** A handle's chip on approach (§5.2): { title: 'Flip sheet · F', outcome (line 2 or null) }. */
export const gripChip = (kind, outcome) => ({
  title: `${GRIP_NAMES[kind]} · ${GRIP_KEYS[kind]}`,
  outcome: outcomeLine(kind, outcome),
});

/** The chip by the cursor while a handle is dragged: `Flip sheet · 120° · release to flip`. */
export function dragChip(kind, degrees) {
  const shown = Math.round(Math.abs(degrees) || 0);
  return `${GRIP_NAMES[kind]} · ${shown}° · ${
    shown >= COMMIT_DEGREES ? `release to ${VERB[kind]}` : 'release to leave it'
  }`;
}

/**
 * The viewport's hint line at the brake (§5.5), before the orbit / pan / zoom
 * hint. With no line (HO-2 §6.1) an edge is clicked on the sheet; two points
 * are still clicked on the flat blank (`mode` 'points').
 */
export const brakeHint = (lined, mode = 'gauge') =>
  lined
    ? 'Drag a ring on the sheet to flip or turn it · F flip · T turn around · Enter bends · Esc clears the line'
    : mode === 'points'
      ? 'Click two points on the flat blank · F flips the sheet'
      : 'Click an edge of the sheet: it goes to the backgauge · F flips the sheet';

// ---------------------------------------------------------------- the acts and keys (§5.4, §5.5)
/**
 * The session patch an act makes (§5.1, §5.4): exactly what the panel's
 * controls make. Flip sheet toggles `flip`; Turn sheet around is
 * brakeStation.js turnAround (the opposite edge, or `turned`). Both drop a
 * scrub. `station`: brakeStation(); null when the act cannot be made (Turn
 * with no line).
 */
export function brakeActPatch(kind, station, session) {
  if (kind === 'flip') return { flip: !session.flip, scrub: null };
  if (kind === 'turn' && actLined(station, session)) return { ...turnAround(station, session), scrub: null };
  return null;
}
/** The punch line is picked (Turn sheet around needs one): a gauge edge, or two points. */
export const actLined = (station, session) =>
  Boolean(station?.edge) || (session?.mode === 'points' && (session.points || []).length === 2);

// The pair of outcomes may cost this much after a settle (§5.4); a part
// whose pair would cost more (the kiosk face frame) works each out on the
// first approach of its handle instead.
export const HANDS_BUDGET_MS = 50;

/**
 * The acts' outcomes (§5.4): the station on the session after each act, the
 * facts only (`advise: false`), each brakeOutcome (turn: null with no line).
 * Applied as the workspace applies a patch (brakeStation.js brakePatch).
 * `kinds`: the acts to work out (both by default); { flip, turn } with only those.
 */
export function brakeHandOutcomes({ model, session, params, station, kinds = ['flip', 'turn'] }) {
  const after = (kind) => {
    const patch = brakeActPatch(kind, station, session);
    if (!patch) return null;
    return brakeOutcome(brakeStation({ model, session: brakePatch(session, patch), params, advise: false }));
  };
  return Object.fromEntries(kinds.map((kind) => [kind, after(kind)]));
}

/**
 * F flips, T turns around (§5.5): in setup, not while typing in a field
 * (`editable`), not with Ctrl / Meta / Alt, not on key repeat. 'flip' |
 * 'turn' | null. T needs a line.
 */
export function brakeKeyAct(event, { setup, lined, editable }) {
  if (!setup || editable || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented)
    return null;
  const key = String(event.key || '').toLowerCase();
  if (key === 'f' || event.code === 'KeyF') return 'flip';
  if ((key === 't' || event.code === 'KeyT') && lined) return 'turn';
  return null;
}

// ---------------------------------------------------------------- a reference piece (§5.2)
/**
 * The world matrix that puts a re-posed sheet where the drawn one is (the
 * rigid-body rule, §5.2): two folds of the same blank can root differently
 * (a turned line can swap a bend's fixed and moving sides), so one piece is
 * matched by its flat centroid and the group matrix G' for the new pieces is
 * W · P'⁻¹, W = G · P the piece as drawn. `from`: { matrix (G, Matrix4),
 * pieces }, `to`: { pieces } (posed: each { centroid, matrix (column-major) }).
 * Returns a Matrix4, or null when no piece matches (then G itself serves).
 */
export function rebaseMatrix(from, to, tolerance = 0.5) {
  const ref = (from.pieces || []).reduce((best, p) => (!best || p.area > best.area ? p : best), null);
  if (!ref?.centroid) return null;
  const match = (to.pieces || []).find(
    (p) => p.centroid && Math.hypot(p.centroid[0] - ref.centroid[0], p.centroid[1] - ref.centroid[1]) < tolerance,
  );
  if (!match) return null;
  const world = from.matrix.clone().multiply(new Matrix4().fromArray(ref.matrix));
  return world.multiply(new Matrix4().fromArray(match.matrix).invert());
}

/**
 * How far apart two placements of the same pieces are (mm, degrees): the
 * largest distance any corner of `pieces` moves between matrix A · P and
 * B · P, and the rotation between A and B. The rigid-body checks (§5.2).
 */
export function placementGap(A, B, pieces) {
  let mm = 0;
  const p = new Vector3(),
    q = new Vector3();
  for (const piece of pieces)
    for (const [x, y] of piece.outer) {
      const P = new Matrix4().fromArray(piece.matrix);
      p.set(x, y, 0).applyMatrix4(P).applyMatrix4(A);
      q.set(x, y, 0).applyMatrix4(P).applyMatrix4(B);
      mm = Math.max(mm, p.distanceTo(q));
    }
  return { mm, degrees: relativeTurn(A.toArray(), B.toArray()).degrees };
}

// ---------------------------------------------------------------- HO-2: set the hit on the sheet (§6)
// An edge lights within this reach of the pointer (px): the flat-blank card's SNAP_PX.
export const EDGE_PICK_PX = 10;
// What is under the pointer, asked in this order (§6.3): the grip's handles,
// the backgauge fingers, the blades and the machine (the only pick that
// casts a ray at the station's meshes), the sheet's edges.
export const HAND_ORDER = Object.freeze(['grip', 'fingers', 'blade', 'edge']);

/**
 * The first thing under the pointer (§6.3): each of `pickers` ({ grip,
 * fingers, blade, edge }: () => a target or null) asked in HAND_ORDER, no
 * further than the first that finds one. { kind, ...target } or null.
 */
export function pickInOrder(pickers) {
  for (const kind of HAND_ORDER) {
    const found = pickers[kind]?.();
    // A target may name its own kind: the blades' ray finds the machine's other parts too.
    if (found) return { kind, ...found };
  }
  return null;
}

/**
 * A gauge edge of the flat blank on the sheet as posed (§6.1): its run on
 * each piece's outline (an edge an earlier bend crosses lies in its parts;
 * the bend zones between are left out), at mid thickness so it reads from
 * either face, carried through the piece's matrix and then `matrix` (the
 * machine frame, column-major; none: the part's own frame). `posed`: a posed
 * fold ({ thickness, pieces: [{ outer, matrix }] }); `edge`: pressBrake.js
 * gaugeEdges' { a, d, length }. [[p0, p1], …] (3D points).
 */
export function edgeSegments(posed, edge, matrix = null, tolerance = 1e-3) {
  const [ax, ay] = edge.a,
    [dx, dy] = edge.d;
  const z = posed.thickness / 2;
  const along = ([x, y]) => (x - ax) * dx + (y - ay) * dy;
  const off = ([x, y]) => Math.abs((x - ax) * -dy + (y - ay) * dx);
  const segments = [];
  for (const piece of posed.pieces) {
    const ring = piece.outer;
    const at = (s) => {
      const p = transformPoint(piece.matrix, [ax + dx * s, ay + dy * s, z]);
      return matrix ? transformPoint(matrix, p) : p;
    };
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i],
        q = ring[(i + 1) % ring.length];
      if (off(p) > tolerance || off(q) > tolerance) continue;
      const s0 = Math.max(0, Math.min(along(p), along(q))),
        s1 = Math.min(edge.length, Math.max(along(p), along(q)));
      if (s1 - s0 > tolerance) segments.push([at(s0), at(s1)]);
    }
  }
  return segments;
}

/**
 * The edge nearest the pointer `p` (px) within `reach` (§6.1), or null.
 * `lines`: [{ index, segments: [[a, b], …] }] on the canvas (px).
 */
export function nearestEdge(lines, p, reach = EDGE_PICK_PX) {
  let best = null,
    nearest = reach;
  for (const line of lines)
    for (const segment of line.segments) {
      const distance = polylineDistance(segment, p);
      if (distance <= nearest) {
        best = line.index;
        nearest = distance;
      }
    }
  return best;
}

/**
 * A box on the canvas (px: { left, top, right, bottom }) grown about its
 * middle to at least `min` px each way: a pointer target never under 24 px
 * across (§4.10), however far off the fingers stand.
 */
export function reachRect(rect, min = 24) {
  const grow = (lo, hi) => {
    const pad = Math.max(0, (min - (hi - lo)) / 2);
    return [lo - pad, hi + pad];
  };
  const [left, right] = grow(rect.left, rect.right),
    [top, bottom] = grow(rect.top, rect.bottom);
  return { left, top, right, bottom };
}

/** Whether a canvas point (px) lies in any of `rects`. */
export const inRects = (rects, [x, y]) => rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);

// L in the hand (§6.2): whole millimetres, a tenth with Alt.
export const FINGER_STEP = 1;
export const FINGER_FREE_STEP = 0.1;
const exactL = (value) => Math.round(value * 1e6) / 1e6;
/**
 * L after a drag of the fingers: `from` (the L the drag started from) plus
 * `travel` (mm the pointer has gone along the machine's Y, toward the back
 * positive), in FINGER_STEP steps (FINGER_FREE_STEP with Alt, `free`), never
 * below 0.
 */
export function fingerL(from, travel, { free = false } = {}) {
  const step = free ? FINGER_FREE_STEP : FINGER_STEP;
  return Math.max(0, exactL(Math.round((Number(from) + travel) / step) * step));
}

/**
 * Edge on (the horizontal plane through the fingers seen along its face):
 * the pointer's move `delta` (px) along an axis drawn `axis` px per mm on the
 * canvas, in mm. 0 when the axis has no length on screen.
 */
export function axisTravel(delta, axis) {
  const length = axis[0] * axis[0] + axis[1] * axis[1];
  return length > 1e-12 ? (delta[0] * axis[0] + delta[1] * axis[1]) / length : 0;
}

/** A typed L (digits + Enter while the fingers are in the hand): a number, at least 0, or null. */
export function typedL(text) {
  if (!/^\d*\.?\d+$|^\d+\.$/.test(String(text))) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Esc on a finger drag (§6.2, state-machines rule 4): the session patch that
 * puts the line back as it was before the drag. The drag's new L reset the
 * segments, the turn and the trims (brakeStation.js brakePatch: a new line);
 * a patch naming `skip` is not a new line, so this restores them exactly.
 */
export const fingerRestore = (session) => ({
  distance: session.distance,
  skip: session.skip || [],
  turned: Boolean(session.turned),
  punchTrim: session.punchTrim ?? null,
  dieTrim: session.dieTrim ?? null,
});

const fmtMm = (value, digits = 2) => Number(Number(value).toFixed(digits)).toString();
/**
 * A leg as the panel's Flange and Other leg rows show it (PressBrakePanel.jsx,
 * the one rule): one value, or each tab's when a stroke's tabs differ, in mm
 * without the unit. `key`: 'moving' (the flange) | 'fixed'. null with none.
 */
export function legsText(readouts, key) {
  const values = (readouts?.memberLegs || [readouts?.legs]).map((l) => l?.[key]).filter(Number.isFinite);
  if (!values.length) return null;
  const same = values.every((v) => Math.abs(v - values[0]) < 0.005);
  return same ? fmtMm(values[0]) : values.map((v) => fmtMm(v)).join(' · ');
}

const NO_FINGERS = Object.freeze({ offered: false, L: null, flange: null, why: null });
const lowerFirst = (text) => `${text[0].toLowerCase()}${text.slice(1)}`;
/**
 * Whether the backgauge fingers are a handle (§6.2): only where a millimetre
 * of drag is a millimetre of L, that is the fingers stand at the session's L
 * against its gauge edge. Elsewhere they are scenery and say why (a two-point
 * line, turned around with nothing to gauge, an offset's hit gauged for its
 * other line or off the opposite edge). `station`: brakeStation(). { offered,
 * L (the station's reading), flange (legsText of the hit, or null), why }.
 */
export function fingerOffer(station, session) {
  if (!station || station.error) return NO_FINGERS;
  const pending = station.pending && !station.pending.error ? station.pending : null;
  if (session?.mode === 'points')
    return pending ? { ...NO_FINGERS, why: 'No backgauge on a two-point line' } : NO_FINGERS;
  if (!station.edge || !pending) return NO_FINGERS;
  const L = station.gauge?.distance ?? null;
  if (L == null) return { ...NO_FINGERS, why: station.gauge?.reason || 'No backgauge for this line' };
  const at = station.view?.gaugeDistance;
  if (at == null || Math.abs(at - L) > 1e-6) {
    const first = pending.offset?.hits?.[0];
    return {
      ...NO_FINGERS,
      L,
      why: first?.around
        ? 'Gauged off the opposite edge for this hit: type L in the panel'
        : `Set for ${lowerFirst(first?.line || 'the other line')} of the offset: type L in the panel`,
    };
  }
  return { offered: true, L, flange: pending.offset ? null : legsText(pending.readouts, 'moving'), why: null };
}

/** The readout by the cursor while the fingers are dragged: `L 187 mm · flange 113.45`. */
export const fingerReadout = (L, flange) => `L ${fmtMm(L, 1)} mm${flange ? ` · flange ${flange}` : ''}`;

// The machine's parts that name themselves on approach and do nothing else (§6.3).
export const MACHINE_NAMES = Object.freeze({
  holder: 'Punch holder',
  ram: 'Ram',
  bed: 'Bed',
  beam: 'Backgauge beam',
  frame: 'Side frame',
});

/**
 * What a thing under the pointer says on approach (§6.1 – §6.3): { title,
 * line (a second line, or null) }, or null. `target`: pickInOrder's; `fingers`:
 * fingerOffer; `edges`: the station's gauge edges; `picked`: the edge at the
 * backgauge (its index) or null.
 */
export function reachChip(target, { fingers = null, edges = [], picked = null } = {}) {
  if (target?.kind === 'fingers')
    return fingers?.offered
      ? { title: `Backgauge · L ${fmtMm(fingers.L, 1)} · drag, or click to type`, line: null }
      : { title: 'Backgauge', line: fingers?.why || null };
  if (target?.kind === 'blade') return { title: `${target.name} ${target.blade} · click to change`, line: null };
  if (target?.kind === 'machine') return { title: MACHINE_NAMES[target.part] || target.name || '', line: null };
  if (target?.kind === 'edge') {
    const edge = edges.find((e) => e.index === target.index);
    const length = edge ? ` · ${fmtMm(edge.length)} mm` : '';
    return {
      title: `Edge ${target.index + 1}${length} · ${picked === target.index ? 'at the backgauge' : 'click: to the backgauge'}`,
      line: null,
    };
  }
  return null;
}
