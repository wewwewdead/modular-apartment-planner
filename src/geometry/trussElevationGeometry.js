import { projectElevationDepth, projectElevationEdge, projectElevationHorizontal } from '@/elevations/projection';
import { buildEndClosureLayout, closurePlanPoint } from '@/truss/endClosures';
import { buildTrussSystemGeometry } from './trussGeometry';

// The infill sits a hair behind the end truss drawn on its own plane, so the
// members always draw over it rather than tying on depth (spec §6.2: the
// closure goes down before the truss lines). The vent outline sits a hair in
// front of the infill.
const CLOSURE_DEPTH_NUDGE = 0.5;

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function projectElevationPoint(view, worldPoint) {
  return {
    x: projectElevationHorizontal(view, worldPoint),
    z: worldPoint.elevation,
  };
}

function getCopyDepth(view, copy) {
  return average([
    projectElevationDepth(view, copy.overallStartPoint),
    projectElevationDepth(view, copy.overallEndPoint),
  ]);
}

function getSegmentDepth(view, startWorld, endWorld) {
  return average([projectElevationDepth(view, startWorld), projectElevationDepth(view, endWorld)]);
}

function pickRepresentativeCopy(instanceGeometry, view) {
  return (instanceGeometry?.copies || []).reduce((closest, copy) => {
    if (!closest) return copy;
    return getCopyDepth(view, copy) < getCopyDepth(view, closest) ? copy : closest;
  }, null);
}

/**
 * Gable-end closures facing the viewer: a filled polygon per built closure on
 * its own plane (category `gableInfill`), its vent as an outline. A closure
 * seen edge-on projects to nothing and is skipped.
 */
function buildClosureElevationElements(trussSystem, systemGeometry, roofSystem, view) {
  const polygonElements = [];
  const lineElements = [];
  for (const closure of buildEndClosureLayout(trussSystem, systemGeometry, roofSystem).closures) {
    const edge = projectElevationEdge(view, closurePlanPoint(closure, 0), closurePlanPoint(closure, closure.length));
    if (!edge) continue;
    const project = (point) => {
      const plan = closurePlanPoint(closure, point.x);
      return { x: projectElevationHorizontal(view, plan), z: closure.baseElevation + point.z };
    };
    polygonElements.push({
      id: `elevation-closure-${closure.id}`,
      category: 'gableInfill',
      style: 'gableInfill',
      points: closure.points.map(project),
      depth: edge.depth + CLOSURE_DEPTH_NUDGE,
      depthSlope: edge.depthSlope,
      depthIntercept: edge.depthIntercept + CLOSURE_DEPTH_NUDGE,
      sourceId: trussSystem.id,
      systemId: trussSystem.id,
      side: closure.side,
    });
    const hole = closure.holes[0];
    if (!hole) continue;
    hole.forEach((point, index) => {
      const next = hole[(index + 1) % hole.length];
      const plan = closurePlanPoint(closure, (point.x + next.x) / 2);
      lineElements.push({
        id: `elevation-closure-vent-${closure.id}-${index}`,
        category: 'gableInfill',
        style: 'gableVent',
        depth: projectElevationDepth(view, plan) - CLOSURE_DEPTH_NUDGE,
        sourceId: trussSystem.id,
        systemId: trussSystem.id,
        start: project(point),
        end: project(next),
      });
    });
  }
  return { polygonElements, lineElements };
}

export function buildTrussElevationElements(trussSystems = [], view, roofSystem = null) {
  if (!view) {
    return {
      lineElements: [],
      polygonElements: [],
    };
  }

  const lineElements = [];
  const polygonElements = [];

  for (const trussSystem of trussSystems) {
    const systemGeometry = buildTrussSystemGeometry(trussSystem);
    const closureElements = buildClosureElevationElements(trussSystem, systemGeometry, roofSystem, view);
    polygonElements.push(...closureElements.polygonElements);
    lineElements.push(...closureElements.lineElements);

    for (const instanceGeometry of systemGeometry.instances) {
      const representativeCopy = pickRepresentativeCopy(instanceGeometry, view);
      if (!representativeCopy) continue;

      for (const member of representativeCopy.members || []) {
        lineElements.push({
          id: `elevation-truss-${representativeCopy.id}-${member.id}`,
          category: 'trussInstance',
          style: member.memberType === 'web' ? 'trussWeb' : 'trussChord',
          depth: getSegmentDepth(view, member.startWorld, member.endWorld),
          sourceId: instanceGeometry.instance.id,
          systemId: trussSystem.id,
          start: projectElevationPoint(view, member.startWorld),
          end: projectElevationPoint(view, member.endWorld),
        });
      }

      for (const segment of instanceGeometry.purlinSegments || []) {
        if (!segment.copyIds?.includes(representativeCopy.id)) continue;

        lineElements.push({
          id: `elevation-purlin-${segment.id}`,
          category: 'trussInstance',
          style: 'trussPurlin',
          depth: getSegmentDepth(view, segment.startWorld, segment.endWorld),
          sourceId: instanceGeometry.instance.id,
          systemId: trussSystem.id,
          start: projectElevationPoint(view, segment.startWorld),
          end: projectElevationPoint(view, segment.endWorld),
        });
      }
    }
  }

  return {
    lineElements,
    polygonElements,
  };
}
