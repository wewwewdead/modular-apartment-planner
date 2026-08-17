import { distance } from '@/geometry/point';
import {
  clampWallOpeningOffset,
  deviceOutlineOnWall,
  doorOutlineOnWall,
  snapOffsetToWallColumns,
  windowOutlineOnWall,
  wallLength,
  wallSideOfPoint,
  projectPointOnWall,
} from '@/geometry/wallGeometry';
import { pointInPolygon, polygonSelfIntersects } from '@/geometry/polygon';
import { columnOutline } from '@/geometry/columnGeometry';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { landingContainsPoint } from '@/geometry/landingGeometry';
import { fixtureContainsPoint } from '@/geometry/fixtureGeometry';
import { offsetSlabEdge, slabContainsPoint, slabEdgeOutwardNormal } from '@/geometry/slabGeometry';
import { resolvePoint, snapToGrid } from './handlerSnapUtils';
import { resolveReferenceSnapGeometry, snapOffsetToReference, snapPointToReference } from './referenceSnap';
import { hitTestAnnotation } from '@/annotations/scene';
import { ELECTRICAL_PLATE, ELECTRICAL_SYMBOL_SIZE, MIN_WALL_LENGTH, SNAP_DISTANCE_PX } from '@/domain/defaults';
import { describeWallEditRejection, propagateWallEdit } from '@/domain/modelGraph';
import { getWallRenderData, resolveWallEndpoints, snapWallEndpoint } from '@/geometry/wallColumnGeometry';
import { duplicateColumn } from '@/domain/columnModels';
import { hitTestSectionCut } from '@/geometry/sectionCutGeometry';
import { railingContainsPoint } from '@/geometry/railingGeometry';
import { collectPlanRegionSelection, normalizeRectBounds, rectSize } from '@/features/floorplan/utils/planClipboard';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import { equipmentZonePolygon } from '@/domain/equipmentCoordination';
import { hitTestGridBubbles, hitTestGridLines } from '@/geometry/structuralGridGeometry';

function centeredRectangle(origin, width, depth) {
  return [
    { x: origin.x - width / 2, y: origin.y - depth / 2 },
    { x: origin.x + width / 2, y: origin.y - depth / 2 },
    { x: origin.x + width / 2, y: origin.y + depth / 2 },
    { x: origin.x - width / 2, y: origin.y + depth / 2 },
  ];
}

const GRID_ROTATE_SNAP_DEGREES = 15;

/**
 * The slab boundary as it stood when the drag started.
 *
 * A slab edit commits on every pointer-move, so reading the live slab each
 * frame would measure the drag against geometry the drag itself just moved and
 * the plate would run away from the cursor. Every frame is therefore computed
 * from this snapshot, cumulatively from mousedown.
 */
function captureSlabEditOrigin(floor, slabId) {
  if (!slabId) return null;
  const slab = (floor.slabs || []).find((entry) => entry.id === slabId);
  if (!slab) return null;
  return {
    slabId,
    boundaryPoints: (slab.boundaryPoints || []).map((point) => ({ x: point.x, y: point.y })),
  };
}

function sameBoundary(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((point, index) => point.x === b[index].x && point.y === b[index].y);
}

/**
 * Grid rotation from the pointer. The rotate handle is drawn on the grid's
 * local +x axis, so the angle of the pointer about the grid origin IS the
 * grid's rotation — and atan2 in y-down model space already counts clockwise
 * as positive, the same sense as the SVG rotate() the overlay applies.
 */
function gridRotationTowards(origin, modelPos, snap) {
  const degrees = (Math.atan2(modelPos.y - origin.y, modelPos.x - origin.x) * 180) / Math.PI;
  const snapped = snap ? Math.round(degrees / GRID_ROTATE_SNAP_DEGREES) * GRID_ROTATE_SNAP_DEGREES : degrees;
  return Math.round(snapped * 100) / 100;
}

function hitTestBuildingService(modelPos, project, floor) {
  const systems = project?.building?.systems || {};

  for (const shaft of systems.plumbing?.shafts || []) {
    if (!(shaft.servedFloorIds || []).includes(floor.id)) continue;
    if (pointInPolygon(modelPos, centeredRectangle(shaft.origin, shaft.width, shaft.depth))) {
      return { id: shaft.id, type: 'plumbingShaft' };
    }
  }

  for (const riser of systems.electrical?.riserZones || []) {
    if (!(riser.servedFloorIds || []).includes(floor.id)) continue;
    if (pointInPolygon(modelPos, centeredRectangle(riser.origin, riser.width, riser.depth))) {
      return { id: riser.id, type: 'electricalRiser' };
    }
  }

  for (const panel of systems.electrical?.panelZones || []) {
    const visible = panel.floorId === floor.id || (panel.servedFloorIds || []).includes(floor.id);
    if (visible && pointInPolygon(modelPos, equipmentZonePolygon(panel))) {
      return { id: panel.id, type: 'electricalPanelZone' };
    }
  }

  return null;
}

function hitTest(modelPos, floor, project, annotationTolerance) {
  // Services render above the architectural plan, so they receive hit priority
  // when their footprint overlaps a wall, fixture, or room.
  const serviceHit = hitTestBuildingService(modelPos, project, floor);
  if (serviceHit) return serviceHit;

  // The structural grid's axis bubbles sit outside the plan, so they can take
  // early priority as the grid's grab handles. The axis lines themselves are
  // tested dead last — they run along wall centrelines by design.
  const gridSystems = project?.building?.systems?.structural?.gridSystems || [];
  const bubbleHit = hitTestGridBubbles(modelPos, gridSystems, annotationTolerance / 2);
  if (bubbleHit) return bubbleHit;

  // Electrical devices are the smallest targets on the plan, so they take
  // priority over the door/window they may sit beside. The centre-distance
  // fallback keeps a 300mm symbol clickable at plan zooms where its outline is
  // only a few pixels across.
  for (const device of floor.electricalDevices || []) {
    const wall = floor.walls.find((w) => w.id === device.wallId);
    if (!wall) continue;
    const info = deviceOutlineOnWall(wall, device, ELECTRICAL_SYMBOL_SIZE);
    const poly = [info.p1, info.p2, info.p3, info.p4];
    if (pointInPolygon(modelPos, poly) || distance(modelPos, info.center) <= annotationTolerance) {
      return { id: device.id, type: 'electricalDevice' };
    }
  }

  // Hit test doors first (smaller targets, higher priority)
  for (const door of floor.doors) {
    const wall = floor.walls.find((w) => w.id === door.wallId);
    if (!wall) continue;
    const info = doorOutlineOnWall(wall, door);
    const poly = [info.p1, info.p2, info.p3, info.p4];
    if (pointInPolygon(modelPos, poly)) {
      return { id: door.id, type: 'door' };
    }
  }

  // Hit test windows
  for (const win of floor.windows) {
    const wall = floor.walls.find((w) => w.id === win.wallId);
    if (!wall) continue;
    const info = windowOutlineOnWall(wall, win);
    const poly = [info.p1, info.p2, info.p3, info.p4];
    if (pointInPolygon(modelPos, poly)) {
      return { id: win.id, type: 'window' };
    }
  }

  // Hit test section cuts
  for (const sc of floor.sectionCuts || []) {
    if (hitTestSectionCut(modelPos, sc, annotationTolerance)) {
      return { id: sc.id, type: 'sectionCut' };
    }
  }

  for (const column of floor.columns || []) {
    const outline = columnOutline(column);
    if (pointInPolygon(modelPos, outline)) {
      return { id: column.id, type: 'column' };
    }
  }

  // Hit test fixtures
  for (const fixture of floor.fixtures || []) {
    if (fixtureContainsPoint(fixture, modelPos)) {
      return { id: fixture.id, type: 'fixture' };
    }
  }

  // A dimension is a thin overlay drawn on top of the plan, so it outranks the
  // long members and area fills it crosses — railings, beams, walls, rooms,
  // slabs — which would otherwise swallow every click and leave the dimension
  // unselectable (and undeletable) from the canvas. The small solid targets it
  // measures BETWEEN keep priority at their own bodies: an extension line
  // touches a window edge or a column face by construction, and it must not
  // steal their clicks.
  const annotationHit = hitTestAnnotation(modelPos, floor, annotationTolerance);
  if (annotationHit) {
    return annotationHit;
  }

  // Hit test railings
  for (const railing of floor.railings || []) {
    if (railingContainsPoint(railing, modelPos)) {
      return { id: railing.id, type: 'railing' };
    }
  }

  // Hit test beams
  const beamsBySelectionPriority = [...(floor.beams || [])].sort((a, b) => (b.floorLevel ?? 0) - (a.floorLevel ?? 0));
  for (const beam of beamsBySelectionPriority) {
    const renderData = getBeamRenderData(beam, floor.columns || []);
    if (!renderData) continue;
    if (pointInPolygon(modelPos, renderData.outline)) {
      return { id: beam.id, type: 'beam' };
    }
  }

  // Hit test walls
  for (const wall of floor.walls) {
    const outline = getWallRenderData(wall, floor.columns || []).outline;
    if (pointInPolygon(modelPos, outline)) {
      return { id: wall.id, type: 'wall' };
    }
  }

  // Hit test stairs after walls/beams/columns so current editing priority stays intact.
  for (const stair of floor.stairs || []) {
    const renderData = getStairRenderData(stair);
    if (!renderData) continue;
    if (pointInPolygon(modelPos, renderData.outline)) {
      return { id: stair.id, type: 'stair' };
    }
  }

  // Hit test landings
  for (const landing of floor.landings || []) {
    if (landingContainsPoint(landing, modelPos)) {
      return { id: landing.id, type: 'landing' };
    }
  }

  // Hit test rooms (lowest priority)
  for (const room of floor.rooms) {
    if (room.points?.length >= 3 && pointInPolygon(modelPos, room.points)) {
      return { id: room.id, type: 'room' };
    }
  }

  for (const slab of floor.slabs || []) {
    if (slabContainsPoint(slab, modelPos)) {
      return { id: slab.id, type: 'slab' };
    }
  }

  return hitTestGridLines(modelPos, gridSystems, annotationTolerance / 2);
}

export function createSelectHandler({
  dispatch,
  editorDispatch,
  project,
  getProject,
  getFloor,
  activeFloorId,
  viewport,
  snapEnabled,
  activePhaseId = null,
  floorBelow = null,
  showFloorBelowUnderlay = false,
}) {
  // Null unless the ghost underlay is on screen with snapping on — a layer you
  // cannot see must never pull the plate you are dragging.
  function referenceGeometry() {
    return resolveReferenceSnapGeometry({ floorBelow, showFloorBelowUnderlay, snapEnabled });
  }

  return {
    onMouseDown(modelPos, e, _toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;

      // Check if clicking a handle
      const target = e.target;
      if (target.dataset.handle) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: true,
            dragType: 'handle',
            handle: target.dataset.handle,
            handleIndex: target.dataset.index != null ? Number(target.dataset.index) : null,
            startPos: modelPos,
            // Only slab handles carry a slab id, so this is null for every
            // other handle in the app.
            slabEditOrigin: captureSlabEditOrigin(floor, target.dataset.slabId || null),
            slabEdgeDrag: null,
          },
        });
        return;
      }

      /*
       * An overhang indicator is drawn ALONG a stretch of a slab's own edge, so
       * hit-testing it geometrically would be asking whether a click on the
       * slab is a click on the slab. It is answered by what was actually under
       * the pointer instead: the indicator carries its own hit stroke, and only
       * a click that lands on that stroke picks the run. Anywhere else on the
       * plate still selects the plate, with no run in mind.
       *
       * Below the handle check on purpose. The plate's own edge handle sits at
       * the midpoint of the very edge an indicator runs along, and dragging that
       * handle is how the cantilever got there — it must keep winning.
       */
      if (target.dataset.overhangSlab) {
        editorDispatch({
          type: 'SELECT_OVERHANG_EDGE',
          slabId: target.dataset.overhangSlab,
          edgeIndex: Number(target.dataset.overhangEdge),
        });
        return;
      }

      const currentProject = getProject?.() || project;
      const hit = hitTest(modelPos, floor, currentProject, (SNAP_DISTANCE_PX / viewport.zoom) * 2.5);
      if (hit) {
        editorDispatch({ type: 'SELECT_OBJECT', id: hit.id, objectType: hit.type });
        const draggableTypes = new Set([
          'wall',
          'column',
          'fixture',
          'door',
          'window',
          'electricalDevice',
          'stair',
          'sectionCut',
          'landing',
          'railing',
          'plumbingShaft',
          'electricalRiser',
          'electricalPanelZone',
          'structuralGrid',
        ]);
        if (!draggableTypes.has(hit.type)) return;
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            pendingDrag: true,
            dragging: false,
            dragType: 'move',
            startPos: modelPos,
            originalPos: modelPos,
            wallDragPreview: null,
          },
        });
      } else {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: true,
            dragType: 'marquee',
            startPos: modelPos,
            currentPos: modelPos,
          },
        });
      }
    },

    onMouseMove(modelPos, e, toolState, selectedId, selectedType) {
      const DRAG_THRESHOLD_PX = 4;

      if (toolState.pendingDrag && !toolState.dragging) {
        const dx = modelPos.x - toolState.startPos.x;
        const dy = modelPos.y - toolState.startPos.y;
        const distPx = Math.sqrt(dx * dx + dy * dy) * viewport.zoom;
        if (distPx < DRAG_THRESHOLD_PX) return;
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { pendingDrag: false, dragging: true },
        });
      }

      if (toolState.dragging && toolState.dragType === 'marquee') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { currentPos: modelPos },
        });
        return;
      }

      if (!toolState.dragging || !selectedId) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;
      const currentProject = getProject?.() || project;
      const dx = modelPos.x - toolState.startPos.x;
      const dy = modelPos.y - toolState.startPos.y;
      const snapDistModel = SNAP_DISTANCE_PX / viewport.zoom;

      if (selectedType === 'wall') {
        // PREVIEW-THEN-COMMIT: no WALL_UPDATE is dispatched during the drag.
        // The committed floor stays at its drag-start state, which makes snap
        // targets pre-edit (stable) by construction, keeps the drag cumulative
        // (no lost-update "gravity" trap), and floods no undo history. The
        // single commit happens on mouseup; Escape cancels for free.
        const wall = floor.walls.find((w) => w.id === selectedId);
        if (!wall) return;
        const resolved = resolveWallEndpoints(wall, floor.columns || []);
        let proposal = null;

        if (toolState.dragType === 'handle') {
          const handle = toolState.handle;
          const oppositeKey = handle === 'start' ? 'end' : 'start';
          const oppositePoint = resolved[oppositeKey];
          let nextPoint = modelPos;
          let nextAttachment = null;

          if (e.shiftKey) {
            const dx = modelPos.x - oppositePoint.x;
            const dy = modelPos.y - oppositePoint.y;
            const angle = Math.atan2(dy, dx);
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.sqrt(dx * dx + dy * dy);
            nextPoint = {
              x: oppositePoint.x + Math.cos(snapAngle) * len,
              y: oppositePoint.y + Math.sin(snapAngle) * len,
            };
          } else if (snapEnabled) {
            const snapResult = snapWallEndpoint(modelPos, {
              walls: floor.walls,
              columns: floor.columns || [],
              snapDist: snapDistModel,
              otherPoint: oppositePoint,
              ignoreWallId: wall.id,
            });
            if (snapResult) {
              nextPoint = snapResult.point;
              nextAttachment = snapResult.attachment;
            }
          }

          if (distance(nextPoint, oppositePoint) < MIN_WALL_LENGTH) return;

          proposal = {
            id: wall.id,
            [handle]: nextPoint,
            [`${handle}Attachment`]: nextAttachment,
          };
        } else {
          let nextStart = { x: resolved.start.x + dx, y: resolved.start.y + dy };
          let nextEnd = { x: resolved.end.x + dx, y: resolved.end.y + dy };
          let startAttachment = null;
          let endAttachment = null;

          if (snapEnabled) {
            const startSnap = snapWallEndpoint(nextStart, {
              walls: floor.walls,
              columns: floor.columns || [],
              snapDist: snapDistModel,
              otherPoint: nextEnd,
              ignoreWallId: wall.id,
            });
            if (startSnap) {
              nextStart = startSnap.point;
              startAttachment = startSnap.attachment;
            }

            const endSnap = snapWallEndpoint(nextEnd, {
              walls: floor.walls,
              columns: floor.columns || [],
              snapDist: snapDistModel,
              otherPoint: nextStart,
              ignoreWallId: wall.id,
            });
            if (endSnap) {
              nextEnd = endSnap.point;
              endAttachment = endSnap.attachment;
            }
          }

          if (distance(nextStart, nextEnd) < MIN_WALL_LENGTH) return;

          proposal = {
            id: wall.id,
            start: nextStart,
            end: nextEnd,
            startAttachment,
            endAttachment,
          };
          if (wall.controlPoint) {
            proposal.controlPoint = {
              x: wall.controlPoint.x + dx,
              y: wall.controlPoint.y + dy,
            };
          }
        }

        // One-hop heal preview so joins visibly hold DURING the drag.
        const propagation = propagateWallEdit(floor, proposal);
        const previewEdits = propagation.ok
          ? [
              {
                id: wall.id,
                start: propagation.primary.start,
                end: propagation.primary.end,
                ...(proposal.controlPoint ? { controlPoint: proposal.controlPoint } : {}),
              },
              ...propagation.secondary,
            ]
          : [
              {
                id: wall.id,
                ...(proposal.start ? { start: proposal.start } : {}),
                ...(proposal.end ? { end: proposal.end } : {}),
                ...(proposal.controlPoint ? { controlPoint: proposal.controlPoint } : {}),
              },
            ];

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            wallDragPreview: {
              edits: previewEdits,
              blocked: propagation.ok ? null : propagation.reason,
              proposal,
            },
          },
        });
      } else if (selectedType === 'column') {
        const col = (floor.columns || []).find((c) => c.id === selectedId);
        if (!col) return;
        dispatch({
          type: 'COLUMN_UPDATE',
          floorId: activeFloorId,
          column: { id: col.id, x: col.x + dx, y: col.y + dy },
        });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
      } else if (selectedType === 'fixture') {
        const fixture = (floor.fixtures || []).find((f) => f.id === selectedId);
        if (!fixture) return;
        dispatch({
          type: 'FIXTURE_UPDATE',
          floorId: activeFloorId,
          fixture: { id: fixture.id, x: fixture.x + dx, y: fixture.y + dy },
        });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
      } else if (selectedType === 'plumbingShaft') {
        const shaft = (currentProject?.building?.systems?.plumbing?.shafts || []).find(
          (entry) => entry.id === selectedId,
        );
        if (!shaft) return;
        dispatch({
          type: 'EXECUTE_BUILDING_COMMAND',
          command: {
            type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
            shaftId: shaft.id,
            name: shaft.name,
            origin: { x: shaft.origin.x + dx, y: shaft.origin.y + dy },
            width: shaft.width,
            depth: shaft.depth,
            servedFloorIds: shaft.servedFloorIds,
            maxFixtureDistance: shaft.maxFixtureDistance,
          },
        });
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
      } else if (selectedType === 'electricalRiser') {
        const riser = (currentProject?.building?.systems?.electrical?.riserZones || []).find(
          (entry) => entry.id === selectedId,
        );
        if (!riser) return;
        dispatch({
          type: 'EXECUTE_BUILDING_COMMAND',
          command: {
            type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER,
            riserId: riser.id,
            name: riser.name,
            origin: { x: riser.origin.x + dx, y: riser.origin.y + dy },
            width: riser.width,
            depth: riser.depth,
            servedFloorIds: riser.servedFloorIds,
            openingClearance: riser.openingClearance,
          },
        });
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
      } else if (selectedType === 'electricalPanelZone') {
        const panel = (currentProject?.building?.systems?.electrical?.panelZones || []).find(
          (entry) => entry.id === selectedId,
        );
        if (!panel) return;
        dispatch({
          type: 'EXECUTE_BUILDING_COMMAND',
          command: {
            type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
            zoneId: panel.id,
            name: panel.name,
            kind: panel.kind,
            floorId: panel.floorId,
            location: panel.location,
            origin: { x: panel.origin.x + dx, y: panel.origin.y + dy },
            width: panel.width,
            depth: panel.depth,
            rotation: panel.rotation,
            clearance: panel.clearance,
            capacity: panel.capacity,
            unitCount: panel.unitCount,
            servedFloorIds: panel.servedFloorIds,
          },
        });
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { startPos: modelPos } });
      } else if (selectedType === 'structuralGrid') {
        // PREVIEW-THEN-COMMIT (same architecture as wall and section drags).
        // A grid transform re-resolves every pinned column stack and re-runs
        // the building coordination pass, so a commit per pointer-move stalled
        // the drag; worse, advancing startPos per move while reading the grid
        // from a project ref that only catches up a render later dropped whole
        // deltas, and the grid trailed the cursor. The proposal is cumulative
        // from the never-advancing mousedown against a committed project that
        // cannot move until mouseup.
        //
        // The body of the grid translates; the rotate handle turns it. Either
        // way the proposal carries a whole transform, so the half that is not
        // being dragged stays exactly as committed. Stacks pinned to
        // intersections follow in the command, and in the preview alongside it.
        const grid = (currentProject?.building?.systems?.structural?.gridSystems || []).find(
          (entry) => entry.id === selectedId,
        );
        if (!grid) return;
        const gridOrigin = { x: grid.origin?.x || 0, y: grid.origin?.y || 0 };
        const rotating = toolState.dragType === 'handle' && toolState.handle === 'grid-rotate';
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            wallDragPreview: {
              gridTransform: {
                gridId: grid.id,
                origin: rotating ? gridOrigin : { x: gridOrigin.x + dx, y: gridOrigin.y + dy },
                rotation: rotating ? gridRotationTowards(gridOrigin, modelPos, e.shiftKey) : grid.rotation || 0,
              },
              blocked: null,
            },
          },
        });
      } else if (selectedType === 'sectionCut') {
        // PREVIEW-THEN-COMMIT (same architecture as wall drags): no
        // SECTION_UPDATE per mousemove. Per-event commits ran the full
        // pipeline (history snapshot + roof/truss sync + full re-render)
        // every few milliseconds — the "friction" — and the old incremental
        // startPos-advancing scheme lost deltas whenever an event read a
        // stale floor against a fresh startPos — the "gravity" slip.
        // Cumulative-from-mousedown against the never-changing committed
        // floor eliminates both. One dispatch on mouseup; Escape cancels.
        const sectionCut = (floor.sectionCuts || []).find((s) => s.id === selectedId);
        if (!sectionCut) return;
        let proposal = null;

        if (toolState.dragType === 'handle') {
          const handle = toolState.handle;
          const nextSectionCut =
            handle === 'start' ? { ...sectionCut, startPoint: modelPos } : { ...sectionCut, endPoint: modelPos };

          if (distance(nextSectionCut.startPoint, nextSectionCut.endPoint) < MIN_WALL_LENGTH) return;

          proposal = {
            id: sectionCut.id,
            startPoint: { ...nextSectionCut.startPoint },
            endPoint: { ...nextSectionCut.endPoint },
          };
        } else {
          proposal = {
            id: sectionCut.id,
            startPoint: {
              x: sectionCut.startPoint.x + dx,
              y: sectionCut.startPoint.y + dy,
            },
            endPoint: {
              x: sectionCut.endPoint.x + dx,
              y: sectionCut.endPoint.y + dy,
            },
          };
        }

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            wallDragPreview: {
              sectionCutEdits: [proposal],
              sectionProposal: proposal,
              blocked: null,
            },
          },
        });
      } else if (selectedType === 'railing') {
        const railing = (floor.railings || []).find((r) => r.id === selectedId);
        if (!railing) return;

        if (toolState.dragType === 'handle') {
          const handle = toolState.handle;
          const nextRailing =
            handle === 'start' ? { ...railing, startPoint: modelPos } : { ...railing, endPoint: modelPos };

          if (distance(nextRailing.startPoint, nextRailing.endPoint) < MIN_WALL_LENGTH) return;

          dispatch({
            type: 'RAILING_UPDATE',
            floorId: activeFloorId,
            railing: nextRailing,
          });
        } else {
          dispatch({
            type: 'RAILING_UPDATE',
            floorId: activeFloorId,
            railing: {
              id: railing.id,
              startPoint: {
                x: railing.startPoint.x + dx,
                y: railing.startPoint.y + dy,
              },
              endPoint: {
                x: railing.endPoint.x + dx,
                y: railing.endPoint.y + dy,
              },
            },
          });
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { startPos: modelPos },
          });
        }
      } else if (selectedType === 'beam') {
        return;
      } else if (selectedType === 'stair') {
        const stair = (floor.stairs || []).find((entry) => entry.id === selectedId);
        if (!stair) return;
        dispatch({
          type: 'STAIR_UPDATE',
          floorId: activeFloorId,
          stair: {
            id: stair.id,
            startPoint: {
              x: stair.startPoint.x + dx,
              y: stair.startPoint.y + dy,
            },
          },
        });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
      } else if (selectedType === 'landing') {
        const landing = (floor.landings || []).find((l) => l.id === selectedId);
        if (!landing) return;
        dispatch({
          type: 'LANDING_UPDATE',
          floorId: activeFloorId,
          landing: {
            id: landing.id,
            position: {
              x: landing.position.x + dx,
              y: landing.position.y + dy,
            },
          },
        });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
      } else if (selectedType === 'slab') {
        const draggingVertex = toolState.handle === 'slab-vertex';
        const draggingEdge = toolState.handle === 'slab-edge';
        if (toolState.dragType !== 'handle' || toolState.handleIndex == null || (!draggingVertex && !draggingEdge)) {
          return;
        }

        const slab = (floor.slabs || []).find((s) => s.id === selectedId);
        if (!slab) return;

        // No snapshot, or one belonging to another plate, means the handle drag
        // lost the state it was opened with. There is nothing to improvise
        // from: measured against the live boundary an edge push would re-apply
        // its own cumulative offset every frame and run away from the cursor.
        if (toolState.slabEditOrigin?.slabId !== slab.id) return;
        const originPoints = toolState.slabEditOrigin.boundaryPoints;
        // A plate is a polygon or it is nothing. No drag adds or removes a
        // vertex, so this only ever rejects a boundary that was already broken.
        if (!originPoints || originPoints.length < 3 || toolState.handleIndex >= originPoints.length) return;

        let boundaryPoints = null;
        let edgeOffset = null;
        const referenceSnapTolerance = SNAP_DISTANCE_PX / viewport.zoom;

        if (draggingVertex) {
          // The structure below outranks the grid here: a corner set on the wall
          // line beneath it is a decision, where the nearest 50mm line is just
          // arithmetic. Measured against the UNSNAPPED cursor so the grid cannot
          // first pull the pointer out of the reference's reach.
          const reference = snapPointToReference(modelPos, referenceGeometry(), referenceSnapTolerance);
          const point = reference ? { x: reference.x, y: reference.y } : resolvePoint(modelPos, snapEnabled);
          boundaryPoints = originPoints.map((entry, index) =>
            index === toolState.handleIndex ? point : { x: entry.x, y: entry.y },
          );
        } else {
          const normal = slabEdgeOutwardNormal(originPoints, toolState.handleIndex);
          // A zero-length edge, or a ring with no area, has no outside to be
          // pushed towards — the drag is degenerate and does nothing.
          if (!normal) return;

          const travelX = modelPos.x - toolState.startPos.x;
          const travelY = modelPos.y - toolState.startPos.y;
          // Only the component along the normal counts: sliding the cursor
          // ALONG the edge must not move it, or the plate would shear.
          const rawOffset = travelX * normal.x + travelY * normal.y;
          // A wall line below that the edge is about to run past catches it
          // first — this is what makes a plate land flush over its support
          // instead of 20mm shy of it. The readout follows the applied offset,
          // so the number on screen is the reference distance, not the grid one.
          const referenceOffset = snapOffsetToReference(
            {
              start: originPoints[toolState.handleIndex],
              end: originPoints[(toolState.handleIndex + 1) % originPoints.length],
            },
            normal,
            rawOffset,
            referenceGeometry(),
            referenceSnapTolerance,
          );
          if (referenceOffset !== null) {
            edgeOffset = referenceOffset;
          } else {
            edgeOffset = snapEnabled ? snapToGrid(rawOffset) : rawOffset;
          }
          boundaryPoints = offsetSlabEdge(originPoints, toolState.handleIndex, edgeOffset);
          if (!boundaryPoints) return;
        }

        // A plate folded through itself is not a floor. The whole frame is
        // dropped — geometry AND readout, so the number on screen never
        // describes a shape that was never applied — and the plate simply sits
        // at its last valid form until the cursor comes back to a region that
        // clears. Every frame recomputes from the snapshot, so resuming needs
        // no state of its own.
        if (polygonSelfIntersects(boundaryPoints)) return;

        // Snapping means most frames land on the geometry already committed;
        // dispatching those would dirty the project and burn a render for
        // nothing.
        if (!sameBoundary(boundaryPoints, slab.boundaryPoints)) {
          dispatch({
            type: 'SLAB_UPDATE',
            floorId: activeFloorId,
            slab: {
              id: slab.id,
              boundaryPoints,
            },
          });
        }

        if (draggingEdge) {
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: {
              slabEdgeDrag: { offset: edgeOffset, point: { x: modelPos.x, y: modelPos.y } },
            },
          });
        }
      } else if (selectedType === 'door' || selectedType === 'window') {
        // Slide along parent wall
        const items = selectedType === 'door' ? floor.doors : floor.windows;
        const item = items.find((i) => i.id === selectedId);
        if (!item) return;

        const wall = floor.walls.find((w) => w.id === item.wallId);
        if (!wall) return;

        const newOffset = projectPointOnWall(wall, modelPos);
        const clampedOffset = clampWallOpeningOffset(wallLength(wall), item.width, newOffset);

        const updateType = selectedType === 'door' ? 'DOOR_UPDATE' : 'WINDOW_UPDATE';
        dispatch({
          type: updateType,
          floorId: activeFloorId,
          [selectedType]: { id: item.id, offset: clampedOffset },
        });

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
      } else if (selectedType === 'electricalDevice') {
        // Slide along the parent wall, and re-face the device to whichever side
        // of the wall the cursor is on — dragging across the wall is how you
        // move an outlet to the other room.
        const device = (floor.electricalDevices || []).find((entry) => entry.id === selectedId);
        if (!device) return;

        const wall = floor.walls.find((w) => w.id === device.wallId);
        if (!wall) return;

        // Clamp and snap by the physical plate so the device can land flush
        // against columns and wall ends — the symbol is drawing decoration.
        const snappedOffset = snapOffsetToWallColumns(
          wall,
          projectPointOnWall(wall, modelPos),
          floor.columns,
          ELECTRICAL_PLATE.width,
        );
        const clampedOffset = clampWallOpeningOffset(wallLength(wall), ELECTRICAL_PLATE.width, snappedOffset);

        dispatch({
          type: 'ELECTRICAL_DEVICE_UPDATE',
          floorId: activeFloorId,
          device: { id: device.id, offset: clampedOffset, side: wallSideOfPoint(wall, modelPos) },
        });

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
      }
    },

    onMouseUp(modelPos, e, toolState) {
      if (toolState.dragging && toolState.dragType === 'marquee') {
        const floor = getFloor(activeFloorId);
        const bounds = normalizeRectBounds(toolState.startPos || modelPos, toolState.currentPos || modelPos);
        const size = rectSize(bounds);
        const minimumSize = SNAP_DISTANCE_PX / viewport.zoom;

        if (!floor || (size.width < minimumSize && size.height < minimumSize)) {
          editorDispatch({ type: 'DESELECT' });
        } else {
          const regionSelection = collectPlanRegionSelection(floor, bounds);
          if (regionSelection.objectCount) {
            editorDispatch({
              type: 'SET_REGION_SELECTION',
              bounds: regionSelection.bounds,
              selection: regionSelection.selection,
            });
          } else {
            editorDispatch({ type: 'DESELECT' });
          }
        }

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: false,
            dragType: null,
            handle: null,
            handleIndex: null,
            startPos: null,
            currentPos: null,
          },
        });
        return;
      }

      // Preview-then-commit: the drag's single commit dispatch happens here.
      if (toolState.dragging && toolState.wallDragPreview) {
        const { proposal, sectionProposal, gridTransform, blocked } = toolState.wallDragPreview;
        if (blocked) {
          editorDispatch({ type: 'SET_STATUS_MESSAGE', message: describeWallEditRejection(blocked) });
        } else if (proposal) {
          dispatch({
            type: 'WALL_UPDATE',
            floorId: activeFloorId,
            wall: proposal,
            phaseId: activePhaseId ?? null,
          });
        } else if (sectionProposal) {
          dispatch({
            type: 'SECTION_UPDATE',
            floorId: activeFloorId,
            sectionCut: sectionProposal,
          });
        } else if (gridTransform) {
          dispatch({
            type: 'EXECUTE_BUILDING_COMMAND',
            command: {
              type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
              gridId: gridTransform.gridId,
              origin: gridTransform.origin,
              rotation: gridTransform.rotation,
            },
          });
        }
      }

      if (toolState.dragging || toolState.pendingDrag) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: false,
            pendingDrag: false,
            dragType: null,
            handle: null,
            handleIndex: null,
            startPos: null,
            originalPos: null,
            currentPos: null,
            wallDragPreview: null,
            slabEditOrigin: null,
            slabEdgeDrag: null,
          },
        });
      }
    },

    onKeyDown(e, toolState, selectedId, selectedType) {
      // Escape cancels an active drag: preview cleared, nothing dispatched,
      // no history entry consumed — the wall stays exactly where it was.
      if (e.key === 'Escape' && (toolState.dragging || toolState.pendingDrag)) {
        // A slab edit has no preview to drop: it commits on every pointer-move,
        // so cancelling means putting the boundary back where mousedown found
        // it. The restore rides inside the still-open drag gesture (the button
        // is usually still down), so the drag and its undo collapse into one
        // history entry that ends where it began.
        const slabOrigin = toolState.slabEditOrigin;
        if (slabOrigin) {
          const floor = getFloor(activeFloorId);
          const slab = (floor?.slabs || []).find((entry) => entry.id === slabOrigin.slabId);
          if (slab && !sameBoundary(slab.boundaryPoints || [], slabOrigin.boundaryPoints)) {
            dispatch({
              type: 'SLAB_UPDATE',
              floorId: activeFloorId,
              slab: {
                id: slab.id,
                boundaryPoints: slabOrigin.boundaryPoints.map((point) => ({ x: point.x, y: point.y })),
              },
            });
          }
        }

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: false,
            pendingDrag: false,
            dragType: null,
            handle: null,
            handleIndex: null,
            startPos: null,
            originalPos: null,
            currentPos: null,
            wallDragPreview: null,
            slabEditOrigin: null,
            slabEdgeDrag: null,
          },
        });
        return;
      }

      // Escape with nothing being dragged steps back out of the finer
      // selection: the plate stays selected, the run it was looking at does
      // not. A no-op when there was no run, so it costs nothing to send.
      if (e.key === 'Escape') {
        editorDispatch({ type: 'CLEAR_OVERHANG_EDGE_SELECTION' });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedId && selectedType === 'column') {
        e.preventDefault();
        const floor = getFloor(activeFloorId);
        if (!floor) return;
        const column = (floor.columns || []).find((c) => c.id === selectedId);
        if (!column) return;
        const duplicate = duplicateColumn(column);
        dispatch({ type: 'COLUMN_DUPLICATE', floorId: activeFloorId, column: duplicate });
        editorDispatch({ type: 'SELECT_OBJECT', id: duplicate.id, objectType: 'column' });
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const floor = getFloor(activeFloorId);
        if (!floor) return;
        if (selectedType === 'wall') {
          dispatch({ type: 'WALL_DELETE', floorId: activeFloorId, wallId: selectedId });
        } else if (selectedType === 'door') {
          dispatch({ type: 'DOOR_DELETE', floorId: activeFloorId, doorId: selectedId });
        } else if (selectedType === 'window') {
          dispatch({ type: 'WINDOW_DELETE', floorId: activeFloorId, windowId: selectedId });
        } else if (selectedType === 'electricalDevice') {
          dispatch({ type: 'ELECTRICAL_DEVICE_DELETE', floorId: activeFloorId, deviceId: selectedId });
        } else if (selectedType === 'column') {
          dispatch({ type: 'COLUMN_DELETE', floorId: activeFloorId, columnId: selectedId });
        } else if (selectedType === 'fixture') {
          dispatch({ type: 'FIXTURE_DELETE', floorId: activeFloorId, fixtureId: selectedId });
        } else if (selectedType === 'beam') {
          dispatch({ type: 'BEAM_DELETE', floorId: activeFloorId, beamId: selectedId });
        } else if (selectedType === 'stair') {
          dispatch({ type: 'STAIR_DELETE', floorId: activeFloorId, stairId: selectedId });
        } else if (selectedType === 'landing') {
          dispatch({ type: 'LANDING_DELETE', floorId: activeFloorId, landingId: selectedId });
        } else if (selectedType === 'annotation') {
          dispatch({ type: 'ANNOTATION_DELETE', floorId: activeFloorId, annotationId: selectedId });
        } else if (selectedType === 'slab') {
          dispatch({ type: 'SLAB_DELETE', floorId: activeFloorId, slabId: selectedId });
        } else if (selectedType === 'railing') {
          dispatch({ type: 'RAILING_DELETE', floorId: activeFloorId, railingId: selectedId });
        } else if (selectedType === 'sectionCut') {
          dispatch({ type: 'SECTION_DELETE', floorId: activeFloorId, sectionId: selectedId });
        } else if (selectedType === 'room') {
          dispatch({ type: 'ROOM_DELETE', floorId: activeFloorId, roomId: selectedId });
        }
        editorDispatch({ type: 'DESELECT' });
      }
    },

    getCursor(toolState) {
      if (toolState.dragType === 'marquee') return 'crosshair';
      if (toolState.dragging) return 'grabbing';
      return 'default';
    },
  };
}
