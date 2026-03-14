import { projectElevationDepth, projectElevationHorizontal } from '@/elevations/projection';
import { buildTrussSystemGeometry } from './trussGeometry';

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
  return average([
    projectElevationDepth(view, startWorld),
    projectElevationDepth(view, endWorld),
  ]);
}

function pickRepresentativeCopy(instanceGeometry, view) {
  return (instanceGeometry?.copies || []).reduce((closest, copy) => {
    if (!closest) return copy;
    return getCopyDepth(view, copy) < getCopyDepth(view, closest) ? copy : closest;
  }, null);
}

export function buildTrussElevationElements(trussSystems = [], view) {
  if (!view) {
    return {
      lineElements: [],
    };
  }

  const lineElements = [];

  for (const trussSystem of trussSystems) {
    const systemGeometry = buildTrussSystemGeometry(trussSystem);

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
  };
}
