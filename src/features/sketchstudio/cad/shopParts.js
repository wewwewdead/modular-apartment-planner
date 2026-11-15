// What a part is to the shop (docs/sketch-studio-shop-floor.md §5.4): made
// here (fabricated), bought in (a display, a lock: a box part with
// `purchased`) or a fastener (a part made by the hardware library). Cut and
// Paint count fabricated parts only; the job sheet lists the rest by label.
// Pure and worker-safe: parts in, plain data out.
import { HARDWARE_TYPES, SCREW_KINDS, resolveHardware } from './hardware.js';
import { uid } from './model.js';

const fmt = (value) => (Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '—');
const partOf = (model, instanceId) =>
  model.parts.find((p) => p.id === model.instances.find((i) => i.id === instanceId)?.partId) || null;

/** A part made by the hardware library (a screw, a nut, a rivet …). */
export const isHardware = (part) => Boolean(part?.features?.some((f) => f?.type === 'hardware'));
/** A bought-in item (§5.4): a part with `purchased`. */
export const isPurchased = (part) => Boolean(part?.purchased);
/** Fabricated = made in the shop: not bought in and not hardware (§5.4). */
export const isFabricated = (part) => Boolean(part) && !isPurchased(part) && !isHardware(part);
export const instanceKind = (model, instanceId) => {
  const part = partOf(model, instanceId);
  return isHardware(part) ? 'fastener' : isPurchased(part) ? 'bought' : 'fabricated';
};

// "M4 × 12 pan head", "M4 hex nut": what a fastener reads in a list.
export function fastenerLabel(part) {
  const feature = part?.features?.find((f) => f?.type === 'hardware');
  if (!feature) return part?.name || 'Fastener';
  const r = resolveHardware(feature);
  const name = String(HARDWARE_TYPES[r.kind] || 'hardware')
    .replace(/ \(PEM style\)$/, '')
    .replace(/ (machine )?screw$/i, '')
    .toLowerCase();
  const long = Boolean(SCREW_KINDS[r.kind]) || ['bolt', 'stud'].includes(r.kind);
  return long && r.length != null ? `${r.size} × ${fmt(Number(r.length))} ${name}` : `${r.size} ${name}`;
}

/**
 * What is in `instanceIds` (a product's members) but not made here, by label
 * and count, bought-in items first: [{ label, count }] ("Display (bought in)",
 * "M4 × 12 pan head"), in the order each label first appears.
 */
export function notMadeHere(model, instanceIds) {
  const counts = new Map();
  for (const kind of ['bought', 'fastener'])
    for (const id of instanceIds) {
      if (instanceKind(model, id) !== kind) continue;
      const part = partOf(model, id);
      const label = kind === 'bought' ? `${part.name} (bought in)` : fastenerLabel(part);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  return [...counts].map(([label, count]) => ({ label, count }));
}

/**
 * A bought-in item (§5.4): a box part W × D × H with `purchased`, dropped with
 * its footprint centred on `at` (the view centre on the ground).
 */
export function boughtInItem({ name, width, depth, height, colour = '#22262a', reference = '' }, at = [0, 0, 0]) {
  for (const [label, value] of [
    ['Width', width],
    ['Depth', depth],
    ['Height', height],
  ])
    if (!(Number(value) > 0)) throw new Error(`${label} must be greater than zero.`);
  if (!/^#[0-9a-fA-F]{6}$/.test(colour)) throw new Error('Choose the item’s colour.');
  const id = uid('part');
  const part = {
    id,
    name: String(name || '').trim() || 'Bought-in item',
    material: 'Bought in',
    grain: null,
    purchased: { colour, reference: String(reference || '') },
    features: [{ id: uid('feature'), type: 'box', width: Number(width), depth: Number(depth), height: Number(height) }],
  };
  const instance = {
    id: uid('instance'),
    partId: id,
    name: '',
    position: [at[0] - Number(width) / 2, at[1] - Number(depth) / 2, 0],
    rotation: [0, 0, 0],
    visible: true,
  };
  return { part, instance };
}

// ------------------------------------------------------------ where new blanks land (SN-1)
// docs/sketch-studio-outline-edit-sheet-nest.md §4.8: new parts are laid out
// flat in rows, so a batch (or Quantity's copies) never lands one on another.
export const LANDING_GAP = 20;
export const LANDING_ROW = 2400;

/**
 * Rows for blanks `sizes` ([[w, h]] in order, mm, as cut, flat): along +X,
 * `gap` apart; a new row along +Y, `gap` clear of the row before by its
 * deepest blank, once a row would pass `row` mm (a row's first blank always
 * stands, however wide). Returns { slots: [[x, y]] (each blank's bounding-box
 * corner, from the lot's), size: [w, h] (the lot's) }.
 */
export function landingRows(sizes, { gap = LANDING_GAP, row = LANDING_ROW } = {}) {
  const slots = [];
  let x = 0,
    y = 0,
    depth = 0,
    width = 0;
  for (const [w, h] of sizes) {
    if (x > 0 && x + w > row) {
      y += depth + gap;
      x = 0;
      depth = 0;
    }
    slots.push([x, y]);
    width = Math.max(width, x + w);
    depth = Math.max(depth, h);
    x += w + gap;
  }
  return { slots, size: [width, slots.length ? y + depth : 0] };
}

/**
 * Where new blanks land (a single cut, a batch): their rows (landingRows),
 * the lot's bounding box centred on `at` (the view's drop point). `boxes`:
 * each blank's own bounds [[x0, y0], [x1, y1]]. Returns each instance's
 * position [x, y, 0]. One blank lands with its centre on `at`, exactly as a
 * single cut always has.
 *
 * A new cut never lands on a part (docs/sketch-studio-outline-edit-sheet-nest.md
 * §7.7): `taken` holds the XY boxes of what already stands (world). While the
 * lot there would overlap one, the whole lot moves on in the rows of
 * landingRows — slots its own size along +X, a new row along +Y — to the first
 * place clear of all of them (as copyPositions does for Quantity). An empty
 * view, or a clear drop point, gives exactly the centred position.
 */
export function landingPositions(boxes, at = [0, 0], { taken = [] } = {}) {
  const [ax, ay] = [Number(at[0]) || 0, Number(at[1]) || 0];
  let positions;
  if (boxes.length === 1) {
    const [[x0, y0], [x1, y1]] = boxes[0];
    positions = [[ax - (x0 + x1) / 2, ay - (y0 + y1) / 2, 0]];
  } else {
    const { slots, size } = landingRows(boxes.map(([[x0, y0], [x1, y1]]) => [x1 - x0, y1 - y0]));
    const ox = ax - size[0] / 2,
      oy = ay - size[1] / 2;
    positions = boxes.map(([[x0, y0]], i) => [ox + slots[i][0] - x0, oy + slots[i][1] - y0, 0]);
  }
  if (!taken.length || !boxes.length) return positions;
  // The lot where it would land, and whether it is clear moved by [dx, dy].
  const placed = boxes.map(([[x0, y0], [x1, y1]], i) => [
    [x0 + positions[i][0], y0 + positions[i][1]],
    [x1 + positions[i][0], y1 + positions[i][1]],
  ]);
  const clear = (dx, dy) =>
    placed.every(
      ([[x0, y0], [x1, y1]]) =>
        !taken.some((t) =>
          overlaps(t, [
            [x0 + dx, y0 + dy],
            [x1 + dx, y1 + dy],
          ]),
        ),
    );
  if (clear(0, 0)) return positions;
  const lot = [Math.min(...placed.map((b) => b[0][0])), Math.max(...placed.map((b) => b[1][0]))];
  const depth = [Math.min(...placed.map((b) => b[0][1])), Math.max(...placed.map((b) => b[1][1]))];
  const size = [lot[1] - lot[0], depth[1] - depth[0]];
  const moved = ([dx, dy]) => positions.map(([x, y, z]) => [x + dx, y + dy, z]);
  // Enough slots for every standing box to block one, doubled until one is clear.
  for (let n = Math.max(8, 2 * (taken.length + 1)); n <= 1 << 16; n *= 2) {
    const { slots } = landingRows(Array.from({ length: n }, () => size));
    const free = slots.slice(1).find(([dx, dy]) => clear(dx, dy));
    if (free) return moved(free);
  }
  // Never reached in practice: past everything standing, along +X.
  const right = Math.max(...taken.map((t) => t[1][0]));
  return moved([right + LANDING_GAP - lot[0], 0]);
}

// Two boxes [[x0, y0], [x1, y1]] that share more than a hair of area.
const overlaps = (a, b) =>
  a[0][0] < b[1][0] - 1e-6 && b[0][0] < a[1][0] - 1e-6 && a[0][1] < b[1][1] - 1e-6 && b[0][1] < a[1][1] - 1e-6;

/**
 * Quantity's new copies (§4.3): the same rows (landingRows), started beside
 * the station's instance — its slot is the first, the copies take the next
 * ones that are clear of `taken` (the boxes of what already stands) and of
 * each other. `position`: the instance's; `box`: its XY bounds as built
 * (world), or its blank's; `count`: how many. Returns the copies' positions
 * (the instance's moved by its slot; a copy keeps the instance's turn).
 */
export function copyPositions({ position, box, count, taken = [] }) {
  const [[x0, y0], [x1, y1]] = box;
  const size = [x1 - x0, y1 - y0];
  const kept = [...taken];
  const out = [];
  for (let n = Math.max(8, 2 * (count + taken.length + 1)); out.length < count; n *= 2) {
    out.length = 0;
    kept.length = taken.length;
    const { slots } = landingRows(Array.from({ length: n }, () => size));
    for (const [dx, dy] of slots.slice(1)) {
      const at = [
        [x0 + dx, y0 + dy],
        [x1 + dx, y1 + dy],
      ];
      if (kept.some((b) => overlaps(b, at))) continue;
      kept.push(at);
      out.push([position[0] + dx, position[1] + dy, position[2] ?? 0]);
      if (out.length === count) break;
    }
  }
  return out;
}
