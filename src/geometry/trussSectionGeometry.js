import { buildTrussSystemGeometry } from './trussGeometry';
import { projectPointToSectionCut, sectionCutLength } from './sectionCutGeometry';
import { SECTION_VISIBILITY_REASONS } from '@/sections/diagnostics';

const EPSILON = 1e-6;

function intersectsSectionDepth(startOffset, endOffset, depthLimit) {
  const minOffset = Math.min(startOffset, endOffset);
  const maxOffset = Math.max(startOffset, endOffset);
  return !(maxOffset < -EPSILON || minOffset > depthLimit + EPSILON);
}

function overlapsSectionLength(startAlong, endAlong, maxLength) {
  const minAlong = Math.min(startAlong, endAlong);
  const maxAlong = Math.max(startAlong, endAlong);
  return !(maxAlong < -EPSILON || minAlong > maxLength + EPSILON);
}

function createDiagnostics(visible, reason, elementCount = 0) {
  return {
    visible,
    reason,
    elementCount,
  };
}

export function buildTrussSectionElements(trussSystems = [], sectionCut) {
  if (!sectionCut) {
    return {
      lineElements: [],
      diagnostics: createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0),
    };
  }

  const maxLength = sectionCutLength(sectionCut);
  const lineElements = [];
  let hasGeometry = false;
  let hasLengthOverlap = false;
  let hasDepthOverlap = false;

  for (const trussSystem of trussSystems) {
    const systemGeometry = buildTrussSystemGeometry(trussSystem);

    for (const instanceGeometry of systemGeometry.instances) {
      for (const copy of instanceGeometry.copies) {
        for (const member of copy.members) {
          hasGeometry = true;
          const projectedStart = projectPointToSectionCut(sectionCut, member.startWorld);
          const projectedEnd = projectPointToSectionCut(sectionCut, member.endWorld);
          const depthOverlap = intersectsSectionDepth(projectedStart.offset, projectedEnd.offset, sectionCut.depth);
          const lengthOverlap = overlapsSectionLength(projectedStart.along, projectedEnd.along, maxLength);
          if (lengthOverlap) hasLengthOverlap = true;
          if (depthOverlap) hasDepthOverlap = true;
          if (!depthOverlap) {
            continue;
          }
          if (!lengthOverlap) {
            continue;
          }

          const renderMode = (
            Math.abs(projectedStart.offset) <= EPSILON
            || Math.abs(projectedEnd.offset) <= EPSILON
            || (projectedStart.offset < 0 && projectedEnd.offset > 0)
            || (projectedStart.offset > 0 && projectedEnd.offset < 0)
          )
            ? 'cut'
            : 'projection';

          lineElements.push({
            id: `section-truss-${copy.id}-${member.id}`,
            category: 'truss',
            renderMode,
            depth: Math.max(0, (projectedStart.offset + projectedEnd.offset) / 2),
            sourceId: instanceGeometry.instance.id,
            points: [
              { x: projectedStart.along, z: member.startWorld.elevation },
              { x: projectedEnd.along, z: member.endWorld.elevation },
            ],
          });
        }
      }

      for (const segment of instanceGeometry.purlinSegments || []) {
        hasGeometry = true;
        const projectedStart = projectPointToSectionCut(sectionCut, segment.startWorld);
        const projectedEnd = projectPointToSectionCut(sectionCut, segment.endWorld);
        const depthOverlap = intersectsSectionDepth(projectedStart.offset, projectedEnd.offset, sectionCut.depth);
        const lengthOverlap = overlapsSectionLength(projectedStart.along, projectedEnd.along, maxLength);
        if (lengthOverlap) hasLengthOverlap = true;
        if (depthOverlap) hasDepthOverlap = true;
        if (!depthOverlap) {
          continue;
        }
        if (!lengthOverlap) {
          continue;
        }

        const renderMode = (
          Math.abs(projectedStart.offset) <= EPSILON
          || Math.abs(projectedEnd.offset) <= EPSILON
          || (projectedStart.offset < 0 && projectedEnd.offset > 0)
          || (projectedStart.offset > 0 && projectedEnd.offset < 0)
        )
          ? 'cut'
          : 'projection';

        lineElements.push({
          id: `section-purlin-${segment.id}`,
          category: 'truss',
          renderMode,
          depth: Math.max(0, (projectedStart.offset + projectedEnd.offset) / 2),
          sourceId: instanceGeometry.instance.id,
          points: [
            { x: projectedStart.along, z: segment.startWorld.elevation },
            { x: projectedEnd.along, z: segment.endWorld.elevation },
          ],
        });
      }
    }
  }

  let diagnostics = createDiagnostics(true, SECTION_VISIBILITY_REASONS.OK, lineElements.length);
  if (!lineElements.length) {
    if (!hasGeometry) {
      diagnostics = createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0);
    } else if (!hasLengthOverlap) {
      diagnostics = createDiagnostics(false, SECTION_VISIBILITY_REASONS.MISSES_CUT, 0);
    } else if (!hasDepthOverlap) {
      diagnostics = createDiagnostics(false, SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION, 0);
    } else {
      diagnostics = createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0);
    }
  }

  return { lineElements, diagnostics };
}
