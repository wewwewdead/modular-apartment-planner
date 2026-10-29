import { elevationElementOutline, getVisibleElevationDrawables } from '@/elevations/visibility';
import { unionRegions } from '@/geometry/polygonBoolean';

const cache = new WeakMap();
const EPSILON = 1e-6;

function subtractAperture(rect, opening) {
  const left = Math.max(rect.left, opening.left);
  const right = Math.min(rect.right, opening.right);
  const bottom = Math.max(rect.bottom, opening.bottom);
  const top = Math.min(rect.top, opening.top);
  if (right - left <= EPSILON || top - bottom <= EPSILON) return [rect];
  return [
    { ...rect, right: left },
    { ...rect, left: right },
    { ...rect, left, right, top: bottom },
    { ...rect, left, right, bottom: top },
  ].filter((part) => part.right - part.left > EPSILON && part.top - part.bottom > EPSILON);
}

function sectionRectSurfaces(rect) {
  if (rect.isOpeningCut) {
    return rect.insertIntervals.map((interval, index) => ({
      ...rect,
      ...interval,
      id: `${rect.id}-insert-${index}`,
      isOpeningCut: false,
      isInsert: true,
    }));
  }
  if (!rect.apertures?.length) return [rect];
  // Keep the original outline and reveal edges for strokes, so partitioning a
  // wall around a doorway never invents seams across its solid material.
  const strokeOutlines = [elevationElementOutline(rect), ...rect.apertures.map(elevationElementOutline)];
  return rect.apertures
    .reduce((parts, aperture) => parts.flatMap((part) => subtractAperture(part, aperture)), [rect])
    .map((part, index) => ({ ...part, id: `${rect.id}-solid-${index}`, strokeOutlines }));
}

export function getVisibleSectionDrawables(scene) {
  if (!scene) return [];
  if (cache.has(scene)) return cache.get(scene);
  const adapted = {
    elements: (scene.rectElements || []).flatMap(sectionRectSurfaces),
    polygonElements: scene.polygonElements || [],
    lineElements: [...(scene.lineElements || []), ...(scene.stairElements || [])].flatMap((element) =>
      element.points.slice(1).map((end, index) => ({
        ...element,
        points: undefined,
        id: `${element.id}-segment-${index}`,
        start: element.points[index],
        end,
      })),
    ),
  };
  const visible = getVisibleElevationDrawables(adapted);
  const groups = new Map();
  const result = [];
  // Roof triangles and partitioned wall material share their original stroke
  // outlines. Rejoin their visible fills to avoid anti-aliased triangle seams.
  for (const element of visible) {
    if (!element.strokeOutlines) {
      result.push(element);
      continue;
    }
    let group = groups.get(element.strokeOutlines);
    if (!group) {
      group = { ...element, visibleRegions: [] };
      groups.set(element.strokeOutlines, group);
      result.push(group);
    }
    group.visibleRegions.push(...element.visibleRegions);
  }
  for (const group of groups.values()) group.visibleRegions = unionRegions(group.visibleRegions);
  cache.set(scene, result);
  return result;
}
