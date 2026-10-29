import { describe, expect, it } from 'vitest';
import { createDoor, createFloor, createSlab, createWall, createWindow } from './models';
import {
  createAsBuiltMeasurement,
  createFastenerGuide,
  createFastenersFromGuide,
  createManualFastener,
  createWallDimension,
  createWallDetailing,
  deriveAsBuiltComparison,
  deriveFastenerGuideLayout,
  deriveRainscreenPanels,
  deriveWallDetail,
  deriveWallDetailOpenings,
  deriveWallDetailTakeoff,
  deriveWallDimensionGeometry,
  deriveWallDimensions,
  formatWallDimensionValue,
  resolveWallDimensionReference,
  deriveWallFasteners,
  deriveWallFramingMembers,
  deriveWallPanels,
  resolveWallBoardSpan,
  resolveWallDetailFrame,
  validateWallDetail,
  wallDimensionMeasurement,
} from './wallDetailing';

function detailedFixture() {
  const floor = createFloor('Ground Floor', 0);
  const wall = createWall({ x: 0, y: 0 }, { x: 3657, y: 0 }, 100, {
    assembly: {
      preset: 'fiber_cement',
      framing: { spacing: 406, studWidth: 50, studDepth: 75, nogginRows: 1 },
    },
  });
  const detail = createWallDetailing({
    enabled: true,
    sides: {
      interior: {
        enabled: true,
        layout: { boardWidth: 1219, boardHeight: 2438, horizontalGap: 6, verticalGap: 6 },
      },
    },
  });
  wall.assembly = { ...wall.assembly, detailing: detail };
  floor.walls = [wall];
  return { floor, wall };
}

describe('wall detailing', () => {
  it('materializes deterministic panels and cuts them around openings', () => {
    const { floor, wall } = detailedFixture();
    const door = createDoor(wall.id, 1800, 900);
    door.height = 2100;
    floor.doors = [door];

    const panels = deriveWallPanels(wall, floor, 'interior');

    expect(panels.length).toBeGreaterThan(3);
    expect(panels.some((panel) => panel.cutouts.length > 0)).toBe(true);
    expect(panels.reduce((sum, panel) => sum + panel.netArea, 0)).toBeLessThan(
      panels.reduce((sum, panel) => sum + panel.grossArea, 0),
    );
    expect(deriveWallPanels(wall, floor, 'interior').map((panel) => panel.id)).toEqual(panels.map((panel) => panel.id));
  });

  it('keeps a traced cut-panel outline and subtracts hosted openings from its exact area', () => {
    const { floor, wall } = detailedFixture();
    wall.assembly.detailing.sides.interior.layout = {
      ...wall.assembly.detailing.sides.interior.layout,
      mode: 'custom',
      customPanels: [
        {
          id: 'cut-panel',
          outlinePoints: [
            { u: 0, v: 0 },
            { u: 1000, v: 0 },
            { u: 1000, v: 1000 },
            { u: 500, v: 1000 },
            { u: 500, v: 500 },
            { u: 0, v: 500 },
          ],
        },
      ],
    };
    const window = createWindow(wall.id, 700, 200);
    window.sillHeight = 200;
    window.height = 200;
    floor.windows = [window];

    const panel = deriveWallPanels(wall, floor, 'interior')[0];

    expect(panel).toMatchObject({ localId: 'cut-panel', polygonal: true, grossArea: 750_000, netArea: 710_000 });
    expect(panel.outlinePoints).toHaveLength(6);
    expect(panel.regions[0].holes).toHaveLength(1);
  });

  it('creates explicit studs, tracks, noggins, headers, and sills', () => {
    const { floor, wall } = detailedFixture();
    floor.windows = [createWindow(wall.id, 1800, 1200)];

    const members = deriveWallFramingMembers(wall, floor);
    const kinds = new Set(members.map((member) => member.kind));

    expect(kinds.has('stud')).toBe(true);
    expect(kinds.has('top_track')).toBe(true);
    expect(kinds.has('bottom_track')).toBe(true);
    expect(kinds.has('noggin')).toBe(true);
    expect(kinds.has('header')).toBe(true);
    expect(kinds.has('sill')).toBe(true);
  });

  it('generates fasteners and flags a manual fastener that misses framing', () => {
    const { floor, wall } = detailedFixture();
    const generated = deriveWallFasteners(wall, floor, 'interior');
    expect(generated.length).toBeGreaterThan(0);

    wall.assembly.detailing.sides.interior.fasteners.manual = [createManualFastener({ u: 203, v: 777 })];
    const issues = validateWallDetail(wall, floor);
    expect(issues.some((entry) => entry.ruleId === 'WALL.FASTENER_MISSES_SUPPORT')).toBe(true);
  });

  it('normalizes a quiet fastener expression independently from its safety geometry', () => {
    const defaults = createWallDetailing({ sides: { interior: { enabled: true } } });
    const accent = createWallDetailing({
      sides: { interior: { enabled: true, fasteners: { appearance: 'contrast', headDiameter: 14 } } },
    });

    expect(defaults.sides.interior.fasteners).toMatchObject({ appearance: 'tonal', headDiameter: 8 });
    expect(accent.sides.interior.fasteners).toMatchObject({ appearance: 'contrast', headDiameter: 14 });
  });

  it('creates an exact measured screw guide without inventing a short final pitch', () => {
    const guide = createFastenerGuide({
      id: 'guide-1',
      name: 'Stud A set-out',
      direction: 'vertical',
      coordinate: 400,
      start: 50,
      end: 1000,
      spacing: 200,
    });
    const layout = deriveFastenerGuideLayout(guide, { length: 3000, height: 2400 });
    const fasteners = createFastenersFromGuide(guide, { length: 3000, height: 2400 });

    expect(layout.stations.map((station) => station.v)).toEqual([50, 250, 450, 650, 850]);
    expect(layout.remainder).toBe(150);
    expect(fasteners).toHaveLength(5);
    expect(fasteners[2]).toMatchObject({
      id: 'guide-1:station:2',
      guideId: 'guide-1',
      guideStation: 2,
      u: 400,
      v: 450,
    });
    expect(
      resolveWallDimensionReference(
        { entityType: 'fastener', entityId: fasteners[2].id, anchor: 'center' },
        { u: 0, v: 0 },
        {
          wall: { id: 'wall-1' },
          length: 3000,
          height: 2400,
          panels: [],
          openings: [],
          members: [],
          fasteners,
        },
      ),
    ).toEqual({ u: 400, v: 450 });

    const { floor, wall } = detailedFixture();
    wall.assembly.detailing.sides.interior.fasteners.guides = [{ ...guide, spacing: 250, zone: 'perimeter' }];
    expect(
      validateWallDetail(wall, floor).some((issue) => issue.ruleId === 'WALL.FASTENER_GUIDE_SPACING_EXCEEDS_PROFILE'),
    ).toBe(true);
  });

  it('traces each panel edge so adjacent panels across a gap get two independent screw rows', () => {
    const panel = (localId, u0, u1) => ({
      id: localId,
      localId,
      label: localId,
      u0,
      u1,
      v0: 0,
      v1: 1000,
      fragments: [{ u0, u1, v0: 0, v1: 1000 }],
    });
    const left = panel('left-panel', 0, 997.5);
    const right = panel('right-panel', 1002.5, 2000);
    const options = {
      mode: 'panel_perimeter',
      spacing: 200,
      edgeClearance: 12,
      cornerClearance: 50,
    };
    const leftLayout = deriveFastenerGuideLayout(
      createFastenerGuide({ ...options, id: 'left-guide', panelId: left.localId }),
      { length: 2000, height: 1000 },
      { panels: [left, right] },
    );
    const rightLayout = deriveFastenerGuideLayout(
      createFastenerGuide({ ...options, id: 'right-guide', panelId: right.localId }),
      { length: 2000, height: 1000 },
      { panels: [left, right] },
    );
    const leftJointRow = leftLayout.segments.find((segment) => segment.index === 1);
    const rightJointRow = rightLayout.segments.find((segment) => segment.index === 3);

    expect(leftJointRow.stations[0].u).toBe(985.5);
    expect(rightJointRow.stations[0].u).toBe(1014.5);
    expect(rightJointRow.stations[0].u - leftJointRow.stations[0].u).toBe(29);
    expect(right.u0 - left.u1).toBe(5);
    expect(
      createFastenersFromGuide(leftLayout, { length: 2000, height: 1000 }, { panels: [left, right] })[0].id,
    ).toMatch(/^left-guide:edge:\d+:station:\d+$/);
  });

  it('reports exact detail takeoff and as-built deviations', () => {
    const { floor, wall } = detailedFixture();
    wall.assembly.detailing.asBuilt.measurements = [
      createAsBuiltMeasurement({ label: 'Joint J1', designValue: 1219, measuredValue: 1232, tolerance: 6 }),
    ];

    const detail = deriveWallDetail(wall, floor);
    const takeoff = deriveWallDetailTakeoff(wall, floor);
    const comparison = deriveAsBuiltComparison(wall);

    expect(detail.panels.interior.length).toBe(takeoff.sides.interior.panelCount);
    expect(takeoff.fastenerCount).toBeGreaterThan(0);
    expect(takeoff.framingMemberCount).toBeGreaterThan(0);
    expect(comparison[0]).toMatchObject({ deviation: 13, status: 'out_of_tolerance' });
  });

  it('derives construction dimensions and keeps referenced endpoints associative', () => {
    const { floor, wall } = detailedFixture();
    const window = createWindow(wall.id, 1800, 1200);
    floor.windows = [window];
    wall.assembly.detailing.sides.interior.dimensions.manual = [
      createWallDimension({
        mode: 'horizontal',
        start: { u: 0, v: 0 },
        end: { u: 1200, v: 900 },
        startRef: { entityType: 'wall', entityId: wall.id, anchor: 'bottom_left' },
        endRef: { entityType: 'opening', entityId: window.id, anchor: 'bottom_left' },
        tolerance: 3,
      }),
    ];

    const dimensions = deriveWallDimensions(wall, floor, 'interior');
    const manual = dimensions.find((dimension) => dimension.source === 'custom');

    expect(dimensions.some((dimension) => dimension.name === 'Overall wall length')).toBe(true);
    expect(dimensions.some((dimension) => dimension.name === 'window width')).toBe(true);
    expect(manual).toMatchObject({ measurement: 1200, label: '1200.00 mm ±3.00 mm' });

    window.offset = 2000;
    expect(
      deriveWallDimensions(wall, floor, 'interior').find((dimension) => dimension.id === manual.id).measurement,
    ).toBe(1400);
  });

  it('measures and lays out aligned, horizontal, and vertical dimension geometry', () => {
    const aligned = createWallDimension({
      mode: 'aligned',
      start: { u: 0, v: 0 },
      end: { u: 300, v: 400 },
      offset: 50,
    });
    expect(wallDimensionMeasurement(aligned)).toBe(500);
    expect(deriveWallDimensionGeometry(aligned)).toMatchObject({
      dimensionStart: { u: -40, v: 30 },
      dimensionEnd: { u: 260, v: 430 },
    });
  });

  it('formats modeled dimensions at the configured precision', () => {
    expect(formatWallDimensionValue(500.126, 0.01)).toBe('500.13 mm');
    expect(formatWallDimensionValue(1.005, 0.01)).toBe('1.01 mm');
    expect(formatWallDimensionValue(500.126, 0.1)).toBe('500.1 mm');
    expect(formatWallDimensionValue(500.126, 1)).toBe('500 mm');
  });

  it('keeps a proportional edge snap associative when the referenced panel changes', () => {
    const reference = { entityType: 'panel', entityId: 'panel-1', anchor: 'edge_right', t: 0.25 };
    expect(createWallDimension({ startRef: reference }).startRef).toEqual(reference);
    const point = resolveWallDimensionReference(
      reference,
      { u: 0, v: 0 },
      {
        wall: { id: 'wall-1' },
        length: 3000,
        height: 2400,
        panels: [{ localId: 'panel-1', u0: 100, u1: 1400, v0: 200, v1: 1800 }],
        openings: [],
        members: [],
      },
    );

    expect(point).toEqual({ u: 1400, v: 600 });
  });

  it('validates unusable construction dimensions', () => {
    const { floor, wall } = detailedFixture();
    wall.assembly.detailing.sides.interior.dimensions.manual = [
      createWallDimension({ start: { u: 50, v: 50 }, end: { u: 50, v: 50 } }),
      createWallDimension({ start: { u: 0, v: 0 }, end: { u: 5000, v: 0 } }),
    ];

    const issues = validateWallDetail(wall, floor);
    expect(issues.some((entry) => entry.ruleId === 'WALL.DIMENSION_ZERO_LENGTH')).toBe(true);
    expect(issues.some((entry) => entry.ruleId === 'WALL.DIMENSION_POINT_OUTSIDE_WALL')).toBe(true);
  });

  it('flags an express-joint layout when no shadow reveal is modeled', () => {
    const { floor, wall } = detailedFixture();
    wall.assembly.detailing.sides.interior.layout.horizontalGap = 0;
    wall.assembly.detailing.sides.interior.layout.verticalGap = 0;
    wall.assembly.detailing.sides.interior.layout.jointSystem = 'express';

    expect(validateWallDetail(wall, floor).some((issue) => issue.ruleId === 'WALL.EXPRESS_JOINT_REQUIRES_REVEAL')).toBe(
      true,
    );
  });

  it('rejects a reveal that leaves no shared framing support', () => {
    const { floor, wall } = detailedFixture();
    wall.assembly.detailing.sides.interior.layout.horizontalGap = 50;

    expect(
      validateWallDetail(wall, floor).some((issue) => issue.ruleId === 'WALL.REVEAL_LEAVES_NO_SHARED_SUPPORT'),
    ).toBe(true);
  });
});

// A bypass wall dropped 250 past its own 250 deck on a 3000 storey: 3250 of
// wall with the finished floor 250 up from the bottom of it.
function bypassFixture() {
  const { floor, wall } = detailedFixture();
  floor.elevation = 3000;
  floor.floorToFloorHeight = 3000;
  floor.slabs = [
    createSlab(
      floor.id,
      [
        { x: -500, y: -500 },
        { x: 4500, y: -500 },
        { x: 4500, y: 500 },
        { x: -500, y: 500 },
      ],
      250,
      3000,
      { name: 'Level 2 deck' },
    ),
  ];
  const bypass = { ...wall, framingMode: 'bypass' };
  floor.walls = [bypass];
  return { floor, wall: bypass };
}

describe('wall detailing over a storey line', () => {
  it('draws a bypass wall over its resolved span, with the floor line inside it', () => {
    const { floor, wall } = bypassFixture();

    expect(resolveWallDetailFrame(wall, floor)).toMatchObject({
      mode: 'bypass',
      height: 3250,
      datumV: 250,
      drop: 250,
      slabBands: [expect.objectContaining({ v0: 0, v1: 250, name: 'Level 2 deck' })],
    });
    expect(deriveWallDetail(wall, floor)).toMatchObject({ height: 3250, datumV: 250 });
  });

  it('keeps an opening on the floor it opens onto rather than sinking it by the drop', () => {
    const { floor, wall } = bypassFixture();
    const window = createWindow(wall.id, 1800, 1200);
    window.sillHeight = 900;
    window.height = 1200;
    floor.windows = [window];

    // datum (250) + sill (900), not base + sill.
    expect(deriveWallDetailOpenings(wall, floor)).toEqual([
      expect.objectContaining({ kind: 'window', v0: 1150, v1: 2350 }),
    ]);
  });

  it('frames the whole span in one run and carries the deck on a ledger', () => {
    const { floor, wall } = bypassFixture();
    const members = deriveWallFramingMembers(wall, floor);
    const of = (kind) => members.filter((member) => member.kind === kind);

    expect(of('stud').length).toBeGreaterThan(0);
    expect(of('stud').every((member) => member.v0 === 0 && member.v1 === 3250)).toBe(true);
    expect([...of('bottom_track'), ...of('top_track')].map((member) => [member.v0, member.v1])).toEqual([
      [0, 50],
      [3200, 3250],
    ]);
    expect(of('ledger')).toEqual([expect.objectContaining({ v0: 0, v1: 250, u0: 0, source: 'generated' })]);
  });

  it('leaves a platform wall exactly as it was — no bands, no ledger, height as stored', () => {
    const { floor, wall } = detailedFixture();

    expect(resolveWallDetailFrame(wall, floor)).toMatchObject({ mode: 'platform', datumV: 0, slabBands: [] });
    expect(resolveWallDetailFrame(wall, floor).height).toBe(wall.height);
    expect(deriveWallFramingMembers(wall, floor).some((member) => member.kind === 'ledger')).toBe(false);
  });
});

/**
 * A 6 m facade over a 5.4 m span — three storeys of cassettes on one plane,
 * which is the case the module grid exists for.
 */
function rainscreenFixture() {
  const floor = createFloor('Ground Floor', 0);
  const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, {
    height: 5400,
    assembly: {
      preset: 'fiber_cement',
      exterior: { material: 'rainscreen' },
      framing: { spacing: 400, studWidth: 50, studDepth: 75 },
    },
  });
  floor.walls = [wall];
  return { floor, wall };
}

function uniqueAscending(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

describe('rainscreen facade module', () => {
  it('sets the cassettes out on a 900 × 1800 grid with 10 mm open joints, clipped at the wall ends', () => {
    const { floor, wall } = rainscreenFixture();

    const panels = deriveRainscreenPanels(wall, floor, 'exterior');

    // 6000 / 910 → seven courses across, 5400 / 1810 → three up.
    expect(panels).toHaveLength(21);
    expect(uniqueAscending(panels.map((panel) => panel.u0))).toEqual([0, 910, 1820, 2730, 3640, 4550, 5460]);
    expect(uniqueAscending(panels.map((panel) => panel.v0))).toEqual([0, 1810, 3620]);

    // Whole cassettes are the module; the last column and the top course are
    // what is left of the module after the wall runs out.
    expect(panels.filter((panel) => panel.width === 900 && panel.height === 1800)).toHaveLength(12);
    const lastColumn = panels.filter((panel) => panel.u0 === 5460);
    expect(lastColumn).toHaveLength(3);
    expect(lastColumn.every((panel) => panel.u1 === 6000 && panel.width === 540)).toBe(true);
    const topCourse = panels.filter((panel) => panel.v0 === 3620);
    expect(topCourse).toHaveLength(7);
    expect(topCourse.every((panel) => panel.v1 === 5400 && panel.height === 1780)).toBe(true);

    // The joints themselves: 10 mm of nothing between one cassette and the next.
    const columnStarts = uniqueAscending(panels.map((panel) => panel.u0));
    const columnEnds = uniqueAscending(panels.map((panel) => panel.u1));
    expect(columnStarts.slice(1).map((start, index) => start - columnEnds[index])).toEqual([10, 10, 10, 10, 10, 10]);
    const rowStarts = uniqueAscending(panels.map((panel) => panel.v0));
    const rowEnds = uniqueAscending(panels.map((panel) => panel.v1));
    expect(rowStarts.slice(1).map((start, index) => start - rowEnds[index])).toEqual([10, 10]);
  });

  it('cuts cassettes around a door and drops the ones the opening swallows whole', () => {
    const { floor, wall } = rainscreenFixture();
    // Centred on the second column and taller than the bottom course, so that
    // cassette is entirely inside the hole and the two beside it are nicked.
    const door = createDoor(wall.id, 1360, 1000);
    door.height = 2100;
    door.sillHeight = 0;
    floor.doors = [door];

    const panels = deriveRainscreenPanels(wall, floor, 'exterior');
    const byModule = new Map(panels.map((panel) => [panel.localId, panel]));
    const [opening] = deriveWallDetailOpenings(wall, floor);

    expect(opening).toMatchObject({ u0: 860, u1: 1860, v0: 0, v1: 2100 });
    // Nobody clads a doorway: the cassette inside it is not ordered at all.
    expect(byModule.has('grid-c1-r0')).toBe(false);
    expect(panels).toHaveLength(20);

    // The neighbours are cut on the jamb line, exactly where the board skins cut.
    expect(byModule.get('grid-c0-r0').fragments).toEqual([{ u0: 0, u1: 860, v0: 0, v1: 1800 }]);
    expect(byModule.get('grid-c2-r0').fragments).toEqual([{ u0: 1860, u1: 2720, v0: 0, v1: 1800 }]);
    // And the course above is cut on the head line, not left hanging over it.
    expect(byModule.get('grid-c1-r1').fragments).toEqual([{ u0: 910, u1: 1810, v0: 2100, v1: 3610 }]);

    // The head at 2100 sits above the first course, so the second course's
    // neighbours are nicked by the top corners of the opening too.
    const cut = panels.filter((panel) => panel.cutouts.length > 0);
    expect(cut.map((panel) => panel.localId).sort()).toEqual([
      'grid-c0-r0',
      'grid-c0-r1',
      'grid-c1-r1',
      'grid-c2-r0',
      'grid-c2-r1',
    ]);
    expect(cut.every((panel) => panel.netArea < panel.grossArea)).toBe(true);
  });

  it('runs the courses past the floor lines of a bypass wall rather than restarting at each deck', () => {
    const { floor, wall } = bypassFixture();
    wall.assembly = {
      ...wall.assembly,
      exterior: { material: 'rainscreen' },
      detailing: undefined,
    };

    const panels = deriveRainscreenPanels(wall, floor, 'exterior');
    const frame = resolveWallDetailFrame(wall, floor);

    // The plane is 3250 tall — 250 below its own deck — so the top course is
    // clipped at 3250 and no course is set out from the storey line at 250.
    expect(frame.height).toBe(3250);
    expect(uniqueAscending(panels.map((panel) => panel.v0))).toEqual([0, 1810]);
    expect(Math.max(...panels.map((panel) => panel.v1))).toBe(3250);
  });

  it('leaves a face the detail editor has taken over answering through its own panels', () => {
    const { floor, wall } = rainscreenFixture();
    wall.assembly = {
      ...wall.assembly,
      detailing: createWallDetailing({
        enabled: true,
        sides: {
          exterior: {
            enabled: true,
            layout: { mode: 'custom', customPanels: [{ id: 'bay', u: 0, v: 0, width: 6000, height: 5400 }] },
          },
        },
      }),
    };

    expect(deriveRainscreenPanels(wall, floor, 'exterior').map((panel) => panel.localId)).toEqual(['bay']);
  });

  it('ignores the sheet layout on a grid face and sets out on the module instead', () => {
    const { floor, wall } = rainscreenFixture();
    wall.assembly = {
      ...wall.assembly,
      detailing: createWallDetailing({
        enabled: true,
        sides: { exterior: { enabled: true, layout: { boardWidth: 1219, boardHeight: 2438 } } },
      }),
    };

    // What the editor draws and what the preview builds are the same set-out.
    expect(deriveWallPanels(wall, floor, 'exterior')).toHaveLength(21);
    expect(deriveWallPanels(wall, floor, 'interior')).toEqual([]);
  });
});

/**
 * Cladding that runs past the end of its wall.
 *
 * Everything below reads its u-range from one place — `boardLayerUSpan` through
 * `resolveWallBoardSpan` — so what these pin is that the sheet grid, the
 * cassette grid and the openings all agree about where the board now stops.
 */
describe('board overhang past the wall end', () => {
  function lapWall(wall, side, overhang) {
    wall.assembly = { ...wall.assembly, [side]: { ...wall.assembly[side], ...overhang } };
  }

  function setLayout(wall, side, layout) {
    const face = wall.assembly.detailing.sides[side];
    face.layout = { ...face.layout, ...layout };
  }

  // What "customizing the boards" leaves behind. Dragging one board, adding one,
  // or pressing Edit generated panels turns the whole face into stored boards,
  // and from then on the elevation is drawn from these numbers rather than from
  // a grid — which is the face the corner detail has to keep working on.
  function storeDrawnPanels(wall, floor, side) {
    setLayout(wall, side, {
      mode: 'custom',
      customPanels: deriveWallPanels(wall, floor, side).map((panel) => ({
        id: panel.localId,
        u: panel.u0,
        v: panel.v0,
        width: panel.width,
        height: panel.height,
      })),
    });
  }

  it('reports the board span for each face off the one derivation', () => {
    const { floor, wall } = detailedFixture();
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangStart: 137, overhangEnd: -50 });

    expect(resolveWallBoardSpan(wall, floor, 'interior')).toMatchObject({ u0: -137, u1: 3607 });
    expect(deriveWallDetail(wall, floor).boardSpans.interior).toMatchObject({ u0: -137, u1: 3607 });
    // The face nobody lapped still stops exactly where the wall does.
    expect(resolveWallBoardSpan(wall, floor, 'exterior')).toMatchObject({ u0: 0, u1: 3657 });
  });

  it('runs the sheet layout past the wall end without moving the joints already on it', () => {
    const { floor, wall } = detailedFixture();
    const flush = deriveWallPanels(wall, floor, 'interior');
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangStart: 400 });
    const lapped = deriveWallPanels(wall, floor, 'interior');

    expect(Math.min(...lapped.map((panel) => panel.u0))).toBe(-400);
    expect(Math.max(...lapped.map((panel) => panel.u1))).toBe(3657);
    // Every board the wall already had is still exactly where it was — the
    // overhang adds cladding at the end, it does not re-set-out the face.
    for (const panel of flush) {
      expect(lapped.some((entry) => entry.localId === panel.localId && entry.u0 === panel.u0)).toBe(true);
    }
  });

  it('still punches the openings out of an overhanging face', () => {
    const { floor, wall } = detailedFixture();
    const door = createDoor(wall.id, 1800, 900);
    door.height = 2100;
    floor.doors = [door];
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangStart: 400, overhangEnd: 400 });

    const panels = deriveWallPanels(wall, floor, 'interior');
    const openings = deriveWallDetailOpenings(wall, floor);

    expect(openings).toHaveLength(1);
    expect(panels.some((panel) => panel.cutouts.length > 0)).toBe(true);
    // No fragment of any board may sit inside the doorway, overhang or not.
    const inside = panels.flatMap((panel) =>
      panel.fragments.filter((fragment) =>
        openings.some(
          (opening) =>
            fragment.u0 < opening.u1 - 0.01 &&
            fragment.u1 > opening.u0 + 0.01 &&
            fragment.v0 < opening.v1 - 0.01 &&
            fragment.v1 > opening.v0 + 0.01,
        ),
      ),
    );
    expect(inside).toEqual([]);
  });

  it('extends the cassette coverage while leaving the facade set-out where it was', () => {
    const { floor, wall } = rainscreenFixture();
    const flush = deriveRainscreenPanels(wall, floor, 'exterior');
    // A neighbouring wall built 137 deep, lapped at the start end.
    lapWall(wall, 'exterior', { material: 'rainscreen', overhangStart: 137 });
    const lapped = deriveRainscreenPanels(wall, floor, 'exterior');

    // The joints stay on the 910 pitch anchored at u = 0: the new column runs
    // back from −137 to the joint at −10, and every course already laid is
    // untouched. A facade whose shadow lines moved when you set a corner detail
    // would be no facade at all.
    expect(uniqueAscending(lapped.map((panel) => panel.u0))).toEqual([-137, 0, 910, 1820, 2730, 3640, 4550, 5460]);
    expect(lapped.filter((panel) => panel.u0 === -137).every((panel) => panel.u1 === -10)).toBe(true);
    expect(lapped).toHaveLength(flush.length + 3);
    // Same tone cycle on every cassette that was there before: the module index
    // counts from the origin line, not from wherever the drawing now starts.
    for (const panel of flush) {
      const match = lapped.find((entry) => entry.u0 === panel.u0 && entry.v0 === panel.v0);
      expect(match.moduleColumn).toBe(panel.moduleColumn);
      expect(match.moduleRow).toBe(panel.moduleRow);
    }
  });

  it('leaves a flush wall deriving exactly the panels it derived before', () => {
    const { floor, wall } = rainscreenFixture();
    const before = deriveRainscreenPanels(wall, floor, 'exterior');
    lapWall(wall, 'exterior', { material: 'rainscreen', overhangStart: 0, overhangEnd: 0 });

    expect(deriveRainscreenPanels(wall, floor, 'exterior')).toEqual(before);
  });

  it('runs a sheet grid set out to the user’s own board size past the wall end too', () => {
    const { floor, wall } = detailedFixture();
    // Not the stock sheet: somebody picked their own board and their own reveal,
    // which must not be what decides whether the corner closes.
    setLayout(wall, 'interior', { boardWidth: 900, boardHeight: 1800, horizontalGap: 10, verticalGap: 10 });
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangStart: 150, overhangEnd: 250 });

    const panels = deriveWallPanels(wall, floor, 'interior');

    expect(Math.min(...panels.map((panel) => panel.u0))).toBe(-150);
    expect(Math.max(...panels.map((panel) => panel.u1))).toBe(3907);
  });

  /**
   * A face somebody has drawn on by hand.
   *
   * The moment a board is dragged, nudged, added or "edit generated panels" is
   * pressed, the face stops being a grid and becomes a list of stored boards.
   * Those boards are held on the WALL's own run, and the lap is derived on top of
   * them — an edge standing on the wall end goes out with the overhang, every
   * joint inside the wall stays where it was drawn, and taking the overhang back
   * off gives the drawing back exactly as it was.
   */
  it('laps the drawn boards that stand on the wall ends and leaves the joints between them', () => {
    const { floor, wall } = detailedFixture();
    storeDrawnPanels(wall, floor, 'interior');
    const drawn = deriveWallPanels(wall, floor, 'interior');
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangStart: 137, overhangEnd: 200 });
    const lapped = deriveWallPanels(wall, floor, 'interior');

    expect(Math.min(...lapped.map((panel) => panel.u0))).toBe(-137);
    expect(Math.max(...lapped.map((panel) => panel.u1))).toBe(3857);
    // Same boards, same count — the outer ones grew, none was added or lost.
    expect(lapped.map((panel) => panel.localId)).toEqual(drawn.map((panel) => panel.localId));
    const joints = (panels) =>
      uniqueAscending(panels.flatMap((panel) => [panel.u0, panel.u1]).filter((u) => u > 1 && u < 3656));
    expect(joints(lapped)).toEqual(joints(drawn));
  });

  it('leaves a drawn board that reaches neither end exactly where it was put', () => {
    const { floor, wall } = detailedFixture();
    setLayout(wall, 'interior', {
      mode: 'custom',
      customPanels: [{ id: 'mid-bay', u: 1200, v: 0, width: 1000, height: 2400 }],
    });
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangStart: 137, overhangEnd: 200 });

    expect(deriveWallPanels(wall, floor, 'interior')[0]).toMatchObject({ u0: 1200, u1: 2200 });
  });

  it('laps a traced board along the edge standing on the wall end and no other', () => {
    const { floor, wall } = detailedFixture();
    setLayout(wall, 'interior', {
      mode: 'custom',
      customPanels: [
        {
          id: 'corner-return',
          outlinePoints: [
            { u: 2657, v: 0 },
            { u: 3657, v: 0 },
            { u: 3657, v: 2400 },
            { u: 3157, v: 2400 },
            { u: 3157, v: 1200 },
            { u: 2657, v: 1200 },
          ],
        },
      ],
    });
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangEnd: 200 });

    const panel = deriveWallPanels(wall, floor, 'interior')[0];

    expect(panel.polygonal).toBe(true);
    expect(uniqueAscending(panel.outlinePoints.map((point) => point.u))).toEqual([2657, 3157, 3857]);
    expect(panel).toMatchObject({ u0: 2657, u1: 3857 });
  });

  it('gives the drawing back untouched once the overhang goes to zero', () => {
    const { floor, wall } = detailedFixture();
    storeDrawnPanels(wall, floor, 'interior');
    const drawn = deriveWallPanels(wall, floor, 'interior');
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangStart: 137, overhangEnd: 200 });
    expect(deriveWallPanels(wall, floor, 'interior')).not.toEqual(drawn);

    lapWall(wall, 'interior', { overhangStart: 0, overhangEnd: 0 });

    // No residue: the stored numbers never moved, so there is nothing to undo.
    expect(deriveWallPanels(wall, floor, 'interior')).toEqual(drawn);
  });

  it('still punches the openings out of a drawn board that has been lapped', () => {
    const { floor, wall } = detailedFixture();
    const door = createDoor(wall.id, 3400, 900);
    door.height = 2100;
    floor.doors = [door];
    storeDrawnPanels(wall, floor, 'interior');
    lapWall(wall, 'interior', { material: 'fiber_cement', overhangEnd: 200 });

    const panels = deriveWallPanels(wall, floor, 'interior');
    const opening = deriveWallDetailOpenings(wall, floor)[0];

    expect(Math.max(...panels.map((panel) => panel.u1))).toBe(3857);
    expect(
      panels.flatMap((panel) =>
        panel.fragments.filter(
          (fragment) =>
            fragment.u0 < opening.u1 - 0.01 &&
            fragment.u1 > opening.u0 + 0.01 &&
            fragment.v0 < opening.v1 - 0.01 &&
            fragment.v1 > opening.v0 + 0.01,
        ),
      ),
    ).toEqual([]);
  });
});

describe('panel support at lapped corners', () => {
  const panelIssues = (issues) => issues.filter((entry) => entry.ruleId === 'WALL.PANEL_EDGE_UNSUPPORTED');

  it('exempts board edges in the overhang region — the neighbour frame carries them', () => {
    const flush = detailedFixture();
    const lapped = detailedFixture();
    lapped.wall.assembly = {
      ...lapped.wall.assembly,
      interior: { ...lapped.wall.assembly.interior, overhangStart: 60, overhangEnd: 100 },
    };

    // The lap moves the outer panel edges past the wall end, where no member of
    // THIS wall can ever stand — that strip is carried by the wall being lapped.
    // The lap must therefore raise exactly the findings the flush wall raises.
    expect(panelIssues(validateWallDetail(lapped.wall, lapped.floor)).length).toBe(
      panelIssues(validateWallDetail(flush.wall, flush.floor)).length,
    );
  });

  // The same exemption, on the face the user has drawn on by hand. A stretched
  // board's outer edge lands past the wall end for exactly the reason a grid
  // board's does, so the rule has to read it the same way — a corner detail that
  // reported itself as an error every time would be worse than useless.
  it('exempts the drawn boards a lap has stretched, the way it exempts the grid', () => {
    const drawnPanels = (fixture) =>
      deriveWallPanels(fixture.wall, fixture.floor, 'interior').map((panel) => ({
        id: panel.localId,
        u: panel.u0,
        v: panel.v0,
        width: panel.width,
        height: panel.height,
      }));
    const flush = detailedFixture();
    const lapped = detailedFixture();
    for (const fixture of [flush, lapped]) {
      const face = fixture.wall.assembly.detailing.sides.interior;
      face.layout = { ...face.layout, mode: 'custom', customPanels: drawnPanels(fixture) };
    }
    lapped.wall.assembly = {
      ...lapped.wall.assembly,
      interior: { ...lapped.wall.assembly.interior, overhangStart: 60, overhangEnd: 100 },
    };

    expect(panelIssues(validateWallDetail(lapped.wall, lapped.floor)).length).toBe(
      panelIssues(validateWallDetail(flush.wall, flush.floor)).length,
    );
  });

  it('still flags a genuinely unsupported edge inside the wall', () => {
    const sparse = detailedFixture();
    sparse.wall.assembly.detailing.sides.interior.layout = {
      ...sparse.wall.assembly.detailing.sides.interior.layout,
      // Joints at 600 land mid-bay between studs at 406 spacing.
      boardWidth: 600,
    };

    expect(panelIssues(validateWallDetail(sparse.wall, sparse.floor)).length).toBeGreaterThan(0);
  });
});
