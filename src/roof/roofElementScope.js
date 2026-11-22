/**
 * Drawing elements from several roofs in one view (docs/multi-roof.md §4.8b).
 *
 * A roof's derived pieces (trim boards, gutters, downpipes, ridges) take ids
 * that are unique within that roof only, so two roofs drawn into one section,
 * elevation or sheet could hand the renderer the same key twice. With more than
 * one roof each element id is prefixed by its roof's id; with one roof the ids
 * are left exactly as they were, so a single-roof drawing does not change.
 */
export function scopeRoofElementIds(elements = [], roofSystem, roofCount) {
  if (roofCount <= 1 || !roofSystem?.id) return elements;
  return elements.map((element) => (element?.id ? { ...element, id: `${roofSystem.id}:${element.id}` } : element));
}
