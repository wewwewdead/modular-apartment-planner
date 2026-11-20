// Pattern (docs/sketch-studio-hand-drawing.md §7.4, HD-3): copies of a
// selection in a row, a grid (every other row staggered half a column if
// asked) or round a centre, each copy through sketchTransform.js; a copy that
// would lie exactly on a shape already there (sketchCheck.js sameGeometry) is
// left out and counted. Copy's guard (§7.3) is the same rule. Pure: no three,
// no DOM; it imports sketchTransform.js and sketchCheck.js only.
import { rotation, transformEntity, translation } from './sketchTransform.js';
import { anchorOf, sameGeometry } from './sketchCheck.js';

export const PATTERN_KINDS = [
  ['row', 'Row'],
  ['grid', 'Grid'],
  ['circle', 'Circle'],
];
// Over this many new shapes Apply asks once, and the ghost shows this many.
export const PATTERN_LIMIT = 2000;
// The settings a sketching session starts with. `center` null: the zero.
export const defaultPattern = () => ({
  kind: 'row',
  count: 4,
  dx: 20,
  dy: 0,
  columns: 4,
  rows: 3,
  columnStep: 30,
  rowStep: 20,
  stagger: false,
  center: null,
  total: 360,
});

const whole = (n) => Number.isInteger(n) && n >= 1;
const finite = (...values) => values.every(Number.isFinite);

/**
 * Why a pattern cannot be applied, in words; '' when it can. A count under 1
 * (or not whole), a step of zero with a count over 1, a total angle outside 0
 * – 360.
 */
export function patternRefusal(pattern) {
  const p = pattern || {};
  if (p.kind === 'grid') {
    if (!whole(p.columns) || !whole(p.rows)) return 'Columns and rows are whole numbers, 1 or more.';
    if (!finite(p.columnStep, p.rowStep)) return 'Type the column and row steps.';
    if ((p.columns > 1 && p.columnStep === 0) || (p.rows > 1 && p.rowStep === 0))
      return 'A step of zero puts the copies on the original: type a step.';
    return '';
  }
  if (!whole(p.count)) return 'The count is a whole number, 1 or more.';
  if (p.kind === 'circle') {
    if (!finite(p.total) || p.total <= 0 || p.total > 360) return 'The total angle is more than 0° and at most 360°.';
    return '';
  }
  if (!finite(p.dx, p.dy)) return 'Type the steps X and Y.';
  if (p.count > 1 && p.dx === 0 && p.dy === 0) return 'A step of zero puts the copies on the original: type a step.';
  return '';
}

/**
 * The transforms a pattern places copies with (the original's place left
 * out), in order: a row's i·step for i = 1 … count − 1; a grid's columns
 * across each row, rows upward, odd rows shifted half a column step with
 * `stagger`; a circle's turns about `center` (the zero when unset): at 360
 * evenly round (the last never on the first), less: from 0 to the total angle,
 * both ends included. [] when refused.
 */
export function patternTransforms(pattern, zero = [0, 0]) {
  if (patternRefusal(pattern)) return [];
  const p = pattern;
  if (p.kind === 'grid') {
    const list = [];
    for (let r = 0; r < p.rows; r++)
      for (let c = 0; c < p.columns; c++) {
        if (!r && !c) continue;
        list.push(translation(c * p.columnStep + (p.stagger && r % 2 ? p.columnStep / 2 : 0), r * p.rowStep));
      }
    return list;
  }
  if (p.kind === 'circle') {
    const center = p.center || zero;
    const full = p.total >= 360 - 1e-9;
    const step = full ? 360 / p.count : p.count > 1 ? p.total / (p.count - 1) : 0;
    return Array.from({ length: p.count - 1 }, (_, i) => rotation(center, step * (i + 1)));
  }
  return Array.from({ length: p.count - 1 }, (_, i) => translation(p.dx * (i + 1), p.dy * (i + 1)));
}

// Where a shape is looked for (cells of 1e-3 mm, sketchCheck.js's rule).
const CELL = 1e-3;
const cellOf = (p) => `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
/**
 * The shapes already there, to ask of a new one whether it would lie exactly
 * on one of them: { has(entity), add(entity) }.
 */
export function shapeIndex(entities = []) {
  const cells = new Map();
  const add = (entity) => {
    for (const p of anchorOf(entity)) {
      const key = cellOf(p);
      if (cells.has(key)) cells.get(key).push(entity);
      else cells.set(key, [entity]);
    }
  };
  const has = (entity) => {
    for (const p of anchorOf(entity)) {
      const [i, j] = [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)];
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++)
          for (const other of cells.get(`${i + di},${j + dj}`) || []) if (sameGeometry(other, entity)) return true;
    }
    return false;
  };
  for (const entity of entities) add(entity);
  return { has, add };
}

/**
 * `candidates` (new shapes) without those lying exactly on a shape of
 * `entities` or on an earlier candidate → { kept, leftOut }.
 */
export function withoutCopies(entities, candidates) {
  const index = shapeIndex(entities);
  const kept = [];
  let leftOut = 0;
  for (const entity of candidates) {
    if (index.has(entity)) leftOut++;
    else {
      kept.push(entity);
      index.add(entity);
    }
  }
  return { kept, leftOut };
}

/**
 * What a pattern of the entities `ids` would add: { copies (no ids yet, in
 * order: per transform, the selection in drawing order), leftOut (already
 * there), refusal }. Nothing changes.
 */
export function planPattern(entities, ids, pattern, { zero = [0, 0] } = {}) {
  const refusal = patternRefusal(pattern);
  if (refusal) return { copies: [], leftOut: 0, refusal };
  const chosen = new Set(ids);
  const selected = entities.filter((e) => chosen.has(e.id));
  const candidates = [];
  for (const T of patternTransforms(pattern, zero))
    for (const entity of selected)
      for (const piece of transformEntity(entity, T)) {
        const { id: _id, ...shape } = piece;
        candidates.push(shape);
      }
  const { kept, leftOut } = withoutCopies(entities, candidates);
  return { copies: kept, leftOut, refusal: '' };
}

/**
 * The pattern applied → { entities (the copies after the last entity, ids
 * from `nextId`), nextId, added: ids, leftOut, refusal }; the entities as
 * they were when it adds nothing.
 */
export function patternEntities(entities, ids, pattern, { zero = [0, 0], nextId = 1 } = {}) {
  const { copies, leftOut, refusal } = planPattern(entities, ids, pattern, { zero });
  let next = nextId;
  const added = copies.map((shape) => ({ id: `e${next++}`, ...shape }));
  return {
    entities: added.length ? [...entities, ...added] : entities,
    nextId: next,
    added: added.map((e) => e.id),
    leftOut,
    refusal,
  };
}

const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** "adds 22 · 2 left out: already there", "adds nothing", or the refusal. */
export function patternWords({ copies, leftOut, refusal }) {
  if (refusal) return refusal;
  const adds = copies.length ? `adds ${grouped(copies.length)}` : 'adds nothing';
  return leftOut ? `${adds} · ${grouped(leftOut)} left out: already there` : adds;
}
export { grouped as groupedCount };
