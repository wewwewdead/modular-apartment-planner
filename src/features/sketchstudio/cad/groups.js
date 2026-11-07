// Part groups in the 3D workstation (docs/sketch-studio-part-groups.md):
// named, nestable groups stored as parent pointers (model.groups[] with
// parentId, instance.groupId). A node is an instance id or a group id. Pure:
// models in, models and ids out. The kernel never reads either key.
import { clone, pruneGroups, uid } from './model.js';
import { shiftedPosition } from './movement.js';

export { pruneGroups };

const groupsOf = (model) => model?.groups || [];
const findGroup = (model, id) => groupsOf(model).find((g) => g.id === id) || null;
const findInstance = (model, id) => model?.instances?.find((i) => i.id === id) || null;
const attachedTo = (model, id) => (model?.connections || []).find((c) => c.from === id && c.type !== 'weld') || null;

export const isGroupId = (model, id) => Boolean(id) && groupsOf(model).some((g) => g.id === id);
export const isNode = (model, id) => Boolean(findInstance(model, id)) || isGroupId(model, id);

// The group directly containing a node (null = top level, or unknown node).
export function nodeParent(model, nodeId) {
  const instance = findInstance(model, nodeId);
  if (instance) return instance.groupId ?? null;
  return findGroup(model, nodeId)?.parentId ?? null;
}

// The groups containing a node, innermost first (cycle-safe).
export function ancestors(model, nodeId) {
  const chain = [];
  const seen = new Set([nodeId]);
  for (let parent = nodeId && nodeParent(model, nodeId); parent != null; parent = findGroup(model, parent)?.parentId) {
    if (seen.has(parent) || !findGroup(model, parent)) break;
    seen.add(parent);
    chain.push(parent);
  }
  return chain;
}

// Whether `groupId` contains the node at any depth.
export const contains = (model, groupId, nodeId) => ancestors(model, nodeId).includes(groupId);

// Leaf instance ids of a selection (groups expand recursively), in model
// order, without duplicates.
export function memberIds(model, nodeIds = []) {
  const wanted = new Set(nodeIds);
  if (!wanted.size) return [];
  return (model?.instances || [])
    .filter((instance) => wanted.has(instance.id) || ancestors(model, instance.id).some((g) => wanted.has(g)))
    .map((instance) => instance.id);
}

// What a click on a part selects (§3.3): the outermost group containing it
// below the open group, or the instance itself. An open group that does not
// contain the part is ignored (the caller closes it).
export function topNode(model, instanceId, openGroupId = null) {
  const chain = [instanceId, ...ancestors(model, instanceId)];
  const open = openGroupId ? chain.indexOf(openGroupId) : -1;
  return open > 0 ? chain[open - 1] : chain.at(-1);
}

// Direct children of a group (null = the top level), in tree order.
export function childNodes(model, groupId = null) {
  return {
    groups: groupsOf(model)
      .filter((g) => (g.parentId ?? null) === groupId)
      .map((g) => g.id),
    instances: (model?.instances || []).filter((i) => (i.groupId ?? null) === groupId).map((i) => i.id),
  };
}

// The parts tree: nested rows, each group drawn at the position of its first
// member in model.instances. Rows: { kind: 'instance', id, instance, depth }
// or { kind: 'group', id, group, depth, count (leaf parts), hidden (all
// hidden), children }. A group with no parts at all is not drawn.
export function treeRows(model) {
  const first = new Map();
  (model?.instances || []).forEach((instance, index) => {
    for (const node of [instance.id, ...ancestors(model, instance.id)]) if (!first.has(node)) first.set(node, index);
  });
  const build = (parentId, depth) => {
    const { groups, instances } = childNodes(model, parentId);
    return [...groups, ...instances]
      .filter((id) => first.has(id))
      .sort((a, b) => first.get(a) - first.get(b))
      .map((id) => {
        const group = findGroup(model, id);
        if (!group) return { kind: 'instance', id, instance: findInstance(model, id), depth };
        const members = memberIds(model, [id]).map((m) => findInstance(model, m));
        return {
          kind: 'group',
          id,
          group,
          depth,
          count: members.length,
          hidden: members.every((m) => m.visible === false),
          children: build(id, depth + 1),
        };
      });
  };
  return build(null, 0);
}

// 'Group 1', 'Group 2', …: the first unused name.
export function nextGroupName(model) {
  const names = new Set(groupsOf(model).map((g) => g.name));
  let n = 1;
  while (names.has(`Group ${n}`)) n++;
  return `Group ${n}`;
}

export const GROUP_COPY = Object.freeze({
  tooFew: 'Select at least two parts to group.',
  mixed: 'Pick parts at the same level to group them.',
  outside: 'Pick a face on a part outside this group.',
  localDisabled: 'A group has no axes of its own; World axes are used',
});

const nodeName = (model, id) => {
  const group = findGroup(model, id);
  if (group) return group.name;
  const instance = findInstance(model, id);
  return instance?.name || model?.parts?.find((p) => p.id === instance?.partId)?.name || 'Part';
};
export { nodeName };

// Group ≥ 2 sibling nodes into a new group under their common parent.
// Grouping never moves geometry.
export function groupNodes(model, nodeIds) {
  const ids = [...new Set(nodeIds)].filter((id) => isNode(model, id));
  if (ids.length < 2) throw new Error(GROUP_COPY.tooFew);
  const parentId = nodeParent(model, ids[0]);
  if (ids.some((id) => nodeParent(model, id) !== parentId)) throw new Error(GROUP_COPY.mixed);
  const groupId = uid('group');
  const chosen = new Set(ids);
  const next = {
    ...model,
    groups: [
      ...groupsOf(model).map((g) => (chosen.has(g.id) ? { ...g, parentId: groupId } : g)),
      { id: groupId, name: nextGroupName(model), parentId },
    ],
    instances: model.instances.map((i) => (chosen.has(i.id) ? { ...i, groupId } : i)),
  };
  return { model: next, groupId };
}

// Dissolve each group one level: its children move to its parent. The
// children come back in tree order (siblings, so Group regroups them).
export function ungroupNodes(model, groupIds) {
  const dissolving = new Set(groupIds.filter((id) => isGroupId(model, id)));
  if (!dissolving.size) return { model, childIds: [] };
  const order = treeOrder(model);
  const childIds = [];
  for (const id of dissolving) {
    const { groups, instances } = childNodes(model, id);
    childIds.push(...[...groups, ...instances].filter((c) => !dissolving.has(c)));
  }
  childIds.sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  // A dissolved group nested in another dissolved one hands its children to
  // the first surviving ancestor.
  const survivor = (id) => {
    let parent = findGroup(model, id)?.parentId ?? null;
    while (parent != null && dissolving.has(parent)) parent = findGroup(model, parent)?.parentId ?? null;
    return parent;
  };
  const next = {
    ...model,
    groups: groupsOf(model)
      .filter((g) => !dissolving.has(g.id))
      .map((g) => (dissolving.has(g.parentId) ? { ...g, parentId: survivor(g.parentId) } : g)),
    instances: model.instances.map((i) => {
      if (!dissolving.has(i.groupId)) return i;
      const parent = survivor(i.groupId);
      if (parent != null) return { ...i, groupId: parent };
      const { groupId: _groupId, ...rest } = i;
      return rest;
    }),
  };
  return { model: pruneGroups(next), childIds };
}

// Node id → position of its first member in model.instances.
function treeOrder(model) {
  const first = new Map();
  (model?.instances || []).forEach((instance, index) => {
    for (const node of [instance.id, ...ancestors(model, instance.id)]) if (!first.has(node)) first.set(node, index);
  });
  return first;
}

// The anchoring rule (§3.5): a selection moves as a body only when no member
// has a non-weld attachment to an instance outside the selection.
export function anchoring(model, members) {
  const inside = new Set(members);
  for (const id of members) {
    const connection = attachedTo(model, id);
    if (connection && !inside.has(connection.to)) return { memberId: id, targetId: connection.to };
  }
  return null;
}

export const anchoredMessage = (model, anchor) =>
  `${nodeName(model, anchor.memberId)} is attached to ${nodeName(model, anchor.targetId)} outside this group. Group them together or edit Connections / welds.`;

// The poses a rigid motion edits (§3.5): every member except those `fixed`
// to another member (their pose is in that parent's frame, so editing it
// would move them twice). Concentric, align and face-offset members keep
// their own poses edited.
export function rigidMovers(model, members) {
  const inside = new Set(members);
  return members.filter((id) => {
    const connection = attachedTo(model, id);
    return !(connection && connection.type === 'fixed' && inside.has(connection.to));
  });
}

// Following an instance's non-weld attachments `from → to` to the free
// instance its placement hangs on (§3.5 "attached parts ride their root's
// pending pose"). The instance itself when free; null on a cycle or a
// missing target.
export function attachmentRoot(model, id) {
  const seen = new Set();
  let current = id;
  for (;;) {
    if (seen.has(current)) return null;
    seen.add(current);
    const connection = attachedTo(model, current);
    if (!connection) return findInstance(model, current) ? current : null;
    current = connection.to;
  }
}

// Duplicate the selected nodes (§3.6): every member, the nested group records
// (fresh ids; a selected group's copy is named "… copy"), and the internal
// connections (both ends inside, welds included). Free movers shift by
// `offset`; `fixed` children follow their copied parent. Marks are not
// copied. Refused when the selection is anchored.
export function duplicateNodes(model, nodeIds, offset = [100, 0, 0]) {
  const nodes = [...new Set(nodeIds)].filter((id) => isNode(model, id));
  const members = memberIds(model, nodes);
  if (!members.length) throw new Error('Select a part or a group to duplicate.');
  const anchor = anchoring(model, members);
  if (anchor) throw new Error(anchoredMessage(model, anchor));
  const movers = new Set(rigidMovers(model, members));
  const selected = new Set(nodes);
  // Groups copied: the selected ones and every group inside them.
  const copiedGroups = groupsOf(model).filter(
    (g) => selected.has(g.id) || ancestors(model, g.id).some((a) => selected.has(a)),
  );
  const ids = new Map();
  for (const g of copiedGroups) ids.set(g.id, uid('group'));
  for (const id of members) ids.set(id, uid('instance'));
  const groups = copiedGroups.map((g) => ({
    ...g,
    id: ids.get(g.id),
    name: selected.has(g.id) ? `${g.name} copy` : g.name,
    parentId: ids.get(g.parentId) ?? g.parentId ?? null,
  }));
  const instances = members.map((id) => {
    const instance = findInstance(model, id);
    const copy = { ...clone(instance), id: ids.get(id) };
    if (instance.groupId != null) copy.groupId = ids.get(instance.groupId) ?? instance.groupId;
    if (movers.has(id)) copy.position = shiftedPosition(instance.position, offset);
    return copy;
  });
  const inside = new Set(members);
  const connections = model.connections
    .filter((c) => inside.has(c.from) && inside.has(c.to))
    .map((c) => ({ ...clone(c), id: uid('connection'), from: ids.get(c.from), to: ids.get(c.to) }));
  return {
    model: {
      ...model,
      groups: [...groupsOf(model), ...groups],
      instances: [...model.instances, ...instances],
      connections: [...model.connections, ...connections],
    },
    nodeIds: nodes.map((id) => ids.get(id)),
  };
}

const editable = (target) =>
  Boolean(target?.closest?.('input, select, textarea, [contenteditable=""], [contenteditable="true"]'));

/**
 * Ctrl/Meta+G groups, Ctrl/Meta+Shift+G ungroups one level, Ctrl/Meta+A
 * selects every node of the current context, Esc closes the open group. The
 * same guards as placementKeyAction (rotateKeys.js). The caller calls
 * preventDefault only when an action is returned (the browser's Ctrl+G is
 * find-next, Ctrl+A selects the page).
 * @param {KeyboardEvent} event
 * @param {{ nodes: number, hasGroup: boolean, openGroupId: string|null, busy: boolean, dragging: boolean }} state
 * @returns {null | { type: 'group' | 'ungroup' | 'selectAll' | 'closeGroup' }}
 */
export function groupKeyAction(
  event,
  { nodes = 0, hasGroup = false, openGroupId = null, busy = false, dragging = false },
) {
  if (event.altKey || event.defaultPrevented || dragging || editable(event.target)) return null;
  const key = event.key?.toLowerCase();
  const chord = event.ctrlKey || event.metaKey;
  if (chord && (key === 'g' || event.code === 'KeyG')) {
    if (busy || event.repeat) return null;
    if (event.shiftKey) return hasGroup ? { type: 'ungroup' } : null;
    return nodes >= 2 ? { type: 'group' } : null;
  }
  if (chord && !event.shiftKey && (key === 'a' || event.code === 'KeyA')) return busy ? null : { type: 'selectAll' };
  if (event.key === 'Escape' && !chord && !event.shiftKey && openGroupId && !busy) return { type: 'closeGroup' };
  return null;
}
