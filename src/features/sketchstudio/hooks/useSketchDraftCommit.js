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
import { buildOffsetEntityFromDraft } from './sketchConstants';

export default function useSketchDraftCommit(state, dispatch, draftPreview) {
  const commitPrecisionDraft = useCallback(() => {
    if (!state.draft.type || !draftPreview) return;

    const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

    if (state.draft.type === 'line') {
      const nextEntity = createLineEntity(
        state.draft.startPoint,
        { x: draftPreview.x2, y: draftPreview.y2 },
        state.document.entities,
        targetLayerId,
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

    if (state.draft.type === 'offset') {
      const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);
      if (nextEntity) {
        dispatch(commitEntity(nextEntity));
      } else {
        dispatch(cancelDraft());
      }
    }
  }, [dispatch, draftPreview, state.document, state.draft, state.ui.activeLayerId, state.ui.isometricPlane, state.ui.viewMode]);

  return { commitPrecisionDraft };
}
