import { describe, expect, it } from 'vitest';
import {
  buildPanelJointBackingMembers,
  collectWallDimensionGuideTargets,
  collectWallDimensionSnapTargets,
  collectWallSnapCandidates,
  createDrawnFramingMember,
  createDrawnPanel,
  createTracedPanel,
  findFramingOpeningClashes,
  fitPanelToFramingReveal,
  measureFramingClearance,
  movePanelWithinBounds,
  moveWallDimensionWithinBounds,
  panWallViewport,
  quantizeWallLocalPoint,
  screenPointToWallLocal,
  snapPanelToAdjacentReveal,
  snapWallDimensionEndpoint,
  snapWallLocalPoint,
  zoomWallViewport,
} from './wallDetailEditorGeometry';

const bounds = { length: 3000, height: 2400 };

describe('wall detail editor geometry', () => {
  it('zooms around the cursor, clamps zoom, and pans in screen coordinates', () => {
    const zoomed = zoomWallViewport({ zoom: 1, panU: 0, panV: 0 }, 2, { u: 100, v: -50 });
    expect(zoomed).toEqual({ zoom: 2, panU: -100, panV: 50 });
    expect(zoomWallViewport(zoomed, 99).zoom).toBe(5);
    expect(panWallViewport(zoomed, { u: 40, v: -25 })).toEqual({ zoom: 2, panU: -60, panV: 25 });
  });

  it('maps screen coordinates to the wall-local U/V system', () => {
    expect(
      screenPointToWallLocal({ clientX: 160, clientY: 70 }, { left: 10, top: 10, width: 300, height: 240 }, bounds),
    ).toEqual({ u: 1500, v: 1800 });
  });

  it('reflects the pointer U on a mirrored face elevation (screen-left = far wall end)', () => {
    const rect = { left: 10, top: 10, width: 300, height: 240 };
    const mirrored = { ...bounds, mirrorU: true };
    // The wall centre is its own mirror image.
    expect(screenPointToWallLocal({ clientX: 160, clientY: 70 }, rect, mirrored)).toEqual({ u: 1500, v: 1800 });
    // The left edge of the canvas is the wall's far end (U = length) when mirrored.
    expect(screenPointToWallLocal({ clientX: 10, clientY: 70 }, rect, mirrored)).toEqual({ u: 3000, v: 1800 });
    // A quarter in from screen-left reads three quarters along the wall.
    expect(screenPointToWallLocal({ clientX: 85, clientY: 70 }, rect, mirrored)).toEqual({ u: 2250, v: 1800 });
  });

  it('snaps to panel joints, framing centers, openings, and the configured grid', () => {
    const candidates = collectWallSnapCandidates({
      ...bounds,
      panels: [{ u0: 0, u1: 1219, v0: 0, v1: 2400 }],
      members: [{ u0: 1194, u1: 1244, v0: 0, v1: 2400 }],
      openings: [{ u0: 2000, u1: 2900, v0: 0, v1: 2100 }],
    });
    expect(snapWallLocalPoint({ u: 1227, v: 104 }, candidates, { step: 100, threshold: 15 })).toEqual({
      u: 1219,
      v: 100,
    });
  });

  it('prefers the configured shadow reveal when drawing beside an existing panel', () => {
    const candidates = collectWallSnapCandidates({
      ...bounds,
      panels: [{ u0: 0, u1: 1200, v0: 0, v1: 1200 }],
      revealGap: { u: 6, v: 9 },
    });

    expect(candidates.u).toContain(1206);
    expect(candidates.u).not.toContain(1200);
    expect(snapWallLocalPoint({ u: 1201, v: 1300 }, candidates, { step: 100, threshold: 12 })).toEqual({
      u: 1206,
      v: 1300,
    });
  });

  it('returns associative dimension references when an endpoint snaps to modeled geometry', () => {
    const targets = collectWallDimensionSnapTargets({
      wallId: 'wall-1',
      ...bounds,
      panels: [{ localId: 'panel-1', u0: 0, u1: 1200, v0: 0, v1: 2400 }],
      members: [],
      openings: [{ id: 'window-1', u0: 1800, u1: 2600, v0: 900, v1: 2100 }],
    });
    const snapped = snapWallDimensionEndpoint({ u: 1794, v: 2105 }, targets, 10);

    expect(snapped).toEqual({
      point: { u: 1800, v: 2100 },
      reference: { entityType: 'opening', entityId: 'window-1', anchor: 'top_left' },
    });
  });

  it('projects measurement endpoints continuously onto an edge instead of only snapping to corners', () => {
    const targets = collectWallDimensionSnapTargets({
      wallId: 'wall-1',
      ...bounds,
      panels: [{ localId: 'panel-1', u0: 0, u1: 1200, v0: 0, v1: 2400 }],
      members: [],
      openings: [],
    });
    const snapped = snapWallDimensionEndpoint({ u: 1194, v: 731.25 }, targets, 10);

    expect(snapped.point).toEqual({ u: 1200, v: 731.25 });
    expect(snapped.reference).toMatchObject({
      entityType: 'panel',
      entityId: 'panel-1',
      anchor: 'edge_right',
      t: 731.25 / 2400,
    });
  });

  it('compares dimension snap candidates in screen pixels at any canvas aspect ratio', () => {
    const targets = [
      {
        kind: 'point',
        u: 10,
        v: 0,
        reference: { entityType: 'wall', entityId: 'wall-1', anchor: 'bottom_right' },
      },
      {
        kind: 'point',
        u: 0,
        v: 4,
        reference: { entityType: 'wall', entityId: 'wall-1', anchor: 'top_left' },
      },
    ];

    const snapped = snapWallDimensionEndpoint({ u: 0, v: 0 }, targets, {
      thresholdPixels: 10,
      pointThresholdPixels: 10,
      pixelsPerU: 0.1,
      pixelsPerV: 1,
    });

    expect(snapped.reference.anchor).toBe('bottom_right');
  });

  it('gives a nearby exact point priority over a continuous edge projection', () => {
    const targets = [
      {
        kind: 'segment',
        start: { u: 0, v: 0 },
        end: { u: 10, v: 0 },
        reference: { entityType: 'panel', entityId: 'panel-1', anchor: 'edge_bottom' },
      },
      {
        kind: 'point',
        u: 5,
        v: 5,
        reference: { entityType: 'panel', entityId: 'panel-1', anchor: 'center' },
      },
    ];

    const snapped = snapWallDimensionEndpoint({ u: 5, v: 0 }, targets, {
      thresholdPixels: 12,
      pointThresholdPixels: 6,
      pixelsPerU: 1,
      pixelsPerV: 1,
    });

    expect(snapped).toEqual({
      point: { u: 5, v: 5 },
      reference: { entityType: 'panel', entityId: 'panel-1', anchor: 'center' },
    });
  });

  it('snaps measurements to a framing member centreline at any point along its length', () => {
    const targets = collectWallDimensionSnapTargets({
      wallId: 'wall-1',
      ...bounds,
      panels: [],
      members: [{ id: 'stud-1', orientation: 'vertical', frameIndex: 0, u0: 1175, u1: 1225, v0: 0, v1: 2400 }],
      openings: [],
    });
    const snapped = snapWallDimensionEndpoint({ u: 1204, v: 811 }, targets, 10);

    expect(snapped.point).toEqual({ u: 1200, v: 811 });
    expect(snapped.reference).toMatchObject({ entityType: 'framing', entityId: 'stud-1', anchor: 'axis_center' });
  });

  it('snaps associative measurements directly to an exact screw center', () => {
    const targets = collectWallDimensionSnapTargets({
      wallId: 'wall-1',
      ...bounds,
      panels: [],
      members: [],
      openings: [],
      fasteners: [{ id: 'guide-1:station:2', u: 400, v: 450 }],
    });

    expect(snapWallDimensionEndpoint({ u: 405, v: 446 }, targets, 10)).toEqual({
      point: { u: 400, v: 450 },
      reference: { entityType: 'fastener', entityId: 'guide-1:station:2', anchor: 'center' },
    });
  });

  it('reports how framing meets an opening so a stud near a door reads as a number', () => {
    const door = { id: 'door-1', kind: 'door', u0: 900, u1: 1800, v0: 0, v1: 2100 };
    const clearanceOf = (member) => measureFramingClearance(member, [door]);

    // A stud standing well clear of the jamb reports the gap an installer measures.
    expect(clearanceOf({ u0: 800, u1: 850, v0: 0, v1: 2400 })).toMatchObject({
      contact: 'clear',
      separation: 50,
      overlap: 0,
      axis: 'u',
    });

    // Flush against the jamb is contact, not a clash.
    expect(clearanceOf({ u0: 850, u1: 900, v0: 0, v1: 2400 })).toMatchObject({ contact: 'flush', overlap: 0 });

    // A header sitting on the head line is flush too, never a clash.
    expect(clearanceOf({ u0: 900, u1: 1800, v0: 2100, v1: 2150 })).toMatchObject({ contact: 'flush', overlap: 0 });

    // A trimmer centred on the jamb eats half its width into the opening.
    expect(clearanceOf({ u0: 875, u1: 925, v0: 0, v1: 2400 })).toMatchObject({ contact: 'jamb', overlap: 25 });

    // A stud standing inside the doorway is in the way and says by how much.
    expect(clearanceOf({ u0: 1000, u1: 1050, v0: 0, v1: 2400 })).toMatchObject({
      contact: 'intrusion',
      overlap: 150,
      axis: 'u',
    });

    // A stud passing above the head misses the opening entirely.
    expect(clearanceOf({ u0: 1000, u1: 1050, v0: 2200, v1: 2400 })).toMatchObject({
      contact: 'clear',
      separation: 100,
      axis: 'v',
    });
  });

  it('collects opening clashes worst first and ignores framing that only touches', () => {
    const openings = [{ id: 'door-1', kind: 'door', u0: 900, u1: 1800, v0: 0, v1: 2100 }];
    const members = [
      { id: 'clear-stud', kind: 'stud', u0: 600, u1: 650, v0: 0, v1: 2400 },
      { id: 'header', kind: 'header', u0: 900, u1: 1800, v0: 2100, v1: 2150 },
      { id: 'trimmer', kind: 'stud', u0: 875, u1: 925, v0: 0, v1: 2400 },
      { id: 'blocking-stud', kind: 'stud', u0: 1300, u1: 1350, v0: 0, v1: 2400 },
    ];

    expect(findFramingOpeningClashes(members, openings)).toEqual([
      expect.objectContaining({ memberId: 'blocking-stud', contact: 'intrusion', overlap: 450 }),
      expect.objectContaining({ memberId: 'trimmer', contact: 'jamb', overlap: 25 }),
    ]);
    expect(findFramingOpeningClashes(members, [])).toEqual([]);
  });

  it('turns construction measurements into continuous screw guides with exact intersections', () => {
    const targets = collectWallDimensionGuideTargets([
      {
        id: 'horizontal-setout',
        mode: 'horizontal',
        start: { u: 100, v: 300 },
        end: { u: 900, v: 500 },
      },
      {
        id: 'vertical-setout',
        mode: 'vertical',
        start: { u: 600, v: 100 },
        end: { u: 800, v: 900 },
      },
    ]);

    expect(
      snapWallDimensionEndpoint({ u: 605, v: 307 }, targets, {
        thresholdPixels: 10,
        pointThresholdPixels: 10,
      }),
    ).toEqual({
      point: { u: 600, v: 300 },
      reference: {
        entityType: 'measurement',
        entityId: 'horizontal-setout:vertical-setout',
        anchor: 'guide_intersection',
      },
    });
    expect(snapWallDimensionEndpoint({ u: 420, v: 306 }, targets, 10)).toMatchObject({
      point: { u: 420, v: 300 },
      reference: { entityType: 'measurement', entityId: 'horizontal-setout', anchor: 'guide_line' },
    });
  });

  it('quantizes free measurement points independently of the coarse drawing grid', () => {
    expect(quantizeWallLocalPoint({ u: 123.4567, v: 987.6543 }, 0.01)).toEqual({ u: 123.46, v: 987.65 });
  });

  it('draws panels and click-places full-span framing members', () => {
    expect(createDrawnPanel({ u: 100, v: 200 }, { u: 800, v: 1400 }, bounds)).toMatchObject({
      u: 100,
      v: 200,
      width: 700,
      height: 1200,
    });
    expect(
      createDrawnFramingMember(
        'draw_stud',
        { u: 1200, v: 800 },
        { u: 1200, v: 800 },
        { studWidth: 50, studDepth: 75, material: 'timber' },
        bounds,
      ),
    ).toMatchObject({ u0: 1175, u1: 1225, v0: 0, v1: 2400, orientation: 'vertical' });
  });

  it('traces a slab-style cut panel and removes the duplicate closing point', () => {
    const panel = createTracedPanel(
      [
        { u: 100, v: 200 },
        { u: 900, v: 200 },
        { u: 900, v: 700 },
        { u: 500, v: 1200 },
        { u: 100, v: 200 },
      ],
      bounds,
    );

    expect(panel).toMatchObject({ u: 100, v: 200, width: 800, height: 1000 });
    expect(panel.outlinePoints).toHaveLength(4);
  });

  it('centers a reveal on a shared stud and leaves equal panel landing', () => {
    const members = [{ orientation: 'vertical', u0: 975, u1: 1025, v0: 0, v1: 2400, frameIndex: 0 }];
    const left = fitPanelToFramingReveal(
      createDrawnPanel({ u: 0, v: 0 }, { u: 1000, v: 2400 }, bounds),
      members,
      { u: 5, v: 6 },
      bounds,
    );
    const right = fitPanelToFramingReveal(
      createDrawnPanel({ u: 1000, v: 0 }, { u: 2000, v: 2400 }, bounds),
      members,
      { u: 5, v: 6 },
      bounds,
    );

    expect(left.u1).toBe(997.5);
    expect(right.u0).toBe(1002.5);
    expect(right.u0 - left.u1).toBe(5);
    expect(left.u1 - members[0].u0).toBe(22.5);
    expect(members[0].u1 - right.u0).toBe(22.5);
  });

  it('gives an adjacent panel gap priority and aligns the adjoining panel edges', () => {
    const existing = [{ id: 'left-panel', u0: 0, u1: 997.5, v0: 100, v1: 1300 }];
    const next = snapPanelToAdjacentReveal(
      createDrawnPanel({ u: 990, v: 92 }, { u: 2000, v: 1312 }, bounds),
      existing,
      { u: 5, v: 6 },
      bounds,
      { threshold: 40 },
    );

    expect(next).toMatchObject({ u0: 1002.5, u1: 2000, v0: 100, v1: 1300 });
    expect(next.u0 - existing[0].u1).toBe(5);
    expect(next.revealSnaps).toEqual([
      expect.objectContaining({ axis: 'u', edge: 'u0', gap: 5, existingPanelId: 'left-panel' }),
    ]);
  });

  it('does not let a nearby framing snap overwrite the requested panel gap', () => {
    const existing = [{ id: 'first-panel', u0: 0, u1: 1219, v0: 0, v1: 1200 }];
    const members = [{ orientation: 'vertical', u0: 1175, u1: 1225, v0: 0, v1: 2400, frameIndex: 0 }];
    const drawn = createDrawnPanel({ u: 1224, v: 0 }, { u: 2200, v: 1200 }, bounds);
    const framed = fitPanelToFramingReveal(drawn, members, { u: 5, v: 5 }, bounds, { threshold: 40 });
    const snapped = snapPanelToAdjacentReveal(framed, existing, { u: 5, v: 5 }, bounds, { threshold: 40 });

    expect(framed.u0).toBe(1202.5);
    expect(snapped.u0).toBe(1224);
    expect(snapped.u0 - existing[0].u1).toBe(5);
  });

  it('snaps a stacked panel to the configured horizontal reveal', () => {
    const existing = [{ id: 'lower-panel', u0: 100, u1: 1300, v0: 0, v1: 997 }];
    const next = snapPanelToAdjacentReveal(
      createDrawnPanel({ u: 108, v: 990 }, { u: 1290, v: 2000 }, bounds),
      existing,
      { u: 5, v: 6 },
      bounds,
      { threshold: 40 },
    );

    expect(next).toMatchObject({ u0: 100, u1: 1300, v0: 1003, v1: 2000 });
    expect(next.v0 - existing[0].v1).toBe(6);
  });

  it('keeps dragged panels inside the wall bounds', () => {
    expect(movePanelWithinBounds({ u0: 0, u1: 1200, v0: 0, v1: 1200 }, { u: 2500, v: 1800 }, bounds)).toMatchObject({
      u0: 1800,
      u1: 3000,
      v0: 1200,
      v1: 2400,
    });
  });

  it('moves a measurement as one guide, preserves its value, and releases stale references', () => {
    const moved = moveWallDimensionWithinBounds(
      {
        id: 'setout',
        mode: 'horizontal',
        start: { u: 100, v: 200 },
        end: { u: 900, v: 200 },
        startRef: { entityType: 'panel', entityId: 'panel-1', anchor: 'edge_left' },
        endRef: { entityType: 'panel', entityId: 'panel-1', anchor: 'edge_right' },
      },
      { u: 2300.126, v: 2350.127 },
      bounds,
      0.01,
    );

    expect(moved).toMatchObject({
      start: { u: 2200, v: 2400 },
      end: { u: 3000, v: 2400 },
      startRef: null,
      endRef: null,
    });
    expect(moved.end.u - moved.start.u).toBe(800);
  });

  it('moves a traced panel without losing its cut outline', () => {
    const moved = movePanelWithinBounds(
      {
        u0: 100,
        u1: 900,
        v0: 200,
        v1: 1200,
        polygonal: true,
        outlinePoints: [
          { u: 100, v: 200 },
          { u: 900, v: 200 },
          { u: 500, v: 1200 },
        ],
      },
      { u: 100, v: 50 },
      bounds,
    );

    expect(moved.outlinePoints).toEqual([
      { u: 200, v: 250 },
      { u: 1000, v: 250 },
      { u: 600, v: 1250 },
    ]);
  });

  it('adds only the missing continuous backing at panel edges', () => {
    const panels = [
      { u0: 0, u1: 1200, v0: 0, v1: 2400 },
      { u0: 1206, u1: 2406, v0: 0, v1: 2400 },
    ];
    const existing = [
      { orientation: 'vertical', u0: 0, u1: 50, v0: 0, v1: 2400 },
      { orientation: 'horizontal', u0: 0, u1: 3000, v0: 0, v1: 50 },
      { orientation: 'horizontal', u0: 0, u1: 3000, v0: 2350, v1: 2400 },
    ];
    const added = buildPanelJointBackingMembers(
      panels,
      existing,
      { studWidth: 50, studDepth: 75, material: 'light_gauge_steel' },
      bounds,
    );

    expect(added).toHaveLength(2);
    expect(added.every((member) => member.orientation === 'vertical')).toBe(true);
    expect(added.map((member) => (member.u0 + member.u1) / 2)).toEqual([1203, 2406]);
    expect(1200 - added[0].u0).toBe(22);
    expect(added[0].u1 - 1206).toBe(22);
  });
});
