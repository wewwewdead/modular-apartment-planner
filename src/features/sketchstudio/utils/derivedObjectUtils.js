import { buildExportAnchorPayload, computeAnchorFromBounds, createDefaultAnchor, setPrimaryAnchor } from './anchorUtils';
import { buildObjectBom, groupBomRows } from './bomUtils';
import { applyConstraints } from './constraintUtils';
import { computeGenericObjectBounds, computeGenericObjectFootprint } from './genericObjectUtils';
import { normalizeObjectDraft } from './objectNormalization';
import { applyPatterns } from './patternUtils';
import { computeObjectBounds, computePartBounds, computeObjectFootprint } from './objectUtils';

function buildBoundsFromFootprint(footprint) {
  if (!footprint?.points?.length) {
    return null;
  }

  const bounds = footprint.points.reduce((accumulator, point) => ({
    minX: Math.min(accumulator.minX, point.x),
    minY: Math.min(accumulator.minY, point.y),
    maxX: Math.max(accumulator.maxX, point.x),
    maxY: Math.max(accumulator.maxY, point.y),
  }), {
    minX: footprint.points[0].x,
    minY: footprint.points[0].y,
    maxX: footprint.points[0].x,
    maxY: footprint.points[0].y,
  });

  return {
    ...bounds,
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxY - bounds.minY,
  };
}

function computePartPlanBounds(part, entities = []) {
  const parametric = part?.parametric;
  if (parametric?.origin && parametric?.extents) {
    return {
      minX: parametric.origin.x,
      minY: parametric.origin.y,
      maxX: parametric.origin.x + (Number(parametric.extents.width) || 0),
      maxY: parametric.origin.y + (Number(parametric.extents.depth) || 0),
      width: Number(parametric.extents.width) || 0,
      depth: Number(parametric.extents.depth) || 0,
    };
  }

  return computePartBounds(entities, part?.profileEntityIds || []);
}

export function recomputeObjectBoundsFromParts(objectDraft, entities = []) {
  return computeGenericObjectBounds(objectDraft, entities)
    || computeObjectBounds(entities, objectDraft?.bounds?.height || 900)
    || objectDraft?.bounds
    || null;
}

export function recomputeObjectFootprintFromParts(objectDraft, entities = []) {
  return computeGenericObjectFootprint(objectDraft, entities)
    || computeObjectFootprint(entities)
    || objectDraft?.footprint
    || null;
}

export function suggestPrimaryAnchorFromObject(objectDraft) {
  const footprintBounds = buildBoundsFromFootprint(objectDraft?.footprint);
  if (!footprintBounds) {
    return { x: 0, y: 0, name: 'origin', kind: 'primary' };
  }

  return createDefaultAnchor(footprintBounds);
}

function reconcileAnchors(objectDraft) {
  const footprintBounds = buildBoundsFromFootprint(objectDraft.footprint);
  if (!footprintBounds) {
    return objectDraft.anchors || [];
  }

  const suggestedOrigin = createDefaultAnchor(footprintBounds);
  const suggestedCenter = computeAnchorFromBounds(footprintBounds, 'center');
  const suggestedFrontLeft = computeAnchorFromBounds(footprintBounds, 'front-left');
  const suggestedByName = new Map([
    [suggestedOrigin.name, suggestedOrigin],
    [suggestedCenter.name, suggestedCenter],
    [suggestedFrontLeft.name, suggestedFrontLeft],
  ]);
  const existingAnchors = objectDraft.anchors || [];

  if (!existingAnchors.length) {
    return setPrimaryAnchor([suggestedOrigin, suggestedCenter, suggestedFrontLeft], suggestedOrigin.id);
  }

  return existingAnchors.map((anchor) => {
    const suggestion = suggestedByName.get(anchor.name);
    return suggestion
      ? { ...anchor, x: suggestion.x, y: suggestion.y }
      : anchor;
  });
}

export function recomputeObjectDraftDerivedData(objectDraft, entities = []) {
  if (!objectDraft?.id) {
    return objectDraft;
  }

  const draft = normalizeObjectDraft(objectDraft);
  const footprint = recomputeObjectFootprintFromParts(draft, entities) || draft.footprint;
  const nextDraft = {
    ...draft,
    footprint,
    bounds: {
      ...draft.bounds,
      ...(recomputeObjectBoundsFromParts({ ...draft, footprint }, entities) || {}),
    },
  };
  // Apply constraints then patterns before BOM
  const { draft: constrained } = applyConstraints(nextDraft, nextDraft.constraints || []);
  const patterned = applyPatterns(constrained, constrained.patterns || []);
  const nextAnchors = reconcileAnchors(patterned);
  const bomRows = buildObjectBom(patterned);

  return {
    ...patterned,
    anchors: nextAnchors,
    activeAnchorId: nextDraft.activeAnchorId || nextAnchors.find((anchor) => anchor.kind === 'primary')?.id || nextAnchors[0]?.id || null,
    anchor: buildExportAnchorPayload({ anchors: nextAnchors }),
    bom: {
      rows: bomRows,
      groupedRows: groupBomRows(bomRows),
    },
  };
}
