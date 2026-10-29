import { clone, createPart, uid, memberMetrics, resolveParameters } from './model.js';
import { mapPlacement } from './placement.js';

export const PROFILE_OPERATIONS = ['extrude', 'revolve', 'sweep', 'loft'];
export const GUIDED_OPERATIONS = [
  ...PROFILE_OPERATIONS,
  'union',
  'subtract',
  'intersect',
  'fillet',
  'chamfer',
  'shell',
  'mirror',
  'pattern',
  'trim',
  'transform',
];
export const OPERATION_HELP = {
  extrude:
    'Extend a closed profile along its sketch-plane normal. Choose Add, Cut, Intersect or Replace and inspect the preview.',
  revolve:
    'Rotate a closed profile around an axis in its plane. Keep the profile on one side of the axis to avoid self-intersections.',
  sweep:
    'Move a closed cross section along a different path sketch. The cross section is centered on the path; tight bends may self-intersect.',
  loft: 'Join two or more closed section sketches in order. Put sections on different planes or at different origins.',
  union:
    'Combine this part with another part definition. Tool placement is relative to this part, independent of assembly placement.',
  subtract:
    'Remove the overlapping volume of another part definition. Position the tool so it intersects the material.',
  intersect: 'Keep only the volume shared by this part and the tool. The preview must contain solid material.',
  fillet:
    'Round the matching edges. Start with a small radius on thin walls; geometry limits the maximum usable radius.',
  chamfer: 'Bevel the matching edges. Start with a small distance on thin walls.',
  shell:
    'Remove the matching planar faces and offset the remaining walls. Check thickness and direction in the preview; an already hollow tube may not support this operation.',
  mirror:
    'Replace this part with its reflection across the chosen plane. Duplicate its assembly instance first if you want to retain an independent original.',
  pattern:
    'Make copies inside this part definition. Count includes the original; linear spacing or circular angle applies between consecutive copies.',
  trim: 'Split the part at a plane and retain one side. Positive keeps the side toward the normal arrow; negative keeps the opposite side.',
  transform: 'Translate or rotate the geometry inside the part definition. All assembly instances update.',
};
export const isClosedProfile = (s) => Boolean(s?.profile && !(s.profile.type === 'path' && s.profile.closed === false));
const sketch = (name, profile, plane = 'XY', origin = [0, 0, 0]) => ({
  id: uid('sketch'),
  name,
  profile,
  plane,
  origin,
  constrained: false,
  primitives: [],
});

// Copy the actual hollow section for a square-ended member, rather than
// closing a pipe with a filled rectangle. This is an explicit independent sketch.
function memberEndSketch(part, parameters) {
  const enabled = part.features.filter((f) => !f.suppressed);
  const source = enabled[0];
  if (
    source?.type !== 'member' ||
    enabled.slice(1).some((f) => !['hole', 'pocket', 'fillet', 'chamfer'].includes(f.type))
  )
    return null;
  const m = memberMetrics(source, parameters),
    s = m.section;
  if (m.angleEnd !== 0) return null;
  const delta = m.end.map((x, i) => x - m.start[i]),
    length = Math.hypot(...delta),
    normal = delta.map((x) => x / length);
  const axis = [-normal[1], normal[0], 0];
  const rotation =
    Math.hypot(...axis) > 1e-9
      ? [{ axis, angle: (Math.acos(Math.max(-1, Math.min(1, normal[2]))) * 180) / Math.PI, origin: [0, 0, 0] }]
      : normal[2] < 0
        ? [{ axis: [1, 0, 0], angle: 180, origin: [0, 0, 0] }]
        : [];
  let profile;
  if (s.diameter)
    profile = {
      type: 'circle',
      radius: s.diameter / 2,
      center: [0, 0],
      ...(s.wall ? { holes: [{ type: 'circle', radius: s.diameter / 2 - s.wall, center: [0, 0] }] } : {}),
    };
  else if (s.type === 'angle') return null;
  else
    profile = {
      type: 'rectangle',
      width: s.width,
      height: s.height,
      origin: [-s.width / 2, -s.height / 2],
      ...(s.wall
        ? {
            holes: [
              {
                type: 'rectangle',
                width: s.width - s.wall * 2,
                height: s.height - s.wall * 2,
                origin: [-s.width / 2 + s.wall, -s.height / 2 + s.wall],
              },
            ],
          }
        : {}),
    };
  return {
    ...sketch(
      'Copied member section',
      profile,
      'custom',
      m.end.map((x, i) => x - normal[i] * m.gapEnd),
    ),
    normal,
    xDirection: mapPlacement([1, 0, 0], rotation, true),
  };
}

export function createOperationDraft({
  type,
  model,
  partId,
  selectedSketchId,
  bounds,
  references = [],
  existingFeature,
}) {
  let part = model.parts.find((p) => p.id === partId),
    newPart = null,
    newInstance = null;
  if (!part) {
    if (!PROFILE_OPERATIONS.includes(type)) throw new Error('Select a part to modify first.');
    const created = createPart();
    part = { ...created.part, name: `${type[0].toUpperCase() + type.slice(1)} part`, features: [] };
    newPart = part;
    newInstance = created.instance;
  }
  const draft = {
    baseModel: model,
    partId: part.id,
    newPart,
    newInstance,
    sketches: [],
    references,
    editing: Boolean(existingFeature),
  };
  if (existingFeature)
    return {
      ...draft,
      feature: {
        ...(PROFILE_OPERATIONS.includes(type) ? { operation: 'add' } : {}),
        ...(type === 'pattern' ? { angle: 90, axis: [0, 0, 1], origin: [0, 0, 0], step: [100, 0, 0] } : {}),
        ...clone(existingFeature),
      },
    };
  const box = bounds || [
      [0, 0, 0],
      [40, 40, 40],
    ],
    center = box[0].map((x, i) => (x + box[1][i]) / 2);
  const size = box[0].map((x, i) => Math.max(1, box[1][i] - x));
  const closed = model.sketches.filter(isClosedProfile);
  const chosen = closed.find((s) => s.id === selectedSketchId);
  const addSketch = (s) => {
    draft.sketches.push(s);
    return s.id;
  };
  const feature = { id: uid('feature'), type };
  if (PROFILE_OPERATIONS.includes(type)) feature.operation = 'add';
  if (type === 'extrude') {
    const memberProfile = !newPart && !chosen ? memberEndSketch(part, resolveParameters(model.parameters)) : null;
    feature.sketchId =
      chosen?.id ||
      (memberProfile
        ? addSketch(memberProfile)
        : addSketch(
            sketch(
              'Extrusion profile',
              {
                type: 'rectangle',
                width: Math.min(100, size[0]),
                height: Math.min(80, size[1]),
                origin: [-Math.min(100, size[0]) / 2, -Math.min(80, size[1]) / 2],
              },
              'XY',
              newPart ? [0, 0, 0] : [center[0], center[1], box[1][2]],
            ),
          ));
    feature.length = 18;
  } else if (type === 'revolve') {
    feature.sketchId =
      chosen?.id ||
      addSketch(sketch('Revolve profile', { type: 'rectangle', width: 10, height: 40, origin: [10, 0] }, 'XZ'));
    feature.axis = chosen?.plane === 'XY' ? [0, 1, 0] : [0, 0, 1];
    feature.origin = chosen?.origin || [0, 0, 0];
    feature.angle = 360;
  } else if (type === 'sweep') {
    const path = model.sketches.find(
      (s) => s.id === selectedSketchId && s.profile.type === 'path' && s.profile.closed === false,
    );
    feature.sketchId =
      path?.id ||
      addSketch(
        sketch('Sweep path', {
          type: 'path',
          start: [0, 0],
          segments: [{ type: 'line', end: [100, 0] }],
          closed: false,
        }),
      );
    feature.profileId =
      chosen?.id || addSketch(sketch('Sweep cross section', { type: 'circle', radius: 5, center: [0, 0] }));
  } else if (type === 'loft') {
    feature.sketchId = chosen?.id || addSketch(sketch('Loft start', { type: 'circle', radius: 20, center: [0, 0] }));
    const end = chosen ? closed.find((s) => s.id !== feature.sketchId) : null;
    feature.sections = [
      end?.id || addSketch(sketch('Loft end', { type: 'circle', radius: 30, center: [0, 0] }, 'XY', [0, 0, 100])),
    ];
    feature.ruled = false;
  } else if (['union', 'subtract', 'intersect'].includes(type)) {
    feature.toolPartId = model.parts.find((p) => p.id !== part.id)?.id || '';
    feature.position = [0, 0, 0];
    feature.rotation = [0, 0, 0];
  } else if (['fillet', 'chamfer', 'shell'].includes(type)) {
    const kind = type === 'shell' ? 'faces' : 'edges';
    const option = references.find((r) => r.label.startsWith('Top') && r[kind]) || references.find((r) => r[kind]);
    feature.reference = option
      ? { plane: option.plane, offset: option.offset, expectedCount: option[kind] }
      : { plane: 'XY', offset: box[1][2], expectedCount: 1 };
    if (type === 'shell') feature.thickness = 1;
    else feature.radius = Math.min(0.5, Math.min(...size) / 20);
  } else if (type === 'mirror') {
    feature.plane = 'YZ';
    feature.origin = [0, 0, 0];
  } else if (type === 'pattern')
    Object.assign(feature, {
      count: 3,
      step: [size[0] + 10, 0, 0],
      circular: false,
      angle: 90,
      axis: [0, 0, 1],
      origin: [0, 0, 0],
    });
  else if (type === 'trim') Object.assign(feature, { origin: center, normal: [0, 0, 1], side: 'negative' });
  else if (type === 'transform') Object.assign(feature, { position: [0, 0, 0], rotation: [0, 0, 0] });
  else throw new Error(`Unknown operation: ${type}`);
  return { ...draft, feature };
}

export function operationModel(draft) {
  const source = draft.baseModel;
  const used = new Set([draft.feature.sketchId, draft.feature.profileId, ...(draft.feature.sections || [])]);
  const sketches = draft.sketches.filter((s) => used.has(s.id));
  return {
    ...source,
    sketches: [...source.sketches.filter((s) => !sketches.some((next) => next.id === s.id)), ...sketches],
    parts: [...source.parts, ...(draft.newPart ? [draft.newPart] : [])].map((p) =>
      p.id !== draft.partId
        ? p
        : {
            ...p,
            features: draft.editing
              ? p.features.map((f) => (f.id === draft.feature.id ? draft.feature : f))
              : [...p.features, draft.feature],
          },
    ),
    instances: [...source.instances, ...(draft.newInstance ? [draft.newInstance] : [])],
  };
}

export function operationProblem(feature, model, partId) {
  const closed = (id) => isClosedProfile(model.sketches.find((s) => s.id === id));
  if (['extrude', 'revolve'].includes(feature.type) && !closed(feature.sketchId))
    return 'Choose a closed profile or create one below.';
  if (
    feature.type === 'sweep' &&
    (!closed(feature.profileId) ||
      !model.sketches.some((s) => s.id === feature.sketchId) ||
      feature.sketchId === feature.profileId)
  )
    return 'Choose two different sketches: a path and a closed cross section.';
  if (
    feature.type === 'loft' &&
    (!feature.sections?.length ||
      ![feature.sketchId, ...feature.sections].every(closed) ||
      new Set([feature.sketchId, ...feature.sections]).size !== feature.sections.length + 1)
  )
    return 'Loft needs two or more different closed section sketches.';
  if (
    ['union', 'subtract', 'intersect'].includes(feature.type) &&
    (!feature.toolPartId || feature.toolPartId === partId || !model.parts.some((p) => p.id === feature.toolPartId))
  )
    return 'Choose another part as the Boolean tool. Add a board, member or solid part first if needed.';
  return '';
}
