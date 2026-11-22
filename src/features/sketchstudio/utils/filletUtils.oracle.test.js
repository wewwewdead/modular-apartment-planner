/**
 * Perf pass 3, C5: the fillet / chamfer corner search keeps its quadratic
 * endpoint grouping between calls and reuses it while the lines and the merge
 * distance are unchanged. It must answer as the search that regrouped on every
 * call. The old line-line search is kept below, verbatim, as the oracle (the
 * polyline and rect searches did not change, so they answer for themselves:
 * with no lines in the list, the line-line search finds nothing). The fuzz
 * calls the new search over the same list many times, over new lists, and over
 * a list edited in place, so every way the kept grouping can go stale is hit.
 */

import { describe, expect, it } from 'vitest';
import { calculateDistance } from './canvasMath';
import { findFilletableCorner } from './filletUtils';
import { findChamferableCorner } from './chamferUtils';

const ENDPOINT_MERGE_TOLERANCE = 2;

function getLineEndpoints(entity) {
  return [
    { key: 'start', point: { x: entity.x1, y: entity.y1 } },
    { key: 'end', point: { x: entity.x2, y: entity.y2 } },
  ];
}

// The oracle: findLineLineCorner before perf pass 3, verbatim.
function oracleFindLineLineCorner(entities, worldPoint, tolerance) {
  const lines = entities.filter((entity) => entity.type === 'line');

  if (lines.length < 2) {
    return null;
  }

  const endpoints = [];

  for (const line of lines) {
    for (const ep of getLineEndpoints(line)) {
      endpoints.push({ entity: line, ...ep });
    }
  }

  // Group endpoints by proximity
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < endpoints.length; i += 1) {
    if (assigned.has(i)) {
      continue;
    }

    const group = [endpoints[i]];
    assigned.add(i);

    for (let j = i + 1; j < endpoints.length; j += 1) {
      if (assigned.has(j)) {
        continue;
      }

      if (calculateDistance(endpoints[i].point, endpoints[j].point) <= Math.max(tolerance, ENDPOINT_MERGE_TOLERANCE)) {
        group.push(endpoints[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  // Find closest group with exactly 2 distinct lines
  let bestGroup = null;
  let bestDist = Infinity;

  for (const group of groups) {
    const entityIds = new Set(group.map((ep) => ep.entity.id));

    if (entityIds.size !== 2) {
      continue;
    }

    const centroid = {
      x: group.reduce((sum, ep) => sum + ep.point.x, 0) / group.length,
      y: group.reduce((sum, ep) => sum + ep.point.y, 0) / group.length,
    };
    const dist = calculateDistance(worldPoint, centroid);

    if (dist < bestDist && dist <= tolerance) {
      bestDist = dist;
      bestGroup = group;
    }
  }

  if (!bestGroup) {
    return null;
  }

  // Extract two distinct entities
  const seen = new Set();
  const entries = [];

  for (const ep of bestGroup) {
    if (!seen.has(ep.entity.id)) {
      seen.add(ep.entity.id);
      entries.push(ep);
    }
  }

  if (entries.length !== 2) {
    return null;
  }

  const cornerPoint = {
    x: bestGroup.reduce((sum, ep) => sum + ep.point.x, 0) / bestGroup.length,
    y: bestGroup.reduce((sum, ep) => sum + ep.point.y, 0) / bestGroup.length,
  };

  return {
    type: 'line-line',
    cornerPoint,
    entity1: entries[0].entity,
    entity1Endpoint: entries[0].key,
    entity2: entries[1].entity,
    entity2Endpoint: entries[1].key,
  };
}

function oracleFindFilletableCorner(entities, worldPoint, tolerance) {
  return (
    oracleFindLineLineCorner(entities, worldPoint, tolerance) ??
    findFilletableCorner(
      entities.filter((entity) => entity.type !== 'line'),
      worldPoint,
      tolerance,
    )
  );
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

function randomScene(random) {
  const entities = [];
  const corners = [];
  const count = 3 + Math.floor(random() * 30);
  const point = () => {
    if (corners.length && random() < 0.55) {
      // At, or within a hair or a millimetre or two of, an existing end.
      const base = corners[Math.floor(random() * corners.length)];
      const jitter = [0, 0, 1e-9, 0.5, 1.9, 2.1, 4][Math.floor(random() * 7)];
      return { x: base.x + (random() - 0.5) * 2 * jitter, y: base.y + (random() - 0.5) * 2 * jitter };
    }
    const fresh = { x: Math.round(random() * 400), y: Math.round(random() * 400) };
    corners.push(fresh);
    return fresh;
  };

  for (let index = 0; index < count; index += 1) {
    const roll = random();
    if (roll < 0.7) {
      const a = point();
      const b = point();
      corners.push(a, b);
      entities.push({ id: `l${index % 17}`, type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    } else if (roll < 0.85) {
      entities.push({
        id: `p${index}`,
        type: 'polyline',
        closed: random() < 0.5,
        points: [point(), point(), point(), point()],
      });
    } else {
      const a = point();
      entities.push({ id: `r${index}`, type: 'rect', x: a.x, y: a.y, width: 40, height: 25, rotation: 0 });
    }
  }
  return { entities, corners };
}

describe('C5: findFilletableCorner against the regroup-every-call oracle', () => {
  it('agrees over repeated, new and edited-in-place lists, cursors and tolerances', () => {
    let hits = 0;
    let compared = 0;

    for (let seed = 1; seed <= 150; seed += 1) {
      const random = createRandom(seed * 2654435761);
      const { entities, corners } = randomScene(random);
      // Duplicate ids on purpose (`l${index % 17}`): the search counts ids.

      for (let probe = 0; probe < 25; probe += 1) {
        const near = corners[Math.floor(random() * corners.length)];
        const cursor =
          random() < 0.8
            ? { x: near.x + (random() - 0.5) * 30, y: near.y + (random() - 0.5) * 30 }
            : { x: random() * 400, y: random() * 400 };
        const tolerance = [0.5, 1, 2, 3, 10, 20, 60][Math.floor(random() * 7)];

        // The same list twice (the kept grouping), then a copy (a new list).
        for (const list of [entities, entities, [...entities]]) {
          const expected = oracleFindFilletableCorner(list, cursor, tolerance);
          expect(findFilletableCorner(list, cursor, tolerance), `seed ${seed} probe ${probe}`).toEqual(expected);
          expect(findChamferableCorner(list, cursor, tolerance)).toEqual(expected);
          compared += 1;
          if (expected?.type === 'line-line') hits += 1;
        }

        // Edit in place, as no code in the app does: the kept grouping must
        // notice a moved end, a replaced line and a removed one.
        const lineIndex = entities.findIndex((entity) => entity.type === 'line');
        if (lineIndex >= 0 && random() < 0.4) {
          const roll = random();
          if (roll < 0.4) {
            entities[lineIndex].x2 += 1;
          } else if (roll < 0.7) {
            entities[lineIndex] = { ...entities[lineIndex], y1: entities[lineIndex].y1 + 0.75 };
          } else {
            entities.splice(lineIndex, 1);
          }
          const expected = oracleFindFilletableCorner(entities, cursor, tolerance);
          expect(findFilletableCorner(entities, cursor, tolerance), `seed ${seed} probe ${probe} edited`).toEqual(
            expected,
          );
          compared += 1;
        }
      }
    }

    expect(compared).toBeGreaterThan(10000);
    expect(hits).toBeGreaterThan(compared / 20);
  });
});
