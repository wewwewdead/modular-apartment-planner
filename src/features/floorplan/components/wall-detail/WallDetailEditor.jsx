import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useProject } from '@/features/floorplan/context/FloorplanContext';
import {
  WALL_ASSEMBLY_PRESETS,
  WALL_BOARD_MATERIALS,
  WALL_FRAME_MATERIALS,
  createWallAssembly,
  resolveWallAssembly,
  wallAssemblyThickness,
} from '@/domain/wallAssemblies';
import {
  FASTENER_LAYOUT_MODES,
  FASTENER_GUIDE_DIRECTIONS,
  FASTENER_GUIDE_MODES,
  FASTENER_GUIDE_ZONES,
  FASTENER_APPEARANCE_MODES,
  FRAMING_LAYOUT_MODES,
  PANEL_LAYOUT_MODES,
  PANEL_REVEAL_INTENTS,
  WALL_DIMENSION_PRECISIONS,
  WALL_DIMENSION_MODES,
  WALL_DETAIL_SIDES,
  createAsBuiltMeasurement,
  createCustomFramingMember,
  createCustomPanel,
  createFastenerGuide,
  createFastenersFromGuide,
  createManualFastener,
  createWallDimension,
  createWallDetailing,
  deriveWallDimensionGeometry,
  deriveWallDetail,
  deriveFastenerGuideLayout,
  formatWallDimensionValue,
  wallDimensionMeasurement,
} from '@/domain/wallDetailing';
import {
  WALL_JURISDICTION_PROFILES,
  WALL_PRODUCT_PROFILES,
  getWallJurisdictionProfile,
  getWallProductProfile,
} from '@/domain/wallProductProfiles';
import { downloadWallDetailCsv, downloadWallDetailSvg } from '@/export/wallDetailExport';
import {
  buildPanelJointBackingMembers,
  collectWallDimensionGuideTargets,
  collectWallDimensionSnapTargets,
  collectWallSnapCandidates,
  createDrawnFramingMember,
  createDrawnPanel,
  createTracedPanel,
  deriveWallDimensionGuideSegment,
  fitPanelToFramingReveal,
  moveMemberWithinBounds,
  movePanelWithinBounds,
  movePointWithinBounds,
  moveWallDimensionWithinBounds,
  panWallViewport,
  quantizeWallLocalPoint,
  screenPointToWallLocal,
  snapPanelToAdjacentReveal,
  snapWallDimensionEndpoint,
  snapWallLocalPoint,
  zoomWallViewport,
} from './wallDetailEditorGeometry';
import { createWallDetailPreviewProject } from './wallDetailPreviewProject';
import { CanvasReadoutChip, WallCanvasGrid, WallCanvasRulers, useWallCanvasMetrics } from './WallCanvasChrome';
import { friendlyAnchorPhrase, wallUnitsPerPixel } from './wallDetailCanvasMath';
import {
  AdvancedGroup,
  CollapsibleSection,
  EmptyState,
  InfoHint,
  Metric,
  NumberField,
  SelectField,
  StepStrip,
  TextField,
  Toggle,
  ToolButton,
  ToolGlyph,
  ToolbarButton,
} from './WallDetailUiKit';
import styles from './WallDetailEditor.module.css';

const ThreePreviewPanel = lazy(() => import('@/features/floorplan/components/preview/ThreePreviewPanel'));

const CANVAS_TOOLS = Object.freeze({
  SELECT: 'select',
  PAN: 'pan',
  DRAW_PANEL: 'draw_panel',
  TRACE_PANEL: 'trace_panel',
  DRAW_STUD: 'draw_stud',
  DRAW_NOGGIN: 'draw_noggin',
  ADD_FASTENER: 'add_fastener',
  DRAW_DIMENSION: 'draw_dimension',
});

const WORKSPACE_VIEWS = Object.freeze({
  ELEVATION: 'elevation',
  SPLIT: 'split',
  THREE_D: '3d',
});

const REVEAL_PRESETS = Object.freeze([0, 3, 5, 6, 9, 12]);

const JOINT_SYSTEM_LABELS = Object.freeze({
  butt: 'Butt joint — closed',
  seamless: 'Seamless — filled and finished',
  express: 'Express joint — open shadow reveal',
  control: 'Control joint — movement detail',
});

const TOOL_HINTS = Object.freeze({
  [CANVAS_TOOLS.SELECT]: 'Select and drag any panel, frame member, or screw',
  [CANVAS_TOOLS.PAN]: 'Drag anywhere to pan; use the mouse wheel to zoom',
  [CANVAS_TOOLS.DRAW_PANEL]: 'Drag a rectangle to draw a board panel',
  [CANVAS_TOOLS.TRACE_PANEL]: 'Click each cut corner; click the first point or double-click to finish',
  [CANVAS_TOOLS.DRAW_STUD]: 'Click for a full-height stud, or drag its vertical span',
  [CANVAS_TOOLS.DRAW_NOGGIN]: 'Click for a full-width noggin, or drag its horizontal span',
  [CANVAS_TOOLS.ADD_FASTENER]: 'Click to place a screw; measurements act as magnetic pencil guides',
  [CANVAS_TOOLS.DRAW_DIMENSION]: 'Click two exact points (or drag); hold Shift to keep the run level or plumb',
});

/** Single source of truth for every canvas tool: icon, plain-language name, tooltip and shortcut. */
const TOOL_DEFINITIONS = Object.freeze([
  {
    tool: CANVAS_TOOLS.SELECT,
    icon: 'select',
    label: 'Select',
    shortcut: 'V',
    title: 'Select / move — click to pick anything, drag to move it (V)',
    group: 'navigate',
  },
  {
    tool: CANVAS_TOOLS.PAN,
    icon: 'pan',
    label: 'Pan',
    shortcut: 'H',
    title: 'Pan the drawing — drag to slide the view, scroll to zoom (H)',
    group: 'navigate',
  },
  {
    tool: CANVAS_TOOLS.DRAW_PANEL,
    icon: 'panel',
    label: 'Board',
    shortcut: 'P',
    title: 'Draw panel (rectangle) — drag out a board (P)',
    group: 'board',
  },
  {
    tool: CANVAS_TOOLS.TRACE_PANEL,
    icon: 'trace',
    label: 'Trace cut',
    shortcut: 'T',
    title: 'Trace cut panel — click each corner, then close the outline (T)',
    group: 'board',
  },
  {
    tool: CANVAS_TOOLS.DRAW_STUD,
    icon: 'stud',
    label: 'Stud',
    shortcut: 'S',
    title: 'Draw stud — click for full height, or drag its vertical span (S)',
    group: 'frame',
    framedOnly: true,
  },
  {
    tool: CANVAS_TOOLS.DRAW_NOGGIN,
    icon: 'noggin',
    label: 'Noggin',
    shortcut: 'N',
    title: 'Draw noggin — the horizontal blocking between studs (N)',
    group: 'frame',
    framedOnly: true,
  },
  {
    tool: CANVAS_TOOLS.ADD_FASTENER,
    icon: 'screw',
    label: 'Screw',
    shortcut: 'F',
    title: 'Place screw — click to fix; measurements act as magnetic guides (F)',
    group: 'detail',
  },
  {
    tool: CANVAS_TOOLS.DRAW_DIMENSION,
    icon: 'measure',
    label: 'Measure',
    shortcut: 'M',
    title: 'Draw measurement — click two exact points, or drag; Shift locks level/plumb (M)',
    group: 'detail',
  },
]);

const TOOL_GROUP_LABELS = Object.freeze({
  navigate: 'Move around',
  board: 'Boards',
  frame: 'Framing',
  detail: 'Screws and sizes',
});

const TOOL_BY_ID = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.tool]: definition }), {}),
);

const TOOL_SHORTCUTS = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.shortcut.toLowerCase()]: definition }), {}),
);

/** Left-panel workflow, in the order a real wall gets detailed. */
const WORKFLOW_STEPS = Object.freeze([
  { id: 'face', short: 'Face', title: 'Wall face', hint: 'Pick which side of the wall you are drawing' },
  {
    id: 'assembly',
    short: 'Assembly',
    title: 'Complete wall assembly',
    hint: 'Boards and framing this wall is made of',
  },
  { id: 'panels', short: 'Boards', title: 'Panel layout', hint: 'Board sizes, shadow gaps, and custom cuts' },
  { id: 'framing', short: 'Framing', title: 'Framing', hint: 'Studs and noggins behind the boards' },
  { id: 'fasteners', short: 'Screws', title: 'Fasteners', hint: 'Spacing, pencil guides, and screw placement' },
  { id: 'dimensions', short: 'Sizes', title: 'Construction dimensions', hint: 'Measurements the builder works from' },
  { id: 'checks', short: 'Check', title: 'Coordination checks', hint: 'Review clashes, then export the drawing' },
]);

const LAYER_LABELS = Object.freeze({
  panels: 'Boards',
  framing: 'Framing',
  fasteners: 'Screws',
  dimensions: 'Sizes',
  asBuilt: 'As-built',
});

const SELECTION_LABELS = Object.freeze({
  panel: 'board panel',
  framing: 'frame member',
  fastener: 'screw',
  dimension: 'measurement',
});

const ORIENTATION_STORAGE_KEY = 'floorplan.wallDetailEditor.orientationDismissed';

function readOrientationDismissed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ORIENTATION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistOrientationDismissed() {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

const FOCUS_MODE_STORAGE_KEY = 'floorplan.wallDetailEditor.focusMode';

/** How long the keyboard-shortcut HUD chip stays up; matches the CSS animation length. */
const TOOL_HUD_LIFETIME_MS = 1600;

function readFocusModePreference() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistFocusModePreference(value) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(FOCUS_MODE_STORAGE_KEY, value ? 'true' : 'false');
    return true;
  } catch {
    return false;
  }
}

const DIMENSION_SNAP_RADIUS_PX = 22;
const DIMENSION_POINT_GRAVITY_PX = 14;

function boardMaterialLabel(material) {
  if (material === WALL_BOARD_MATERIALS.PLYWOOD) return 'Plywood';
  if (material === WALL_BOARD_MATERIALS.FIBER_CEMENT) return 'Fiber cement';
  return 'No board';
}

function faceColor(material) {
  if (material === WALL_BOARD_MATERIALS.PLYWOOD) return '#c9975d';
  return material === WALL_BOARD_MATERIALS.FIBER_CEMENT ? '#dedbd1' : '#d3d7da';
}

function fastenerVisualPalette(appearance, material) {
  if (appearance === FASTENER_APPEARANCE_MODES.METAL) {
    return { fill: '#858d91', stroke: '#343c40', slot: '#d5dbde' };
  }
  if (appearance === FASTENER_APPEARANCE_MODES.CONTRAST) {
    return { fill: '#171b1e', stroke: '#050708', slot: '#747d82' };
  }
  if (appearance === FASTENER_APPEARANCE_MODES.CONSTRUCTION) {
    return { fill: '#d4523f', stroke: '#ffffff', slot: '#ffffff' };
  }
  return {
    fill: faceColor(material),
    stroke: material === WALL_BOARD_MATERIALS.PLYWOOD ? '#7a5937' : '#777772',
    slot: material === WALL_BOARD_MATERIALS.PLYWOOD ? '#9a7044' : '#a19f99',
  };
}

function panelRegionPath(region) {
  return [region.outline, ...(region.holes || [])]
    .filter((ring) => ring?.length)
    .map((ring) => `${ring.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.u} ${point.v}`).join(' ')} Z`)
    .join(' ');
}

function DimensionGraphic({
  dimension,
  wallHeight,
  selected,
  editable = false,
  showScrewGuide = false,
  unitPx = 1,
  handleRadius = 4.5,
  fontSize = null,
  title = null,
  onPointerDown,
  onStartHandlePointerDown,
  onEndHandlePointerDown,
}) {
  const geometry = deriveWallDimensionGeometry(dimension);
  const px = unitPx > 0 ? unitPx : 1;
  const labelOffset = fontSize ? fontSize * 0.62 : 10;
  const svgPoint = (point) => ({ x: point.u, y: wallHeight - point.v });
  const witnessStart = svgPoint(geometry.witnessStart);
  const witnessEnd = svgPoint(geometry.witnessEnd);
  const dimensionStart = svgPoint(geometry.dimensionStart);
  const dimensionEnd = svgPoint(geometry.dimensionEnd);
  const textPoint = svgPoint(geometry.textPoint);
  const screwGuide = deriveWallDimensionGuideSegment(dimension);
  const screwGuideStart = svgPoint(screwGuide.start);
  const screwGuideEnd = svgPoint(screwGuide.end);
  const dimensionLength = Math.hypot(dimensionEnd.x - dimensionStart.x, dimensionEnd.y - dimensionStart.y);
  const direction =
    dimensionLength > 1e-6
      ? {
          x: (dimensionEnd.x - dimensionStart.x) / dimensionLength,
          y: (dimensionEnd.y - dimensionStart.y) / dimensionLength,
        }
      : { x: 1, y: 0 };
  // Architectural tick terminators: 45° slashes across the dimension line,
  // sized via unitPx so they hold the same screen size at every zoom level.
  const tickHalf = 4 * px;
  const tick = {
    x: (direction.x - direction.y) * Math.SQRT1_2 * tickHalf,
    y: (direction.x + direction.y) * Math.SQRT1_2 * tickHalf,
  };
  // Extension lines keep a small gap off the measured point and overshoot
  // slightly past the dimension line, so they read as annotation rather than
  // part of the construction linework.
  const witnessLine = (from, to) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-6) return null;
    const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const gap = Math.min(5 * px, length * 0.4);
    return {
      x1: from.x + along.x * gap,
      y1: from.y + along.y * gap,
      x2: to.x + along.x * 4 * px,
      y2: to.y + along.y * 4 * px,
    };
  };
  const witnessLines = [witnessLine(witnessStart, dimensionStart), witnessLine(witnessEnd, dimensionEnd)].filter(
    Boolean,
  );
  return (
    <g
      className={`${styles.wallDimension} ${selected ? styles.wallDimensionSelected : ''}`}
      data-source={dimension.source}
      data-movable={editable ? 'true' : 'false'}
      onPointerDown={onPointerDown}
    >
      {title ? <title>{title}</title> : null}
      {showScrewGuide ? (
        <>
          <line
            x1={screwGuideStart.x}
            y1={screwGuideStart.y}
            x2={screwGuideEnd.x}
            y2={screwGuideEnd.y}
            className={styles.dimensionScrewGuide}
            style={{ strokeDasharray: `${8 * px} ${6 * px}` }}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={screwGuideStart.x}
            cy={screwGuideStart.y}
            r={handleRadius * 0.8}
            className={styles.dimensionScrewGuidePoint}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={screwGuideEnd.x}
            cy={screwGuideEnd.y}
            r={handleRadius * 0.8}
            className={styles.dimensionScrewGuidePoint}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
      {witnessLines.map((line, index) => (
        <line
          key={`witness-${index}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          className={styles.dimensionWitness}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={dimensionStart.x}
        y1={dimensionStart.y}
        x2={dimensionEnd.x}
        y2={dimensionEnd.y}
        className={styles.dimensionHit}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={dimensionStart.x}
        y1={dimensionStart.y}
        x2={dimensionEnd.x}
        y2={dimensionEnd.y}
        className={styles.dimensionLine}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={dimensionStart.x - tick.x}
        y1={dimensionStart.y - tick.y}
        x2={dimensionStart.x + tick.x}
        y2={dimensionStart.y + tick.y}
        className={styles.dimensionTick}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={dimensionEnd.x - tick.x}
        y1={dimensionEnd.y - tick.y}
        x2={dimensionEnd.x + tick.x}
        y2={dimensionEnd.y + tick.y}
        className={styles.dimensionTick}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={textPoint.x}
        y={textPoint.y - labelOffset}
        className={styles.dimensionText}
        style={fontSize ? { fontSize, strokeWidth: 3 * px } : undefined}
        transform={`rotate(${geometry.angleDegrees} ${textPoint.x} ${textPoint.y - labelOffset})`}
      >
        {dimension.label}
      </text>
      {selected ? (
        <>
          <g
            className={`${styles.dimensionGrip} ${editable ? styles.dimensionGripEditable : ''}`}
            onPointerDown={editable ? onStartHandlePointerDown : undefined}
          >
            <circle
              cx={witnessStart.x}
              cy={witnessStart.y}
              r={handleRadius * 2.4}
              className={styles.dimensionGripHit}
            />
            <circle
              cx={witnessStart.x}
              cy={witnessStart.y}
              r={handleRadius}
              className={styles.dimensionGripDot}
              vectorEffect="non-scaling-stroke"
            />
          </g>
          <g
            className={`${styles.dimensionGrip} ${editable ? styles.dimensionGripEditable : ''}`}
            onPointerDown={editable ? onEndHandlePointerDown : undefined}
          >
            <circle cx={witnessEnd.x} cy={witnessEnd.y} r={handleRadius * 2.4} className={styles.dimensionGripHit} />
            <circle
              cx={witnessEnd.x}
              cy={witnessEnd.y}
              r={handleRadius}
              className={styles.dimensionGripDot}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </>
      ) : null}
    </g>
  );
}

function DimensionAcquisitionGraphic({ acquisition, wallHeight, precision, referenceLabel = '' }) {
  if (!acquisition?.point) return null;
  const radius = Math.max(1, acquisition.markerRadius || 10);
  const x = acquisition.point.u;
  const y = wallHeight - acquisition.point.v;
  const primary = acquisition.reference ? referenceLabel || 'Snapped' : 'Free point';
  const coords = `U ${formatWallDimensionValue(acquisition.point.u, precision)} · V ${formatWallDimensionValue(
    acquisition.point.v,
    precision,
  )}`;
  return (
    <g className={styles.dimensionAcquisition} data-snapped={acquisition.reference ? 'true' : 'false'}>
      <circle cx={x} cy={y} r={radius} vectorEffect="non-scaling-stroke" />
      <line x1={x - radius * 1.7} y1={y} x2={x + radius * 1.7} y2={y} vectorEffect="non-scaling-stroke" />
      <line x1={x} y1={y - radius * 1.7} x2={x} y2={y + radius * 1.7} vectorEffect="non-scaling-stroke" />
      <text
        x={x + radius * 1.9}
        y={y - radius * 3.1}
        style={{ fontSize: radius * 1.3 }}
        vectorEffect="non-scaling-stroke"
      >
        {primary}
      </text>
      <text
        x={x + radius * 1.9}
        y={y - radius * 1.5}
        className={styles.dimensionAcquisitionCoords}
        style={{ fontSize: radius * 1.05 }}
        vectorEffect="non-scaling-stroke"
      >
        {coords}
      </text>
    </g>
  );
}

function FastenerGuideGraphic({ guide, wallHeight, precision, selected = false, onPointerDown }) {
  const svgPoint = (point) => ({ x: point.u, y: wallHeight - point.v });
  const tick = 16;
  if (guide.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER) {
    const firstSegment = guide.segments[0];
    const labelPoint = firstSegment
      ? svgPoint({
          u: firstSegment.start.u - firstSegment.inward.u * 34,
          v: firstSegment.start.v - firstSegment.inward.v * 34,
        })
      : { x: 0, y: 0 };
    return (
      <g
        className={`${styles.fastenerGuide} ${selected ? styles.fastenerGuideSelected : ''}`}
        onPointerDown={onPointerDown}
      >
        {guide.segments.map((segment) => {
          const start = svgPoint(segment.start);
          const end = svgPoint(segment.end);
          return (
            <g key={`${guide.id}:edge:${segment.index}`}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={styles.fastenerGuideLine} />
              {segment.stations.map((station) => {
                const tickStart = svgPoint({
                  u: station.u - station.inward.u * tick,
                  v: station.v - station.inward.v * tick,
                });
                const tickEnd = svgPoint({
                  u: station.u + station.inward.u * tick,
                  v: station.v + station.inward.v * tick,
                });
                const stationLabel = svgPoint({
                  u: station.u - station.inward.u * (tick + 10),
                  v: station.v - station.inward.v * (tick + 10),
                });
                return (
                  <g key={`${guide.id}:edge:${segment.index}:station:${station.stationIndex}`}>
                    <line
                      x1={tickStart.x}
                      y1={tickStart.y}
                      x2={tickEnd.x}
                      y2={tickEnd.y}
                      className={styles.fastenerGuideTick}
                    />
                    <text x={stationLabel.x} y={stationLabel.y} className={styles.fastenerGuideStation}>
                      {station.stationIndex === 0
                        ? '0'
                        : `+${formatWallDimensionValue(station.distanceFromStart, precision)}`}
                    </text>
                  </g>
                );
              })}
              {segment.remainder > precision / 2 ? (
                <text x={end.x} y={end.y - 24} className={styles.fastenerGuideRemainder}>
                  remainder {formatWallDimensionValue(segment.remainder, precision)}
                </text>
              ) : null}
            </g>
          );
        })}
        {firstSegment ? (
          <text x={labelPoint.x} y={labelPoint.y} className={styles.fastenerGuideLabel}>
            {guide.name} · panel-edge trace · {formatWallDimensionValue(guide.spacing, precision)} O.C.
          </text>
        ) : null}
      </g>
    );
  }
  const vertical = guide.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL;
  const start = svgPoint(vertical ? { u: guide.coordinate, v: guide.start } : { u: guide.start, v: guide.coordinate });
  const end = svgPoint(vertical ? { u: guide.coordinate, v: guide.end } : { u: guide.end, v: guide.coordinate });
  return (
    <g
      className={`${styles.fastenerGuide} ${selected ? styles.fastenerGuideSelected : ''}`}
      onPointerDown={onPointerDown}
    >
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={styles.fastenerGuideLine} />
      {guide.stations.map((station) => {
        const point = svgPoint(station);
        return (
          <g key={`${guide.id}:station:${station.index}`}>
            <line
              x1={point.x - (vertical ? tick : 0)}
              y1={point.y - (vertical ? 0 : tick)}
              x2={point.x + (vertical ? tick : 0)}
              y2={point.y + (vertical ? 0 : tick)}
              className={styles.fastenerGuideTick}
            />
            <text
              x={point.x + (vertical ? tick + 8 : 8)}
              y={point.y + (vertical ? -7 : -tick - 8)}
              className={styles.fastenerGuideStation}
            >
              {station.index === 0 ? 'DATUM 0' : `+${formatWallDimensionValue(station.distanceFromStart, precision)}`}
            </text>
          </g>
        );
      })}
      <text x={start.x} y={start.y + 34} className={styles.fastenerGuideLabel}>
        {guide.name} · {guide.zone} · {formatWallDimensionValue(guide.spacing, precision)} O.C.
      </text>
      {guide.remainder > precision / 2 ? (
        <text x={end.x} y={end.y - 28} className={styles.fastenerGuideRemainder}>
          end remainder {formatWallDimensionValue(guide.remainder, precision)}
        </text>
      ) : null}
    </g>
  );
}

function FastenerGraphic({
  fastener,
  appearance,
  material,
  headDiameter,
  selected,
  minimumRadius,
  title = null,
  onPointerDown,
}) {
  const palette = fastenerVisualPalette(appearance, material);
  const radius = Math.max(headDiameter / 2, minimumRadius);
  const slot = radius * 0.92;
  return (
    <g
      className={styles.fastenerGraphic}
      data-appearance={appearance}
      data-selected={selected ? 'true' : 'false'}
      onPointerDown={onPointerDown}
    >
      {title ? <title>{title}</title> : null}
      {selected ? (
        <circle
          cx={fastener.u}
          cy={fastener.v}
          r={radius + 7}
          fill="none"
          stroke="#ffd166"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <circle
        cx={fastener.u}
        cy={fastener.v}
        r={radius}
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth={selected ? 3 : 1.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={fastener.u - slot}
        y1={fastener.v}
        x2={fastener.u + slot}
        y2={fastener.v}
        stroke={palette.slot}
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

export default function WallDetailEditor() {
  const { project, dispatch, canUndo = false, canRedo = false } = useProject();
  const { wallDetailEditor, dispatch: editorDispatch } = useEditor();
  const svgRef = useRef(null);
  const canvasFrameRef = useRef(null);
  const floor = project.floors.find((entry) => entry.id === wallDetailEditor?.floorId) || null;
  const wall = floor?.walls.find((entry) => entry.id === wallDetailEditor?.wallId) || null;
  const [activeSide, setActiveSide] = useState(() => {
    const requestedSide = wallDetailEditor?.side || wall?.assembly?.detailing?.activeSide;
    return requestedSide === WALL_DETAIL_SIDES.EXTERIOR ? WALL_DETAIL_SIDES.EXTERIOR : WALL_DETAIL_SIDES.INTERIOR;
  });
  const [layerVisibility, setLayerVisibility] = useState({
    panels: true,
    framing: true,
    fasteners: true,
    dimensions: true,
    asBuilt: true,
  });
  const [selection, setSelection] = useState(null);
  const [canvasTool, setCanvasTool] = useState(CANVAS_TOOLS.SELECT);
  const [gesture, setGesture] = useState(null);
  const [panelTrace, setPanelTrace] = useState(null);
  const [viewport, setViewport] = useState({ zoom: 1, panU: 0, panV: 0 });
  const [panGesture, setPanGesture] = useState(null);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(50);
  const [dimensionAcquisition, setDimensionAcquisition] = useState(null);
  const [fastenerGuideDraft, setFastenerGuideDraft] = useState({
    id: null,
    name: 'Screw pencil guide',
    mode: FASTENER_GUIDE_MODES.PANEL_PERIMETER,
    panelId: null,
    direction: FASTENER_GUIDE_DIRECTIONS.VERTICAL,
    zone: FASTENER_GUIDE_ZONES.PERIMETER,
    coordinate: 0,
    start: 50,
    end: 2400,
    spacing: 200,
    edgeClearance: 12,
    cornerClearance: 50,
  });
  const [workspaceView, setWorkspaceView] = useState(WORKSPACE_VIEWS.SPLIT);
  const [asBuiltDraft, setAsBuiltDraft] = useState({
    label: 'Site datum',
    targetType: 'datum',
    targetId: null,
    axis: 'u',
    designValue: 0,
    measuredValue: 0,
    tolerance: 6,
  });
  const [openSections, setOpenSections] = useState({
    face: true,
    assembly: true,
    panels: false,
    framing: false,
    fasteners: false,
    dimensions: false,
    selection: true,
    takeoff: true,
    schedule: false,
    asBuilt: false,
    checks: true,
  });
  const [orientationDismissed, setOrientationDismissed] = useState(readOrientationDismissed);
  const [focusMode, setFocusMode] = useState(readFocusModePreference);
  const [panelPeek, setPanelPeek] = useState(null);
  const [toolHud, setToolHud] = useState(null);
  const toolHudTimer = useRef(null);
  const toolHudNonce = useRef(0);
  const sectionNodes = useRef({});
  const sectionRefSetters = useRef({});
  const shortcutHandlerRef = useRef(null);

  // Capture phase: this editor is modal, so the keys it claims must never reach the
  // floorplan canvas listening on the same window (its own Delete would remove walls).
  // Only claimed keys stop propagating — Space-pan, Escape, and Ctrl shortcuts pass through.
  useEffect(() => {
    const onShortcutKeyDown = (event) => shortcutHandlerRef.current?.(event);
    window.addEventListener('keydown', onShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', onShortcutKeyDown, true);
  }, []);

  useEffect(() => () => clearTimeout(toolHudTimer.current), []);

  useEffect(() => {
    if (!panelTrace) return undefined;
    const cancelTrace = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPanelTrace(null);
    };
    window.addEventListener('keydown', cancelTrace);
    return () => window.removeEventListener('keydown', cancelTrace);
  }, [panelTrace]);

  useEffect(() => {
    const isEditableTarget = (target) =>
      target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName);
    const enableSpacePan = (event) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return;
      event.preventDefault();
      setSpacePanActive(true);
    };
    const disableSpacePan = (event) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setSpacePanActive(false);
    };
    const cancelSpacePan = () => setSpacePanActive(false);
    window.addEventListener('keydown', enableSpacePan);
    window.addEventListener('keyup', disableSpacePan);
    window.addEventListener('blur', cancelSpacePan);
    return () => {
      window.removeEventListener('keydown', enableSpacePan);
      window.removeEventListener('keyup', disableSpacePan);
      window.removeEventListener('blur', cancelSpacePan);
    };
  }, []);

  const detail = useMemo(() => (wall && floor ? deriveWallDetail(wall, floor) : null), [floor, wall]);
  const configuration = detail?.configuration || null;
  const face = configuration?.sides?.[activeSide] || null;
  const panels = detail?.panels?.[activeSide] || [];
  const fasteners = detail?.fasteners?.[activeSide] || [];
  const dimensions = detail?.dimensions?.[activeSide] || [];
  const frameMembers = detail?.framing || [];
  const profile = face ? getWallProductProfile(face.productProfileId) : null;
  const jurisdiction = configuration ? getWallJurisdictionProfile(configuration.jurisdictionProfileId) : null;
  const assembly = wall ? resolveWallAssembly(wall) : null;
  const bounds = detail ? { length: detail.length, height: detail.height } : null;
  const canvasMetrics = useWallCanvasMetrics(canvasFrameRef, bounds, workspaceView);
  const previewProject = useMemo(
    () => createWallDetailPreviewProject(project, floor?.id, wall?.id),
    [project, floor?.id, wall?.id],
  );
  const snapCandidates = useMemo(
    () =>
      detail
        ? collectWallSnapCandidates({
            panels: detail.panels[activeSide],
            members: detail.framing,
            openings: detail.openings,
            length: detail.length,
            height: detail.height,
          })
        : { u: [], v: [] },
    [activeSide, detail],
  );
  const revealSnapCandidates = useMemo(
    () =>
      detail && face
        ? collectWallSnapCandidates({
            panels: detail.panels[activeSide],
            members: detail.framing,
            openings: detail.openings,
            length: detail.length,
            height: detail.height,
            revealGap: { u: face.layout.horizontalGap, v: face.layout.verticalGap },
          })
        : { u: [], v: [] },
    [activeSide, detail, face],
  );
  const dimensionSnapTargets = useMemo(
    () =>
      detail && wall
        ? collectWallDimensionSnapTargets({
            wallId: wall.id,
            panels: detail.panels[activeSide],
            members: detail.framing,
            openings: detail.openings,
            fasteners: detail.fasteners[activeSide],
            length: detail.length,
            height: detail.height,
          })
        : [],
    [activeSide, detail, wall],
  );
  const screwMeasurementTargets = collectWallDimensionGuideTargets(
    dimensions.filter((dimension) => dimension.source === 'custom'),
  );
  const fastenerGuideLayouts =
    face && bounds ? face.fasteners.guides.map((guide) => deriveFastenerGuideLayout(guide, bounds, { panels })) : [];
  const fastenerGuideDraftLayout = bounds ? deriveFastenerGuideLayout(fastenerGuideDraft, bounds, { panels }) : null;

  if (!wallDetailEditor) {
    shortcutHandlerRef.current = null;
    return null;
  }
  if (!wall || !floor || !detail || !configuration || !face) {
    shortcutHandlerRef.current = null;
    return (
      <div className={styles.overlay}>
        <div className={styles.missing}>
          <h2>Wall detail is unavailable</h2>
          <p>The wall or owning floor no longer exists.</p>
          <ToolbarButton onClick={() => editorDispatch({ type: 'CLOSE_WALL_DETAIL_EDITOR' })}>Close</ToolbarButton>
        </div>
      </div>
    );
  }

  const toggleSection = (id) => setOpenSections((value) => ({ ...value, [id]: !value[id] }));
  const sectionRef = (id) => {
    if (!sectionRefSetters.current[id]) {
      sectionRefSetters.current[id] = (node) => {
        sectionNodes.current[id] = node;
      };
    }
    return sectionRefSetters.current[id];
  };
  const focusStep = (id) => {
    setOpenSections((value) => ({ ...value, [id]: true }));
    sectionNodes.current[id]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const dismissOrientation = () => {
    persistOrientationDismissed();
    setOrientationDismissed(true);
  };

  const toggleFocusMode = () => {
    setPanelPeek(null);
    setFocusMode((value) => {
      persistFocusModePreference(!value);
      return !value;
    });
  };
  const togglePanelPeek = (side) => setPanelPeek((value) => (value === side ? null : side));
  const dismissPanelPeek = () => setPanelPeek(null);
  const flashToolHud = (definition) => {
    if (!focusMode || !definition) return;
    toolHudNonce.current += 1;
    setToolHud({
      nonce: toolHudNonce.current,
      tool: definition.tool,
      label: definition.label,
      shortcut: definition.shortcut,
    });
    clearTimeout(toolHudTimer.current);
    toolHudTimer.current = setTimeout(() => setToolHud(null), TOOL_HUD_LIFETIME_MS);
  };

  const commitDetailing = (next) => {
    dispatch({
      type: 'WALL_UPDATE',
      floorId: floor.id,
      wall: {
        id: wall.id,
        assembly: { ...wall.assembly, detailing: createWallDetailing(next) },
      },
    });
  };

  const commitAssembly = (nextAssembly) => {
    dispatch({
      type: 'WALL_UPDATE',
      floorId: floor.id,
      wall: {
        id: wall.id,
        assembly: nextAssembly,
        thickness: wallAssemblyThickness(nextAssembly),
        structuralRole: nextAssembly.system === 'framed' ? 'nonstructural' : wall.structuralRole,
      },
    });
  };

  const updateAssembly = (patch) =>
    commitAssembly(createWallAssembly(assembly.preset, { ...assembly, ...patch }, wall.thickness));
  const updateAssemblyFraming = (patch) => updateAssembly({ framing: { ...assembly.framing, ...patch } });
  const updateBoardLayer = (patch) => updateAssembly({ [activeSide]: { ...assembly[activeSide], ...patch } });

  const chooseAssemblyPreset = (preset) => {
    const next = createWallAssembly(preset, { detailing: configuration }, wall.thickness);
    commitAssembly(next);
    setSelection(null);
    setGesture(null);
  };

  const chooseBoardMaterial = (material) => {
    updateBoardLayer({
      material,
      thickness:
        material === WALL_BOARD_MATERIALS.PLYWOOD ? 12 : material === WALL_BOARD_MATERIALS.FIBER_CEMENT ? 6 : 0,
      layerCount: material === WALL_BOARD_MATERIALS.NONE ? 0 : Math.max(1, assembly[activeSide].layerCount || 1),
    });
  };

  const updateDetailing = (patch) => commitDetailing({ ...configuration, ...patch });
  const updateFace = (patch) =>
    commitDetailing({
      ...configuration,
      sides: {
        ...configuration.sides,
        [activeSide]: { ...face, ...patch },
      },
    });
  const updateLayout = (patch) => updateFace({ layout: { ...face.layout, ...patch } });
  const updateFastenerPattern = (patch) => updateFace({ fasteners: { ...face.fasteners, ...patch } });
  const updateDimensionSettings = (patch) => updateFace({ dimensions: { ...face.dimensions, ...patch } });
  const setShadowReveal = (gap) =>
    updateLayout({
      horizontalGap: gap,
      verticalGap: gap,
      ...(gap > 0 ? { jointSystem: 'express' } : {}),
    });

  const chooseCanvasTool = (tool) => {
    setCanvasTool(tool);
    setGesture(null);
    setDimensionAcquisition(null);
    if (tool !== CANVAS_TOOLS.TRACE_PANEL) setPanelTrace(null);
  };

  const chooseSide = (side) => {
    setActiveSide(side);
    setSelection(null);
    setGesture(null);
    updateDetailing({ activeSide: side });
  };

  const editablePanels = () =>
    panels.map((panel) =>
      createCustomPanel(
        {
          u: panel.u0,
          v: panel.v0,
          width: panel.width,
          height: panel.height,
          ...(panel.polygonal ? { outlinePoints: panel.outlinePoints } : {}),
        },
        { id: panel.localId, label: panel.label },
      ),
    );

  const editableFraming = () => frameMembers.map((member) => createCustomFramingMember({ ...member, id: member.id }));

  const editableFasteners = () =>
    fasteners.map((fastener) => createManualFastener(fastener, { ...fastener, id: fastener.id }));

  const materializePanels = () => {
    updateLayout({ mode: PANEL_LAYOUT_MODES.CUSTOM, customPanels: editablePanels() });
    setSelection(null);
  };

  const addPanel = () => {
    const width = Math.min(face.layout.boardWidth, detail.length);
    const height = Math.min(face.layout.boardHeight, detail.height);
    const panel = createCustomPanel({ u: 0, v: 0, width, height });
    updateLayout({
      mode: PANEL_LAYOUT_MODES.CUSTOM,
      customPanels: [...editablePanels(), panel],
    });
    setSelection({ type: 'panel', id: panel.id });
  };

  const updateSelectedPanel = (patch) => {
    if (selection?.type !== 'panel') return;
    updateLayout({
      mode: PANEL_LAYOUT_MODES.CUSTOM,
      customPanels: editablePanels().map((panel) => {
        if (panel.id !== selection.id) return panel;
        if (!panel.outlinePoints?.length) return { ...panel, ...patch };
        const u = Number.isFinite(patch.u) ? patch.u : panel.u;
        const v = Number.isFinite(patch.v) ? patch.v : panel.v;
        const width = Math.max(1, Number.isFinite(patch.width) ? patch.width : panel.width);
        const height = Math.max(1, Number.isFinite(patch.height) ? patch.height : panel.height);
        return createCustomPanel(
          {
            outlinePoints: panel.outlinePoints.map((point) => ({
              u: u + ((point.u - panel.u) / panel.width) * width,
              v: v + ((point.v - panel.v) / panel.height) * height,
            })),
          },
          { id: panel.id, label: panel.label },
        );
      }),
    });
  };

  const deleteSelectedPanel = () => {
    if (selection?.type !== 'panel') return;
    updateLayout({
      mode: PANEL_LAYOUT_MODES.CUSTOM,
      customPanels: editablePanels().filter((panel) => panel.id !== selection.id),
    });
    setSelection(null);
  };

  const materializeFraming = () => {
    updateDetailing({
      framing: {
        ...configuration.framing,
        mode: FRAMING_LAYOUT_MODES.CUSTOM,
        members: editableFraming(),
        removedGeneratedIds: [],
      },
    });
    setSelection(null);
  };

  const addFramingMember = (orientation) => {
    const centerU = detail.length / 2;
    const centerV = detail.height / 2;
    const member = createCustomFramingMember(
      orientation === 'vertical'
        ? { orientation, kind: 'stud', u0: centerU - 25, u1: centerU + 25, v0: 0, v1: detail.height }
        : { orientation, kind: 'noggin', u0: 0, u1: detail.length, v0: centerV - 25, v1: centerV + 25 },
    );
    updateDetailing({
      framing: {
        ...configuration.framing,
        mode: FRAMING_LAYOUT_MODES.CUSTOM,
        members: [...editableFraming(), member],
        removedGeneratedIds: [],
      },
    });
    setSelection({ type: 'framing', id: member.id });
  };

  const updateSelectedMember = (patch) => {
    if (selection?.type !== 'framing') return;
    updateDetailing({
      framing: {
        ...configuration.framing,
        mode: FRAMING_LAYOUT_MODES.CUSTOM,
        members: editableFraming().map((member) => (member.id === selection.id ? { ...member, ...patch } : member)),
        removedGeneratedIds: [],
      },
    });
  };

  const deleteSelectedMember = () => {
    if (selection?.type !== 'framing') return;
    updateDetailing({
      framing: {
        ...configuration.framing,
        mode: FRAMING_LAYOUT_MODES.CUSTOM,
        members: editableFraming().filter((member) => member.id !== selection.id),
        removedGeneratedIds: [],
      },
    });
    setSelection(null);
  };

  const addPanelJointBacking = () => {
    const added = buildPanelJointBackingMembers(
      panels,
      frameMembers.filter((member) => member.frameIndex === 0),
      assembly.framing,
      bounds,
    );
    if (added.length === 0) return;
    updateDetailing({
      framing: {
        ...configuration.framing,
        members: [...configuration.framing.members, ...added],
      },
    });
  };

  const resetAutomaticFraming = () => {
    updateDetailing({
      framing: {
        mode: FRAMING_LAYOUT_MODES.AUTOMATIC,
        members: [],
        removedGeneratedIds: [],
      },
    });
    setSelection(null);
  };

  const materializeFasteners = () => {
    updateFastenerPattern({
      mode: FASTENER_LAYOUT_MODES.CUSTOM,
      manual: editableFasteners(),
      removedGeneratedIds: [],
    });
    setSelection(null);
  };

  const addFastener = (point, measurementReference = null) => {
    const duplicateTolerance = Math.max(0.001, face.dimensions.precision / 2);
    const existing = fasteners.find((entry) => Math.hypot(entry.u - point.u, entry.v - point.v) <= duplicateTolerance);
    if (existing) {
      setSelection({ type: 'fastener', id: existing.id });
      return existing;
    }
    const fastener = createManualFastener(point, {
      type: face.fasteners.type || profile.planningDefaults.fastenerType,
      note: measurementReference
        ? `Placed from measurement ${measurementReference.entityId} · ${measurementReference.anchor.replaceAll('_', ' ')}`
        : '',
    });
    updateFastenerPattern({ manual: [...face.fasteners.manual, fastener] });
    setSelection({ type: 'fastener', id: fastener.id });
    return fastener;
  };

  const activateDimensionScrewGuide = (dimension) => {
    setSelection({ type: 'dimension', id: dimension.id });
    chooseCanvasTool(CANVAS_TOOLS.ADD_FASTENER);
  };

  const placeFastenerAtDimensionEndpoint = (dimension, endpoint) => {
    const point = endpoint === 'start' ? dimension.start : deriveWallDimensionGuideSegment(dimension).end;
    addFastener(point, { entityId: dimension.id, anchor: endpoint });
  };

  const startNewFastenerGuide = () => {
    setFastenerGuideDraft({
      id: null,
      name: `Screw pencil guide ${face.fasteners.guides.length + 1}`,
      mode: FASTENER_GUIDE_MODES.PANEL_PERIMETER,
      panelId: null,
      direction: FASTENER_GUIDE_DIRECTIONS.VERTICAL,
      zone: FASTENER_GUIDE_ZONES.PERIMETER,
      coordinate: 0,
      start: 50,
      end: detail.height,
      spacing: face.fasteners.perimeterSpacing,
      edgeClearance: face.fasteners.edgeClearance,
      cornerClearance: face.fasteners.cornerClearance,
    });
  };

  const useSelectedPanelForGuide = () => {
    if (selection?.type !== 'panel') return;
    const panel = panels.find((entry) => entry.localId === selection.id || entry.id === selection.id);
    if (!panel) return;
    setFastenerGuideDraft((guide) => ({
      ...guide,
      mode: FASTENER_GUIDE_MODES.PANEL_PERIMETER,
      panelId: panel.localId || panel.id,
      zone: FASTENER_GUIDE_ZONES.PERIMETER,
      spacing: face.fasteners.perimeterSpacing,
      edgeClearance: face.fasteners.edgeClearance,
      cornerClearance: face.fasteners.cornerClearance,
      name: guide.id ? guide.name : `${panel.label} perimeter screw guide`,
    }));
  };

  const traceAllPanelPerimeters = () => {
    const existingByPanel = new Map(
      face.fasteners.guides
        .filter((guide) => guide.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER && guide.panelId)
        .map((guide) => [guide.panelId, guide]),
    );
    const panelGuides = panels.map((panel) => {
      const panelId = panel.localId || panel.id;
      const existing = existingByPanel.get(panelId);
      return createFastenerGuide({
        id: existing?.id,
        name: existing?.name || `${panel.label} perimeter screw guide`,
        mode: FASTENER_GUIDE_MODES.PANEL_PERIMETER,
        panelId,
        zone: FASTENER_GUIDE_ZONES.PERIMETER,
        spacing: existing?.spacing || face.fasteners.perimeterSpacing,
        edgeClearance: existing?.edgeClearance || face.fasteners.edgeClearance,
        cornerClearance: existing?.cornerClearance || face.fasteners.cornerClearance,
      });
    });
    const linearGuides = face.fasteners.guides.filter((guide) => guide.mode !== FASTENER_GUIDE_MODES.PANEL_PERIMETER);
    updateFastenerPattern({
      mode: FASTENER_LAYOUT_MODES.CUSTOM,
      guides: [...linearGuides, ...panelGuides],
      manual: face.fasteners.manual.filter((fastener) => !fastener.guideId),
      removedGeneratedIds: [],
    });
    if (panelGuides[0]) setFastenerGuideDraft(panelGuides[0]);
    setSelection(null);
  };

  const loadFastenerGuide = (guide) => {
    setFastenerGuideDraft(createFastenerGuide(guide));
    setSelection(null);
  };

  const applyFastenerGuide = () => {
    const guide = createFastenerGuide(fastenerGuideDraft);
    const guideFasteners = createFastenersFromGuide(guide, bounds, {
      panels,
      type: face.fasteners.type || profile.planningDefaults.fastenerType,
    });
    updateFastenerPattern({
      mode: FASTENER_LAYOUT_MODES.CUSTOM,
      guides: [...face.fasteners.guides.filter((entry) => entry.id !== guide.id), guide],
      manual: face.fasteners.manual.filter((fastener) => fastener.guideId !== guide.id),
      removedGeneratedIds: [],
    });
    setFastenerGuideDraft(guide);
    setSelection(guideFasteners[0] ? { type: 'fastener', id: guideFasteners[0].id } : null);
  };

  const deleteFastenerGuide = (guideId) => {
    updateFastenerPattern({
      guides: face.fasteners.guides.filter((guide) => guide.id !== guideId),
      manual: face.fasteners.manual.filter((fastener) => fastener.guideId !== guideId),
    });
    if (fastenerGuideDraft.id === guideId) startNewFastenerGuide();
    setSelection(null);
  };

  const updateSelectedFastener = (patch) => {
    if (selection?.type !== 'fastener') return;
    const selected = fasteners.find((fastener) => fastener.id === selection.id);
    if (!selected) return;
    if (selected.source === 'generated') {
      const replacement = createManualFastener(
        { ...selected, ...patch },
        { ...selected, id: `${selected.id}:override` },
      );
      updateFastenerPattern({
        manual: [...face.fasteners.manual, replacement],
        removedGeneratedIds: [...new Set([...face.fasteners.removedGeneratedIds, selected.id])],
      });
      setSelection({ type: 'fastener', id: replacement.id });
      return;
    }
    updateFastenerPattern({
      manual: face.fasteners.manual.map((fastener) =>
        fastener.id === selection.id ? { ...fastener, ...patch } : fastener,
      ),
    });
  };

  const deleteSelectedFastener = () => {
    if (selection?.type !== 'fastener') return;
    const selected = fasteners.find((fastener) => fastener.id === selection.id);
    if (selected?.source === 'generated') {
      updateFastenerPattern({
        removedGeneratedIds: [...new Set([...face.fasteners.removedGeneratedIds, selected.id])],
      });
    } else {
      updateFastenerPattern({ manual: face.fasteners.manual.filter((fastener) => fastener.id !== selection.id) });
    }
    setSelection(null);
  };

  const updateSelectedDimension = (patch) => {
    if (selection?.type !== 'dimension') return;
    updateDimensionSettings({
      manual: face.dimensions.manual.map((dimension) =>
        dimension.id === selection.id ? createWallDimension({ ...dimension, ...patch, id: dimension.id }) : dimension,
      ),
    });
  };

  const deleteSelectedDimension = () => {
    if (selection?.type !== 'dimension') return;
    updateDimensionSettings({
      manual: face.dimensions.manual.filter((dimension) => dimension.id !== selection.id),
    });
    setSelection(null);
  };

  const resetPanelGrid = () => {
    updateLayout({ mode: PANEL_LAYOUT_MODES.GRID, customPanels: [] });
    setSelection(null);
  };

  const regenerateFasteners = () => {
    updateFastenerPattern({
      mode: FASTENER_LAYOUT_MODES.GENERATED,
      manual: [],
      removedGeneratedIds: [],
    });
    setSelection(null);
  };

  const deleteSelection = () => {
    if (selection?.type === 'panel') deleteSelectedPanel();
    else if (selection?.type === 'framing') deleteSelectedMember();
    else if (selection?.type === 'fastener') deleteSelectedFastener();
    else if (selection?.type === 'dimension') deleteSelectedDimension();
  };

  const eventToLocal = (event, withSnap = true, revealAware = false) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { u: 0, v: 0 };
    const point = screenPointToWallLocal(event, rect, bounds);
    return withSnap
      ? snapWallLocalPoint(point, revealAware ? revealSnapCandidates : snapCandidates, {
          enabled: snapEnabled,
          step: snapStep,
          threshold: Math.max(8, (detail.length / Math.max(1, rect.width)) * 10),
        })
      : point;
  };

  const eventToDimensionEndpoint = (event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { point: { u: 0, v: 0 }, reference: null };
    const raw = screenPointToWallLocal(event, rect, bounds);
    const markerRadius =
      Math.max(bounds.length / Math.max(1, rect.width), bounds.height / Math.max(1, rect.height)) * 9;
    if (snapEnabled) {
      const target = snapWallDimensionEndpoint(raw, dimensionSnapTargets, {
        thresholdPixels: DIMENSION_SNAP_RADIUS_PX,
        pointThresholdPixels: DIMENSION_POINT_GRAVITY_PX,
        pixelsPerU: rect.width / bounds.length,
        pixelsPerV: rect.height / bounds.height,
      });
      if (target) return { ...target, markerRadius };
    }
    return { point: quantizeWallLocalPoint(raw, face.dimensions.precision), reference: null, markerRadius };
  };

  /** Hold Shift to keep a measurement level or plumb relative to its anchor point. */
  const orthoDimensionEndpoint = (event, anchorPoint) => {
    const acquisition = eventToDimensionEndpoint(event);
    if (!event.shiftKey || !anchorPoint) return acquisition;
    const du = Math.abs(acquisition.point.u - anchorPoint.u);
    const dv = Math.abs(acquisition.point.v - anchorPoint.v);
    const point =
      du >= dv ? { u: acquisition.point.u, v: anchorPoint.v } : { u: anchorPoint.u, v: acquisition.point.v };
    const unchanged = Math.abs(point.u - acquisition.point.u) < 1e-9 && Math.abs(point.v - acquisition.point.v) < 1e-9;
    return { ...acquisition, point, reference: unchanged ? acquisition.reference : null };
  };

  const eventToFastenerPoint = (event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { point: { u: 0, v: 0 }, reference: null, markerRadius: 10 };
    const raw = screenPointToWallLocal(event, rect, bounds);
    const markerRadius =
      Math.max(bounds.length / Math.max(1, rect.width), bounds.height / Math.max(1, rect.height)) * 9;
    if (snapEnabled && layerVisibility.dimensions) {
      const target = snapWallDimensionEndpoint(raw, screwMeasurementTargets, {
        thresholdPixels: DIMENSION_SNAP_RADIUS_PX,
        pointThresholdPixels: DIMENSION_POINT_GRAVITY_PX,
        pixelsPerU: rect.width / bounds.length,
        pixelsPerV: rect.height / bounds.height,
      });
      if (target) return { ...target, markerRadius };
    }
    return { point: eventToLocal(event, true), reference: null, markerRadius };
  };

  const zoomViewportAt = (requestedZoom, clientX, clientY) => {
    setViewport((current) => {
      const rawZoom = typeof requestedZoom === 'function' ? requestedZoom(current.zoom) : requestedZoom;
      const zoom = Math.max(0.35, Math.min(5, rawZoom));
      if (zoom === current.zoom) return current;
      const rect = canvasFrameRef.current?.getBoundingClientRect();
      const focalU = rect && Number.isFinite(clientX) ? clientX - (rect.left + rect.width / 2) : 0;
      const focalV = rect && Number.isFinite(clientY) ? clientY - (rect.top + rect.height / 2) : 0;
      return zoomWallViewport(current, zoom, { u: focalU, v: focalV });
    });
  };

  const handleViewportWheel = (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomViewportAt((zoom) => zoom * factor, event.clientX, event.clientY);
  };

  const beginViewportPan = (event) => {
    const panButton = event.button === 1 || (event.button === 0 && (canvasTool === CANVAS_TOOLS.PAN || spacePanActive));
    if (!panButton) return;
    event.preventDefault();
    canvasFrameRef.current?.setPointerCapture?.(event.pointerId);
    setPanGesture({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panU: viewport.panU,
      panV: viewport.panV,
    });
  };

  const updateViewportPan = (event) => {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    setViewport((current) =>
      panWallViewport(
        { ...current, panU: panGesture.panU, panV: panGesture.panV },
        { u: event.clientX - panGesture.clientX, v: event.clientY - panGesture.clientY },
      ),
    );
  };

  const finishViewportPan = (event) => {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    canvasFrameRef.current?.releasePointerCapture?.(event.pointerId);
    setPanGesture(null);
  };

  const fitWallInViewport = () => setViewport({ zoom: 1, panU: 0, panV: 0 });

  const movedGestureEntity = (value = gesture) => {
    if (!value || value.kind !== 'move') return null;
    const delta = {
      u: value.current.u - value.start.u,
      v: value.current.v - value.start.v,
    };
    let moved;
    let anchor;
    if (value.type === 'panel') {
      moved = movePanelWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u0, v: moved.v0 };
    } else if (value.type === 'framing') {
      moved = moveMemberWithinBounds(value.entity, delta, bounds);
      anchor =
        moved.orientation === 'vertical'
          ? { u: (moved.u0 + moved.u1) / 2, v: moved.v0 }
          : { u: moved.u0, v: (moved.v0 + moved.v1) / 2 };
    } else {
      moved = movePointWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u, v: moved.v };
    }
    if (!snapEnabled) return moved;
    const moveSnapCandidates =
      value.type === 'panel'
        ? collectWallSnapCandidates({
            panels: panels.filter((panel) => panel.localId !== value.id),
            members: detail.framing,
            openings: detail.openings,
            length: detail.length,
            height: detail.height,
            revealGap: { u: face.layout.horizontalGap, v: face.layout.verticalGap },
          })
        : snapCandidates;
    const snapped = snapWallLocalPoint(anchor, moveSnapCandidates, {
      step: snapStep,
      threshold: Math.max(8, snapStep * 0.24),
    });
    const snapDelta = { u: snapped.u - anchor.u, v: snapped.v - anchor.v };
    if (value.type === 'panel') return movePanelWithinBounds(moved, snapDelta, bounds);
    if (value.type === 'framing') return moveMemberWithinBounds(moved, snapDelta, bounds);
    return movePointWithinBounds(moved, snapDelta, bounds);
  };

  const drawnGestureEntity = (value = gesture) => {
    if (!value || value.kind !== 'draw') return null;
    if (value.tool === CANVAS_TOOLS.DRAW_PANEL) {
      const panel = createDrawnPanel(value.start, value.current, bounds);
      if (!snapEnabled) return panel;
      const threshold = Math.max(20, assembly.framing.studWidth / 2 + 12);
      const framed = fitPanelToFramingReveal(
        panel,
        frameMembers,
        { u: face.layout.horizontalGap, v: face.layout.verticalGap },
        bounds,
        { threshold },
      );
      return snapPanelToAdjacentReveal(
        framed,
        panels,
        { u: face.layout.horizontalGap, v: face.layout.verticalGap },
        bounds,
        { threshold },
      );
    }
    if (value.tool === CANVAS_TOOLS.DRAW_DIMENSION) {
      const deltaU = Math.abs(value.current.u - value.start.u);
      const deltaV = Math.abs(value.current.v - value.start.v);
      const mode =
        deltaU > deltaV * 1.5
          ? WALL_DIMENSION_MODES.HORIZONTAL
          : deltaV > deltaU * 1.5
            ? WALL_DIMENSION_MODES.VERTICAL
            : WALL_DIMENSION_MODES.ALIGNED;
      return createWallDimension({
        mode,
        start: value.start,
        end: value.current,
        startRef: value.startRef,
        endRef: value.endRef,
        offset: 60,
      });
    }
    return createDrawnFramingMember(value.tool, value.start, value.current, assembly.framing, bounds);
  };

  const commitDrawnDimension = (finalGesture) => {
    const entity = drawnGestureEntity(finalGesture);
    if (!entity || wallDimensionMeasurement(entity) < 1) return;
    updateDimensionSettings({ manual: [...face.dimensions.manual, entity] });
    setSelection({ type: 'dimension', id: entity.id });
  };

  const commitPanelTrace = (points = panelTrace?.points || []) => {
    const traced = createTracedPanel(points, bounds);
    if (!traced) return false;
    const threshold = Math.max(20, assembly.framing.studWidth / 2 + 12);
    const framed = snapEnabled
      ? fitPanelToFramingReveal(
          traced,
          frameMembers,
          { u: face.layout.horizontalGap, v: face.layout.verticalGap },
          bounds,
          { threshold },
        )
      : traced;
    const entity = snapEnabled
      ? snapPanelToAdjacentReveal(
          framed,
          panels,
          { u: face.layout.horizontalGap, v: face.layout.verticalGap },
          bounds,
          { threshold },
        )
      : framed;
    const panel = createCustomPanel(entity);
    updateLayout({
      mode: PANEL_LAYOUT_MODES.CUSTOM,
      customPanels: [...editablePanels(), panel],
    });
    setPanelTrace(null);
    setSelection({ type: 'panel', id: panel.id });
    return true;
  };

  const beginCanvasGesture = (event) => {
    if (event.button !== 0) return;
    if (canvasTool === CANVAS_TOOLS.PAN || spacePanActive) return;
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL) {
      event.preventDefault();
      const point = eventToLocal(event, true, true);
      const points = panelTrace?.points || [];
      const rect = svgRef.current?.getBoundingClientRect();
      const closeDistance = Math.max(8, (detail.length / Math.max(1, rect?.width || 1)) * 12);
      if (points.length >= 3 && Math.hypot(point.u - points[0].u, point.v - points[0].v) <= closeDistance) {
        commitPanelTrace(points);
        return;
      }
      setPanelTrace({ points: [...points, point], previewPoint: point });
      return;
    }
    if (canvasTool === CANVAS_TOOLS.DRAW_DIMENSION && gesture?.awaitingSecondClick) {
      // Second click of a click-click measurement: commit between the two points.
      event.preventDefault();
      const acquisition = orthoDimensionEndpoint(event, gesture.start);
      setDimensionAcquisition(acquisition);
      setGesture(null);
      commitDrawnDimension({ ...gesture, current: acquisition.point, endRef: acquisition.reference });
      return;
    }
    const dimensionEndpoint = canvasTool === CANVAS_TOOLS.DRAW_DIMENSION ? eventToDimensionEndpoint(event) : null;
    const fastenerAcquisition = canvasTool === CANVAS_TOOLS.ADD_FASTENER ? eventToFastenerPoint(event) : null;
    const point =
      dimensionEndpoint?.point ||
      fastenerAcquisition?.point ||
      eventToLocal(event, true, canvasTool === CANVAS_TOOLS.DRAW_PANEL);
    if (canvasTool === CANVAS_TOOLS.ADD_FASTENER) {
      setDimensionAcquisition(fastenerAcquisition);
      addFastener(point, fastenerAcquisition?.reference);
      return;
    }
    if (canvasTool === CANVAS_TOOLS.SELECT) {
      setSelection(null);
      return;
    }
    event.preventDefault();
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: 'draw',
      tool: canvasTool,
      start: point,
      current: point,
      startRef: dimensionEndpoint?.reference || null,
      endRef: dimensionEndpoint?.reference || null,
      pointerId: event.pointerId,
      screenX: event.clientX,
      screenY: event.clientY,
    });
  };

  const selectDimension = (event, dimension) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelection({ type: 'dimension', id: dimension.id });
  };

  const beginDimensionMove = (event, dimension) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || dimension.source !== 'custom' || event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    const point = eventToLocal(event, false);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setSelection({ type: 'dimension', id: dimension.id });
    setGesture({
      kind: 'dimension_move',
      dimensionId: dimension.id,
      dimension,
      start: point,
      current: point,
      pointerId: event.pointerId,
    });
  };

  const beginDimensionEndpointMove = (event, dimension, endpoint) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || dimension.source !== 'custom' || event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    const acquisition = eventToDimensionEndpoint(event);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setSelection({ type: 'dimension', id: dimension.id });
    setDimensionAcquisition(acquisition);
    setGesture({
      kind: 'dimension_endpoint',
      dimensionId: dimension.id,
      dimension,
      endpoint,
      current: acquisition.point,
      reference: acquisition.reference,
      pointerId: event.pointerId,
    });
  };

  const beginElementMove = (event, type, id, entity) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (type === 'fastener' && entity.guideId) {
      setSelection({ type, id });
      return;
    }
    const point = eventToLocal(event, false);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setSelection({ type, id });
    setGesture({ kind: 'move', type, id, entity, start: point, current: point, pointerId: event.pointerId });
  };

  const updateCanvasGesture = (event) => {
    if (panGesture) return;
    const adjustingDimension = gesture?.kind === 'dimension_endpoint';
    if ((canvasTool === CANVAS_TOOLS.DRAW_DIMENSION || adjustingDimension) && !spacePanActive) {
      const orthoAnchor = adjustingDimension
        ? gesture.endpoint === 'start'
          ? gesture.dimension.end
          : gesture.dimension.start
        : gesture?.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
          ? gesture.start
          : null;
      const acquisition = orthoDimensionEndpoint(event, orthoAnchor);
      setDimensionAcquisition(acquisition);
      if (adjustingDimension && gesture.pointerId === event.pointerId) {
        setGesture((value) =>
          value ? { ...value, current: acquisition.point, reference: acquisition.reference } : value,
        );
        return;
      }
    }
    if (canvasTool === CANVAS_TOOLS.ADD_FASTENER && !spacePanActive && !gesture) {
      setDimensionAcquisition(eventToFastenerPoint(event));
      return;
    }
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL && panelTrace?.points.length) {
      setPanelTrace((value) => (value ? { ...value, previewPoint: eventToLocal(event, true, true) } : value));
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const endpoint =
      gesture.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
        ? orthoDimensionEndpoint(event, gesture.start)
        : null;
    const point =
      endpoint?.point ||
      eventToLocal(event, gesture.kind === 'draw', gesture.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_PANEL);
    setGesture((value) =>
      value ? { ...value, current: point, endRef: endpoint ? endpoint.reference : value.endRef } : value,
    );
  };

  const finishCanvasGesture = (event) => {
    if (panGesture) return;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'dimension_endpoint') {
      const acquisition = orthoDimensionEndpoint(
        event,
        gesture.endpoint === 'start' ? gesture.dimension.end : gesture.dimension.start,
      );
      const coordinateKey = gesture.endpoint === 'start' ? 'start' : 'end';
      const referenceKey = gesture.endpoint === 'start' ? 'startRef' : 'endRef';
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      setGesture(null);
      setDimensionAcquisition(acquisition);
      updateDimensionSettings({
        manual: face.dimensions.manual.map((dimension) =>
          dimension.id === gesture.dimensionId
            ? createWallDimension({
                ...dimension,
                [coordinateKey]: acquisition.point,
                [referenceKey]: acquisition.reference,
                id: dimension.id,
              })
            : dimension,
        ),
      });
      return;
    }
    if (gesture.kind === 'dimension_move') {
      const current = eventToLocal(event, false);
      const delta = { u: current.u - gesture.start.u, v: current.v - gesture.start.v };
      const moved = moveWallDimensionWithinBounds(gesture.dimension, delta, bounds, face.dimensions.precision);
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      setGesture(null);
      if (Math.hypot(delta.u, delta.v) < face.dimensions.precision) return;
      updateDimensionSettings({
        manual: face.dimensions.manual.map((dimension) =>
          dimension.id === gesture.dimensionId ? createWallDimension({ ...moved, id: dimension.id }) : dimension,
        ),
      });
      return;
    }
    const dimensionEndpoint =
      gesture.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
        ? orthoDimensionEndpoint(event, gesture.start)
        : null;
    if (dimensionEndpoint) {
      // A stationary press is the first click of a click-click measurement:
      // keep the gesture alive and wait for the second point.
      const dragPixels = Math.hypot(
        event.clientX - (gesture.screenX ?? event.clientX),
        event.clientY - (gesture.screenY ?? event.clientY),
      );
      if (dragPixels < 5) {
        svgRef.current?.releasePointerCapture?.(event.pointerId);
        setDimensionAcquisition(dimensionEndpoint);
        setGesture((value) => (value ? { ...value, awaitingSecondClick: true } : value));
        return;
      }
    }
    const finalGesture = {
      ...gesture,
      current:
        dimensionEndpoint?.point ||
        eventToLocal(
          event,
          gesture.kind === 'draw',
          gesture.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_PANEL,
        ),
      endRef: dimensionEndpoint ? dimensionEndpoint.reference : gesture.endRef,
    };
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    setGesture(null);
    if (dimensionEndpoint) setDimensionAcquisition(dimensionEndpoint);

    if (finalGesture.kind === 'draw') {
      const entity = drawnGestureEntity(finalGesture);
      if (!entity) return;
      if (finalGesture.tool === CANVAS_TOOLS.DRAW_DIMENSION) {
        commitDrawnDimension(finalGesture);
      } else if (finalGesture.tool === CANVAS_TOOLS.DRAW_PANEL) {
        const panel = createCustomPanel(entity);
        updateLayout({
          mode: PANEL_LAYOUT_MODES.CUSTOM,
          customPanels: [...editablePanels(), panel],
        });
        setSelection({ type: 'panel', id: panel.id });
      } else {
        updateDetailing({
          framing: {
            ...configuration.framing,
            mode: FRAMING_LAYOUT_MODES.CUSTOM,
            members: [...editableFraming(), entity],
            removedGeneratedIds: [],
          },
        });
        setSelection({ type: 'framing', id: entity.id });
      }
      return;
    }

    const moved = movedGestureEntity(finalGesture);
    const movedDistance = Math.hypot(
      finalGesture.current.u - finalGesture.start.u,
      finalGesture.current.v - finalGesture.start.v,
    );
    if (!moved || movedDistance < 1) return;
    if (finalGesture.type === 'panel') {
      updateLayout({
        mode: PANEL_LAYOUT_MODES.CUSTOM,
        customPanels: editablePanels().map((panel) =>
          panel.id === finalGesture.id ? createCustomPanel(moved, { id: finalGesture.id, label: moved.label }) : panel,
        ),
      });
    } else if (finalGesture.type === 'framing') {
      updateDetailing({
        framing: {
          ...configuration.framing,
          mode: FRAMING_LAYOUT_MODES.CUSTOM,
          members: editableFraming().map((member) =>
            member.id === finalGesture.id ? createCustomFramingMember({ ...moved, id: finalGesture.id }) : member,
          ),
          removedGeneratedIds: [],
        },
      });
    } else {
      const nextManual = editableFasteners().map((fastener) =>
        fastener.id === finalGesture.id ? createManualFastener(moved, { ...moved, id: finalGesture.id }) : fastener,
      );
      updateFastenerPattern({
        mode: FASTENER_LAYOUT_MODES.CUSTOM,
        manual: nextManual,
        removedGeneratedIds: [],
      });
    }
  };

  const finishPanelTrace = (event) => {
    if (canvasTool !== CANVAS_TOOLS.TRACE_PANEL || !panelTrace?.points.length) return;
    event.preventDefault();
    event.stopPropagation();
    commitPanelTrace(panelTrace.points);
  };

  const addAsBuilt = () => {
    const measurement = createAsBuiltMeasurement(asBuiltDraft);
    updateDetailing({
      asBuilt: {
        ...configuration.asBuilt,
        measurements: [...configuration.asBuilt.measurements, measurement],
      },
    });
  };

  const removeAsBuilt = (id) =>
    updateDetailing({
      asBuilt: {
        ...configuration.asBuilt,
        measurements: configuration.asBuilt.measurements.filter((entry) => entry.id !== id),
      },
    });

  const prepareDimensionSiteCheck = (dimension) => {
    setAsBuiltDraft({
      label: dimension.name || 'Dimension site check',
      targetType: 'wall_dimension',
      targetId: dimension.id,
      axis: dimension.mode === WALL_DIMENSION_MODES.VERTICAL ? 'v' : 'u',
      designValue: dimension.measurement,
      measuredValue: dimension.measurement,
      tolerance: dimension.tolerance || configuration.asBuilt.tolerance,
    });
  };

  const selectedPanel = selection?.type === 'panel' ? panels.find((panel) => panel.localId === selection.id) : null;
  const selectedMember =
    selection?.type === 'framing' ? frameMembers.find((member) => member.id === selection.id) : null;
  const selectedFastener = selection?.type === 'fastener' ? fasteners.find((entry) => entry.id === selection.id) : null;
  const selectedFastenerGuide = selectedFastener?.guideId
    ? fastenerGuideLayouts.find((guide) => guide.id === selectedFastener.guideId)
    : null;
  const selectedDimension =
    selection?.type === 'dimension' ? dimensions.find((entry) => entry.id === selection.id) : null;
  const selectionIsDeletable = Boolean(
    selection &&
    (selection.type !== 'dimension' || selectedDimension?.source === 'custom') &&
    !(selection.type === 'fastener' && selectedFastenerGuide),
  );
  const currentTakeoff = detail.takeoff.sides[activeSide];
  const supportWidth = Math.max(0, Number(assembly.framing.studWidth) || 0);
  const verticalJointLanding = Math.max(0, (supportWidth - face.layout.horizontalGap) / 2);
  const horizontalJointLanding = Math.max(0, (supportWidth - face.layout.verticalGap) / 2);
  const rawGesturePreview = gesture?.kind === 'draw' ? drawnGestureEntity() : movedGestureEntity();
  const gesturePreview =
    gesture?.tool === CANVAS_TOOLS.DRAW_DIMENSION && rawGesturePreview
      ? {
          ...rawGesturePreview,
          source: 'preview',
          label: formatWallDimensionValue(wallDimensionMeasurement(rawGesturePreview), face.dimensions.precision),
        }
      : rawGesturePreview;
  const gesturePreviewType =
    gesture?.kind === 'draw'
      ? gesture.tool === CANVAS_TOOLS.DRAW_PANEL
        ? 'panel'
        : gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
          ? 'dimension'
          : 'framing'
      : gesture?.type;
  const dimensionGesturePreview =
    gesture?.kind === 'dimension_endpoint'
      ? (() => {
          const coordinateKey = gesture.endpoint === 'start' ? 'start' : 'end';
          const referenceKey = gesture.endpoint === 'start' ? 'startRef' : 'endRef';
          const dimension = createWallDimension({
            ...gesture.dimension,
            [coordinateKey]: gesture.current,
            [referenceKey]: gesture.reference,
            id: gesture.dimensionId,
          });
          return {
            ...dimension,
            source: 'preview',
            label: formatWallDimensionValue(wallDimensionMeasurement(dimension), face.dimensions.precision),
          };
        })()
      : gesture?.kind === 'dimension_move'
        ? (() => {
            const dimension = createWallDimension({
              ...moveWallDimensionWithinBounds(
                gesture.dimension,
                {
                  u: gesture.current.u - gesture.start.u,
                  v: gesture.current.v - gesture.start.v,
                },
                bounds,
                face.dimensions.precision,
              ),
              id: gesture.dimensionId,
            });
            return {
              ...dimension,
              source: 'preview',
              label: formatWallDimensionValue(wallDimensionMeasurement(dimension), face.dimensions.precision),
            };
          })()
        : null;
  const panelTracePreview = panelTrace?.points?.length
    ? [...panelTrace.points, panelTrace.previewPoint || panelTrace.points[panelTrace.points.length - 1]]
    : [];
  const activeRevealSnap = gesturePreviewType === 'panel' ? gesturePreview?.revealSnaps?.[0] : null;
  const activeDimensionSnap =
    gesture?.kind === 'draw' && gesture.tool === CANVAS_TOOLS.DRAW_DIMENSION
      ? gesture.endRef
      : gesture?.kind === 'dimension_endpoint'
        ? gesture.reference
        : canvasTool === CANVAS_TOOLS.DRAW_DIMENSION
          ? dimensionAcquisition?.reference
          : null;
  const activeFastenerGuideSnap = canvasTool === CANVAS_TOOLS.ADD_FASTENER ? dimensionAcquisition?.reference : null;
  const unitPx = wallUnitsPerPixel(canvasMetrics, viewport, bounds);
  const dimensionHandleRadius = 4.5 * unitPx;
  const dimensionFontSize = 12.5 * unitPx;
  const activeToolDefinition = TOOL_BY_ID[canvasTool];
  const framedAssembly = assembly.system === 'framed';
  const selectionSummary = selection
    ? `${SELECTION_LABELS[selection.type] || selection.type} selected`
    : 'Nothing selected';

  const referenceEntityName = (reference) => {
    if (reference.entityType === 'wall') return 'Wall';
    if (reference.entityType === 'opening') return 'Opening';
    if (reference.entityType === 'fastener') return 'Screw';
    if (reference.entityType === 'panel') {
      const panel = panels.find((entry) => entry.localId === reference.entityId || entry.id === reference.entityId);
      return panel?.label || 'Board';
    }
    if (reference.entityType === 'framing') {
      const member = frameMembers.find((entry) => entry.id === reference.entityId);
      return member?.kind ? member.kind.charAt(0).toUpperCase() + member.kind.slice(1) : 'Framing';
    }
    if (reference.entityType === 'measurement') {
      const dimension = dimensions.find((entry) => entry.id === reference.entityId);
      return dimension?.name || 'Measurement';
    }
    return reference.entityType;
  };
  /** "Board 2 · left edge" instead of "panel edge_left · 43.21% along". */
  const describeReference = (reference) =>
    reference ? `${referenceEntityName(reference)} · ${friendlyAnchorPhrase(reference.anchor)}` : 'free point';
  const formatMm = (value) => formatWallDimensionValue(value, face.dimensions.precision);

  /** Live size / position readout that follows the pointer during gestures. */
  const gestureReadout = (() => {
    if (gesture?.kind === 'draw' && gesturePreview) {
      if (gesture.tool === CANVAS_TOOLS.DRAW_PANEL) {
        return {
          point: gesture.current,
          lines: [
            `${formatMm(gesturePreview.u1 - gesturePreview.u0)} × ${formatMm(
              gesturePreview.v1 - gesturePreview.v0,
            )} mm`,
          ],
        };
      }
      if (gesture.tool === CANVAS_TOOLS.DRAW_STUD || gesture.tool === CANVAS_TOOLS.DRAW_NOGGIN) {
        const vertical = gesture.tool === CANVAS_TOOLS.DRAW_STUD;
        const span = vertical ? gesturePreview.v1 - gesturePreview.v0 : gesturePreview.u1 - gesturePreview.u0;
        return { point: gesture.current, lines: [`${vertical ? 'stud' : 'noggin'} · ${formatMm(span)} mm`] };
      }
      return null; // the measure tool draws its own live label
    }
    if (gesture?.kind === 'move' && gesturePreview) {
      if (gesture.type === 'panel') {
        return {
          point: gesture.current,
          lines: [`U ${formatMm(gesturePreview.u0)} · V ${formatMm(gesturePreview.v0)}`],
        };
      }
      if (gesture.type === 'framing') {
        const vertical = gesturePreview.orientation === 'vertical';
        const centre = vertical
          ? (gesturePreview.u0 + gesturePreview.u1) / 2
          : (gesturePreview.v0 + gesturePreview.v1) / 2;
        return { point: gesture.current, lines: [`centre ${vertical ? 'U' : 'V'} ${formatMm(centre)}`] };
      }
      return { point: gesture.current, lines: [`U ${formatMm(gesturePreview.u)} · V ${formatMm(gesturePreview.v)}`] };
    }
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL && panelTrace?.points?.length && panelTrace.previewPoint) {
      const last = panelTrace.points[panelTrace.points.length - 1];
      const span = Math.hypot(panelTrace.previewPoint.u - last.u, panelTrace.previewPoint.v - last.v);
      return span >= 1 ? { point: panelTrace.previewPoint, lines: [`${formatMm(span)} mm`] } : null;
    }
    return null;
  })();

  const claimShortcut = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  shortcutHandlerRef.current = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)) return;
    if (event.key === 'Escape') {
      // The panel-trace effect owns Escape while a trace is open; never swallow it here.
      if (panelTrace) return;
      if (gesture || dimensionAcquisition) {
        // First Escape cancels the in-flight gesture but keeps the tool active.
        event.preventDefault();
        setGesture(null);
        setDimensionAcquisition(null);
        return;
      }
      if (canvasTool === CANVAS_TOOLS.SELECT) return;
      event.preventDefault();
      chooseCanvasTool(CANVAS_TOOLS.SELECT);
      flashToolHud(TOOL_BY_ID[CANVAS_TOOLS.SELECT]);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      claimShortcut(event);
      if (selectionIsDeletable) deleteSelection();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      claimShortcut(event);
      zoomViewportAt((zoom) => zoom * 1.2);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      claimShortcut(event);
      zoomViewportAt((zoom) => zoom / 1.2);
      return;
    }
    if (event.key === '0') {
      claimShortcut(event);
      fitWallInViewport();
      return;
    }
    const definition = TOOL_SHORTCUTS[event.key.toLowerCase()];
    if (!definition) return;
    claimShortcut(event);
    if (definition.framedOnly && !framedAssembly) return;
    chooseCanvasTool(definition.tool);
    flashToolHud(definition);
  };

  const renderToolButton = (toolId, overrides = {}) => {
    const definition = TOOL_BY_ID[toolId];
    return (
      <ToolButton
        icon={definition.icon}
        label={definition.label}
        shortcut={definition.shortcut}
        title={definition.title}
        active={canvasTool === definition.tool}
        disabled={Boolean(definition.framedOnly && !framedAssembly)}
        onClick={() => chooseCanvasTool(definition.tool)}
        {...overrides}
      />
    );
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Wall assembly detail editor">
      <header className={styles.header}>
        <div className={styles.headerIdentity}>
          <span className={styles.eyebrow}>Construction-detail workspace</span>
          <h1>Wall-local assembly editor</h1>
          <p>
            {wall.id} · {detail.length.toFixed(0)} × {detail.height.toFixed(0)} mm · {profile.manufacturer}{' '}
            {profile.product}
          </p>
        </div>
        <div className={styles.headerActions}>
          <ToolbarButton
            title={
              focusMode
                ? 'Bring the workflow and numbers panels back'
                : 'Hide both side panels and draw on the full screen'
            }
            aria-pressed={focusMode}
            onClick={toggleFocusMode}
          >
            {focusMode ? 'Show panels' : 'Focus canvas'}
          </ToolbarButton>
          <ToolbarButton
            title="Download the scaled elevation drawing as SVG"
            onClick={() => downloadWallDetailSvg(wall, floor, activeSide)}
          >
            Export drawing SVG
          </ToolbarButton>
          <ToolbarButton
            title="Download the material takeoff as CSV"
            onClick={() => downloadWallDetailCsv(wall, floor, activeSide)}
          >
            Export takeoff CSV
          </ToolbarButton>
          <ToolbarButton
            title="Close the wall detail editor and return to the floorplan"
            onClick={() => editorDispatch({ type: 'CLOSE_WALL_DETAIL_EDITOR' })}
          >
            Close
          </ToolbarButton>
        </div>
      </header>

      <div className={styles.body} data-focus={focusMode ? 'true' : 'false'}>
        <aside
          id="wall-detail-left-panel"
          className={styles.leftPanel}
          aria-label="Wall detailing steps"
          data-peek={focusMode && panelPeek === 'left' ? 'true' : 'false'}
          aria-hidden={focusMode && panelPeek !== 'left' ? 'true' : undefined}
        >
          {orientationDismissed ? null : (
            <div className={styles.orientationCard}>
              <span className={styles.eyebrow}>Start here</span>
              <h2>Detail this wall in six steps</h2>
              <p>
                Work down the numbered steps on the left, draw on the elevation in the middle, and read the numbers on
                the right. Nothing is locked in — you can revisit any step at any time.
              </p>
              <ol>
                <li>Pick the wall face</li>
                <li>Choose the assembly</li>
                <li>Lay out the boards</li>
                <li>Adjust the framing</li>
                <li>Place the screws</li>
                <li>Add dimensions, then check and export</li>
              </ol>
              <p className={styles.orientationTip}>
                Every drawing tool has a one-key shortcut — hover a tool to see it.
              </p>
              <div className={styles.orientationActions}>
                <ToolbarButton onClick={dismissOrientation}>Got it</ToolbarButton>
              </div>
            </div>
          )}

          <StepStrip steps={WORKFLOW_STEPS} isOpen={(id) => Boolean(openSections[id])} onSelect={focusStep} />

          <CollapsibleSection
            id="face"
            step={1}
            title="Wall face"
            summary={`Editing the ${activeSide === WALL_DETAIL_SIDES.INTERIOR ? 'inside' : 'outside'} face`}
            open={openSections.face}
            onToggle={() => toggleSection('face')}
            innerRef={sectionRef('face')}
          >
            <div className={styles.segmented}>
              {Object.values(WALL_DETAIL_SIDES).map((side) => (
                <button
                  key={side}
                  className={activeSide === side ? styles.segmentActive : ''}
                  onClick={() => chooseSide(side)}
                >
                  {side === WALL_DETAIL_SIDES.INTERIOR ? 'Inside' : 'Outside'} ·{' '}
                  {boardMaterialLabel(assembly[side].material)}
                </button>
              ))}
            </div>
            <p className={styles.activeFaceNotice}>
              Editing {activeSide === WALL_DETAIL_SIDES.INTERIOR ? 'inside' : 'outside'} face ·{' '}
              {boardMaterialLabel(assembly[activeSide].material)}
            </p>
            <Toggle checked={face.enabled} onChange={(enabled) => updateFace({ enabled })} label="Detail this face" />
          </CollapsibleSection>

          <CollapsibleSection
            id="assembly"
            step={2}
            title="Complete wall assembly"
            summary={`${boardMaterialLabel(assembly[activeSide].material)} · ${wallAssemblyThickness(assembly).toFixed(
              0,
            )} mm built`}
            open={openSections.assembly}
            onToggle={() => toggleSection('assembly')}
            innerRef={sectionRef('assembly')}
          >
            <SelectField label="System" value={assembly.preset} onChange={chooseAssemblyPreset}>
              <option value={WALL_ASSEMBLY_PRESETS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
              <option value={WALL_ASSEMBLY_PRESETS.PLYWOOD}>Plywood</option>
              <option value={WALL_ASSEMBLY_PRESETS.MIXED_BOARD}>Mixed board</option>
              <option value={WALL_ASSEMBLY_PRESETS.CHB}>CHB masonry</option>
            </SelectField>
            {framedAssembly ? (
              <>
                <SelectField
                  label={`${activeSide} board`}
                  value={assembly[activeSide].material}
                  onChange={chooseBoardMaterial}
                >
                  <option value={WALL_BOARD_MATERIALS.NONE}>None</option>
                  <option value={WALL_BOARD_MATERIALS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
                  <option value={WALL_BOARD_MATERIALS.PLYWOOD}>Plywood</option>
                </SelectField>
                {assembly[activeSide].material !== WALL_BOARD_MATERIALS.NONE ? (
                  <>
                    <NumberField
                      label="Board thickness"
                      value={assembly[activeSide].thickness}
                      min={1}
                      onChange={(thickness) => updateBoardLayer({ thickness })}
                    />
                    <NumberField
                      label="Board layers"
                      value={assembly[activeSide].layerCount}
                      min={1}
                      suffix=""
                      onChange={(layerCount) => updateBoardLayer({ layerCount: Math.round(layerCount) })}
                    />
                  </>
                ) : null}
                <SelectField
                  label="Frame material"
                  value={assembly.framing.material}
                  onChange={(material) => updateAssemblyFraming({ material })}
                >
                  <option value={WALL_FRAME_MATERIALS.LIGHT_GAUGE_STEEL}>Light-gauge steel</option>
                  <option value={WALL_FRAME_MATERIALS.TIMBER}>Timber</option>
                </SelectField>
                <NumberField
                  label="Stud spacing"
                  value={assembly.framing.spacing}
                  min={100}
                  onChange={(spacing) => updateAssemblyFraming({ spacing })}
                />
                <NumberField
                  label="Stud width"
                  value={assembly.framing.studWidth}
                  min={20}
                  onChange={(studWidth) => updateAssemblyFraming({ studWidth })}
                />
                <NumberField
                  label="Noggin rows"
                  value={assembly.framing.nogginRows}
                  min={0}
                  suffix=""
                  onChange={(nogginRows) => updateAssemblyFraming({ nogginRows: Math.round(nogginRows) })}
                />
                <div className={styles.assemblySummary}>
                  Built thickness <strong>{wallAssemblyThickness(assembly).toFixed(0)} mm</strong>
                </div>
                <AdvancedGroup label="Advanced framing">
                  <NumberField
                    label="Layout offset"
                    value={assembly.framing.startOffset}
                    min={0}
                    onChange={(startOffset) => updateAssemblyFraming({ startOffset })}
                  />
                  <NumberField
                    label="Frame depth"
                    value={assembly.framing.studDepth}
                    min={25}
                    onChange={(studDepth) => updateAssemblyFraming({ studDepth })}
                  />
                  <SelectField
                    label="Frame rows"
                    value={String(assembly.framing.frameCount)}
                    onChange={(frameCount) => updateAssemblyFraming({ frameCount: Number(frameCount) })}
                  >
                    <option value="1">Single frame</option>
                    <option value="2">Double-stud wall</option>
                  </SelectField>
                  {assembly.framing.frameCount === 2 ? (
                    <NumberField
                      label="Frame gap"
                      value={assembly.framing.frameGap}
                      min={0}
                      onChange={(frameGap) => updateAssemblyFraming({ frameGap })}
                    />
                  ) : null}
                </AdvancedGroup>
              </>
            ) : (
              <p className={styles.inlineHelp}>Choose a framed assembly to draw studs, noggins, boards, and screws.</p>
            )}
            <AdvancedGroup label="Product and code rules">
              <SelectField
                label="Product profile"
                value={face.productProfileId}
                onChange={(productProfileId) => updateFace({ productProfileId })}
              >
                {WALL_PRODUCT_PROFILES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.manufacturer} — {entry.product} ({entry.region})
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Jurisdiction"
                value={configuration.jurisdictionProfileId}
                onChange={(jurisdictionProfileId) => updateDetailing({ jurisdictionProfileId })}
              >
                {WALL_JURISDICTION_PROFILES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </SelectField>
              <div className={styles.profileStatus} data-status={profile.status}>
                <strong>{profile.status.replaceAll('_', ' ')}</strong>
                <span>{profile.source.title}</span>
                <small>{jurisdiction.label}</small>
              </div>
            </AdvancedGroup>
          </CollapsibleSection>

          <CollapsibleSection
            id="panels"
            step={3}
            title="Panel layout"
            summary={`${panels.length} board${panels.length === 1 ? '' : 's'} · ${
              face.layout.mode === PANEL_LAYOUT_MODES.CUSTOM ? 'custom' : 'generated grid'
            }`}
            open={openSections.panels}
            onToggle={() => toggleSection('panels')}
            innerRef={sectionRef('panels')}
          >
            <div className={styles.toolRow} aria-label="Board drawing tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_PANEL)}
              {renderToolButton(CANVAS_TOOLS.TRACE_PANEL)}
            </div>
            <InfoHint label="How drawing and reveals work">
              <p className={styles.inlineHelp}>
                Use Trace cut panel for slab-style corner input. Click the first point or double-click to close the
                board; Escape cancels the trace.
              </p>
              <p className={styles.inlineHelp}>
                Express reveals are real installation space. Generated panels use it automatically; new custom panels
                snap around the framing centerline, leaving equal panel landing on both sides. With this framing, the
                live rule is ({supportWidth} mm support − reveal) ÷ 2. Confirm the final joint and backing detail for
                the selected product and application.
              </p>
            </InfoHint>
            <SelectField label="Layout" value={face.layout.mode} onChange={(mode) => updateLayout({ mode })}>
              <option value={PANEL_LAYOUT_MODES.GRID}>Generated grid</option>
              <option value={PANEL_LAYOUT_MODES.CUSTOM}>Explicit custom panels</option>
            </SelectField>
            <SelectField
              label="Orientation"
              value={face.layout.orientation}
              onChange={(orientation) => updateLayout({ orientation })}
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </SelectField>
            <NumberField
              label="Board width"
              value={face.layout.boardWidth}
              min={1}
              onChange={(boardWidth) => updateLayout({ boardWidth })}
            />
            <NumberField
              label="Board height"
              value={face.layout.boardHeight}
              min={1}
              onChange={(boardHeight) => updateLayout({ boardHeight })}
            />
            <NumberField
              label="Vertical reveal"
              value={face.layout.horizontalGap}
              min={0}
              onChange={(horizontalGap) => updateLayout({ horizontalGap })}
            />
            <NumberField
              label="Horizontal reveal"
              value={face.layout.verticalGap}
              min={0}
              onChange={(verticalGap) => updateLayout({ verticalGap })}
            />
            <div className={styles.presetRow} aria-label="Shadow reveal presets">
              <span className={styles.presetLabel}>Shadow gap</span>
              {REVEAL_PRESETS.map((gap) => (
                <ToolbarButton
                  key={gap}
                  active={face.layout.horizontalGap === gap && face.layout.verticalGap === gap}
                  title={gap === 0 ? 'No shadow gap between boards' : `${gap} mm shadow gap on both axes`}
                  onClick={() => setShadowReveal(gap)}
                >
                  {gap === 0 ? 'Closed' : `${gap} mm`}
                </ToolbarButton>
              ))}
            </div>
            <AdvancedGroup>
              <SelectField
                label="Reveal intent"
                value={face.layout.revealIntent}
                onChange={(revealIntent) => updateLayout({ revealIntent })}
              >
                <option value={PANEL_REVEAL_INTENTS.AESTHETIC_SHADOW_LINE}>Aesthetic shadow line</option>
                <option value={PANEL_REVEAL_INTENTS.INSTALLATION_TOLERANCE}>Installation tolerance</option>
                <option value={PANEL_REVEAL_INTENTS.MOVEMENT_CONTROL}>Movement / control joint</option>
              </SelectField>
              <NumberField
                label="Grid origin U"
                value={face.layout.originU}
                onChange={(originU) => updateLayout({ originU })}
              />
              <NumberField
                label="Grid origin V"
                value={face.layout.originV}
                onChange={(originV) => updateLayout({ originV })}
              />
              <SelectField
                label="Joint finish"
                value={face.layout.jointSystem}
                onChange={(jointSystem) => updateLayout({ jointSystem })}
              >
                {profile.jointSystems.map((joint) => (
                  <option key={joint} value={joint}>
                    {JOINT_SYSTEM_LABELS[joint] || joint}
                  </option>
                ))}
              </SelectField>
            </AdvancedGroup>
            <div className={styles.buttonRow}>
              <ToolbarButton title="Turn the generated grid into editable panels" onClick={materializePanels}>
                Edit generated panels
              </ToolbarButton>
              <ToolbarButton title="Drop one full stock-size board at the wall origin" onClick={addPanel}>
                Add stock-size panel
              </ToolbarButton>
              <ToolbarButton
                title="Clear every board on this face and start from nothing"
                onClick={() => {
                  updateLayout({ mode: PANEL_LAYOUT_MODES.CUSTOM, customPanels: [] });
                  setSelection(null);
                }}
              >
                Start blank
              </ToolbarButton>
              <ToolbarButton title="Discard custom boards and rebuild the generated grid" onClick={resetPanelGrid}>
                Reset generated grid
              </ToolbarButton>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="framing"
            step={4}
            title="Framing"
            summary={`${frameMembers.length} member${frameMembers.length === 1 ? '' : 's'} · ${
              configuration.framing.mode === FRAMING_LAYOUT_MODES.CUSTOM ? 'custom' : 'automatic'
            }`}
            open={openSections.framing}
            onToggle={() => toggleSection('framing')}
            innerRef={sectionRef('framing')}
          >
            <div className={styles.toolRow} aria-label="Framing drawing tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_STUD)}
              {renderToolButton(CANVAS_TOOLS.DRAW_NOGGIN)}
            </div>
            <InfoHint label="Studs, noggins and backing">
              <p className={styles.inlineHelp}>
                Studs run floor to ceiling; noggins are the horizontal blocking between them. Every board joint needs a
                member behind it, so use Add missing joint backing after moving boards around.
              </p>
            </InfoHint>
            <SelectField
              label="Mode"
              value={configuration.framing.mode}
              onChange={(mode) => updateDetailing({ framing: { ...configuration.framing, mode } })}
            >
              <option value={FRAMING_LAYOUT_MODES.AUTOMATIC}>Automatic + custom</option>
              <option value={FRAMING_LAYOUT_MODES.CUSTOM}>Explicit custom members</option>
            </SelectField>
            <div className={styles.buttonRow}>
              <ToolbarButton
                title="Turn the automatic frame into editable members"
                onClick={materializeFraming}
                disabled={!framedAssembly}
              >
                Edit all members
              </ToolbarButton>
              <ToolbarButton
                title="Add framing behind any board joint that has none"
                onClick={addPanelJointBacking}
                disabled={!framedAssembly}
              >
                Add missing joint backing
              </ToolbarButton>
              <ToolbarButton
                title="Drop a full-height stud at the middle of the wall"
                onClick={() => addFramingMember('vertical')}
                disabled={!framedAssembly}
              >
                Add centered stud
              </ToolbarButton>
              <ToolbarButton
                title="Discard custom members and rebuild the automatic frame"
                onClick={resetAutomaticFraming}
                disabled={!framedAssembly}
              >
                Reset automatic framing
              </ToolbarButton>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="fasteners"
            step={5}
            title="Fasteners"
            summary={`${fasteners.length} screw${fasteners.length === 1 ? '' : 's'} · ${
              face.fasteners.perimeterSpacing
            } mm perimeter`}
            open={openSections.fasteners}
            onToggle={() => toggleSection('fasteners')}
            innerRef={sectionRef('fasteners')}
          >
            <div className={styles.toolRow} aria-label="Fastener tools">
              {renderToolButton(CANVAS_TOOLS.ADD_FASTENER)}
            </div>
            <SelectField label="Mode" value={face.fasteners.mode} onChange={(mode) => updateFastenerPattern({ mode })}>
              <option value={FASTENER_LAYOUT_MODES.GENERATED}>Generated + overrides</option>
              <option value={FASTENER_LAYOUT_MODES.CUSTOM}>Explicit custom fasteners</option>
            </SelectField>
            <NumberField
              label="Perimeter spacing"
              value={face.fasteners.perimeterSpacing}
              min={1}
              onChange={(perimeterSpacing) => updateFastenerPattern({ perimeterSpacing })}
            />
            <NumberField
              label="Field spacing"
              value={face.fasteners.fieldSpacing}
              min={1}
              onChange={(fieldSpacing) => updateFastenerPattern({ fieldSpacing })}
            />
            <NumberField
              label="Edge clearance"
              value={face.fasteners.edgeClearance}
              min={1}
              onChange={(edgeClearance) => updateFastenerPattern({ edgeClearance })}
            />
            <NumberField
              label="Corner clearance"
              value={face.fasteners.cornerClearance}
              min={1}
              onChange={(cornerClearance) => updateFastenerPattern({ cornerClearance })}
            />
            <AdvancedGroup label="Screw appearance">
              <SelectField
                label="Visual expression"
                value={face.fasteners.appearance}
                onChange={(appearance) => updateFastenerPattern({ appearance })}
              >
                <option value={FASTENER_APPEARANCE_MODES.TONAL}>Quiet / panel-matched</option>
                <option value={FASTENER_APPEARANCE_MODES.METAL}>Exposed stainless</option>
                <option value={FASTENER_APPEARANCE_MODES.CONTRAST}>Deliberate dark accent</option>
                <option value={FASTENER_APPEARANCE_MODES.CONSTRUCTION}>Construction check overlay</option>
              </SelectField>
              <NumberField
                label="Head diameter"
                value={face.fasteners.headDiameter}
                min={4}
                onChange={(headDiameter) => updateFastenerPattern({ headDiameter: Math.min(30, headDiameter) })}
              />
              <InfoHint label="Choosing an expression">
                <p className={styles.inlineHelp}>
                  For an abstract panel composition, keep the fixing rhythm quiet and regular. Panel-matched heads
                  preserve the reveal pattern; dark heads should be used only as one consistent secondary dot grid.
                  Appearance does not relax edge, spacing, or backing checks.
                </p>
              </InfoHint>
            </AdvancedGroup>
            <div className={styles.fastenerGuideBuilder}>
              <AdvancedGroup label="Measured screw pencil guide">
                <p>
                  The panel edge is the set-out datum. Trace each panel perimeter so two panels across a shadow gap get
                  two independent screw rows. Framing is used only to verify that every screw hits backing.
                </p>
                <TextField
                  label="Guide name"
                  value={fastenerGuideDraft.name}
                  onChange={(name) => setFastenerGuideDraft((guide) => ({ ...guide, name }))}
                />
                <SelectField
                  label="Guide source"
                  value={fastenerGuideDraft.mode}
                  onChange={(mode) => setFastenerGuideDraft((guide) => ({ ...guide, mode }))}
                >
                  <option value={FASTENER_GUIDE_MODES.PANEL_PERIMETER}>Trace selected panel perimeter</option>
                  <option value={FASTENER_GUIDE_MODES.LINEAR}>Single custom pencil line</option>
                </SelectField>
                {fastenerGuideDraft.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER ? (
                  <>
                    <div className={styles.fastenerGuideDatum}>
                      <span>Traced panel</span>
                      <strong>{fastenerGuideDraftLayout?.panel?.label || 'Select a panel on the drawing'}</strong>
                    </div>
                    <NumberField
                      label="Edge setback"
                      value={fastenerGuideDraft.edgeClearance}
                      min={1}
                      step={face.dimensions.precision}
                      onChange={(edgeClearance) => setFastenerGuideDraft((guide) => ({ ...guide, edgeClearance }))}
                    />
                    <NumberField
                      label="Corner setback"
                      value={fastenerGuideDraft.cornerClearance}
                      min={1}
                      step={face.dimensions.precision}
                      onChange={(cornerClearance) => setFastenerGuideDraft((guide) => ({ ...guide, cornerClearance }))}
                    />
                  </>
                ) : (
                  <>
                    <SelectField
                      label="Guide direction"
                      value={fastenerGuideDraft.direction}
                      onChange={(direction) => setFastenerGuideDraft((guide) => ({ ...guide, direction }))}
                    >
                      <option value={FASTENER_GUIDE_DIRECTIONS.VERTICAL}>Vertical pencil line</option>
                      <option value={FASTENER_GUIDE_DIRECTIONS.HORIZONTAL}>Horizontal pencil line</option>
                    </SelectField>
                    <SelectField
                      label="Fixing zone"
                      value={fastenerGuideDraft.zone}
                      onChange={(zone) => setFastenerGuideDraft((guide) => ({ ...guide, zone }))}
                    >
                      <option value={FASTENER_GUIDE_ZONES.PERIMETER}>Panel perimeter</option>
                      <option value={FASTENER_GUIDE_ZONES.FIELD}>Panel field</option>
                    </SelectField>
                    <NumberField
                      label={
                        fastenerGuideDraft.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL
                          ? 'Pencil line U'
                          : 'Pencil line V'
                      }
                      value={fastenerGuideDraft.coordinate}
                      min={0}
                      step={face.dimensions.precision}
                      onChange={(coordinate) => setFastenerGuideDraft((guide) => ({ ...guide, coordinate }))}
                    />
                    <NumberField
                      label={
                        fastenerGuideDraft.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL
                          ? 'First screw V'
                          : 'First screw U'
                      }
                      value={fastenerGuideDraft.start}
                      min={0}
                      step={face.dimensions.precision}
                      onChange={(start) => setFastenerGuideDraft((guide) => ({ ...guide, start }))}
                    />
                    <NumberField
                      label={
                        fastenerGuideDraft.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL
                          ? 'End limit V'
                          : 'End limit U'
                      }
                      value={fastenerGuideDraft.end}
                      min={0}
                      step={face.dimensions.precision}
                      onChange={(end) => setFastenerGuideDraft((guide) => ({ ...guide, end }))}
                    />
                  </>
                )}
                <NumberField
                  label="Screw pitch O.C."
                  value={fastenerGuideDraft.spacing}
                  min={1}
                  step={face.dimensions.precision}
                  onChange={(spacing) => setFastenerGuideDraft((guide) => ({ ...guide, spacing }))}
                />
                {fastenerGuideDraftLayout ? (
                  <div className={styles.fastenerGuideSummary}>
                    <strong>{fastenerGuideDraftLayout.stations.length} screw stations</strong>
                    <span>
                      {formatWallDimensionValue(fastenerGuideDraftLayout.spacing, face.dimensions.precision)} O.C.
                    </span>
                    {fastenerGuideDraftLayout.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER ? (
                      <>
                        <span>
                          Two rows across a vertical gap:{' '}
                          {formatWallDimensionValue(
                            face.layout.horizontalGap + fastenerGuideDraftLayout.edgeClearance * 2,
                            face.dimensions.precision,
                          )}{' '}
                          apart
                        </span>
                        <span>
                          Edge setback{' '}
                          {formatWallDimensionValue(fastenerGuideDraftLayout.edgeClearance, face.dimensions.precision)}{' '}
                          within {formatWallDimensionValue(verticalJointLanding, face.dimensions.precision)} panel
                          landing
                        </span>
                      </>
                    ) : null}
                    <span>
                      Product planning maximum{' '}
                      {formatWallDimensionValue(
                        fastenerGuideDraftLayout.zone === FASTENER_GUIDE_ZONES.FIELD
                          ? profile.planningDefaults.fieldSpacingMm
                          : profile.planningDefaults.perimeterSpacingMm,
                        face.dimensions.precision,
                      )}
                    </span>
                    <span>
                      {fastenerGuideDraftLayout.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER
                        ? 'Maximum edge remainder '
                        : 'End remainder '}
                      {formatWallDimensionValue(fastenerGuideDraftLayout.remainder, face.dimensions.precision)}
                    </span>
                  </div>
                ) : null}
                <div className={styles.buttonRow}>
                  <ToolbarButton disabled={selection?.type !== 'panel'} onClick={useSelectedPanelForGuide}>
                    Trace selected panel perimeter
                  </ToolbarButton>
                  <ToolbarButton disabled={!panels.length} onClick={traceAllPanelPerimeters}>
                    Trace all panel perimeters
                  </ToolbarButton>
                  <ToolbarButton
                    disabled={
                      fastenerGuideDraft.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER &&
                      !fastenerGuideDraftLayout?.panel
                    }
                    onClick={applyFastenerGuide}
                  >
                    {fastenerGuideDraft.id ? 'Update guide screws' : 'Apply guide screws'}
                  </ToolbarButton>
                  <ToolbarButton onClick={startNewFastenerGuide}>New guide</ToolbarButton>
                </div>
                {fastenerGuideLayouts.length ? (
                  <div className={styles.fastenerGuideList}>
                    {fastenerGuideLayouts.map((guide) => (
                      <div key={guide.id} data-active={fastenerGuideDraft.id === guide.id ? 'true' : 'false'}>
                        <button type="button" onClick={() => loadFastenerGuide(guide)}>
                          <strong>{guide.name}</strong>
                          <small>
                            {guide.stations.length} screws · {guide.zone} ·{' '}
                            {formatWallDimensionValue(guide.spacing, face.dimensions.precision)} O.C.
                          </small>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${guide.name}`}
                          title={`Delete ${guide.name}`}
                          onClick={() => deleteFastenerGuide(guide.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No pencil guides yet">
                    Select a board, then trace its perimeter to lay a measured screw row.
                  </EmptyState>
                )}
              </AdvancedGroup>
            </div>
            <div className={styles.buttonRow}>
              <ToolbarButton title="Turn generated screws into editable screws" onClick={materializeFasteners}>
                Edit all screws
              </ToolbarButton>
              <ToolbarButton title="Discard manual screws and rebuild the pattern" onClick={regenerateFasteners}>
                Regenerate screws
              </ToolbarButton>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="dimensions"
            step={6}
            title="Construction dimensions"
            summary={`${dimensions.length} shown · ${
              dimensions.filter((dimension) => dimension.source === 'custom').length
            } yours`}
            open={openSections.dimensions}
            onToggle={() => toggleSection('dimensions')}
            innerRef={sectionRef('dimensions')}
          >
            <div className={styles.toolRow} aria-label="Measuring tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_DIMENSION)}
            </div>
            <InfoHint label="How exact measuring works">
              <p className={styles.inlineHelp}>
                Click two exact points to measure, or drag; hold Shift to keep the run level or plumb. Dimensions use
                64-bit model geometry: endpoints project continuously onto wall, panel, opening, and framing edges and
                stay associatively linked when geometry changes. Free endpoints use the measurement precision—not the
                coarse drawing grid. Aim for the green snap target before clicking; with Select, drag the amber line to
                move the whole guide, or drag either green endpoint to reshape it. Place Screw snaps continuously to
                user measurements and their crossings.
              </p>
            </InfoHint>
            <SelectField
              label="Precision"
              value={String(face.dimensions.precision)}
              onChange={(precision) => updateDimensionSettings({ precision: Number(precision) })}
            >
              {WALL_DIMENSION_PRECISIONS.map((precision) => (
                <option key={precision} value={precision}>
                  {precision.toFixed(precision === 1 ? 0 : precision === 0.1 ? 1 : 2)} mm
                </option>
              ))}
            </SelectField>
            <div className={styles.dimensionToggles}>
              <Toggle
                checked={face.dimensions.showOverall}
                onChange={(showOverall) => updateDimensionSettings({ showOverall })}
                label="Overall width and height"
              />
              <Toggle
                checked={face.dimensions.showOpenings}
                onChange={(showOpenings) => updateDimensionSettings({ showOpenings })}
                label="Opening sizes and set-out"
              />
              <Toggle
                checked={face.dimensions.showPanels}
                onChange={(showPanels) => updateDimensionSettings({ showPanels })}
                label="Panel and shadow-gap chains"
              />
              <Toggle
                checked={face.dimensions.showFraming}
                onChange={(showFraming) => updateDimensionSettings({ showFraming })}
                label="Framing centre spacing"
              />
            </div>
          </CollapsibleSection>
        </aside>

        <main className={styles.workspace}>
          <div className={styles.canvasToolbar}>
            <div className={styles.toolPalette} role="toolbar" aria-label="Drawing tools">
              {['navigate', 'board', 'frame', 'detail'].map((group) => (
                <div key={group} className={styles.toolCluster} title={TOOL_GROUP_LABELS[group]}>
                  {TOOL_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => (
                    <span key={definition.tool} className={styles.toolSlot}>
                      {renderToolButton(definition.tool)}
                    </span>
                  ))}
                </div>
              ))}
              <div className={styles.toolCluster}>
                <ToolButton
                  icon="undo"
                  label="Undo"
                  shortcut="Ctrl+Z"
                  title="Undo the last change (Ctrl+Z)"
                  toggle={false}
                  disabled={!canUndo}
                  onClick={() => dispatch({ type: 'UNDO' })}
                />
                <ToolButton
                  icon="redo"
                  label="Redo"
                  shortcut="Ctrl+Y"
                  title="Redo the undone change (Ctrl+Y)"
                  toggle={false}
                  disabled={!canRedo}
                  onClick={() => dispatch({ type: 'REDO' })}
                />
              </div>
              <div className={styles.toolCluster}>
                <ToolButton
                  icon="trash"
                  label="Delete"
                  shortcut="Del"
                  title="Delete selected — remove the selected board, member, screw, or measurement (Delete)"
                  danger
                  toggle={false}
                  disabled={!selectionIsDeletable}
                  onClick={deleteSelection}
                />
              </div>
            </div>
            <div className={styles.toolGroup}>
              <span>View</span>
              <ToolbarButton
                active={workspaceView === WORKSPACE_VIEWS.ELEVATION}
                title="Show the flat elevation drawing only"
                onClick={() => setWorkspaceView(WORKSPACE_VIEWS.ELEVATION)}
              >
                Elevation
              </ToolbarButton>
              <ToolbarButton
                active={workspaceView === WORKSPACE_VIEWS.SPLIT}
                title="Show the elevation drawing above the live 3D preview"
                onClick={() => setWorkspaceView(WORKSPACE_VIEWS.SPLIT)}
              >
                Split
              </ToolbarButton>
              <ToolbarButton
                active={workspaceView === WORKSPACE_VIEWS.THREE_D}
                title="Show the live 3D preview only"
                onClick={() => setWorkspaceView(WORKSPACE_VIEWS.THREE_D)}
              >
                Live 3D
              </ToolbarButton>
              <ToolbarButton
                title="Zoom out"
                aria-label="Zoom out"
                onClick={() => zoomViewportAt((zoom) => zoom / 1.2)}
              >
                −
              </ToolbarButton>
              <span className={styles.zoomReadout}>{Math.round(viewport.zoom * 100)}%</span>
              <ToolbarButton title="Zoom in" aria-label="Zoom in" onClick={() => zoomViewportAt((zoom) => zoom * 1.2)}>
                +
              </ToolbarButton>
              <ToolbarButton title="Fit the whole wall in view (0)" onClick={fitWallInViewport}>
                Fit wall
              </ToolbarButton>
            </div>
            <div className={styles.toolGroup}>
              <span>Snap</span>
              <Toggle checked={snapEnabled} onChange={setSnapEnabled} label="Snap" />
              <label className={styles.snapControl}>
                <span>Grid</span>
                <select
                  value={snapStep}
                  title="Drawing grid step used while snapping"
                  onChange={(event) => setSnapStep(Number(event.target.value))}
                >
                  <option value={25}>25 mm</option>
                  <option value={50}>50 mm</option>
                  <option value={100}>100 mm</option>
                </select>
              </label>
            </div>
            <div className={styles.toolGroup}>
              <span>Layers</span>
              {Object.keys(layerVisibility).map((key) => (
                <Toggle
                  key={key}
                  checked={layerVisibility[key]}
                  onChange={(checked) => setLayerVisibility((value) => ({ ...value, [key]: checked }))}
                  label={LAYER_LABELS[key] || key}
                />
              ))}
            </div>
          </div>
          <div
            className={styles.statusBar}
            data-snapped={activeRevealSnap || activeDimensionSnap || activeFastenerGuideSnap ? 'true' : 'false'}
          >
            <span className={styles.statusLive} role="status">
              <span className={styles.statusTool}>
                <ToolGlyph name={activeToolDefinition.icon} />
                <strong>{activeToolDefinition.label}</strong>
                <kbd className={styles.kbd}>{activeToolDefinition.shortcut}</kbd>
              </span>
              <span className={styles.statusHint}>{TOOL_HINTS[canvasTool]}</span>
              {activeRevealSnap || activeDimensionSnap || activeFastenerGuideSnap ? (
                <span className={styles.statusSnap}>
                  {activeRevealSnap
                    ? `Snapped: ${activeRevealSnap.gap} mm panel gap`
                    : `Snapped to ${describeReference(activeDimensionSnap || activeFastenerGuideSnap)}`}
                </span>
              ) : null}
              <span className={styles.statusSelection}>{selectionSummary}</span>
            </span>
            <span className={styles.statusShortcut}>
              Hold Space + drag to pan · scroll to zoom · 0 fits the wall · Esc cancels, then returns to Select
            </span>
          </div>
          <div
            className={styles.workspaceViews}
            data-view={workspaceView}
            onPointerDownCapture={panelPeek ? dismissPanelPeek : undefined}
            onWheelCapture={panelPeek ? dismissPanelPeek : undefined}
          >
            {focusMode && toolHud ? (
              <div key={toolHud.nonce} className={styles.toolHud} role="status">
                <kbd className={styles.kbd}>{toolHud.shortcut}</kbd>
                <strong>{toolHud.label}</strong>
                <em>{TOOL_HINTS[toolHud.tool]}</em>
              </div>
            ) : null}
            {workspaceView !== WORKSPACE_VIEWS.THREE_D ? (
              <div className={styles.elevationPane}>
                <div
                  ref={canvasFrameRef}
                  className={styles.canvasFrame}
                  data-panning={panGesture ? 'true' : 'false'}
                  data-space-pan={spacePanActive ? 'true' : 'false'}
                  onWheel={handleViewportWheel}
                  onPointerDown={beginViewportPan}
                  onPointerMove={updateViewportPan}
                  onPointerUp={finishViewportPan}
                  onPointerCancel={finishViewportPan}
                >
                  <svg
                    ref={svgRef}
                    className={styles.canvas}
                    viewBox={`0 0 ${detail.length} ${detail.height}`}
                    data-tool={canvasTool}
                    style={{
                      // Aspect-true box: keeps pointer math exact (no letterboxing)
                      // and makes zoom 100% a genuine fit inside the rulers.
                      ...(canvasMetrics.ready
                        ? { width: canvasMetrics.fitWidth, height: canvasMetrics.fitHeight }
                        : {}),
                      transform: `translate(${viewport.panU}px, ${viewport.panV}px) scale(${viewport.zoom})`,
                    }}
                    onPointerDown={beginCanvasGesture}
                    onPointerMove={updateCanvasGesture}
                    onPointerUp={finishCanvasGesture}
                    onDoubleClick={finishPanelTrace}
                    onPointerLeave={() => {
                      if (!gesture) setDimensionAcquisition(null);
                    }}
                    onPointerCancel={() => {
                      setGesture(null);
                      setDimensionAcquisition(null);
                    }}
                  >
                    <rect width={detail.length} height={detail.height} fill="#202830" />
                    <g transform={`translate(0 ${detail.height}) scale(1 -1)`}>
                      <WallCanvasGrid bounds={bounds} snapStep={snapStep} unitPx={unitPx} active={snapEnabled} />
                      {layerVisibility.panels &&
                        panels.flatMap((panel) =>
                          panel.polygonal
                            ? panel.regions.map((region, index) => (
                                <path
                                  key={`${panel.id}:region:${index}`}
                                  className={styles.panelShape}
                                  data-selected={
                                    selection?.type === 'panel' && selection.id === panel.localId ? 'true' : 'false'
                                  }
                                  d={panelRegionPath(region)}
                                  fill={faceColor(assembly[activeSide].material)}
                                  fillRule="evenodd"
                                  vectorEffect="non-scaling-stroke"
                                  onPointerDown={(event) => beginElementMove(event, 'panel', panel.localId, panel)}
                                >
                                  <title>{`${panel.label} · ${formatMm(panel.width)} × ${formatMm(panel.height)} mm`}</title>
                                </path>
                              ))
                            : panel.fragments.map((fragment, index) => (
                                <rect
                                  key={`${panel.id}:${index}`}
                                  className={styles.panelShape}
                                  data-selected={
                                    selection?.type === 'panel' && selection.id === panel.localId ? 'true' : 'false'
                                  }
                                  x={fragment.u0}
                                  y={fragment.v0}
                                  width={fragment.u1 - fragment.u0}
                                  height={fragment.v1 - fragment.v0}
                                  fill={faceColor(assembly[activeSide].material)}
                                  vectorEffect="non-scaling-stroke"
                                  onPointerDown={(event) => beginElementMove(event, 'panel', panel.localId, panel)}
                                >
                                  <title>{`${panel.label} · ${formatMm(panel.width)} × ${formatMm(panel.height)} mm`}</title>
                                </rect>
                              )),
                        )}
                      {layerVisibility.framing &&
                        frameMembers
                          .filter((member) => member.frameIndex === 0)
                          .map((member) => (
                            <rect
                              key={member.id}
                              className={styles.frameShape}
                              data-selected={
                                selection?.type === 'framing' && selection.id === member.id ? 'true' : 'false'
                              }
                              x={member.u0}
                              y={member.v0}
                              width={member.u1 - member.u0}
                              height={member.v1 - member.v0}
                              vectorEffect="non-scaling-stroke"
                              onPointerDown={(event) => beginElementMove(event, 'framing', member.id, member)}
                            >
                              <title>
                                {member.orientation === 'vertical'
                                  ? `${member.kind} · centre U ${formatMm((member.u0 + member.u1) / 2)}`
                                  : `${member.kind} · centre V ${formatMm((member.v0 + member.v1) / 2)}`}
                              </title>
                            </rect>
                          ))}
                      {layerVisibility.fasteners &&
                        fasteners.map((fastener) => (
                          <FastenerGraphic
                            key={fastener.id}
                            fastener={fastener}
                            appearance={face.fasteners.appearance}
                            material={assembly[activeSide].material}
                            headDiameter={face.fasteners.headDiameter}
                            minimumRadius={Math.min(detail.length, detail.height) / 600}
                            selected={selection?.type === 'fastener' && selection.id === fastener.id}
                            title={`Screw · U ${formatMm(fastener.u)} · V ${formatMm(fastener.v)}`}
                            onPointerDown={(event) => beginElementMove(event, 'fastener', fastener.id, fastener)}
                          />
                        ))}
                      {detail.openings.map((opening) => (
                        <rect
                          key={opening.id}
                          x={opening.u0}
                          y={opening.v0}
                          width={opening.u1 - opening.u0}
                          height={opening.v1 - opening.v0}
                          fill="#f7f8fa"
                          stroke="#101419"
                          strokeWidth="8"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      {layerVisibility.asBuilt &&
                        detail.asBuilt.map((measurement) =>
                          measurement.axis === 'u' ? (
                            <line
                              key={measurement.id}
                              x1={measurement.measuredValue}
                              x2={measurement.measuredValue}
                              y1={0}
                              y2={detail.height}
                              stroke={measurement.status === 'within_tolerance' ? '#4caf83' : '#e45545'}
                              strokeWidth="4"
                              strokeDasharray="18 12"
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : (
                            <line
                              key={measurement.id}
                              x1={0}
                              x2={detail.length}
                              y1={measurement.measuredValue}
                              y2={measurement.measuredValue}
                              stroke={measurement.status === 'within_tolerance' ? '#4caf83' : '#e45545'}
                              strokeWidth="4"
                              strokeDasharray="18 12"
                              vectorEffect="non-scaling-stroke"
                            />
                          ),
                        )}
                      {gesturePreview && gesturePreviewType === 'panel' ? (
                        <g className={styles.drawPreview}>
                          <rect
                            x={gesturePreview.u0}
                            y={gesturePreview.v0}
                            width={gesturePreview.u1 - gesturePreview.u0}
                            height={gesturePreview.v1 - gesturePreview.v0}
                            fill="rgba(255, 184, 92, .28)"
                            stroke="#ffb85c"
                            strokeWidth="4"
                            strokeDasharray="18 10"
                            vectorEffect="non-scaling-stroke"
                          />
                          {(gesturePreview.revealSnaps || []).map((snap, index) => (
                            <rect
                              key={`${snap.axis}:${snap.edge}:${index}`}
                              x={snap.axis === 'u' ? Math.min(snap.from, snap.to) : snap.start}
                              y={snap.axis === 'v' ? Math.min(snap.from, snap.to) : snap.start}
                              width={snap.axis === 'u' ? Math.abs(snap.to - snap.from) : snap.end - snap.start}
                              height={snap.axis === 'v' ? Math.abs(snap.to - snap.from) : snap.end - snap.start}
                              fill="rgba(103, 197, 166, .5)"
                              stroke="#67c5a6"
                              strokeWidth="3"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      ) : null}
                      {panelTracePreview.length ? (
                        <g className={styles.drawPreview}>
                          <polyline
                            points={panelTracePreview.map((point) => `${point.u},${point.v}`).join(' ')}
                            fill={panelTracePreview.length >= 3 ? 'rgba(255, 184, 92, .2)' : 'none'}
                            stroke="#ffb85c"
                            strokeWidth="4"
                            strokeDasharray="18 10"
                            vectorEffect="non-scaling-stroke"
                          />
                          {panelTrace.points.map((point, index) => (
                            <circle
                              key={`${point.u}:${point.v}:${index}`}
                              cx={point.u}
                              cy={point.v}
                              r={Math.max(12, Math.min(detail.length, detail.height) / 150)}
                              fill={index === 0 ? '#67c5a6' : '#ffb85c'}
                              stroke="#fff"
                              strokeWidth="3"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      ) : null}
                      {gesturePreview && gesturePreviewType === 'framing' ? (
                        <rect
                          className={styles.drawPreview}
                          x={gesturePreview.u0}
                          y={gesturePreview.v0}
                          width={gesturePreview.u1 - gesturePreview.u0}
                          height={gesturePreview.v1 - gesturePreview.v0}
                          fill="rgba(82, 183, 232, .46)"
                          stroke="#72d0f5"
                          strokeWidth="4"
                          strokeDasharray="18 10"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                      {gesturePreview && gesturePreviewType === 'fastener' ? (
                        <circle
                          className={styles.drawPreview}
                          cx={gesturePreview.u}
                          cy={gesturePreview.v}
                          r={Math.max(10, Math.min(detail.length, detail.height) / 250)}
                          fill="#ffd166"
                          stroke="#fff"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                    </g>
                    {layerVisibility.fasteners &&
                      fastenerGuideLayouts.map((guide) => (
                        <FastenerGuideGraphic
                          key={guide.id}
                          guide={guide}
                          wallHeight={detail.height}
                          precision={face.dimensions.precision}
                          selected={fastenerGuideDraft.id === guide.id}
                        />
                      ))}
                    {layerVisibility.dimensions &&
                      dimensions.map((dimension) => {
                        const renderedDimension =
                          dimensionGesturePreview?.id === dimension.id ? dimensionGesturePreview : dimension;
                        const selected = selection?.type === 'dimension' && selection.id === dimension.id;
                        const editable =
                          selected && dimension.source === 'custom' && canvasTool === CANVAS_TOOLS.SELECT;
                        return (
                          <DimensionGraphic
                            key={dimension.id}
                            dimension={renderedDimension}
                            wallHeight={detail.height}
                            selected={selected}
                            editable={editable}
                            showScrewGuide={dimension.source === 'custom' && canvasTool === CANVAS_TOOLS.ADD_FASTENER}
                            unitPx={unitPx}
                            handleRadius={dimensionHandleRadius}
                            fontSize={dimensionFontSize}
                            title={`${dimension.name || 'Measurement'} · ${dimension.label}`}
                            onPointerDown={(event) =>
                              dimension.source === 'custom'
                                ? beginDimensionMove(event, dimension)
                                : selectDimension(event, dimension)
                            }
                            onStartHandlePointerDown={(event) => beginDimensionEndpointMove(event, dimension, 'start')}
                            onEndHandlePointerDown={(event) => beginDimensionEndpointMove(event, dimension, 'end')}
                          />
                        );
                      })}
                    {gesturePreview && gesturePreviewType === 'dimension' ? (
                      <DimensionGraphic
                        dimension={gesturePreview}
                        wallHeight={detail.height}
                        selected
                        unitPx={unitPx}
                        handleRadius={dimensionHandleRadius}
                        fontSize={dimensionFontSize}
                      />
                    ) : null}
                    {(canvasTool === CANVAS_TOOLS.DRAW_DIMENSION ||
                      canvasTool === CANVAS_TOOLS.ADD_FASTENER ||
                      gesture?.kind === 'dimension_endpoint') &&
                    dimensionAcquisition ? (
                      <DimensionAcquisitionGraphic
                        acquisition={dimensionAcquisition}
                        wallHeight={detail.height}
                        precision={face.dimensions.precision}
                        referenceLabel={describeReference(dimensionAcquisition.reference)}
                      />
                    ) : null}
                    {gestureReadout ? (
                      <CanvasReadoutChip
                        point={gestureReadout.point}
                        lines={gestureReadout.lines}
                        unitPx={unitPx}
                        wallHeight={detail.height}
                      />
                    ) : null}
                  </svg>
                  <WallCanvasRulers metrics={canvasMetrics} viewport={viewport} bounds={bounds} />
                  {panels.length === 0 ? (
                    <div className={styles.canvasEmptyHint}>
                      <strong>No boards on this face yet</strong>
                      <span>
                        Press <kbd className={styles.kbd}>P</kbd> and drag out a rectangle, or open step 3 and switch
                        the layout to a generated grid.
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className={styles.dimensionBar}>
                  <span>U 0 → {detail.length.toFixed(0)} mm</span>
                  <span>V 0 → {detail.height.toFixed(0)} mm</span>
                  <span>{dimensions.length} visible construction dimensions</span>
                  <span>Measure precision: {face.dimensions.precision} mm</span>
                  <span>Origin: wall start / finished floor</span>
                  <span>Face: {activeSide === WALL_DETAIL_SIDES.INTERIOR ? 'inside' : 'outside'}</span>
                </div>
              </div>
            ) : null}
            {workspaceView !== WORKSPACE_VIEWS.ELEVATION && previewProject ? (
              <div className={styles.previewPane} aria-label="Live wall assembly 3D preview">
                <div className={styles.liveBadge}>
                  <span>Live wall preview</span>
                  <small>Updates after every committed panel, frame, screw, gap, or assembly edit</small>
                </div>
                <Suspense fallback={<div className={styles.previewLoading}>Loading live wall preview…</div>}>
                  <ThreePreviewPanel
                    className={styles.wallPreviewPanel}
                    project={previewProject}
                    activeFloorId={floor.id}
                    applyPhaseFilter={false}
                  />
                </Suspense>
              </div>
            ) : null}
          </div>
        </main>

        <aside
          id="wall-detail-right-panel"
          className={styles.rightPanel}
          aria-label="Selection, numbers, and checks"
          data-peek={focusMode && panelPeek === 'right' ? 'true' : 'false'}
          aria-hidden={focusMode && panelPeek !== 'right' ? 'true' : undefined}
        >
          <CollapsibleSection
            id="selection"
            title="Selection"
            summary={selectionSummary}
            open={openSections.selection}
            onToggle={() => toggleSection('selection')}
            innerRef={sectionRef('selection')}
          >
            {selectedPanel || selectedMember || selectedFastener || selectedDimension ? null : (
              <EmptyState icon="select" title="Nothing selected">
                Pick the Select tool, then click a board, stud, screw, or measurement on the drawing to edit its exact
                numbers here.
              </EmptyState>
            )}

            {selectedPanel && (
              <div className={styles.selectionCard}>
                <h3>Selected panel — {selectedPanel.label}</h3>
                <p>
                  Drag on the elevation or enter exact wall-local dimensions.
                  {selectedPanel.polygonal ? ' Width and height scale the traced cut outline.' : ''}
                </p>
                <NumberField
                  label="From start (U)"
                  value={selectedPanel.u0}
                  onChange={(u) => updateSelectedPanel({ u })}
                />
                <NumberField
                  label="From floor (V)"
                  value={selectedPanel.v0}
                  onChange={(v) => updateSelectedPanel({ v })}
                />
                <NumberField
                  label="Width"
                  value={selectedPanel.width}
                  min={1}
                  onChange={(width) => updateSelectedPanel({ width })}
                />
                <NumberField
                  label="Height"
                  value={selectedPanel.height}
                  min={1}
                  onChange={(height) => updateSelectedPanel({ height })}
                />
                <ToolbarButton danger onClick={deleteSelectedPanel}>
                  Delete panel
                </ToolbarButton>
              </div>
            )}

            {selectedMember && (
              <div className={styles.selectionCard}>
                <h3>Selected framing — {selectedMember.kind}</h3>
                <p>Drag on the elevation or enter exact member extents.</p>
                <NumberField
                  label="U start"
                  value={selectedMember.u0}
                  onChange={(u0) => updateSelectedMember({ u0 })}
                />
                <NumberField label="U end" value={selectedMember.u1} onChange={(u1) => updateSelectedMember({ u1 })} />
                <NumberField
                  label="V start"
                  value={selectedMember.v0}
                  onChange={(v0) => updateSelectedMember({ v0 })}
                />
                <NumberField label="V end" value={selectedMember.v1} onChange={(v1) => updateSelectedMember({ v1 })} />
                <NumberField
                  label="Depth"
                  value={selectedMember.depth}
                  min={1}
                  onChange={(depth) => updateSelectedMember({ depth })}
                />
                <ToolbarButton danger onClick={deleteSelectedMember}>
                  Delete member
                </ToolbarButton>
              </div>
            )}

            {selectedFastener && (
              <div className={styles.selectionCard}>
                <h3>Selected fastener</h3>
                {selectedFastenerGuide ? (
                  <div className={styles.measurementReadout}>
                    <strong>{selectedFastenerGuide.name}</strong>
                    <span>Guide station {(selectedFastener.guideStation ?? 0) + 1}</span>
                    <span>
                      U {formatWallDimensionValue(selectedFastener.u, face.dimensions.precision)} · V{' '}
                      {formatWallDimensionValue(selectedFastener.v, face.dimensions.precision)}
                    </span>
                    <span>
                      Position is controlled by the measured pencil guide. Edit and update that guide to move it.
                    </span>
                  </div>
                ) : null}
                <NumberField
                  label="From start (U)"
                  value={selectedFastener.u}
                  step={face.dimensions.precision}
                  disabled={Boolean(selectedFastenerGuide)}
                  onChange={(u) => updateSelectedFastener({ u })}
                />
                <NumberField
                  label="From floor (V)"
                  value={selectedFastener.v}
                  step={face.dimensions.precision}
                  disabled={Boolean(selectedFastenerGuide)}
                  onChange={(v) => updateSelectedFastener({ v })}
                />
                {selectedFastenerGuide ? (
                  <ToolbarButton onClick={() => loadFastenerGuide(selectedFastenerGuide)}>
                    Edit controlling panel guide
                  </ToolbarButton>
                ) : (
                  <ToolbarButton danger onClick={deleteSelectedFastener}>
                    Delete fastener
                  </ToolbarButton>
                )}
              </div>
            )}

            {selectedDimension && (
              <div className={styles.selectionCard}>
                <h3>{selectedDimension.source === 'custom' ? 'Selected measurement' : selectedDimension.name}</h3>
                <div className={styles.measurementReadout}>
                  <strong>{selectedDimension.label}</strong>
                  <span>
                    Exact modeled value:{' '}
                    {formatWallDimensionValue(selectedDimension.measurement, face.dimensions.precision)}
                  </span>
                  <span>From {describeReference(selectedDimension.startRef)}</span>
                  <span>To {describeReference(selectedDimension.endRef)}</span>
                </div>
                <ToolbarButton onClick={() => prepareDimensionSiteCheck(selectedDimension)}>
                  Use for site / as-built check
                </ToolbarButton>
                {selectedDimension.source === 'custom' ? (
                  <>
                    <InfoHint label="Reshaping and screw snapping">
                      <p className={styles.inlineHelp}>
                        Drag the amber measurement line to move the complete guide. Drag either green endpoint to
                        reshape it. When placing screws, the cyan pencil line, both endpoints, and crossings with other
                        measurements are exact snap targets.
                      </p>
                    </InfoHint>
                    <div className={styles.buttonRow}>
                      <ToolbarButton
                        active={canvasTool === CANVAS_TOOLS.ADD_FASTENER}
                        onClick={() => activateDimensionScrewGuide(selectedDimension)}
                      >
                        Use as screw guide
                      </ToolbarButton>
                      <ToolbarButton onClick={() => placeFastenerAtDimensionEndpoint(selectedDimension, 'start')}>
                        Screw at start
                      </ToolbarButton>
                      <ToolbarButton onClick={() => placeFastenerAtDimensionEndpoint(selectedDimension, 'end')}>
                        Screw at measured end
                      </ToolbarButton>
                    </div>
                    <SelectField
                      label="Direction"
                      value={selectedDimension.mode}
                      onChange={(mode) => updateSelectedDimension({ mode })}
                    >
                      <option value={WALL_DIMENSION_MODES.HORIZONTAL}>Horizontal</option>
                      <option value={WALL_DIMENSION_MODES.VERTICAL}>Vertical</option>
                      <option value={WALL_DIMENSION_MODES.ALIGNED}>Aligned</option>
                    </SelectField>
                    <NumberField
                      label="Line offset"
                      value={selectedDimension.offset}
                      step={face.dimensions.precision}
                      onChange={(offset) => updateSelectedDimension({ offset })}
                    />
                    <NumberField
                      label="Tolerance ±"
                      value={selectedDimension.tolerance}
                      min={0}
                      step={face.dimensions.precision}
                      onChange={(tolerance) => updateSelectedDimension({ tolerance })}
                    />
                    <TextField
                      label="Label override"
                      value={selectedDimension.textOverride}
                      placeholder="Use measured value"
                      onChange={(textOverride) => updateSelectedDimension({ textOverride })}
                    />
                    <TextField
                      label="Site note"
                      value={selectedDimension.note}
                      onChange={(note) => updateSelectedDimension({ note })}
                    />
                    <AdvancedGroup label="Exact endpoint coordinates">
                      <p className={styles.inlineHelp}>
                        Usually you reshape by dragging the green endpoints on the drawing; typing here breaks the link
                        to the snapped edge.
                      </p>
                      <NumberField
                        label="Start · along wall"
                        value={selectedDimension.start.u}
                        step={face.dimensions.precision}
                        onChange={(u) =>
                          updateSelectedDimension({ start: { ...selectedDimension.start, u }, startRef: null })
                        }
                      />
                      <NumberField
                        label="Start · above floor"
                        value={selectedDimension.start.v}
                        step={face.dimensions.precision}
                        onChange={(v) =>
                          updateSelectedDimension({ start: { ...selectedDimension.start, v }, startRef: null })
                        }
                      />
                      <NumberField
                        label="End · along wall"
                        value={selectedDimension.end.u}
                        step={face.dimensions.precision}
                        onChange={(u) =>
                          updateSelectedDimension({ end: { ...selectedDimension.end, u }, endRef: null })
                        }
                      />
                      <NumberField
                        label="End · above floor"
                        value={selectedDimension.end.v}
                        step={face.dimensions.precision}
                        onChange={(v) =>
                          updateSelectedDimension({ end: { ...selectedDimension.end, v }, endRef: null })
                        }
                      />
                      <div className={styles.referenceSummary}>
                        <span>
                          ΔU{' '}
                          {formatWallDimensionValue(
                            Math.abs(selectedDimension.end.u - selectedDimension.start.u),
                            face.dimensions.precision,
                          )}
                        </span>
                        <span>
                          ΔV{' '}
                          {formatWallDimensionValue(
                            Math.abs(selectedDimension.end.v - selectedDimension.start.v),
                            face.dimensions.precision,
                          )}
                        </span>
                      </div>
                    </AdvancedGroup>
                    <ToolbarButton danger onClick={deleteSelectedDimension}>
                      Delete measurement
                    </ToolbarButton>
                  </>
                ) : (
                  <p>
                    This dimension is generated from the current model. Use the left-side dimension toggles to hide it.
                  </p>
                )}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="takeoff"
            title="Exact takeoff"
            summary={`${currentTakeoff.panelCount} boards · ${currentTakeoff.fastenerCount} screws`}
            open={openSections.takeoff}
            onToggle={() => toggleSection('takeoff')}
            innerRef={sectionRef('takeoff')}
          >
            <div className={styles.metrics}>
              <Metric label="Panels" value={currentTakeoff.panelCount} note="unoptimized stock count" />
              <Metric
                label="Shadow reveal"
                value={`${face.layout.horizontalGap} / ${face.layout.verticalGap} mm`}
                note="vertical / horizontal"
              />
              <Metric
                label="Panel landing / side"
                value={`${verticalJointLanding.toFixed(1)} / ${horizontalJointLanding.toFixed(1)} mm`}
                note={`(${supportWidth} mm support − reveal) ÷ 2 · vertical / horizontal joint`}
              />
              <Metric label="Installed area" value={`${(currentTakeoff.installedAreaMm2 / 1_000_000).toFixed(2)} m²`} />
              <Metric label="Fasteners" value={currentTakeoff.fastenerCount} />
              <Metric label="Joint length" value={`${(currentTakeoff.jointLengthMm / 1000).toFixed(2)} m`} />
              <Metric label="Frame members" value={detail.takeoff.framingMemberCount} />
              <Metric label="Frame length" value={`${(detail.takeoff.framingLinearLengthMm / 1000).toFixed(2)} m`} />
              <Metric
                label="Dimensions"
                value={dimensions.length}
                note={`${dimensions.filter((dimension) => dimension.source === 'custom').length} user`}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="schedule"
            title={`Dimension schedule — ${activeSide}`}
            summary={`${dimensions.length} measurement${dimensions.length === 1 ? '' : 's'}`}
            open={openSections.schedule}
            onToggle={() => toggleSection('schedule')}
            innerRef={sectionRef('schedule')}
          >
            {dimensions.length ? (
              <div className={styles.dimensionSchedule}>
                {dimensions.map((dimension) => (
                  <button
                    type="button"
                    key={dimension.id}
                    title={`Select ${dimension.name} on the drawing`}
                    className={
                      selection?.type === 'dimension' && selection.id === dimension.id ? styles.scheduleActive : ''
                    }
                    onClick={() => {
                      chooseCanvasTool(CANVAS_TOOLS.SELECT);
                      setSelection({ type: 'dimension', id: dimension.id });
                    }}
                  >
                    <span>
                      <strong>{dimension.name}</strong>
                      <small>{dimension.source === 'custom' ? 'User measurement' : 'Linked automatic dimension'}</small>
                    </span>
                    <b>{dimension.label}</b>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon="measure" title="No dimensions shown">
                Turn on the automatic dimension groups in step 6, or draw your own with the Measure tool.
              </EmptyState>
            )}
            <p className={styles.inlineHelp}>
              These are exact modeled dimensions. Confirm critical dimensions against the site survey before issue.
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            id="asBuilt"
            title="Site / as-built comparison"
            summary={`${detail.asBuilt.length} recorded`}
            open={openSections.asBuilt}
            onToggle={() => toggleSection('asBuilt')}
            innerRef={sectionRef('asBuilt')}
          >
            <TextField
              label="Label"
              value={asBuiltDraft.label}
              onChange={(label) => setAsBuiltDraft((value) => ({ ...value, label }))}
            />
            <SelectField
              label="Axis"
              value={asBuiltDraft.axis}
              onChange={(axis) => setAsBuiltDraft((value) => ({ ...value, axis }))}
            >
              <option value="u">U — along wall</option>
              <option value="v">V — height</option>
            </SelectField>
            <NumberField
              label="Design"
              value={asBuiltDraft.designValue}
              step={face.dimensions.precision}
              onChange={(designValue) => setAsBuiltDraft((value) => ({ ...value, designValue }))}
            />
            <NumberField
              label="Measured"
              value={asBuiltDraft.measuredValue}
              step={face.dimensions.precision}
              onChange={(measuredValue) => setAsBuiltDraft((value) => ({ ...value, measuredValue }))}
            />
            <NumberField
              label="Tolerance"
              value={asBuiltDraft.tolerance}
              min={face.dimensions.precision}
              step={face.dimensions.precision}
              onChange={(tolerance) => setAsBuiltDraft((value) => ({ ...value, tolerance }))}
            />
            <ToolbarButton onClick={addAsBuilt}>Record site measurement</ToolbarButton>
            {detail.asBuilt.length ? (
              <div className={styles.measurements}>
                {detail.asBuilt.map((measurement) => (
                  <div key={measurement.id} data-status={measurement.status}>
                    <span>
                      <strong>{measurement.label}</strong>
                      <small>
                        {formatWallDimensionValue(measurement.designValue, face.dimensions.precision)} →{' '}
                        {formatWallDimensionValue(measurement.measuredValue, face.dimensions.precision)}
                      </small>
                    </span>
                    <b>
                      {measurement.deviation > 0 ? '+' : measurement.deviation < 0 ? '−' : ''}
                      {formatWallDimensionValue(Math.abs(measurement.deviation), face.dimensions.precision)}
                    </b>
                    <button
                      aria-label={`Remove ${measurement.label}`}
                      title={`Remove ${measurement.label}`}
                      onClick={() => removeAsBuilt(measurement.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Nothing measured on site yet">
                Record what the crew actually measured to see the deviation against the model.
              </EmptyState>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="checks"
            title="Coordination checks"
            summary={
              detail.validationIssues.length === 0
                ? 'No modeled conflicts'
                : `${detail.validationIssues.length} to review`
            }
            badge={detail.validationIssues.length || null}
            badgeTone={detail.validationIssues.length ? 'alert' : 'neutral'}
            open={openSections.checks}
            onToggle={() => toggleSection('checks')}
            innerRef={sectionRef('checks')}
          >
            <div className={styles.issues}>
              {detail.validationIssues.length === 0 ? (
                <EmptyState title="No modeled conflicts found.">
                  Boards, framing, screws, and openings agree. Export the drawing or takeoff from the top bar.
                </EmptyState>
              ) : (
                detail.validationIssues.map((entry) => (
                  <div key={entry.id} data-severity={entry.severity}>
                    <strong>{entry.severity}</strong>
                    <span>{entry.message}</span>
                    <small>{entry.ruleId}</small>
                  </div>
                ))
              )}
            </div>
            <p className={styles.inlineHelp}>
              When the checks are clear, issue the wall with Export drawing SVG or Export takeoff CSV in the top bar.
            </p>
          </CollapsibleSection>
        </aside>

        {focusMode ? (
          <>
            <button
              type="button"
              className={`${styles.panelPeekTab} ${styles.panelPeekTabLeft}`}
              data-open={panelPeek === 'left' ? 'true' : 'false'}
              aria-expanded={panelPeek === 'left'}
              aria-controls="wall-detail-left-panel"
              title={
                panelPeek === 'left'
                  ? 'Tuck the workflow panel away'
                  : 'Peek at the workflow panel — touching the drawing tucks it away again'
              }
              onClick={() => togglePanelPeek('left')}
            >
              <span className={styles.panelPeekChevron} aria-hidden="true">
                {panelPeek === 'left' ? '‹' : '›'}
              </span>
              <span className={styles.panelPeekLabel}>Workflow</span>
            </button>
            <button
              type="button"
              className={`${styles.panelPeekTab} ${styles.panelPeekTabRight}`}
              data-open={panelPeek === 'right' ? 'true' : 'false'}
              aria-expanded={panelPeek === 'right'}
              aria-controls="wall-detail-right-panel"
              title={
                panelPeek === 'right'
                  ? 'Tuck the numbers panel away'
                  : 'Peek at the numbers panel — touching the drawing tucks it away again'
              }
              onClick={() => togglePanelPeek('right')}
            >
              <span className={styles.panelPeekChevron} aria-hidden="true">
                {panelPeek === 'right' ? '›' : '‹'}
              </span>
              <span className={styles.panelPeekLabel}>Numbers</span>
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
