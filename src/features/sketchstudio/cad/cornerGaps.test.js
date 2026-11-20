// Flange gaps (docs/sketch-studio-corner-gaps.md §3.4): the readout of how far
// each cut end of a folded part stands from the flanges round it, on the
// user's tray (the numbers of §1.1, measured by an independent probe), an L
// corner built for the test (an overlap, a fit at 0, an end that runs past),
// parts with nothing to read, and the shop's own examples.
import { describe, expect, it } from 'vitest';
import {
  FACING,
  GAP_REACH,
  OVERLAP_SKIN,
  flangeGaps,
  flangeName,
  gapLabel,
  gapText,
  straightEdges,
} from './cornerGaps.js';
import { L_CORNER, USER_TRAY_FEATURE, USER_TRAY_PROFILE, lCorner } from './cornerGaps.fixtures.js';
import { foldSheet, pointInRing } from './sheetMetal.js';
import { sheetMetalControlBox } from './shopExamples.js';
import { flangedPanel, pieceClearances, presetFace } from './panelMaker.js';

const trayFold = () => foldSheet(USER_TRAY_FEATURE, USER_TRAY_PROFILE, {});
const gapsOf = ({ feature, profile }) => {
  const fold = foldSheet(feature, profile, {});
  return { fold, ...flangeGaps(fold, profile, {}) };
};
const segmentDistance = ([x, y], [a, b]) => {
  const d = [b[0] - a[0], b[1] - a[1]];
  const f = Math.max(0, Math.min(1, ((x - a[0]) * d[0] + (y - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1])));
  return Math.hypot(x - a[0] - d[0] * f, y - a[1] - d[1] * f);
};
const ringDistance = (p, ring) => Math.min(...ring.map((a, i) => segmentDistance(p, [a, ring[(i + 1) % ring.length]])));

describe('straightEdges', () => {
  it('lists the straight cut edges of every loop in profile order, and none of a curve', () => {
    const profile = {
      type: 'path',
      start: [0, 0],
      segments: [
        { type: 'line', end: [100, 0] },
        { type: 'arc', mid: [120, 30], end: [100, 60] },
        { type: 'line', end: [50, 50], construction: true },
        { type: 'line', end: [0, 60] },
      ],
      holes: [
        { type: 'rectangle', origin: [10, 10], width: 20, height: 10 },
        { type: 'circle', center: [60, 30], radius: 5 },
        {
          type: 'polygon',
          points: [
            [70, 10],
            [80, 10],
            [75, '=w'],
          ],
        },
      ],
    };
    const edges = straightEdges(profile, { w: 20 });
    expect(edges.map((e) => [e.loop, e.index])).toEqual([
      [0, 0],
      [0, 3],
      // The path does not end on its start: it closes with a straight edge numbered segments.length.
      [0, 4],
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [3, 0],
      [3, 1],
      [3, 2],
    ]);
    // The construction segment is no edge, and the line after it starts where the arc ended.
    expect(edges[1]).toEqual({ loop: 0, index: 3, a: [100, 60], b: [0, 60] });
    expect(edges[2]).toEqual({ loop: 0, index: 4, a: [0, 60], b: [0, 0] });
    expect(edges.find((e) => e.loop === 3 && e.index === 1).b).toEqual([75, 20]);
  });
});

describe("flangeGaps on the user's tray", () => {
  const fold = trayFold();
  const { rows, overlaps, least } = flangeGaps(fold, USER_TRAY_PROFILE, {});
  const walls = rows.filter((r) => !r.both);
  const mitres = rows.filter((r) => r.both);

  it('reads 12 rows: eight walls 0.72 one way and 1.22 the other, four mitres 1.33 – 1.35, no overlap', () => {
    expect(rows).toHaveLength(12);
    expect(walls).toHaveLength(8);
    expect(mitres).toHaveLength(4);
    for (const row of walls) {
      expect(row.b.kind).toBe('face');
      expect(row.b.side).toBe('inside');
      // A wall's end against the next wall's inside face: one number the gap, the other beside it.
      const [short, long] = row.gap < 1 ? [row.gap, row.beside] : [row.beside, row.gap];
      expect(short).toBeGreaterThanOrEqual(0.717 - 0.002);
      expect(short).toBeLessThanOrEqual(0.734 + 0.002);
      expect(long).toBeCloseTo(1.219, 2);
      expect(Math.abs(long - 1.219)).toBeLessThan(0.002);
      expect(row.overlap || row.cover).toBe(false);
    }
    for (const row of mitres) {
      expect(row.b.kind).toBe('edge');
      expect(row.gap).toBeGreaterThanOrEqual(1.329 - 0.002);
      expect(row.gap).toBeLessThanOrEqual(1.352 + 0.002);
      expect(row.beside).toBe(0);
      expect(gapLabel(row)).toMatch(/^Bend \d flange ↔ bend \d flange, edge to edge$/);
    }
    expect(overlaps).toEqual([]);
    expect(least).toBeCloseTo(0.717, 3);
    // The least comes first; the words of the top-right corner (§1.1).
    expect(rows[0].gap).toBe(least);
    const rear = rows.find((r) => r.a.bend === 7 && r.b.bend === 4);
    expect(gapLabel(rear)).toBe('Bend 8 flange, end → bend 5 flange, inside face');
    expect(gapText(rear)).toBe('0.73 mm · passes 1.22 mm beside it');
    const right = rows.find((r) => r.a.bend === 4 && r.b.bend === 7);
    expect(gapText(right)).toBe('1.22 mm · passes 0.73 mm beside it');
    const lips = rows.find((r) => r.both && [r.a.bend, r.b.bend].sort().join() === '0,2');
    expect(gapText(lips)).toBe('1.35 mm');
  });

  it('closes k mm per mm moved (k = 1) and puts the marker points on the two faces', () => {
    for (const row of rows) {
      // The user's left rear mitre is drawn at 45.03° (segment 35): its two lips face each other 0.03° apart.
      const drawnOff = row.both && [row.a.segment.index, row.b.segment.index].includes(28);
      expect(Math.abs(row.k - 1)).toBeLessThan(drawnOff ? 1e-6 : 1e-9);
      const t = fold.thickness;
      const [P, Q] = row.flatAt;
      // P on A's end: on its blank edge, within the thickness.
      expect(segmentDistance(P, row.a.flat)).toBeLessThan(1e-6);
      expect(P[2]).toBeGreaterThan(-1e-9);
      expect(P[2]).toBeLessThan(t + 1e-9);
      const pieceB = fold.pieces.find((p) => p.id === row.b.piece);
      if (row.b.kind === 'face') {
        // Q on B's inside face (every bend is up: flat z = t), in its outline or on it.
        expect(Math.abs(Q[2] - t)).toBeLessThan(1e-9);
        expect(pointInRing(Q, pieceB.outer) || ringDistance(Q, pieceB.outer) < 1e-6).toBe(true);
      } else {
        expect(segmentDistance(Q, row.b.flat)).toBeLessThan(1e-6);
      }
      // The two points stand at least as far apart as the row's beside.
      expect(Math.hypot(...row.at[0].map((v, i) => v - row.at[1][i]))).toBeGreaterThanOrEqual(row.beside - 1e-9);
      expect(FACING).toBeLessThan(row.k);
    }
  });

  it('folds mirror rows into one and keys rows by bend paths, not piece ids', () => {
    const pairs = rows.map((r) => [r.a.piece, r.a.segment.index, r.b.piece].join());
    expect(new Set(pairs).size).toBe(rows.length);
    // An edge-to-edge pair is listed once.
    for (const row of mitres)
      expect(
        rows.filter(
          (r) => r !== row && r.a.segment.index === row.b.segment.index && r.b.segment?.index === row.a.segment.index,
        ),
      ).toEqual([]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows.some((r) => /piece-/.test(r.key))).toBe(false);
    const ids = new Set(USER_TRAY_FEATURE.bends.map((b) => b.id));
    for (const row of rows) for (const id of [...row.a.path, ...row.b.path]) expect(ids.has(id)).toBe(true);
  });

  it(`takes under 5 ms on the user's part`, () => {
    for (let i = 0; i < 3; i++) flangeGaps(fold, USER_TRAY_PROFILE, {});
    const times = [];
    for (let i = 0; i < 15; i++) {
      const start = performance.now();
      flangeGaps(fold, USER_TRAY_PROFILE, {});
      times.push(performance.now() - start);
    }
    times.sort((p, q) => p - q);
    expect(times[7]).toBeLessThan(5);
  });
});

describe('flangeGaps on an L corner', () => {
  it("reports a wall end drawn 0.30 past the neighbour's inside face as an overlap", () => {
    const { rows, overlaps, least } = gapsOf(lCorner({ gap: -0.3 }));
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].bends).toEqual([0, 1]);
    const row = rows.find((r) => r.key === overlaps[0].row);
    expect(row.overlap).toBe(true);
    expect(row.gap).toBeCloseTo(-0.3, 6);
    expect(gapText(row)).toBe('runs 0.30 mm into it');
    expect(gapLabel(row)).toBe('Bend 1 flange, end → bend 2 flange, inside face');
    // Overlaps come first, and the least is 0.
    expect(rows[0]).toBe(row);
    expect(least).toBe(0);
  });

  it('reads an end drawn exactly on the face as 0.00 mm, no overlap', () => {
    const { rows, overlaps, least } = gapsOf(lCorner({ gap: 0 }));
    expect(overlaps).toEqual([]);
    expect(rows[0].overlap).toBe(false);
    expect(Math.abs(rows[0].gap)).toBeLessThan(1e-9);
    expect(gapText(rows[0])).toBe('0.00 mm');
    expect(least).toBe(0);
  });

  it('keeps its keys when the end moves (piece ids aside)', () => {
    const keys = (options) =>
      gapsOf(lCorner(options))
        .rows.map((r) => r.key)
        .sort();
    expect(keys({ gap: 0.5 })).toEqual(keys({ gap: 0.2 }));
    expect(keys({ gap: 0.2 })).toEqual([
      'bend-rear>bend-right>inside#1',
      'bend-rear>bend-right>inside#2',
      'bend-right>bend-rear>inside',
    ]);
  });

  it("reads an end that runs past the neighbour's end as covering, by its place against the far face", () => {
    const t = L_CORNER.thickness;
    const covering = (flush) => {
      const { rows, overlaps } = gapsOf(lCorner({ cover: true, flush }));
      expect(overlaps).toEqual([]);
      const row = rows.find((r) => r.cover);
      expect(row.overlap).toBe(false);
      expect(row.beside).toBeGreaterThan(0);
      expect(row.flush).toBeCloseTo(row.gap + t / row.k, 12);
      // Covering rows come last; the least is the open rows'.
      expect(rows.at(-1)).toBe(row);
      return row;
    };
    const flush = covering(0);
    expect(Math.abs(flush.flush)).toBeLessThan(1e-9);
    expect(flush.gap).toBeCloseTo(-t, 9);
    expect(gapText(flush)).toBe('runs past its end: flush with its outside face');
    expect(gapText(covering(0.15))).toBe('runs past its end: 0.15 mm short of flush');
    expect(gapText(covering(-0.1))).toBe('runs past its end: 0.10 mm proud of it');
    expect(gapsOf(lCorner({ cover: true })).least).toBeGreaterThan(2);
  });

  it('leaves a piece edge shorter than 0.01 mm out (a sliver is no face)', () => {
    const toothRows = (length) => {
      const fixture = lCorner({ gap: 0.5, tooth: { length, out: 0.1 } });
      // The tooth's end: the segment from (E + 0.1, 90) up.
      const index = fixture.profile.segments.findIndex((s, i) => i > 0 && s.end[1] === 90 + length);
      return gapsOf(fixture).rows.filter((r) => r.a.segment.index === index);
    };
    expect(toothRows(0.02)).toHaveLength(1);
    expect(toothRows(0.02)[0].gap).toBeCloseTo(0.4, 9);
    expect(toothRows(0.005)).toEqual([]);
  });
});

describe('flangeGaps with nothing to read', () => {
  const plate = { type: 'rectangle', origin: [0, 0], width: 100, height: 100 };
  const feature = (bends) => ({
    id: 'f',
    type: 'sheetmetal',
    sketchId: 's',
    thickness: 1.2,
    stock: 'spcc',
    kFactor: null,
    base: null,
    marks: [],
    bends,
  });
  const bend = (angle) => ({
    id: 'b',
    a: [-1, 80],
    b: [101, 80],
    angle,
    direction: 'up',
    radius: null,
    punch: 'a102',
    die: 'v8-88',
  });
  it.each([
    ['a flat blank', []],
    ['a single bend', [bend(90)]],
    ['a 180° hem (the flange lies on the base: joined)', [bend(180)]],
  ])('%s: no rows, no overlap', (_, bends) => {
    expect(gapsOf({ feature: feature(bends), profile: plate })).toMatchObject({ rows: [], overlaps: [], least: null });
  });
  it('makes no row of a curved cut edge next to a flange (its chords are no faces)', () => {
    const fixture = lCorner({ gap: 0.2, arc: true });
    const arc = fixture.profile.segments.findIndex((s) => s.type === 'arc');
    expect(straightEdges(fixture.profile).some((e) => e.index === arc)).toBe(false);
    const { rows, overlaps } = gapsOf(fixture);
    expect(overlaps).toEqual([]);
    expect(rows.some((r) => r.a.segment.index === arc || r.b.segment?.index === arc)).toBe(false);
    // The straight ends still read (the relief's side and the right wall's end).
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("flangeGaps on the shop's own parts", () => {
  it("reads the control box body's closed corners at its 0.1 mm fit-up gap", () => {
    const model = sheetMetalControlBox();
    const part = model.parts.find((p) => p.id === 'shop-box-body');
    const feature = part.features[0];
    const profile = model.sketches.find((s) => s.id === feature.sketchId).profile;
    const { rows, overlaps, least } = gapsOf({ feature, profile });
    expect(overlaps).toEqual([]);
    const open = rows.filter((r) => !r.cover);
    expect(open).toHaveLength(4);
    for (const row of open) expect(row.gap).toBeCloseTo(0.1, 3);
    // The side flanges reach the front and rear outside faces: they cover, flush.
    const covering = rows.filter((r) => r.cover);
    expect(covering).toHaveLength(4);
    for (const row of covering) expect(Math.abs(row.flush)).toBeLessThan(1e-3);
    expect(least).toBeCloseTo(0.1, 3);
  });

  it(`reads a flanged panel's corners at its 0.2 mm gap, as pieceClearances does`, () => {
    const result = flangedPanel({
      face: presetFace('rectangle', { width: 600, height: 1400 }),
      thickness: 1.5,
      stock: 'spcc',
      flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: 40 })),
    });
    const { rows, overlaps, least } = flangeGaps(result.fold, result.profile, {});
    expect(overlaps).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(least).toBeGreaterThanOrEqual(0.2 - 1e-6);
    const clearance = Math.min(
      ...pieceClearances(result.fold, new Set([result.fold.rootPiece])).map((c) => c.distance),
    );
    expect(Math.abs(least - clearance)).toBeLessThan(0.01);
    for (const row of rows) expect(row.distance).toBeGreaterThanOrEqual(clearance - 0.01);
  });
});

describe('words', () => {
  const row = (over) => ({
    a: { bend: 7 },
    b: { bend: 4, kind: 'face', side: 'inside' },
    gap: 0.734,
    beside: 1.219,
    both: false,
    overlap: false,
    cover: false,
    ...over,
  });
  it('names the two flanges and the face', () => {
    expect(gapLabel(row())).toBe('Bend 8 flange, end → bend 5 flange, inside face');
    expect(gapLabel(row({ b: { bend: null, kind: 'face', side: 'top' } }))).toBe('Bend 8 flange, end → the base, top');
    expect(gapLabel(row({ b: { bend: 2, kind: 'edge' }, both: true }))).toBe(
      'Bend 8 flange ↔ bend 3 flange, edge to edge',
    );
    expect(gapLabel(row({ b: { bend: 2, kind: 'edge' } }))).toBe('Bend 8 flange, end → bend 3 flange, end');
    expect(flangeName(7, true)).toBe("Bend 8's flange");
    expect(flangeName(null)).toBe('the base');
  });
  it('says the gap to two decimals, beside it only when it misses the face', () => {
    expect(gapText(row())).toBe('0.73 mm · passes 1.22 mm beside it');
    expect(gapText(row({ beside: 0.004 }))).toBe('0.73 mm');
    expect(gapText(row({ gap: -0.001, beside: 0 }))).toBe('0.00 mm');
    expect(gapText(row({ gap: -0.3, beside: 0, overlap: true }))).toBe('runs 0.30 mm into it');
  });
  it('keeps its constants', () => {
    expect([GAP_REACH, FACING, OVERLAP_SKIN]).toEqual([3, 0.94, 0.005]);
  });
});
