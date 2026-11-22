/**
 * Perf pass 3, C5: the arc and polyline hit tests reject a point outside the
 * box of their control points (plus the tolerance) before building chords, and
 * `findTopmostEntityAtPoint` resolves dimension references through one id
 * lookup per call. Both must answer as before. The pre-change functions are the
 * oracle, kept below verbatim; points are fuzzed around each shape's box edge,
 * where a reject that is too eager would show.
 */

import { describe, expect, it } from 'vitest';
import { getArcSegments } from './arcUtils';
import { getPolylineSegments } from './polylineUtils';
import {
  distancePointToSegment,
  findTopmostEntityAtPoint,
  hitTestArc,
  hitTestEntity,
  hitTestPolyline,
} from './hitTest';

// The oracle: hitTestPolyline, hitTestArc and findTopmostEntityAtPoint before
// perf pass 3, verbatim.
function oracleHitTestPolyline(entity, point, tolerance) {
  return getPolylineSegments(entity).some(
    (segment) => distancePointToSegment(point, segment.start, segment.end) <= tolerance,
  );
}

function oracleHitTestArc(entity, point, tolerance) {
  return getArcSegments(entity).some(
    (segment) => distancePointToSegment(point, segment.start, segment.end) <= tolerance,
  );
}

function oracleFindTopmostEntityAtPoint(entities, point, tolerance) {
  for (let index = entities.length - 1; index >= 0; index -= 1) {
    const entity = entities[index];

    if (entity.visible !== false && hitTestEntity(entity, point, tolerance, entities)) {
      return entity;
    }
  }

  return null;
}

function createRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

const between = (random, min, max) => min + (max - min) * random();

function randomPoint(random, span) {
  return { x: between(random, -span, span), y: between(random, -span, span) };
}

// Points near the box edge (just in, just out, on it), on the shape, and anywhere.
function probePoints(random, controlPoints, tolerance, span) {
  const xs = controlPoints.map((point) => point.x);
  const ys = controlPoints.map((point) => point.y);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const edges = [box.minX - tolerance, box.maxX + tolerance];
  const edgesY = [box.minY - tolerance, box.maxY + tolerance];
  const nudge = () => [0, 1e-12, -1e-12, 1e-6, -1e-6, 0.3, -0.3][Math.floor(random() * 7)];
  const points = [];
  for (let index = 0; index < 12; index += 1) {
    points.push({ x: edges[index % 2] + nudge(), y: between(random, box.minY - tolerance, box.maxY + tolerance) });
    points.push({ x: between(random, box.minX - tolerance, box.maxX + tolerance), y: edgesY[index % 2] + nudge() });
    const at = controlPoints[Math.floor(random() * controlPoints.length)];
    points.push({ x: at.x + between(random, -2, 2) * tolerance, y: at.y + between(random, -2, 2) * tolerance });
    points.push(randomPoint(random, span));
  }
  return points;
}

describe('C5: hit tests against the pre-change hit tests', () => {
  it('arcs: the same answer everywhere, including at the edge of the box', { timeout: 30000 }, () => {
    let hits = 0;
    let total = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = createRandom(seed * 40503);
      const span = [10, 300, 1e5][seed % 3];
      const arc = {
        id: 'a',
        type: 'arc',
        start: randomPoint(random, span),
        control: random() < 0.2 ? randomPoint(random, span * 3) : randomPoint(random, span),
        end: random() < 0.1 ? null : randomPoint(random, span),
      };
      if (!arc.end) arc.end = { ...arc.start };
      for (const tolerance of [0, 0.5, 3, 12, span / 10]) {
        for (const point of probePoints(random, [arc.start, arc.control, arc.end], tolerance, span)) {
          const expected = oracleHitTestArc(arc, point, tolerance);
          expect(hitTestArc(arc, point, tolerance), `seed ${seed}`).toBe(expected);
          total += 1;
          if (expected) hits += 1;
        }
      }
    }
    expect(hits).toBeGreaterThan(total / 20);
  });

  it('polylines, open and closed', { timeout: 30000 }, () => {
    let hits = 0;
    let total = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = createRandom(seed * 69069);
      const span = [10, 300, 1e5][seed % 3];
      const points = Array.from({ length: 1 + Math.floor(random() * 6) }, () => randomPoint(random, span));
      const polyline = { id: 'p', type: 'polyline', points, closed: random() < 0.5 };
      for (const tolerance of [0, 0.5, 3, 12, span / 10]) {
        for (const point of probePoints(random, points, tolerance, span)) {
          const expected = oracleHitTestPolyline(polyline, point, tolerance);
          expect(hitTestPolyline(polyline, point, tolerance), `seed ${seed}`).toBe(expected);
          total += 1;
          if (expected) hits += 1;
        }
      }
    }
    expect(hits).toBeGreaterThan(total / 20);
    // Degenerate input answers as before.
    expect(hitTestPolyline({ points: [] }, { x: 0, y: 0 }, 5)).toBe(false);
    expect(
      hitTestPolyline(
        {
          points: [
            { x: Number.NaN, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        { x: 1, y: 1 },
        5,
      ),
    ).toBe(
      oracleHitTestPolyline(
        {
          points: [
            { x: Number.NaN, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        { x: 1, y: 1 },
        5,
      ),
    );
  });

  it('findTopmostEntityAtPoint with dimensions, duplicate ids and hidden entities', () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const random = createRandom(seed * 1103515245);
      const entities = [];
      for (let index = 0; index < 25; index += 1) {
        const a = randomPoint(random, 200);
        const b = randomPoint(random, 200);
        const roll = random();
        const id = `e${index % 11}`;
        if (roll < 0.5) {
          entities.push({ id, type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, visible: random() < 0.9 });
        } else if (roll < 0.65) {
          entities.push({ id, type: 'arc', start: a, control: randomPoint(random, 200), end: b });
        } else if (roll < 0.8) {
          const ref = (key) =>
            random() < 0.3
              ? null
              : { entityId: `e${Math.floor(random() * 14)}`, sourceType: 'endpoint', sourceKey: key };
          entities.push({
            id: `d${index}`,
            type: 'dimension',
            subtype: 'aligned',
            p1: a,
            p2: b,
            offset: between(random, -30, 30),
            meta: { sourceRefs: random() < 0.2 ? [ref('start')] : [ref('start'), ref('end')] },
          });
        } else {
          entities.push({
            id: `g${index}`,
            type: 'angle-dimension',
            vertex: a,
            p1: b,
            p2: randomPoint(random, 200),
            arcRadius: 20,
            meta: {
              sourceRefs: [
                { entityId: 'e1', sourceType: 'endpoint', sourceKey: 'start' },
                null,
                { entityId: 'e1', sourceType: 'endpoint', sourceKey: 'end' },
              ],
            },
          });
        }
      }
      for (let probe = 0; probe < 40; probe += 1) {
        const point = randomPoint(random, 220);
        const tolerance = [1, 5, 15][probe % 3];
        expect(findTopmostEntityAtPoint(entities, point, tolerance), `seed ${seed}`).toBe(
          oracleFindTopmostEntityAtPoint(entities, point, tolerance),
        );
      }
    }
  });
});
