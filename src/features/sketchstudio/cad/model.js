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
    sheets: [
      {
        id: 'assembly-sheet',
        title: 'Assembly',
        size: 'A3',
        units: 'mm',
        scale: 0.05,
        revision: 'A',
        tolerance: '±0.5 mm',
        views: ['front', 'top', 'right', 'isometric'],
        annotations: [],
      },
    ],
    fabrication: { ...DEFAULT_FABRICATION },
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

// CAD lives beside legacy entities. No old profile is implicitly made into a solid.
export function normalizeModel(value) {
  if (value == null) return emptyModel();
  if (typeof value !== 'object' || Array.isArray(value) || value.version !== CAD_VERSION)
    throw new Error('Unsupported solid-model schema.');
  const defaults = emptyModel();
  const result = { ...defaults, ...value, fabrication: { ...DEFAULT_FABRICATION, ...value.fabrication } };
  for (const key of ['parameters', 'sketches', 'parts', 'instances', 'connections', 'sheets', 'marks']) {
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
  for (const instance of result.instances) {
    if (
      typeof instance.partId !== 'string' ||
      (instance.position && (!Array.isArray(instance.position) || instance.position.length !== 3)) ||
      (instance.rotation && (!Array.isArray(instance.rotation) || instance.rotation.length !== 3))
    )
      throw new Error(`Invalid assembly instance: ${instance.id}`);
  }
  // Marks on a part that no longer exists are not an error here: they are
  // simply not drawn.
  for (const mark of result.marks)
    if (!markAnchor(mark.from) || !markAnchor(mark.to) || !MARK_ALONG.includes(mark.along) || !finite3(mark.offset))
      throw new Error(`Invalid mark: ${mark.id}`);
  if (!result.sheets.length) throw new Error('Keep at least one drawing sheet.');
  for (const sheet of result.sheets)
    if (!Array.isArray(sheet.views) || !sheet.views.length || (sheet.annotations && !Array.isArray(sheet.annotations)))
      throw new Error(`Invalid drawing sheet: ${sheet.id}`);
  return result;
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

export function removeInstance(model, id) {
  return {
    ...model,
    instances: model.instances.filter((instance) => instance.id !== id),
    connections: model.connections.filter((connection) => connection.from !== id && connection.to !== id),
    marks: (model.marks || []).filter((mark) => mark.from?.instanceId !== id && mark.to?.instanceId !== id),
    sheets: model.sheets.map((sheet) => ({
      ...sheet,
      ...(sheet.instanceIds ? { instanceIds: sheet.instanceIds.filter((instanceId) => instanceId !== id) } : {}),
      ...(sheet.annotations
        ? { annotations: sheet.annotations.filter((annotation) => annotation.instanceId !== id) }
        : {}),
    })),
  };
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

export function createPart(kind = 'board') {
  const id = uid('part');
  const feature =
    kind === 'member'
      ? {
          id: uid('feature'),
          type: 'member',
          start: [0, 0, 0],
          end: [0, 0, 700],
          section: { type: 'tube', width: 40, height: 40, wall: 2 },
          gapStart: 0,
          gapEnd: 0,
          angleStart: 0,
          angleEnd: 0,
        }
      : { id: uid('feature'), type: 'box', width: 600, depth: 400, height: 18 };
  return {
    part: {
      id,
      name: kind === 'member' ? 'Square tube' : 'Board / plate',
      material: kind === 'member' ? 'Steel' : 'Plywood',
      grain: kind === 'member' ? null : 'X',
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
