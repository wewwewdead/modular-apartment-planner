import { getSheetDisplayLabel, getSheetNumberLabel } from '@/domain/sheetModels';
import { formatMeasurementValue } from '@/annotations/policy';

export const SHEET_TOKENS = {
  margin: 12,
  innerInset: 4,
  contentGap: 6,
  footerHeight: 54,
  titleBlockWidth: 154,
  viewportPadding: 4,
  viewportGutter: 6,
  viewportCaptionGap: 3,
  viewportCaptionHeight: 11,
  viewportMinWidth: 72,
  viewportMinHeight: 64,
  viewportGrid: 4,
  viewportHandleSize: 4,
};

export const SHEET_COLORS = {
  sheetBackdrop: '#edf1f4',
  paper: '#ffffff',
  border: '#25303b',
  borderMuted: '#78838f',
  divider: '#c8d0d8',
  panelFill: '#fbfcfd',
  text: '#1b232c',
  textMuted: '#5d6975',
  textFaint: '#8f9ba6',
  mask: '#ffffff',
};

export const DRAWING_GRAPHICS = {
  plan: {
    slabEdge: { fill: 'none', stroke: '#677280', strokeWidth: 0.9 },
    roomFill: { fill: '#f6f8fa', fillOpacity: 1 },
    cutFill: '#dbe1e7',
    cutStroke: '#1f2833',
    cutStrokeWidth: 1.45,
    objectFill: '#eff2f5',
    objectStroke: '#3a4450',
    objectStrokeWidth: 1,
    secondaryStroke: '#6f7c89',
    secondaryStrokeWidth: 0.75,
    hiddenStroke: '#8d98a3',
    hiddenStrokeWidth: 0.65,
    hiddenDash: '4 3',
    markerStroke: '#1f2833',
    markerStrokeWidth: 1.4,
  },
  section: {
    cutFill: '#cfd6de',
    cutStroke: '#1f2833',
    cutStrokeWidth: 1.7,
    projectionFill: '#f6f7f8',
    projectionStroke: '#7b8793',
    projectionStrokeWidth: 0.9,
    groundStroke: '#6a7581',
    groundDash: '8 5',
  },
  elevation: {
    fill: '#f7f8fa',
    accentFill: '#dfe5ea',
    accentStroke: '#36404b',
    accentStrokeWidth: 1,
    lineStroke: '#4f5a66',
    lineStrokeWidth: 0.95,
    groundStroke: '#6a7581',
    groundDash: '8 5',
  },
  annotation: {
    dimensionStroke: '#48525e',
    dimensionExtension: '#6d7884',
    dimensionStrokeWidth: 0.78,
    dimensionExtensionWidth: 0.65,
    text: '#26303a',
    textMuted: '#5b6671',
    textSize: 128,
    roomNameSize: 150,
    roomAreaSize: 112,
    textMaskPaddingX: 56,
    textMaskPaddingY: 30,
    calloutStroke: '#1f2833',
    calloutStrokeWidth: 1.25,
    calloutFill: '#ffffff',
  },
};

/**
 * The rendered-plan look the interactive canvas draws by default: tinted zones,
 * solid structural walls, shaded furniture, on a white card. Never used by the
 * sheets or the exporters — they render without a plan-style provider, which
 * means drafting (see `PlanStyleContext`).
 *
 * Hierarchy is the whole idea. Solid walls are the darkest thing on the plan;
 * partitions are visibly lighter and thinner; zone tints are muted and sit
 * behind everything; text is confident but quiet.
 */
export const PRESENTATION_GRAPHICS = {
  plan: {
    wallSolidFill: '#2b2f36',
    wallSolidStroke: '#1a1d22',
    wallSolidStrokeWidth: 0.6,
    wallPartitionFill: '#ffffff',
    wallPartitionStroke: '#2b2f36',
    wallPartitionStrokeWidth: 1,
    columnFill: '#2b2f36',
    zoneFill: {
      private: '#f4dfbd',
      wet: '#bfe0f3',
      circulation: '#dcdfe3',
      shared: '#d9e8d4',
      outdoor: '#e7eadf',
      unassigned: '#f1efe9',
    },
    zoneShadow: 'rgba(28,32,40,0.10)',
    zoneShadowDepth: 160,
    cardFill: '#ffffff',
    // On the canvas the card's shadow is a screen-space soft edge (`dyPx`,
    // `blurPx` at any zoom); the world-unit pair is for a render with no zoom.
    cardShadow: { color: 'rgba(24,28,36,0.16)', dy: 160, blur: 220, dyPx: 12, blurPx: 18 },
    stairFill: '#e6e8eb',
    stairStroke: '#8a929c',
    treadStroke: '#6b7280',
    treadStrokeWidth: 0.6,
    arrowStroke: '#2b2f36',
    arrowStrokeWidth: 1.2,
    stairLabelSize: 115,
    doorLeafFill: '#2b2f36',
    doorLeafThickness: 45,
    swingStroke: '#7b8591',
    swingStrokeWidth: 0.7,
    glazingFill: '#cfe6f5',
    glazingBand: 0.34,
    frameStroke: '#2b2f36',
    frameStrokeWidth: 0.9,
    slabEdgeStroke: '#9aa3ad',
    slabEdgeStrokeWidth: 0.7,
    beamStroke: '#bcc3ca',
    beamDash: '4 3',
    gridMinor: '#f1efe9',
    gridMajor: '#e2dfd6',
    // Furniture: one warm ink for edges, a soft white for highlights, a single
    // shared drop shadow. Fills are flat — the shading is in the shapes.
    fixtureInk: '#6e6457',
    fixtureInkSoft: '#a39888',
    fixtureEdgeWidth: 0.8,
    fixtureDetailWidth: 0.5,
    fixtureShadow: { color: 'rgba(0,0,0,0.14)', dy: 40, blur: 35, dyPx: 3, blurPx: 3 },
  },
  annotation: {
    dimensionStroke: '#3a4049',
    dimensionExtension: '#7b8591',
    dimensionStrokeWidth: 0.8,
    dimensionExtensionWidth: 0.6,
    arrowLength: 70,
    arrowHalfWidthRatio: 0.4,
    arrowFilled: true,
    text: '#1c2128',
    textMuted: '#5b6671',
    fontFamily: 'var(--font-ui)',
    dimensionTextWeight: 600,
    roomNameWeight: 700,
    roomNameTransform: 'uppercase',
    roomNameTracking: '0.04em',
    chipFill: 'rgba(255,255,255,0.92)',
    chipRadiusPx: 4,
  },
  // The SVG elevations in presentation: the same white-model palette as the 3D.
  elevation: {
    wallFill: '#f2f0eb',
    wallStroke: '#4a525c',
    accentFill: '#dcd9d3',
    accentStroke: '#4a525c',
    roofFill: '#c9ccd0',
    glazingFill: '#bcd8ea',
    frameStroke: '#2f3338',
    frameStrokeWidth: 1.2,
    doorFill: '#5a3f2b',
    railingStroke: '#2f3338',
    groundFill: '#e4e5e8',
    groundDepth: 600,
    groundStroke: '#9aa3ad',
    shadowFill: 'rgba(28,32,40,0.08)',
    shadowOffset: 250,
  },
};

export function snapToGrid(value, grid = SHEET_TOKENS.viewportGrid) {
  return Math.round(value / grid) * grid;
}

export function snapRectToGrid(rect, grid = SHEET_TOKENS.viewportGrid) {
  return {
    x: snapToGrid(rect.x, grid),
    y: snapToGrid(rect.y, grid),
    width: Math.max(grid, snapToGrid(rect.width, grid)),
    height: Math.max(grid, snapToGrid(rect.height, grid)),
  };
}

export function formatSheetDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDrawingMeasurement(mm, options = {}) {
  return formatMeasurementValue(mm, null, options);
}

export function formatDrawingArea(area) {
  const value = Number(area) || 0;
  if (value <= 0) return '';
  return `${(value / 1_000_000).toFixed(2)} m²`;
}

export function resolveViewportScaleLabel(viewport, source, sheet) {
  if (
    source?.kind === '3d_preview' ||
    source?.kind === 'roof_schedule' ||
    source?.kind === 'building_report' ||
    source?.kind === 'sketch_part_list'
  )
    return 'NTS';
  if (sheet?.scaleMode === 'as_noted') return 'As noted';
  return `1:${Math.max(1, Math.round(Number(viewport?.scale) || 100))}`;
}

export function resolveViewportReferenceNote(viewport, source) {
  const custom = viewport?.referenceNote?.trim();
  if (custom) return custom;
  if (source?.kind === '3d_preview') return 'AXONOMETRIC VIEW';
  if (source?.kind === 'truss_plan') return 'TRUSS PLAN';
  if (source?.kind === 'structural_plan') return 'STRUCTURAL COORDINATION PLAN';
  if (source?.kind === 'services_plan') return 'SERVICES AND EGRESS COORDINATION PLAN';
  if (source?.kind === 'truss_detail') return 'TRUSS DETAIL';
  if (source?.kind === 'roof_plan') return 'ROOF PLAN';
  if (source?.kind === 'roof_elevation') return 'ROOF ELEVATION';
  if (source?.kind === 'roof_drainage') return 'ROOF DRAINAGE PLAN';
  if (source?.kind === 'roof_section') return 'ROOF SECTION';
  if (source?.kind === 'roof_schedule') return 'ROOF SCHEDULE';
  if (source?.kind === 'building_report') return 'MODEL-DERIVED REPORT';
  if (source?.kind === 'section') return 'BUILDING SECTION';
  if (source?.kind === 'elevation') return 'EXTERIOR ELEVATION';
  if (source?.kind === 'sketch_object') return 'OBJECT VIEW';
  if (source?.kind === 'sketch_assembly') return 'ASSEMBLY VIEW';
  if (source?.kind === 'sketch_part_detail') return 'PART DETAIL';
  if (source?.kind === 'sketch_part_list') return 'PARTS LIST';
  return 'CONSTRUCTION VIEW';
}

export function resolveSheetScaleLabel(sheet, viewports = []) {
  if (sheet?.scaleMode === 'as_noted') return 'As noted';
  if (sheet?.scaleMode === 'per_viewport') return 'As noted';

  const explicit = sheet?.scaleLabel?.trim();
  if (explicit) return explicit;

  const scales = [
    ...new Set(
      viewports
        .filter((viewport) => viewport.source?.kind !== '3d_preview')
        .map((viewport) => Math.max(1, Math.round(Number(viewport.scale) || 100))),
    ),
  ];

  if (scales.length === 1) return `1:${scales[0]}`;
  return 'As noted';
}

export function resolveSheetMetadata(project, sheet, index = 0, viewports = []) {
  return {
    projectTitle:
      sheet?.titleBlock?.projectTitleOverride?.trim() ||
      sheet?.projectNameOverride?.trim() ||
      project?.name?.trim() ||
      'Untitled Project',
    projectAddress: sheet?.titleBlock?.projectAddressOverride?.trim() || project?.address?.trim() || '',
    drawingTitle: sheet?.drawingName?.trim() || getSheetDisplayLabel(sheet, index),
    sheetNumber: getSheetNumberLabel(sheet, index),
    issueDate: formatSheetDate(sheet?.issueDate || new Date().toISOString()),
    scaleLabel: resolveSheetScaleLabel(sheet, viewports),
    drawnBy: sheet?.titleBlock?.drawnBy?.trim() || project?.documentDefaults?.drawnBy?.trim() || '',
    checkedBy: sheet?.titleBlock?.checkedBy?.trim() || project?.documentDefaults?.checkedBy?.trim() || '',
  };
}
