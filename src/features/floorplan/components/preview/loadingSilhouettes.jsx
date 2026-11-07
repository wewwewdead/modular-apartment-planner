/**
 * Outlines for loading placeholders (docs/loading-states.md §3 rule 7): the
 * thing being prepared, drawn as one hairline from data already in memory. A
 * single pass over a handful of points — never more than a frame's worth of
 * work, whatever the project.
 */

function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) return null;
  // A degenerate box (a single wall seen end-on) still needs a viewBox.
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  return { minX, minY, width, height };
}

function pathFor(points, closed) {
  const valid = points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (valid.length < 2) return '';
  const [first, ...rest] = valid;
  return `M${first.x} ${first.y}${rest.map((point) => `L${point.x} ${point.y}`).join('')}${closed ? 'Z' : ''}`;
}

/** Closed outlines (`polygons`: arrays of `{x, y}`) plus open runs (`lines`). */
export function outlineSilhouette({ polygons = [], lines = [] }) {
  const all = [...polygons.flat(), ...lines.flat()];
  const box = boundsOf(all);
  if (!box) return null;
  const d = [...polygons.map((points) => pathFor(points, true)), ...lines.map((points) => pathFor(points, false))]
    .filter(Boolean)
    .join(' ');
  if (!d) return null;
  return {
    viewBox: `${box.minX} ${box.minY} ${box.width} ${box.height}`,
    children: <path d={d} />,
  };
}

/** A floor's slab outlines; its walls when it has no slab yet. */
export function floorSilhouette(floor) {
  if (!floor) return null;
  const slabs = (floor.slabs || []).map((slab) => slab.boundaryPoints || []).filter((points) => points.length >= 3);
  if (slabs.length) return outlineSilhouette({ polygons: slabs });
  const walls = (floor.walls || []).map((wall) => [wall.start, wall.end]);
  return walls.length ? outlineSilhouette({ lines: walls }) : null;
}

/** A ceiling's boundary, as the RCP will draw it. */
export function ceilingSilhouette(ceiling) {
  const boundary = ceiling?.boundaryPolygon || [];
  return boundary.length >= 3 ? outlineSilhouette({ polygons: [boundary] }) : null;
}

/**
 * A wall's elevation: its length by its height, with every door and window
 * cut out where it sits. Elevation y runs down from the top of the wall.
 */
export function wallElevationSilhouette(wall, floor) {
  if (!wall?.start || !wall?.end) return null;
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const height = Number(wall.height) || 0;
  if (!(length > 0) || !(height > 0)) return null;
  const openings = [...(floor?.doors || []), ...(floor?.windows || [])].filter((opening) => opening.wallId === wall.id);
  const rect = (x, y, width, h) => `M${x} ${y}h${width}v${h}h${-width}Z`;
  const d = [
    rect(0, 0, length, height),
    ...openings
      .filter((opening) => opening.width > 0 && opening.height > 0)
      .map((opening) => {
        // Offsets are centres along the wall, measured from its start.
        const left = Math.max(0, opening.offset - opening.width / 2);
        const top = Math.max(0, height - (opening.sillHeight || 0) - opening.height);
        return rect(left, top, Math.min(opening.width, length - left), Math.min(opening.height, height - top));
      }),
  ].join(' ');
  return { viewBox: `0 0 ${length} ${height}`, children: <path d={d} /> };
}
