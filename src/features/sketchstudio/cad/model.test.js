import { expect, it } from 'vitest';
import {
  CAD_VERSION,
  createPart,
  emptyModel,
  normalizeModel,
  removeInstance,
  removeEmptyParts,
  removePart,
  validateReferences,
} from './model.js';

const mark = (id, from = 'a', to = 'b') => ({
  id,
  from: { instanceId: from, local: [0, 0, 18] },
  to: { instanceId: to, local: [600, 0, 18] },
  along: 'aligned',
  offset: [0, -28.8, 1.3],
});

it('gives new and old saves an empty marks list without a version bump', () => {
  expect(CAD_VERSION).toBe(1);
  expect(emptyModel().marks).toEqual([]);
  const old = emptyModel();
  delete old.marks;
  expect(normalizeModel(old).marks).toEqual([]);
  // Kept through a save: the model spread carries them.
  const saved = { ...emptyModel(), marks: [mark('m1')] };
  expect(normalizeModel(JSON.parse(JSON.stringify(saved))).marks).toEqual([mark('m1')]);
});

it('validates marks and their ids', () => {
  const withMarks = (...marks) => normalizeModel({ ...emptyModel(), marks });
  expect(() => withMarks(mark('m1'), mark('m1'))).toThrow('Missing or duplicate marks ID: m1');
  expect(() => normalizeModel({ ...emptyModel(), marks: {} })).toThrow('Model marks must be a list.');
  const broken = [
    { ...mark('x'), from: null },
    { ...mark('x'), to: { instanceId: 'b', local: [0, 0] } },
    { ...mark('x'), to: { instanceId: 'b', local: [0, 'a', 0] } },
    { ...mark('x'), to: { instanceId: 'b', local: [0, Infinity, 0] } },
    { ...mark('x'), from: { instanceId: 3, local: [0, 0, 0] } },
    { ...mark('x'), from: { local: [0, 0, 0] } },
    { ...mark('x'), along: 'W' },
    { ...mark('x'), along: undefined },
    { ...mark('x'), offset: [0, 0] },
    { ...mark('x'), offset: [0, NaN, 0] },
  ];
  for (const bad of broken) expect(() => withMarks(bad)).toThrow('Invalid mark: x');
  // World-fixed ends, every reading, and parts that no longer exist are fine.
  const world = { ...mark('w'), from: { instanceId: null, local: [1, 2, 3] } };
  const axes = ['X', 'Y', 'Z'].map((along, i) => ({ ...mark(`axis${i}`), along }));
  expect(withMarks(world, ...axes, mark('gone', 'missing', 'missing')).marks).toHaveLength(5);
});

it('removes the marks on a removed instance only', () => {
  const a = createPart(),
    b = createPart();
  const model = normalizeModel({
    ...emptyModel(),
    parts: [a.part, b.part],
    instances: [
      { ...a.instance, id: 'a' },
      { ...b.instance, id: 'b' },
      { ...b.instance, id: 'c' },
    ],
    marks: [mark('ab', 'a', 'b'), mark('bc', 'b', 'c'), mark('ca', 'c', 'a'), mark('cc', 'c', 'c')],
  });
  expect(removeInstance(model, 'a').marks.map((m) => m.id)).toEqual(['bc', 'cc']);
  expect(removeInstance(model, 'c').marks.map((m) => m.id)).toEqual(['ab']);
  // Older in-memory models without marks still work.
  const { marks, ...old } = model;
  expect(marks).toHaveLength(4);
  expect(removeInstance(old, 'a').marks).toEqual([]);
});

// Phase M.1 (docs/sketch-studio-remove-part.md §4): a board (box + hole row)
// with three bolts of one hardware part, each concentric to the board.
function boltsOnBoard() {
  const assembly = emptyModel().sheets[0];
  return normalizeModel({
    ...emptyModel(),
    parts: [
      {
        id: 'board',
        name: 'Board / plate',
        features: [
          { id: 'box', type: 'box', width: 600, depth: 400, height: 18 },
          {
            id: 'row',
            type: 'hole',
            diameter: 6.6,
            depth: 5,
            throughAll: true,
            position: [100, 100, 18],
            direction: [0, 0, -1],
            row: { count: 3, pitch: 50, direction: [1, 0, 0] },
          },
        ],
      },
      { id: 'bolt', name: 'Hex bolt M6', features: [{ id: 'hw', type: 'hardware', kind: 'bolt', size: 'M6' }] },
    ],
    instances: [
      { id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] },
      ...[1, 2, 3].map((k) => ({ id: `bolt${k}`, partId: 'bolt', name: '', position: [0, 0, 0], rotation: [0, 0, 0] })),
    ],
    connections: [1, 2, 3].map((k) => ({
      id: `c${k}`,
      type: 'concentric',
      from: `bolt${k}`,
      to: 'b1',
      fromFeatureId: 'hw',
      toFeatureId: 'row',
      ...(k > 1 ? { holeIndex: k - 1 } : {}),
    })),
    marks: [mark('on-bolt2', 'bolt2', 'b1'), mark('board-only', 'b1', 'b1')],
    sheets: [
      { ...assembly, instanceIds: ['bolt1', 'b1'] },
      {
        ...assembly,
        id: 'board-sheet',
        title: 'Board',
        partId: 'board',
        annotations: [
          { id: 'board-callout', type: 'hole-callout', view: 'top', partId: 'board', featureIds: ['row'] },
          { id: 'bolt-callout', type: 'hole-callout', view: 'top', partId: 'bolt', featureIds: ['hw'] },
        ],
      },
      { ...assembly, id: 'bolt-sheet', title: 'Bolt', partId: 'bolt' },
    ],
  });
}

it('removes a part with every instance, connection, mark and sheet item that names it', () => {
  const model = boltsOnBoard();
  const next = removePart(model, 'bolt');
  expect(next.parts.map((p) => p.id)).toEqual(['board']);
  expect(next.parts[0]).toBe(model.parts[0]);
  expect(next.instances.map((i) => i.id)).toEqual(['b1']);
  expect(next.connections).toEqual([]);
  expect(next.marks.map((m) => m.id)).toEqual(['board-only']);
  expect(next.sheets.map((s) => s.id)).toEqual(['assembly-sheet', 'board-sheet']);
  expect(next.sheets[0].instanceIds).toEqual(['b1']);
  expect(next.sheets[1].annotations.map((a) => a.id)).toEqual(['board-callout']);
  // Everything else is untouched, and the result is a valid model.
  expect(next.parameters).toBe(model.parameters);
  expect(next.sketches).toBe(model.sketches);
  expect(next.fabrication).toBe(model.fabrication);
  expect(() => normalizeModel(next)).not.toThrow();
  expect(validateReferences(next)).toEqual([]);
  // Pure: the input is unchanged.
  expect(model.parts).toHaveLength(2);
  expect(model.instances).toHaveLength(4);
  expect(model.sheets).toHaveLength(3);
  // The board can go the same way.
  expect(removePart(next, 'board').instances).toEqual([]);
});

it('refuses to remove a part another part uses as a Boolean tool, and leaves the model unchanged', () => {
  const base = boltsOnBoard();
  for (const suppressed of [false, true]) {
    const model = {
      ...base,
      parts: base.parts.map((p) =>
        p.id === 'board'
          ? { ...p, features: [...p.features, { id: 'cut', type: 'subtract', toolPartId: 'bolt', suppressed }] }
          : p,
      ),
    };
    const before = JSON.stringify(model);
    expect(() => removePart(model, 'bolt')).toThrow(
      '"Hex bolt M6" is the Boolean tool of "Board / plate" (subtract); remove that feature first.',
    );
    expect(JSON.stringify(model)).toBe(before);
  }
  expect(() => removePart(base, 'missing')).toThrow('Unknown part: missing');
});

it('removeEmptyParts drops a saved part that has no enabled feature, exactly like removePart', () => {
  const base = boltsOnBoard();
  for (const features of [[], [{ id: 'hw', type: 'hardware', suppressed: true }]]) {
    const model = { ...base, parts: base.parts.map((p) => (p.id === 'bolt' ? { ...p, features } : p)) };
    const next = removeEmptyParts(model);
    expect(next).toEqual(removePart(model, 'bolt'));
    expect(next.parts.map((p) => p.id)).toEqual(['board']);
    expect(next.instances.map((i) => i.id)).toEqual(['b1']);
    expect(next.marks.map((m) => m.id)).toEqual(['board-only']);
    expect(next.sketches).toBe(model.sketches);
    expect(validateReferences(next)).toEqual([]);
    expect(model.parts).toHaveLength(2);
  }
});

it('removeEmptyParts returns the model itself when every part has an enabled feature', () => {
  const model = boltsOnBoard();
  expect(removeEmptyParts(model)).toBe(model);
});

it('removeEmptyParts keeps an empty part that another part still uses as a Boolean tool', () => {
  const base = boltsOnBoard();
  const model = {
    ...base,
    parts: base.parts.map((p) =>
      p.id === 'bolt'
        ? { ...p, features: [] }
        : { ...p, features: [...p.features, { id: 'cut', type: 'subtract', toolPartId: 'bolt' }] },
    ),
  };
  expect(removeEmptyParts(model)).toBe(model);
});
