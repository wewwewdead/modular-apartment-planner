import { isValidSlabBoundary } from '@/geometry/slabGeometry';
import { projectElevationDepth, projectElevationHorizontal } from './projection';

const EPSILON = 1e-6;

function getBoundaryEdges(points = []) {
  if (points.length < 2) return [];

  return points.map((point, index) => ({
    start: point,
    end: points[(index + 1) % points.length],
    index,
  }));
}

function projectEdge(view, edge) {
  const startHorizontal = projectElevationHorizontal(view, edge.start);
  const endHorizontal = projectElevationHorizontal(view, edge.end);
  const left = Math.min(startHorizontal, endHorizontal);
  const right = Math.max(startHorizontal, endHorizontal);

  if (Math.abs(right - left) < EPSILON) return null;

  return {
    left,
    right,
    depth: (
      projectElevationDepth(view, edge.start) +
      projectElevationDepth(view, edge.end)
    ) / 2,
    edgeIndex: edge.index,
  };
}

export function getSlabTopLevel(slab) {
  return slab?.elevation ?? 0;
}

export function getSlabBottomLevel(slab) {
  return getSlabTopLevel(slab) - (slab?.thickness ?? 0);
}

export function buildSlabElevationBands(slab, view) {
  if (!slab || !isValidSlabBoundary(slab.boundaryPoints)) return [];

  return getBoundaryEdges(slab.boundaryPoints)
    .map((edge) => projectEdge(view, edge))
    .filter(Boolean);
}
