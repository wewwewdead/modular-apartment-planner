/**
 * Shared test helpers for per-type joint tests.
 */

export function createMockContext(overrides = {}) {
  return {
    overlap: { start: 0, end: 100, length: 100, center: 50 },
    sourceThickness: 18,
    targetThickness: 18,
    minThickness: 18,
    sourcePart: { id: 'part-a', type: 'rect', x: 0, y: 0, width: 200, height: 100, rotation: 0, layerId: 'default' },
    targetPart: { id: 'part-b', type: 'rect', x: 200, y: 0, width: 200, height: 100, rotation: 0, layerId: 'default' },
    sourceEdge: {
      edgeKey: 'right',
      start: 0,
      end: 100,
      length: 100,
      tangent: { x: 0, y: 1 },
      inwardNormal: { x: -1, y: 0 },
      outwardNormal: { x: 1, y: 0 },
      startPoint: { x: 200, y: 0 },
      endPoint: { x: 200, y: 100 },
      midpoint: { x: 200, y: 50 },
    },
    targetEdge: {
      edgeKey: 'left',
      start: 0,
      end: 100,
      length: 100,
      tangent: { x: 0, y: 1 },
      inwardNormal: { x: 1, y: 0 },
      outwardNormal: { x: -1, y: 0 },
      startPoint: { x: 200, y: 0 },
      endPoint: { x: 200, y: 100 },
      midpoint: { x: 200, y: 50 },
    },
    contactKind: 'touch',
    penetrationDepth: null,
    fabricationReady: true,
    missingThicknessPartIds: [],
    ...overrides,
  };
}

export function createMockJoint(type, overrides = {}) {
  return {
    id: 'joint-test',
    type,
    sourcePartId: 'part-a',
    targetPartId: 'part-b',
    enabled: true,
    tolerance: { clearance: 0.2, fit: 'standard' },
    parameters: {},
    ...overrides,
  };
}

/**
 * Stubs for validation helpers passed as the 4th arg to validate().
 */
export const validationHelpers = {
  validatePositiveDimension(parameters, key, label, reasons) {
    if (!(Number(parameters?.[key]) > 0)) {
      reasons.push(`${label} must be a positive value.`);
    }
  },
  getWidthOffsetState(context, parameters) {
    if (!context?.overlap) return null;
    const baseWidth = Math.min(Math.max(Number(parameters?.width) || 0, 0.5), context.overlap.length);
    const effectiveWidth = baseWidth + (Number(parameters?.offset) || 0);
    return { insetOverlap: context.overlap, baseWidth, effectiveWidth, center: context.overlap.center };
  },
  getFemaleAllowanceState(joint, context, parameters) {
    if (!context?.overlap) return null;
    const baseWidth = Math.min(Math.max(Number(parameters?.width) || 0, 0.5), context.overlap.length);
    const femaleWidth = baseWidth + (Number(parameters?.offset) || 0) + (Number(joint?.tolerance?.clearance) || 0);
    return { insetOverlap: context.overlap, baseWidth, femaleWidth, center: context.overlap.center };
  },
  buildRepeatedPatternResult(context, parameters, widthKey) {
    const count = parameters?.count || 0;
    const width = parameters?.[widthKey] || 0;
    if (count < 1 || width <= 0) return { error: 'Invalid pattern.' };
    const total =
      count * width + Math.max(0, count - 1) * (parameters?.spacing || 0) + (parameters?.edgeOffset || 0) * 2;
    if (total > (context?.overlap?.length || 0) + 0.5) return { error: 'Pattern does not fit.' };
    return {};
  },
};

/**
 * Stubs for geometry helpers passed as the 3rd arg to buildGeometry().
 */
export const geometryHelpers = {
  buildOccupiedRegions(joint, partId, edgeKey, intervals) {
    return intervals.map((iv) => ({ jointId: joint.id, partId, edgeKey, start: iv.start, end: iv.end }));
  },
  createRectFeatureEntity(joint, part, role, edge, interval, depth, opKind, fabState, index = 0) {
    return { id: `feature-${joint.id}-${opKind}-${index}`, type: 'feature', shape: 'rect' };
  },
  createCircleFeatureEntity(joint, part, role, center, diameter, depth, opKind, fabState, index = 0) {
    return { id: `feature-${joint.id}-${opKind}-${index}`, type: 'feature', shape: 'circle' };
  },
  buildWidthOffsetInterval(context, parameters) {
    if (!context?.overlap) return null;
    const width = Math.min(Number(parameters?.width) || 0, context.overlap.length);
    if (width <= 0) return null;
    const center = context.overlap.center + (Number(parameters?.offset) || 0);
    return { start: center - width / 2, end: center + width / 2, length: width, center };
  },
  buildFemaleClearanceIntervals(joint, context) {
    if (!context?.overlap) return { nominalInterval: null, femaleInterval: null };
    const width = Math.min(Number(joint.parameters?.width) || 0, context.overlap.length);
    if (width <= 0) return { nominalInterval: null, femaleInterval: null };
    const center = context.overlap.center;
    const nominalInterval = { start: center - width / 2, end: center + width / 2, length: width, center };
    const clearance = Number(joint.tolerance?.clearance) || 0;
    const femaleWidth = width + clearance;
    const femaleInterval = {
      start: center - femaleWidth / 2,
      end: center + femaleWidth / 2,
      length: femaleWidth,
      center,
    };
    return { nominalInterval, femaleInterval };
  },
  buildComplementIntervals(overlap, retainedIntervals) {
    // Simplified: return intervals outside the retained ones
    if (!retainedIntervals?.length) return [overlap];
    const results = [];
    let cursor = overlap.start;
    retainedIntervals.forEach((iv) => {
      if (iv.start > cursor)
        results.push({ start: cursor, end: iv.start, length: iv.start - cursor, center: (cursor + iv.start) / 2 });
      cursor = iv.end;
    });
    if (cursor < overlap.end)
      results.push({
        start: cursor,
        end: overlap.end,
        length: overlap.end - cursor,
        center: (cursor + overlap.end) / 2,
      });
    return results;
  },
  buildRepeatedIntervals(context, parameters, widthKey) {
    const count = parameters?.count || 0;
    const width = parameters?.[widthKey] || 0;
    if (count < 1 || width <= 0 || !context?.overlap) return null;
    const intervals = [];
    let cursor = (parameters?.edgeOffset || 0) + context.overlap.start;
    for (let i = 0; i < count; i++) {
      intervals.push({ start: cursor, end: cursor + width, length: width, center: cursor + width / 2 });
      cursor += width + (parameters?.spacing || 0);
    }
    return intervals;
  },
  buildRepeatedEdgeIntervalsRaw(overlap, options) {
    const count = options?.count || 0;
    const width = options?.width || 0;
    if (count < 1 || width <= 0 || !overlap) return null;
    const intervals = [];
    let cursor = (options?.edgeOffset || 0) + overlap.start;
    for (let i = 0; i < count; i++) {
      intervals.push({ start: cursor, end: cursor + width, length: width, center: cursor + width / 2 });
      cursor += width + (options?.spacing || 0);
    }
    return intervals;
  },
  buildHoleCenters(edge, intervals, inwardDistance) {
    return intervals.map((iv) => ({ x: edge.startPoint.x, y: iv.center }));
  },
  getJointFabricationState(context) {
    return { fabricationReady: context?.fabricationReady !== false, previewOnly: context?.fabricationReady === false };
  },
  shrinkInterval(interval, clearance = 0) {
    const half = Math.max(0, clearance) / 2;
    return { ...interval, start: interval.start + half, end: interval.end - half, length: interval.length - clearance };
  },
  expandInterval(interval, clearance = 0, overlap = null) {
    const half = Math.max(0, clearance) / 2;
    const start = overlap ? Math.max(overlap.start, interval.start - half) : interval.start - half;
    const end = overlap ? Math.min(overlap.end, interval.end + half) : interval.end + half;
    return { ...interval, start, end, length: end - start };
  },
};
