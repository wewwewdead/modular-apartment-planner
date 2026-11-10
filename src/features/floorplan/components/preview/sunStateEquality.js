/**
 * Whether two sun states (`computeSunVector`'s output, or null) would light
 * the scene identically.
 *
 * The preview recomputes the sun vector whenever the filtered project changes —
 * every edit — although it only reads the site and the study time. Applying an
 * equal vector re-ran the whole rig: a traversal, a 4096² shadow pass and a
 * restart of the progressive refine. Compared field by field rather than by
 * identity, so a fresh-but-equal object is recognised; any field that differs
 * (the scrubbed time moving the azimuth, a north-angle edit) counts.
 */
export function isSameSunState(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]));
}
