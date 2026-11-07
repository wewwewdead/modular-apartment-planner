import { describe, expect, it } from 'vitest';
import { emptyModel, normalizeModel, removeInstance } from './model.js';
import {
  ancestors,
  anchoredMessage,
  anchoring,
  attachmentRoot,
  childNodes,
  duplicateNodes,
  groupKeyAction,
  groupNodes,
  isGroupId,
  memberIds,
  nextGroupName,
  nodeParent,
  pruneGroups,
  rigidMovers,
  topNode,
  treeRows,
  ungroupNodes,
} from './groups.js';
import { normalizeSketchDocument } from '../utils/sketchDocumentUtils.js';

const part = { id: 'p', name: 'Board', features: [{ id: 'f', type: 'box', width: 10, depth: 10, height: 10 }] };
const inst = (id, groupId, extra = {}) => ({
  id,
  partId: 'p',
  name: id.toUpperCase(),
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  ...(groupId ? { groupId } : {}),
  ...extra,
});
// Depth 3: G1 { a, G2 { b, G3 { c, d } } }, e at the top level.
const nested = () =>
  normalizeModel({
    ...emptyModel(),
    parts: [part],
    groups: [
      { id: 'G1', name: 'Group 1', parentId: null },
      { id: 'G2', name: 'Group 2', parentId: 'G1' },
      { id: 'G3', name: 'Group 3', parentId: 'G2' },
    ],
    instances: [inst('e'), inst('a', 'G1'), inst('b', 'G2'), inst('c', 'G3'), inst('d', 'G3')],
  });

describe('group structure', () => {
  it('reads parents, ancestors and members at depth 3', () => {
    const model = nested();
    expect(nodeParent(model, 'c')).toBe('G3');
    expect(nodeParent(model, 'G3')).toBe('G2');
    expect(nodeParent(model, 'G1')).toBeNull();
    expect(nodeParent(model, 'e')).toBeNull();
    expect(nodeParent(model, 'missing')).toBeNull();
    expect(ancestors(model, 'c')).toEqual(['G3', 'G2', 'G1']);
    expect(isGroupId(model, 'G2')).toBe(true);
    expect(isGroupId(model, 'a')).toBe(false);
    expect(memberIds(model, ['G2'])).toEqual(['b', 'c', 'd']);
    expect(memberIds(model, ['G3', 'G1', 'e'])).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(childNodes(model, 'G2')).toEqual({ groups: ['G3'], instances: ['b'] });
    expect(childNodes(model, null)).toEqual({ groups: ['G1'], instances: ['e'] });
  });

  it('topNode takes the outermost group, or the node just below the open group', () => {
    const model = nested();
    expect(topNode(model, 'c')).toBe('G1');
    expect(topNode(model, 'e')).toBe('e');
    expect(topNode(model, 'c', 'G1')).toBe('G2');
    expect(topNode(model, 'c', 'G2')).toBe('G3');
    expect(topNode(model, 'c', 'G3')).toBe('c');
    expect(topNode(model, 'a', 'G1')).toBe('a');
    // An open group that does not contain the part is ignored.
    expect(topNode(model, 'a', 'G3')).toBe('G1');
    expect(topNode(model, 'e', 'G1')).toBe('e');
  });

  it('draws each group at the position of its first member', () => {
    const rows = treeRows(nested());
    expect(rows.map((r) => [r.kind, r.id, r.depth])).toEqual([
      ['instance', 'e', 0],
      ['group', 'G1', 0],
    ]);
    const g1 = rows[1];
    expect(g1.count).toBe(4);
    expect(g1.hidden).toBe(false);
    expect(g1.children.map((r) => r.id)).toEqual(['a', 'G2']);
    expect(g1.children[1].children.map((r) => [r.id, r.depth])).toEqual([
      ['b', 2],
      ['G3', 2],
    ]);
    expect(g1.children[1].children[1].children.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('names new groups by the first unused number', () => {
    const model = nested();
    expect(nextGroupName(model)).toBe('Group 4');
    expect(nextGroupName({ ...model, groups: model.groups.filter((g) => g.id !== 'G2') })).toBe('Group 2');
    expect(nextGroupName(emptyModel())).toBe('Group 1');
  });
});

describe('group and ungroup', () => {
  const flat = () =>
    normalizeModel({ ...emptyModel(), parts: [part], instances: [inst('a'), inst('b'), inst('c'), inst('d')] });

  it('groups two or more sibling nodes under their common parent without moving them', () => {
    const before = flat();
    const { model, groupId } = groupNodes(before, ['c', 'a']);
    expect(model.groups).toEqual([{ id: groupId, name: 'Group 1', parentId: null }]);
    expect(model.instances.map((i) => i.groupId ?? null)).toEqual([groupId, null, groupId, null]);
    expect(model.instances.map((i) => i.position)).toEqual(before.instances.map((i) => i.position));
    expect(() => normalizeModel(model)).not.toThrow();
    // Grouping a group with a part nests it.
    const outer = groupNodes(model, [groupId, 'b']);
    expect(nodeParent(outer.model, groupId)).toBe(outer.groupId);
    expect(nodeParent(outer.model, 'b')).toBe(outer.groupId);
    expect(outer.model.groups.at(-1).name).toBe('Group 2');
  });

  it('refuses fewer than two nodes and nodes at different levels', () => {
    expect(() => groupNodes(flat(), ['a'])).toThrow('Select at least two parts to group.');
    expect(() => groupNodes(flat(), ['a', 'a', 'missing'])).toThrow('Select at least two parts to group.');
    expect(() => groupNodes(nested(), ['a', 'e'])).toThrow('Pick parts at the same level to group them.');
  });

  it('ungroups one level: children move to the parent and come back in tree order', () => {
    const { model, childIds } = ungroupNodes(nested(), ['G2']);
    expect(model.groups.map((g) => g.id)).toEqual(['G1', 'G3']);
    expect(nodeParent(model, 'b')).toBe('G1');
    expect(nodeParent(model, 'G3')).toBe('G1');
    expect(childIds).toEqual(['b', 'G3']);
    // A top-level group's parts become top level (no groupId key).
    const grouped = groupNodes(flat(), ['a', 'b']);
    const undone = ungroupNodes(grouped.model, [grouped.groupId]);
    expect(undone.childIds).toEqual(['a', 'b']);
    expect(undone.model.groups).toEqual([]);
    expect(undone.model.instances.every((i) => !('groupId' in i))).toBe(true);
  });
});

describe('pruneGroups', () => {
  it('returns the same object when nothing changes, and for models without groups', () => {
    const model = nested();
    expect(pruneGroups(model)).toBe(model);
    const old = { instances: [inst('a')], connections: [] };
    expect(pruneGroups(old)).toBe(old);
    expect(pruneGroups(null)).toBe(null);
  });

  it('dissolves a one-child group into its parent, and a chain of them at once', () => {
    const model = nested();
    // Removing d leaves G3 with one child: c moves up into G2.
    const removed = removeInstance(model, 'd');
    expect(removed.groups.map((g) => g.id)).toEqual(['G1', 'G2']);
    expect(nodeParent(removed, 'c')).toBe('G2');
    // A group of one group of one part dissolves entirely.
    const chain = pruneGroups({
      ...emptyModel(),
      groups: [
        { id: 'X', name: 'X', parentId: null },
        { id: 'Y', name: 'Y', parentId: 'X' },
      ],
      instances: [inst('a', 'Y'), inst('b')],
    });
    expect(chain.groups).toEqual([]);
    expect(chain.instances.map((i) => i.groupId)).toEqual([undefined, undefined]);
  });

  it('repairs a dangling groupId, a missing parent and a parent cycle (load repair)', () => {
    const repaired = pruneGroups({
      ...emptyModel(),
      groups: [
        { id: 'G', name: 'G', parentId: 'gone' },
        { id: 'A', name: 'A', parentId: 'B' },
        { id: 'B', name: 'B', parentId: 'A' },
      ],
      instances: [inst('a', 'G'), inst('b', 'G'), inst('c', 'nowhere'), inst('d', 'A'), inst('e', 'B')],
    });
    expect(repaired.groups.find((g) => g.id === 'G').parentId).toBeNull();
    expect(repaired.instances.find((i) => i.id === 'c').groupId).toBeUndefined();
    expect(() => normalizeModel(repaired)).not.toThrow();
    // A whole saved document with a dangling groupId opens, repaired.
    const document = normalizeSketchDocument({
      model: {
        ...emptyModel(),
        parts: [part],
        groups: [{ id: 'G', name: 'Frame', parentId: null }],
        instances: [inst('a', 'G'), inst('b', 'G'), inst('c', 'deleted-group')],
      },
    });
    expect(document.model.groups).toEqual([{ id: 'G', name: 'Frame', parentId: null }]);
    expect(document.model.instances.map((i) => i.groupId ?? null)).toEqual(['G', 'G', null]);
  });
});

describe('moving a group as a body', () => {
  const attached = () =>
    normalizeModel({
      ...emptyModel(),
      parts: [part],
      instances: [inst('board'), inst('tube'), inst('pin'), inst('outside'), inst('nut')],
      connections: [
        { id: 'c1', type: 'fixed', from: 'tube', to: 'board', offset: [0, 0, 0] },
        { id: 'c2', type: 'concentric', from: 'pin', to: 'board', fromFeatureId: 'f', toFeatureId: 'f' },
        { id: 'w', type: 'weld', from: 'board', to: 'outside', location: [0, 0, 0] },
        { id: 'c3', type: 'fixed', from: 'nut', to: 'pin', offset: [0, 0, 0] },
      ],
    });

  it('rigidMovers skips a fixed child of a member and keeps a concentric one', () => {
    const model = attached();
    expect(rigidMovers(model, ['board', 'tube', 'pin', 'nut'])).toEqual(['board', 'pin']);
    // A fixed child whose parent is outside the selection is a mover (and anchors it).
    expect(rigidMovers(model, ['tube'])).toEqual(['tube']);
  });

  it('anchoring names the member and its outside target; welds never anchor', () => {
    const model = attached();
    expect(anchoring(model, ['board', 'tube', 'pin', 'nut'])).toBeNull();
    expect(anchoring(model, ['board'])).toBeNull();
    const anchor = anchoring(model, ['tube', 'outside']);
    expect(anchor).toEqual({ memberId: 'tube', targetId: 'board' });
    expect(anchoredMessage(model, anchor)).toBe(
      'TUBE is attached to BOARD outside this group. Group them together or edit Connections / welds.',
    );
  });

  it('attachmentRoot walks from → to to the free instance, and stops on a cycle', () => {
    const model = attached();
    expect(attachmentRoot(model, 'nut')).toBe('board');
    expect(attachmentRoot(model, 'board')).toBe('board');
    const cyclic = {
      ...model,
      connections: [
        { id: 'x', type: 'fixed', from: 'a', to: 'b' },
        { id: 'y', type: 'fixed', from: 'b', to: 'a' },
      ],
      instances: [inst('a'), inst('b')],
    };
    expect(attachmentRoot(cyclic, 'a')).toBeNull();
  });
});

describe('duplicateNodes', () => {
  const frame = () =>
    normalizeModel({
      ...emptyModel(),
      parts: [part],
      groups: [
        { id: 'G', name: 'Frame', parentId: null },
        { id: 'H', name: 'Legs', parentId: 'G' },
      ],
      instances: [
        inst('top', 'G', { position: ['=w', 0, 700] }),
        inst('leg1', 'H'),
        inst('leg2', 'H'),
        inst('bracket', 'G'),
        inst('wall'),
      ],
      connections: [
        { id: 'fix', type: 'fixed', from: 'bracket', to: 'top', offset: [0, 0, 0] },
        { id: 'weld-in', type: 'weld', from: 'leg1', to: 'top', location: [0, 0, 0] },
        { id: 'weld-out', type: 'weld', from: 'leg2', to: 'wall', location: [0, 0, 0] },
      ],
    });

  it('copies members, nested groups and internal connections; drops outside welds', () => {
    const before = frame();
    const { model, nodeIds } = duplicateNodes(before, ['G']);
    expect(model.instances).toHaveLength(9);
    expect(model.groups).toHaveLength(4);
    const [copyId] = nodeIds;
    const copy = model.groups.find((g) => g.id === copyId);
    expect(copy).toEqual({ id: copyId, name: 'Frame copy', parentId: null });
    const legs = model.groups.find((g) => g.parentId === copyId);
    expect(legs.name).toBe('Legs');
    const copies = memberIds(model, [copyId]).map((id) => model.instances.find((i) => i.id === id));
    expect(copies.map((i) => i.name)).toEqual(['TOP', 'LEG1', 'LEG2', 'BRACKET']);
    // Free movers +100 mm in X (expressions stay live); the fixed child follows its copied parent.
    expect(copies[0].position).toEqual(['=(w)+(100)', 0, 700]);
    expect(copies[1].position).toEqual([100, 0, 0]);
    expect(copies[3].position).toEqual([0, 0, 0]);
    const added = model.connections.slice(before.connections.length);
    expect(added.map((c) => c.type).sort()).toEqual(['fixed', 'weld']);
    const fixed = added.find((c) => c.type === 'fixed');
    expect([fixed.from, fixed.to]).toEqual([copies[3].id, copies[0].id]);
    const weld = added.find((c) => c.type === 'weld');
    expect([weld.from, weld.to]).toEqual([copies[1].id, copies[0].id]);
    expect(() => normalizeModel(model)).not.toThrow();
  });

  it('copies a part selected inside a group as a sibling in that group, and refuses an anchored selection', () => {
    const { model, nodeIds } = duplicateNodes(frame(), ['leg1']);
    expect(nodeParent(model, nodeIds[0])).toBe('H');
    expect(() => duplicateNodes(frame(), ['bracket'])).toThrow('BRACKET is attached to TOP outside this group.');
  });
});

describe('groupKeyAction', () => {
  const key = (init) => ({ key: 'g', ctrlKey: true, target: null, ...init });
  const state = { nodes: 2, hasGroup: true, openGroupId: 'G', busy: false, dragging: false };

  it('maps Ctrl/Meta+G, Ctrl+Shift+G, Ctrl+A and Esc', () => {
    expect(groupKeyAction(key(), state)).toEqual({ type: 'group' });
    expect(groupKeyAction(key({ ctrlKey: false, metaKey: true }), state)).toEqual({ type: 'group' });
    expect(groupKeyAction(key({ key: 'G', shiftKey: true }), state)).toEqual({ type: 'ungroup' });
    expect(groupKeyAction(key({ key: 'a' }), state)).toEqual({ type: 'selectAll' });
    expect(groupKeyAction({ key: 'Escape', target: null }, state)).toEqual({ type: 'closeGroup' });
  });

  it('returns null for no-ops and while typing, holding Alt, busy or dragging', () => {
    expect(groupKeyAction(key(), { ...state, nodes: 1 })).toBeNull();
    expect(groupKeyAction(key({ shiftKey: true }), { ...state, hasGroup: false })).toBeNull();
    expect(groupKeyAction({ key: 'Escape', target: null }, { ...state, openGroupId: null })).toBeNull();
    expect(groupKeyAction({ key: 'g', target: null }, state)).toBeNull();
    const input = { closest: (selector) => (selector.includes('input') ? {} : null) };
    expect(groupKeyAction(key({ target: input }), state)).toBeNull();
    expect(groupKeyAction(key({ altKey: true }), state)).toBeNull();
    expect(groupKeyAction(key({ defaultPrevented: true }), state)).toBeNull();
    expect(groupKeyAction(key(), { ...state, busy: true })).toBeNull();
    expect(groupKeyAction(key({ key: 'a' }), { ...state, busy: true })).toBeNull();
    expect(groupKeyAction({ key: 'Escape', target: null }, { ...state, busy: true })).toBeNull();
    expect(groupKeyAction(key(), { ...state, dragging: true })).toBeNull();
  });
});
