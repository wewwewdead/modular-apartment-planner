/* @vitest-environment jsdom */
/**
 * Perf pass 3, C1: `findIntersectionSnapPoint` skips the rows of segments the
 * cursor is too far from, and `snapWorldPoint` reuses the points and segments
 * it collected for an entities array. Both must answer exactly as before. The
 * functions as they stood before the change are kept below as the oracle, and
 * the new ones are run against them over random scenes, cursors and
 * tolerances -- including the cases the cull has to survive: crossings shared
 * by many segments (ties), coincident and collinear segments, nearly parallel
 * pairs, segments meeting at their ends, and arcs flattened to chords.
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import useSketchViewport from '../hooks/useSketchViewport';
import { getSegmentIntersectionPoint } from './hitTest';
import {
  collectSnapPointsFromEntities,
  collectSnapSegmentsFromEntities,
  collectSnapSources,
  findIntersectionSnapPoint,
  findNearestPointOnSegment,
  findNearestSnapPoint,
  findPerpendicularSnapPoint,
  snapWorldPoint,
} from './snapUtils';
import { findNearestIsometricGridSnap } from './isometricUtils';

// ---------------------------------------------------------------------------
// The oracle: the pre-change functions, verbatim.
// ---------------------------------------------------------------------------

function oracleBuildEmptySnap() {
  return {
    point: null,
    sourceEntityId: null,
    entityType: null,
    sourceType: null,
    sourceKey: null,
    snapType: null,
  };
}

function oracleBuildSnapPoint({ x, y, entityId, entityType, sourceType, sourceKey, snapType = sourceType }) {
  return {
    x,
    y,
    sourceEntityId: entityId,
    entityType,
    sourceType,
    sourceKey,
    snapType,
  };
}

function oracleFindIntersectionSnapPoint(segments, worldPoint, tolerance, counter = null) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < segments.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < segments.length; otherIndex += 1) {
      if (counter) counter.pairs += 1;
      const intersection = getSegmentIntersectionPoint(
        segments[index].start,
        segments[index].end,
        segments[otherIndex].start,
        segments[otherIndex].end,
      );

      if (!intersection) {
        continue;
      }

      const distance = Math.hypot(worldPoint.x - intersection.x, worldPoint.y - intersection.y);

      if (distance <= tolerance && distance < nearestDistance) {
        nearest = {
          ...oracleBuildSnapPoint({
            x: intersection.x,
            y: intersection.y,
            entityId: segments[index].entityId,
            entityType: segments[index].entityType,
            sourceType: 'segment',
            sourceKey: segments[index].sourceKey,
            snapType: 'intersection',
          }),
          secondaryEntityId: segments[otherIndex].entityId,
        };
        nearestDistance = distance;
      }
    }
  }

  return nearest;
}

function oracleSnapWorldPoint({
  worldPoint,
  entities,
  toleranceWorld,
  enabled = true,
  anchorPoint = null,
  enableIsometricGrid = false,
  viewportZoom = 1,
}) {
  if (!enabled) {
    return oracleBuildEmptySnap();
  }

  const snapPoints = collectSnapPointsFromEntities(entities);
  const snapSegments = collectSnapSegmentsFromEntities(entities);
  const nearestPoint = findNearestSnapPoint(snapPoints, worldPoint, toleranceWorld);

  if (nearestPoint) {
    return {
      point: { x: nearestPoint.x, y: nearestPoint.y },
      sourceEntityId: nearestPoint.sourceEntityId,
      entityType: nearestPoint.entityType,
      sourceType: nearestPoint.sourceType,
      sourceKey: nearestPoint.sourceKey,
      snapType: nearestPoint.snapType,
    };
  }

  const intersection = oracleFindIntersectionSnapPoint(snapSegments, worldPoint, toleranceWorld);

  if (intersection) {
    return {
      point: { x: intersection.x, y: intersection.y },
      sourceEntityId: intersection.sourceEntityId,
      entityType: intersection.entityType,
      sourceType: intersection.sourceType,
      sourceKey: intersection.sourceKey,
      snapType: intersection.snapType,
    };
  }

  const perpendicular = findPerpendicularSnapPoint(snapSegments, worldPoint, anchorPoint, toleranceWorld);

  if (perpendicular) {
    return {
      point: { x: perpendicular.x, y: perpendicular.y },
      sourceEntityId: perpendicular.sourceEntityId,
      entityType: perpendicular.entityType,
      sourceType: perpendicular.sourceType,
      sourceKey: perpendicular.sourceKey,
      snapType: perpendicular.snapType,
    };
  }

  const nearestOnSegment = findNearestPointOnSegment(snapSegments, worldPoint, toleranceWorld);

  if (nearestOnSegment) {
    return {
      point: { x: nearestOnSegment.x, y: nearestOnSegment.y },
      sourceEntityId: nearestOnSegment.sourceEntityId,
      entityType: nearestOnSegment.entityType,
      sourceType: nearestOnSegment.sourceType,
      sourceKey: nearestOnSegment.sourceKey,
      snapType: nearestOnSegment.snapType,
    };
  }

  if (enableIsometricGrid) {
    const point = findNearestIsometricGridSnap({
      worldPoint,
      toleranceWorld,
      zoom: viewportZoom,
    });

    if (point) {
      return {
        point,
        sourceEntityId: null,
        entityType: null,
        sourceType: 'grid',
        sourceKey: 'isometric',
        snapType: 'grid',
      };
    }
  }

  return oracleBuildEmptySnap();
}

// ---------------------------------------------------------------------------
// Scene generators (seeded, so a failure names a reproducible case).
// ---------------------------------------------------------------------------

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

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function between(random, min, max) {
  return min + (max - min) * random();
}

// Coordinates on a coarse lattice now and then, so ends, crossings and
// collinear runs coincide exactly instead of only nearly.
function coord(random, span) {
  return random() < 0.4 ? Math.round(between(random, -span, span) / 10) * 10 : between(random, -span, span);
}

function randomSegment(random, span) {
  const kind = random();
  const start = { x: coord(random, span), y: coord(random, span) };

  if (kind < 0.15) {
    // Nearly parallel to the x axis or to a 30 degree iso axis.
    const angle = pick(random, [0, Math.PI / 6, (5 * Math.PI) / 6]) + between(random, -1e-7, 1e-7);
    const length = between(random, 1, span);
    return { start, end: { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length } };
  }

  if (kind < 0.2) {
    // Degenerate (zero length).
    return { start, end: { ...start } };
  }

  return { start, end: { x: coord(random, span), y: coord(random, span) } };
}

function randomEntities(random, count, span) {
  const entities = [];
  const lines = [];

  for (let index = 0; index < count; index += 1) {
    const id = `e${index}`;
    const roll = random();

    if (roll < 0.1 && lines.length) {
      // An exact copy of an earlier line (coincident), or the same line reversed.
      const source = pick(random, lines);
      entities.push(
        random() < 0.5
          ? { ...source, id }
          : { ...source, id, x1: source.x2, y1: source.y2, x2: source.x1, y2: source.y1 },
      );
      continue;
    }

    if (roll < 0.2 && lines.length) {
      // A line through an earlier line's end (a shared crossing point).
      const source = pick(random, lines);
      const through = random() < 0.5 ? { x: source.x1, y: source.y1 } : { x: source.x2, y: source.y2 };
      const angle = between(random, 0, Math.PI);
      const reach = between(random, 1, span / 2);
      const line = {
        id,
        type: 'line',
        x1: through.x - Math.cos(angle) * reach,
        y1: through.y - Math.sin(angle) * reach,
        x2: through.x + Math.cos(angle) * reach,
        y2: through.y + Math.sin(angle) * reach,
        visible: true,
      };
      entities.push(line);
      lines.push(line);
      continue;
    }

    if (roll < 0.3 && lines.length) {
      // Nearly parallel to an earlier line, offset a hair.
      const source = pick(random, lines);
      const offset = between(random, -1e-6, 1e-6);
      const line = {
        id,
        type: 'line',
        x1: source.x1 + offset,
        y1: source.y1,
        x2: source.x2 + between(random, -1e-9, 1e-9),
        y2: source.y2 + offset,
        visible: true,
      };
      entities.push(line);
      lines.push(line);
      continue;
    }

    if (roll < 0.5) {
      const segment = randomSegment(random, span);
      const line = {
        id,
        type: 'line',
        x1: segment.start.x,
        y1: segment.start.y,
        x2: segment.end.x,
        y2: segment.end.y,
        visible: random() < 0.95,
      };
      entities.push(line);
      lines.push(line);
      continue;
    }

    if (roll < 0.65) {
      const points = Array.from({ length: 2 + Math.floor(random() * 5) }, () => ({
        x: coord(random, span),
        y: coord(random, span),
      }));
      entities.push({ id, type: 'polyline', points, closed: random() < 0.5, visible: true });
      continue;
    }

    if (roll < 0.78) {
      entities.push({
        id,
        type: 'rect',
        x: coord(random, span),
        y: coord(random, span),
        width: between(random, -span / 2, span / 2),
        height: between(random, -span / 2, span / 2),
        rotation: random() < 0.5 ? 0 : between(random, -180, 180),
        visible: true,
      });
      continue;
    }

    if (roll < 0.9) {
      const start = { x: coord(random, span), y: coord(random, span) };
      const end = { x: coord(random, span), y: coord(random, span) };
      entities.push({
        id,
        type: 'arc',
        start,
        end,
        control: { x: between(random, -span, span), y: between(random, -span, span) },
        visible: true,
        meta: random() < 0.3 ? { filletRadius: 5 } : {},
      });
      continue;
    }

    if (roll < 0.95) {
      entities.push({
        id,
        type: 'feature',
        featureType: 'hole',
        shape: pick(random, ['rect', 'polygon', 'circle']),
        x: coord(random, span),
        y: coord(random, span),
        width: between(random, 1, span / 3),
        height: between(random, 1, span / 3),
        cx: coord(random, span),
        cy: coord(random, span),
        diameter: between(random, 1, 20),
        points: Array.from({ length: 3 + Math.floor(random() * 3) }, () => ({
          x: coord(random, span),
          y: coord(random, span),
        })),
        visible: true,
      });
      continue;
    }

    entities.push({ id, type: 'circle', cx: coord(random, span), cy: coord(random, span), r: 10, visible: true });
  }

  return entities;
}

// Cursors near the places a snap can land: segment ends, crossings found by
// brute force, points on segments, and anywhere at all.
function randomCursor(random, segments, span) {
  const roll = random();
  const jitter = () => between(random, -3, 3);

  if (roll < 0.35 && segments.length >= 2) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const a = pick(random, segments);
      const b = pick(random, segments);
      const crossing = getSegmentIntersectionPoint(a.start, a.end, b.start, b.end);
      if (crossing) {
        return random() < 0.3 ? crossing : { x: crossing.x + jitter(), y: crossing.y + jitter() };
      }
    }
  }

  if (roll < 0.6 && segments.length) {
    const segment = pick(random, segments);
    const t = random();
    return {
      x: segment.start.x + (segment.end.x - segment.start.x) * t + jitter(),
      y: segment.start.y + (segment.end.y - segment.start.y) * t + jitter(),
    };
  }

  if (roll < 0.75 && segments.length) {
    const segment = pick(random, segments);
    return random() < 0.5 ? { ...segment.start } : { x: segment.end.x + jitter(), y: segment.end.y + jitter() };
  }

  return { x: between(random, -span, span), y: between(random, -span, span) };
}

function randomTolerance(random) {
  return pick(random, [0, 1e-9, 0.5, 2, 5, 8, 25, 80, between(random, 0, 40)]);
}

// ---------------------------------------------------------------------------

describe('C1: findIntersectionSnapPoint against the all-pairs oracle', () => {
  it('agrees on random scenes, cursors and tolerances', { timeout: 30000 }, () => {
    let compared = 0;
    let hits = 0;

    for (let seed = 1; seed <= 160; seed += 1) {
      const random = createRandom(seed * 7919);
      const span = pick(random, [50, 400, 5000, 2e5]);
      const entities = randomEntities(random, 4 + Math.floor(random() * 45), span);
      const segments = collectSnapSegmentsFromEntities(entities);

      for (let probe = 0; probe < 60; probe += 1) {
        const cursor = randomCursor(random, segments, span);
        const tolerance = randomTolerance(random);
        const expected = oracleFindIntersectionSnapPoint(segments, cursor, tolerance);
        const actual = findIntersectionSnapPoint(segments, cursor, tolerance);
        expect(actual, `seed ${seed} probe ${probe}`).toEqual(expected);
        compared += 1;
        if (expected) hits += 1;
      }
    }

    expect(compared).toBe(160 * 60);
    // The fuzz has to exercise the winning path, not only the empty one.
    expect(hits).toBeGreaterThan(compared / 10);
  });

  it('keeps the first pair among crossings shared by many segments', () => {
    // A star of lines through one point, plus copies: every pair crosses at
    // (0, 0) (or within rounding of it), and the first pair must still win.
    const segments = [];
    for (let index = 0; index < 12; index += 1) {
      const angle = (index * Math.PI) / 12;
      segments.push({
        start: { x: -Math.cos(angle) * 100, y: -Math.sin(angle) * 100 },
        end: { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 },
        entityId: `s${index}`,
        entityType: 'line',
        sourceType: 'segment',
        sourceKey: 'segment',
      });
    }
    segments.push({ ...segments[3], entityId: 'copy' });

    for (const cursor of [
      { x: 0, y: 0 },
      { x: 0.4, y: -0.2 },
      { x: 3, y: 3 },
    ]) {
      expect(findIntersectionSnapPoint(segments, cursor, 5)).toEqual(
        oracleFindIntersectionSnapPoint(segments, cursor, 5),
      );
    }
    // Which pair wins depends on the rounding of each crossing; the oracle
    // above is the authority. Here only: there is one, and it is a crossing.
    expect(findIntersectionSnapPoint(segments, { x: 0, y: 0 }, 5)).toMatchObject({ snapType: 'intersection' });
  });

  it('finds a crossing of nearly parallel segments whose partner lies far from the cursor', () => {
    // Long, almost parallel pair: the computed crossing sits on the first
    // segment; the second is the partner from the whole list.
    const segments = [
      {
        start: { x: 0, y: 0 },
        end: { x: 1e5, y: 1e-6 },
        entityId: 'a',
        entityType: 'line',
        sourceType: 'segment',
        sourceKey: 'segment',
      },
      {
        start: { x: 0, y: 1e-6 },
        end: { x: 1e5, y: 0 },
        entityId: 'b',
        entityType: 'line',
        sourceType: 'segment',
        sourceKey: 'segment',
      },
    ];
    for (const cursor of [
      { x: 5e4, y: 0 },
      { x: 5e4 + 3, y: 2 },
      { x: 0, y: 0 },
    ]) {
      expect(findIntersectionSnapPoint(segments, cursor, 5)).toEqual(
        oracleFindIntersectionSnapPoint(segments, cursor, 5),
      );
    }
  });
});

describe('C1: snapWorldPoint against the pre-change snapWorldPoint', () => {
  it('agrees on random scenes, with and without an anchor and the isometric grid', { timeout: 30000 }, () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const random = createRandom(seed * 104729);
      const span = pick(random, [60, 500, 3000]);
      const entities = randomEntities(random, 3 + Math.floor(random() * 30), span);
      const segments = collectSnapSegmentsFromEntities(entities);
      const sources = collectSnapSources(entities);

      for (let probe = 0; probe < 40; probe += 1) {
        const options = {
          worldPoint: randomCursor(random, segments, span),
          entities,
          toleranceWorld: randomTolerance(random),
          enabled: random() < 0.95,
          anchorPoint: random() < 0.4 ? { x: coord(random, span), y: coord(random, span) } : null,
          enableIsometricGrid: random() < 0.3,
          viewportZoom: pick(random, [0.1, 0.5, 1, 4]),
        };
        const expected = oracleSnapWorldPoint(options);
        expect(snapWorldPoint(options), `seed ${seed} probe ${probe}`).toEqual(expected);
        // The canvas passes the sources it collected once for the array.
        expect(snapWorldPoint({ ...options, sources }), `seed ${seed} probe ${probe} (sources)`).toEqual(expected);
      }
    }
  });
});

describe('C1: the canvas snap reuses its sources per entities array', () => {
  function line(id, x1, y1, x2, y2) {
    return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', visible: true };
  }

  function mountViewport(entities, zoom = 1) {
    const state = {
      viewport: { zoom, panX: 0, panY: 0 },
      ui: { activeTool: 'line', snapEnabled: true, orthoEnabled: false, viewMode: 'plan' },
    };
    return renderHook(
      ({ visibleEntities }) =>
        useSketchViewport(state, () => {}, { current: null }, { visibleEntities, editableEntities: visibleEntities }),
      { initialProps: { visibleEntities: entities } },
    );
  }

  it('answers as the oracle does, on the first snap and after, and after the document changes', () => {
    const first = [line('a', 0, 0, 100, 0), line('b', 50, -50, 50, 50)];
    const view = mountViewport(first);
    const at = (point) => ({ worldPoint: point, toleranceWorld: 12, entities: first });

    for (const point of [
      { x: 51, y: 1 },
      { x: 99, y: 0 },
      { x: 30, y: 4 },
    ]) {
      expect(view.result.current.resolveSnap(point)).toEqual(oracleSnapWorldPoint(at(point)));
    }

    const second = [line('a', 0, 0, 200, 0), first[1]];
    view.rerender({ visibleEntities: second });
    const end = { x: 199, y: 0 };
    expect(view.result.current.resolveSnap(end)).toEqual(
      oracleSnapWorldPoint({ worldPoint: end, toleranceWorld: 12, entities: second }),
    );
    expect(view.result.current.resolveSnap(end)).toMatchObject({ point: { x: 200, y: 0 }, sourceEntityId: 'a' });
  });

  it('snaps a filtered copy (the handle-drag exclude path) against that copy only', () => {
    const entities = [line('dragged', 0, 0, 100, 0), line('other', 50, -50, 50, 50)];
    const view = mountViewport(entities);
    const point = { x: 100, y: 1 };

    // Warm the per-array sources with the full list first.
    expect(view.result.current.resolveSnap(point)).toMatchObject({ sourceEntityId: 'dragged' });

    const filtered = entities.filter((entity) => entity.id !== 'dragged');
    expect(view.result.current.resolveSnap(point, null, { excludeEntityIds: ['dragged'] })).toEqual(
      oracleSnapWorldPoint({ worldPoint: point, toleranceWorld: 12, entities: filtered }),
    );
  });
});
