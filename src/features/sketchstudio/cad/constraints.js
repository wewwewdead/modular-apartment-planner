import { clone, numeric, resolveParameters, uid } from './model.js';

export function enableConstraints(sketch, parameters) {
  const next = clone(sketch),
    profile = next.profile,
    values = resolveParameters(parameters);
  if (next.primitives?.length) {
    if (profile.pointIds)
      profile.pointIds.forEach((id, index) => {
        const point = next.primitives.find((p) => p.id === id);
        if (point) {
          point.x = numeric(profile.points[index][0], values);
          point.y = numeric(profile.points[index][1], values);
        }
      });
    if (profile.circleId) {
      const circle = next.primitives.find((p) => p.id === profile.circleId);
      if (circle) {
        circle.radius = numeric(profile.radius, values);
        const center = next.primitives.find((p) => p.id === circle.c_id);
        if (center) {
          center.x = numeric(profile.center[0], values);
          center.y = numeric(profile.center[1], values);
        }
      }
    }
    return { ...next, constrained: true };
  }
  if (profile.type === 'circle') {
    const center = {
      id: uid('point'),
      type: 'point',
      x: numeric(profile.center?.[0] || 0, values),
      y: numeric(profile.center?.[1] || 0, values),
      fixed: false,
    };
    const circle = { id: uid('circle'), type: 'circle', c_id: center.id, radius: numeric(profile.radius, values) };
    next.primitives = [center, circle];
    next.profile.circleId = circle.id;
  } else {
    let points = profile.points;
    if (profile.type === 'rectangle') {
      const x = numeric(profile.origin?.[0] || 0, values),
        y = numeric(profile.origin?.[1] || 0, values),
        w = numeric(profile.width, values),
        h = numeric(profile.height, values);
      points = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
    }
    if (!points)
      throw new Error(
        'Use polygon or circle profiles for interactive constraints. Path constraints can be entered using primitive bindings.',
      );
    const primitives = points.map(([x, y]) => ({
      id: uid('point'),
      type: 'point',
      x: numeric(x, values),
      y: numeric(y, values),
      fixed: false,
    }));
    const lines = primitives.map((p, i) => ({
      id: uid('line'),
      type: 'line',
      p1_id: p.id,
      p2_id: primitives[(i + 1) % primitives.length].id,
    }));
    next.primitives = [...primitives, ...lines];
    next.profile = { ...profile, type: 'polygon', points, pointIds: primitives.map((p) => p.id) };
  }
  next.constrained = true;
  return next;
}

export const CONSTRAINT_TYPES = {
  coincident: {
    type: 'p2p_coincident',
    fields: [
      ['p1_id', 'point'],
      ['p2_id', 'point'],
    ],
  },
  horizontal: { type: 'horizontal_l', fields: [['l_id', 'line']] },
  vertical: { type: 'vertical_l', fields: [['l_id', 'line']] },
  parallel: {
    type: 'parallel',
    fields: [
      ['l1_id', 'line'],
      ['l2_id', 'line'],
    ],
  },
  perpendicular: {
    type: 'perpendicular_ll',
    fields: [
      ['l1_id', 'line'],
      ['l2_id', 'line'],
    ],
  },
  tangent: {
    type: 'tangent_lc',
    fields: [
      ['l_id', 'line'],
      ['c_id', 'circle'],
    ],
  },
  equal: {
    type: 'equal_length',
    fields: [
      ['l1_id', 'line'],
      ['l2_id', 'line'],
    ],
  },
  fixed: { type: 'fixed', fields: [['p_id', 'point']] },
  distance: {
    type: 'p2p_distance',
    fields: [
      ['p1_id', 'point'],
      ['p2_id', 'point'],
    ],
    value: 'distance',
  },
  radius: { type: 'circle_radius', fields: [['c_id', 'circle']], value: 'radius' },
  angle: {
    type: 'l2l_angle_ll',
    fields: [
      ['l1_id', 'line'],
      ['l2_id', 'line'],
    ],
    value: 'angle',
  },
};

export function addConstraint(sketch, type, references, value = 0) {
  const spec = CONSTRAINT_TYPES[type];
  const next = clone(sketch),
    constraint = { id: uid('constraint'), type: spec.type };
  for (const [field, geometry] of spec.fields) {
    if (!next.primitives.some((p) => p.id === references[field] && p.type === geometry))
      throw new Error(`Choose a ${geometry} for ${field}.`);
    constraint[field] = references[field];
  }
  if (type === 'fixed') next.primitives.find((p) => p.id === references.p_id).fixed = true;
  else {
    if (spec.value) constraint[spec.value] = type === 'angle' ? `=(${value})*3.141592653589793/180` : value;
    next.primitives.push(constraint);
  }
  return next;
}
