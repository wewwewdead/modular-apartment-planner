import { getSectionDepthMode, getSectionLimitedDepth } from '@/domain/sectionModels';
import { resolveCeilingBoundary } from '@/domain/ceilingModels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { landingOutline } from '@/geometry/landingGeometry';
import { getRailingRenderData } from '@/geometry/railingGeometry';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { getParapetRenderData } from '@/geometry/roofPlanGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { projectPointToSectionCut, sectionCutLength } from '@/geometry/sectionCutGeometry';

function modelPoints(floors, project, roofSystem) {
  const points = [];
  for (const floor of floors) {
    for (const wall of floor.walls || []) points.push(...getWallRenderData(wall, floor.columns || []).outline);
    for (const column of floor.columns || []) points.push(...columnOutline(column));
    for (const beam of floor.beams || []) points.push(...(getBeamRenderData(beam, floor.columns || [])?.outline || []));
    for (const slab of floor.slabs || []) points.push(...(slab.boundaryPoints || []));
    for (const stair of floor.stairs || []) points.push(...(getStairRenderData(stair)?.outline || []));
    for (const landing of floor.landings || []) points.push(...landingOutline(landing));
    for (const railing of floor.railings || []) points.push(...(getRailingRenderData(railing)?.outline || []));
  }
  if (roofSystem) {
    const geometry = buildRoofPlaneGeometry(roofSystem);
    points.push(...(geometry.roofOutline || []));
    for (const plane of geometry.planes || []) points.push(...(plane.outline || []));
    for (const parapet of roofSystem.parapets || []) {
      points.push(...(getParapetRenderData(parapet, roofSystem)?.outline || []));
    }
  }
  for (const ceiling of project?.ceilings || []) points.push(...resolveCeilingBoundary(project, ceiling));
  for (const system of project?.trussSystems || []) {
    const bounds = buildTrussSystemGeometry(system).planBounds;
    if (bounds)
      points.push(
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
      );
  }
  return points;
}

export function resolveSectionViewDepth(floors, sectionCut, project = null, roofSystem = null) {
  const mode = getSectionDepthMode(sectionCut);
  let depth = getSectionLimitedDepth(sectionCut);
  if (mode === 'full') {
    depth = 100;
    for (const point of modelPoints(floors, project, roofSystem)) {
      const offset = projectPointToSectionCut(sectionCut, point).offset;
      if (Number.isFinite(offset)) depth = Math.max(depth, Math.ceil(offset) + 1);
    }
  }
  const length = sectionCutLength(sectionCut);
  const stairs = { clippedByDepth: 0, behindCut: 0, outsideWidth: 0 };
  for (const floor of floors) {
    for (const stair of floor.stairs || []) {
      const points = (getStairRenderData(stair)?.outline || []).map((point) =>
        projectPointToSectionCut(sectionCut, point),
      );
      if (!points.length) continue;
      const minAlong = Math.min(...points.map((point) => point.along));
      const maxAlong = Math.max(...points.map((point) => point.along));
      const maxDepth = Math.max(...points.map((point) => point.offset));
      if (maxAlong < 0 || minAlong > length) stairs.outsideWidth += 1;
      else if (maxDepth < 0) stairs.behindCut += 1;
      else if (maxDepth > depth + 1e-6) stairs.clippedByDepth += 1;
    }
  }
  return { mode, depth, stairs };
}
