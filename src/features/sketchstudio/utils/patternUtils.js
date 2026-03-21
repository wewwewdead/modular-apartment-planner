let nextPatternCounter = 1;

export function createPatternDefinition({
  id,
  sourceId,
  sourceType = 'part',
  count = 2,
  spacing = 100,
  axis = 'x',
  startOffset = 0,
  name = '',
} = {}) {
  return {
    id: id || `pattern-${nextPatternCounter++}`,
    sourceId: sourceId || null,
    sourceType,
    count: Math.max(1, Math.round(Number(count) || 1)),
    spacing: Number(spacing) || 100,
    axis: axis === 'y' || axis === 'z' ? axis : 'x',
    startOffset: Number(startOffset) || 0,
    name: name || '',
  };
}

function offsetOrigin(origin, axis, offset) {
  if (!origin) return { x: 0, y: 0, z: 0 };
  return {
    x: origin.x + (axis === 'x' ? offset : 0),
    y: origin.y + (axis === 'y' ? offset : 0),
    z: origin.z + (axis === 'z' ? offset : 0),
  };
}

function offsetPoint(point, axis, offset) {
  if (!point) return point;
  return {
    x: (point.x || 0) + (axis === 'x' ? offset : 0),
    y: (point.y || 0) + (axis === 'y' ? offset : 0),
    ...(point.z !== undefined ? { z: (point.z || 0) + (axis === 'z' ? offset : 0) } : {}),
  };
}

export function expandPartPattern(sourcePart, pattern) {
  if (!sourcePart || !pattern) return [];

  const copies = [];
  for (let i = 1; i < pattern.count; i += 1) {
    const offset = pattern.startOffset + pattern.spacing * i;
    const origin = sourcePart.parametric?.origin
      ? offsetOrigin(sourcePart.parametric.origin, pattern.axis, offset)
      : undefined;
    const anchor = sourcePart.parametric?.anchor
      ? offsetPoint(sourcePart.parametric.anchor, pattern.axis, offset)
      : undefined;

    copies.push({
      ...sourcePart,
      id: `${sourcePart.id}-pattern-${pattern.id}-${i}`,
      name: `${sourcePart.name} (${i + 1})`,
      parametric: sourcePart.parametric ? {
        ...sourcePart.parametric,
        origin: origin || sourcePart.parametric.origin,
        anchor: anchor || sourcePart.parametric.anchor,
      } : sourcePart.parametric,
      metadata: {
        ...(sourcePart.metadata || {}),
        patternGenerated: true,
        patternId: pattern.id,
        patternIndex: i,
      },
    });
  }
  return copies;
}

export function expandFeaturePattern(sourceFeature, pattern) {
  if (!sourceFeature || !pattern) return [];

  const copies = [];
  for (let i = 1; i < pattern.count; i += 1) {
    const offset = pattern.startOffset + pattern.spacing * i;
    const axisX = pattern.axis === 'x' ? offset : 0;
    const axisY = pattern.axis === 'y' ? offset : 0;

    const copy = { ...sourceFeature };
    copy.id = `${sourceFeature.id}-pattern-${pattern.id}-${i}`;
    if (sourceFeature.shape === 'circle') {
      copy.cx = (sourceFeature.cx || 0) + axisX;
      copy.cy = (sourceFeature.cy || 0) + axisY;
    } else {
      copy.x = (sourceFeature.x || 0) + axisX;
      copy.y = (sourceFeature.y || 0) + axisY;
    }
    copy.metadata = {
      ...(sourceFeature.metadata || {}),
      patternGenerated: true,
      patternId: pattern.id,
      patternIndex: i,
    };
    copies.push(copy);
  }
  return copies;
}

export function applyPatterns(objectDraft, patterns = []) {
  if (!patterns.length) return objectDraft;

  // Remove old pattern instances
  let nextParts = (objectDraft.parts || []).filter(
    (part) => !part.metadata?.patternGenerated,
  );
  let nextFeatures = (objectDraft.features || []).filter(
    (feature) => !feature.metadata?.patternGenerated,
  );

  patterns.forEach((pattern) => {
    if (pattern.sourceType === 'part') {
      const source = nextParts.find((p) => p.id === pattern.sourceId);
      if (source) {
        nextParts = [...nextParts, ...expandPartPattern(source, pattern)];
      }
    } else if (pattern.sourceType === 'feature') {
      const source = nextFeatures.find((f) => f.id === pattern.sourceId);
      if (source) {
        nextFeatures = [...nextFeatures, ...expandFeaturePattern(source, pattern)];
      }
    }
  });

  return { ...objectDraft, parts: nextParts, features: nextFeatures };
}

export function validatePattern(pattern, objectDraft) {
  const errors = [];

  if (!pattern.sourceId) {
    errors.push('Source ID is required');
  }

  if (pattern.count < 1) {
    errors.push('Count must be at least 1');
  }

  if (pattern.sourceType === 'part') {
    const source = (objectDraft.parts || []).find((p) => p.id === pattern.sourceId);
    if (!source) {
      errors.push(`Source part "${pattern.sourceId}" not found`);
    }
  } else if (pattern.sourceType === 'feature') {
    const source = (objectDraft.features || []).find((f) => f.id === pattern.sourceId);
    if (!source) {
      errors.push(`Source feature "${pattern.sourceId}" not found`);
    }
  }

  return { valid: errors.length === 0, errors };
}
