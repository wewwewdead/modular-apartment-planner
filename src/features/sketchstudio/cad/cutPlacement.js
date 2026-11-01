import { memberMetrics, numeric, positive, vector, uid } from './model.js';
import { mapPlacement } from './placement.js';

export const CUT_SIDES = {
  front: { axis: 1, sign: -1, width: [1, 0, 0] },
  rear: { axis: 1, sign: 1, width: [-1, 0, 0] },
  left: { axis: 0, sign: -1, width: [0, -1, 0] },
  right: { axis: 0, sign: 1, width: [0, 1, 0] },
  top: { axis: 2, sign: 1, width: [1, 0, 0] },
  bottom: { axis: 2, sign: -1, width: [1, 0, 0] },
};
const normalize = (value) => {
  const length = Math.hypot(...value);
  if (length < 1e-10) throw new Error('Cut direction must be nonzero.');
  return value.map((x) => x / length);
};
const percent = (value, parameters) => {
  const result = numeric(value, parameters);
  if (result < 0 || result > 100) throw new Error('Surface position must be between 0 and 100 percent.');
  return result / 100;
};

// The rectangle axis the kernel uses for a cut along `direction` (unit):
// X projected square to the direction, or Y when the cut runs (nearly) along
// X. A pocket's width runs along it, its height along direction × it.
export function cutWidthDirection(direction) {
  const reference = Math.abs(direction[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dot = reference.reduce((sum, x, i) => sum + x * direction[i], 0);
  return normalize(reference.map((x, i) => x - dot * direction[i]));
}

// A member's own frame in part coordinates: its start, unit axis (start →
// end) and the rotation taking member-local axes (section x, y; length z)
// onto the part's.
export function memberFrame(member, parameters = {}) {
  const metrics = memberMetrics(member, parameters);
  const axis = normalize(metrics.end.map((x, i) => x - metrics.start[i]));
  const rotationAxis = [-axis[1], axis[0], 0];
  const rotation =
    Math.hypot(...rotationAxis) > 1e-9
      ? [
          {
            axis: rotationAxis,
            angle: (Math.acos(Math.max(-1, Math.min(1, axis[2]))) * 180) / Math.PI,
            origin: [0, 0, 0],
          },
        ]
      : axis[2] < 0
        ? [{ axis: [1, 0, 0], angle: 180, origin: [0, 0, 0] }]
        : [];
  return { start: metrics.start, axis, rotation, metrics };
}

const roundTo = (value, step = 1e-6) => {
  const out = Math.round(value / step) * step;
  const fixed = Number(out.toFixed(6));
  return Object.is(fixed, -0) || Math.abs(fixed) < step ? 0 : fixed;
};
// The member placement that drills radially at a clicked point on a round
// member (a point on its surface, part coordinates): the side whose axis the
// point lies most along, the offset across that side and the distance from
// the finished start (mm). Fed back through resolveCutPlacement it lands on
// the point (on the true surface) with a radial inward direction.
export function memberPlacementFromPoint(member, pointLocal, parameters = {}) {
  const { start, axis, rotation, metrics } = memberFrame(member, parameters);
  if (!metrics.section.diameter) throw new Error('Pick a flat face, or a round tube to drill radially.');
  const fromStart = pointLocal.map((x, i) => x - start[i]);
  const t = fromStart.reduce((sum, x, i) => sum + x * axis[i], 0);
  let distance = t - metrics.gapStart;
  if (distance < -0.5 || distance > metrics.centerline + 0.5)
    throw new Error('Click on the finished length of the member.');
  distance = Math.max(0, Math.min(metrics.centerline, distance));
  const radial = fromStart.map((x, i) => x - t * axis[i]);
  const inverse = [...rotation].reverse().map((op) => ({ ...op, angle: -op.angle }));
  const r = mapPlacement(radial, inverse, true);
  const sides = { front: -r[1], rear: r[1], left: -r[0], right: r[0] };
  const side = Object.keys(sides).reduce((best, key) => (sides[key] > sides[best] ? key : best), 'front');
  const offset = CUT_SIDES[side].width.reduce((sum, w, i) => sum + w * r[i], 0);
  return { type: 'member', featureId: member.id, side, distance: roundTo(distance), offset: roundTo(offset) };
}

// Positions belong to the part definition, before assembly translation/rotation.
// A member reference is resolved afresh on every rebuild, including end gaps.
export function resolveCutPlacement(feature, previousFeatures, bounds, parameters = {}) {
  const placement = feature.placement;
  let position, direction, widthDirection;
  if (placement?.type === 'member') {
    const sourceIndex = previousFeatures.findIndex(
      (f) => f.id === placement.featureId && !f.suppressed && f.type === 'member',
    );
    if (sourceIndex < 0) throw new Error('Broken cut reference: choose an earlier, enabled member.');
    if (
      previousFeatures
        .slice(sourceIndex + 1)
        .some((f) => !f.suppressed && ['transform', 'mirror', 'pattern'].includes(f.type))
    )
      throw new Error(
        'Member reference changed after a transform or pattern. Choose a part side or explicit coordinates.',
      );
    const { rotation, metrics: member } = memberFrame(previousFeatures[sourceIndex], parameters);
    const section = member.section;
    const side = CUT_SIDES[placement.side];
    if (!side || side.axis === 2) throw new Error('Choose a member side: front, rear, left or right.');
    const distance =
      placement.distance != null
        ? numeric(placement.distance, parameters)
        : member.centerline * percent(placement.along ?? 50, parameters);
    if (distance < 0 || distance > member.centerline)
      throw new Error('Cut position must be within the finished member length.');
    const offset = numeric(placement.offset ?? 0, parameters);
    const local = side.width.map((x) => x * offset);
    if (section.diameter) {
      const radius = section.diameter / 2;
      if (Math.abs(offset) >= radius) throw new Error('Cut offset must be inside the pipe radius.');
      local[side.axis] = side.sign * Math.sqrt(radius * radius - offset * offset);
      // Drill radially into a round member at the true analytic surface.
      direction = normalize([-local[0], -local[1], 0]);
      widthDirection = normalize([direction[1], -direction[0], 0]);
    } else {
      const half = (side.axis === 0 ? section.width : section.height) / 2;
      local[side.axis] = side.sign * half;
      direction = [0, 0, 0];
      direction[side.axis] = -side.sign;
      widthDirection = side.width;
    }
    local[2] = distance + member.gapStart;
    position = mapPlacement(local, rotation).map((x, i) => x + member.start[i]);
    direction = mapPlacement(direction, rotation, true);
    widthDirection = mapPlacement(widthDirection, rotation, true);
  } else if (placement?.type === 'side') {
    const side = CUT_SIDES[placement.side];
    if (!side || !bounds) throw new Error('Choose a valid part side.');
    const fractions =
      placement.units === 'mm'
        ? [numeric(placement.u, parameters), numeric(placement.v, parameters)]
        : [percent(placement.u ?? 50, parameters), percent(placement.v ?? 50, parameters)];
    let index = 0;
    position = bounds[0].map((min, axis) =>
      axis === side.axis
        ? bounds[side.sign > 0 ? 1 : 0][axis]
        : min + (placement.units === 'mm' ? 1 : bounds[1][axis] - min) * fractions[index++],
    );
    if (position.some((v, i) => v < bounds[0][i] - 1e-6 || v > bounds[1][i] + 1e-6))
      throw new Error('Edge distances must lie within the part side.');
    direction = [0, 0, 0];
    direction[side.axis] = -side.sign;
    widthDirection = side.width;
  } else {
    position = vector(feature.position || [0, 0, 0], parameters);
    direction = normalize(vector(feature.direction || [0, 0, 1], parameters));
    widthDirection = cutWidthDirection(direction);
  }
  let depth = feature.throughAll ? 0 : positive(feature.depth, parameters, 'Cut depth');
  if (feature.throughAll) {
    const farthest = direction.reduce((sum, d, i) => sum + (bounds[d >= 0 ? 1 : 0][i] - position[i]) * d, 0);
    if (farthest <= 0) throw new Error('Cut points away from the part. Choose another side or reverse the direction.');
    depth = farthest + 0.01;
  }
  return { position, direction, widthDirection, depth, throughAll: Boolean(feature.throughAll) };
}

// Holes in one row (Phase K, docs/sketch-studio-hole-row.md §4): the kernel's cap.
export const ROW_MAX_COUNT = 100;
export const ROW_COUNT_ERROR = `Holes in a row must be a whole number from 1 to ${ROW_MAX_COUNT}.`;
export const ROW_DIRECTION_ERROR = 'Row direction must lie in the face of the first hole.';

// A hole row (feature.row = { count, pitch, direction }, part coordinates)
// resolved against the feature's resolved cut: every centre of the row, the
// first one the cut itself. null for a feature without a row. Count 1 is a
// single hole (an expression may evaluate to it); the direction is projected
// square to the cut direction, so it always lies in the face of the first
// hole. The kernel, the ghost, the snap candidates, Move holes and the
// drawings all take their centres from here.
export function resolveRow(feature, cut, parameters = {}) {
  const row = feature?.row;
  if (!row) return null;
  const count = numeric(row.count, parameters, 'Holes in a row');
  if (!Number.isInteger(count) || count < 1 || count > ROW_MAX_COUNT) throw new Error(ROW_COUNT_ERROR);
  if (count === 1) return { count, pitch: null, direction: null, centres: [[...cut.position]] };
  const pitch = positive(row.pitch, parameters, 'Row spacing');
  const raw = vector(row.direction, parameters);
  const n = cut.direction;
  const along = raw.reduce((sum, x, i) => sum + x * n[i], 0);
  const projected = raw.map((x, i) => x - along * n[i]);
  if (Math.hypot(...projected) < 1e-6) throw new Error(ROW_DIRECTION_ERROR);
  const direction = normalize(projected);
  const centres = Array.from({ length: count }, (_, k) => cut.position.map((x, i) => x + direction[i] * pitch * k));
  return { count, pitch, direction, centres };
}

// Snap in the picked surface's tangent plane, so rounding never moves the
// starting point off an angled face. Values are stored in part coordinates.
export function snapCutPoint(point, normal, step = 0, origin = [0, 0, 0]) {
  const n = normalize(normal);
  const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const u = normalize(ref.map((v, i) => v - n[i] * dot(ref, n)));
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const delta = point.map((p, i) => p - origin[i]);
  const snap = (x) => (step > 0 ? Math.round(x / step) * step : x);
  const a = snap(dot(delta, u)),
    b = snap(dot(delta, v)),
    c = dot(delta, n);
  return origin.map((p, i) => p + u[i] * a + v[i] * b + n[i] * c);
}

export function positionedCut(feature, position, direction) {
  if (feature.positionLocked) throw new Error('Unlock the hole position before moving it.');
  return { ...feature, placement: undefined, position, direction };
}

export function createCutFeature(type, part, parameters = {}) {
  const enabled = part.features.filter((f) => !f.suppressed);
  const member = enabled.find((f) => f.type === 'member');
  const supported = member && !enabled.some((f) => ['transform', 'mirror', 'pattern'].includes(f.type));
  const section = supported ? memberMetrics(member, parameters).section : null;
  const span = section ? Math.min(section.width || section.diameter, section.height || section.diameter) : 40;
  return {
    id: uid('feature'),
    type,
    ...(type === 'hole'
      ? { diameter: Math.min(6, span / 4) }
      : { shape: 'rectangle', width: Math.min(12, span / 3), height: 20 }),
    depth: type === 'pocket' ? Math.min(5, (section?.wall || 10) / 2) : section?.wall || 5,
    throughAll: type === 'hole',
    placement: supported
      ? { type: 'member', featureId: member.id, side: 'front', along: 50, offset: 0 }
      : { type: 'side', side: 'top', u: 50, v: 50 },
  };
}
