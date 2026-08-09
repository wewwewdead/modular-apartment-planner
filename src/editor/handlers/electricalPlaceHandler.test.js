import { describe, expect, it } from 'vitest';
import { createElectricalPlaceHandler } from './electricalPlaceHandler';
import { ELECTRICAL_PLATE, ELECTRICAL_SYMBOL_SIZE } from '@/domain/defaults';

/**
 * Fixture (mm): one 6000-long wall along +x at y=0, 200 thick. A door 900 wide
 * is centred at offset 3000, so the span [2550, 3450] is unmountable.
 *
 *      0 ────────────[ door @3000 ]──────────── 6000
 */
function makeFloor(overrides = {}) {
  return {
    id: 'floor_1',
    walls: [{ id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, thickness: 200 }],
    doors: [{ id: 'door_1', wallId: 'wall_1', offset: 3000, width: 900 }],
    windows: [],
    electricalDevices: [],
    ...overrides,
  };
}

function createHarness({ floor = makeFloor(), toolState: initialToolState = {}, activePhaseId = 'phase_1' } = {}) {
  let toolState = { ...initialToolState };
  const dispatched = [];
  const editorActions = [];

  const handler = createElectricalPlaceHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      editorActions.push(action);
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getFloor: () => floor,
    activeFloorId: floor.id,
    activePhaseId,
  });

  return {
    dispatched,
    editorActions,
    getToolState: () => toolState,
    move(modelPos) {
      handler.onMouseMove(modelPos, {}, toolState);
    },
    down(modelPos, e = { button: 0 }) {
      handler.onMouseDown(modelPos, e, toolState);
    },
    key(e) {
      handler.onKeyDown(e, toolState);
    },
    cursor() {
      return handler.getCursor(toolState);
    },
  };
}

describe('electricalPlaceHandler preview', () => {
  it('snaps to the nearest wall and previews the projected offset and side', () => {
    const harness = createHarness();
    harness.move({ x: 1000, y: 250 });

    expect(harness.getToolState()).toMatchObject({
      previewWallId: 'wall_1',
      previewOffset: 1000,
      previewSide: 'right',
      previewBlocked: false,
      deviceType: 'outlet',
    });
    expect(harness.cursor()).toBe('copy');
  });

  it('reports the opposite side when the cursor crosses the wall', () => {
    const harness = createHarness();
    harness.move({ x: 1000, y: -250 });

    expect(harness.getToolState().previewSide).toBe('left');
  });

  it('clears every preview key when no wall is within the detect radius', () => {
    const harness = createHarness();
    harness.move({ x: 1000, y: 250 });
    harness.move({ x: 1000, y: 4000 });

    expect(harness.getToolState()).toMatchObject({
      previewWallId: null,
      previewOffset: null,
      previewSide: null,
      previewBlocked: false,
    });
    expect(harness.cursor()).toBe('not-allowed');
  });

  it('blocks placement over a door opening', () => {
    const harness = createHarness();
    harness.move({ x: 3000, y: 100 });

    expect(harness.getToolState()).toMatchObject({ previewWallId: 'wall_1', previewBlocked: true });
    expect(harness.cursor()).toBe('not-allowed');
  });

  it('blocks a neighbour within symbol width on the same side but not on the opposite side', () => {
    const floor = makeFloor({
      electricalDevices: [{ id: 'elec_1', wallId: 'wall_1', offset: 1000, side: 'right', deviceType: 'outlet' }],
    });

    const sameSide = createHarness({ floor });
    sameSide.move({ x: 1000 + ELECTRICAL_SYMBOL_SIZE / 2, y: 100 });
    expect(sameSide.getToolState()).toMatchObject({ previewSide: 'right', previewBlocked: true });

    const oppositeSide = createHarness({ floor });
    oppositeSide.move({ x: 1000 + ELECTRICAL_SYMBOL_SIZE / 2, y: -100 });
    expect(oppositeSide.getToolState()).toMatchObject({ previewSide: 'left', previewBlocked: false });
  });

  it('leaves a neighbour a full symbol width away unblocked', () => {
    const floor = makeFloor({
      electricalDevices: [{ id: 'elec_1', wallId: 'wall_1', offset: 1000, side: 'right', deviceType: 'outlet' }],
    });
    const harness = createHarness({ floor });
    harness.move({ x: 1000 + ELECTRICAL_SYMBOL_SIZE, y: 100 });

    expect(harness.getToolState().previewBlocked).toBe(false);
  });

  it('allows a switch hard against a door jamb — blocking uses the plate, not the symbol', () => {
    // Door spans [2550, 3450]; a plate centred at 2500 ends exactly at 2550.
    const harness = createHarness({ toolState: { deviceType: 'switch' } });
    harness.move({ x: 2500, y: 100 });

    expect(harness.getToolState()).toMatchObject({ previewOffset: 2500, previewBlocked: false });
  });

  it('clamps the preview to the plate footprint so a device can reach the wall end', () => {
    const harness = createHarness();
    harness.move({ x: 6300, y: 100 });

    expect(harness.getToolState().previewOffset).toBe(6000 - ELECTRICAL_PLATE.width / 2);
  });

  it('snaps the preview flush against a column standing on the wall', () => {
    // 400×400 column centred on the wall at x=1500: faces at 1300 and 1700
    const floor = makeFloor({ columns: [{ id: 'col_1', x: 1500, y: 0, width: 400, depth: 400, rotation: 0 }] });
    const harness = createHarness({ floor });
    harness.move({ x: 1240, y: 100 });

    expect(harness.getToolState().previewOffset).toBe(1300 - ELECTRICAL_PLATE.width / 2);
  });
});

describe('electricalPlaceHandler placement', () => {
  it('creates a device from the preview and stamps the active phase', () => {
    const harness = createHarness({ toolState: { deviceType: 'switch-3way' } });
    harness.move({ x: 1200, y: 250 });
    harness.down({ x: 1200, y: 250 });

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0]).toMatchObject({
      type: 'ELECTRICAL_DEVICE_ADD',
      floorId: 'floor_1',
      device: {
        wallId: 'wall_1',
        offset: 1200,
        side: 'right',
        deviceType: 'switch-3way',
        mountHeight: 1200,
        phaseId: 'phase_1',
      },
    });
  });

  it('stamps a null phaseId when no phase is active', () => {
    const harness = createHarness({ activePhaseId: null });
    harness.move({ x: 1200, y: 250 });
    harness.down({ x: 1200, y: 250 });

    expect(harness.dispatched[0].device.phaseId).toBeNull();
  });

  it('places nothing when blocked, off-wall, or on a non-primary button', () => {
    const blocked = createHarness();
    blocked.move({ x: 3000, y: 100 });
    blocked.down({ x: 3000, y: 100 });
    expect(blocked.dispatched).toHaveLength(0);

    const offWall = createHarness();
    offWall.move({ x: 1000, y: 4000 });
    offWall.down({ x: 1000, y: 4000 });
    expect(offWall.dispatched).toHaveLength(0);

    const rightClick = createHarness();
    rightClick.move({ x: 1200, y: 250 });
    rightClick.down({ x: 1200, y: 250 }, { button: 2 });
    expect(rightClick.dispatched).toHaveLength(0);
  });
});

describe('electricalPlaceHandler keys', () => {
  it('returns to the select tool on Escape', () => {
    const harness = createHarness();
    harness.key({ key: 'Escape' });

    expect(harness.editorActions).toContainEqual({ type: 'SET_TOOL', tool: 'select' });
  });

  it('flips the preview side on f', () => {
    const harness = createHarness();
    harness.move({ x: 1000, y: 250 });
    expect(harness.getToolState().previewSide).toBe('right');

    harness.key({ key: 'f' });
    expect(harness.getToolState().previewSide).toBe('left');

    harness.key({ key: 'F' });
    expect(harness.getToolState().previewSide).toBe('right');
  });
});
