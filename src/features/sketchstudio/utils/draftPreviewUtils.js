import { getRectCorners, normalizeRectFromPoints } from './entityUtils';

export function getRectDraftPreviewPolygonPoints(draftPreview) {
  if (!draftPreview || draftPreview.type !== 'rect') {
    return null;
  }

  if (draftPreview.startPoint && draftPreview.endPoint) {
    const previewRect = normalizeRectFromPoints(draftPreview.startPoint, draftPreview.endPoint);
    return [
      { x: previewRect.x, y: previewRect.y },
      { x: previewRect.x + previewRect.width, y: previewRect.y },
      { x: previewRect.x + previewRect.width, y: previewRect.y + previewRect.height },
      { x: previewRect.x, y: previewRect.y + previewRect.height },
    ];
  }

  if (
    Number.isFinite(draftPreview.x)
    && Number.isFinite(draftPreview.y)
    && Number.isFinite(draftPreview.width)
    && Number.isFinite(draftPreview.height)
  ) {
    const corners = getRectCorners(draftPreview);
    return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  }

  return null;
}
