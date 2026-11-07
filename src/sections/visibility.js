import { createElevationVisibilityJob, elevationElementOutline } from '@/elevations/visibility';
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

function adaptSectionScene(scene) {
  return {
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
}

// Roof triangles and partitioned wall material share their original stroke
// outlines. Rejoin their visible fills to avoid anti-aliased triangle seams.
function groupByStrokeOutlines(visible) {
  const groups = new Map();
  const result = [];
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
  return { result, groups: [...groups.values()] };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The section's visibility pass as a resumable job — the elevation job over
 * the adapted scene, then the per-outline unions, each stoppable between two
 * units of work. `step(budgetMs)` returns `{ done, resolved, total }`; once
 * done, `result` is set and cached on the scene, identical to what the
 * synchronous `getVisibleSectionDrawables` returns.
 */
export function createSectionVisibilityJob(scene) {
  let result = !scene ? [] : cache.get(scene);
  let inner = null;
  let grouped = null;
  let unionIndex = 0;

  return {
    get result() {
      return result;
    },
    step(budgetMs = Infinity) {
      if (result) return { done: true, resolved: 1, total: 1 };
      const deadline = now() + budgetMs;
      if (!inner) inner = createElevationVisibilityJob(adaptSectionScene(scene), { cache: false });
      if (!grouped) {
        const progress = inner.step(budgetMs);
        if (!progress.done) return { done: false, resolved: progress.resolved, total: progress.total + 1 };
        grouped = groupByStrokeOutlines(inner.result);
      }
      const { groups } = grouped;
      while (unionIndex < groups.length) {
        groups[unionIndex].visibleRegions = unionRegions(groups[unionIndex].visibleRegions);
        unionIndex += 1;
        if (now() >= deadline && unionIndex < groups.length) {
          return { done: false, resolved: unionIndex, total: groups.length + 1 };
        }
      }
      result = grouped.result;
      cache.set(scene, result);
      return { done: true, resolved: 1, total: 1 };
    },
  };
}

/** The cached visible drawables of a section scene, or undefined if the pass has not run. */
export function peekVisibleSectionDrawables(scene) {
  return scene ? cache.get(scene) : [];
}

export function getVisibleSectionDrawables(scene) {
  if (!scene) return [];
  if (cache.has(scene)) return cache.get(scene);
  const job = createSectionVisibilityJob(scene);
  job.step(Infinity);
  return job.result;
}
