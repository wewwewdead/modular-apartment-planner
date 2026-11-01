// Phase J (docs/sketch-studio-cut-placement.md): Hole / Pocket / Hardware /
// Transform on the Phase H stage machine. Frames and stored fields for top,
// underside, 37°-turned and 15°-tilted faces; the through-all threshold and
// clamps; round members; hole-centre candidates; the hardware pose (also on
// an underside and in a hole); the transform drag in part coordinates; the
// panel line and the sketch-pocket toggle.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { createOperationDraft, operationModel } from './operations.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import { instanceMatrix } from './movement.js';
import { hardwareDefaults } from './hardware.js';
import { cutWidthDirection, memberFrame, resolveCutPlacement, resolveRow } from './cutPlacement.js';
import { ROW_CURVED, changeRowCount, rowHover } from './placementRows.js';
import {
  CUT_CURVED,
  THROUGH_TOLERANCE,
  cutFeatureChange,
  cutTemplate,
  holeCentres,
  roundMemberPlacement,
} from './placementCuts.js';
import {
  applyPlacementDrag,
  dragReadout,
  dragView,
  finishPlacement,
  hoverShape,
  instanceOperations,
  pickOf,
  placeClick,
  placementSummary,
  placementView,
  replacePlacement,
  startPlacement,
  stepBack,
  toolPoseAfterMove,
} from './placementTool.js';
// The board, its click info and a Place draft (shared with placementHardware.test.js).
import { BOARD, face, placeDraft, world } from './placementCuts.fixtures.js';

const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};

describe('Hole: Place → Shape', () => {
  it('opens in Place with nothing placed, picking faces; Esc cancels (no step back)', () => {
    const w = world();
    const draft = placeDraft(w, 'hole');
    expect(draft.feature).toBeNull();
    expect(draft.partId).toBeNull();
    expect(draft.placement).toMatchObject({ tool: 'hole', stage: 'place', mode: 'cut' });
    expect(pickOf(draft.placement)).toBe('face');
    expect(operationModel(draft)).toBe(w.model);
    const view = placementView(draft, w.ctx);
    expect(view).toMatchObject({ pick: 'face', allowGround: false, cut: true });
    expect(view.hint).toContain('Hole: click a flat face to drill there');
    expect(stepBack(draft, w.ctx)).toBeNull();
  });

  it('a top-face click stores part coordinates, a direction into the material and no placement', () => {
    const w = world();
    const draft = placeClick(placeDraft(w, 'hole'), face(w, [120, 60, 18], [0, 0, 1]), w.ctx);
    expect(draft.partId).toBe('board');
    expect(draft.feature).toMatchObject({ type: 'hole', diameter: 6, throughAll: true, depth: 5 });
    expect(draft.feature.position).toEqual([120, 60, 18]);
    expect(draft.feature.direction).toEqual([0, 0, -1]);
    expect(draft.feature.placement).toBeUndefined();
    expect(draft.placement).toMatchObject({ stage: 'shape', hostInstanceId: 'b1', label: 'top face' });
    expect(operationModel(draft).parts[0].features.at(-1)).toBe(draft.feature);
    const view = placementView(draft, w.ctx);
    expect(view.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius']);
    const arrow = view.handles[0];
    expect(arrow.origin).toEqual([120, 60, 18]);
    close(arrow.direction, [0, 0, -1]);
    // Through all: the arrow reaches the far face.
    expect(arrow.value).toBe(18);
    expect(view).toMatchObject({ cut: true, throughAll: true, cutTool: true });
    expect(view.shape.kind).toBe('prism');
    close(view.handles[2].at, [123, 60, 18]);
    expect(placementSummary(draft, w.ctx)).toBe('On Board · top face · Ø 6 mm at (120, 60) · through all');
  });

  it('drills from the underside: direction +Z, the arrow points up into the board', () => {
    const w = world();
    const draft = placeClick(placeDraft(w, 'hole'), face(w, [100, 100, 0], [0, 0, -1]), w.ctx);
    expect(draft.feature.direction).toEqual([0, 0, 1]);
    expect(draft.feature.position).toEqual([100, 100, 0]);
    const arrow = placementView(draft, w.ctx).handles[0];
    close(arrow.direction, [0, 0, 1]);
    expect(arrow.value).toBe(18);
  });

  it('on a part turned 37° about Z and one tilted 15°, stores the part-local inward normal', () => {
    for (const rotation of [
      [0, 0, 37],
      [15, 0, 0],
    ]) {
      const w = world({ rotation, position: [40, -30, 5] });
      const draft = placeClick(placeDraft(w, 'hole'), face(w, [600, 200, 9], [1, 0, 0]), w.ctx);
      close(draft.feature.direction, [-1, 0, 0], 9);
      close(draft.feature.position, [600, 200, 9], 4);
      // What the kernel resolves is square to the face, mapped back to the world normal.
      const cut = resolveCutPlacement(draft.feature, w.model.parts[0].features, BOARD);
      close(mapPlacement(cut.direction, w.placement, true), mapPlacement([-1, 0, 0], w.placement, true), 9);
      const arrow = placementView(draft, w.ctx).handles[0];
      close(arrow.direction, mapPlacement([-1, 0, 0], w.placement, true), 9);
      expect(arrow.value).toBeCloseTo(600, 6);
    }
  });

  it('the depth arrow: past the far face is Through all, back inside is blind, typed 3 is 3 mm deep', () => {
    const w = world();
    const placed = placeClick(placeDraft(w, 'hole'), face(w, [120, 60, 18], [0, 0, 1]), w.ctx);
    const view = placementView(placed, w.ctx);
    expect(view.cutDepth).toBe(18);
    // Live: the HUD and the ghost follow the drag.
    expect(dragReadout(view, 'distance', 18 - THROUGH_TOLERANCE / 2).text).toBe('Through all');
    expect(dragView(view, 'distance', 25).throughAll).toBe(true);
    expect(dragView(view, 'distance', 9).throughAll).toBe(false);
    expect(dragReadout(view, 'distance', 9).text).toBe('Depth 9 mm');
    const blind = applyPlacementDrag(placed, { id: 'distance', value: 9 }, w.ctx);
    expect(blind.feature).toMatchObject({ depth: 9, throughAll: false });
    const through = applyPlacementDrag(blind, { id: 'distance', value: 17.995 }, w.ctx);
    expect(through.feature).toMatchObject({ depth: 9, throughAll: true });
    expect(applyPlacementDrag(through, { id: 'distance', value: 3 }, w.ctx).feature).toMatchObject({
      depth: 3,
      throughAll: false,
    });
    // No outward side: the minimum.
    expect(applyPlacementDrag(placed, { id: 'distance', value: -4 }, w.ctx).feature.depth).toBe(0.1);
    expect(placementView(blind, w.ctx).handles[0]).toMatchObject({ value: 9, min: 0.1, typing: true });
  });

  it('the grip sets the diameter (clamped at 0.1 mm); the square slides it on the face', () => {
    const w = world();
    const placed = placeClick(placeDraft(w, 'hole'), face(w, [120, 60, 18], [0, 0, 1]), w.ctx);
    expect(applyPlacementDrag(placed, { id: 'radius', value: { radius: 4.25 } }, w.ctx).feature.diameter).toBe(8.5);
    expect(applyPlacementDrag(placed, { id: 'radius', value: { radius: 0 } }, w.ctx).feature.diameter).toBe(0.1);
    const moved = applyPlacementDrag(placed, { id: 'slide', value: [200, 90, 18], from: [120, 60, 18] }, w.ctx);
    expect(moved.feature.position).toEqual([200, 90, 18]);
    expect(moved.feature.direction).toEqual([0, 0, -1]);
    expect(moved.feature).toMatchObject({ diameter: 6, throughAll: true, depth: 5 });
    expect(moved.feature.placement).toBeUndefined();
  });

  it('Re-place keeps the hole and its sizes; the next click moves it', () => {
    const w = world();
    let draft = placeClick(placeDraft(w, 'hole'), face(w, [120, 60, 18], [0, 0, 1]), w.ctx);
    draft = applyPlacementDrag(draft, { id: 'radius', value: { radius: 2 } }, w.ctx);
    const id = draft.feature.id;
    draft = replacePlacement(draft);
    expect(draft.placement.stage).toBe('place');
    draft = placeClick(draft, face(w, [0, 200, 9], [-1, 0, 0]), w.ctx);
    expect(draft.feature).toMatchObject({ id, diameter: 4, direction: [1, 0, 0], position: [0, 200, 9] });
  });

  it('refuses ground clicks and curved faces that are not round members', () => {
    const w = world();
    expect(() => placeClick(placeDraft(w, 'hole'), { kind: 'ground', point: [0, 0, 0] }, w.ctx)).toThrow(
      'Click a face of a part for the hole.',
    );
    expect(() =>
      placeClick(placeDraft(w, 'hole'), { ...face(w, [10, 10, 18], [0, 0, 1]), planar: false }, w.ctx),
    ).toThrow(CUT_CURVED);
  });

  it('carries the sizes of "Apply and place another" into the next hole', () => {
    const w = world();
    const template = cutTemplate({
      id: 'x',
      type: 'hole',
      diameter: 3.4,
      depth: 7,
      throughAll: false,
      holeSpec: { mode: 'clearance', size: 'M3', pitch: 0.5 },
      position: [1, 2, 3],
    });
    expect(template).toEqual({
      diameter: 3.4,
      depth: 7,
      throughAll: false,
      holeSpec: { mode: 'clearance', size: 'M3', pitch: 0.5 },
    });
    const next = placeClick(placeDraft(w, 'hole', { template }), face(w, [50, 50, 18], [0, 0, 1]), w.ctx);
    expect(next.feature).toMatchObject(template);
  });
});

describe('Pocket', () => {
  it('on a right (+X) face: the kernel width rule (Y reference) orients ghost, grip and cut alike', () => {
    const w = world();
    const draft = placeDraft(w, 'pocket');
    const info = face(w, [600, 200, 9], [1, 0, 0]);
    // Hover ghost: width along +Y, height along direction × width = -Z.
    const hover = hoverShape(placementView(draft, w.ctx), info);
    close(hover.frame.x, [0, 1, 0]);
    close(hover.frame.y, [0, 0, -1]);
    const placed = placeClick(draft, info, w.ctx);
    expect(placed.feature).toMatchObject({ type: 'pocket', shape: 'rectangle', width: 12, height: 20, depth: 5 });
    expect(placed.feature.throughAll).toBe(false);
    expect(cutWidthDirection(placed.feature.direction)).toEqual([0, 1, 0]);
    const view = placementView(placed, w.ctx);
    expect(view.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'corner']);
    // The grip reads upright, as Extrude's: the corner up and to the right
    // looking at the face (its frame flips the rectangle's -Z to +Z).
    const corner = view.handles[2];
    close(corner.frame.x, [0, 1, 0]);
    close(corner.frame.y, [0, 0, 1]);
    close(corner.at, [600, 206, 19]);
    const kernel = resolveCutPlacement(placed.feature, w.model.parts[0].features, BOARD);
    close(kernel.widthDirection, view.shape.frame.x);
    const sized = applyPlacementDrag(placed, { id: 'corner', value: { width: 30, height: 0 } }, w.ctx);
    expect(sized.feature).toMatchObject({ width: 30, height: 0.1 });
    expect(dragReadout(view, 'corner', { width: 12, height: 20 }).text).toBe('12 × 20 mm');
    expect(placementSummary(placed, w.ctx)).toMatch(/^On Board · right face · 12 × 20 mm at \(.*\) · depth 5 mm$/);
  });

  it('Existing closed sketch drops the handles; Rectangle again puts them back where it was placed', () => {
    const w = world();
    w.model.sketches.push({ id: 's1', name: 'Slot', plane: 'XY', profile: { type: 'circle', radius: 5 } });
    const placed = placeClick(placeDraft(w, 'pocket'), face(w, [100, 80, 18], [0, 0, 1]), w.ctx);
    const sketch = cutFeatureChange(placed, { id: placed.feature.id, type: 'pocket', sketchId: 's1', depth: 5 });
    const view = placementView(sketch, w.ctx);
    expect(view.shape).toBeNull();
    expect(view.handles).toEqual([]);
    expect(placementSummary(sketch, w.ctx)).toBe('Placed by sketch Slot');
    const back = cutFeatureChange(sketch, {
      id: placed.feature.id,
      type: 'pocket',
      shape: 'rectangle',
      width: 12,
      height: 20,
      depth: 5,
      throughAll: false,
      placement: { type: 'side', side: 'top', u: 50, v: 50 },
    });
    expect(back.feature.placement).toBeUndefined();
    expect(back.feature.position).toEqual([100, 80, 18]);
    expect(placementView(back, w.ctx).handles.map((h) => h.id)).toEqual(['distance', 'slide', 'corner']);
  });
});

describe('Edit hole / pocket with preview', () => {
  const sideHole = {
    id: 'h',
    type: 'hole',
    diameter: 6,
    depth: 5,
    throughAll: false,
    placement: { type: 'side', side: 'top', u: 50, v: 50 },
  };
  const editDraft = (w, feature) =>
    createOperationDraft({
      type: feature.type,
      model: w.model,
      partId: 'board',
      existingFeature: feature,
      placement: startPlacement({ type: feature.type, existingFeature: feature, hostInstanceId: 'b1' }),
    });
  it('draws the handles at the resolved cut; a slide stores coordinates, a depth drag keeps the placement', () => {
    const w = world({ features: [sideHole] });
    const draft = editDraft(w, sideHole);
    expect(draft.placement).toMatchObject({ stage: 'shape', mode: 'cut' });
    const view = placementView(draft, w.ctx);
    expect(view.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius']);
    expect(view.handles[0].origin).toEqual([300, 200, 18]);
    expect(view.handles[0].value).toBe(5);
    expect(view.hint).toContain('sliding it stores exact part coordinates');
    const moved = applyPlacementDrag(draft, { id: 'slide', value: [310, 190, 18] }, w.ctx);
    expect(moved.feature).toMatchObject({ position: [310, 190, 18], direction: [0, 0, -1], depth: 5 });
    expect(moved.feature.placement).toBeUndefined();
    const deeper = applyPlacementDrag(draft, { id: 'distance', value: 7 }, w.ctx);
    expect(deeper.feature).toMatchObject({ depth: 7, placement: sideHole.placement });
    expect(operationModel(moved).parts[0].features.map((f) => f.id)).toEqual(['box', 'h']);
  });
  it('a locked hole has no slide square and says why; a later transform hides every handle', () => {
    const locked = { ...sideHole, positionLocked: true };
    const w = world({ features: [locked] });
    const view = placementView(editDraft(w, locked), w.ctx);
    expect(view.handles.map((h) => h.id)).toEqual(['distance', 'radius']);
    expect(view.hint).toContain('locked');
    const followed = world({
      features: [sideHole, { id: 't', type: 'transform', position: [1, 0, 0], rotation: [0, 0, 0] }],
    });
    const hidden = placementView(editDraft(followed, sideHole), followed.ctx);
    expect(hidden.handles).toEqual([]);
    expect(hidden.hint).toContain('a transform, mirror or pattern follows this hole');
  });
});

describe('Round members', () => {
  function pipeWorld(rotation = [0, 0, 0]) {
    const member = {
      id: 'm',
      type: 'member',
      start: [0, 0, 0],
      end: [0, 0, 300],
      section: { type: 'pipe', diameter: 40, wall: 2 },
      gapStart: 0,
      gapEnd: 0,
      angleStart: 0,
      angleEnd: 0,
    };
    const part = { id: 'pipe', name: 'Round pipe', features: [member] };
    const instance = { id: 'p1', partId: 'pipe', name: '', position: [100, 50, 0], rotation };
    const model = { ...emptyModel(), parts: [part], instances: [instance] };
    const placement = instanceOperations(instance);
    const bounds = [
      [-20, -20, 0],
      [20, 20, 300],
    ];
    const snapshot = {
      parameters: {},
      parts: [{ id: 'pipe', bounds, features: { m: { bounds } } }],
      instances: [{ id: 'p1', partId: 'pipe', placement, bounds }],
    };
    return { member, model, placement, ctx: { model, snapshot, parameters: {} } };
  }
  it('a curved click drills radially: a member placement in mm, no coordinates', () => {
    for (const rotation of [
      [0, 0, 0],
      [15, 30, 45],
    ]) {
      const w = pipeWorld(rotation);
      const a = (135 * Math.PI) / 180;
      const local = [20 * Math.cos(a), 20 * Math.sin(a), 120];
      const point = mapPlacement(local, w.placement);
      const draft = placeClick(
        placeDraft(w, 'hole'),
        { kind: 'face', planar: false, instanceId: 'p1', partId: 'pipe', point, normal: [1, 0, 0] },
        w.ctx,
      );
      expect(draft.feature.placement).toMatchObject({ type: 'member', featureId: 'm', side: 'rear', distance: 120 });
      expect('position' in draft.feature).toBe(false);
      expect('direction' in draft.feature).toBe(false);
      // Defaults for a member host: Ø min(6, span / 4), depth = wall.
      expect(draft.feature).toMatchObject({ diameter: 6, depth: 2, throughAll: true });
      const view = placementView(draft, w.ctx);
      close(view.handles[0].origin, point, 5); // the offset is stored to 1e-6 mm
      close(view.handles[0].direction, mapPlacement([-Math.cos(a), -Math.sin(a), 0], w.placement, true), 6);
      // Through all reaches as far as the kernel's through-all cut: the part
      // box's farthest corner along the cut (20 + 20√2 at 135°).
      expect(view.handles[0].value).toBeCloseTo(20 + 20 * Math.SQRT2, 6);
      expect(placementSummary(draft, w.ctx)).toMatch(/^On Round pipe · rear side · 120 mm from the start · offset /);
      // The square slides along and around it, keeping the member placement.
      const along = mapPlacement([local[0], local[1], 160], w.placement);
      const slid = applyPlacementDrag(draft, { id: 'slide', value: along }, w.ctx);
      expect(slid.feature.placement).toMatchObject({ type: 'member', side: 'rear', distance: 160 });
      expect(slid.feature.placement.offset).toBeCloseTo(draft.feature.placement.offset, 6);
      const far = applyPlacementDrag(draft, { id: 'slide', value: mapPlacement([-200, 20, 160], w.placement) }, w.ctx);
      expect(Math.abs(far.feature.placement.offset)).toBeCloseTo(19.99, 6);
    }
  });
  it('the hover ghost sits in the tangent plane at the resolved cut', () => {
    const w = pipeWorld();
    const view = placementView(placeDraft(w, 'pocket'), w.ctx);
    const point = mapPlacement([20, 0, 80], w.placement);
    const ghost = hoverShape(view, { kind: 'face', planar: false, instanceId: 'p1', point, normal: [1, 0, 0] });
    close(ghost.frame.origin, point, 6);
    close(ghost.frame.normal, [-1, 0, 0]);
    expect(ghost.loops[0]).toHaveLength(4);
  });
  it('accepts a point on the surface of an enabled round member only', () => {
    const { member } = pipeWorld();
    expect(roundMemberPlacement([member], [20, 0, 50]).side).toBe('right');
    expect(roundMemberPlacement([member], [19.7, 0, 50]).side).toBe('right');
    expect(() => roundMemberPlacement([member], [10, 0, 50])).toThrow(CUT_CURVED);
    expect(() => roundMemberPlacement([{ ...member, suppressed: true }], [20, 0, 50])).toThrow(CUT_CURVED);
    expect(() =>
      roundMemberPlacement([member, { id: 't', type: 'transform', position: [0, 0, 0] }], [20, 0, 50]),
    ).toThrow(CUT_CURVED);
    expect(memberFrame(member).metrics.section.diameter).toBe(40);
  });
  // Phase K §3.5: a hole row seeded on a round tube runs along its axis.
  it('Hole row on a round tube: the row follows the member axis, toward the second click', () => {
    for (const rotation of [
      [0, 0, 0],
      [15, 30, 45],
    ]) {
      const w = pipeWorld(rotation);
      const point = mapPlacement([20, 0, 80], w.placement);
      const normal = mapPlacement([1, 0, 0], w.placement, true);
      const seed = placeClick(
        placeDraft(w, 'hole', { row: true }),
        { kind: 'face', planar: false, instanceId: 'p1', partId: 'pipe', point, normal },
        w.ctx,
      );
      expect(seed.placement.stage).toBe('place');
      expect(seed.feature.placement).toMatchObject({ type: 'member', side: 'right', distance: 80 });
      close(seed.placement.axis, mapPlacement([0, 0, 1], w.placement, true), 9);
      expect(placementView(seed, w.ctx).hint).toContain('along the tube');
      // 60 mm back toward the start (5 mm off the line): pitch 20, along −axis.
      const back = placeClick(
        seed,
        { kind: 'path', point: mapPlacement([20, 5, 20], w.placement), snapKind: 'grid', step: 1 },
        w.ctx,
      );
      close(back.feature.row.direction, [0, 0, -1], 9);
      expect(back.feature.row.pitch).toBe(20);
      const bounds = [
        [-20, -20, 0],
        [20, 20, 300],
      ];
      const cut = resolveCutPlacement(back.feature, w.model.parts[0].features, bounds);
      close(resolveRow(back.feature, cut).centres[3], [20, 0, 20], 6);
      // The end square slides along the axis only.
      const view = placementView(back, w.ctx);
      expect(view.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius', 'row-end']);
      const longer = applyPlacementDrag(
        back,
        { id: 'row-end', value: mapPlacement([20, 8, 230], w.placement), step: 1 },
        w.ctx,
      );
      expect(longer.feature.row.pitch).toBe(50);
      close(longer.feature.row.direction, [0, 0, 1], 9);
      expect(placementSummary(longer, w.ctx)).toMatch(
        /^Row of 4 holes on Round pipe · right side · 80 mm from the start · along the member · pitch 50 mm · 150 mm · Ø 6 mm · through all$/,
      );
    }
  });
});

describe('hole-centre candidates', () => {
  it('lists the resolved cut centres in world coordinates, the edited one left out', () => {
    const hole = { id: 'h', type: 'hole', diameter: 6, depth: 5, position: [100, 100, 18], direction: [0, 0, -1] };
    const pocket = {
      id: 'k',
      type: 'pocket',
      shape: 'rectangle',
      width: 10,
      height: 10,
      depth: 2,
      position: [300, 300, 18],
      direction: [0, 0, -1],
    };
    const metrics = {
      h: { cut: { position: [100, 100, 18], direction: [0, 0, -1], widthDirection: [1, 0, 0] } },
      k: { cut: { position: [300, 300, 18], direction: [0, 0, -1], widthDirection: [1, 0, 0] } },
    };
    const w = world({ rotation: [0, 0, 90], position: [1000, 0, 0], features: [hole, pocket], metrics });
    const list = holeCentres(w.ctx);
    expect(list.map((h) => [h.featureId, h.type, h.attachable])).toEqual([
      ['h', 'hole', true],
      ['k', 'pocket', false],
    ]);
    close(list[0].point, [900, 100, 18]);
    close(list[0].normal, [0, 0, 1]);
    expect(holeCentres(w.ctx, 'h').map((h) => h.featureId)).toEqual(['k']);
    // A hole draft's view carries them for the viewport's snapping.
    expect(placementView(placeDraft(w, 'hole'), w.ctx).holeCentres).toHaveLength(2);
  });
});

describe('Hardware', () => {
  const standoff = () => hardwareDefaults('standoff', 'M3');
  it('seats on a top face (part Z = 0 on the face) and on an underside (pointing down)', () => {
    const w = world();
    const draft = placeDraft(w, 'hardware', { hardware: standoff() });
    expect(draft.feature).toBeNull();
    expect(draft.placement).toMatchObject({ tool: 'hardware', stage: 'place', mode: 'placed' });
    const view = placementView(draft, w.ctx);
    expect(view.allowGround).toBe(true);
    // Phase M: holes are chosen first; a flat face or the ground seats a single one.
    expect(view.hint).toContain('Hardware: click the holes it goes in');
    expect(view.hint).toContain('a flat face or empty ground seats a single one');
    const top = placeClick(draft, face(w, [120, 60, 18], [0, 0, 1]), w.ctx);
    expect(top.newInstance).toMatchObject({ position: [120, 60, 18], rotation: [0, 0, 0] });
    expect(top.newPart.features).toEqual([]);
    expect(top.feature).toMatchObject({ type: 'hardware', kind: 'standoff', size: 'M3' });
    const model = operationModel(top);
    expect(model.parts.at(-1).features).toEqual([top.feature]);
    expect(model.instances.at(-1)).toBe(top.newInstance);
    expect(placementSummary(top, w.ctx)).toBe('Threaded standoff M3 on Board · top face at (120, 60)');
    const under = placeClick(draft, face(w, [50, 40, 0], [0, 0, -1]), w.ctx);
    const matrix = instanceMatrix(under.newInstance);
    // Part +Z (out of the seating plane) points down, out of the underside.
    close(
      [8, 9, 10].map((i) => matrix.elements[i]),
      [0, 0, -1],
    );
    close(under.newInstance.position, [50, 40, 0]);
  });
  it('stands on the ground, refuses its own new part, slides on the face', () => {
    const w = world();
    const draft = placeDraft(w, 'hardware', { hardware: standoff() });
    const ground = placeClick(draft, { kind: 'ground', planar: true, point: [-100, 200, 0], normal: [0, 0, 1] }, w.ctx);
    expect(ground.newInstance).toMatchObject({ position: [-100, 200, 0], rotation: [0, 0, 0] });
    expect(placementSummary(ground, w.ctx)).toBe('Threaded standoff M3 on the ground at (-100, 200)');
    const again = replacePlacement(ground);
    expect(() =>
      placeClick(again, { ...face(w, [0, 0, 5], [0, 0, 1]), instanceId: ground.newInstance.id }, w.ctx),
    ).toThrow('Click a face of an existing part, or empty ground.');
    const view = placementView(ground, w.ctx);
    expect(view.handles.map((h) => h.id)).toEqual(['slide']);
    const slid = applyPlacementDrag(ground, { id: 'slide', value: [-90, 210, 0] }, w.ctx);
    expect(slid.newInstance.position).toEqual([-90, 210, 0]);
    expect(slid.newInstance.id).toBe(ground.newInstance.id);
  });
  it('a click on a hole centre picks it (Phase M); Enter seats it in that hole (concentric connection)', () => {
    const w = world();
    const draft = placeDraft(w, 'hardware', { hardware: standoff() });
    const picked = placeClick(
      draft,
      face(w, [100, 100, 18], [0, 0, 1], { snapKind: 'hole centre', holeFeatureId: 'h', holeAttachable: true }),
      w.ctx,
    );
    expect(picked.placement).toMatchObject({ stage: 'place' });
    expect(picked.placement.holes).toHaveLength(1);
    expect(picked.feature).toBeNull();
    const seated = finishPlacement(picked, w.ctx);
    expect(seated.newInstance).toMatchObject({ position: [100, 100, 18], rotation: [0, 0, 0] });
    expect(seated.extraInstances).toEqual([]);
    expect(seated.connections).toEqual([
      expect.objectContaining({
        type: 'concentric',
        from: seated.newInstance.id,
        to: 'b1',
        toFeatureId: 'h',
        offset: 0,
      }),
    ]);
    expect(seated.connections[0].fromFeatureId).toBe(seated.feature.id);
    expect(operationModel(seated).connections).toEqual(seated.connections);
    expect(placementView(seated, w.ctx).handles).toEqual([]);
    expect(placementView(seated, w.ctx).hint).toContain('seated in the hole you clicked (concentric)');
    expect(placementSummary(seated, w.ctx)).toContain('concentric with the hole');
  });
  it('seated in a hole of a row: the connection names the hole (holeIndex), omitted for the first', () => {
    const w = world();
    const at = (holeIndex) =>
      finishPlacement(
        placeClick(
          placeDraft(w, 'hardware', { hardware: standoff() }),
          face(w, [140, 100, 18], [0, 0, 1], {
            snapKind: 'hole centre',
            holeFeatureId: 'r',
            holeAttachable: true,
            holeIndex,
          }),
          w.ctx,
        ),
        w.ctx,
      ).connections[0];
    expect(at(2)).toMatchObject({ type: 'concentric', toFeatureId: 'r', holeIndex: 2 });
    expect('holeIndex' in at(0)).toBe(false);
  });
});

describe('Transform', () => {
  it('opens in Shape with the gizmo on a ghost of the part itself; a drag lands in part coordinates', () => {
    const w = world({ rotation: [0, 0, 37], position: [50, 0, 0] });
    const draft = createOperationDraft({
      type: 'transform',
      model: w.model,
      partId: 'board',
      placement: startPlacement({ type: 'transform', hostInstanceId: 'b1' }),
    });
    expect(draft.placement).toMatchObject({ stage: 'shape', mode: 'tool', self: true });
    const view = placementView(draft, w.ctx);
    expect(view.toolGizmo).toMatchObject({
      self: true,
      partId: 'board',
      hostInstanceId: 'b1',
      position: [0, 0, 0],
      basePose: { position: [0, 0, 0], rotation: [0, 0, 0] },
    });
    expect(view.hint).toContain("Transform: drag the part's ghost with the gizmo");
    expect(placementSummary(draft, w.ctx)).toBe('Drag the ghost in the viewport (M move, R rotate)');
    const value = toolPoseAfterMove(view.toolGizmo, [10, 0, 0], view.toolGizmo.hostOps);
    close(value.position, unmapPlacement([10, 0, 0], w.placement, true));
    const moved = applyPlacementDrag(draft, { id: 'tool', value }, w.ctx);
    expect(moved.feature.position).toEqual(value.position);
    expect(moved.feature.type).toBe('transform');
  });
});

// Phase K (docs/sketch-studio-hole-row.md): the Hole tool as a row.
describe('Hole row: Place → direction → Shape', () => {
  const rowDraft = (w, extra = {}) => placeDraft(w, 'hole', { row: true, ...extra });
  // The second click: the last hole at a part-coordinate point of the top face.
  const end = (w, local, extra = {}) => ({
    kind: 'path',
    point: mapPlacement(local, w.placement),
    snapKind: 'grid',
    step: 1,
    free: false,
    ...extra,
  });
  const seeded = (w, local = [100, 100, 18]) => placeClick(rowDraft(w), face(w, local, [0, 0, 1]), w.ctx);
  const offPlane = (centres, origin, normal) =>
    Math.max(...centres.map((c) => Math.abs(c.reduce((sum, v, i) => sum + (v - origin[i]) * normal[i], 0))));

  it('opens as a Hole with the row flag: count 4, spacing unset, the row hint', () => {
    const w = world();
    const draft = rowDraft(w);
    expect(draft.feature).toBeNull();
    expect(draft.placement).toMatchObject({
      tool: 'hole',
      stage: 'place',
      row: { count: 4, pitch: null, seed: false },
    });
    expect(pickOf(draft.placement)).toBe('face');
    expect(placementView(draft, w.ctx).hint).toContain('Hole row: click where the first hole goes');
    expect(stepBack(draft, w.ctx)).toBeNull();
  });

  it('the first click keeps Place with the seed set: one plain hole, the path pick, the last-hole hint', () => {
    const w = world();
    const draft = seeded(w);
    expect(draft.placement.stage).toBe('place');
    expect(draft.placement.row).toMatchObject({ count: 4, seed: true });
    expect(draft.feature.row).toBeUndefined();
    expect(draft.feature).toMatchObject({ type: 'hole', position: [100, 100, 18], direction: [0, 0, -1] });
    expect(pickOf(draft.placement)).toBe('path');
    const view = placementView(draft, w.ctx);
    expect(view.pick).toBe('path');
    expect(view.hint).toContain('click where the last hole goes');
    expect(view.hint).toContain('change the count (4)');
    expect(view.path.points).toEqual([[100, 100, 18]]);
    expect(view.row).toMatchObject({ seed: true, count: 4, diameter: 6 });
    expect(placementSummary(draft, w.ctx)).toBe(
      'First hole on Board · top face at (100, 100) · click where the last hole goes',
    );
    // Round tubes take a single Hole.
    expect(() => placeClick(rowDraft(w), { ...face(w, [100, 100, 18], [0, 0, 1]), planar: false }, w.ctx)).toThrow(
      ROW_CURVED,
    );
  });

  it('the second click 150 mm along +X at count 4: pitch 50, direction +X in part coordinates, Shape', () => {
    const w = world();
    const draft = placeClick(seeded(w), end(w, [250.3, 100, 18]), w.ctx);
    expect(draft.placement.stage).toBe('shape');
    expect(draft.feature.row).toEqual({ count: 4, pitch: 50, direction: [1, 0, 0] });
    expect(draft.feature.placement).toBeUndefined();
    const view = placementView(draft, w.ctx);
    expect(view.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius', 'row-end']);
    const rowEnd = view.handles[3];
    expect(rowEnd).toMatchObject({ kind: 'square', typing: true, orthoFrom: [100, 100, 18] });
    close(rowEnd.at, [250, 100, 18]);
    expect(view.shape.loops).toHaveLength(4);
    expect(view.extras.map((e) => [e.kind, e.row])).toEqual([
      ['axis', true],
      ['outline', true],
    ]);
    expect(view.extras[1].segments).toHaveLength(4);
    expect(view.hint).toContain('Hole row: drag the end square');
    expect(placementSummary(draft, w.ctx)).toBe(
      'Row of 4 holes on Board · top face · from (100, 100) along +X · pitch 50 mm · 150 mm · Ø 6 mm · through all',
    );
    // A double click (the end on the seed) changes nothing; a mark keeps the exact length.
    const seed = seeded(w);
    expect(placeClick(seed, end(w, [100, 100, 18]), w.ctx)).toBe(seed);
    expect(placeClick(seed, end(w, [200, 100, 18], { snapKind: 'mark' }), w.ctx).feature.row.pitch).toBe(33.3333);
  });

  it('on a board turned 37° and one tilted 15°: the row is stored in part coordinates, every centre in the face', () => {
    for (const rotation of [
      [0, 0, 37],
      [15, 0, 0],
    ]) {
      const w = world({ rotation, position: [40, -30, 5] });
      const seed = seeded(w);
      // The rubber row while hovering: every circle centre lies in the face plane.
      const view = placementView(seed, w.ctx);
      const hover = rowHover(view, { ...end(w, [100, 250, 18]), kind: 'grid' });
      const normal = mapPlacement([0, 0, 1], w.placement, true);
      expect(hover.centres).toHaveLength(4);
      expect(offPlane(hover.centres, mapPlacement([100, 100, 18], w.placement), normal)).toBeLessThan(1e-6);
      for (const [local, direction] of [
        [
          [250, 100, 18],
          [1, 0, 0],
        ],
        [
          [100, 250, 18],
          [0, 1, 0],
        ],
      ]) {
        const draft = placeClick(seed, end(w, local), w.ctx);
        close(draft.feature.row.direction, direction, 9);
        expect(draft.feature.row.pitch).toBe(50);
        const resolved = resolveCutPlacement(draft.feature, w.model.parts[0].features, BOARD);
        const centres = resolveRow(draft.feature, resolved).centres;
        // Square to the unmapped face normal (the cut direction): in the face.
        expect(offPlane(centres, centres[0], resolved.direction)).toBeLessThan(1e-6);
        close(centres[3], local, 4);
      }
    }
  });

  it('↑ / ↓ in both stages, Enter takes the default row, Esc goes back, Re-place keeps the feature', () => {
    const w = world();
    const seed = seeded(w);
    const up = changeRowCount(seed, 1, w.ctx);
    expect(up.placement.row.count).toBe(5);
    expect(placementView(up, w.ctx).hint).toContain('change the count (5)');
    // Enter: the default row along the face's +X, defaultPitch(Ø 6) = 25.
    const defaulted = finishPlacement(up, w.ctx);
    expect(defaulted.placement.stage).toBe('shape');
    expect(defaulted.feature.row).toEqual({ count: 5, pitch: 25, direction: [1, 0, 0] });
    // Shape: the count grows at the end, the spacing is kept.
    const shaped = placeClick(seed, end(w, [250, 100, 18]), w.ctx);
    expect(changeRowCount(shaped, 1, w.ctx).feature.row).toEqual({ count: 5, pitch: 50, direction: [1, 0, 0] });
    // Esc in the direction stage: back to the first click, nothing placed.
    const back = stepBack(seed, w.ctx);
    expect(back.feature).toBeNull();
    expect(back.placement).toMatchObject({ stage: 'place', row: { count: 4, seed: false } });
    expect(pickOf(back.placement)).toBe('face');
    // Re-place: Place again with the row feature kept (its preview stays).
    const again = replacePlacement(shaped);
    expect(again.placement).toMatchObject({ stage: 'place', row: { count: 4, pitch: 50, seed: false } });
    expect(again.feature.row).toEqual({ count: 4, pitch: 50, direction: [1, 0, 0] });
    const reseeded = placeClick(again, face(w, [50, 50, 18], [0, 0, 1]), w.ctx);
    expect(reseeded.feature.row).toBeUndefined();
    expect(reseeded.feature.id).toBe(shaped.feature.id);
    // Esc after a Re-place seed restores the kept row.
    expect(stepBack(reseeded, w.ctx).feature).toBe(again.feature);
  });

  it('the end square: a point re-lays the row (count fixed), typed 40 + Enter is the spacing; live ghost and HUD', () => {
    const w = world();
    const shaped = placeClick(seeded(w), end(w, [250, 100, 18]), w.ctx);
    const view = placementView(shaped, w.ctx);
    const live = dragView(view, 'row-end', [100, 190.4, 18], { snapKind: 'grid', step: 1 });
    close(live.handles.find((h) => h.id === 'row-end').at, [100, 190, 18]);
    expect(live.shape.loops).toHaveLength(4);
    expect(dragReadout(view, 'row-end', [100, 190.4, 18], { step: 1 }).text).toBe('pitch 30 mm · 4 holes · 90 mm');
    const turned = applyPlacementDrag(
      shaped,
      { id: 'row-end', value: [100, 190.4, 18], snapKind: 'grid', step: 1 },
      w.ctx,
    );
    expect(turned.feature.row).toEqual({ count: 4, pitch: 30, direction: [0, 1, 0] });
    const typed = applyPlacementDrag(shaped, { id: 'row-end', value: { along: 40 } }, w.ctx);
    expect(typed.feature.row).toEqual({ count: 4, pitch: 40, direction: [1, 0, 0] });
    expect(dragReadout(view, 'row-end', { along: 40 }).text).toBe('pitch 40 mm · 4 holes · 120 mm');
    // The slide moves the whole row (row untouched); the grip resizes every hole.
    const slid = applyPlacementDrag(shaped, { id: 'slide', value: [120, 110, 18] }, w.ctx);
    expect(slid.feature.position).toEqual([120, 110, 18]);
    expect(slid.feature.row).toEqual(shaped.feature.row);
    expect(dragView(view, 'radius', { radius: 5 }).shape.loops).toHaveLength(4);
    close(dragView(view, 'slide', [110, 100, 18]).extras[0].a, [110, 100, 18]);
  });

  it('a locked first hole keeps the end square, not the slide; Apply and place another carries count and spacing', () => {
    const w = world();
    const shaped = placeClick(seeded(w), end(w, [250, 100, 18]), w.ctx);
    const locked = { ...shaped, feature: { ...shaped.feature, positionLocked: true } };
    expect(placementView(locked, w.ctx).handles.map((h) => h.id)).toEqual(['distance', 'radius', 'row-end']);
    const template = cutTemplate(shaped.feature);
    expect(template.row).toEqual({ count: 4, pitch: 50 });
    const next = rowDraft(w, { template });
    expect(next.placement.row).toEqual({ count: 4, pitch: 50, seed: false });
    const seed = placeClick(next, face(w, [100, 100, 18], [0, 0, 1]), w.ctx);
    expect(seed.feature.row).toBeUndefined();
    expect(finishPlacement(seed, w.ctx).feature.row).toEqual({ count: 4, pitch: 50, direction: [1, 0, 0] });
    // Editing a row made elsewhere (no placement frame): handles from the resolved cut.
    const edited = createOperationDraft({
      type: 'hole',
      model: w.model,
      partId: 'board',
      existingFeature: shaped.feature,
      placement: startPlacement({ type: 'hole', existingFeature: shaped.feature, hostInstanceId: 'b1' }),
    });
    expect(edited.placement.row).toEqual({ count: 4, pitch: 50, seed: false });
    expect(placementView(edited, w.ctx).handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius', 'row-end']);
  });

  it('hole-centre candidates: one per centre of a row, each with its index', () => {
    const row = { count: 3, pitch: 40, direction: [1, 0, 0] };
    const hole = {
      id: 'r',
      type: 'hole',
      diameter: 6,
      throughAll: true,
      position: [100, 100, 18],
      direction: [0, 0, -1],
    };
    const w = world({
      features: [{ ...hole, row }],
      metrics: {
        r: {
          cut: { position: [100, 100, 18], direction: [0, 0, -1], widthDirection: [1, 0, 0] },
          row: {
            ...row,
            centres: [
              [100, 100, 18],
              [140, 100, 18],
              [180, 100, 18],
            ],
          },
        },
      },
    });
    const list = holeCentres(w.ctx);
    expect(list.map((h) => [h.featureId, h.index])).toEqual([
      ['r', 0],
      ['r', 1],
      ['r', 2],
    ]);
    close(list[2].point, [180, 100, 18]);
  });
});

describe('Hole row: typed spacing and the edge margin', () => {
  const box = [
    [
      [0, 0],
      [600, 0],
    ],
    [
      [600, 0],
      [600, 400],
    ],
    [
      [600, 400],
      [0, 400],
    ],
    [
      [0, 400],
      [0, 0],
    ],
  ];
  const seed = (w) =>
    placeClick(placeDraft(w, 'hole', { row: true }), face(w, [100, 100, 18], [0, 0, 1], { outline: box }), w.ctx);
  it('digits + Enter in the direction stage: the spacing along the hovered direction, then Shape', () => {
    const w = world();
    const typed = placeClick(seed(w), { kind: 'path', along: 20, direction: [0, 1, 0] }, w.ctx);
    expect(typed.placement.stage).toBe('shape');
    expect(typed.feature.row).toEqual({ count: 4, pitch: 20, direction: [0, 1, 0] });
    // Nothing hovered: the face's +X.
    expect(placeClick(seed(w), { kind: 'path', along: 12.5 }, w.ctx).feature.row).toEqual({
      count: 4,
      pitch: 12.5,
      direction: [1, 0, 0],
    });
  });
  it('the HUD reads the distance from the last centre to the face edge, or past the edge', () => {
    const w = world();
    const view = placementView(seed(w), w.ctx);
    const inside = rowHover(view, { point: [250.2, 100, 18], kind: 'grid', step: 1 });
    expect(inside.text).toBe('4 holes · pitch 50 mm · 150 mm · axis · 350 mm to the edge');
    const past = rowHover(view, { point: [100, 520, 18], kind: 'grid', step: 1 });
    expect(past.text).toContain('· past the edge');
    // Shape: the end square's readout keeps it.
    const shaped = placeClick(seed(w), { kind: 'path', point: [250, 100, 18], snapKind: 'grid', step: 1 }, w.ctx);
    const shapeView = placementView(shaped, w.ctx);
    expect(dragReadout(shapeView, 'row-end', [580, 100, 18], { step: 1 }).text).toBe(
      'pitch 160 mm · 4 holes · 480 mm · 20 mm to the edge',
    );
  });
});
