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

/** `previous` when every element of `next` is the very same object, otherwise `next`. */
export function reuseArrayIfSameElements(previous, next) {
  if (!Array.isArray(previous) || previous.length !== next.length) return next;
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) return next;
  }
  return previous;
}
