import { evaluateSketchExpression } from '../utils/sketchExpressionUtils.js';
import { draftingProfile } from './draftingProfiles.js';

export const CAD_VERSION = 1;
export const uid = (prefix = 'cad') => `${prefix}-${crypto.randomUUID()}`;
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const DEFAULT_FABRICATION = Object.freeze({
  kerf: 3,
  allowance: 0,
  stockLength: 6000,
  sheetWidth: 2440,
  sheetHeight: 1220,
});
// The shop's machines (docs/sketch-studio-fab-shop.md §4.2): keys of the
// press brake, laser and sheet size the stations use.
export const DEFAULT_SHOP = Object.freeze({ machine: 'brake-50-2000', laser: 'fiber-2kw', sheet: '1219x2438' });
// Top-level keys the kernel never reads (§4.3): changing only these keeps the
// built solids (useCadModel skips the rebuild). `fabrication` (kerf, stock and
// sheet sizes, the shop's machines) is read only on the main thread, from the
// current model (cut list, workshop ZIP, the press brake): the kernel, the
// sketch solver and the projection never see it. `marks` (Measure marks) are
// display and snapping only; the worker still validates them on a real build,
// and every commit validates them first (normalizeModel).
export const KERNEL_INERT_KEYS = Object.freeze(['finishes', 'prints', 'fabrication', 'marks']);
// An instance's keys the kernel never reads: its group (groups.js), Hide /
// Show and its own tree name. Its part, pose and attachments are read.
const KERNEL_INERT_INSTANCE_KEYS = Object.freeze(['groupId', 'visible', 'name']);
// The records kernelPayload leaves on the main thread.
const SHOP_RECORD_KEYS = Object.freeze(['finishes', 'prints']);
/**
 * `a` and `b` differ, if at all, only in kernel-inert keys (every other
 * top-level key is ===). A group edit counts as inert too: the kernel never
 * reads `groups` or an instance's `groupId` (groups.js). So
 * `groups` may differ, and `instances` may be a new list when it has the same
 * length and every record is === or was rewritten with only its `groupId`,
 * `visible` or `name` changed (at least one such record: a plain copy of the
 * list still rebuilds).
 */
export function sameKernelInput(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (KERNEL_INERT_KEYS.includes(key) || a[key] === b[key]) continue;
    if (key === 'groups') continue;
    if (key === 'instances' && onlyInertInstanceEdits(a.instances, b.instances)) continue;
    return false;
  }
  return true;
}
// Two instance lists that differ only in which group some records name, or
// in whether they are shown and what they are called.
function onlyInertInstanceEdits(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  let moved = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!a[i] || !b[i] || typeof a[i] !== 'object' || typeof b[i] !== 'object') return false;
    const keys = new Set([...Object.keys(a[i]), ...Object.keys(b[i])]);
    for (const key of keys) if (!KERNEL_INERT_INSTANCE_KEYS.includes(key) && a[i][key] !== b[i][key]) return false;
    moved++;
  }
  return moved > 0;
}
/**
 * What a kernel worker is sent for a build: the model without the shop's
 * records (finishes, prints), which it never reads. A
 * print's image is a data URL of up to PRINT_IMAGE_LIMIT characters; without
 * this every rebuild would structured-clone it to the worker (and to the
 * solver). Returns the same object when there are none.
 */
export function kernelPayload(model) {
  if (!model || typeof model !== 'object') return model;
  if (!SHOP_RECORD_KEYS.some((key) => model[key]?.length)) return model;
  const { finishes: _finishes, prints: _prints, ...rest } = model;
  return rest;
}
export const FINISH_KINDS = Object.freeze(['powder', 'wet']);
export const FINISH_GLOSS = Object.freeze(['matte', 'satin', 'gloss', 'texture']);
export const PRINT_METHODS = Object.freeze(['silk', 'uv', 'pad']);
export const PRINT_KINDS = Object.freeze(['text', 'image']);
export const PRINT_IMAGE_LIMIT = 512 * 1024;

export function emptyModel() {
  return {
    version: CAD_VERSION,
    parameters: [],
    sketches: [],
    parts: [],
    instances: [],
    connections: [],
    // Measure marks (see marks.js): display and snapping only; the kernel ignores them.
    marks: [],
    // Part groups (groups.js, docs/sketch-studio-part-groups.md): { id, name,
    // parentId } records; an instance names its group in `groupId`. An editing
    // aid only: the kernel, drawings and cut list never read either key.
    groups: [],
    // The fabrication shop's records (docs/sketch-studio-fab-shop.md §4.2):
    // one finish per instance, prints. Display and reports only; the kernel
    // never reads them (KERNEL_INERT_KEYS).
    finishes: [],
    prints: [],
    sheets: [
      {
        id: 'assembly-sheet',
        title: 'Assembly',
        size: 'A3',
        units: 'mm',
        // Fit to page (Phase R): the largest standard scale where every view
        // fits; `scale` is the fixed value kept for switching back.
        scaleMode: 'fit',
        scale: 0.05,
        revision: 'A',
        tolerance: '±0.5 mm',
        views: ['front', 'top', 'right', 'isometric'],
        annotations: [],
      },
    ],
    fabrication: { ...DEFAULT_FABRICATION, shop: { ...DEFAULT_SHOP } },
  };
}

// The model's fabrication settings with every default present. The same
// object comes back when nothing is missing, so a commit that did not touch
// them keeps `fabrication` === (the kernel-inert rebuild rule compares keys).
function normalizeFabrication(value) {
  const shop = value?.shop;
  if (
    value &&
    typeof value === 'object' &&
    Object.keys(DEFAULT_FABRICATION).every((key) => key in value) &&
    shop &&
    typeof shop === 'object' &&
    Object.keys(DEFAULT_SHOP).every((key) => key in shop)
  )
    return value;
  return {
    ...DEFAULT_FABRICATION,
    ...value,
    shop: { ...DEFAULT_SHOP, ...(shop && typeof shop === 'object' ? shop : {}) },
  };
}

// What a measure mark reads: the straight distance or one axis.
export const MARK_ALONG = Object.freeze(['aligned', 'X', 'Y', 'Z']);
const finite3 = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
// A mark end: part-local coordinates on an instance, or world ones (instanceId null).
const markAnchor = (anchor) =>
  Boolean(anchor) &&
  typeof anchor === 'object' &&
  (anchor.instanceId === null || typeof anchor.instanceId === 'string') &&
  finite3(anchor.local);

// A sketch's reference dimensions (docs/sketch-studio-sketch-dimensions.md
// §3.1), sketch-plane mm: each with an id unique in its sketch, one of the two
// types, finite numbers in every coordinate and a valid orientation / mode.
const finite2 = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const sketchDimension = (d) =>
  Boolean(d) &&
  typeof d === 'object' &&
  typeof d.id === 'string' &&
  d.id !== '' &&
  (d.type === 'linear'
    ? finite2(d.from) &&
      finite2(d.to) &&
      ['horizontal', 'vertical', 'aligned'].includes(d.orientation) &&
      Number.isFinite(d.offset)
    : d.type === 'radial' &&
      ['diameter', 'radius'].includes(d.mode) &&
      finite2(d.center) &&
      Number.isFinite(d.radius) &&
      d.radius > 0 &&
      finite2(d.at));
const validSketchDimensions = (list) =>
  Array.isArray(list) && list.every(sketchDimension) && new Set(list.map((d) => d.id)).size === list.length;

// The shop's Weld and Assembly stations were removed (docs/sketch-studio-
// shop-trim.md §4.2) and a file saved before that still opens: its seams
// (`welds`) and assembly steps (`assembly`) are left out unread, so a malformed
// one cannot refuse the file, and a group's `weldment` flag goes (the group
// stays an ordinary group, its name and members kept). Nothing else changes.
function withoutShopStations(value) {
  const { welds: _welds, assembly: _assembly, ...rest } = value;
  if (!Array.isArray(rest.groups) || !rest.groups.some((g) => g && typeof g === 'object' && 'weldment' in g))
    return rest;
  return {
    ...rest,
    groups: rest.groups.map((g) => {
      if (!g || typeof g !== 'object' || !('weldment' in g)) return g;
      const { weldment: _weldment, ...group } = g;
      return group;
    }),
  };
}

// CAD lives beside legacy entities. No old profile is implicitly made into a solid.
export function normalizeModel(value) {
  if (value == null) return emptyModel();
  if (typeof value !== 'object' || Array.isArray(value) || value.version !== CAD_VERSION)
    throw new Error('Unsupported solid-model schema.');
  const defaults = emptyModel();
  const source = withoutShopStations(value);
  const result = { ...defaults, ...source, fabrication: normalizeFabrication(source.fabrication) };
  for (const key of [
    'parameters',
    'sketches',
    'parts',
    'instances',
    'connections',
    'sheets',
    'marks',
    'groups',
    'finishes',
    'prints',
  ]) {
    if (!Array.isArray(result[key])) throw new Error(`Model ${key} must be a list.`);
    const ids = new Set();
    for (const item of result[key]) {
      if (!item?.id || ids.has(item.id)) throw new Error(`Missing or duplicate ${key} ID: ${item?.id}`);
      ids.add(item.id);
    }
  }
  for (const part of result.parts) {
    if (
      typeof part.name !== 'string' ||
      !Array.isArray(part.features) ||
      part.features.some((f) => !f || typeof f.type !== 'string' || !f.id)
    )
      throw new Error(`Invalid part definition: ${part.id}`);
  }
  for (const sketch of result.sketches)
    if (
      !sketch.profile ||
      typeof sketch.profile.type !== 'string' ||
      (sketch.primitives != null && !Array.isArray(sketch.primitives))
    )
      throw new Error(`Invalid part sketch: ${sketch.id}`);
  for (const sketch of result.sketches)
    if (sketch.dimensions != null && !validSketchDimensions(sketch.dimensions))
      throw new Error(`Invalid sketch dimension: ${sketch.id}`);
  for (const instance of result.instances) {
    if (
      typeof instance.partId !== 'string' ||
      (instance.position && (!Array.isArray(instance.position) || instance.position.length !== 3)) ||
      (instance.rotation && (!Array.isArray(instance.rotation) || instance.rotation.length !== 3))
    )
      throw new Error(`Invalid assembly instance: ${instance.id}`);
  }
  validateGroups(result);
  // Marks on a part that no longer exists are not an error here: they are
  // simply not drawn.
  for (const mark of result.marks)
    if (!markAnchor(mark.from) || !markAnchor(mark.to) || !MARK_ALONG.includes(mark.along) || !finite3(mark.offset))
      throw new Error(`Invalid mark: ${mark.id}`);
  validateShopRecords(result);
  if (!result.sheets.length) throw new Error('Keep at least one drawing sheet.');
  for (const sheet of result.sheets)
    if (
      !Array.isArray(sheet.views) ||
      !sheet.views.length ||
      (sheet.annotations && !Array.isArray(sheet.annotations)) ||
      // Absent = fixed (files before Phase R).
      (sheet.scaleMode != null && !['fit', 'fixed'].includes(sheet.scaleMode))
    )
      throw new Error(`Invalid drawing sheet: ${sheet.id}`);
  return result;
}

// §4.2 record shapes. A row naming an instance that no longer exists is not
// an error (like a mark, it is simply not drawn); removeInstance drops them.
const optionalFinite = (value) => value == null || Number.isFinite(value);
const optionalString = (value) => value == null || typeof value === 'string';
function validateShopRecords(model) {
  for (const part of model.parts)
    for (const f of part.features)
      if (
        f.type === 'sheetmetal' &&
        (!Array.isArray(f.bends) ||
          f.bends.some((b) => !b?.id) ||
          new Set(f.bends.map((b) => b.id)).size !== f.bends.length ||
          (f.marks != null && !Array.isArray(f.marks)))
      )
        throw new Error(`Invalid sheet-metal feature: ${part.id} / ${f.id}`);
  // A bought-in item (docs/sketch-studio-shop-floor.md §5.4): its colour and reference.
  for (const part of model.parts)
    if (
      part.purchased != null &&
      (typeof part.purchased !== 'object' ||
        !/^#[0-9a-fA-F]{6}$/.test(part.purchased.colour || '') ||
        !optionalString(part.purchased.reference))
    )
      throw new Error(`Invalid bought-in item: ${part.id}`);
  const finished = new Set();
  for (const finish of model.finishes) {
    if (
      typeof finish.instanceId !== 'string' ||
      !FINISH_KINDS.includes(finish.kind) ||
      !/^#[0-9a-fA-F]{6}$/.test(finish.colour || '') ||
      (finish.gloss != null && !FINISH_GLOSS.includes(finish.gloss)) ||
      !optionalFinite(finish.thickness) ||
      !optionalString(finish.name)
    )
      throw new Error(`Invalid finish: ${finish.id}`);
    if (finished.has(finish.instanceId)) throw new Error(`Instance ${finish.instanceId} has more than one finish.`);
    finished.add(finish.instanceId);
  }
  for (const print of model.prints)
    if (
      typeof print.instanceId !== 'string' ||
      ![print.origin, print.x, print.normal].every(finite3) ||
      !(Number.isFinite(print.width) && print.width > 0 && Number.isFinite(print.height) && print.height > 0) ||
      !optionalFinite(print.rotation) ||
      !PRINT_METHODS.includes(print.method) ||
      !PRINT_KINDS.includes(print.kind) ||
      (print.kind === 'text' && typeof print.text !== 'string') ||
      (print.kind === 'image' &&
        (typeof print.image !== 'string' || !print.image.startsWith('data:') || print.image.length > PRINT_IMAGE_LIMIT))
    )
      throw new Error(`Invalid print: ${print.id}`);
  const shop = model.fabrication.shop;
  if (!shop || typeof shop !== 'object' || !Object.keys(DEFAULT_SHOP).every((key) => typeof shop[key] === 'string'))
    throw new Error('Invalid shop settings: machine, laser and sheet must be names.');
  // What the shop holds (docs/sketch-studio-corner-gaps.md §6.1): absent (the
  // catalogue's), or any of flange / cut / angle as a number of 0 or more.
  const tolerance = shop.tolerance;
  if (
    tolerance !== undefined &&
    (!tolerance ||
      typeof tolerance !== 'object' ||
      Array.isArray(tolerance) ||
      ['flange', 'cut', 'angle'].some(
        (key) => key in tolerance && !(Number.isFinite(tolerance[key]) && tolerance[key] >= 0),
      ))
  )
    throw new Error('Invalid shop settings: the tolerances must be numbers of 0 or more.');
}

// Older saves can retain connections after an instance was deleted. Recover
// only those orphaned links; never guess replacement endpoints or move parts.
export function removeOrphanedConnections(model) {
  const ids = new Set(model.instances.map((instance) => instance.id));
  return {
    ...model,
    connections: model.connections.filter((connection) => ids.has(connection.from) && ids.has(connection.to)),
  };
}

// Groups (docs/sketch-studio-part-groups.md §3.1): a list of unique ids, a
// string name, a parent that is null or another group, no parent cycles, and
// instances that name an existing group or none. A group with fewer than two
// children is not an error here: operations dissolve it (pruneGroups).
function validateGroups(model) {
  const groups = new Map(model.groups.map((group) => [group.id, group]));
  for (const group of model.groups) {
    if (typeof group.name !== 'string') throw new Error(`Invalid group: ${group.id}`);
    if (group.parentId != null && !groups.has(group.parentId))
      throw new Error(`Group ${group.id} names an unknown parent group: ${group.parentId}`);
    const seen = new Set([group.id]);
    for (let parent = group.parentId; parent != null; parent = groups.get(parent)?.parentId) {
      if (seen.has(parent)) throw new Error(`Circular group nesting: ${group.id}`);
      seen.add(parent);
    }
  }
  for (const instance of model.instances)
    if (instance.groupId != null && !groups.has(instance.groupId))
      throw new Error(`Instance ${instance.id} names an unknown group: ${instance.groupId}`);
}

const withoutGroupId = (instance) => {
  const { groupId: _groupId, ...rest } = instance;
  return rest;
};

// Keeps the group invariant (§3.1): every group has at least two children
// (instances plus child groups); a thinner one dissolves and its child moves
// up to the group's parent, repeatedly, so a chain of one-child groups goes at
// once. It also repairs what a hand-edited file can hold, so such a file opens
// instead of being refused: an instance groupId naming no group is dropped, a
// group whose parent is missing (or sits in a parent cycle) becomes top level.
// Returns the same object when nothing changes. Runs on raw saves too (before
// normalizeModel): a missing groups list counts as empty, anything that is not
// a model (null, no instances list, a groups value that is not a list) is
// returned untouched for normalizeModel to judge.
export function pruneGroups(model) {
  if (!model || typeof model !== 'object' || !Array.isArray(model.instances)) return model;
  if (model.groups != null && !Array.isArray(model.groups)) return model;
  const source = model.groups || [];
  if (!source.length && !model.instances.some((i) => i && i.groupId != null)) return model;
  let changed = false;
  let groups = source.map((group) => ({ ...group }));
  let instances = model.instances.map((instance) => ({ ...instance }));
  const byId = () => new Map(groups.map((group) => [group?.id, group]));
  // Repair: parents that are missing or cyclic, instances naming no group.
  let ids = byId();
  for (const group of groups) {
    if (!group || group.parentId == null) continue;
    let cyclic = false;
    const seen = new Set([group.id]);
    for (let parent = group.parentId; parent != null; parent = ids.get(parent)?.parentId) {
      if (!ids.has(parent) || seen.has(parent)) {
        cyclic = true;
        break;
      }
      seen.add(parent);
    }
    if (cyclic) {
      group.parentId = null;
      changed = true;
    }
  }
  instances = instances.map((instance) => {
    if (!instance || instance.groupId == null || ids.has(instance.groupId)) return instance;
    changed = true;
    return withoutGroupId(instance);
  });
  // Dissolve groups with fewer than two children until none is left.
  for (;;) {
    const counts = new Map(groups.map((group) => [group?.id, 0]));
    for (const instance of instances)
      if (instance?.groupId != null) counts.set(instance.groupId, counts.get(instance.groupId) + 1);
    for (const group of groups) if (group?.parentId != null) counts.set(group.parentId, counts.get(group.parentId) + 1);
    const thin = groups.find((group) => group && counts.get(group.id) < 2);
    if (!thin) break;
    changed = true;
    const parent = thin.parentId ?? null;
    groups = groups
      .filter((group) => group !== thin)
      .map((group) => (group?.parentId === thin.id ? { ...group, parentId: parent } : group));
    instances = instances.map((instance) => {
      if (instance?.groupId !== thin.id) return instance;
      return parent == null ? withoutGroupId(instance) : { ...instance, groupId: parent };
    });
    ids = byId();
  }
  if (!changed) return model;
  // Keep untouched records as the same objects.
  return {
    ...model,
    groups: groups.map((group) => {
      const old = source.find((g) => g?.id === group?.id);
      return old && old.parentId === group.parentId ? old : group;
    }),
    instances: instances.map((instance, index) => {
      const old = model.instances[index];
      return old && old.groupId === instance?.groupId ? old : instance;
    }),
  };
}

export function removeInstance(model, id) {
  return pruneGroups({
    ...model,
    instances: model.instances.filter((instance) => instance.id !== id),
    connections: model.connections.filter((connection) => connection.from !== id && connection.to !== id),
    marks: (model.marks || []).filter((mark) => mark.from?.instanceId !== id && mark.to?.instanceId !== id),
    // A finish or a print names its one part.
    ...(model.finishes ? { finishes: model.finishes.filter((f) => f.instanceId !== id) } : {}),
    ...(model.prints ? { prints: model.prints.filter((p) => p.instanceId !== id) } : {}),
    sheets: model.sheets.map((sheet) => ({
      ...sheet,
      ...(sheet.instanceIds ? { instanceIds: sheet.instanceIds.filter((instanceId) => instanceId !== id) } : {}),
      ...(sheet.annotations
        ? { annotations: sheet.annotations.filter((annotation) => annotation.instanceId !== id) }
        : {}),
    })),
  });
}

// Removes a part definition with every instance of it (Phase M.1,
// docs/sketch-studio-remove-part.md §3.1): each instance goes through
// removeInstance (connections, marks, sheet assembly lists, instance-anchored
// annotations), then the part, its part detail sheets and the annotations
// that name it. Refused while another part uses it as a Boolean tool.
export function removePart(model, partId) {
  const part = model.parts.find((p) => p.id === partId);
  if (!part) throw new Error(`Unknown part: ${partId}`);
  for (const other of model.parts) {
    if (other.id === partId) continue;
    const feature = (other.features || []).find((f) => f.toolPartId === partId);
    if (feature)
      throw new Error(
        `"${part.name}" is the Boolean tool of "${other.name}" (${feature.type}); remove that feature first.`,
      );
  }
  const removed = model.instances
    .filter((instance) => instance.partId === partId)
    .reduce((next, instance) => removeInstance(next, instance.id), model);
  return {
    ...removed,
    parts: removed.parts.filter((p) => p.id !== partId),
    sheets: removed.sheets
      .filter((sheet) => sheet.partId !== partId)
      .map((sheet) =>
        sheet.annotations
          ? { ...sheet, annotations: sheet.annotations.filter((annotation) => annotation.partId !== partId) }
          : sheet,
      ),
  };
}

// A sheet-metal part is its blanks on the floor (docs/sketch-studio-cut-pick.md
// §3, RC-1): with none left it is no part, and while its definition stays the
// sketch it is cut from is no outline (Draw and Cut never show it again).
// Any sheet-metal feature makes it one; a part another part uses as a Boolean
// tool is kept (removePart would refuse it).
const isSheetPart = (part) => (part?.features || []).some((f) => f.type === 'sheetmetal');
const isToolPart = (model, partId) =>
  model.parts.some((p) => p.id !== partId && (p.features || []).some((f) => f.toolPartId === partId));
function removeBlanklessSheetParts(model, partIds) {
  return [...partIds].reduce((next, partId) => {
    const part = next.parts.find((p) => p.id === partId);
    if (!isSheetPart(part) || next.instances.some((i) => i.partId === partId) || isToolPart(next, partId)) return next;
    return removePart(next, partId);
  }, model);
}

// Removing instances by hand (RC-1 §3: the Remove buttons): each goes
// through removeInstance, then a sheet-metal part left with no instance goes
// with its drawing sheets (removePart). Every other part keeps its
// definition. One result, so the caller's one commit is one Undo.
export function removeInstances(model, ids) {
  const gone = new Set(ids);
  const touched = new Set(model.instances.filter((i) => gone.has(i.id)).map((i) => i.partId));
  return removeBlanklessSheetParts(
    [...gone].reduce((next, id) => removeInstance(next, id), model),
    touched,
  );
}

// ---------------------------------------------------------------- one piece of metal is one part
// docs/sketch-studio-own-bends.md §3: a sheet-metal part never has two
// instances. A bend is a record on the part, so copies of one part would fold
// together; each blank is its own part, and the blanks of one outline share
// its sketch.

/**
 * A copy of a part (§4.1): a new id, `name`, every other key deep-copied with
 * its feature, bend and mark ids KEPT (ids are only unique inside a part, so
 * connections, `again` and `stroke` hold as they are). `flat`: a blank fresh
 * off the laser — only the sheet-metal feature, with no bends (its marks,
 * base, K-factor, stock, thickness and sketch stay).
 */
export function blankCopy(part, { name = part.name, flat = false } = {}) {
  const copy = { ...clone(part), id: uid('part'), name };
  if (!flat) return copy;
  const sheet = copy.features.find((f) => f?.type === 'sheetmetal');
  return { ...copy, features: sheet ? [{ ...sheet, bends: [] }] : [] };
}
/** A blank's name without its number (§4.1): "Tray #3" → "Tray". */
export const blankBaseName = (name) => String(name ?? '').replace(/ #\d+$/, '');
/** "{base} #k" (§4.1), k the smallest from 2 whose name is not in `taken` (a Set of part names). */
export function blankName(base, taken) {
  let k = 2;
  while (taken.has(`${base} #${k}`)) k += 1;
  return `${base} #${k}`;
}

/**
 * The keeper (§4.1, §4.2): every sheet-metal part with more than one instance
 * keeps its first (model order); each later instance gets a part of its own,
 * bent as the part stands (blankCopy), placed after the part and its earlier
 * copies. Its name: the part's when the instance has a name of its own (the
 * kiosk's "Front face frame" / "Rear face frame"), else the next "{base} #k".
 * A sheet annotation naming a moved instance follows it: on an assembly sheet
 * its `partId` becomes the new part's, on a part sheet its `instanceId`
 * becomes the kept instance's. Nothing else changes: connections, groups,
 * finishes, prints and marks name instances; part sheets and Boolean-tool
 * references stay with the original part. Returns the same object when there
 * is nothing to separate. Runs at every commit and on every load.
 */
export function separateSheetBlanks(model) {
  if (!model || !Array.isArray(model.parts) || !Array.isArray(model.instances)) return model;
  const counts = new Map();
  for (const instance of model.instances) counts.set(instance?.partId, (counts.get(instance?.partId) || 0) + 1);
  const shared = new Map(model.parts.filter((p) => isSheetPart(p) && counts.get(p.id) > 1).map((p) => [p.id, p]));
  if (!shared.size) return model;
  const taken = new Set(model.parts.map((p) => p.name));
  const kept = new Map(); // partId → the instance that keeps the part
  const copies = new Map(); // partId → its new parts, in order
  const moved = new Map(); // instanceId → { partId (the new part), from (the old one) }
  for (const instance of model.instances) {
    const part = shared.get(instance?.partId);
    if (!part) continue;
    if (!kept.has(part.id)) {
      kept.set(part.id, instance.id);
      continue;
    }
    const name = instance.name ? part.name : blankName(blankBaseName(part.name), taken);
    taken.add(name);
    const copy = blankCopy(part, { name });
    copies.set(part.id, [...(copies.get(part.id) || []), copy]);
    moved.set(instance.id, { partId: copy.id, from: part.id });
  }
  return {
    ...model,
    parts: model.parts.flatMap((p) => [p, ...(copies.get(p.id) || [])]),
    instances: model.instances.map((i) => (moved.has(i.id) ? { ...i, partId: moved.get(i.id).partId } : i)),
    ...(Array.isArray(model.sheets)
      ? {
          sheets: model.sheets.map((sheet) => {
            if (!Array.isArray(sheet?.annotations) || !sheet.annotations.some((a) => moved.has(a?.instanceId)))
              return sheet;
            return {
              ...sheet,
              annotations: sheet.annotations.map((a) => {
                const to = moved.get(a?.instanceId);
                if (!to) return a;
                return sheet.partId ? { ...a, instanceId: kept.get(to.from) } : { ...a, partId: to.partId };
              }),
            };
          }),
        }
      : {}),
  };
}

// Drawing sheets (Phase S, docs/sketch-studio-sheet-manager.md §3). A model
// always keeps one sheet (normalizeModel refuses none); callers disable the
// action rather than rely on the throw.
export function removeSheets(model, ids) {
  const gone = new Set(ids);
  const sheets = model.sheets.filter((sheet) => !gone.has(sheet.id));
  if (!sheets.length) throw new Error('Keep at least one drawing sheet.');
  return { ...model, sheets };
}

// A copy right after the original: new sheet and annotation ids, "(copy)"
// within the 65-character title block.
export function duplicateSheet(model, id) {
  const index = model.sheets.findIndex((sheet) => sheet.id === id);
  if (index < 0) throw new Error(`Unknown drawing sheet: ${id}`);
  const source = model.sheets[index];
  const copy = {
    ...clone(source),
    id: uid('sheet'),
    title: `${source.title || 'Sheet'} (copy)`.slice(0, 65),
    ...(source.annotations
      ? { annotations: clone(source.annotations).map((a) => ({ ...a, id: uid('annotation') })) }
      : {}),
  };
  return { ...model, sheets: [...model.sheets.slice(0, index + 1), copy, ...model.sheets.slice(index + 1)] };
}

const viewKind = (entry) => (typeof entry === 'string' ? entry : entry?.view || entry?.name);
// An exploded-assembly sheet: every view is the exploded one.
export const isExplodedSheet = (sheet) =>
  Array.isArray(sheet.views) && sheet.views.length > 0 && sheet.views.every((v) => viewKind(v) === 'exploded');

// A sheet-metal flat-pattern sheet (SM-4): every view is the flat blank.
export const isFlatSheet = (sheet) =>
  Array.isArray(sheet.views) && sheet.views.length > 0 && sheet.views.every((v) => viewKind(v) === 'flat');

// The first plain sheet (no section, not exploded, not a flat pattern)
// drawing this subject: { partId }, { instanceIds } (as a set) or {} (the
// whole assembly).
export function findSheetFor(model, subject = {}) {
  const wanted = subject.partId ? null : new Set(subject.instanceIds || []);
  return (
    model.sheets.find((sheet) => {
      if (sheet.section || isExplodedSheet(sheet) || isFlatSheet(sheet)) return false;
      if (subject.partId) return sheet.partId === subject.partId;
      if (sheet.partId) return false;
      const ids = new Set(sheet.instanceIds || []);
      return ids.size === wanted.size && [...ids].every((id) => wanted.has(id));
    }) || null
  );
}

// Saves made before Phase M.1 can hold a part whose only feature was removed
// or suppressed (the panel allowed both). The kernel refuses to build such a
// part ("has no active solid features"), which fails the whole model, and with
// no solid there is nothing to select, so the file could never be repaired in
// the app. On load those parts go through removePart (instances, marks and
// sheet references with them). Their sketches stay: the profile can be
// extruded again. A part that is still another part's Boolean tool is kept;
// removing it would only move the error. Returns the same object when there
// is nothing to remove.
export function removeEmptyParts(model) {
  return model.parts
    .filter((part) => !(part.features || []).some((f) => !f.suppressed))
    .reduce((next, part) => {
      try {
        return removePart(next, part.id);
      } catch {
        return next;
      }
    }, model);
}

// Saves made before RC-1 (docs/sketch-studio-cut-pick.md §3) can hold a
// sheet-metal part whose last blank was removed: the definition stayed and
// kept its outline out of Draw and Cut. On load it goes (removePart: its
// drawing sheets with it); the sketch stays, so the drawing is back. A part
// that is another part's Boolean tool is kept. Returns the same object when
// there is nothing to remove.
export function removeBlanklessParts(model) {
  return removeBlanklessSheetParts(
    model,
    model.parts.map((p) => p.id),
  );
}

export function resolveParameters(parameters) {
  const values = Object.create(null);
  const visiting = new Set();
  const names = new Map();
  for (const p of parameters) {
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(p.name) || names.has(p.name))
      throw new Error(`Invalid or duplicate parameter: ${p.name}`);
    names.set(p.name, p);
  }
  const resolve = (name) => {
    if (Object.hasOwn(values, name)) return values[name];
    if (!names.has(name)) throw new Error(`Missing parameter: ${name}`);
    if (visiting.has(name)) throw new Error(`Circular parameter relationship: ${name}`);
    visiting.add(name);
    const expression = names.get(name).value;
    if (typeof expression === 'string') {
      for (const dependency of expression.match(/[A-Za-z_][A-Za-z_0-9]*/g) || []) resolve(dependency);
    }
    values[name] = numeric(expression, values);
    visiting.delete(name);
    return values[name];
  };
  for (const name of names.keys()) resolve(name);
  return values;
}

export function numeric(value, parameters = {}, label = 'Dimension') {
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new Error(`${label} must be a number or expression.`);
  const result = typeof value === 'number' ? { value } : evaluateSketchExpression(value, { context: parameters });
  if (result.error || !Number.isFinite(result.value)) throw new Error(`${label}: ${result.error || 'not finite'}`);
  return result.value;
}
export function positive(value, parameters, label = 'Dimension') {
  const n = numeric(value, parameters, label);
  if (n <= 0) throw new Error(`${label} must be greater than zero.`);
  return n;
}
export function vector(value, parameters = {}) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Expected a three-coordinate point or vector.');
  return value.map((v) => numeric(v, parameters));
}

export function rotateVector(point, rotation) {
  let result = [...point];
  rotation.forEach((degrees, axis) => {
    const angle = (degrees * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const [x, y, z] = result;
    result =
      axis === 0
        ? [x, y * c - z * s, y * s + z * c]
        : axis === 1
          ? [x * c + z * s, y, -x * s + z * c]
          : [x * c - y * s, x * s + y * c, z];
  });
  return result;
}

export function resolveSection(section, parameters = {}) {
  if (!section) throw new Error('Member needs a stock section.');
  const s = { type: section.type };
  if (['pipe', 'round-bar'].includes(s.type)) {
    s.diameter = positive(section.diameter, parameters, 'Outside diameter');
    if (s.type === 'pipe') s.wall = positive(section.wall, parameters, 'Wall thickness');
    if (s.wall * 2 >= s.diameter) throw new Error('Wall thickness must leave a hollow section.');
  } else if (['tube', 'bar', 'angle'].includes(s.type)) {
    s.width = positive(section.width, parameters, 'Section width');
    s.height = positive(section.height, parameters, 'Section height');
    if (s.type !== 'bar') s.wall = positive(section.wall, parameters, 'Wall thickness');
    if (s.wall * (s.type === 'tube' ? 2 : 1) >= Math.min(s.width, s.height))
      throw new Error('Wall thickness exceeds the section.');
    // A hot-rolled angle's root and toe radii (Phase P): optional, absent ≡ 0.
    // Only the keys the section has are copied, so an old radius-free angle
    // resolves (and serialises in the cut list) exactly as before.
    if (s.type === 'angle') {
      for (const [key, label] of [
        ['rootRadius', 'Root radius'],
        ['toeRadius', 'Toe radius'],
      ]) {
        if (section[key] == null) continue;
        s[key] = numeric(section[key], parameters, label);
        if (s[key] < 0) throw new Error(`${label} cannot be negative.`);
      }
      const r1 = s.rootRadius || 0,
        r2 = s.toeRadius || 0;
      if (r2 >= s.wall) throw new Error('Toe radius must be less than the thickness.');
      if (r1 + r2 >= Math.min(s.width, s.height) - s.wall)
        throw new Error('Root and toe radii do not fit on the legs.');
    }
  } else throw new Error(`Unknown section: ${s.type}`);
  return s;
}

export function memberMetrics(feature, parameters = {}) {
  const start = vector(feature.start, parameters),
    end = vector(feature.end, parameters);
  const section = resolveSection(feature.section, parameters);
  const gapStart = numeric(feature.gapStart ?? 0, parameters),
    gapEnd = numeric(feature.gapEnd ?? 0, parameters);
  if (gapStart < 0 || gapEnd < 0) throw new Error('Weld gaps cannot be negative.');
  const centerline = Math.hypot(...end.map((v, i) => v - start[i])) - gapStart - gapEnd;
  if (centerline <= 0) throw new Error('Weld gaps consume the member length.');
  const angleStart = numeric(feature.angleStart ?? 0, parameters),
    angleEnd = numeric(feature.angleEnd ?? 0, parameters);
  if (Math.max(Math.abs(angleStart), Math.abs(angleEnd)) >= 80)
    throw new Error('End angles must be less than 80° from square.');
  const span = section.width || section.diameter;
  const extension =
    (span / 2) * (Math.abs(Math.tan((angleStart * Math.PI) / 180)) + Math.abs(Math.tan((angleEnd * Math.PI) / 180)));
  if (centerline - extension <= 0) throw new Error('Mitres intersect inside the member.');
  return {
    section,
    start,
    end,
    centerline,
    longPoint: centerline + extension,
    shortPoint: centerline - extension,
    angleStart,
    angleEnd,
    gapStart,
    gapEnd,
  };
}

// A cut extrusion of one plain circle is a drilled hole as far as drawings
// are concerned (callouts, centre marks, hole chains).
export function isCircularCutFeature(feature, sketches = []) {
  if (feature?.type !== 'extrude' || feature.operation !== 'cut' || feature.suppressed) return false;
  const profile = sketches.find((s) => s.id === feature.sketchId)?.profile;
  return profile?.type === 'circle' && !profile.holes?.length && !profile.offset;
}

export function validateReferences(model) {
  const diagnostics = [];
  const parts = new Map(model.parts.map((p) => [p.id, p]));
  const sketches = new Set(model.sketches.map((s) => s.id));
  const instances = new Set(model.instances.map((i) => i.id));
  for (const part of model.parts) {
    const featureIds = new Set();
    for (const f of part.features || []) {
      if (!f.id || featureIds.has(f.id))
        diagnostics.push({ partId: part.id, featureId: f.id, message: 'Missing or duplicate feature ID.' });
      featureIds.add(f.id);
      if (f.sketchId && !sketches.has(f.sketchId))
        diagnostics.push({ partId: part.id, featureId: f.id, message: `Broken sketch reference: ${f.sketchId}` });
      if (f.toolPartId && !parts.has(f.toolPartId))
        diagnostics.push({ partId: part.id, featureId: f.id, message: `Broken tool reference: ${f.toolPartId}` });
      if (
        f.placement?.type === 'member' &&
        !part.features
          .slice(0, part.features.indexOf(f))
          .some((source) => source.id === f.placement.featureId && source.type === 'member' && !source.suppressed)
      )
        diagnostics.push({
          partId: part.id,
          featureId: f.id,
          message: 'Broken cut reference: choose an earlier, enabled member.',
        });
    }
  }
  for (const i of model.instances)
    if (!parts.has(i.partId)) diagnostics.push({ instanceId: i.id, message: `Broken part reference: ${i.partId}` });
  for (const c of model.connections)
    for (const id of [c.from, c.to])
      if (!instances.has(id)) diagnostics.push({ connectionId: c.id, message: `Broken connection reference: ${id}` });
  for (const sheet of model.sheets) {
    if (sheet.instanceIds && (!Array.isArray(sheet.instanceIds) || sheet.instanceIds.some((id) => !instances.has(id))))
      diagnostics.push({ sheetId: sheet.id, message: 'Broken sheet assembly instance reference.' });
    if (sheet.partId && !parts.has(sheet.partId))
      diagnostics.push({ sheetId: sheet.id, message: `Broken sheet part reference: ${sheet.partId}` });
    for (const a of sheet.annotations || []) {
      if (['hole-chain', 'hole-callout'].includes(a.type)) {
        const part = parts.get(a.partId);
        const ids = a.featureIds || [a.featureId];
        if (
          !part ||
          !ids.length ||
          ids.some(
            (id) =>
              !part.features.some(
                (f) => f.id === id && ((f.type === 'hole' && !f.suppressed) || isCircularCutFeature(f, model.sketches)),
              ),
          )
        )
          diagnostics.push({
            sheetId: sheet.id,
            annotationId: a.id,
            message: 'Broken hole annotation reference: select existing, enabled holes.',
          });
        if (a.instanceId && !model.instances.some((i) => i.id === a.instanceId && i.partId === a.partId))
          diagnostics.push({ sheetId: sheet.id, annotationId: a.id, message: 'Broken annotation instance reference.' });
        if (sheet.partId && sheet.partId !== a.partId)
          diagnostics.push({
            sheetId: sheet.id,
            annotationId: a.id,
            message: 'Annotation belongs to a different sheet subject.',
          });
      }
      if (
        a.partId &&
        (!parts.has(a.partId) ||
          (a.featureId && !parts.get(a.partId).features.some((f) => f.id === a.featureId && !f.suppressed)))
      )
        diagnostics.push({
          sheetId: sheet.id,
          annotationId: a.id,
          message: `Broken annotation reference: ${a.featureId || a.partId}`,
        });
    }
  }
  return diagnostics;
}

// kind: 'board', 'member' (a square tube) or 'angle' (Phase P: an L 50×50×5
// hot-rolled angle bar, the same member feature with an angle section).
export function createPart(kind = 'board') {
  const id = uid('part');
  const member = kind === 'member' || kind === 'angle';
  const feature = member
    ? {
        id: uid('feature'),
        type: 'member',
        start: [0, 0, 0],
        end: [0, 0, 700],
        section:
          kind === 'angle'
            ? { type: 'angle', width: 50, height: 50, wall: 5, rootRadius: 7, toeRadius: 3.5 }
            : { type: 'tube', width: 40, height: 40, wall: 2 },
        gapStart: 0,
        gapEnd: 0,
        angleStart: 0,
        angleEnd: 0,
      }
    : { id: uid('feature'), type: 'box', width: 600, depth: 400, height: 18 };
  return {
    part: {
      id,
      name: kind === 'angle' ? 'Angle bar' : kind === 'member' ? 'Square tube' : 'Board / plate',
      material: member ? 'Steel' : 'Plywood',
      grain: member ? null : 'X',
      features: [feature],
    },
    instance: { id: uid('instance'), partId: id, name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
  };
}

export function profileToPart(entity, options = {}) {
  const sketchId = uid('sketch');
  const profile = draftingProfile(entity);
  const depth = positive(options.depth ?? entity.thickness ?? 18, {}, 'Extrusion depth');
  const created = createPart();
  created.part.name = entity.name || 'Profile part';
  created.part.material = options.material || entity.material || 'Unspecified';
  created.part.features = [{ id: uid('feature'), type: 'extrude', sketchId, length: depth }];
  created.part.sourceEntityIds = options.sourceIds || [entity.id];
  return {
    ...created,
    sketch: { id: sketchId, name: 'Imported profile', plane: 'XY', profile, primitives: [], constrained: false },
  };
}
