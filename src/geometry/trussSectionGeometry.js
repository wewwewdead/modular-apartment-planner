import { projectSectionLine, sectionCutIntervals } from '@/sections/geometry';
import { buildEndClosureLayout, closureFootprint, closureLocalX, closureTopAt } from '@/truss/endClosures';
import { buildTrussSystemGeometry } from './trussGeometry';
import { projectPointToSectionCut, sectionCutLength, sectionCutPointAtAlong } from './sectionCutGeometry';
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

/**
 * Where the cut crosses a gable-end closure (RT-2): the closure's thin plan
 * footprint is cut like a wall, a band from the bearing up to the closure's top
 * edge at each side of the crossing.
 */
function buildClosureSectionElements(trussSystem, systemGeometry, roofSystem, sectionCut) {
  const polygonElements = [];
  for (const closure of buildEndClosureLayout(trussSystem, systemGeometry, roofSystem).closures) {
    sectionCutIntervals(sectionCut, closureFootprint(closure)).forEach((interval, index) => {
      const topAt = (along) =>
        closure.baseElevation +
        closureTopAt(
          closure,
          Math.min(closure.length, Math.max(0, closureLocalX(closure, sectionCutPointAtAlong(sectionCut, along)))),
        );
      polygonElements.push({
        id: `closure-${closure.id}-cut-${index}`,
        category: 'gableInfill',
        sourceId: trussSystem.id,
        renderMode: 'cut',
        depth: 0,
        points: [
          { x: interval.left, z: topAt(interval.left) },
          { x: interval.right, z: topAt(interval.right) },
          { x: interval.right, z: closure.baseElevation },
          { x: interval.left, z: closure.baseElevation },
        ],
      });
    });
  }
  return polygonElements;
}

export function buildTrussSectionElements(trussSystems = [], sectionCut, roofSystem = null) {
  if (!sectionCut) {
    return {
      lineElements: [],
      polygonElements: [],
      diagnostics: createDiagnostics(false, SECTION_VISIBILITY_REASONS.NO_GEOMETRY, 0),
    };
  }

  const maxLength = sectionCutLength(sectionCut);
  const lineElements = [];
  const polygonElements = [];
  let hasGeometry = false;
  let hasLengthOverlap = false;
  let hasDepthOverlap = false;

  for (const trussSystem of trussSystems) {
    const systemGeometry = buildTrussSystemGeometry(trussSystem);
    polygonElements.push(...buildClosureSectionElements(trussSystem, systemGeometry, roofSystem, sectionCut));

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

          const element = projectSectionLine(sectionCut, member.startWorld, member.endWorld, {
            id: `section-truss-${copy.id}-${member.id}`,
            category: 'truss',
            sourceId: instanceGeometry.instance.id,
          });
          if (element) lineElements.push(element);
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

        const element = projectSectionLine(sectionCut, segment.startWorld, segment.endWorld, {
          id: `section-purlin-${segment.id}`,
          category: 'truss',
          sourceId: instanceGeometry.instance.id,
        });
        if (element) lineElements.push(element);
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

  return { lineElements, polygonElements, diagnostics };
}
