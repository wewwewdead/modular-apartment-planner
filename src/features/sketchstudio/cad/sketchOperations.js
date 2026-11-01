import { createPart, uid } from './model.js';
import { entitiesToProfile, profileToEntities } from './sketchProfile.js';
import {
  frameToInstance,
  frameToSketchFields,
  sketchConsumer,
  sketchWorldFrame,
  toPlane,
  toWorld,
  unmapFrame,
} from './sketchPlane.js';

// Model sketch entry for a finished in-viewport sketch. A new sketch is stored
// in world coordinates on its frame; an edited one keeps its stored plane
// (it may already be in a part's coordinates), only the drawing changes.
export function sketchFromSession({ session, entities, existing, name }) {
  const { profile, problems, closed } = entitiesToProfile(entities);
  if (!profile) throw new Error(problems[0] || 'Draw a closed outline first.');
  if (existing)
    return {
      sketch: { ...existing, profile, entities, primitives: existing.primitives || [], constrained: false },
      problems,
      closed,
    };
  return {
    sketch: {
      id: uid('sketch'),
      name,
      ...frameToSketchFields(session.frame),
      profile,
      entities,
      support: session.support,
      primitives: [],
      constrained: false,
    },
    problems,
    closed,
  };
}

// Strip undefined plane fields so JSON stays tidy.
const clean = (sketch) => Object.fromEntries(Object.entries(sketch).filter(([, value]) => value !== undefined));

// Build a guided-operation draft (see operations.js) that extrudes or cuts a
// finished sketch:
//  - target 'new': a new part whose sketch is moved to the part's own XY plane
//    at its origin, and an instance whose pose is the sketch frame — so the
//    profile lands exactly where it was drawn, and the part definition stays
//    a clean board drawn on XY (flat-pack export, drawings, cut lists).
//  - target <instance id>: the sketch is re-expressed in that instance's part
//    coordinates (inverse of its kernel placement) and the feature is added
//    to the part definition (join = 'add', cut = 'cut').
// A sketch already used by another part is copied, never moved.
export function sketchOperationDraft({ model, snapshot, sketchId, settings, ids = {} }) {
  const source = model.sketches.find((s) => s.id === sketchId);
  if (!source) throw new Error('The sketch no longer exists.');
  const { mode = 'extrude', target = 'new', distance = 18, reverse = false, throughAll = false } = settings;
  if (mode === 'cut' && target === 'new') throw new Error('Choose the part to cut.');
  const { frame } = sketchWorldFrame(model, snapshot, source);
  const consumed = Boolean(sketchConsumer(model, source.id));
  const sketchCopyId = consumed ? ids.sketchCopyId || uid('sketch') : source.id;
  const feature = {
    id: ids.featureId || uid('feature'),
    type: 'extrude',
    operation: mode === 'cut' ? 'cut' : 'add',
    sketchId: sketchCopyId,
    length: distance,
    reverse: Boolean(reverse),
    ...(mode === 'cut' ? { throughAll: Boolean(throughAll) } : {}),
  };
  const base = {
    ...source,
    id: sketchCopyId,
    ...(consumed ? { name: `${source.name} (copy)` } : {}),
  };
  const draft = {
    baseModel: model,
    references: [],
    editing: false,
    feature,
    sketchFlow: {
      sketchId,
      mode,
      target,
      distance,
      reverse,
      throughAll,
      name: settings.name,
      ids: { ...ids },
      // Direct placement: drag-direction inference (off once Operation is
      // chosen by hand) and the target to return to when a drag leaves a cut.
      inferOperation: settings.inferOperation !== false,
      baseTarget: settings.baseTarget,
    },
  };
  if (target === 'new') {
    const created = createPart();
    const part = {
      ...created.part,
      id: ids.partId || created.part.id,
      name: String(settings.name || '').trim() || nextPartName(model),
      features: [],
    };
    const instance = {
      ...created.instance,
      id: ids.instanceId || created.instance.id,
      partId: part.id,
      ...frameToInstance(frame),
    };
    Object.assign(draft.sketchFlow.ids, { partId: part.id, instanceId: instance.id });
    draft.sketchFlow.ids.featureId = feature.id;
    draft.sketchFlow.ids.sketchCopyId = consumed ? sketchCopyId : undefined;
    return {
      ...draft,
      partId: part.id,
      newPart: part,
      newInstance: instance,
      sketches: [clean({ ...base, plane: 'XY', origin: [0, 0, 0], normal: undefined, xDirection: undefined })],
    };
  }
  const instance = model.instances.find((i) => i.id === target);
  if (!instance) throw new Error('The target part instance no longer exists.');
  const placement = snapshot?.instances.find((i) => i.id === target)?.placement;
  if (!placement) throw new Error('Rebuild the model before joining or cutting.');
  const local = unmapFrame(frame, placement);
  draft.sketchFlow.ids.featureId = feature.id;
  draft.sketchFlow.ids.sketchCopyId = consumed ? sketchCopyId : undefined;
  return {
    ...draft,
    partId: instance.partId,
    newPart: null,
    newInstance: null,
    sketches: [clean({ ...base, ...frameToSketchFields(local) })],
  };
}

// "Part 3": the first free "Part N" name, editable before applying.
export function nextPartName(model) {
  const names = new Set(model.parts.map((p) => p.name));
  let n = model.parts.length + 1;
  while (names.has(`Part ${n}`)) n++;
  return `Part ${n}`;
}

// Default operation settings after a sketch is finished. A cut runs toward
// the target's material: for a face sketch that is against the outward face
// normal; for a plane sketch it is whichever side holds the part's centre.
export function defaultSketchSettings({ model, snapshot, sketch, mode, selectedId }) {
  if (mode !== 'cut')
    return {
      mode: 'extrude',
      target: 'new',
      distance: 18,
      reverse: false,
      throughAll: false,
      name: nextPartName(model),
    };
  const support = sketch?.support?.type === 'face' ? sketch.support.instanceId : null;
  const existing = (id) => id && model.instances.some((i) => i.id === id);
  const target = [support, selectedId, model.instances[0]?.id].find(existing) || 'new';
  let reverse = true;
  const bounds = snapshot?.instances.find((i) => i.id === target)?.bounds;
  if (bounds && sketch)
    try {
      const { frame } = sketchWorldFrame(model, snapshot, sketch);
      const center = bounds[0].map((value, i) => (value + bounds[1][i]) / 2);
      reverse = center.reduce((sum, value, i) => sum + (value - frame.origin[i]) * frame.normal[i], 0) < 0;
    } catch {
      /* keep the face default */
    }
  return { mode, target, distance: 10, reverse, throughAll: true };
}

// Entities to reopen a sketch with. Stored entities are used only while they
// still produce the stored profile; a profile edited elsewhere (JSON, the
// profile fields) is converted back instead. null = not editable in 3D.
export function editableEntities(sketch) {
  if (sketch.entities?.length) {
    const rebuilt = entitiesToProfile(sketch.entities).profile;
    if (rebuilt && JSON.stringify(rebuilt) === JSON.stringify(sketch.profile)) return sketch.entities;
  }
  return profileToEntities(sketch.profile);
}

export function sketchEditProblem(sketch) {
  if (sketch.constrained)
    return 'This sketch is driven by PlaneGCS constraints. Edit it with the constraint fields below.';
  if (!editableEntities(sketch))
    return 'This profile uses parameter expressions, splines or offsets, which the 3D sketcher would freeze. Edit it with the profile fields below.';
  return '';
}

export function sketchPlaneText(model, sketch) {
  const consumer = sketchConsumer(model, sketch.id);
  const where = consumer ? ` · in ${consumer.part.name} coordinates` : ' · world coordinates';
  const fmt = (values) =>
    (values || [0, 0, 0]).map((value) => (typeof value === 'number' ? Number(value.toFixed(3)) : value)).join(', ');
  if (sketch.normal) return `Plane through (${fmt(sketch.origin)}), normal (${fmt(sketch.normal)})${where}`;
  return `${sketch.plane || 'XY'} plane, origin (${fmt(sketch.origin)})${where}`;
}

// Remove duplicate plane segments (the face outline and the model edges
// usually describe the same lines).
export function mergeSegments(segments) {
  const seen = new Set();
  return segments.filter(([a, b]) => {
    const key = [a, b]
      .map((p) => p.map((value) => value.toFixed(3)).join(','))
      .sort()
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Camera target, grid extent and span for a sketch: the face outline when
// there is one, otherwise the model's bounds projected on the plane, always
// including the sketch origin.
export function sketchView(frame, boundary = [], snapshot = null) {
  const points = [[0, 0], ...boundary.flat()];
  if (boundary.length === 0)
    for (const instance of snapshot?.instances || []) {
      const [min, max] = instance.bounds || [];
      if (!min) continue;
      for (const x of [min[0], max[0]])
        for (const y of [min[1], max[1]])
          for (const z of [min[2], max[2]]) points.push(toPlane(frame, [x, y, z]).slice(0, 2));
    }
  const us = points.map((p) => p[0]),
    vs = points.map((p) => p[1]);
  const center = [(Math.min(...us) + Math.max(...us)) / 2, (Math.min(...vs) + Math.max(...vs)) / 2];
  const size = Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs), 200);
  const span = size * 1.35;
  return {
    span,
    // Roughly what the camera shows; geometry beyond it triggers a refit.
    visible: [
      [center[0] - span / 2, center[1] - span / 2],
      [center[0] + span / 2, center[1] + span / 2],
    ],
    gridBounds: [
      [center[0] - span, center[1] - span],
      [center[0] + span, center[1] + span],
    ],
    focus: { position: toWorld(frame, center), normal: frame.normal, up: frame.y, span },
  };
}
