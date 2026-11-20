import { expect, it } from 'vitest';
import {
  CAD_VERSION,
  createPart,
  duplicateSheet,
  emptyModel,
  findSheetFor,
  normalizeModel,
  removeBlanklessParts,
  removeInstance,
  removeInstances,
  removeEmptyParts,
  removePart,
  removeSheets,
  resolveSection,
  validateReferences,
} from './model.js';
import { sheetSubject } from './groups.js';
import { normalizeSketchDocument } from '../utils/sketchDocumentUtils.js';

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

// RC-1 (docs/sketch-studio-cut-pick.md §3): a bent tray cut from its outline,
// two blanks of it, a board grouped with the first blank, the tray's flat
// pattern sheet.
function trayOnBoard() {
  const assembly = emptyModel().sheets[0];
  const tray = {
    id: 'tray',
    name: 'Tray',
    features: [
      {
        id: 'sm',
        type: 'sheetmetal',
        sketchId: 'blank',
        thickness: 1.5,
        stock: 'spcc',
        bends: [{ id: 'b1', edge: 'front', distance: 20, angle: 90, direction: 'up' }],
      },
    ],
  };
  return normalizeModel({
    ...emptyModel(),
    sketches: [
      { id: 'blank', name: 'Tray outline', plane: 'XY', profile: { type: 'rectangle', width: 200, height: 100 } },
    ],
    parts: [
      tray,
      { id: 'board', name: 'Board / plate', features: [{ id: 'box', type: 'box', width: 6, depth: 4, height: 1 }] },
    ],
    instances: [
      { id: 't1', partId: 'tray', name: '', groupId: 'g', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 't2', partId: 'tray', name: '', position: [300, 0, 0], rotation: [0, 0, 0] },
      { id: 'w', partId: 'board', name: '', groupId: 'g', position: [0, 0, 0], rotation: [0, 0, 0] },
    ],
    groups: [{ id: 'g', name: 'Kiosk', parentId: null }],
    sheets: [assembly, { ...assembly, id: 'tray-flat', title: 'Tray', partId: 'tray', views: ['flat'] }],
  });
}

it('removeInstances takes a sheet-metal part with its last blank, and only then', () => {
  const model = trayOnBoard();
  // One of two blanks: the part stays.
  const one = removeInstances(model, ['t2']);
  expect(one.parts.map((p) => p.id)).toEqual(['tray', 'board']);
  expect(one.instances.map((i) => i.id)).toEqual(['t1', 'w']);
  // The last blank: the part and its flat sheet go, the group of one is dissolved, the sketch stays.
  const none = removeInstances(one, ['t1']);
  expect(none.parts.map((p) => p.id)).toEqual(['board']);
  expect(none.instances.map((i) => [i.id, i.groupId ?? null])).toEqual([['w', null]]);
  expect(none.groups).toEqual([]);
  expect(none.sheets.map((s) => s.id)).toEqual(['assembly-sheet']);
  expect(none.sketches).toBe(model.sketches);
  expect(validateReferences(none)).toEqual([]);
  // Both at once: the same result in one call (one commit, one Undo).
  expect(removeInstances(model, ['t1', 't2'])).toEqual(none);
  // Pure: the input is unchanged.
  expect(model.parts).toHaveLength(2);
  expect(model.instances).toHaveLength(3);
});

it('removeInstances keeps every other part, and a sheet-metal part another part uses as a Boolean tool', () => {
  const base = trayOnBoard();
  // A board with no instance keeps its definition, as removeInstance always did.
  expect(removeInstances(base, ['w']).parts.map((p) => p.id)).toEqual(['tray', 'board']);
  const tool = {
    ...base,
    parts: base.parts.map((p) =>
      p.id === 'board' ? { ...p, features: [...p.features, { id: 'cut', type: 'subtract', toolPartId: 'tray' }] } : p,
    ),
  };
  const next = removeInstances(tool, ['t1', 't2']);
  expect(next.parts.map((p) => p.id)).toEqual(['tray', 'board']);
  expect(next.instances.map((i) => i.id)).toEqual(['w']);
  // Hardware is not this rule's (the Remove instance button keeps its own, remove-part §3.3).
  const bolts = boltsOnBoard();
  expect(removeInstances(bolts, ['bolt1', 'bolt2', 'bolt3']).parts.map((p) => p.id)).toEqual(['board', 'bolt']);
});

it('removeBlanklessParts drops a saved sheet-metal part with no blank on load, and gives the outline back', () => {
  const base = trayOnBoard();
  // A file saved with the bug: the tray's instances gone, its definition and flat sheet left.
  const saved = { ...removeInstance(removeInstance(base, 't1'), 't2') };
  expect(saved.parts.map((p) => p.id)).toEqual(['tray', 'board']);
  const loaded = removeBlanklessParts(saved);
  expect(loaded).toEqual(removePart(saved, 'tray'));
  expect(loaded.sketches).toBe(saved.sketches);
  // Through the document loader too.
  const document = normalizeSketchDocument({ id: 'doc', name: 'Tray', entities: [], model: saved });
  expect(document.model.parts.map((p) => p.id)).toEqual(['board']);
  expect(document.model.sketches.map((s) => s.id)).toEqual(['blank']);
  // Nothing to remove: the same object; a Boolean tool stays.
  expect(removeBlanklessParts(base)).toBe(base);
  const tool = {
    ...saved,
    parts: saved.parts.map((p) =>
      p.id === 'board' ? { ...p, features: [...p.features, { id: 'cut', type: 'subtract', toolPartId: 'tray' }] } : p,
    ),
  };
  expect(removeBlanklessParts(tool)).toBe(tool);
});

// Phase P (docs/sketch-studio-angle-bar.md §2.1, §2.3–2.5): the angle's
// optional root / toe radii, and the Angle bar part.
it('resolves angle radii only when the section has them, and validates them', () => {
  const sharp = { type: 'angle', width: 50, height: 40, wall: 5 };
  // Absent radii add no keys: an old angle serialises (cut-list key, CSV) as before.
  expect(JSON.stringify(resolveSection(sharp))).toBe('{"type":"angle","width":50,"height":40,"wall":5}');
  expect(resolveSection({ ...sharp, rootRadius: 0, toeRadius: 0 })).toEqual({ ...sharp, rootRadius: 0, toeRadius: 0 });
  expect(resolveSection({ ...sharp, rootRadius: '=r', toeRadius: 2.5 }, { r: 6 })).toEqual({
    ...sharp,
    rootRadius: 6,
    toeRadius: 2.5,
  });
  expect(() => resolveSection({ ...sharp, rootRadius: -1 })).toThrow('Root radius cannot be negative.');
  expect(() => resolveSection({ ...sharp, toeRadius: -0.5 })).toThrow('Toe radius cannot be negative.');
  expect(() => resolveSection({ ...sharp, toeRadius: 5 })).toThrow('Toe radius must be less than the thickness.');
  // Leg B (40) − thickness (5) = 35 is the shorter room for r1 + r2.
  expect(() => resolveSection({ ...sharp, rootRadius: 32, toeRadius: 3 })).toThrow(
    'Root and toe radii do not fit on the legs.',
  );
  expect(resolveSection({ ...sharp, rootRadius: 31, toeRadius: 3 }).rootRadius).toBe(31);
  expect(() => resolveSection({ ...sharp, rootRadius: 'nope' })).toThrow(/^Root radius:/);
  // The existing thickness rule still comes first.
  expect(() => resolveSection({ ...sharp, wall: 40, rootRadius: 1 })).toThrow('Wall thickness exceeds the section.');
  // Other sections never pick up angle keys.
  expect(resolveSection({ type: 'tube', width: 40, height: 40, wall: 2, rootRadius: 3 })).toEqual({
    type: 'tube',
    width: 40,
    height: 40,
    wall: 2,
  });
});

it("createPart('angle') is an L 50×50×5 hot-rolled angle bar member, 700 long, in steel", () => {
  const { part, instance } = createPart('angle');
  expect(part).toMatchObject({ name: 'Angle bar', material: 'Steel', grain: null });
  expect(part.features).toHaveLength(1);
  expect(part.features[0]).toMatchObject({
    type: 'member',
    start: [0, 0, 0],
    end: [0, 0, 700],
    section: { type: 'angle', width: 50, height: 50, wall: 5, rootRadius: 7, toeRadius: 3.5 },
    gapStart: 0,
    gapEnd: 0,
    angleStart: 0,
    angleEnd: 0,
  });
  expect(instance).toMatchObject({ partId: part.id, position: [0, 0, 0], rotation: [0, 0, 0] });
  // The tube and the board are unchanged.
  const tube = createPart('member').part;
  expect(tube).toMatchObject({ name: 'Square tube', material: 'Steel', grain: null });
  expect(tube.features[0].section).toEqual({ type: 'tube', width: 40, height: 40, wall: 2 });
  expect(createPart().part).toMatchObject({ name: 'Board / plate', material: 'Plywood', grain: 'X' });
});

// Part groups (docs/sketch-studio-part-groups.md §3.1).
it('gives new and old saves an empty groups list without a version bump', () => {
  expect(emptyModel().groups).toEqual([]);
  const old = emptyModel();
  delete old.groups;
  expect(normalizeModel(old).groups).toEqual([]);
  const saved = {
    ...emptyModel(),
    groups: [{ id: 'g', name: 'Frame', parentId: null }],
    instances: [
      { id: 'a', partId: 'p', groupId: 'g' },
      { id: 'b', partId: 'p', groupId: 'g' },
    ],
  };
  expect(normalizeModel(JSON.parse(JSON.stringify(saved))).groups).toEqual(saved.groups);
});

it('validates groups: ids, names, parents, cycles and instance group references', () => {
  const withGroups = (groups, instances = []) => normalizeModel({ ...emptyModel(), groups, instances });
  const group = (id, parentId = null) => ({ id, name: id, parentId });
  expect(() => withGroups({})).toThrow('Model groups must be a list.');
  expect(() => withGroups([group('g'), group('g')])).toThrow('Missing or duplicate groups ID: g');
  expect(() => withGroups([{ id: 'g', parentId: null }])).toThrow('Invalid group: g');
  expect(() => withGroups([group('g', 'nope')])).toThrow('Group g names an unknown parent group: nope');
  expect(() => withGroups([group('a', 'b'), group('b', 'a')])).toThrow('Circular group nesting: a');
  expect(() => withGroups([group('g')], [{ id: 'i', partId: 'p', groupId: 'other' }])).toThrow(
    'Instance i names an unknown group: other',
  );
  expect(withGroups([group('a'), group('b', 'a')], [{ id: 'i', partId: 'p', groupId: 'b' }]).groups).toHaveLength(2);
});

it('removeInstance dissolves a two-member group it leaves with one part, and is unchanged without groups', () => {
  const model = normalizeModel({
    ...emptyModel(),
    groups: [{ id: 'g', name: 'Pair', parentId: null }],
    instances: [
      { id: 'a', partId: 'p', groupId: 'g' },
      { id: 'b', partId: 'p', groupId: 'g' },
      { id: 'c', partId: 'p' },
    ],
  });
  const next = removeInstance(model, 'a');
  expect(next.groups).toEqual([]);
  expect(next.instances).toEqual([
    { id: 'b', partId: 'p' },
    { id: 'c', partId: 'p' },
  ]);
  // A third member keeps the group.
  expect(removeInstance(removeInstance(model, 'c'), 'zzz').groups).toHaveLength(1);
  // Without groups the result is exactly the old one (no groups key added).
  const plain = { instances: [{ id: 'a' }], connections: [], marks: [], sheets: [] };
  expect(removeInstance(plain, 'a')).toEqual({ instances: [], connections: [], marks: [], sheets: [] });
});

// Drawing sheets (Phase S, docs/sketch-studio-sheet-manager.md §3).
const sheet = (id, extra = {}) => ({ id, title: id, views: ['front'], annotations: [], ...extra });
const sheetModel = (...sheets) =>
  normalizeModel({
    ...emptyModel(),
    parts: [{ id: 'p', name: 'Profile part 1', features: [{ id: 'f', type: 'box', width: 1, depth: 1, height: 1 }] }],
    groups: [{ id: 'g', name: 'Frame', parentId: null }],
    instances: [
      { id: 'a', partId: 'p', groupId: 'g' },
      { id: 'b', partId: 'p', groupId: 'g' },
      { id: 'c', partId: 'p' },
    ],
    sheets,
  });

it('removeSheets removes the sheets and refuses to remove the last one', () => {
  const model = sheetModel(sheet('s1'), sheet('s2'), sheet('s3'));
  expect(removeSheets(model, ['s1', 's3']).sheets.map((s) => s.id)).toEqual(['s2']);
  // Unknown ids are ignored; the model itself is untouched.
  expect(removeSheets(model, ['zzz']).sheets).toHaveLength(3);
  expect(model.sheets).toHaveLength(3);
  expect(() => removeSheets(model, ['s1', 's2', 's3'])).toThrow('Keep at least one drawing sheet.');
});

it('duplicateSheet copies right after the original with new sheet and annotation ids', () => {
  const model = sheetModel(sheet('s1', { annotations: [{ id: 'n1', type: 'part-number', partId: 'p' }] }), sheet('s2'));
  const next = duplicateSheet(model, 's1');
  expect(next.sheets.map((s) => s.id)[0]).toBe('s1');
  expect(next.sheets.at(-1).id).toBe('s2');
  const copy = next.sheets[1];
  expect(copy.id).not.toBe('s1');
  expect(copy.title).toBe('s1 (copy)');
  expect(copy.annotations).toHaveLength(1);
  expect(copy.annotations[0]).toMatchObject({ type: 'part-number', partId: 'p' });
  expect(copy.annotations[0].id).not.toBe('n1');
  // A deep copy: the original is not shared.
  expect(copy.views).not.toBe(model.sheets[0].views);
  expect(normalizeModel(next).sheets).toHaveLength(3);
  // Cut to the 65-character title block.
  const long = duplicateSheet(sheetModel(sheet('s1', { title: 'x'.repeat(64) })), 's1');
  expect(long.sheets[1].title).toHaveLength(65);
  expect(() => duplicateSheet(model, 'zzz')).toThrow('Unknown drawing sheet: zzz');
});

it('sheetSubject labels a part, a group, chosen parts and the whole assembly, with section and exploded suffixes', () => {
  const model = sheetModel(sheet('s1'));
  const label = (extra) => sheetSubject(sheet('x', extra), model).label;
  expect(sheetSubject(sheet('x', { partId: 'p' }), model)).toEqual({
    kind: 'part',
    partId: 'p',
    label: 'Part · Profile part 1',
  });
  expect(label({ instanceIds: ['b', 'a'] })).toBe('Group · Frame');
  expect(sheetSubject(sheet('x', { instanceIds: ['a', 'b', 'c'] }), model)).toEqual({
    kind: 'parts',
    instanceIds: ['a', 'b', 'c'],
    label: '3 parts',
  });
  expect(label({ instanceIds: ['c'] })).toBe('1 part');
  expect(label({})).toBe('Whole assembly');
  expect(label({ instanceIds: [] })).toBe('Whole assembly');
  expect(label({ section: { origin: [0, 0, 0], normal: [1, 0, 0] } })).toBe('Whole assembly · section');
  expect(label({ views: ['exploded'] })).toBe('Whole assembly · exploded');
  expect(label({ partId: 'p', views: [{ name: 'E', view: 'exploded' }] })).toBe('Part · Profile part 1 · exploded');
});

it('findSheetFor matches plain sheets by part, instance set or whole assembly, never section or exploded ones', () => {
  const model = sheetModel(
    sheet('section', { section: { origin: [0, 0, 0], normal: [1, 0, 0] } }),
    sheet('exploded', { views: ['exploded'] }),
    sheet('part', { partId: 'p' }),
    sheet('pair', { instanceIds: ['a', 'b'] }),
    sheet('assembly'),
  );
  expect(findSheetFor(model, { partId: 'p' }).id).toBe('part');
  expect(findSheetFor(model, { partId: 'zzz' })).toBeNull();
  expect(findSheetFor(model, { instanceIds: ['b', 'a'] }).id).toBe('pair');
  expect(findSheetFor(model, { instanceIds: ['a'] })).toBeNull();
  expect(findSheetFor(model, {}).id).toBe('assembly');
  // A section or exploded sheet of the subject is not its plain sheet.
  expect(
    findSheetFor(sheetModel(sheet('section', { section: { origin: [0, 0, 0], normal: [1, 0, 0] } })), {}),
  ).toBeNull();
  expect(findSheetFor(sheetModel(sheet('e', { partId: 'p', views: ['exploded'] })), { partId: 'p' })).toBeNull();
});
