// Phase M (docs/sketch-studio-hardware-holes.md): hardware in chosen holes.
// Place toggles holes (Shift+click a whole row), Enter seats ONE hardware part
// in every chosen hole (newInstance + extraInstances, one concentric
// connection each, holeIndex when > 0), Esc removes the last chosen hole,
// Re-place chooses again, Remove in Shape rebuilds, Axial offset writes every
// connection; the hint, rings and panel texts.
import { describe, expect, it } from 'vitest';
import { hardwareDefaults } from './hardware.js';
import { mapPlacement } from './placement.js';
import { operationModel } from './operations.js';
import { holeCentres } from './placementCuts.js';
import {
  HOLES_PENDING,
  NO_HOLES,
  chooseHole,
  chosenHoleRows,
  finishHardware,
  hardwareRings,
  hardwareStepBack,
  hardwareSummary,
  holeKey,
  holeLabel,
  pickRowHoles,
  removeChosenHole,
  setHardwareOffset,
  toggleHole,
  toggleRowHoles,
} from './placementHardware.js';
import {
  finishPlacement,
  ghostSegments,
  placeClick,
  placementSummary,
  placementView,
  replacePlacement,
  stepBack,
} from './placementTool.js';
import { face, placeDraft, world } from './placementCuts.fixtures.js';
import { removeInstance } from './model.js';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import { redo, undo } from '../store/sketchStudioActions';

const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};
const ROW = { count: 4, pitch: 50, direction: [1, 0, 0] };
const CENTRES = [0, 1, 2, 3].map((k) => [100 + 50 * k, 100, 18]);
// The board with a 4-hole row 'r' (Ø 6.6, pitch 50 along +X from (100, 100))
// and a single Ø 5 hole 'h' at (400, 300), as the kernel's metrics give them.
function rowWorld(options = {}) {
  const features = [
    {
      id: 'r',
      type: 'hole',
      diameter: 6.6,
      depth: 5,
      throughAll: true,
      position: [100, 100, 18],
      direction: [0, 0, -1],
      row: ROW,
    },
    { id: 'h', type: 'hole', diameter: 5, depth: 5, throughAll: true, position: [400, 300, 18], direction: [0, 0, -1] },
  ];
  const cut = (position) => ({ position, direction: [0, 0, -1], widthDirection: [1, 0, 0] });
  const metrics = {
    r: { cut: cut(CENTRES[0]), row: { ...ROW, centres: CENTRES } },
    h: { cut: cut([400, 300, 18]) },
  };
  return world({ features, metrics, ...options });
}
// A click on centre k of the row (or on the single hole) of an instance.
const rowHole = (w, k, extra = {}) =>
  face(w, CENTRES[k], [0, 0, 1], {
    snapKind: 'hole centre',
    holeFeatureId: 'r',
    holeAttachable: true,
    holeIndex: k,
    ...extra,
  });
const singleHole = (w, extra = {}) =>
  face(w, [400, 300, 18], [0, 0, 1], {
    snapKind: 'hole centre',
    holeFeatureId: 'h',
    holeAttachable: true,
    holeIndex: 0,
    ...extra,
  });
const bolt = () => hardwareDefaults('bolt', 'M6');
const hardwareDraft = (w) => placeDraft(w, 'hardware', { hardware: bolt() });
const pick = (w, draft, ...infos) => infos.reduce((d, info) => placeClick(d, info, w.ctx), draft);

describe('Place: choosing holes', () => {
  it('a hole-centre click toggles it, stays in Place, keeps the click order; the hint and view follow', () => {
    const w = rowWorld();
    const draft = hardwareDraft(w);
    expect(placementView(draft, w.ctx).hint).toBe(
      'Hardware: click the holes it goes in (click one again to remove it · Shift+click picks a whole row) · Enter seats it in the chosen holes · a flat face or empty ground seats a single one · Esc cancels',
    );
    const three = pick(w, draft, rowHole(w, 3), rowHole(w, 0), rowHole(w, 1));
    expect(three.placement.stage).toBe('place');
    expect(three.feature).toBeNull();
    expect(three.newPart).toBeNull();
    expect(operationModel(three)).toBe(w.model);
    expect(three.placement.holes.map((h) => h.index)).toEqual([3, 0, 1]);
    expect(three.placement.holes[0]).toMatchObject({
      instanceId: 'b1',
      partId: 'board',
      name: 'Board',
      featureId: 'r',
    });
    const view = placementView(three, w.ctx);
    expect(view.hint).toBe(
      'Hardware: 3 holes chosen · click more holes, or a chosen one to remove it · Enter seats it in them · Esc removes the last one',
    );
    expect(view.place.chosenCount).toBe(3);
    expect(view.place.chosen).toEqual({ 'b1/r/3': true, 'b1/r/0': true, 'b1/r/1': true });
    expect(view.handles).toEqual([]);
    // A chosen hole clicked again is removed; the others keep their order.
    const two = placeClick(three, rowHole(w, 0), w.ctx);
    expect(toggleHole(three, rowHole(w, 0), w.ctx).placement.holes).toEqual(two.placement.holes);
    expect(two.placement.holes.map((h) => h.index)).toEqual([3, 1]);
    expect(placementView(two, w.ctx).hint).toContain('2 holes chosen');
    expect(placementSummary(two, w.ctx)).toBe('Hex bolt M6 · 2 holes chosen on Board · Enter seats it');
    expect(placementSummary(pick(w, draft, rowHole(w, 2)), w.ctx)).toBe(
      'Hex bolt M6 · 1 hole chosen on Board · Enter seats it',
    );
    // A pocket centre / a non-attachable hole is not a hole pick.
    expect(placementSummary(draft, w.ctx)).toBe('');
  });

  it('with holes chosen a plain face, the ground or a non-attachable centre throws; with none it seats as Phase J', () => {
    const w = rowWorld();
    const one = pick(w, hardwareDraft(w), rowHole(w, 1));
    expect(() => placeClick(one, face(w, [300, 200, 18], [0, 0, 1]), w.ctx)).toThrow(HOLES_PENDING);
    expect(() =>
      placeClick(one, { kind: 'ground', planar: true, point: [-100, 0, 0], normal: [0, 0, 1] }, w.ctx),
    ).toThrow(HOLES_PENDING);
    expect(() => placeClick(one, rowHole(w, 2, { holeAttachable: false }), w.ctx)).toThrow(
      'Click another hole centre to add it, or press Enter to seat the hardware in the chosen holes.',
    );
    // Alt never snaps, so an Alt-click over a centre is a plain face click.
    expect(() => placeClick(one, face(w, CENTRES[2], [0, 0, 1]), w.ctx)).toThrow(HOLES_PENDING);
    // None chosen: the single free seat (slide square, no connection).
    const free = placeClick(hardwareDraft(w), face(w, [300, 200, 18], [0, 0, 1]), w.ctx);
    expect(free.placement.stage).toBe('shape');
    expect(free.newInstance).toMatchObject({ position: [300, 200, 18], rotation: [0, 0, 0] });
    expect(free.connections).toEqual([]);
    expect(free.extraInstances).toEqual([]);
    expect(placementView(free, w.ctx).handles.map((h) => h.id)).toEqual(['slide']);
    expect(placementView(free, w.ctx).shape.kind).toBe('prism');
    const unattachable = placeClick(hardwareDraft(w), rowHole(w, 2, { holeAttachable: false }), w.ctx);
    expect(unattachable.placement.stage).toBe('shape');
    expect(unattachable.connections).toEqual([]);
  });

  it('a hole whose instance has no kernel placement asks for a rebuild at pick time', () => {
    const w = rowWorld();
    const snapshot = { ...w.snapshot, instances: [{ ...w.snapshot.instances[0], placement: null }] };
    expect(() => placeClick(hardwareDraft(w), rowHole(w, 1), { ...w.ctx, snapshot })).toThrow(
      'Rebuild the model before placing on this part.',
    );
  });

  it('Shift+click on a row centre toggles the whole row: all on when any is off, else all off', () => {
    const w = rowWorld();
    const one = pick(w, hardwareDraft(w), rowHole(w, 2));
    const all = placeClick(one, rowHole(w, 1, { shift: true }), w.ctx);
    expect(all.placement.holes.map((h) => h.index)).toEqual([2, 0, 1, 3]);
    // The clicked hole keeps its clicked point; the others come from the row.
    close(all.placement.holes[2].point, CENTRES[1]);
    close(all.placement.holes[3].point, CENTRES[3]);
    const none = placeClick(all, rowHole(w, 0, { shift: true }), w.ctx);
    expect(none.placement.holes).toEqual([]);
    expect(toggleRowHoles(none, rowHole(w, 3), w.ctx).placement.holes).toHaveLength(4);
    // Shift on a single hole is a plain click.
    const single = placeClick(hardwareDraft(w), singleHole(w, { shift: true }), w.ctx);
    expect(single.placement.holes.map(holeKey)).toEqual(['b1/h/0']);
    expect(placeClick(single, singleHole(w, { shift: true }), w.ctx).placement.holes).toEqual([]);
  });

  it('pickRowHoles (Attach to selected hole on a row) chooses every centre; no snapshot → nothing, no error', () => {
    const w = rowWorld();
    const draft = pickRowHoles(hardwareDraft(w), { instanceId: 'b1', featureId: 'r' }, w.ctx);
    expect(draft.placement.stage).toBe('place');
    expect(draft.placement.holes.map(holeKey)).toEqual(['b1/r/0', 'b1/r/1', 'b1/r/2', 'b1/r/3']);
    draft.placement.holes.forEach((h, k) => close(h.point, CENTRES[k]));
    expect(placementView(draft, w.ctx).place.chosenCount).toBe(4);
    const bare = { ...w.ctx, snapshot: { ...w.snapshot, parts: [], instances: [] } };
    const untouched = hardwareDraft(w);
    expect(pickRowHoles(untouched, { instanceId: 'b1', featureId: 'r' }, bare)).toBe(untouched);
  });

  it('Esc removes the last chosen hole, and cancels at zero (hardwareStepBack / stepBack)', () => {
    const w = rowWorld();
    const two = pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 2));
    const back = stepBack(two, w.ctx);
    expect(back.placement.holes.map((h) => h.index)).toEqual([0]);
    const empty = hardwareStepBack(back);
    expect(empty.placement.holes).toEqual([]);
    expect(empty.placement.stage).toBe('place');
    expect(hardwareStepBack(empty)).toBeNull();
    expect(stepBack(empty, w.ctx)).toBeNull();
    // In Shape, Esc cancels.
    expect(stepBack(finishPlacement(two, w.ctx), w.ctx)).toBeNull();
  });

  it('a double-click chooses the hole when the click pair left it off, never removes it, then finishes', () => {
    const w = rowWorld();
    const draft = hardwareDraft(w);
    expect(chooseHole(draft, rowHole(w, 1), w.ctx).placement.holes).toHaveLength(1);
    const chosen = pick(w, draft, rowHole(w, 1));
    expect(chooseHole(chosen, rowHole(w, 1), w.ctx)).toBe(chosen);
    // click (on), click (off), dblclick: seated in that hole.
    const pair = pick(w, draft, rowHole(w, 1), rowHole(w, 1));
    const seated = finishPlacement(pair, w.ctx, rowHole(w, 1));
    expect(seated.placement.stage).toBe('shape');
    expect(seated.connections).toHaveLength(1);
    expect(seated.connections[0].holeIndex).toBe(1);
    // A plain face under the double-click adds nothing.
    expect(chooseHole(chosen, face(w, [300, 200, 18], [0, 0, 1]), w.ctx)).toBe(chosen);
  });
});

describe('finish: one part, N instances, N connections', () => {
  it('3 holes of a 4-row (1, 2, 4) → one part, newInstance + 2 extraInstances, 3 connections', () => {
    const w = rowWorld();
    const picked = pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 1), rowHole(w, 3));
    expect(() => finishHardware(hardwareDraft(w), w.ctx)).toThrow(NO_HOLES);
    expect(() => finishPlacement(hardwareDraft(w), w.ctx)).toThrow('Click the holes the hardware goes in first.');
    const seated = finishPlacement(picked, w.ctx);
    expect(seated.newPart).toMatchObject({ name: 'Hex bolt M6', features: [] });
    expect(seated.feature).toMatchObject({ type: 'hardware', kind: 'bolt', size: 'M6' });
    const instances = [seated.newInstance, ...seated.extraInstances];
    expect(seated.extraInstances).toHaveLength(2);
    instances.forEach((instance, i) => {
      expect(instance.partId).toBe(seated.newPart.id);
      expect(instance.visible).toBe(true);
      close(instance.position, CENTRES[[0, 1, 3][i]]);
      expect(instance.rotation).toEqual([0, 0, 0]);
    });
    expect(new Set(instances.map((i) => i.id)).size).toBe(3);
    expect(seated.connections.map((c) => c.from)).toEqual(instances.map((i) => i.id));
    seated.connections.forEach((c) =>
      expect(c).toMatchObject({
        type: 'concentric',
        to: 'b1',
        toFeatureId: 'r',
        fromFeatureId: seated.feature.id,
        offset: 0,
      }),
    );
    expect(seated.connections.map((c) => c.holeIndex)).toEqual([undefined, 1, 3]);
    expect('holeIndex' in seated.connections[0]).toBe(false);
    expect(seated.placement).toMatchObject({
      stage: 'shape',
      snapKind: 'hole centre',
      label: 'top face',
      hostInstanceId: seated.newInstance.id,
      seat: { instanceId: 'b1', partId: 'board', name: 'Board' },
    });
    const model = operationModel(seated);
    expect(model.parts).toHaveLength(w.model.parts.length + 1);
    expect(model.parts.at(-1).features).toEqual([seated.feature]);
    expect(model.instances.slice(w.model.instances.length)).toEqual(instances);
    expect(model.connections).toEqual(seated.connections);
    // The view: no handles, rings at the three centres, the seated hint.
    const view = placementView(seated, w.ctx);
    expect(view.handles).toEqual([]);
    expect(view.shape.kind).toBe('rings');
    expect(view.shape.circles).toHaveLength(3);
    expect(view.hint).toBe(
      'Hardware: seated in 3 holes (concentric) · Re-place chooses the holes again · Enter applies · Esc cancels',
    );
    expect(placementSummary(seated, w.ctx)).toBe('Hex bolt M6 in 3 holes on Board · holes 1, 2 and 4 of the row');
  });

  it('one hole equals the Phase J single-click result and texts', () => {
    const w = rowWorld();
    const seated = finishPlacement(pick(w, hardwareDraft(w), singleHole(w)), w.ctx);
    expect(seated.extraInstances).toEqual([]);
    expect(seated.newInstance).toMatchObject({ position: [400, 300, 18], rotation: [0, 0, 0], visible: true });
    expect(Object.keys(seated.connections[0])).toEqual([
      'id',
      'type',
      'from',
      'to',
      'fromFeatureId',
      'toFeatureId',
      'offset',
    ]);
    expect(seated.connections[0]).toMatchObject({
      type: 'concentric',
      from: seated.newInstance.id,
      to: 'b1',
      fromFeatureId: seated.feature.id,
      toFeatureId: 'h',
      offset: 0,
    });
    expect(placementView(seated, w.ctx).hint).toBe(
      'Hardware: seated in the hole you clicked (concentric) · Re-place seats it elsewhere · Enter applies · Esc cancels',
    );
    expect(placementSummary(seated, w.ctx)).toBe(
      'Hex bolt M6 on Board · top face at (400, 300) · concentric with the hole',
    );
  });

  it('holes on two instances of one part: each connection targets its own instance; the line says 2 × Board', () => {
    const w = rowWorld({ more: [{ id: 'b2', position: [0, 1000, 0] }] });
    const picked = pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 2, { instanceId: 'b2' }));
    expect(placementSummary(picked, w.ctx)).toBe('Hex bolt M6 · 2 holes chosen on 2 × Board · Enter seats it');
    const seated = finishPlacement(picked, w.ctx);
    expect(seated.connections.map((c) => [c.to, c.holeIndex])).toEqual([
      ['b1', undefined],
      ['b2', 2],
    ]);
    close(seated.extraInstances[0].position, [200, 1100, 18]);
    expect(placementSummary(seated, w.ctx)).toBe('Hex bolt M6 in 2 holes on 2 × Board');
    // Two differently named instances: "on Board and Bracket".
    const named = rowWorld({ more: [{ id: 'b2', name: 'Bracket', position: [0, 1000, 0] }] });
    const both = pick(named, hardwareDraft(named), rowHole(named, 0), rowHole(named, 1, { instanceId: 'b2' }));
    expect(placementSummary(finishPlacement(both, named.ctx), named.ctx)).toBe(
      'Hex bolt M6 in 2 holes on Board and Bracket',
    );
  });

  it('Re-place drops the old result at once and chooses again; sizes and the first instance id are kept', () => {
    const w = rowWorld();
    const seated = finishPlacement(pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 1)), w.ctx);
    const sized = { ...seated, feature: { ...seated.feature, length: 30 } };
    const again = replacePlacement(sized);
    expect(again.placement).toMatchObject({ stage: 'place', holes: [], problem: '' });
    expect(again.feature).toBeNull();
    expect(again.connections).toEqual([]);
    expect(again.extraInstances).toEqual([]);
    expect(operationModel(again)).toBe(w.model);
    expect(again.placement.hardware.length).toBe(30);
    expect(again.newInstance.id).toBe(seated.newInstance.id);
    // The first new pick never previews stale bolts: one hole, one instance.
    const reseated = finishPlacement(pick(w, again, rowHole(w, 3)), w.ctx);
    expect(reseated.newInstance.id).toBe(seated.newInstance.id);
    expect(reseated.extraInstances).toEqual([]);
    expect(reseated.connections).toHaveLength(1);
    expect(reseated.feature.length).toBe(30);
    expect(operationModel(reseated).instances).toHaveLength(w.model.instances.length + 1);
  });

  it('Remove in Shape rebuilds with N − 1 (instances keep their ids); the last removal goes back to Place', () => {
    const w = rowWorld();
    const seated = finishPlacement(pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 1), rowHole(w, 3)), w.ctx);
    const fewer = removeChosenHole(seated, 'b1/r/1', w.ctx);
    expect(fewer.placement.stage).toBe('shape');
    expect(fewer.placement.holes.map((h) => h.index)).toEqual([0, 3]);
    expect(fewer.newInstance.id).toBe(seated.newInstance.id);
    expect(fewer.extraInstances.map((i) => i.id)).toEqual([seated.extraInstances[1].id]);
    expect(fewer.connections.map((c) => c.holeIndex)).toEqual([undefined, 3]);
    const one = removeChosenHole(fewer, 'b1/r/0', w.ctx);
    expect(one.connections.map((c) => c.holeIndex)).toEqual([3]);
    close(one.newInstance.position, CENTRES[3]);
    const none = removeChosenHole(one, 'b1/r/3', w.ctx);
    expect(none.placement).toMatchObject({ stage: 'place', holes: [] });
    expect(none.feature).toBeNull();
    expect(none.connections).toEqual([]);
    // In Place, Remove is the toggle.
    const placing = pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 2));
    const removed = removeChosenHole(placing, 'b1/r/0', w.ctx);
    expect(removed.placement).toMatchObject({ stage: 'place' });
    expect(removed.placement.holes.map(holeKey)).toEqual(['b1/r/2']);
  });

  it('setHardwareOffset writes the same offset on every connection; a rebuild keeps it', () => {
    const w = rowWorld();
    const seated = finishPlacement(pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 1), rowHole(w, 2)), w.ctx);
    const offset = setHardwareOffset(seated, -2.5);
    expect(offset.connections.map((c) => c.offset)).toEqual([-2.5, -2.5, -2.5]);
    expect(removeChosenHole(offset, 'b1/r/2', w.ctx).connections.map((c) => c.offset)).toEqual([-2.5, -2.5]);
    const free = placeClick(hardwareDraft(w), face(w, [300, 200, 18], [0, 0, 1]), w.ctx);
    expect(setHardwareOffset(free, 3)).toBe(free);
  });
});

describe('rings, labels and the Chosen holes list', () => {
  it('rings: one circle per chosen hole in its face plane, on a 37°-turned board, in Place and seated', () => {
    const w = rowWorld({ rotation: [0, 0, 37], position: [50, -20, 0] });
    const centres = holeCentres(w.ctx).filter((h) => h.featureId === 'r');
    const picked = pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 2), rowHole(w, 3));
    const rings = hardwareRings(picked, w.ctx);
    expect(rings).toHaveLength(3);
    const normal = mapPlacement([0, 0, 1], w.placement, true);
    rings.forEach((ring, i) => {
      close(ring.frame.normal, normal);
      close(ring.frame.origin, centres[[0, 2, 3][i]].point);
      // Head across flats 13.8 → the ghost radius 6.9.
      expect(ring.radius).toBeCloseTo(6.9, 9);
    });
    const view = placementView(picked, w.ctx);
    expect(view.shape.kind).toBe('rings');
    // Circles only (never linked): every segment end lies on a ring.
    const segments = ghostSegments(view.shape);
    expect(segments).toHaveLength(3 * 32);
    for (const [a] of segments) {
      const d = Math.min(...rings.map((r) => Math.hypot(...a.map((v, k) => v - r.frame.origin[k]))));
      expect(d).toBeCloseTo(6.9, 6);
    }
    expect(placementView(finishPlacement(picked, w.ctx), w.ctx).shape.circles).toHaveLength(3);
    // Sizes changed while choosing: the rings re-radius.
    const bigger = { ...picked, placement: { ...picked.placement, hardware: { ...bolt(), headDiameter: 20 } } };
    expect(hardwareRings(bigger, w.ctx)[0].radius).toBe(10);
  });

  it('labels: "Hole 2 of 4 · Board", "Hole · Board · Ø 5"; existing hardware in the hole is named', () => {
    const w = rowWorld();
    const picked = pick(w, hardwareDraft(w), rowHole(w, 1), singleHole(w));
    expect(holeLabel(picked.placement.holes[0], w.ctx)).toBe('Hole 2 of 4 · Board');
    expect(holeLabel(picked.placement.holes[1], w.ctx)).toBe('Hole · Board · Ø 5');
    expect(chosenHoleRows(picked, w.ctx)).toEqual([
      { key: 'b1/r/1', label: 'Hole 2 of 4 · Board', removeLabel: 'Remove hole 2 of 4 on Board' },
      { key: 'b1/h/0', label: 'Hole · Board · Ø 5', removeLabel: 'Remove hole Ø 5 on Board' },
    ]);
    // A hex nut already seated in hole 2 of the row (washers and nuts stack).
    const nutModel = {
      ...w.model,
      parts: [...w.model.parts, { id: 'nut', name: 'Hex nut M6', features: [] }],
      instances: [...w.model.instances, { id: 'n1', partId: 'nut', position: [0, 0, 0], rotation: [0, 0, 0] }],
      connections: [{ id: 'c', type: 'concentric', from: 'n1', to: 'b1', toFeatureId: 'r', holeIndex: 1, offset: 0 }],
    };
    const ctx = { ...w.ctx, model: nutModel };
    expect(chosenHoleRows(picked, ctx)[0].label).toBe('Hole 2 of 4 · Board · has Hex nut M6');
    expect(chosenHoleRows(picked, ctx)[1].label).toBe('Hole · Board · Ø 5');
    expect(hardwareSummary(hardwareDraft(w), w.ctx)).toBe('');
  });
});

describe('after Apply: history, Delete and the BOM', () => {
  it('one SET_CAD_MODEL commit; one Undo removes the part, every instance and connection; Redo restores them', () => {
    const w = rowWorld();
    const seated = finishPlacement(pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 1), rowHole(w, 3)), w.ctx);
    const applied = operationModel(seated);
    let state = {
      ...sketchStudioInitialState,
      document: { ...sketchStudioInitialState.document, model: w.model },
      history: { past: [], future: [] },
    };
    state = sketchStudioReducer(state, { type: 'SET_CAD_MODEL', payload: applied });
    expect(state.history.past).toHaveLength(1);
    expect(state.document.model.instances).toHaveLength(w.model.instances.length + 3);
    state = sketchStudioReducer(state, undo());
    expect(state.document.model.parts).toHaveLength(w.model.parts.length);
    expect(state.document.model.instances).toHaveLength(w.model.instances.length);
    expect(state.document.model.connections).toHaveLength(0);
    state = sketchStudioReducer(state, redo());
    expect(state.document.model.instances.slice(-3).map((i) => i.partId)).toEqual(Array(3).fill(seated.newPart.id));
    expect(state.document.model.connections).toHaveLength(3);
  });

  it('each bolt is an ordinary instance: Delete drops it with its own connection only', () => {
    const w = rowWorld();
    const seated = finishPlacement(pick(w, hardwareDraft(w), rowHole(w, 0), rowHole(w, 1)), w.ctx);
    const applied = operationModel(seated);
    const after = removeInstance(applied, seated.extraInstances[0].id);
    expect(after.instances).toHaveLength(w.model.instances.length + 1);
    expect(after.connections.map((c) => c.from)).toEqual([seated.newInstance.id]);
  });
});
