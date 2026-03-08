import { distance, midpoint, rotate } from './point';
import { pointInPolygon } from './polygon';

/**
 * Returns 4 corner points of the landing rectangle, rotated around its center.
 * Order: top-left, top-right, bottom-right, bottom-left
 * (where "top" = in the negative-y direction before rotation, matching plan-view convention)
 */
export function landingOutline(landing) {
  const { position, width, depth, rotation = 0 } = landing;
  if (!position) return [];

  const halfW = width / 2;
  const halfD = depth / 2;

  // Corners before rotation (centered on position)
  const corners = [
    { x: position.x - halfW, y: position.y - halfD },
    { x: position.x + halfW, y: position.y - halfD },
    { x: position.x + halfW, y: position.y + halfD },
    { x: position.x - halfW, y: position.y + halfD },
  ];

  if (rotation === 0) return corners;
  return corners.map((c) => rotate(c, position, rotation));
}

/**
 * Returns 4 named edges of the landing.
 * Names follow the stair convention:
 *   'top'    — width-axis edge at negative-y (before rotation)
 *   'bottom' — width-axis edge at positive-y
 *   'left'   — depth-axis edge at negative-x
 *   'right'  — depth-axis edge at positive-x
 */
export function landingEdges(landing) {
  const outline = landingOutline(landing);
  if (outline.length < 4) return [];

  const [tl, tr, br, bl] = outline;

  function makeEdge(name, start, end) {
    const mid = midpoint(start, end);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      name,
      start,
      end,
      midpoint: mid,
      normal: { x: -dy / len, y: dx / len },
    };
  }

  return [
    makeEdge('top', tl, tr),
    makeEdge('right', tr, br),
    makeEdge('bottom', br, bl),
    makeEdge('left', bl, tl),
  ];
}

export function landingContainsPoint(landing, point) {
  const outline = landingOutline(landing);
  if (outline.length < 3) return false;
  return pointInPolygon(point, outline);
}

export function landingBounds(landing) {
  const outline = landingOutline(landing);
  if (!outline.length) return null;
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function getLandingRenderData(landing) {
  const outline = landingOutline(landing);
  if (outline.length < 3) return null;
  const edges = landingEdges(landing);
  const bounds = landingBounds(landing);
  return {
    outline,
    edges,
    bounds,
    center: landing.position,
  };
}

/**
 * Snap a point to the nearest landing edge midpoint within snapDist.
 * Returns { point, landingId, edge } or null.
 */
export function snapToLandingEdge(point, landings, snapDist) {
  let best = null;
  let bestDist = snapDist;

  for (const landing of (landings || [])) {
    const edges = landingEdges(landing);
    for (const edge of edges) {
      const d = distance(point, edge.midpoint);
      if (d < bestDist) {
        bestDist = d;
        best = {
          point: { x: edge.midpoint.x, y: edge.midpoint.y },
          landingId: landing.id,
          edge: edge.name,
        };
      }
    }
  }

  return best;
}

/**
 * Sync a stair's start/end point to the landing edge midpoint when a landing moves.
 * Returns an updated copy of the stair, or the original if no attachments.
 */
export function syncStairLandingAttachment(stair, landings) {
  let updated = false;
  let nextStair = { ...stair };

  if (stair.startLandingAttachment) {
    const landing = landings.find((l) => l.id === stair.startLandingAttachment.landingId);
    if (landing) {
      const edges = landingEdges(landing);
      const edge = edges.find((e) => e.name === stair.startLandingAttachment.edge);
      if (edge) {
        nextStair.startPoint = { x: edge.midpoint.x, y: edge.midpoint.y };
        updated = true;
      }
    }
  }

  if (stair.endLandingAttachment) {
    const landing = landings.find((l) => l.id === stair.endLandingAttachment.landingId);
    if (landing) {
      const edges = landingEdges(landing);
      const edge = edges.find((e) => e.name === stair.endLandingAttachment.edge);
      if (edge) {
        // Recompute direction angle so the end point lands on the edge midpoint
        const run = Math.max(0, (stair.numberOfRisers || 0) * (stair.treadDepth || 0));
        if (run > 0) {
          const startPt = nextStair.startPoint;
          const dx = edge.midpoint.x - startPt.x;
          const dy = edge.midpoint.y - startPt.y;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          nextStair.direction = { angle };
          updated = true;
        }
      }
    }
  }

  return updated ? nextStair : stair;
}

/**
 * Compute landing elevation from connected stairs.
 * Uses the first stair whose end lands on this landing (total rise from that stair).
 * Falls back to 0.
 */
export function computeLandingElevation(landing, stairs, floorLevel = 0) {
  for (const stair of (stairs || [])) {
    if (stair.endLandingAttachment?.landingId === landing.id) {
      const totalRise = Math.max(0, (stair.numberOfRisers || 0) * (stair.riserHeight || 0));
      return floorLevel + totalRise;
    }
    if (stair.startLandingAttachment?.landingId === landing.id) {
      return floorLevel;
    }
  }
  return floorLevel;
}
