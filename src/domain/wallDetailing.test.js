import { describe, expect, it } from 'vitest';
import { createDoor, createFloor, createWall, createWindow } from './models';
import {
  createAsBuiltMeasurement,
  createFastenerGuide,
  createFastenersFromGuide,
  createManualFastener,
  createWallDimension,
  createWallDetailing,
  deriveAsBuiltComparison,
  deriveFastenerGuideLayout,
  deriveWallDetail,
  deriveWallDetailTakeoff,
  deriveWallDimensionGeometry,
  deriveWallDimensions,
  formatWallDimensionValue,
  resolveWallDimensionReference,
  deriveWallFasteners,
  deriveWallFramingMembers,
  deriveWallPanels,
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
