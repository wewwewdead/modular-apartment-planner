export function createDefaultAnchor(bounds, overrides = {}) {
  return {
    id: overrides.id || 'anchor-origin',
    name: overrides.name || 'origin',
    x: bounds?.minX ?? 0,
    y: bounds?.minY ?? 0,
    kind: overrides.kind || 'primary',
  };
}

export function computeAnchorFromBounds(bounds, kind = 'origin') {
  if (!bounds) {
    return createDefaultAnchor(null, { name: kind, id: `anchor-${kind}` });
  }

  if (kind === 'center') {
    return {
      id: 'anchor-center',
      name: 'center',
      x: bounds.minX + ((bounds.maxX - bounds.minX) / 2),
      y: bounds.minY + ((bounds.maxY - bounds.minY) / 2),
      kind: 'secondary',
    };
  }

  if (kind === 'front-left') {
    return {
      id: 'anchor-front-left',
      name: 'front-left',
      x: bounds.minX,
      y: bounds.maxY,
      kind: 'secondary',
    };
  }

  return createDefaultAnchor(bounds, { name: kind, id: `anchor-${kind}` });
}

export function setPrimaryAnchor(anchors = [], anchorId) {
  return anchors.map((anchor) => ({
    ...anchor,
    kind: anchor.id === anchorId ? 'primary' : anchor.kind === 'primary' ? 'secondary' : anchor.kind,
  }));
}

export function moveAnchor(anchors = [], anchorId, point) {
  return anchors.map((anchor) => (
    anchor.id === anchorId
      ? {
          ...anchor,
          x: point.x,
          y: point.y,
        }
      : anchor
  ));
}

export function buildExportAnchorPayload(objectDraft) {
  const primaryAnchor = (objectDraft?.anchors || []).find((anchor) => anchor.kind === 'primary');
  const sourceAnchor = primaryAnchor || objectDraft?.anchors?.[0] || objectDraft?.anchor || { x: 0, y: 0 };

  return {
    x: Number(sourceAnchor.x) || 0,
    y: Number(sourceAnchor.y) || 0,
    name: sourceAnchor.name || 'origin',
    kind: sourceAnchor.kind || 'primary',
  };
}
