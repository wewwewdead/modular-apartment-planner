import { syncWallAttachmentPoints, detachColumnAttachments } from '@/geometry/wallColumnGeometry';
import { syncStairLandingAttachment } from '@/geometry/landingGeometry';
import { clampWallOpeningOffset, wallLength } from '@/geometry/wallGeometry';

/**
 * Replace references to a deleted floor with a fallback floor id.
 * Pure function: (project, deletedFloorId, fallbackFloorId) => nextProject
 */
export function replaceDeletedFloorReferences(project, deletedFloorId, fallbackFloorId) {
  return {
    ...project,
    floors: project.floors.map((floor) => ({
      ...floor,
      stairs: (floor.stairs || []).map((stair) => ({
        ...stair,
        floorRelation: {
          fromFloorId:
            stair.floorRelation?.fromFloorId === deletedFloorId
              ? fallbackFloorId
              : (stair.floorRelation?.fromFloorId ?? floor.id),
          toFloorId:
            stair.floorRelation?.toFloorId === deletedFloorId
              ? fallbackFloorId
              : (stair.floorRelation?.toFloorId ?? floor.id),
        },
      })),
    })),
    sheets: (project.sheets || []).map((sheet) => ({
      ...sheet,
      viewports: (sheet.viewports || []).map((viewport) => ({
        ...viewport,
        sourceFloorId: viewport.sourceFloorId === deletedFloorId ? fallbackFloorId : viewport.sourceFloorId,
        sourceRefId: viewport.sourceFloorId === deletedFloorId ? null : viewport.sourceRefId,
      })),
    })),
  };
}

/**
 * Clear stair roof-access references (all, or for a specific roofOpeningId).
 * Pure function: (project, roofOpeningId?) => nextProject
 */
export function clearStairRoofAccessReferences(project, roofOpeningId = null) {
  return {
    ...project,
    floors: (project.floors || []).map((floor) => ({
      ...floor,
      stairs: (floor.stairs || []).map((stair) => {
        const currentRoofOpeningId = stair.roofAccess?.roofOpeningId || null;
        if (!currentRoofOpeningId) return stair;
        if (roofOpeningId && currentRoofOpeningId !== roofOpeningId) return stair;
        return { ...stair, roofAccess: null };
      }),
    })),
  };
}

/**
 * Merge a wall update, clearing attachment points when endpoints change.
 * Pure function: (existingWall, wallUpdate, columns) => nextWall
 */
export function mergeWallUpdate(existingWall, wallUpdate, columns = []) {
  const nextWall = { ...existingWall, ...wallUpdate };

  if ('start' in wallUpdate && !('startAttachment' in wallUpdate)) {
    nextWall.startAttachment = null;
  }
  if ('end' in wallUpdate && !('endAttachment' in wallUpdate)) {
    nextWall.endAttachment = null;
  }

  return syncWallAttachmentPoints(nextWall, columns);
}

/**
 * Clamp wall-mounted openings (doors/windows) when a wall length changes.
 * Pure function: (openings, wallId, nextWallLength) => nextOpenings
 */
export function clampWallMountedOpenings(openings, wallId, nextWallLength) {
  return openings.map((opening) => {
    if (opening.wallId !== wallId) return opening;
    const nextOffset = clampWallOpeningOffset(nextWallLength, opening.width, opening.offset);
    return nextOffset === opening.offset ? opening : { ...opening, offset: nextOffset };
  });
}

/**
 * Apply a WALL_UPDATE action to a floor — merge wall, clamp mounted openings.
 * Pure function: (floor, wallUpdate, columns) => nextFloor
 */
export function applyWallUpdate(floor, wallUpdate, columns = []) {
  let updatedWall = null;
  const walls = floor.walls.map((wall) => {
    if (wall.id !== wallUpdate.id) return wall;
    updatedWall = mergeWallUpdate(wall, wallUpdate, columns);
    return updatedWall;
  });

  if (!updatedWall) return floor;

  const nextWallLength = wallLength(updatedWall);
  return {
    ...floor,
    walls,
    doors: clampWallMountedOpenings(floor.doors, updatedWall.id, nextWallLength),
    windows: clampWallMountedOpenings(floor.windows, updatedWall.id, nextWallLength),
  };
}

/**
 * Apply a COLUMN_UPDATE action to a floor — update column and sync wall attachments.
 * Pure function: (floor, columnUpdate) => nextFloor
 */
export function applyColumnUpdate(floor, columnUpdate) {
  const nextColumns = (floor.columns || []).map((c) => (c.id === columnUpdate.id ? { ...c, ...columnUpdate } : c));
  return {
    ...floor,
    columns: nextColumns,
    walls: floor.walls.map((w) => syncWallAttachmentPoints(w, nextColumns)),
  };
}

/**
 * Apply a COLUMN_DELETE action to a floor — detach wall/beam refs.
 * Pure function: (floor, columnId) => nextFloor
 */
export function applyColumnDelete(floor, columnId) {
  const deletedCol = (floor.columns || []).find((c) => c.id === columnId);
  const colPoint = deletedCol ? { kind: 'point', x: deletedCol.x, y: deletedCol.y } : null;
  return {
    ...floor,
    columns: (floor.columns || []).filter((c) => c.id !== columnId),
    walls: floor.walls.map((w) => detachColumnAttachments(w, floor.columns || [], columnId)),
    beams: (floor.beams || []).map((beam) => {
      const newStart = beam.startRef?.id === columnId && colPoint ? { ...colPoint } : beam.startRef;
      const newEnd = beam.endRef?.id === columnId && colPoint ? { ...colPoint } : beam.endRef;
      if (newStart === beam.startRef && newEnd === beam.endRef) return beam;
      return { ...beam, startRef: newStart, endRef: newEnd };
    }),
  };
}

/**
 * Apply a LANDING_UPDATE to a floor — cascade stair attachment sync.
 * Pure function: (floor, landingUpdate) => nextFloor
 */
export function applyLandingUpdate(floor, landingUpdate) {
  const nextLandings = (floor.landings || []).map((l) => (l.id === landingUpdate.id ? { ...l, ...landingUpdate } : l));
  const nextStairs = (floor.stairs || []).map((stair) => {
    const attachedToStart = stair.startLandingAttachment?.landingId === landingUpdate.id;
    const attachedToEnd = stair.endLandingAttachment?.landingId === landingUpdate.id;
    if (!attachedToStart && !attachedToEnd) return stair;
    return syncStairLandingAttachment(stair, nextLandings);
  });
  return { ...floor, landings: nextLandings, stairs: nextStairs };
}

/**
 * Apply a LANDING_DELETE to a floor — nullify stair landing attachments.
 * Pure function: (floor, landingId) => nextFloor
 */
export function applyLandingDelete(floor, landingId) {
  return {
    ...floor,
    landings: (floor.landings || []).filter((l) => l.id !== landingId),
    stairs: (floor.stairs || []).map((stair) => {
      let next = stair;
      if (stair.startLandingAttachment?.landingId === landingId) {
        next = { ...next, startLandingAttachment: null };
      }
      if (stair.endLandingAttachment?.landingId === landingId) {
        next = { ...next, endLandingAttachment: null };
      }
      return next;
    }),
  };
}
