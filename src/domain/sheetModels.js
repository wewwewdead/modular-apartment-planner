import { generateId } from './ids';

export function createSheet(title = 'Sheet 1', options = {}) {
  return {
    id: generateId('sheet'),
    title,
    paperSize: options.paperSize ?? 'A3_LANDSCAPE',
    scaleLabel: options.scaleLabel ?? '1:100',
    drawingName: options.drawingName ?? title,
    projectNameOverride: options.projectNameOverride ?? '',
    viewports: (options.viewports || []).map((viewport) => ({ ...viewport })),
  };
}

export function createSheetViewport(sourceView = 'plan', sourceFloorId = null, options = {}) {
  return {
    id: generateId('viewport'),
    sourceView,
    sourceFloorId,
    sourceRefId: options.sourceRefId ?? null,
    x: options.x ?? 20,
    y: options.y ?? 20,
    width: options.width ?? 160,
    height: options.height ?? 100,
    scale: options.scale ?? 100,
    title: options.title ?? '',
    rotation: options.rotation ?? 0,
  };
}

export function getSheetDisplayLabel(sheet, index = 0) {
  const title = sheet?.title?.trim();
  return title || `Sheet ${index + 1}`;
}
