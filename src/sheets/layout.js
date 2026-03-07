import { getSheetDisplayLabel } from '@/domain/sheetModels';
import { getPaperPreset } from './paper';
import { getViewportSourceLabel, resolveSheetViewportSource } from './sources';

const SHEET_MARGIN = 12;
const TITLE_BLOCK_HEIGHT = 32;
const CONTENT_PADDING = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveViewportScale(viewport) {
  return Math.max(1, viewport.scale || 100);
}

function buildTitleBlock(project, sheet, paper) {
  const titleBlockWidth = Math.min(130, paper.width * 0.42);
  const x = paper.width - SHEET_MARGIN - titleBlockWidth;
  const y = paper.height - SHEET_MARGIN - TITLE_BLOCK_HEIGHT;

  return {
    x,
    y,
    width: titleBlockWidth,
    height: TITLE_BLOCK_HEIGHT,
    rows: [
      { label: 'Drawing', value: sheet.drawingName || getSheetDisplayLabel(sheet) },
      { label: 'Project', value: sheet.projectNameOverride || project.name || 'Untitled Project' },
      { label: 'Scale', value: sheet.scaleLabel || 'As noted' },
    ],
  };
}

function resolveViewportTitle(viewport, source) {
  return viewport.title?.trim() || source.title || getViewportSourceLabel(viewport.sourceView);
}

function buildViewportFrame(viewport, source) {
  const bounds = source.bounds || { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
  const scale = 1 / resolveViewportScale(viewport);
  const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
  const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
  const innerWidth = Math.max(10, viewport.width - CONTENT_PADDING * 2);
  const innerHeight = Math.max(10, viewport.height - CONTENT_PADDING * 2);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;

  const translateX = Math.max(0, (innerWidth - drawnWidth) / 2) - bounds.minX * scale;
  const translateY = Math.max(0, (innerHeight - drawnHeight) / 2) - bounds.minY * scale;

  return {
    ...viewport,
    title: resolveViewportTitle(viewport, source),
    source,
    clipRect: {
      x: viewport.x + CONTENT_PADDING,
      y: viewport.y + CONTENT_PADDING,
      width: innerWidth,
      height: innerHeight,
    },
    contentTransform: {
      translateX,
      translateY,
      scale,
    },
  };
}

export function buildSheetScene(project, sheet) {
  if (!sheet) return null;

  const paper = getPaperPreset(sheet.paperSize);
  const titleBlock = buildTitleBlock(project, sheet, paper);
  const contentArea = {
    x: SHEET_MARGIN,
    y: SHEET_MARGIN,
    width: paper.width - SHEET_MARGIN * 2,
    height: paper.height - SHEET_MARGIN * 2,
  };

  const viewports = (sheet.viewports || []).map((viewport) => (
    buildViewportFrame(viewport, resolveSheetViewportSource(project, viewport))
  ));

  return {
    paper,
    title: getSheetDisplayLabel(sheet),
    border: {
      x: SHEET_MARGIN,
      y: SHEET_MARGIN,
      width: paper.width - SHEET_MARGIN * 2,
      height: paper.height - SHEET_MARGIN * 2,
    },
    contentArea,
    titleBlock,
    viewports,
  };
}

export function fitViewportToSheet(viewport, sheet) {
  const paper = getPaperPreset(sheet.paperSize);
  const width = clamp(viewport.width, 40, paper.width - SHEET_MARGIN * 2);
  const height = clamp(viewport.height, 30, paper.height - SHEET_MARGIN * 2 - TITLE_BLOCK_HEIGHT);
  const maxX = paper.width - SHEET_MARGIN - width;
  const maxY = paper.height - SHEET_MARGIN - height;

  return {
    ...viewport,
    width,
    height,
    x: clamp(viewport.x, SHEET_MARGIN, maxX),
    y: clamp(viewport.y, SHEET_MARGIN, maxY),
  };
}

export function getDefaultViewportRect(sheet, source, scale = 100) {
  const paper = getPaperPreset(sheet.paperSize);
  const bounds = source.bounds || { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
  const denom = Math.max(1, scale);
  const width = Math.max(70, Math.min((bounds.maxX - bounds.minX) / denom + CONTENT_PADDING * 2, paper.width - SHEET_MARGIN * 2));
  const height = Math.max(50, Math.min((bounds.maxY - bounds.minY) / denom + CONTENT_PADDING * 2, paper.height - SHEET_MARGIN * 2 - TITLE_BLOCK_HEIGHT));
  return {
    x: SHEET_MARGIN + 8,
    y: SHEET_MARGIN + 8,
    width,
    height,
  };
}
