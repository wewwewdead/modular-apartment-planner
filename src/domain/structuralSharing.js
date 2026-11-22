/**
 * Structural sharing for the project syncs.
 *
 * `syncProjectStructures` re-normalises the truss systems and the roof on every
 * edit, and both syncs build their result from scratch with object spread — so
 * a wall painted on the ground floor handed back a brand-new truss system and a
 * brand-new roof that were, field for field, the ones it was given. Everything
 * keyed on those objects' identity downstream (the truss geometry memo, the
 * roof attachment memo, the 3D preview's per-floor `sourceKey`) then missed,
 * and the building's whole roof structure was re-derived for a coat of paint
 * (docs/paint-edit-performance.md §1.2).
 *
 * `reuseIfEqual` keeps the object the sync was given whenever the one it built
 * is the same value. This is not a memo and not a hash: it compares every field
 * the sync produced, all the way down, so it can only ever hand back an object
 * that is indistinguishable from the fresh one — whatever the sync read to
 * build it. The comparison is cheap next to what it saves (a truss system or a
 * roof is a few hundred plain fields).
 */

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Deep equality over plain data: primitives by `Object.is`, arrays element by
 * element, plain objects by their own enumerable keys (a key that is present
 * with `undefined` differs from one that is absent). Anything else — a Map, a
 * Date, a class instance — is equal only to itself, which is the conservative
 * answer: the caller then keeps the fresh object.
 */
export function plainValuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!plainValuesEqual(a[index], b[index])) return false;
    }
    return true;
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!plainValuesEqual(a[key], b[key])) return false;
  }
  return true;
}

/** `previous` when `next` is the same value, otherwise `next`. */
export function reuseIfEqual(previous, next) {
  return previous && next && plainValuesEqual(previous, next) ? previous : next;
}

/**
 * `next` with every part that is the same value as the matching part of
 * `previous` swapped for `previous`'s object — all the way down, and `previous`
 * itself when the whole is the same.
 *
 * Unlike `reuseIfEqual` this also keeps what it can of a value that DID change:
 * the canonical building sync rebuilds the whole `building` on every edit, and a
 * moved shaft must not hand every other system, the site and the unit list back
 * as new objects. "The same" is stricter here than `plainValuesEqual` in one
 * way: the keys must come in the same order, because the result is saved as it
 * is and a save must serialise exactly as the fresh value would. A part that is
 * not the same is a new container holding `next`'s keys in `next`'s order, so
 * whatever comes back serialises exactly as `next` does. Neither argument is
 * ever written to: history entries alias the project these parts come from.
 */
export function reuseUnchanged(previous, next) {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(next)) {
    if (!Array.isArray(previous)) return next;
    let samePrevious = previous.length === next.length;
    let sameNext = true;
    const values = new Array(next.length);
    for (let index = 0; index < next.length; index += 1) {
      const value = index < previous.length ? reuseUnchanged(previous[index], next[index]) : next[index];
      values[index] = value;
      if (samePrevious && value !== previous[index]) samePrevious = false;
      if (sameNext && value !== next[index]) sameNext = false;
    }
    if (samePrevious) return previous;
    return sameNext ? next : values;
  }
  // Only ordinary objects are taken apart; anything else (and an object with no
  // prototype, which a rebuilt container would not reproduce) is kept as given.
  if (!isOrdinaryObject(next) || !isOrdinaryObject(previous)) return next;
  const nextKeys = Object.keys(next);
  const previousKeys = Object.keys(previous);
  let samePrevious = previousKeys.length === nextKeys.length;
  let sameNext = true;
  const values = new Array(nextKeys.length);
  for (let index = 0; index < nextKeys.length; index += 1) {
    const key = nextKeys[index];
    // An own `__proto__` key (JSON.parse can make one) cannot be rebuilt by assignment.
    if (key === '__proto__') return next;
    const inPrevious = Object.prototype.hasOwnProperty.call(previous, key);
    const value = inPrevious ? reuseUnchanged(previous[key], next[key]) : next[key];
    values[index] = value;
    if (samePrevious && (previousKeys[index] !== key || value !== previous[key])) samePrevious = false;
    if (sameNext && value !== next[key]) sameNext = false;
  }
  if (samePrevious) return previous;
  if (sameNext) return next;
  const result = {};
  for (let index = 0; index < nextKeys.length; index += 1) result[nextKeys[index]] = values[index];
  return result;
}

function isOrdinaryObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/** `previous` when every element of `next` is the very same object, otherwise `next`. */
export function reuseArrayIfSameElements(previous, next) {
  if (!Array.isArray(previous) || previous.length !== next.length) return next;
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) return next;
  }
  return previous;
}
