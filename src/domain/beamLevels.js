import { getFloorElevation, getFloorTopElevation } from './floorModels';

// A beam bears on the columns it spans, so its top sits at the top of those
// columns — not at whatever the storey's floor-to-floor height happens to say.
// The two are the same only while nobody has retyped a column height, and the
// difference is what a wall under the beam is built to: 3000 columns carrying a
// 450 beam leave 2550, whatever the storey is nominally.
//
// Where the two columns differ, the lower top governs: the beam cannot sit
// above the support that stops first.

function columnHeight(column) {
  const height = Number(column?.height);
  return Number.isFinite(height) && height > 0 ? height : null;
}

// The level one named column's head finishes at, or null when there is nothing
// to read there: no such column on the floor, or one carrying no usable height.
// This is the same arithmetic resolveBeamBearingLevel does per column, exposed
// on its own because not every caller wants that function's aggregation. A
// caller that has to answer for a group of ends differently — the ceiling band
// takes the HIGHEST head a bay's supports stand on, not the lowest — needs the
// column-top rule without inheriting either the MIN or the storey-height
// fallback, since a fallback folded in per end would let a deleted column speak
// for a column that is still there.
export function resolveColumnTopLevel(floor, columnId) {
  if (!columnId) return null;
  const height = columnHeight((floor?.columns || []).find((column) => column.id === columnId));
  return height === null ? null : getFloorElevation(floor) + height;
}

export function resolveBeamBearingLevel(floor, columnIds = []) {
  const wanted = new Set(columnIds.filter(Boolean));
  const heights = (floor?.columns || [])
    .filter((column) => wanted.has(column.id))
    .map(columnHeight)
    .filter((height) => height !== null);

  // Nothing to bear on — an unresolvable ref, or columns carrying no height.
  // The storey height is the only remaining statement about where the top is.
  if (!heights.length) return getFloorTopElevation(floor);

  return getFloorElevation(floor) + Math.min(...heights);
}

// The level the beam tool will use for a top beam on this floor, before the
// user has picked which columns to span. Reported by the toolbar, so it has to
// answer for the floor as a whole: the lowest column top is the one that binds.
export function resolveFloorBeamBearingLevel(floor) {
  return resolveBeamBearingLevel(
    floor,
    (floor?.columns || []).map((column) => column.id),
  );
}
