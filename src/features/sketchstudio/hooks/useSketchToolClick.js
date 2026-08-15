import { useCallback } from 'react';
import { calculateDistance, pixelsToWorldUnits } from '../utils/canvasMath';
import {
  buildSourceRefFromSnap,
  createArcEntity,
  createCircleEntity,
  createAngleDimensionEntity,
  createDimensionEntity,
  createEllipseEntity,
  createFeatureEntity,
  createLineEntity,
  createPolylineEntity,
  createRectEntity,
  createTextEntity,
} from '../utils/entityUtils';
import { inferDimensionSubtype } from '../utils/dimensionUtils';
import { findTopmostEntityAtPoint } from '../utils/hitTest';
import { withIsometricPlaneMeta } from '../utils/isometricUtils';
import { getNextActiveLayer } from '../utils/layerUtils';
import { findFilletableCorner, computeSketchFillet, applyFillet, DEFAULT_FILLET_RADIUS } from '../utils/filletUtils';
import {
  applyChamfer,
  computeSketchChamfer,
  findChamferableCorner,
  DEFAULT_CHAMFER_DISTANCE,
} from '../utils/chamferUtils';
import { computeSketchTrim, isTrimmableEntity } from '../utils/trimUtils';
import { computeSketchExtend, findExtendCandidate } from '../utils/extendUtils';
import { pruneDocumentAfterEntityRemoval } from '../utils/documentEditUtils';
import { buildFastenerFeatureConfig, getHardwarePattern, resolveFastenerTargetPartId } from '../utils/fastenerUtils';
import { buildHardwarePatternFeatureConfigs } from '../utils/hardwarePatternUtils';
import { createGroupId, expandGroupedSelection } from '../utils/groupUtils';
import { closePolyline } from '../utils/profileUtils';
import { appendPolylineVertex } from '../utils/polylineUtils';
import {
  cancelDraft,
  commitEntity,
  patchDraft,
  setActiveTool,
  setDocument,
  setDocumentEntities,
  setSelection,
  setSuppressNextClick,
  showToast,
  startDraft,
} from '../store/sketchStudioActions';
import {
  PROFILE_CLOSE_TOLERANCE_PX,
  buildAngleDimensionEntityFromDraft,
  buildSketchArrayResult,
  buildSketchMirrorResult,
  isOffsettableEntity,
  resolveAngleIsometricPlane,
  mergeSelection,
  parsePositiveNumber,
  getRectEndpointFromDraft,
  getIsometricRectangleFromDraft,
  getLineEndpointFromDraft,
  getCircleRadiusPointFromDraft,
  buildOffsetEntityFromDraft,
  HIT_TOLERANCE_PX,
} from './sketchConstants';
import { commitSelectionCopyResult } from './selectionCopyCommit';

export default function useSketchToolClick(state, dispatch, viewportHook, options) {
  const { activeTool, editableEntities, draftPreview, commitPrecisionDraft, getConstrainedDraftPoint } = options;
  const { readCanvasPoint, getOrthoReferencePoint, resolvePointerState } = viewportHook;

  const handleCanvasClick = useCallback(
    (event) => {
      if (state.interaction.suppressNextClick) {
        dispatch(setSuppressNextClick(false));
        return;
      }
      if (event.button !== 0) return;

      const screenPoint = readCanvasPoint(event);
      const draftAnchor = getOrthoReferencePoint(state.draft.type, state.draft);
      const { worldPoint, snap, hoveredEntity } = resolvePointerState(screenPoint, state.viewport, {
        anchorPoint: draftAnchor,
      });
      const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

      if (activeTool === 'select') {
        const nextSelectionIds = expandGroupedSelection(
          editableEntities,
          hoveredEntity ? [hoveredEntity.id] : [],
          state.document.groupIndex,
        );

        dispatch(setSelection(mergeSelection(state.selection.selectedIds, nextSelectionIds, event.shiftKey)));
        return;
      }

      if (activeTool === 'fillet') {
        const filletTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX * 2, state.viewport.zoom);
        const filletRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
        const corner = findFilletableCorner(state.document.entities, worldPoint, filletTolerance);
        if (corner) {
          const geometry = computeSketchFillet(corner, filletRadius);
          if (geometry) {
            dispatch(setDocumentEntities(applyFillet(state.document.entities, corner, geometry, targetLayerId)));
            dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
          }
        }
        return;
      }

      if (activeTool === 'chamfer') {
        const chamferTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX * 2, state.viewport.zoom);
        const chamferDistance = parsePositiveNumber(state.draft.precisionInput?.distance) ?? DEFAULT_CHAMFER_DISTANCE;
        const corner = findChamferableCorner(state.document.entities, worldPoint, chamferTolerance);
        if (corner) {
          const geometry = computeSketchChamfer(corner, chamferDistance);
          if (geometry) {
            dispatch(setDocumentEntities(applyChamfer(state.document.entities, corner, geometry, targetLayerId)));
            dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
          }
        }
        return;
      }

      // Trim replaces the clicked entity, so the whole document goes through the
      // referential clean-up (joints pruned, group membership normalised) in one
      // dispatch — one gesture, one undo entry.
      if (activeTool === 'trim') {
        const trimTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX, state.viewport.zoom);
        const target = findTopmostEntityAtPoint(editableEntities.filter(isTrimmableEntity), worldPoint, trimTolerance);
        if (!target) return;
        const result = computeSketchTrim(state.document.entities, target, worldPoint);
        if (!result) return;
        dispatch(setDocument(pruneDocumentAfterEntityRemoval(state.document, result.entities, result.removedIds)));
        if (state.selection.selectedIds.includes(target.id)) {
          dispatch(setSelection(state.selection.selectedIds.filter((entityId) => entityId !== target.id)));
        }
        dispatch(patchDraft({ trimPreview: null, trimTargetId: null }));
        return;
      }

      if (activeTool === 'extend') {
        const extendTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX * 2, state.viewport.zoom);
        const candidate = findExtendCandidate(editableEntities, worldPoint, extendTolerance);
        if (!candidate) {
          dispatch(showToast('Click near the free end of a line, arc, or open polyline'));
          return;
        }
        const result = computeSketchExtend(state.document.entities, candidate);
        if (!result) {
          dispatch(showToast('Nothing lies in the path of that extension'));
          return;
        }
        dispatch(setDocumentEntities(result.entities));
        dispatch(patchDraft({ extendPreview: null }));
        return;
      }

      if (activeTool === 'mirror') {
        const point = snap.point ?? worldPoint;

        if (!state.draft.type) {
          if (!state.selection.selectedIds.length) {
            dispatch(showToast('Select the entities to mirror first'));
            return;
          }

          // Picking a line entity uses that whole line as the axis: its two
          // endpoints define the mirror in a single click.
          if (hoveredEntity?.type === 'line' && !snap.point) {
            commitSelectionCopyResult(
              dispatch,
              buildSketchMirrorResult({
                entities: state.document.entities,
                draft: state.draft,
                selectedIds: state.selection.selectedIds,
                axisStart: { x: hoveredEntity.x1, y: hoveredEntity.y1 },
                axisEnd: { x: hoveredEntity.x2, y: hoveredEntity.y2 },
              }),
              'Nothing in the selection can be mirrored',
            );
            return;
          }

          dispatch(
            startDraft({
              type: 'mirror',
              step: 'pickAxisEnd',
              startPoint: point,
              currentPoint: point,
              points: [point],
              selectionIds: [...state.selection.selectedIds],
            }),
          );
          return;
        }

        commitSelectionCopyResult(
          dispatch,
          buildSketchMirrorResult({
            entities: state.document.entities,
            draft: state.draft,
            selectedIds: state.selection.selectedIds,
            axisStart: state.draft.points[0],
            axisEnd: point,
          }),
          'Nothing in the selection can be mirrored',
        );
        return;
      }

      if (activeTool === 'array') {
        const point = snap.point ?? worldPoint;

        if (!state.draft.type) {
          if (!state.selection.selectedIds.length) {
            dispatch(showToast('Select the entities to array first'));
            return;
          }

          dispatch(
            startDraft({
              type: 'array',
              step: state.ui.arrayMode === 'polar' ? 'pickCount' : 'pickSecond',
              startPoint: point,
              currentPoint: point,
              points: [point],
              selectionIds: [...state.selection.selectedIds],
            }),
          );
          return;
        }

        commitSelectionCopyResult(
          dispatch,
          buildSketchArrayResult({
            entities: state.document.entities,
            draft: state.draft,
            selectedIds: state.selection.selectedIds,
            arrayMode: state.ui.arrayMode,
            targetPoint: point,
          }),
          'Nothing in the selection can be arrayed',
        );
        return;
      }

      if (activeTool === 'offset') {
        if (!state.draft.type) {
          if (!isOffsettableEntity(hoveredEntity)) return;
          dispatch(
            startDraft({
              type: 'offset',
              step: 'pickDistance',
              currentPoint: worldPoint,
              sourceEntityId: hoveredEntity.id,
              sourceEntityType: hoveredEntity.type,
              points: [worldPoint],
            }),
          );
          return;
        }
        const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);
        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        } else {
          dispatch(cancelDraft());
        }
        return;
      }

      if (activeTool === 'text') {
        const point = snap.point ?? worldPoint;

        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'text',
              step: 'placeLabel',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }

        const nextEntity = createTextEntity(worldPoint, state.document.entities, targetLayerId, {
          leader: {
            target: state.draft.points[0],
          },
        });
        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
          dispatch(setSelection([nextEntity.id]));
          dispatch(setActiveTool('select'));
        }
        return;
      }

      // Fasteners place on a single click: the hole is sized by the active
      // catalog item, never by dragging, so there is no draft to finish.
      if (activeTool === 'fastener') {
        const pattern = getHardwarePattern(state.ui.activeHardwareId);

        // Pattern hardware (hinges, handles) drills its whole boring pattern in
        // one click: every hole lands as its own feature, the set shares a
        // group so it selects and deletes together, and the single
        // SET_DOCUMENT_ENTITIES commit keeps it one undo step.
        if (pattern) {
          const targetPartId = resolveFastenerTargetPartId(hoveredEntity);
          const configs = buildHardwarePatternFeatureConfigs(pattern, snap.point ?? worldPoint, hoveredEntity, {
            targetPartId,
          });
          const groupId = createGroupId(state.document.entities);

          let nextEntities = state.document.entities;
          const placed = [];
          for (const config of configs) {
            const entity = createFeatureEntity(
              { ...config, meta: { ...config.meta, groupId } },
              nextEntities,
              targetLayerId,
            );
            if (!entity) {
              break;
            }
            placed.push(entity);
            nextEntities = [...nextEntities, entity];
          }

          if (placed.length && placed.length === configs.length) {
            dispatch(setDocumentEntities(nextEntities));
            dispatch(setSelection(placed.map((entity) => entity.id)));
          } else {
            dispatch(cancelDraft());
          }
          return;
        }

        const nextEntity = createFeatureEntity(
          buildFastenerFeatureConfig(state.ui.activeHardwareId, snap.point ?? worldPoint, {
            targetPartId: resolveFastenerTargetPartId(hoveredEntity),
          }),
          state.document.entities,
          targetLayerId,
        );

        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        } else {
          dispatch(cancelDraft());
        }
        return;
      }

      if (['line', 'rect', 'circle', 'holeCircle', 'cutoutRect'].includes(activeTool)) {
        const draftPoint = state.draft.startPoint
          ? getConstrainedDraftPoint(activeTool, state.draft, snap.point ?? worldPoint)
          : (snap.point ?? worldPoint);

        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: activeTool,
              step: 'pickEnd',
              startPoint: draftPoint,
              currentPoint: draftPoint,
              points: [draftPoint],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }

        if (activeTool === 'holeCircle') {
          const nextEntity = createFeatureEntity(
            {
              featureType: 'hole',
              shape: state.ui.viewMode === 'isometric' ? 'ellipse' : 'circle',
              cx: draftPreview?.cx ?? state.draft.startPoint.x,
              cy: draftPreview?.cy ?? state.draft.startPoint.y,
              diameter: draftPreview?.diameter,
              rx: draftPreview?.rx,
              ry: draftPreview?.ry,
              rotation: draftPreview?.rotation,
              meta:
                state.ui.viewMode === 'isometric'
                  ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane }
                  : {},
            },
            state.document.entities,
            targetLayerId,
          );
          if (nextEntity) {
            dispatch(commitEntity(nextEntity));
          } else {
            dispatch(cancelDraft());
          }
          return;
        }

        if (activeTool === 'cutoutRect') {
          const nextEntity = createFeatureEntity(
            {
              featureType: 'cutout',
              shape: state.ui.viewMode === 'isometric' ? 'polygon' : 'rect',
              x: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.x, draftPreview.endPoint.x) : undefined,
              y: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.y, draftPreview.endPoint.y) : undefined,
              width:
                draftPreview?.width ??
                (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.x - draftPreview.startPoint.x) : undefined),
              height:
                draftPreview?.height ??
                (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.y - draftPreview.startPoint.y) : undefined),
              points: draftPreview?.points,
              meta:
                state.ui.viewMode === 'isometric'
                  ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane }
                  : {},
            },
            state.document.entities,
            targetLayerId,
          );
          if (nextEntity) {
            dispatch(commitEntity(nextEntity));
          } else {
            dispatch(cancelDraft());
          }
          return;
        }

        const nextEntity =
          activeTool === 'line'
            ? withIsometricPlaneMeta(
                createLineEntity(
                  state.draft.startPoint,
                  getLineEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }),
                  state.document.entities,
                  targetLayerId,
                ),
                state.ui.viewMode,
                state.ui.isometricPlane,
              )
            : activeTool === 'rect'
              ? state.ui.viewMode === 'isometric'
                ? (() => {
                    const shape = getIsometricRectangleFromDraft(
                      { ...state.draft, currentPoint: draftPoint },
                      state.ui.isometricPlane,
                    );
                    const base = shape
                      ? createPolylineEntity(shape.points, state.document.entities, targetLayerId, true)
                      : null;
                    return base
                      ? {
                          ...base,
                          meta: {
                            ...(base.meta || {}),
                            projectionMode: 'isometric',
                            isometricPlane: state.ui.isometricPlane,
                          },
                        }
                      : null;
                  })()
                : createRectEntity(
                    state.draft.startPoint,
                    getRectEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }),
                    state.document.entities,
                    targetLayerId,
                  )
              : state.ui.viewMode === 'isometric'
                ? createEllipseEntity(state.draft.startPoint, draftPoint, state.document.entities, targetLayerId, {
                    plane: state.ui.isometricPlane,
                    radius:
                      parsePositiveNumber(state.draft.precisionInput.radius) ??
                      calculateDistance(state.draft.startPoint, draftPoint),
                    meta: { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane },
                  })
                : createCircleEntity(
                    state.draft.startPoint,
                    getCircleRadiusPointFromDraft({ ...state.draft, currentPoint: draftPoint }),
                    state.document.entities,
                    targetLayerId,
                  );
        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        } else {
          dispatch(cancelDraft());
        }
        return;
      }

      if (activeTool === 'polyline') {
        const nextPoint = state.draft.points.length
          ? getConstrainedDraftPoint('polyline', state.draft, snap.point ?? worldPoint)
          : (snap.point ?? worldPoint);
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'polyline',
              step: 'append',
              startPoint: nextPoint,
              currentPoint: nextPoint,
              points: [nextPoint],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
              closedPreview: false,
            }),
          );
          return;
        }
        const lastPoint = state.draft.points.at(-1);
        if (lastPoint && lastPoint.x === nextPoint.x && lastPoint.y === nextPoint.y) return;
        if (
          state.draft.points.length >= 3 &&
          calculateDistance(state.draft.points[0], nextPoint) <=
            pixelsToWorldUnits(PROFILE_CLOSE_TOLERANCE_PX, state.viewport.zoom)
        ) {
          const nextEntity = closePolyline(
            withIsometricPlaneMeta(
              createPolylineEntity(state.draft.points, state.document.entities, targetLayerId, true),
              state.ui.viewMode,
              state.ui.isometricPlane,
            ),
          );
          if (nextEntity) dispatch(commitEntity(nextEntity));
          return;
        }
        dispatch(
          patchDraft({
            points: appendPolylineVertex(state.draft.points, nextPoint),
            currentPoint: nextPoint,
            sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
            closedPreview: false,
          }),
        );
        return;
      }

      if (activeTool === 'arc') {
        const point = snap.point ?? worldPoint;
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'arc',
              step: 'pickEnd',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        if (state.draft.step === 'pickEnd') {
          dispatch(
            patchDraft({
              step: 'pickControl',
              points: [state.draft.points[0], point],
              currentPoint: point,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        const nextEntity = createArcEntity(
          state.draft.points[0],
          state.draft.points[1],
          point,
          state.document.entities,
          targetLayerId,
        );
        if (nextEntity) dispatch(commitEntity(nextEntity));
        return;
      }

      if (activeTool === 'dimension') {
        const point = snap.point ?? worldPoint;
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'dimension',
              step: 'pickSecond',
              currentPoint: point,
              points: [point],
              subtype: null,
              sourceRefs: [buildSourceRefFromSnap(snap)],
            }),
          );
          return;
        }
        if (state.draft.step === 'pickSecond') {
          dispatch(
            patchDraft({
              step: 'place',
              points: [state.draft.points[0], point],
              subtype: inferDimensionSubtype(state.draft.points[0], point),
              currentPoint: worldPoint,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)],
            }),
          );
          return;
        }
        dispatch(
          commitEntity(
            createDimensionEntity({
              p1: state.draft.points[0],
              p2: state.draft.points[1],
              placementPoint: worldPoint,
              units: state.document.units,
              entities: state.document.entities,
              sourceRefs: state.draft.sourceRefs,
              layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId,
              subtype: state.draft.subtype,
            }),
          ),
        );
      }

      if (activeTool === 'angle') {
        const point = snap.point ?? worldPoint;
        const tolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX, state.viewport.zoom);
        const hitEntity = findTopmostEntityAtPoint(editableEntities, worldPoint, tolerance);
        const isLineHit = hitEntity && (hitEntity.type === 'line' || hitEntity.type === 'polyline');

        // Line-to-line shortcut: click two lines -> auto-compute intersection + angle
        if (!state.draft.type && isLineHit) {
          dispatch(
            startDraft({
              type: 'angle',
              step: 'pickLine2',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)],
              lineEntity1: hitEntity,
            }),
          );
          return;
        }
        if (state.draft.step === 'pickLine2' && isLineHit && hitEntity.id !== state.draft.lineEntity1?.id) {
          const line1 = state.draft.lineEntity1;
          const a1 = { x: line1.x1, y: line1.y1 };
          const a2 = { x: line1.x2, y: line1.y2 };
          const b1 = { x: hitEntity.x1, y: hitEntity.y1 };
          const b2 = { x: hitEntity.x2, y: hitEntity.y2 };
          // Compute ray intersection (extend lines infinitely)
          const dax = a2.x - a1.x;
          const day = a2.y - a1.y;
          const dbx = b2.x - b1.x;
          const dby = b2.y - b1.y;
          const denom = dax * dby - day * dbx;
          if (Math.abs(denom) > 1e-6) {
            const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
            const vertex = { x: a1.x + t * dax, y: a1.y + t * day };
            // Pick points on each line away from vertex for the arc
            const distA = Math.max(calculateDistance(vertex, a1), calculateDistance(vertex, a2));
            const distB = Math.max(calculateDistance(vertex, b1), calculateDistance(vertex, b2));
            const arcRadius = Math.min(distA, distB, 60) * 0.5;
            const p1 = calculateDistance(vertex, a2) > calculateDistance(vertex, a1) ? a2 : a1;
            const p2 = calculateDistance(vertex, b2) > calculateDistance(vertex, b1) ? b2 : b1;
            const isoPlane = resolveAngleIsometricPlane(vertex, p1, p2, state.ui.viewMode, state.ui.isometricPlane, [
              line1,
              hitEntity,
            ]);
            dispatch(
              commitEntity(
                createAngleDimensionEntity({
                  vertex,
                  p1,
                  p2,
                  arcRadius: Math.max(arcRadius, 20),
                  entities: state.document.entities,
                  // Every point here is derived from the two hit lines, not from
                  // the snap under the cursor: no slot has a source ref.
                  sourceRefs: [],
                  layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId,
                  isometricPlane: isoPlane,
                }),
              ),
            );
            return;
          }
          // Lines are parallel -- fall through to manual mode
        }

        // Manual 3-click mode (fallback: click empty space or non-line entities)
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'angle',
              step: 'pickVertex',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)],
            }),
          );
          return;
        }
        if (state.draft.step === 'pickVertex') {
          dispatch(
            patchDraft({
              step: 'pickSecond',
              points: [state.draft.points[0], point],
              currentPoint: worldPoint,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)],
            }),
          );
          return;
        }
        if (state.draft.step === 'pickLine2') {
          dispatch(
            patchDraft({
              step: 'pickSecond',
              points: [state.draft.points[0], point],
              currentPoint: worldPoint,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)],
              lineEntity1: undefined,
            }),
          );
          return;
        }
        if (state.draft.step === 'pickSecond') {
          const inputAngle = parsePositiveNumber(state.draft.precisionInput?.angle);
          const p2SourceRef = inputAngle != null ? null : buildSourceRefFromSnap(snap);
          const nextEntity = buildAngleDimensionEntityFromDraft({
            draft: state.draft,
            referencePoint: point,
            document: state.document,
            targetLayerId,
            sourceRefs: [...state.draft.sourceRefs, p2SourceRef],
            viewMode: state.ui.viewMode,
            isometricPlane: state.ui.isometricPlane,
          });
          if (nextEntity) dispatch(commitEntity(nextEntity));
        }
      }
    },
    [
      activeTool,
      dispatch,
      draftPreview,
      editableEntities,
      getConstrainedDraftPoint,
      getOrthoReferencePoint,
      readCanvasPoint,
      resolvePointerState,
      state.document,
      state.draft,
      state.interaction.suppressNextClick,
      state.selection.selectedIds,
      state.ui.activeHardwareId,
      state.ui.activeLayerId,
      state.ui.arrayMode,
      state.ui.isometricPlane,
      state.ui.viewMode,
      state.viewport,
    ],
  );

  return { handleCanvasClick };
}
