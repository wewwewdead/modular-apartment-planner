import { generateId } from './ids';

export function createSheetRevision(options = {}) {
  return {
    id: generateId('revision'),
    code: options.code ?? '',
    date: options.date ?? '',
    description: options.description ?? '',
  };
}

export function createSheet(title = 'Sheet 1', options = {}) {
  return {
    id: generateId('sheet'),
    title,
    paperSize: options.paperSize ?? 'A3_LANDSCAPE',
    number: options.number ?? '',
    issueDate: options.issueDate ?? '',
    scaleLabel: options.scaleLabel ?? '1:100',
    scaleMode: options.scaleMode ?? 'custom',
    layoutTemplate: options.layoutTemplate ?? 'auto',
    drawingName: options.drawingName ?? title,
    projectNameOverride: options.projectNameOverride ?? '',
    titleBlock: {
      projectTitleOverride: options.titleBlock?.projectTitleOverride ?? '',
      projectAddressOverride: options.titleBlock?.projectAddressOverride ?? '',
      drawnBy: options.titleBlock?.drawnBy ?? '',
      checkedBy: options.titleBlock?.checkedBy ?? '',
    },
    revisions: (options.revisions || []).map((revision) => ({
      ...createSheetRevision(),
      ...revision,
    })),
    viewports: (options.viewports || []).map((viewport) => ({ ...viewport })),
  };
}

export function createSheetViewport(sourceView = 'plan', sourceFloorId = null, options = {}) {
  const defaultRole = sourceView === '3d_preview'
    ? 'supplemental'
    : (sourceView === 'plan' ? 'primary' : 'secondary');

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
    role: options.role ?? defaultRole,
    captionPosition: options.captionPosition ?? 'below',
    referenceNote: options.referenceNote ?? '',
    lockAutoLayout: options.lockAutoLayout ?? false,
  };
}

export function getSheetDisplayLabel(sheet, index = 0) {
  const title = sheet?.title?.trim();
  return title || `Sheet ${index + 1}`;
}

export function getSheetNumberLabel(sheet, index = 0) {
  const number = sheet?.number?.trim();
  return number || `A${String(index + 1).padStart(2, '0')}`;
}
