import { useCallback } from 'react';
import { cancelDraft, commitEntity } from '../store/sketchStudioActions';
import {
  createCircleEntity,
  createEllipseEntity,
  createFeatureEntity,
  createLineEntity,
  createPolylineEntity,
  createRectEntity,
} from '../utils/entityUtils';
import { getNextActiveLayer } from '../utils/layerUtils';
import { withIsometricPlaneMeta } from '../utils/isometricUtils';
import { buildFastenerFeatureConfig } from '../utils/fastenerUtils';
import {
  buildAngleDimensionEntityFromDraft,
  buildOffsetEntityFromDraft,
  buildSketchArrayResult,
  buildSketchMirrorResult,
} from './sketchConstants';
import { commitSelectionCopyResult } from './selectionCopyCommit';

export default function useSketchDraftCommit(state, dispatch, draftPreview) {
  const commitPrecisionDraft = useCallback(() => {
    if (!state.draft.type || !draftPreview) return;

    const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

    if (state.draft.type === 'line') {
      const nextEntity = withIsometricPlaneMeta(
        createLineEntity(
          state.draft.startPoint,
          { x: draftPreview.x2, y: draftPreview.y2 },
          state.document.entities,
          targetLayerId,
        ),
        state.ui.viewMode,
        state.ui.isometricPlane,
      );
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'rect') {
      const nextEntity =
        state.ui.viewMode === 'isometric'
          ? (() => {
              const baseEntity = createPolylineEntity(
                draftPreview.points,
                state.document.entities,
                targetLayerId,
                true,
              );
              return baseEntity
                ? {
                    ...baseEntity,
                    meta: {
                      ...(baseEntity.meta || {}),
                      projectionMode: 'isometric',
                      isometricPlane: state.ui.isometricPlane,
                    },
                  }
                : null;
            })()
          : createRectEntity(draftPreview.startPoint, draftPreview.endPoint, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'circle') {
      const nextEntity =
        state.ui.viewMode === 'isometric'
          ? createEllipseEntity(
              { x: draftPreview.cx, y: draftPreview.cy },
              { x: draftPreview.cx + draftPreview.rx, y: draftPreview.cy },
              state.document.entities,
              targetLayerId,
              {
                plane: state.ui.isometricPlane,
                radius: draftPreview.radius,
                meta: { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane },
              },
            )
          : createCircleEntity(draftPreview.center, draftPreview.radiusPoint, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'holeCircle') {
      const nextEntity = createFeatureEntity(
        {
          featureType: 'hole',
          shape: state.ui.viewMode === 'isometric' ? 'ellipse' : 'circle',
          cx: draftPreview.cx,
          cy: draftPreview.cy,
          diameter: draftPreview.diameter,
          rx: draftPreview.rx,
          ry: draftPreview.ry,
          rotation: draftPreview.rotation,
          meta:
            state.ui.viewMode === 'isometric'
              ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane }
              : {},
        },
        state.document.entities,
        targetLayerId,
      );
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    // Enter drops the fastener at the previewed cursor point; the catalog item
    // supplies the pilot diameter and the drilling defaults.
    if (state.draft.type === 'fastener') {
      const nextEntity = createFeatureEntity(
        buildFastenerFeatureConfig(state.ui.activeHardwareId, { x: draftPreview.cx, y: draftPreview.cy }),
        state.document.entities,
        targetLayerId,
      );
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'cutoutRect') {
      const nextEntity = createFeatureEntity(
        {
          featureType: 'cutout',
          shape: state.ui.viewMode === 'isometric' ? 'polygon' : 'rect',
          x: draftPreview.startPoint ? Math.min(draftPreview.startPoint.x, draftPreview.endPoint.x) : undefined,
          y: draftPreview.startPoint ? Math.min(draftPreview.startPoint.y, draftPreview.endPoint.y) : undefined,
          width:
            draftPreview.width ??
            (draftPreview.startPoint ? Math.abs(draftPreview.endPoint.x - draftPreview.startPoint.x) : undefined),
          height:
            draftPreview.height ??
            (draftPreview.startPoint ? Math.abs(draftPreview.endPoint.y - draftPreview.startPoint.y) : undefined),
          points: draftPreview.points,
          meta:
            state.ui.viewMode === 'isometric'
              ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane }
              : {},
        },
        state.document.entities,
        targetLayerId,
      );
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    // The precision HUD keeps focus while the angle is typed, so the global
    // Enter binding never sees the key: this is the angle tool's only commit
    // path from the input.
    if (state.draft.type === 'angle') {
      const nextEntity = buildAngleDimensionEntityFromDraft({
        draft: state.draft,
        referencePoint: state.draft.currentPoint,
        document: state.document,
        targetLayerId,
        sourceRefs: state.draft.sourceRefs ?? [],
        viewMode: state.ui.viewMode,
        isometricPlane: state.ui.isometricPlane,
      });
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    // Enter is the polar array's primary commit: its count and total angle both
    // live in the HUD, which holds focus, so the global Enter binding never sees
    // the key.
    if (state.draft.type === 'array') {
      commitSelectionCopyResult(
        dispatch,
        buildSketchArrayResult({
          entities: state.document.entities,
          draft: state.draft,
          selectedIds: state.selection?.selectedIds ?? [],
          arrayMode: state.ui.arrayMode,
          targetPoint: state.draft.currentPoint,
        }),
        'Nothing in the selection can be arrayed',
      );
      return;
    }

    if (state.draft.type === 'mirror') {
      commitSelectionCopyResult(
        dispatch,
        buildSketchMirrorResult({
          entities: state.document.entities,
          draft: state.draft,
          selectedIds: state.selection?.selectedIds ?? [],
          axisStart: state.draft.points?.[0],
          axisEnd: state.draft.currentPoint,
        }),
        'Nothing in the selection can be mirrored',
      );
      return;
    }

    if (state.draft.type === 'offset') {
      const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);
      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      } else {
        dispatch(cancelDraft());
      }
    }
  }, [
    dispatch,
    draftPreview,
    state.document,
    state.draft,
    state.selection,
    state.ui.activeHardwareId,
    state.ui.activeLayerId,
    state.ui.arrayMode,
    state.ui.isometricPlane,
    state.ui.viewMode,
  ]);

  return { commitPrecisionDraft };
}
