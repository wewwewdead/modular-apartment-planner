import { Fragment, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useProject } from '@/features/floorplan/context/FloorplanContext';
import {
  CEILING_ATTACHMENT_MODES,
  CEILING_BOUNDARY_SOURCES,
  CEILING_FASTENER_LAYOUT_MODES,
  CEILING_FRAMING_LAYOUT_MODES,
  CEILING_OPENING_TYPES,
  CEILING_PANEL_LAYOUT_MODES,
  createCeilingDetailing,
  createCeilingLightFixture,
  createCeilingOpening,
  createCustomCeilingFramingMember,
  createManualCeilingFastener,
  deriveCeilingDetail,
  getProjectCeiling,
  resolveCeilingBeamSupports,
} from '@/domain/ceilingModels';
import {
  BEAM_ANGLE_RANGE_DEG,
  COLOR_TEMPERATURES,
  DEFAULT_FIXTURE_TYPE_ID,
  FIXTURE_TYPES,
  getBulbType,
  getFixtureType,
  isPendantFixture,
  resolveFixturePhotometrics,
} from '@/domain/lightingCatalog';
import { CEILING_BEAM_ELEVATION_TOLERANCE, getCeilingSupportBeamLevels } from '@/domain/ceilingBeamAttachment';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import {
  CEILING_BOARD_MATERIALS,
  CEILING_JURISDICTION_PROFILES,
  CEILING_PRODUCT_PROFILES,
  CEILING_PRODUCT_PROFILE_STATUS,
  getCeilingJurisdictionProfile,
  getCeilingProductProfile,
} from '@/domain/ceilingProductProfiles';
import { boardMaterialLabel } from '@/features/floorplan/components/wall-detail/wallDetailSelectionReadout';
import {
  collectWallSnapCandidates,
  createDrawnPanel,
  createTracedPanel,
  moveMemberWithinBounds,
  movePanelWithinBounds,
  movePointWithinBounds,
  panWallViewport,
  screenPointToWallLocal,
  snapWallLocalPoint,
  zoomWallViewport,
} from '@/features/floorplan/components/wall-detail/wallDetailEditorGeometry';
import {
  CanvasReadoutChip,
  WallCanvasGrid,
  WallCanvasRulers,
  useWallCanvasMetrics,
} from '@/features/floorplan/components/wall-detail/WallCanvasChrome';
import { wallUnitsPerPixel } from '@/features/floorplan/components/wall-detail/wallDetailCanvasMath';
import {
  AdvancedGroup,
  CollapsibleSection,
  EmptyState,
  InfoHint,
  Metric,
  NumberField,
  SelectField,
  StepStrip,
  Toggle,
  ToolButton,
  ToolGlyph,
  ToolbarButton,
} from '@/features/floorplan/components/wall-detail/WallDetailUiKit';
import styles from '@/features/floorplan/components/wall-detail/WallDetailEditor.module.css';
import { createCeilingDetailPreviewProject } from './ceilingDetailPreviewProject';

const ThreePreviewPanel = lazy(() => import('@/features/floorplan/components/preview/ThreePreviewPanel'));

/**
 * The live 3D pane, held still while the plan is being panned. Panning re-renders
 * the editor on every pointer move, and the preview has no interest in where the
 * plan viewport sits — only in the project it is drawing.
 *
 * The selection crosses in both directions: what is picked on the plan lights up
 * orange here, and what is picked here comes back to the plan. Which is why the
 * selection arrives as two primitives rather than an object — a fresh object
 * every render would defeat the memo and put the whole preview back in the pan
 * path.
 */
const CeilingLivePreview = memo(function CeilingLivePreview({
  className,
  project,
  activeFloorId,
  selectionKind,
  selectionId,
  onPick,
}) {
  return (
    <ThreePreviewPanel
      className={className}
      project={project}
      activeFloorId={activeFloorId}
      applyPhaseFilter={false}
      assemblySelection={selectionKind && selectionId ? { kind: selectionKind, id: selectionId } : null}
      selectionAccent="assembly"
      onAssemblyPick={onPick}
    />
  );
});

// Stands in for a beam attachment the level list cannot show: beams that have
// gone, or that have been re-levelled out of eligibility. Selecting it is a
// no-op — it exists so the picker states what the ceiling is doing instead of
// showing an empty box.
const UNLISTED_SUPPORT_LEVEL = 'unlisted_support_level';

const CANVAS_TOOLS = Object.freeze({
  SELECT: 'select',
  PAN: 'pan',
  DRAW_PANEL: 'draw_panel',
  TRACE_PANEL: 'trace_panel',
  DRAW_FURRING: 'draw_furring',
  DRAW_CARRIER: 'draw_carrier',
  DRAW_OPENING: 'draw_opening',
  ADD_LIGHT: 'add_light',
  ADD_FASTENER: 'add_fastener',
});

const WORKSPACE_VIEWS = Object.freeze({
  RCP: 'rcp',
  SPLIT: 'split',
  THREE_D: '3d',
});

const MIN_DRAWN_SIZE = 10;

/**
 * Parts of the 3D pane a click can turn into a selection on the plan. Hangers
 * are drawn there but the drawing has no handle for one, so clicking a hanger
 * leaves the selection where it was rather than clearing it.
 */
const PICKABLE_PREVIEW_PARTS = new Set(['panel', 'framing', 'fastener', 'opening', 'fixture']);

const TOOL_HINTS = Object.freeze({
  [CANVAS_TOOLS.SELECT]: 'Select and drag any board, framing member, screw, opening, or light',
  [CANVAS_TOOLS.PAN]: 'Drag anywhere to pan; use the mouse wheel to zoom',
  [CANVAS_TOOLS.DRAW_PANEL]: 'Drag a rectangle to draw a ceiling board',
  [CANVAS_TOOLS.TRACE_PANEL]: 'Click each cut corner; click the first point or double-click to finish',
  [CANVAS_TOOLS.DRAW_FURRING]: 'Click for a furring channel across the full width, or drag its span',
  [CANVAS_TOOLS.DRAW_CARRIER]: 'Click for a carrier across the full depth, or drag its span',
  [CANVAS_TOOLS.DRAW_OPENING]: 'Drag a rectangle to cut an opening in the ceiling',
  [CANVAS_TOOLS.ADD_LIGHT]: 'Click to place a light fixture',
  [CANVAS_TOOLS.ADD_FASTENER]: 'Click to place a screw',
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
    title: 'Draw board (rectangle) — drag out a ceiling board (P)',
    group: 'board',
  },
  {
    tool: CANVAS_TOOLS.TRACE_PANEL,
    icon: 'trace',
    label: 'Trace cut',
    shortcut: 'T',
    title: 'Trace cut board — click each corner, then close the outline (T)',
    group: 'board',
  },
  {
    tool: CANVAS_TOOLS.DRAW_FURRING,
    icon: 'noggin',
    label: 'Furring',
    shortcut: 'S',
    title: 'Draw furring channel — click for the full width, or drag its span (S)',
    group: 'frame',
  },
  {
    tool: CANVAS_TOOLS.DRAW_CARRIER,
    icon: 'stud',
    label: 'Carrier',
    shortcut: 'C',
    title: 'Draw carrier — click for the full depth, or drag its span (C)',
    group: 'frame',
  },
  {
    tool: CANVAS_TOOLS.DRAW_OPENING,
    icon: 'measure',
    label: 'Opening',
    shortcut: 'O',
    title: 'Draw opening — drag out a hatch, downlight, or diffuser cut-out (O)',
    group: 'detail',
  },
  {
    tool: CANVAS_TOOLS.ADD_LIGHT,
    // The kit's glyph set is fixed and holds no luminaire; the screw glyph is a
    // ringed circle, which is at least the shape an RCP draws a downlight as.
    // The label and the L badge are what tell the two buttons apart.
    icon: 'screw',
    label: 'Light',
    shortcut: 'L',
    title: 'Place light — click to set a downlight, pendant, or troffer (L)',
    group: 'detail',
  },
  {
    tool: CANVAS_TOOLS.ADD_FASTENER,
    icon: 'screw',
    label: 'Screw',
    shortcut: 'F',
    title: 'Place screw — click to fix a board to the furring (F)',
    group: 'detail',
  },
]);

const TOOL_GROUP_LABELS = Object.freeze({
  navigate: 'Move around',
  board: 'Boards',
  frame: 'Structure',
  detail: 'Openings, lights, and screws',
});

const TOOL_BY_ID = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.tool]: definition }), {}),
);

const TOOL_SHORTCUTS = Object.freeze(
  TOOL_DEFINITIONS.reduce((map, definition) => ({ ...map, [definition.shortcut.toLowerCase()]: definition }), {}),
);

/** Left-panel workflow, in the order a real ceiling gets detailed. */
const WORKFLOW_STEPS = Object.freeze([
  { id: 'face', short: 'Boards', title: 'Face and boards', hint: 'Board product, size, and how the grid is laid out' },
  { id: 'structure', short: 'Structure', title: 'Structure', hint: 'Furring channels and carriers behind the boards' },
  { id: 'suspension', short: 'Drop', title: 'Suspension', hint: 'How far the ceiling hangs below its attachment' },
  { id: 'openings', short: 'Openings', title: 'Openings', hint: 'Access hatches, downlights, and diffusers' },
  { id: 'lighting', short: 'Lights', title: 'Lighting', hint: 'Luminaires, lamps, and what they put out' },
  { id: 'screws', short: 'Screws', title: 'Screws', hint: 'Fixing spacing and clearances' },
  { id: 'takeoff', short: 'Takeoff', title: 'Takeoff', hint: 'Board, framing, hanger, screw, and lighting quantities' },
]);

const LAYER_LABELS = Object.freeze({
  boundary: 'Outline',
  openings: 'Openings',
  boards: 'Boards',
  structure: 'Structure',
  hangers: 'Hangers',
  screws: 'Screws',
  fixtures: 'Lights',
});

const SELECTION_LABELS = Object.freeze({
  panel: 'ceiling board',
  framing: 'framing member',
  fastener: 'screw',
  opening: 'ceiling opening',
  fixture: 'light fixture',
});

const OPENING_TYPE_LABELS = Object.freeze({
  [CEILING_OPENING_TYPES.ACCESS_HATCH]: 'Access hatch',
  [CEILING_OPENING_TYPES.DOWNLIGHT]: 'Downlight',
  [CEILING_OPENING_TYPES.DIFFUSER]: 'Air diffuser',
  [CEILING_OPENING_TYPES.CUSTOM]: 'Custom cut-out',
});

const FRAMING_KIND_LABELS = Object.freeze({
  furring: 'Furring channel',
  carrier: 'Carrier',
  trimmer: 'Opening trimmer',
  wall_angle: 'Wall angle',
});

const FRAMING_COLORS = Object.freeze({
  furring: 'rgba(49, 129, 168, 0.35)',
  carrier: 'rgba(120, 96, 190, 0.42)',
  trimmer: 'rgba(214, 158, 74, 0.4)',
});

/**
 * One colour per board material, so a ceiling boarded in two of them reads as
 * two on the plan rather than as one flat field. A board answers for itself:
 * the ceiling's profile only decides what a board that never overrode it is.
 */
const BOARD_FILLS = Object.freeze({
  [CEILING_BOARD_MATERIALS.PLYWOOD]: '#dcc39b',
  [CEILING_BOARD_MATERIALS.FIBER_CEMENT]: '#dedbd1',
});

/** Value the material picker uses for "whatever the profile says". */
const PROFILE_DEFAULT_MATERIAL = '';

/**
 * Which RCP symbol each catalog luminaire draws. Grouped by what the drawing has
 * to tell apart at a glance — a plain can, something with a lens ring, something
 * hanging — rather than by the mount word: a semi-flush is surface-mounted and
 * still reads as a dome, and a wafer is recessed and still is not a can.
 */
const FIXTURE_SYMBOLS = Object.freeze({
  recessed_can_4: 'plain',
  recessed_can_6: 'plain',
  gimbal_recessed: 'plain',
  wafer_led: 'double',
  cylinder_downlight: 'double',
  surface_flush: 'cross',
  semi_flush: 'cross',
  pendant: 'dot',
  chandelier_5: 'arms',
  track_head: 'track',
  troffer_2x2: 'rect',
  troffer_2x4: 'rect',
});

/**
 * Fixtures are drawn at the size they really cover, so a 2 × 4 troffer reads as
 * the two ceiling tiles it displaces. Zoomed out that would shrink a 75 mm track
 * head to nothing, so `unitPx` sets a legibility floor the same way the hanger
 * and screw markers do: below it the symbol stops shrinking and the plan goes on
 * saying what kind of light is there.
 */
const FIXTURE_MIN_SYMBOL_PX = 7;
const FIXTURE_SYMBOL_COLOR = '#ffd48a';
// The one orange every selected piece on this plan wears. The stylesheet holds
// it as --assembly-selected-line, which a presentation attribute cannot read,
// and these symbols carry their stroke as an attribute so the whole group can
// set it once.
const FIXTURE_SELECTED_COLOR = '#ffb45c';

function svgNumber(value) {
  return Math.round(value * 100) / 100;
}

/** Half-extents of a fixture symbol in UV, already floored to stay legible. */
function fixtureSymbolExtent(type, unitPx) {
  const floor = FIXTURE_MIN_SYMBOL_PX * unitPx;
  return {
    halfU: Math.max(type.apertureMm / 2, floor),
    halfV: Math.max((type.apertureLengthMm ?? type.apertureMm) / 2, floor),
  };
}

/**
 * The arrow an aimable fixture points along. Azimuth is degrees CCW from +U in
 * the RCP frame, so the direction is built in UV and left to the layer's own
 * flip — a rotate() here would come out mirrored, because that transform is what
 * turns the V axis over.
 */
function fixtureAimPath(fixture, radius) {
  const angle = ((fixture.aim?.azimuthDeg || 0) * Math.PI) / 180;
  const tipU = fixture.u + Math.cos(angle) * radius * 1.7;
  const tipV = fixture.v + Math.sin(angle) * radius * 1.7;
  const barb = radius * 0.55;
  const segments = [`M ${svgNumber(fixture.u)} ${svgNumber(fixture.v)} L ${svgNumber(tipU)} ${svgNumber(tipV)}`];
  for (const sweep of [2.6, -2.6]) {
    segments.push(
      `M ${svgNumber(tipU)} ${svgNumber(tipV)} L ${svgNumber(tipU + Math.cos(angle + sweep) * barb)} ${svgNumber(
        tipV + Math.sin(angle + sweep) * barb,
      )}`,
    );
  }
  return segments.join(' ');
}

/** One luminaire as the industry draws it, in ceiling-local UV. */
function fixtureSymbolNodes(fixture, unitPx, color) {
  const type = getFixtureType(fixture.fixtureType);
  const symbol = FIXTURE_SYMBOLS[type.id] || 'plain';
  const { halfU, halfV } = fixtureSymbolExtent(type, unitPx);
  const { u, v } = fixture;

  // Troffers are the only rectangular luminaire in the catalog, and a panel is a
  // tile: drawn as a circle it would claim the wrong footprint entirely.
  if (symbol === 'rect') {
    return [
      <rect
        key="body"
        x={u - halfU}
        y={v - halfV}
        width={halfU * 2}
        height={halfV * 2}
        vectorEffect="non-scaling-stroke"
      />,
      <line
        key="diagonal"
        x1={u - halfU}
        y1={v - halfV}
        x2={u + halfU}
        y2={v + halfV}
        vectorEffect="non-scaling-stroke"
      />,
    ];
  }

  const radius = halfU;
  const nodes = [<circle key="body" cx={u} cy={v} r={radius} vectorEffect="non-scaling-stroke" />];
  if (symbol === 'double') {
    nodes.push(<circle key="inner" cx={u} cy={v} r={radius * 0.62} vectorEffect="non-scaling-stroke" />);
  } else if (symbol === 'cross') {
    nodes.push(
      <path
        key="cross"
        d={`M ${svgNumber(u - radius)} ${svgNumber(v)} H ${svgNumber(u + radius)} M ${svgNumber(u)} ${svgNumber(
          v - radius,
        )} V ${svgNumber(v + radius)}`}
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else if (symbol === 'dot') {
    nodes.push(
      <circle
        key="lamp"
        cx={u}
        cy={v}
        r={Math.max(radius * 0.22, 1.5 * unitPx)}
        fill={color}
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else if (symbol === 'arms') {
    // Five arms, five ticks: the count is the whole point of the symbol, which
    // is why a chandelier is not just a bigger circle.
    const arms = Array.from({ length: 5 }, (unused, index) => {
      const angle = Math.PI / 2 + (index * 2 * Math.PI) / 5;
      return `M ${svgNumber(u + Math.cos(angle) * radius * 0.45)} ${svgNumber(
        v + Math.sin(angle) * radius * 0.45,
      )} L ${svgNumber(u + Math.cos(angle) * radius)} ${svgNumber(v + Math.sin(angle) * radius)}`;
    });
    nodes.push(<path key="arms" d={arms.join(' ')} vectorEffect="non-scaling-stroke" />);
  } else if (symbol === 'track') {
    // The rail the head clamps to, drawn across the direction it throws.
    const angle = ((fixture.aim?.azimuthDeg || 0) * Math.PI) / 180 + Math.PI / 2;
    const reach = radius * 1.4;
    nodes.push(
      <line
        key="rail"
        x1={svgNumber(u - Math.cos(angle) * reach)}
        y1={svgNumber(v - Math.sin(angle) * reach)}
        x2={svgNumber(u + Math.cos(angle) * reach)}
        y2={svgNumber(v + Math.sin(angle) * reach)}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  if (type.aimable) {
    nodes.push(<path key="aim" d={fixtureAimPath(fixture, radius)} vectorEffect="non-scaling-stroke" />);
  }
  return nodes;
}

function boardFillFor(material) {
  return BOARD_FILLS[material] || BOARD_FILLS[CEILING_BOARD_MATERIALS.FIBER_CEMENT];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatMm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}

function regionPath(region) {
  return [region.outline, ...(region.holes || [])]
    .filter((ring) => ring?.length)
    .map((ring) => `${ring.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.u} ${point.v}`).join(' ')} Z`)
    .join(' ');
}

/**
 * Ceiling equivalent of the wall editor's drawn-member helper: a click gives a
 * member spanning the whole ceiling, a drag gives the span that was dragged.
 * Furring runs along U (plan east/west); carriers run along V (plan north/south).
 */
function createDrawnCeilingMember(tool, start, end, framing, bounds) {
  if (tool === CANVAS_TOOLS.DRAW_CARRIER) {
    const width = Math.max(MIN_DRAWN_SIZE, Number(framing?.carrierWidth) || 0);
    const center = clamp(start.u, 0, bounds.length);
    const hasSpan = Math.abs(end.v - start.v) >= MIN_DRAWN_SIZE;
    return createCustomCeilingFramingMember({
      kind: 'carrier',
      orientation: 'vertical',
      u0: clamp(center - width / 2, 0, bounds.length),
      u1: clamp(center + width / 2, 0, bounds.length),
      v0: hasSpan ? Math.min(start.v, end.v) : 0,
      v1: hasSpan ? Math.max(start.v, end.v) : bounds.height,
      depth: framing?.carrierDepth,
      material: framing?.material || null,
    });
  }
  const width = Math.max(MIN_DRAWN_SIZE, Number(framing?.furringWidth) || 0);
  const center = clamp(start.v, 0, bounds.height);
  const hasSpan = Math.abs(end.u - start.u) >= MIN_DRAWN_SIZE;
  return createCustomCeilingFramingMember({
    kind: 'furring',
    orientation: 'horizontal',
    u0: hasSpan ? Math.min(start.u, end.u) : 0,
    u1: hasSpan ? Math.max(start.u, end.u) : bounds.length,
    v0: clamp(center - width / 2, 0, bounds.height),
    v1: clamp(center + width / 2, 0, bounds.height),
    depth: framing?.furringDepth,
    material: framing?.material || null,
  });
}

/**
 * Everything on the reflected ceiling plan that only moves when the ceiling
 * itself changes: snap grid, openings, boards, framing, hangers, screws, and the
 * boundary rings. A real ceiling is thousands of these nodes — a 6 × 4 m board
 * grid alone carries some 750 screws — and panning re-renders the editor on
 * every pointer move, so rebuilding them each frame is what made a drag stutter.
 * Behind `memo` a pan touches nothing here: the only viewport value it reads is
 * `unitPx`, which changes with zoom, never with pan.
 *
 * The in-flight draw and trace previews deliberately stay with the editor: those
 * do change every frame, and they are a handful of nodes.
 */
const CeilingPlanLayers = memo(function CeilingPlanLayers({
  bounds,
  snapStep,
  snapEnabled,
  unitPx,
  layers,
  panels,
  frameMembers,
  hangers,
  fasteners,
  lightFixtures,
  openings,
  regions,
  disabledBoardFill,
  selection,
  isCustomMember,
  isManualFastener,
  onElementPointerDown,
}) {
  return (
    <>
      <WallCanvasGrid bounds={bounds} snapStep={snapStep} unitPx={unitPx} active={snapEnabled} />

      {layers.openings &&
        openings.map((opening) => (
          <rect
            key={`${opening.id}:void`}
            className={styles.openingVoid}
            x={opening.u0}
            y={opening.v0}
            width={opening.u1 - opening.u0}
            height={opening.v1 - opening.v0}
          />
        ))}

      {layers.boards &&
        panels.flatMap((panel) =>
          panel.regions.map((region, index) => (
            <path
              key={`${panel.id}:region:${index}`}
              className={styles.panelShape}
              data-selected={selection?.type === 'panel' && selection.id === panel.localId ? 'true' : 'false'}
              d={regionPath(region)}
              fill={disabledBoardFill || boardFillFor(panel.material)}
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => onElementPointerDown(event, 'panel', panel.localId, panel)}
            >
              <title>{`${panel.label} · ${formatMm(panel.width)} × ${formatMm(panel.height)} mm`}</title>
            </path>
          )),
        )}

      {layers.structure &&
        frameMembers.map((member) =>
          member.kind === 'wall_angle' ? (
            <line
              key={member.id}
              className={styles.openingProfile}
              x1={member.start.u}
              y1={member.start.v}
              x2={member.end.u}
              y2={member.end.v}
              vectorEffect="non-scaling-stroke"
            >
              <title>{FRAMING_KIND_LABELS.wall_angle}</title>
            </line>
          ) : (
            <rect
              key={member.id}
              className={styles.frameShape}
              data-selected={selection?.type === 'framing' && selection.id === member.id ? 'true' : 'false'}
              x={member.u0}
              y={member.v0}
              width={member.u1 - member.u0}
              height={member.v1 - member.v0}
              fill={FRAMING_COLORS[member.kind]}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) =>
                onElementPointerDown(event, 'framing', member.id, member, isCustomMember(member.id))
              }
            >
              <title>
                {`${FRAMING_KIND_LABELS[member.kind] || member.kind} · U ${formatMm(member.u0)} → ${formatMm(
                  member.u1,
                )} · V ${formatMm(member.v0)} → ${formatMm(member.v1)}`}
              </title>
            </rect>
          ),
        )}

      {layers.hangers &&
        hangers.map((hanger) => (
          <circle
            key={hanger.id}
            cx={hanger.u}
            cy={hanger.v}
            r={4 * unitPx}
            fill="none"
            stroke="#8fd0f0"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          >
            <title>{`Hanger · U ${formatMm(hanger.u)} · V ${formatMm(hanger.v)}`}</title>
          </circle>
        ))}

      {/* A screw is a 3 px dot among several hundred of them, so the one that is
          selected is found by the ring around it, not by its own colour — the
          same halo the wall elevation draws. */}
      {layers.screws &&
        fasteners.map((fastener) => {
          const selected = selection?.type === 'fastener' && selection.id === fastener.id;
          return (
            <g
              key={fastener.id}
              className={styles.fastenerGraphic}
              data-selected={selected ? 'true' : 'false'}
              onPointerDown={(event) =>
                onElementPointerDown(event, 'fastener', fastener.id, fastener, isManualFastener(fastener.id))
              }
            >
              <title>{`Screw · U ${formatMm(fastener.u)} · V ${formatMm(fastener.v)}`}</title>
              {selected ? (
                <circle
                  className={styles.fastenerHalo}
                  cx={fastener.u}
                  cy={fastener.v}
                  r={3 * unitPx + 7 * unitPx}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <circle
                cx={fastener.u}
                cy={fastener.v}
                r={3 * unitPx}
                fill="#8a9298"
                stroke="#2b3238"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

      {/* Over the screws and under the opening profiles: a light is read against
          the boards it sits in, but never over the cut lines those boards stop
          at. Selection is the screw's halo again — a symbol that changed weight
          would move the edge the drawing is measured against. */}
      {layers.fixtures &&
        lightFixtures.map((fixture) => {
          const selected = selection?.type === 'fixture' && selection.id === fixture.id;
          const color = selected ? FIXTURE_SELECTED_COLOR : FIXTURE_SYMBOL_COLOR;
          const { halfU, halfV } = fixtureSymbolExtent(getFixtureType(fixture.fixtureType), unitPx);
          return (
            <g
              key={fixture.id}
              className={styles.fastenerGraphic}
              data-fixture-id={fixture.id}
              data-selected={selected ? 'true' : 'false'}
              fill="none"
              stroke={color}
              strokeWidth="1.25"
              onPointerDown={(event) => onElementPointerDown(event, 'fixture', fixture.id, fixture)}
            >
              <title>
                {`${getFixtureType(fixture.fixtureType).label} · ${getBulbType(fixture.bulbType).label} · ${Math.round(
                  fixture.photometrics.lumens,
                )} lm · U ${formatMm(fixture.u)} · V ${formatMm(fixture.v)}`}
              </title>
              {selected ? (
                <circle
                  className={styles.fastenerHalo}
                  cx={fixture.u}
                  cy={fixture.v}
                  r={Math.max(halfU, halfV) + 6 * unitPx}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {fixtureSymbolNodes(fixture, unitPx, color)}
            </g>
          );
        })}

      {layers.openings &&
        openings.map((opening) => (
          <rect
            key={`${opening.id}:profile`}
            className={styles.openingProfile}
            data-selected={selection?.type === 'opening' && selection.id === opening.id ? 'true' : 'false'}
            x={opening.u0}
            y={opening.v0}
            width={opening.u1 - opening.u0}
            height={opening.v1 - opening.v0}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(event) => onElementPointerDown(event, 'opening', opening.id, opening)}
          >
            <title>
              {`${OPENING_TYPE_LABELS[opening.type] || opening.type} · U ${formatMm(opening.u0)} → ${formatMm(
                opening.u1,
              )} · V ${formatMm(opening.v0)} → ${formatMm(opening.v1)}`}
            </title>
          </rect>
        ))}

      {/* One ring per edge of the ceiling area: the perimeter, plus every wall,
          beam and column it has been traced around. */}
      {layers.boundary
        ? regions.flatMap((region, regionIndex) =>
            [region.outline, ...region.holes]
              .filter((ring) => ring.length >= 3)
              .map((ring, ringIndex) => (
                <polyline
                  key={`ceiling-edge-${regionIndex}-${ringIndex}`}
                  className={styles.openingProfile}
                  style={{ pointerEvents: 'none' }}
                  points={[...ring, ring[0]].map((point) => `${point.u},${point.v}`).join(' ')}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              )),
          )
        : null}
    </>
  );
});

export default function CeilingDetailEditor() {
  const { project, dispatch, canUndo = false, canRedo = false } = useProject();
  const { ceilingDetailEditor, dispatch: editorDispatch } = useEditor();
  const svgRef = useRef(null);
  const canvasFrameRef = useRef(null);
  /*
    Pointer maths is pinned to the rect the gesture started on. Read live, the
    drawing could move out from under a pointer that had not moved: selecting a
    board grows the status bar by a line, which shortens the canvas frame, which
    re-fits the plan — between one pointerdown and its pointerup. The click then
    landed somewhere else in ceiling coordinates and committed a drag nobody
    made. Zoom is the one thing that legitimately changes the rect mid-gesture,
    so it clears this.
  */
  const gestureRectRef = useRef(null);
  const ceiling = getProjectCeiling(project, ceilingDetailEditor?.ceilingId);

  const [layerVisibility, setLayerVisibility] = useState({
    boundary: true,
    openings: true,
    boards: true,
    structure: true,
    hangers: true,
    screws: true,
    fixtures: true,
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
  const [openingDraftType, setOpeningDraftType] = useState(CEILING_OPENING_TYPES.ACCESS_HATCH);
  const [lightDraftType, setLightDraftType] = useState(DEFAULT_FIXTURE_TYPE_ID);
  const [workspaceView, setWorkspaceView] = useState(WORKSPACE_VIEWS.SPLIT);
  const [openSections, setOpenSections] = useState({
    face: true,
    structure: false,
    suspension: false,
    openings: false,
    lighting: false,
    screws: false,
    takeoff: true,
    selection: true,
    summary: true,
    elevations: true,
  });
  const sectionNodes = useRef({});
  const sectionRefSetters = useRef({});
  const shortcutHandlerRef = useRef(null);
  /*
    The plan layers are memoised, so the callbacks they hold have to keep the
    same identity from render to render or the memo never holds. These forward to
    whatever this render's closures are, which is what the layers would have
    captured anyway.
  */
  const canvasHandlersRef = useRef({});
  const stableCanvasHandlers = useRef({
    onElementPointerDown: (...args) => canvasHandlersRef.current.beginElementMove?.(...args),
    isCustomMember: (id) => Boolean(canvasHandlersRef.current.isCustomMember?.(id)),
    isManualFastener: (id) => Boolean(canvasHandlersRef.current.isManualFastener?.(id)),
  }).current;
  /*
    A pick in the 3D pane, translated back to a selection on the plan. Only the
    parts the plan can select are honoured: a hanger is drawn there but is not
    something the drawing lets you pick, so clicking one leaves the selection
    alone rather than clearing it. Empty space does clear it.
  */
  const handlePreviewPick = useCallback((part) => {
    if (!part) {
      setSelection(null);
      return;
    }
    if (!PICKABLE_PREVIEW_PARTS.has(part.kind)) return;
    setSelection({ type: part.kind, id: part.id });
  }, []);
  const wheelHandlerRef = useRef(null);
  const wheelDetachRef = useRef(null);
  /*
    React registers `onWheel` passively, so a React handler cannot stop the page
    scrolling underneath a scroll-to-zoom. The frame takes its own non-passive
    listener instead; a callback ref keeps it attached across the pane remounting
    when the workspace view changes.
  */
  const attachCanvasFrame = useCallback((node) => {
    canvasFrameRef.current = node;
    wheelDetachRef.current?.();
    wheelDetachRef.current = null;
    if (!node) return;
    const onWheel = (event) => wheelHandlerRef.current?.(event);
    node.addEventListener('wheel', onWheel, { passive: false });
    wheelDetachRef.current = () => node.removeEventListener('wheel', onWheel);
  }, []);

  // Capture phase: this editor is modal, so the keys it claims must never reach the
  // floorplan canvas listening on the same window (its own Delete would remove rooms).
  // Only claimed keys stop propagating — Space-pan, Escape, and Ctrl shortcuts pass through.
  useEffect(() => {
    const onShortcutKeyDown = (event) => shortcutHandlerRef.current?.(event);
    window.addEventListener('keydown', onShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', onShortcutKeyDown, true);
  }, []);

  useEffect(() => {
    if (!panelTrace) return undefined;
    const cancelTrace = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      gestureRectRef.current = null;
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

  const detail = useMemo(() => (ceiling && project ? deriveCeilingDetail(ceiling, project) : null), [ceiling, project]);
  const configuration = detail?.configuration || null;
  const face = configuration?.face || null;
  const panels = detail?.panels || [];
  const frameMembers = detail?.framing || [];
  const hangers = detail?.hangers || [];
  const fasteners = detail?.fasteners || [];
  const lightFixtures = detail?.lightFixtures || [];
  const openings = detail?.openings || [];
  const profile = face ? getCeilingProductProfile(face.productProfileId) : null;
  const jurisdiction = configuration ? getCeilingJurisdictionProfile(configuration.jurisdictionProfileId) : null;
  // Reflected ceiling plan: U runs east, V runs north, and nothing is mirrored —
  // the drawing keeps the same handedness as the floor plan underneath it.
  const bounds = useMemo(
    () => (detail ? { length: detail.length, height: detail.depth, mirrorU: false } : null),
    [detail],
  );
  const canvasMetrics = useWallCanvasMetrics(canvasFrameRef, bounds, workspaceView);
  const unitPx = wallUnitsPerPixel(canvasMetrics, viewport, bounds);
  const previewProject = useMemo(() => createCeilingDetailPreviewProject(project, ceiling?.id), [project, ceiling?.id]);
  const ceilingFloor = useMemo(
    () => (project?.floors || []).find((entry) => entry.id === ceiling?.floorId) || null,
    [project, ceiling?.floorId],
  );
  const supportLevels = useMemo(() => getCeilingSupportBeamLevels(ceilingFloor), [ceilingFloor]);
  const supportBeams = useMemo(() => resolveCeilingBeamSupports(project, ceiling), [project, ceiling]);
  const snapCandidates = useMemo(
    () =>
      detail
        ? collectWallSnapCandidates({
            panels: detail.panels,
            // Wall-angle members carry start/end instead of a rectangle, so they
            // would poison the numeric candidate lists with NaN.
            members: detail.framing.filter((member) => member.kind !== 'wall_angle'),
            openings: detail.openings,
            length: detail.length,
            height: detail.depth,
          })
        : { u: [], v: [] },
    [detail],
  );

  if (!ceilingDetailEditor) {
    shortcutHandlerRef.current = null;
    return null;
  }
  if (!project || !ceiling || !detail || !configuration || !face) {
    shortcutHandlerRef.current = null;
    return (
      <div className={styles.overlay}>
        <div className={styles.missing}>
          <h2>Ceiling detail is unavailable</h2>
          <p>The ceiling or owning floor no longer exists.</p>
          <ToolbarButton onClick={() => editorDispatch({ type: 'CLOSE_CEILING_DETAIL_EDITOR' })}>Close</ToolbarButton>
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

  const commitDetailing = (next) => {
    dispatch({
      type: 'CEILING_UPDATE',
      ceiling: { id: ceiling.id, detailing: createCeilingDetailing(next) },
    });
  };

  const updateDetailing = (patch) => commitDetailing({ ...configuration, ...patch });
  const updateFace = (patch) => updateDetailing({ face: { ...face, ...patch } });
  const updateLayout = (patch) => updateFace({ layout: { ...face.layout, ...patch } });
  const updateFastenerPattern = (patch) => updateFace({ fasteners: { ...face.fasteners, ...patch } });
  const updateFraming = (patch) => updateDetailing({ framing: { ...configuration.framing, ...patch } });
  const updateSuspension = (patch) => updateDetailing({ suspension: { ...configuration.suspension, ...patch } });
  const updateOpenings = (next) => updateDetailing({ openings: next });
  const updateLighting = (patch) => updateDetailing({ lighting: { ...configuration.lighting, ...patch } });

  /**
   * Switching a generated grid to custom must not wipe the grid: the boards on
   * screen are seeded as explicit panels first, using their pre-clip rectangles
   * so a board trimmed by the boundary keeps its full stock size. Once the face
   * is already custom, the stored panels are the source of truth.
   */
  const seededCustomPanels = () =>
    face.layout.mode === CEILING_PANEL_LAYOUT_MODES.GRID
      ? panels.map((panel) => ({
          id: panel.localId,
          u: panel.u0,
          v: panel.v0,
          width: panel.width,
          height: panel.height,
          label: panel.label,
        }))
      : face.layout.customPanels;

  const writeCustomPanels = (next) => updateLayout({ mode: CEILING_PANEL_LAYOUT_MODES.CUSTOM, customPanels: next });

  const regeneratePanelGrid = () => {
    updateLayout({ mode: CEILING_PANEL_LAYOUT_MODES.GRID, customPanels: [] });
    setSelection(null);
  };

  const chooseCanvasTool = (tool) => {
    setCanvasTool(tool);
    setGesture(null);
    gestureRectRef.current = null;
    if (tool !== CANVAS_TOOLS.TRACE_PANEL) setPanelTrace(null);
  };

  const isCustomMember = (id) => configuration.framing.members.some((member) => member.id === id);
  const isManualFastener = (id) => face.fasteners.manual.some((fastener) => fastener.id === id);

  const deleteSelectedPanel = () => {
    writeCustomPanels(seededCustomPanels().filter((panel) => panel.id !== selection.id));
    setSelection(null);
  };

  const deleteSelectedMember = () => {
    if (isCustomMember(selection.id)) {
      updateFraming({ members: configuration.framing.members.filter((member) => member.id !== selection.id) });
    } else {
      updateFraming({
        removedGeneratedIds: [...new Set([...configuration.framing.removedGeneratedIds, selection.id])],
      });
    }
    setSelection(null);
  };

  const deleteSelectedFastener = () => {
    if (isManualFastener(selection.id)) {
      updateFastenerPattern({ manual: face.fasteners.manual.filter((entry) => entry.id !== selection.id) });
    } else {
      updateFastenerPattern({
        removedGeneratedIds: [...new Set([...face.fasteners.removedGeneratedIds, selection.id])],
      });
    }
    setSelection(null);
  };

  const deleteSelectedOpening = () => {
    updateOpenings(configuration.openings.filter((opening) => opening.id !== selection.id));
    setSelection(null);
  };

  const deleteSelectedFixture = () => {
    updateLighting({ fixtures: configuration.lighting.fixtures.filter((fixture) => fixture.id !== selection.id) });
    setSelection(null);
  };

  const deleteSelection = () => {
    if (selection?.type === 'panel') deleteSelectedPanel();
    else if (selection?.type === 'framing') deleteSelectedMember();
    else if (selection?.type === 'fastener') deleteSelectedFastener();
    else if (selection?.type === 'opening') deleteSelectedOpening();
    else if (selection?.type === 'fixture') deleteSelectedFixture();
  };

  const updateSelectedPanel = (patch) => {
    if (selection?.type !== 'panel') return;
    writeCustomPanels(
      seededCustomPanels().map((panel) => (panel.id === selection.id ? { ...panel, ...patch } : panel)),
    );
  };

  const updateSelectedMember = (patch) => {
    if (selection?.type !== 'framing' || !isCustomMember(selection.id)) return;
    updateFraming({
      members: configuration.framing.members.map((member) =>
        member.id === selection.id ? createCustomCeilingFramingMember({ ...member, ...patch, id: member.id }) : member,
      ),
    });
  };

  const updateSelectedFastener = (patch) => {
    if (selection?.type !== 'fastener' || !isManualFastener(selection.id)) return;
    updateFastenerPattern({
      manual: face.fasteners.manual.map((entry) =>
        entry.id === selection.id ? createManualCeilingFastener({ ...entry, ...patch }, { ...entry }) : entry,
      ),
    });
  };

  const updateOpening = (openingId, patch) =>
    updateOpenings(
      configuration.openings.map((opening) =>
        opening.id === openingId ? createCeilingOpening({ ...opening, ...patch }, { ...opening, ...patch }) : opening,
      ),
    );

  const removeOpening = (openingId) => {
    updateOpenings(configuration.openings.filter((opening) => opening.id !== openingId));
    if (selection?.type === 'opening' && selection.id === openingId) setSelection(null);
  };

  /**
   * Every fixture edit is the factory run again over the whole object, never a
   * field written in place: the catalog decides what can be built, so changing
   * the fixture type has to re-pick a lamp the new luminaire actually takes and
   * re-clamp an aim past the new stop. Patching `fixtureType` alone would leave
   * a wafer holding a BR30.
   */
  const updateFixture = (fixtureId, patch) =>
    updateLighting({
      fixtures: configuration.lighting.fixtures.map((fixture) =>
        fixture.id === fixtureId
          ? createCeilingLightFixture({ ...fixture, ...patch }, { ...fixture, ...patch })
          : fixture,
      ),
    });

  const removeFixture = (fixtureId) => {
    updateLighting({ fixtures: configuration.lighting.fixtures.filter((fixture) => fixture.id !== fixtureId) });
    if (selection?.type === 'fixture' && selection.id === fixtureId) setSelection(null);
  };

  /** Rect the current gesture is measured against, taken once when it starts. */
  const pinCanvasRect = () => {
    gestureRectRef.current = svgRef.current?.getBoundingClientRect() || null;
    return gestureRectRef.current;
  };
  const releaseCanvasRect = () => {
    gestureRectRef.current = null;
  };

  const eventToLocal = (event, withSnap = true) => {
    const rect = gestureRectRef.current || svgRef.current?.getBoundingClientRect();
    if (!rect) return { u: 0, v: 0 };
    const point = screenPointToWallLocal(event, rect, bounds);
    return withSnap
      ? snapWallLocalPoint(point, snapCandidates, {
          enabled: snapEnabled,
          step: snapStep,
          threshold: Math.max(8, (detail.length / Math.max(1, rect.width)) * 10),
        })
      : point;
  };

  const zoomViewportAt = (requestedZoom, clientX, clientY) => {
    // Zoom moves the drawing for real, so a gesture running through it has to
    // re-measure rather than keep working from where the canvas used to be.
    releaseCanvasRect();
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
  wheelHandlerRef.current = handleViewportWheel;

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

  const fitCeilingInViewport = () => setViewport({ zoom: 1, panU: 0, panV: 0 });

  const movedGestureEntity = (value = gesture) => {
    if (!value || value.kind !== 'move') return null;
    const delta = { u: value.current.u - value.start.u, v: value.current.v - value.start.v };
    let moved;
    let anchor;
    if (value.type === 'panel') {
      moved = movePanelWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u0, v: moved.v0 };
    } else if (value.type === 'framing' || value.type === 'opening') {
      moved = moveMemberWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u0, v: moved.v0 };
    } else {
      moved = movePointWithinBounds(value.entity, delta, bounds);
      anchor = { u: moved.u, v: moved.v };
    }
    if (!snapEnabled) return moved;
    const snapped = snapWallLocalPoint(anchor, snapCandidates, {
      step: snapStep,
      threshold: Math.max(8, snapStep * 0.24),
    });
    const snapDelta = { u: snapped.u - anchor.u, v: snapped.v - anchor.v };
    if (value.type === 'panel') return movePanelWithinBounds(moved, snapDelta, bounds);
    if (value.type === 'framing' || value.type === 'opening') return moveMemberWithinBounds(moved, snapDelta, bounds);
    return movePointWithinBounds(moved, snapDelta, bounds);
  };

  const drawnGestureEntity = (value = gesture) => {
    if (!value || value.kind !== 'draw') return null;
    if (value.tool === CANVAS_TOOLS.DRAW_PANEL || value.tool === CANVAS_TOOLS.DRAW_OPENING) {
      return createDrawnPanel(value.start, value.current, bounds, MIN_DRAWN_SIZE * 2.5);
    }
    return createDrawnCeilingMember(value.tool, value.start, value.current, configuration.framing, bounds);
  };

  const commitPanelTrace = (points = panelTrace?.points || []) => {
    const traced = createTracedPanel(points, bounds);
    if (!traced) return false;
    const panel = {
      id: `traced-${Date.now().toString(36)}-${seededCustomPanels().length + 1}`,
      u: traced.u0,
      v: traced.v0,
      width: traced.width,
      height: traced.height,
      outlinePoints: traced.outlinePoints,
    };
    writeCustomPanels([...seededCustomPanels(), panel]);
    setPanelTrace(null);
    releaseCanvasRect();
    setSelection({ type: 'panel', id: panel.id });
    return true;
  };

  const addFastener = (point) => {
    const fastener = createManualCeilingFastener(point, {
      type: face.fasteners.type || profile.planningDefaults.fastenerType,
    });
    updateFastenerPattern({ manual: [...face.fasteners.manual, fastener] });
    setSelection({ type: 'fastener', id: fastener.id });
  };

  const addLightFixture = (point) => {
    const fixture = createCeilingLightFixture(point, { fixtureType: lightDraftType });
    updateLighting({ fixtures: [...configuration.lighting.fixtures, fixture] });
    setSelection({ type: 'fixture', id: fixture.id });
  };

  const beginCanvasGesture = (event) => {
    if (event.button !== 0) return;
    if (canvasTool === CANVAS_TOOLS.PAN || spacePanActive) return;
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL) {
      event.preventDefault();
      const rect = pinCanvasRect();
      const point = eventToLocal(event, true);
      // A trace is separate clicks, not a held drag, so the pin must not outlive
      // this one: panning between clicks moves the canvas, and a preview measured
      // against where the canvas used to be points anywhere but at the cursor.
      releaseCanvasRect();
      const points = panelTrace?.points || [];
      const closeDistance = Math.max(8, (detail.length / Math.max(1, rect?.width || 1)) * 12);
      if (points.length >= 3 && Math.hypot(point.u - points[0].u, point.v - points[0].v) <= closeDistance) {
        commitPanelTrace(points);
        return;
      }
      setPanelTrace({ points: [...points, point], previewPoint: point });
      return;
    }
    pinCanvasRect();
    const point = eventToLocal(event, true);
    if (canvasTool === CANVAS_TOOLS.ADD_FASTENER) {
      addFastener(point);
      releaseCanvasRect();
      return;
    }
    if (canvasTool === CANVAS_TOOLS.ADD_LIGHT) {
      addLightFixture(point);
      releaseCanvasRect();
      return;
    }
    if (canvasTool === CANVAS_TOOLS.SELECT) {
      setSelection(null);
      releaseCanvasRect();
      return;
    }
    event.preventDefault();
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: 'draw',
      tool: canvasTool,
      start: point,
      current: point,
      pointerId: event.pointerId,
    });
  };

  const beginElementMove = (event, type, id, entity, movable = true) => {
    if (spacePanActive || canvasTool !== CANVAS_TOOLS.SELECT || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Pinned before the selection is set: selecting is exactly what relayouts the
    // canvas, and this gesture has to keep measuring against the canvas the user
    // pressed on.
    pinCanvasRect();
    setSelection({ type, id });
    if (!movable) {
      releaseCanvasRect();
      return;
    }
    const point = eventToLocal(event, false);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({ kind: 'move', type, id, entity, start: point, current: point, pointerId: event.pointerId });
  };

  const updateCanvasGesture = (event) => {
    if (panGesture) return;
    if (canvasTool === CANVAS_TOOLS.TRACE_PANEL && panelTrace?.points.length) {
      setPanelTrace((value) => (value ? { ...value, previewPoint: eventToLocal(event, true) } : value));
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = eventToLocal(event, gesture.kind === 'draw');
    setGesture((value) => (value ? { ...value, current: point } : value));
  };

  const commitDrawnEntity = (finalGesture) => {
    const entity = drawnGestureEntity(finalGesture);
    if (!entity) return;
    if (finalGesture.tool === CANVAS_TOOLS.DRAW_PANEL) {
      const panel = {
        id: `panel-${Date.now().toString(36)}-${seededCustomPanels().length + 1}`,
        u: entity.u0,
        v: entity.v0,
        width: entity.width,
        height: entity.height,
      };
      // Seed before appending, so drawing one board over a generated grid keeps
      // every board that was already on screen.
      writeCustomPanels([...seededCustomPanels(), panel]);
      setSelection({ type: 'panel', id: panel.id });
      return;
    }
    if (finalGesture.tool === CANVAS_TOOLS.DRAW_OPENING) {
      const opening = createCeilingOpening(
        { u: entity.u0, v: entity.v0, width: entity.width, height: entity.height },
        { type: openingDraftType },
      );
      updateOpenings([...configuration.openings, opening]);
      setSelection({ type: 'opening', id: opening.id });
      return;
    }
    updateFraming({ members: [...configuration.framing.members, entity] });
    setSelection({ type: 'framing', id: entity.id });
  };

  const commitMovedEntity = (finalGesture) => {
    const moved = movedGestureEntity(finalGesture);
    const movedDistance = Math.hypot(
      finalGesture.current.u - finalGesture.start.u,
      finalGesture.current.v - finalGesture.start.v,
    );
    // Judged in pixels, not millimetres: zoomed out, one millimetre is a fraction
    // of a pixel, so a bare click used to clear this and commit a "drag" — which
    // on a generated board grid also froze the whole grid into custom boards.
    if (!moved || movedDistance < Math.max(1, unitPx * 2)) return;
    if (finalGesture.type === 'panel') {
      writeCustomPanels(
        seededCustomPanels().map((panel) =>
          panel.id === finalGesture.id
            ? {
                ...panel,
                u: moved.u0,
                v: moved.v0,
                width: moved.width,
                height: moved.height,
                ...(moved.outlinePoints?.length ? { outlinePoints: moved.outlinePoints } : {}),
              }
            : panel,
        ),
      );
      return;
    }
    if (finalGesture.type === 'framing') {
      updateFraming({
        members: configuration.framing.members.map((member) =>
          member.id === finalGesture.id
            ? createCustomCeilingFramingMember({
                ...member,
                u0: moved.u0,
                u1: moved.u1,
                v0: moved.v0,
                v1: moved.v1,
                id: member.id,
              })
            : member,
        ),
      });
      return;
    }
    if (finalGesture.type === 'opening') {
      updateOpening(finalGesture.id, { u: moved.u0, v: moved.v0 });
      return;
    }
    if (finalGesture.type === 'fixture') {
      updateFixture(finalGesture.id, { u: moved.u, v: moved.v });
      return;
    }
    updateFastenerPattern({
      manual: face.fasteners.manual.map((entry) =>
        entry.id === finalGesture.id ? createManualCeilingFastener(moved, { ...entry }) : entry,
      ),
    });
  };

  const finishCanvasGesture = (event) => {
    if (panGesture) return;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const finalGesture = { ...gesture, current: eventToLocal(event, gesture.kind === 'draw') };
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    releaseCanvasRect();
    setGesture(null);
    if (finalGesture.kind === 'draw') commitDrawnEntity(finalGesture);
    else commitMovedEntity(finalGesture);
  };

  const finishPanelTrace = (event) => {
    if (canvasTool !== CANVAS_TOOLS.TRACE_PANEL || !panelTrace?.points.length) return;
    event.preventDefault();
    event.stopPropagation();
    commitPanelTrace(panelTrace.points);
  };

  const selectedPanel = selection?.type === 'panel' ? panels.find((panel) => panel.localId === selection.id) : null;
  /*
    What the selected board stores for itself, not what it ends up boarded in:
    the picker has to show "profile default" for a board that never overrode it,
    so that following the profile keeps following it. A generated grid stores
    nothing at all, so nothing on it can have an override yet.
  */
  const selectedPanelMaterial =
    (selectedPanel && face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM
      ? face.layout.customPanels.find((panel) => panel.id === selection.id)?.material
      : null) || PROFILE_DEFAULT_MATERIAL;
  const selectedMember =
    selection?.type === 'framing' ? frameMembers.find((member) => member.id === selection.id) : null;
  const selectedFastener = selection?.type === 'fastener' ? fasteners.find((entry) => entry.id === selection.id) : null;
  const selectedOpening = selection?.type === 'opening' ? openings.find((entry) => entry.id === selection.id) : null;
  /*
    The stored fixture, not the resolved one: the drawing clamps a fixture into
    a boundary that shrank under it, and editing anything else on it must not
    write that clamp back as the position someone chose.
  */
  const selectedFixture =
    selection?.type === 'fixture'
      ? configuration.lighting.fixtures.find((fixture) => fixture.id === selection.id)
      : null;
  const selectionIsDeletable = Boolean(
    selectedPanel || selectedMember || selectedFastener || selectedOpening || selectedFixture,
  );
  const selectionSummary = selection
    ? `${SELECTION_LABELS[selection.type] || selection.type} selected`
    : 'Nothing selected';
  const takeoff = detail.takeoff;
  const elevations = detail.elevations;
  /*
    Lumens per square metre is the one number that says whether a room is lit or
    merely has lights in it, and the boarded area is the only area the takeoff
    already knows — it is the ceiling with its boundary and openings taken out,
    which is exactly the floor those lumens fall on. An unboarded ceiling has no
    area at all, so it gets the totals and no density rather than a division by
    nothing.
  */
  const lightingArea = takeoff.installedAreaMm2 / 1_000_000;
  const lightingDensity =
    lightingArea > 0 ? ` · ≈${Math.round(takeoff.lighting.totalLumens / lightingArea)} lm/m²` : '';
  const lightingSummary = `${takeoff.lighting.fixtureCount} fixture${
    takeoff.lighting.fixtureCount === 1 ? '' : 's'
  } · ${Math.round(takeoff.lighting.totalLumens)} lm total${lightingDensity}`;
  const activeToolDefinition = TOOL_BY_ID[canvasTool];
  const gesturePreview = gesture?.kind === 'draw' ? drawnGestureEntity() : movedGestureEntity();
  const gesturePreviewType =
    gesture?.kind === 'draw'
      ? gesture.tool === CANVAS_TOOLS.DRAW_PANEL
        ? 'panel'
        : gesture.tool === CANVAS_TOOLS.DRAW_OPENING
          ? 'opening'
          : 'framing'
      : gesture?.type;
  const panelTracePreview = panelTrace?.points?.length
    ? [...panelTrace.points, panelTrace.previewPoint || panelTrace.points[panelTrace.points.length - 1]]
    : [];
  // An unboarded ceiling greys out whatever is drawn on it; a boarded one leaves
  // every board to its own material.
  const disabledBoardFill = face.enabled ? null : '#c3c8cc';
  const beamMode = ceiling.attachment?.mode === CEILING_ATTACHMENT_MODES.BEAM;
  const attachmentLabel = beamMode ? 'Support beams' : 'Manual datum';
  // A traced outline is not derived from anything, so the beams say nothing
  // about where this ceiling stops — only about how high it hangs.
  const drawnBoundary = ceiling.boundarySource === CEILING_BOUNDARY_SOURCES.DRAWN;
  // Two beams are the fewest that can bound a ceiling, so anything less is a
  // ceiling drawing itself from the outline it last saved.
  const supportBeamsMissing = beamMode && supportBeams.length < 2;
  /*
    Hangers are derived from the plan alone, so a manual ceiling still counts a grid of them even though it
    hangs from nothing: its attachment plane is the board underside, which sits below the carrier the hangers
    would rise from, and the preview discards every one of them for having no length. Claiming a count here
    would advertise hardware the ceiling does not have, so the collapsed section reports the one number a
    manual ceiling owns outright — where its boards finish — and leaves the drop to the ceilings it moves.
  */
  const suspensionSummary = beamMode
    ? `${configuration.suspension.drop} mm drop · ${hangers.length} hanger${hangers.length === 1 ? '' : 's'}`
    : `${formatMm(elevations.boardUnderside)} mm underside`;
  const activeSupportLevel =
    beamMode && supportBeams.length
      ? supportLevels.find(
          (level) => Math.abs(level.elevation - elevations.attachment) <= CEILING_BEAM_ELEVATION_TOLERANCE,
        ) || null
      : null;
  const attachmentValue = beamMode ? activeSupportLevel?.id || UNLISTED_SUPPORT_LEVEL : 'manual';
  const chooseAttachment = (value) => {
    if (value === attachmentValue) return;
    if (value === UNLISTED_SUPPORT_LEVEL) return;
    if (value === 'manual') {
      dispatch({
        type: 'CEILING_UPDATE',
        ceiling: {
          id: ceiling.id,
          attachment: { mode: CEILING_ATTACHMENT_MODES.MANUAL, beamIds: [] },
          // Manual mode stores the boards themselves, so the ceiling stays
          // exactly where it is hanging instead of jumping up by its drop.
          baseElevation: elevations.boardUnderside,
        },
      });
      return;
    }
    const level = supportLevels.find((entry) => entry.id === value);
    if (!level) return;
    dispatch({
      type: 'CEILING_UPDATE',
      ceiling: {
        id: ceiling.id,
        attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: level.beamIds },
        baseElevation: level.elevation,
      },
    });
  };
  const attachedBeamIds = beamMode ? ceiling.attachment?.beamIds || [] : [];
  /**
   * Add or drop one beam without disturbing the rest. The level picker above is
   * the coarse control — it seeds a whole level — and this is the fine one: a
   * ceiling that only runs under three of a level's four beams says so here.
   *
   * The stored elevation is rewritten from what is left, because the ceiling
   * cannot hang higher than the beam that stops first, and that beam changes
   * every time the set does. Dropping to one beam is allowed; the missing-support
   * warning already covers a ceiling that can no longer draw its own outline.
   */
  const toggleSupportBeam = (beamId) => {
    const nextBeamIds = attachedBeamIds.includes(beamId)
      ? attachedBeamIds.filter((id) => id !== beamId)
      : [...attachedBeamIds, beamId];
    const levels = nextBeamIds
      .map((id) => (ceilingFloor?.beams || []).find((beam) => beam.id === id)?.floorLevel)
      .filter((level) => Number.isFinite(level));
    dispatch({
      type: 'CEILING_UPDATE',
      ceiling: {
        id: ceiling.id,
        attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: nextBeamIds },
        baseElevation: levels.length ? Math.min(...levels) : elevations.attachment,
      },
    });
  };
  const reviewCopy =
    profile.status === CEILING_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY
      ? 'Reference only — the cited document verifies the board sizes and the ceiling application, not a complete fixing schedule. Furring, carrier, hanger, and screw values here are planning defaults. A qualified professional must confirm them against a current installation guide before construction.'
      : 'Custom assumption — every value on this ceiling is a planning default, not a manufacturer or code requirement. A qualified professional must review the whole assembly before construction.';

  const gestureReadout = (() => {
    if (gesture?.kind === 'draw' && gesturePreview) {
      if (gesture.tool === CANVAS_TOOLS.DRAW_PANEL || gesture.tool === CANVAS_TOOLS.DRAW_OPENING) {
        return {
          point: gesture.current,
          lines: [`${formatMm(gesturePreview.width)} × ${formatMm(gesturePreview.height)} mm`],
        };
      }
      const vertical = gesture.tool === CANVAS_TOOLS.DRAW_CARRIER;
      const span = vertical ? gesturePreview.v1 - gesturePreview.v0 : gesturePreview.u1 - gesturePreview.u0;
      return {
        point: gesture.current,
        lines: [`${vertical ? 'carrier' : 'furring'} · ${formatMm(span)} mm`],
      };
    }
    if (gesture?.kind === 'move' && gesturePreview) {
      if (gesture.type === 'fastener' || gesture.type === 'fixture') {
        return { point: gesture.current, lines: [`U ${formatMm(gesturePreview.u)} · V ${formatMm(gesturePreview.v)}`] };
      }
      return { point: gesture.current, lines: [`U ${formatMm(gesturePreview.u0)} · V ${formatMm(gesturePreview.v0)}`] };
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
      if (gesture) {
        // First Escape cancels the in-flight gesture but keeps the tool active.
        event.preventDefault();
        setGesture(null);
        releaseCanvasRect();
        return;
      }
      if (canvasTool === CANVAS_TOOLS.SELECT) return;
      event.preventDefault();
      chooseCanvasTool(CANVAS_TOOLS.SELECT);
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
      fitCeilingInViewport();
      return;
    }
    const definition = TOOL_SHORTCUTS[event.key.toLowerCase()];
    if (!definition) return;
    claimShortcut(event);
    chooseCanvasTool(definition.tool);
  };

  canvasHandlersRef.current = { beginElementMove, isCustomMember, isManualFastener };

  /**
   * The boards split by what they are made of. A ceiling boarded in one material
   * has nothing to split, so it keeps the plain totals; two materials are two
   * separate orders, which is why the sheets are counted per material and can
   * add up to more than the ceiling's own sheet count.
   */
  const renderBoardMaterialBreakdown = () =>
    takeoff.materials.length > 1 ? (
      <div className={styles.metrics}>
        {takeoff.materials.map((entry) => (
          <Metric
            key={entry.material}
            label={boardMaterialLabel(entry.material)}
            value={`${entry.panelCount} board${entry.panelCount === 1 ? '' : 's'}`}
            note={`${(entry.installedAreaMm2 / 1_000_000).toFixed(2)} m² · ${entry.stockSheetCount} sheet${
              entry.stockSheetCount === 1 ? '' : 's'
            }`}
          />
        ))}
      </div>
    ) : null;

  /**
   * One luminaire's numbers, shown identically wherever a fixture is being
   * edited — the Lighting list and the Selection aside are two ways into the
   * same object, and a field that only existed in one of them would be a setting
   * people could not find.
   *
   * Fields appear only where the catalog says they mean something: an omni lamp
   * has no beam to widen, a can has nothing to hang by, and a fixed downlight
   * has no gimbal to aim. Offering them anyway would be four controls that
   * silently change nothing.
   */
  const renderFixtureEditor = (fixture) => {
    const type = getFixtureType(fixture.fixtureType);
    const photometrics = resolveFixturePhotometrics(fixture);
    const bulb = getBulbType(fixture.bulbType);
    return (
      <>
        <SelectField
          label="Fixture type"
          value={fixture.fixtureType}
          onChange={(fixtureType) => updateFixture(fixture.id, { fixtureType })}
        >
          {FIXTURE_TYPES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Lamp"
          value={fixture.bulbType}
          onChange={(bulbType) => updateFixture(fixture.id, { bulbType })}
        >
          {type.allowedBulbs.map((bulbId) => (
            <option key={bulbId} value={bulbId}>
              {getBulbType(bulbId).label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Colour temperature"
          value={fixture.colorTempK}
          onChange={(kelvin) => updateFixture(fixture.id, { colorTempK: Number(kelvin) })}
        >
          {COLOR_TEMPERATURES.map((entry) => (
            <option key={entry.kelvin} value={entry.kelvin}>
              {`${entry.kelvin} K — ${entry.label}`}
            </option>
          ))}
        </SelectField>
        <NumberField label="From west edge (U)" value={fixture.u} onChange={(u) => updateFixture(fixture.id, { u })} />
        <NumberField label="From south edge (V)" value={fixture.v} onChange={(v) => updateFixture(fixture.id, { v })} />
        {/*
          The lamp's own rating until someone types a real one off a data sheet.
          Clearing the field is how it goes back: zero is not a luminaire that
          emits nothing, it is the absence of an override.
        */}
        <NumberField
          label="Output"
          value={photometrics.lumens}
          min={0}
          suffix="lm"
          onChange={(lumensOverride) => updateFixture(fixture.id, { lumensOverride })}
        />
        {bulb.beamAngleDeg === null ? null : (
          <NumberField
            label="Beam angle"
            value={photometrics.beamAngleDeg}
            min={BEAM_ANGLE_RANGE_DEG.min}
            suffix="°"
            onChange={(beamAngleDeg) => updateFixture(fixture.id, { beamAngleDeg })}
          />
        )}
        {isPendantFixture(fixture.fixtureType) ? (
          <NumberField
            label="Drop below ceiling"
            value={fixture.dropMm}
            min={1}
            onChange={(dropMm) => updateFixture(fixture.id, { dropMm })}
          />
        ) : null}
        {type.aimable ? (
          <>
            <NumberField
              label="Aim tilt"
              value={fixture.aim.tiltDeg}
              min={0}
              suffix="°"
              onChange={(tiltDeg) => updateFixture(fixture.id, { aim: { ...fixture.aim, tiltDeg } })}
            />
            <NumberField
              label="Aim direction"
              value={fixture.aim.azimuthDeg}
              suffix="°"
              onChange={(azimuthDeg) => updateFixture(fixture.id, { aim: { ...fixture.aim, azimuthDeg } })}
            />
          </>
        ) : null}
        <Toggle
          checked={fixture.castShadow}
          onChange={(castShadow) => updateFixture(fixture.id, { castShadow })}
          label="Cast shadows"
        />
        <ToolbarButton danger onClick={() => removeFixture(fixture.id)}>
          Delete light
        </ToolbarButton>
      </>
    );
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
        onClick={() => chooseCanvasTool(definition.tool)}
        {...overrides}
      />
    );
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Ceiling assembly detail editor">
      <header className={styles.header}>
        <div className={styles.headerIdentity}>
          <span className={styles.eyebrow}>Reflected ceiling plan workspace</span>
          <h1>Ceiling assembly editor — reflected ceiling plan</h1>
          <p>
            {ceiling.name || 'Ceiling'} · {detail.length.toFixed(0)} × {detail.depth.toFixed(0)} mm ·{' '}
            {profile.manufacturer} {profile.product}
          </p>
        </div>
        <div className={styles.headerActions}>
          <ToolbarButton
            title="Close the ceiling detail editor and return to the floorplan"
            onClick={() => editorDispatch({ type: 'CLOSE_CEILING_DETAIL_EDITOR' })}
          >
            Close
          </ToolbarButton>
        </div>
      </header>

      <div className={styles.body} data-focus="false">
        <aside id="ceiling-detail-left-panel" className={styles.leftPanel} aria-label="Ceiling detailing steps">
          <StepStrip steps={WORKFLOW_STEPS} isOpen={(id) => Boolean(openSections[id])} onSelect={focusStep} />

          <CollapsibleSection
            id="ceiling-face"
            step={1}
            title="Face and boards"
            summary={`${panels.length} board${panels.length === 1 ? '' : 's'} · ${
              face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM ? 'custom' : 'generated grid'
            }`}
            open={openSections.face}
            onToggle={() => toggleSection('face')}
            innerRef={sectionRef('face')}
          >
            <div className={styles.toolRow} aria-label="Board drawing tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_PANEL)}
              {renderToolButton(CANVAS_TOOLS.TRACE_PANEL)}
            </div>
            <Toggle checked={face.enabled} onChange={(enabled) => updateFace({ enabled })} label="Board this ceiling" />
            <InfoHint label="How the board layout works">
              <p className={styles.inlineHelp}>
                A generated grid tiles the whole ceiling from the origin. The moment you draw or trace a board, the grid
                is written out as explicit boards first, so nothing already on the drawing is lost. Regenerate grid puts
                it back.
              </p>
            </InfoHint>
            <SelectField
              label="Product profile"
              value={face.productProfileId}
              onChange={(productProfileId) => updateFace({ productProfileId })}
            >
              {CEILING_PRODUCT_PROFILES.map((entry) => (
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
              {CEILING_JURISDICTION_PROFILES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
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
              label="Board thickness"
              value={face.boardThickness}
              min={1}
              onChange={(boardThickness) => updateFace({ boardThickness })}
            />
            <SelectField
              label="Orientation"
              value={face.layout.orientation}
              onChange={(orientation) => updateLayout({ orientation })}
            >
              <option value="vertical">Long side along V (north/south)</option>
              <option value="horizontal">Long side along U (east/west)</option>
            </SelectField>
            <NumberField
              label="Gap along U"
              value={face.layout.horizontalGap}
              min={0}
              onChange={(horizontalGap) => updateLayout({ horizontalGap })}
            />
            <NumberField
              label="Gap along V"
              value={face.layout.verticalGap}
              min={0}
              onChange={(verticalGap) => updateLayout({ verticalGap })}
            />
            <AdvancedGroup label="Grid origin">
              <NumberField
                label="Origin U"
                value={face.layout.originU}
                onChange={(originU) => updateLayout({ originU })}
              />
              <NumberField
                label="Origin V"
                value={face.layout.originV}
                onChange={(originV) => updateLayout({ originV })}
              />
            </AdvancedGroup>
            <div className={styles.assemblySummary}>
              Layout mode{' '}
              <strong>
                {face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM ? 'Custom boards' : 'Generated grid'}
              </strong>
            </div>
            <div className={styles.buttonRow}>
              <ToolbarButton title="Discard custom boards and rebuild the generated grid" onClick={regeneratePanelGrid}>
                Regenerate grid
              </ToolbarButton>
            </div>
            <div className={styles.profileStatus} data-status={profile.status}>
              <strong>{profile.status.replaceAll('_', ' ')}</strong>
              <span>{profile.source.title}</span>
              <small>{jurisdiction.label}</small>
            </div>
            <p className={styles.inlineHelp}>{reviewCopy}</p>
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-structure"
            step={2}
            title="Structure"
            summary={`${frameMembers.length} member${frameMembers.length === 1 ? '' : 's'} · ${
              configuration.framing.mode === CEILING_FRAMING_LAYOUT_MODES.CUSTOM ? 'custom' : 'automatic'
            } · ${configuration.framing.material === 'timber' ? 'timber' : 'steel'}`}
            open={openSections.structure}
            onToggle={() => toggleSection('structure')}
            innerRef={sectionRef('structure')}
          >
            <div className={styles.toolRow} aria-label="Structure drawing tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_FURRING)}
              {renderToolButton(CANVAS_TOOLS.DRAW_CARRIER)}
            </div>
            <InfoHint label="Furring, carriers, and wall angle">
              <p className={styles.inlineHelp}>
                Boards screw to the furring channels; the furring hangs off the carriers; the carriers hang off the
                hangers. Wall angle is derived from the ceiling outline and is not edited here.
              </p>
            </InfoHint>
            <SelectField label="Mode" value={configuration.framing.mode} onChange={(mode) => updateFraming({ mode })}>
              <option value={CEILING_FRAMING_LAYOUT_MODES.AUTOMATIC}>Automatic + custom</option>
              <option value={CEILING_FRAMING_LAYOUT_MODES.CUSTOM}>Explicit custom members</option>
            </SelectField>
            <SelectField
              label="Material"
              value={configuration.framing.material}
              onChange={(material) => updateFraming({ material })}
            >
              <option value="light_gauge_steel">Light-gauge steel</option>
              <option value="timber">Timber</option>
            </SelectField>
            <NumberField
              label="Furring spacing"
              value={configuration.framing.furringSpacing}
              min={50}
              onChange={(furringSpacing) => updateFraming({ furringSpacing })}
            />
            <NumberField
              label="Carrier spacing"
              value={configuration.framing.carrierSpacing}
              min={50}
              onChange={(carrierSpacing) => updateFraming({ carrierSpacing })}
            />
            <NumberField
              label="Furring width"
              value={configuration.framing.furringWidth}
              min={5}
              onChange={(furringWidth) => updateFraming({ furringWidth })}
            />
            <NumberField
              label="Furring depth"
              value={configuration.framing.furringDepth}
              min={5}
              onChange={(furringDepth) => updateFraming({ furringDepth })}
            />
            <NumberField
              label="Carrier width"
              value={configuration.framing.carrierWidth}
              min={5}
              onChange={(carrierWidth) => updateFraming({ carrierWidth })}
            />
            <NumberField
              label="Carrier depth"
              value={configuration.framing.carrierDepth}
              min={5}
              onChange={(carrierDepth) => updateFraming({ carrierDepth })}
            />
            <p className={styles.inlineHelp}>
              Product planning maximum furring spacing: {profile.planningDefaults.maximumFurringSpacingMm} mm
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-suspension"
            step={3}
            title="Suspension"
            summary={suspensionSummary}
            open={openSections.suspension}
            onToggle={() => toggleSection('suspension')}
            innerRef={sectionRef('suspension')}
          >
            {beamMode || supportLevels.length ? (
              <SelectField label="Hangs from" value={attachmentValue} onChange={chooseAttachment}>
                {supportLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {`${formatMm(level.elevation)} mm — ${level.beams.length} beam${
                      level.beams.length === 1 ? '' : 's'
                    }`}
                  </option>
                ))}
                {beamMode && !activeSupportLevel ? (
                  <option value={UNLISTED_SUPPORT_LEVEL}>
                    {supportBeamsMissing
                      ? 'Support beams missing'
                      : `${formatMm(elevations.attachment)} mm — beams off this floor's levels`}
                  </option>
                ) : null}
                <option value="manual">Manual datum</option>
              </SelectField>
            ) : null}
            {beamMode && supportLevels.length ? (
              <>
                <p className={styles.inlineHelp}>Beams this ceiling hangs from</p>
                <div className={styles.dimensionToggles}>
                  {supportLevels.map((level) => (
                    <Fragment key={level.id}>
                      <span className={styles.presetLabel}>{`${formatMm(level.elevation)} mm`}</span>
                      {level.beams.map((beam) => (
                        <Toggle
                          key={beam.id}
                          checked={attachedBeamIds.includes(beam.id)}
                          onChange={() => toggleSupportBeam(beam.id)}
                          label={getBeamDisplayLabel(beam, ceilingFloor?.columns || [])}
                        />
                      ))}
                    </Fragment>
                  ))}
                </div>
              </>
            ) : null}
            {drawnBoundary ? (
              <p className={styles.inlineHelp}>Outline: as drawn. The beams set the height only.</p>
            ) : supportBeamsMissing ? (
              <p className={styles.inlineHelp}>Support beams missing — using saved outline.</p>
            ) : null}
            {/*
              A manual ceiling hangs from nothing, so its stored elevation is the board underside itself and the
              suspension drop is never applied to it. Offering the drop here would be a field that changes nothing,
              so the height it does own is what gets typed instead. The stored drop is left alone either way, so
              switching back to beams restores the hang the ceiling last had.
            */}
            {beamMode ? (
              <>
                {/*
                  With every support beam gone, the ceiling reads its attachment plane from the elevation it
                  last stored, and nothing else on this panel can type that number — so the stored plane
                  becomes a field exactly here and nowhere else. One surviving beam is enough to govern the
                  plane again, so a single support hides this rather than offering a height the next read
                  would overwrite; the missing-support warning above already speaks for that case. The drop
                  stays alongside it either way, because the boards still hang below whatever plane is typed.
                */}
                {supportBeams.length === 0 ? (
                  <NumberField
                    label="Attachment height"
                    value={ceiling.baseElevation}
                    onChange={(baseElevation) =>
                      dispatch({ type: 'CEILING_UPDATE', ceiling: { id: ceiling.id, baseElevation } })
                    }
                  />
                ) : null}
                <NumberField
                  label="Drop below attachment"
                  value={configuration.suspension.drop}
                  min={0}
                  onChange={(drop) => updateSuspension({ drop })}
                />
              </>
            ) : (
              <NumberField
                label="Board underside height"
                value={ceiling.baseElevation}
                onChange={(baseElevation) =>
                  dispatch({ type: 'CEILING_UPDATE', ceiling: { id: ceiling.id, baseElevation } })
                }
              />
            )}
            <NumberField
              label="Hanger spacing"
              value={configuration.suspension.hangerSpacing}
              min={50}
              onChange={(hangerSpacing) => updateSuspension({ hangerSpacing })}
            />
            <div className={styles.metrics}>
              <Metric label="Attachment" value={`${formatMm(elevations.attachment)} mm`} note={attachmentLabel} />
              <Metric
                label="Board underside"
                value={`${formatMm(elevations.boardUnderside)} mm`}
                note="finished ceiling"
              />
              <Metric
                label="Furring"
                value={`${formatMm(elevations.furringBottom)} → ${formatMm(elevations.furringTop)} mm`}
              />
              <Metric
                label="Carrier"
                value={`${formatMm(elevations.carrierBottom)} → ${formatMm(elevations.carrierTop)} mm`}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-openings"
            step={4}
            title="Openings"
            summary={`${openings.length} opening${openings.length === 1 ? '' : 's'}`}
            open={openSections.openings}
            onToggle={() => toggleSection('openings')}
            innerRef={sectionRef('openings')}
          >
            <div className={styles.toolRow} aria-label="Opening tools">
              {renderToolButton(CANVAS_TOOLS.DRAW_OPENING)}
            </div>
            <SelectField label="New opening type" value={openingDraftType} onChange={setOpeningDraftType}>
              {Object.values(CEILING_OPENING_TYPES).map((type) => (
                <option key={type} value={type}>
                  {OPENING_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
            <p className={styles.inlineHelp}>
              Pick a type, then press <kbd className={styles.kbd}>O</kbd> and drag the cut-out on the plan.
            </p>
            {configuration.openings.length ? (
              configuration.openings.map((opening) => (
                <div key={opening.id} className={styles.selectionCard}>
                  <SelectField
                    label="Type"
                    value={opening.type}
                    onChange={(type) => updateOpening(opening.id, { type })}
                  >
                    {Object.values(CEILING_OPENING_TYPES).map((type) => (
                      <option key={type} value={type}>
                        {OPENING_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </SelectField>
                  <NumberField label="U" value={opening.u} onChange={(u) => updateOpening(opening.id, { u })} />
                  <NumberField label="V" value={opening.v} onChange={(v) => updateOpening(opening.id, { v })} />
                  <NumberField
                    label="Width"
                    value={opening.width}
                    min={1}
                    onChange={(width) => updateOpening(opening.id, { width })}
                  />
                  <NumberField
                    label="Height"
                    value={opening.height}
                    min={1}
                    onChange={(height) => updateOpening(opening.id, { height })}
                  />
                  <ToolbarButton danger onClick={() => removeOpening(opening.id)}>
                    Delete opening
                  </ToolbarButton>
                </div>
              ))
            ) : (
              <EmptyState title="No ceiling openings yet">
                Access hatches, downlights, and diffusers cut the boards and pull trimmers around themselves.
              </EmptyState>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-lighting"
            step={5}
            title="Lighting"
            summary={lightingSummary}
            open={openSections.lighting}
            onToggle={() => toggleSection('lighting')}
            innerRef={sectionRef('lighting')}
          >
            <div className={styles.toolRow} aria-label="Lighting tools">
              {renderToolButton(CANVAS_TOOLS.ADD_LIGHT)}
            </div>
            <SelectField label="New light type" value={lightDraftType} onChange={setLightDraftType}>
              {FIXTURE_TYPES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </SelectField>
            <p className={styles.inlineHelp}>
              Pick a fixture, then press <kbd className={styles.kbd}>L</kbd> and click where it goes. Output is the
              lamp&apos;s own rating until you type one; clear the field to hand it back.
            </p>
            {configuration.lighting.fixtures.length ? (
              configuration.lighting.fixtures.map((fixture) => (
                <div key={fixture.id} className={styles.selectionCard}>
                  {renderFixtureEditor(fixture)}
                </div>
              ))
            ) : (
              <EmptyState title="No light fixtures yet">
                Downlights, pendants, and troffers light the room in the 3D preview and carry their own load and lumen
                figures into the takeoff.
              </EmptyState>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-screws"
            step={6}
            title="Screws"
            summary={`${fasteners.length} screw${fasteners.length === 1 ? '' : 's'} · ${
              face.fasteners.perimeterSpacing
            } mm perimeter`}
            open={openSections.screws}
            onToggle={() => toggleSection('screws')}
            innerRef={sectionRef('screws')}
          >
            <div className={styles.toolRow} aria-label="Fastener tools">
              {renderToolButton(CANVAS_TOOLS.ADD_FASTENER)}
            </div>
            <SelectField label="Mode" value={face.fasteners.mode} onChange={(mode) => updateFastenerPattern({ mode })}>
              <option value={CEILING_FASTENER_LAYOUT_MODES.GENERATED}>Generated + overrides</option>
              <option value={CEILING_FASTENER_LAYOUT_MODES.CUSTOM}>Explicit custom screws</option>
            </SelectField>
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
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-takeoff"
            step={7}
            title="Takeoff"
            summary={`${takeoff.panelCount} boards · ${takeoff.fastenerCount} screws`}
            open={openSections.takeoff}
            onToggle={() => toggleSection('takeoff')}
            innerRef={sectionRef('takeoff')}
          >
            <div className={styles.metrics}>
              <Metric label="Boards" value={takeoff.panelCount} note="unoptimized board count" />
              <Metric label="Stock sheets" value={takeoff.stockSheetCount} note="full sheets before cutting" />
              <Metric label="Installed area" value={`${(takeoff.installedAreaMm2 / 1_000_000).toFixed(2)} m²`} />
              <Metric label="Screws" value={takeoff.fastenerCount} />
              <Metric label="Furring" value={`${(takeoff.furringLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Carrier" value={`${(takeoff.carrierLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Wall angle" value={`${(takeoff.wallAngleLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Trimmers" value={`${(takeoff.trimmerLinearMm / 1000).toFixed(2)} m`} />
              <Metric label="Hangers" value={takeoff.hangerCount} />
            </div>
            {/* An unlit ceiling has no lighting order, so it says nothing rather
                than three zeros. The split is by fixture and lamp together: the
                same can with a BR30 and with a PAR38 are two line items. */}
            {takeoff.lighting.fixtureCount ? (
              <>
                <div className={styles.metrics}>
                  <Metric label="Light fixtures" value={takeoff.lighting.fixtureCount} />
                  <Metric label="Connected load" value={`${formatMm(takeoff.lighting.totalWatts)} W`} />
                  <Metric
                    label="Installed lumens"
                    value={`${Math.round(takeoff.lighting.totalLumens)} lm`}
                    note={lightingArea > 0 ? `≈${Math.round(takeoff.lighting.totalLumens / lightingArea)} lm/m²` : null}
                  />
                </div>
                <div className={styles.metrics}>
                  {takeoff.lighting.byType.map((entry) => (
                    <Metric
                      key={`${entry.fixtureType}:${entry.bulbType}`}
                      label={getFixtureType(entry.fixtureType).label}
                      value={`${entry.count} × ${getBulbType(entry.bulbType).label}`}
                      note={`${Math.round(entry.totalLumens)} lm · ${formatMm(entry.totalWatts)} W`}
                    />
                  ))}
                </div>
              </>
            ) : null}
            {takeoff.materials.length > 1 ? (
              <>
                <p className={styles.inlineHelp}>
                  This ceiling is boarded in more than one material. Sheets are counted per material, because each is
                  bought and cut on its own.
                </p>
                {renderBoardMaterialBreakdown()}
              </>
            ) : null}
            <p className={styles.inlineHelp}>{reviewCopy}</p>
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
                  title="Delete selected — remove the selected board, member, screw, opening, or light (Delete)"
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
                active={workspaceView === WORKSPACE_VIEWS.RCP}
                title="Show the reflected ceiling plan only"
                onClick={() => setWorkspaceView(WORKSPACE_VIEWS.RCP)}
              >
                RCP
              </ToolbarButton>
              <ToolbarButton
                active={workspaceView === WORKSPACE_VIEWS.SPLIT}
                title="Show the reflected ceiling plan above the live 3D preview"
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
              <ToolbarButton title="Fit the whole ceiling in view (0)" onClick={fitCeilingInViewport}>
                Fit ceiling
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
          <div className={styles.statusBar} data-snapped="false">
            <span className={styles.statusLive} role="status">
              <span className={styles.statusTool}>
                <ToolGlyph name={activeToolDefinition.icon} />
                <strong>{activeToolDefinition.label}</strong>
                <kbd className={styles.kbd}>{activeToolDefinition.shortcut}</kbd>
              </span>
              <span className={styles.statusHint}>{TOOL_HINTS[canvasTool]}</span>
              <span className={styles.statusSelection}>{selectionSummary}</span>
            </span>
            <span
              className={styles.statusShortcut}
              title="Hold Space + drag to pan · scroll to zoom · 0 fits the ceiling · Esc cancels, then returns to Select"
            >
              Hold Space + drag to pan · scroll to zoom · 0 fits the ceiling · Esc cancels, then returns to Select
            </span>
          </div>
          <div
            className={styles.workspaceViews}
            /* The shared stylesheet keys its single-pane grid on 'elevation'. */
            data-view={workspaceView === WORKSPACE_VIEWS.RCP ? 'elevation' : workspaceView}
            data-workspace-view={workspaceView}
          >
            {workspaceView !== WORKSPACE_VIEWS.THREE_D ? (
              <div className={styles.elevationPane}>
                <div
                  ref={attachCanvasFrame}
                  className={styles.canvasFrame}
                  data-panning={panGesture ? 'true' : 'false'}
                  data-space-pan={spacePanActive ? 'true' : 'false'}
                  onPointerDown={beginViewportPan}
                  onPointerMove={updateViewportPan}
                  onPointerUp={finishViewportPan}
                  onPointerCancel={finishViewportPan}
                >
                  <svg
                    ref={svgRef}
                    className={styles.canvas}
                    viewBox={`0 0 ${detail.length} ${detail.depth}`}
                    data-tool={canvasTool}
                    style={{
                      ...(canvasMetrics.ready
                        ? { width: canvasMetrics.fitWidth, height: canvasMetrics.fitHeight }
                        : {}),
                      transform: `translate(${viewport.panU}px, ${viewport.panV}px) scale(${viewport.zoom})`,
                    }}
                    onPointerDown={beginCanvasGesture}
                    onPointerMove={updateCanvasGesture}
                    onPointerUp={finishCanvasGesture}
                    onDoubleClick={finishPanelTrace}
                    onPointerCancel={() => {
                      setGesture(null);
                      releaseCanvasRect();
                    }}
                  >
                    <rect width={detail.length} height={detail.depth} fill="#202830" />
                    <g data-mirrored="false" transform={`translate(0 ${detail.depth}) scale(1 -1)`}>
                      <CeilingPlanLayers
                        bounds={bounds}
                        snapStep={snapStep}
                        snapEnabled={snapEnabled}
                        unitPx={unitPx}
                        layers={layerVisibility}
                        panels={panels}
                        frameMembers={frameMembers}
                        hangers={hangers}
                        fasteners={fasteners}
                        lightFixtures={lightFixtures}
                        openings={openings}
                        regions={detail.regions}
                        disabledBoardFill={disabledBoardFill}
                        selection={selection}
                        isCustomMember={stableCanvasHandlers.isCustomMember}
                        isManualFastener={stableCanvasHandlers.isManualFastener}
                        onElementPointerDown={stableCanvasHandlers.onElementPointerDown}
                      />

                      {gesturePreview && (gesturePreviewType === 'panel' || gesturePreviewType === 'opening') ? (
                        <rect
                          className={styles.drawPreview}
                          x={gesturePreview.u0}
                          y={gesturePreview.v0}
                          width={gesturePreview.u1 - gesturePreview.u0}
                          height={gesturePreview.v1 - gesturePreview.v0}
                          fill="rgba(255, 184, 92, .28)"
                          stroke="#ffb85c"
                          strokeWidth="1.25"
                          strokeDasharray="8 5"
                          vectorEffect="non-scaling-stroke"
                        />
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
                          strokeWidth="1.25"
                          strokeDasharray="8 5"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {gesturePreview && (gesturePreviewType === 'fastener' || gesturePreviewType === 'fixture') ? (
                        <circle
                          className={styles.drawPreview}
                          cx={gesturePreview.u}
                          cy={gesturePreview.v}
                          r={(gesturePreviewType === 'fixture' ? 6 : 3) * unitPx}
                          fill="#ffd166"
                          stroke="#fff"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {panelTracePreview.length ? (
                        <g className={styles.drawPreview}>
                          <polyline
                            points={panelTracePreview.map((point) => `${point.u},${point.v}`).join(' ')}
                            fill={panelTracePreview.length >= 3 ? 'rgba(255, 184, 92, .2)' : 'none'}
                            stroke="#ffb85c"
                            strokeWidth="1.25"
                            strokeDasharray="8 5"
                            vectorEffect="non-scaling-stroke"
                          />
                          {panelTrace.points.map((point, index) => (
                            <circle
                              key={`${point.u}:${point.v}:${index}`}
                              cx={point.u}
                              cy={point.v}
                              r={3.5 * unitPx}
                              fill={index === 0 ? '#67c5a6' : '#ffb85c'}
                              stroke="#fff"
                              strokeWidth="1"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      ) : null}
                    </g>
                    {gestureReadout ? (
                      <CanvasReadoutChip
                        point={gestureReadout.point}
                        lines={gestureReadout.lines}
                        unitPx={unitPx}
                        view={bounds}
                      />
                    ) : null}
                  </svg>
                  <WallCanvasRulers metrics={canvasMetrics} viewport={viewport} bounds={bounds} />
                  {panels.length === 0 ? (
                    <div className={styles.canvasEmptyHint}>
                      <strong>No boards on this ceiling yet</strong>
                      <span>
                        Press <kbd className={styles.kbd}>P</kbd> and drag out a rectangle, or open step 1 and
                        regenerate the grid.
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className={styles.dimensionBar}>
                  <span>U 0 → {detail.length.toFixed(0)} mm</span>
                  <span>V 0 → {detail.depth.toFixed(0)} mm</span>
                  <span>
                    {Math.abs(detail.rotation) > 1e-6
                      ? `Origin: south-west corner · aligned to ceiling edges · ${Math.abs(
                          (detail.rotation * 180) / Math.PI,
                        ).toFixed(1)}° off plan north`
                      : 'Origin: south-west corner · North up · matches floor plan'}
                  </span>
                  <span>
                    {panels.length} boards · {frameMembers.length} members · {hangers.length} hangers ·{' '}
                    {fasteners.length} screws · {openings.length} openings · {lightFixtures.length} lights
                  </span>
                </div>
              </div>
            ) : null}
            {workspaceView !== WORKSPACE_VIEWS.RCP && previewProject ? (
              <div className={styles.previewPane} aria-label="Live ceiling assembly 3D preview">
                <div className={styles.liveBadge}>
                  <span>Live ceiling preview</span>
                  <small>Updates after every committed board, member, screw, opening, or suspension edit</small>
                </div>
                <Suspense fallback={<div className={styles.previewLoading}>Loading live ceiling preview…</div>}>
                  <CeilingLivePreview
                    className={styles.wallPreviewPanel}
                    project={previewProject}
                    activeFloorId={ceiling.floorId}
                    selectionKind={selection?.type || null}
                    selectionId={selection?.id || null}
                    onPick={handlePreviewPick}
                  />
                </Suspense>
              </div>
            ) : null}
          </div>
        </main>

        <aside id="ceiling-detail-right-panel" className={styles.rightPanel} aria-label="Selection and numbers">
          <CollapsibleSection
            id="ceiling-selection"
            title="Selection"
            summary={selectionSummary}
            open={openSections.selection}
            onToggle={() => toggleSection('selection')}
            innerRef={sectionRef('selection')}
          >
            {selectionIsDeletable ? null : (
              <EmptyState icon="select" title="Nothing selected">
                Pick the Select tool, then click a board, furring channel, screw, or opening on the plan to edit its
                exact numbers here — a light fixture works the same way.
              </EmptyState>
            )}

            {selectedPanel && (
              <div className={styles.selectionCard}>
                <h3>Selected board — {selectedPanel.label}</h3>
                <p>Drag on the plan or enter exact ceiling-local dimensions.</p>
                <NumberField
                  label="From west edge (U)"
                  value={selectedPanel.u0}
                  onChange={(u) => updateSelectedPanel({ u })}
                />
                <NumberField
                  label="From south edge (V)"
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
                {/*
                  Board this one piece in something else. The default option is
                  not a material but the absence of one: the board goes back to
                  following the ceiling's profile, and moves with it afterwards.
                */}
                <SelectField
                  label="Board material"
                  value={selectedPanelMaterial}
                  onChange={(material) =>
                    updateSelectedPanel({ material: material === PROFILE_DEFAULT_MATERIAL ? undefined : material })
                  }
                >
                  <option value={PROFILE_DEFAULT_MATERIAL}>
                    {`Profile default (${boardMaterialLabel(profile.boardMaterial)})`}
                  </option>
                  {Object.values(CEILING_BOARD_MATERIALS).map((material) => (
                    <option key={material} value={material}>
                      {boardMaterialLabel(material)}
                    </option>
                  ))}
                </SelectField>
                <Metric
                  label="Net area"
                  value={`${(selectedPanel.netArea / 1_000_000).toFixed(3)} m²`}
                  note="after boundary and opening cuts"
                />
                <ToolbarButton danger onClick={deleteSelectedPanel}>
                  Delete board
                </ToolbarButton>
              </div>
            )}

            {selectedMember && (
              <div className={styles.selectionCard}>
                <h3>Selected framing — {FRAMING_KIND_LABELS[selectedMember.kind] || selectedMember.kind}</h3>
                {isCustomMember(selectedMember.id) ? (
                  <>
                    <p>Drag on the plan or enter exact member extents.</p>
                    <NumberField
                      label="U start"
                      value={selectedMember.u0}
                      onChange={(u0) => updateSelectedMember({ u0 })}
                    />
                    <NumberField
                      label="U end"
                      value={selectedMember.u1}
                      onChange={(u1) => updateSelectedMember({ u1 })}
                    />
                    <NumberField
                      label="V start"
                      value={selectedMember.v0}
                      onChange={(v0) => updateSelectedMember({ v0 })}
                    />
                    <NumberField
                      label="V end"
                      value={selectedMember.v1}
                      onChange={(v1) => updateSelectedMember({ v1 })}
                    />
                    <NumberField
                      label="Depth"
                      value={selectedMember.depth}
                      min={1}
                      onChange={(depth) => updateSelectedMember({ depth })}
                    />
                  </>
                ) : (
                  <>
                    <p>This member is generated from the current spacing. Delete it to leave a gap in the layout.</p>
                    <div className={styles.metrics}>
                      <Metric
                        label="U span"
                        value={`${formatMm(selectedMember.u0)} → ${formatMm(selectedMember.u1)} mm`}
                      />
                      <Metric
                        label="V span"
                        value={`${formatMm(selectedMember.v0)} → ${formatMm(selectedMember.v1)} mm`}
                      />
                      <Metric label="Depth" value={`${formatMm(selectedMember.depth)} mm`} />
                    </div>
                  </>
                )}
                <ToolbarButton danger onClick={deleteSelectedMember}>
                  Delete member
                </ToolbarButton>
              </div>
            )}

            {selectedFastener && (
              <div className={styles.selectionCard}>
                <h3>Selected screw</h3>
                <NumberField
                  label="From west edge (U)"
                  value={selectedFastener.u}
                  disabled={!isManualFastener(selectedFastener.id)}
                  onChange={(u) => updateSelectedFastener({ u })}
                />
                <NumberField
                  label="From south edge (V)"
                  value={selectedFastener.v}
                  disabled={!isManualFastener(selectedFastener.id)}
                  onChange={(v) => updateSelectedFastener({ v })}
                />
                {isManualFastener(selectedFastener.id) ? null : (
                  <p className={styles.inlineHelp}>
                    Generated from the fixing pattern. Delete it to drop it from the schedule.
                  </p>
                )}
                <ToolbarButton danger onClick={deleteSelectedFastener}>
                  Delete screw
                </ToolbarButton>
              </div>
            )}

            {selectedOpening && (
              <div className={styles.selectionCard}>
                <h3>Selected opening — {OPENING_TYPE_LABELS[selectedOpening.type] || selectedOpening.type}</h3>
                <SelectField
                  label="Type"
                  value={selectedOpening.type}
                  onChange={(type) => updateOpening(selectedOpening.id, { type })}
                >
                  {Object.values(CEILING_OPENING_TYPES).map((type) => (
                    <option key={type} value={type}>
                      {OPENING_TYPE_LABELS[type]}
                    </option>
                  ))}
                </SelectField>
                <NumberField
                  label="U"
                  value={selectedOpening.u}
                  onChange={(u) => updateOpening(selectedOpening.id, { u })}
                />
                <NumberField
                  label="V"
                  value={selectedOpening.v}
                  onChange={(v) => updateOpening(selectedOpening.id, { v })}
                />
                <NumberField
                  label="Width"
                  value={selectedOpening.width}
                  min={1}
                  onChange={(width) => updateOpening(selectedOpening.id, { width })}
                />
                <NumberField
                  label="Height"
                  value={selectedOpening.height}
                  min={1}
                  onChange={(height) => updateOpening(selectedOpening.id, { height })}
                />
                <ToolbarButton danger onClick={deleteSelectedOpening}>
                  Delete opening
                </ToolbarButton>
              </div>
            )}

            {selectedFixture && (
              <div className={styles.selectionCard}>
                <h3>Selected light — {getFixtureType(selectedFixture.fixtureType).label}</h3>
                {renderFixtureEditor(selectedFixture)}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-summary"
            title="Takeoff summary"
            summary={`${takeoff.panelCount} boards · ${takeoff.hangerCount} hangers`}
            open={openSections.summary}
            onToggle={() => toggleSection('summary')}
            innerRef={sectionRef('summary')}
          >
            <div className={styles.metrics}>
              <Metric label="Boards" value={takeoff.panelCount} />
              <Metric label="Stock sheets" value={takeoff.stockSheetCount} />
              <Metric label="Installed area" value={`${(takeoff.installedAreaMm2 / 1_000_000).toFixed(2)} m²`} />
              <Metric label="Screws" value={takeoff.fastenerCount} />
              <Metric label="Hangers" value={takeoff.hangerCount} />
            </div>
            {renderBoardMaterialBreakdown()}
          </CollapsibleSection>

          <CollapsibleSection
            id="ceiling-elevations"
            title="Elevations"
            summary={`Board underside ${formatMm(elevations.boardUnderside)} mm`}
            open={openSections.elevations}
            onToggle={() => toggleSection('elevations')}
            innerRef={sectionRef('elevations')}
          >
            <div className={styles.metrics}>
              <Metric label="Attachment" value={`${formatMm(elevations.attachment)} mm`} note={attachmentLabel} />
              <Metric label="Board underside" value={`${formatMm(elevations.boardUnderside)} mm`} />
              <Metric label="Board top" value={`${formatMm(elevations.boardTop)} mm`} />
              <Metric label="Furring top" value={`${formatMm(elevations.furringTop)} mm`} />
              <Metric label="Carrier top" value={`${formatMm(elevations.carrierTop)} mm`} />
            </div>
            <p className={styles.inlineHelp}>
              All elevations are measured from the project datum, the same one the floor elevations use.
            </p>
          </CollapsibleSection>
        </aside>
      </div>
    </div>
  );
}
