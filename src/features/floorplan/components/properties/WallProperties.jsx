import { memo, useRef, useState } from 'react';
import { formatMeasurement } from '@/annotations/format';
import { MIN_WALL_LENGTH } from '@/domain/defaults';
import { describeWallEditRejection, validateWallEdit } from '@/domain/modelGraph';
import { resizeWallFromStart, wallLength } from '@/geometry/wallGeometry';
import { createWall } from '@/domain/models';
import {
  WALL_ASSEMBLY_PRESETS,
  WALL_BOARD_MATERIALS,
  WALL_FRAME_MATERIALS,
  WALL_INTERIOR_SIDES,
  boardDefaultThickness,
  createWallAssembly,
  deriveWallAssemblyLayers,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallAssemblyCoreDepth,
  wallAssemblyThickness,
} from '@/domain/wallAssemblies';
import {
  WALL_DETAIL_SIDES,
  createWallDetailing,
  resolveWallDetailFrame,
  resolveWallDetailing,
  wallFramingLayoutOptions,
} from '@/domain/wallDetailing';
import {
  WALL_FRAMING_MODES,
  WALL_HEIGHT_MODES,
  normalizeWallFramingMode,
  normalizeWallHeightMode,
  resolveWallClearRun,
  resolveWallStructureFit,
  resolveWallVerticalSpan,
  wallOutboardOffset,
} from '@/domain/wallFit';
import {
  formatSurveyorBearing,
  pointsToSurveyorBearing,
  surveyorBearingToSvgAngle,
  endpointFromBearing,
} from '@/geometry/bearing';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';
import { Hint, Note, NumberField, Readout, Section, SelectField, Stack, Status, panelKitStyles } from './PanelKit';

const EMPTY_SIDES = [];

function sameSides(a, b) {
  return a.length === b.length && a.every((side) => b.includes(side));
}

function clampLayers(value) {
  return Math.max(1, Math.min(4, Math.round(value)));
}

/* ── Which way "out" is ──────────────────────────────────────────────────
 *
 * The stored offset is signed along perpendicular(direction), which is a fact
 * about vector algebra and not about a building. Nobody should have to work out
 * the handedness of a perpendicular to push a facade out, so the panel asks for
 * a magnitude and a side and keeps the sign to itself. Left/right are read
 * looking from the wall's start point toward its end, the same way the assembly
 * asks which face is inside.
 */
const OUTBOARD_SIDES = { LEFT: 'left', RIGHT: 'right' };

// A wall on its axis has no side yet. It shows this until one is picked, rather
// than a side it is not actually offset to.
const OUTBOARD_SIDE_NONE = 'axis';

function outboardSideOf(offset) {
  if (offset > 0) return OUTBOARD_SIDES.RIGHT;
  if (offset < 0) return OUTBOARD_SIDES.LEFT;
  return OUTBOARD_SIDE_NONE;
}

function outboardSign(side) {
  return side === OUTBOARD_SIDES.LEFT ? -1 : 1;
}

/**
 * Whether the wall is holding anything up.
 *
 * Not a geometric property, and nothing here draws it — it is a declaration,
 * and the coordination checks act on it: a load-bearing wall is asked for the
 * support it stands on, and is offered to a slab as one of the members carrying
 * it. Undeclared means non-structural, which is the honest reading of a wall
 * nobody has said anything about.
 */
const STRUCTURAL_ROLES = { NONSTRUCTURAL: 'nonstructural', LOADBEARING: 'loadbearing' };

function structuralRoleOf(wall) {
  return wall?.structuralRole === STRUCTURAL_ROLES.LOADBEARING
    ? STRUCTURAL_ROLES.LOADBEARING
    : STRUCTURAL_ROLES.NONSTRUCTURAL;
}

const ASSEMBLY_SUMMARY = {
  chb: 'CHB masonry',
  fiber_cement: 'Fiber cement',
  plywood: 'Plywood',
  mixed_board: 'Mixed board',
};

/**
 * The wall's vertical fit in one line. A wall that found no beam above it is
 * the case worth flagging — that is almost always a mis-levelled beam rather
 * than a wall that genuinely runs free, so it reads as a warning.
 */
function describeStructureFit(fit, u) {
  if (!fit) return { tone: 'info', text: 'No beam runs along this wall, so it keeps the height above.' };

  const standsOn = fit.supportBeamId ? `Stands on the beam below at ${u.toDisplay(fit.base)} ${u.suffix}. ` : '';
  if (fit.top === null) {
    return {
      tone: 'warning',
      text: `${standsOn}${fit.crossingCount} beam(s) run along this wall but none sit above it — check their Floor Level, it should be the top of the columns.`,
    };
  }
  return {
    tone: 'info',
    text: `${standsOn}Stops at the soffit ${u.toDisplay(fit.top)} ${u.suffix} — clear of the beam above.`,
  };
}

function boardMaterialLabel(material) {
  if (material === WALL_BOARD_MATERIALS.PLYWOOD) return 'Plywood';
  if (material === WALL_BOARD_MATERIALS.FIBER_CEMENT) return 'Fiber cement';
  if (material === WALL_BOARD_MATERIALS.RAINSCREEN) return 'Rainscreen panel';
  return 'No board';
}

export function WallDrawingInput({
  start,
  preview,
  dispatch,
  editorDispatch,
  activeFloorId,
  u,
  selectNewWall,
  wallOptions,
}) {
  const [nsDir, setNsDir] = useState('N');
  const [ewDir, setEwDir] = useState('E');
  const [degrees, setDegrees] = useState('');
  const [minutes, setMinutes] = useState('');
  const [lengthVal, setLengthVal] = useState('');
  const lengthRef = useRef(null);
  const livePreviewLength = preview ? formatMeasurement(wallLength({ start, end: preview })) : '';
  const livePreviewBearing = preview ? formatSurveyorBearing(pointsToSurveyorBearing(start, preview)) : '';

  const handleConfirm = () => {
    const deg = parseInt(degrees, 10) || 0;
    const min = parseInt(minutes, 10) || 0;
    const len = u.fromDisplay(parseFloat(lengthVal) || 0);

    if (len < MIN_WALL_LENGTH) return;
    if (deg < 0 || deg > 90 || min < 0 || min > 59) return;

    const angle = surveyorBearingToSvgAngle(nsDir, deg, min, ewDir);
    const endPt = endpointFromBearing(start, len, angle);
    const wall = createWall(start, endPt, wallOptions?.thickness, wallOptions || {});

    dispatch({ type: 'WALL_ADD', floorId: activeFloorId, wall });
    if (selectNewWall) {
      editorDispatch({ type: 'SELECT_OBJECT', id: wall.id, objectType: 'wall' });
    } else {
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { start: endPt, startAttachment: null, preview: null },
      });
    }

    setDegrees('');
    setMinutes('');
    setLengthVal('');
    setTimeout(() => lengthRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <div>
      {!selectNewWall && (
        <>
          <div className={styles.title}>Drawing Wall</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
            Start: ({u.toDisplay(start.x)}, {u.toDisplay(start.y)}) {u.suffix}
          </div>
        </>
      )}
      {preview && (
        <div className={styles.drawingMeta}>
          Cursor: {livePreviewLength} · {livePreviewBearing}
        </div>
      )}
      <div className={styles.drawingHint}>Hold Shift while drawing to snap the wall bearing to 45° increments.</div>

      <div className={styles.subtitle}>Bearing</div>
      <div className={styles.bearingRow}>
        <select className={styles.bearingSelect} value={nsDir} onChange={(e) => setNsDir(e.target.value)}>
          <option value="N">N</option>
          <option value="S">S</option>
        </select>
        <input
          className={styles.bearingInput}
          type="number"
          min={0}
          max={90}
          placeholder="0"
          value={degrees}
          onChange={(e) => setDegrees(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span className={styles.bearingSymbol}>°</span>
        <input
          className={styles.bearingInput}
          type="number"
          min={0}
          max={59}
          placeholder="0"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span className={styles.bearingSymbol}>′</span>
        <select className={styles.bearingSelect} value={ewDir} onChange={(e) => setEwDir(e.target.value)}>
          <option value="E">E</option>
          <option value="W">W</option>
        </select>
      </div>

      <div className={styles.subtitle}>Length</div>
      <input
        ref={lengthRef}
        className={styles.bearingInput}
        style={{ width: '100%', textAlign: 'left', padding: '0 8px', marginBottom: 'var(--space-sm)' }}
        type="number"
        min={0}
        step={u.step(100)}
        placeholder={`0 ${u.suffix}`}
        value={lengthVal}
        onChange={(e) => setLengthVal(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <button className={styles.confirmBtn} onClick={handleConfirm}>
        Create Wall (Enter)
      </button>
    </div>
  );
}

function WallProperties({ wall, floor, floors, hiddenWallBoards, dispatch, editorDispatch, floorId, u, phases }) {
  const hiddenSides = (hiddenWallBoards || {})[wall.id] || EMPTY_SIDES;
  const len = wallLength(wall);
  const isArc = Boolean(wall.controlPoint);
  // Which side an offset would go to before there is an offset to read it off.
  const [intendedSide, setIntendedSide] = useState(OUTBOARD_SIDE_NONE);
  const heightMode = normalizeWallHeightMode(wall.heightMode);
  const framingMode = normalizeWallFramingMode(wall.framingMode);
  const structuralRole = structuralRoleOf(wall);
  const isBypass = framingMode === WALL_FRAMING_MODES.BYPASS;
  // Whole-building beams: the one capping this wall is often filed on the
  // storey above, and the panel has to report what the fit actually used.
  const structureFit = resolveWallStructureFit(wall, floor, floors || [floor]);
  const clearRun = resolveWallClearRun(wall, floor);
  // What the views will actually draw. For a bypass wall this is the only place
  // the panel can say where the wall runs — its stored height stopped answering.
  const verticalSpan = resolveWallVerticalSpan(wall, floor);
  const assembly = resolveWallAssembly(wall);
  // Only offer to hide a face that actually carries a board — a wall boarded on
  // one side has no meaningful "Both".
  const boardedSides = ['interior', 'exterior'].filter(
    (side) => assembly[side]?.material && assembly[side].material !== WALL_BOARD_MATERIALS.NONE,
  );
  const boardVisibilityOptions = [
    { label: 'None', sides: [] },
    ...boardedSides.map((side) => ({ label: side === 'interior' ? 'Inside' : 'Outside', sides: [side] })),
    ...(boardedSides.length > 1 ? [{ label: 'Both', sides: boardedSides }] : []),
  ];
  const wallOpenings = [
    ...(floor?.doors || []).filter((door) => door.wallId === wall.id).map((door) => ({ ...door, openingKind: 'door' })),
    ...(floor?.windows || [])
      .filter((windowItem) => windowItem.wallId === wall.id)
      .map((windowItem) => ({ ...windowItem, openingKind: 'window' })),
  ];
  // Counted and measured over the run the wall is actually built to: a bypass
  // wall frames its whole resolved span, so quoting its stored height here would
  // put a different frame length on the panel than the one in the bill.
  const framingLayout = deriveWallFramingLayout(
    wall,
    wallOpenings,
    wallFramingLayoutOptions(resolveWallDetailFrame(wall, floor)),
  );

  const updateWall = (updates) => {
    dispatch({ type: 'WALL_UPDATE', floorId, wall: { id: wall.id, ...updates } });
  };

  const outboardOffset = wallOutboardOffset(wall);
  const outboardMagnitude = Math.abs(outboardOffset);
  const outboardSide = outboardOffset === 0 ? intendedSide : outboardSideOf(outboardOffset);
  // Rounded in millimetres before it meets the display unit, so a metre-mode
  // entry of 0.2 is 200 and not 199.99999999999997.
  const setOutboardMagnitude = (displayValue) => {
    const millimetres = Math.max(0, Math.round(u.fromDisplay(displayValue)));
    updateWall({ outboardOffset: outboardSign(outboardSide) * millimetres });
  };
  const setOutboardSide = (side) => {
    setIntendedSide(side);
    // Putting a wall back on its axis is the same act as choosing no side.
    if (side === OUTBOARD_SIDE_NONE) {
      if (outboardOffset !== 0) updateWall({ outboardOffset: 0 });
      return;
    }
    if (outboardMagnitude > 0) updateWall({ outboardOffset: outboardSign(side) * outboardMagnitude });
  };

  // Changing to a board assembly gives up any load-bearing declaration, and
  // that stays true now that the declaration can be made deliberately. What this
  // app generates for a framed wall is a partition — the Framing section says so
  // in as many words — so letting "load-bearing" survive the switch would leave
  // the checks asking a stud partition where its foundation is. Picking the role
  // again afterwards is one control away, and is then a choice rather than a
  // leftover.
  const applyAssembly = (nextAssembly) => {
    updateWall({
      assembly: nextAssembly,
      thickness: wallAssemblyThickness(nextAssembly),
      structuralRole: nextAssembly.system === 'framed' ? STRUCTURAL_ROLES.NONSTRUCTURAL : wall.structuralRole,
    });
  };

  const updateAssembly = (updates) => {
    applyAssembly(createWallAssembly(assembly.preset, { ...assembly, ...updates }, wall.thickness));
  };

  const updateFraming = (updates) => {
    updateAssembly({ framing: { ...assembly.framing, ...updates } });
  };

  const updateBoardLayer = (side, updates) => {
    updateAssembly({ [side]: { ...assembly[side], ...updates } });
  };

  const openWallDetailEditor = (side) => {
    const current = resolveWallDetailing(wall);
    const detailing = createWallDetailing({
      ...current,
      activeSide: side,
      enabled: true,
      sides: {
        interior: {
          ...current.sides.interior,
          enabled: current.sides.interior.enabled || assembly.interior.material !== WALL_BOARD_MATERIALS.NONE,
        },
        exterior: {
          ...current.sides.exterior,
          enabled: current.sides.exterior.enabled || assembly.exterior.material !== WALL_BOARD_MATERIALS.NONE,
        },
      },
    });
    updateWall({ assembly: { ...wall.assembly, detailing } });
    editorDispatch({ type: 'OPEN_WALL_DETAIL_EDITOR', floorId, wallId: wall.id, side });
  };

  // Rounded in millimetres before it meets the display unit, the same rule the
  // outboard offset follows, so a metre-mode 0.15 is 150 and not 149.99999.
  const setBoardOverhang = (side, edge, displayValue) => {
    updateBoardLayer(side, { [edge]: Math.round(u.fromDisplay(displayValue)) });
  };

  /**
   * Where a board stops relative to the wall it is hung on.
   *
   * Two walls meeting at a corner each stop their cladding at their own end,
   * which leaves the joint open and the neighbour's cut edge showing. Running
   * one board past its wall end by the depth the other wall is built to closes
   * it; pulling the other one back by the same amount keeps them from doubling
   * up in the same few millimetres of air.
   */
  const boardOverhangFields = (side, label) => (
    <>
      <NumberField
        label={`${label} overhang start`}
        value={u.toDisplay(assembly[side].overhangStart)}
        step={u.step(10)}
        unit={u.suffix}
        onChange={(v) => setBoardOverhang(side, 'overhangStart', v)}
      />
      <NumberField
        label={`${label} overhang end`}
        value={u.toDisplay(assembly[side].overhangEnd)}
        step={u.step(10)}
        unit={u.suffix}
        onChange={(v) => setBoardOverhang(side, 'overhangEnd', v)}
      />
    </>
  );

  const changeBoardMaterial = (side, material) => {
    updateBoardLayer(side, {
      material,
      thickness: boardDefaultThickness(material),
      layerCount: material === WALL_BOARD_MATERIALS.NONE ? 0 : Math.max(1, assembly[side].layerCount || 1),
    });
  };

  const updateWallLength = (value) => {
    const resizedWall = resizeWallFromStart(wall, u.fromDisplay(value), MIN_WALL_LENGTH);
    const proposal = { id: wall.id, end: resizedWall.end };
    // Pre-flight with the same validator the reducer applies authoritatively —
    // an invalid length shows a toast instead of dispatching a doomed edit.
    if (floor) {
      const verdict = validateWallEdit(floor, proposal);
      if (!verdict.valid) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: describeWallEditRejection(verdict.reason) });
        return;
      }
    }
    updateWall(proposal);
  };

  if (isArc) {
    return (
      <div>
        <div className={styles.title}>Arc Wall (Fillet)</div>
        <PhaseSelector phaseId={wall.phaseId} phases={phases} onChange={(v) => updateWall({ phaseId: v })} />
        <div className={styles.subtitle}>Properties</div>
        <InputField
          label="Thickness"
          type="number"
          suffix={u.suffix}
          step={u.step(10)}
          value={u.toDisplay(wall.thickness)}
          onChange={(v) => updateWall({ thickness: Math.max(50, u.fromDisplay(v)) })}
        />
        <InputField
          label="Height"
          type="number"
          suffix={u.suffix}
          step={u.step(100)}
          value={u.toDisplay(wall.height)}
          onChange={(v) =>
            updateWall({ height: Math.max(100, u.fromDisplay(v)), heightMode: WALL_HEIGHT_MODES.MANUAL })
          }
        />
        <InputField label="Arc Length" type="number" suffix={u.suffix} value={u.toDisplay(len)} readOnly />
        <div className={styles.drawingHint}>
          An arc wall cannot be built off its axis: offsetting a curve changes its radii and its end tangents, so
          outboard facades are straight walls only.
        </div>
      </div>
    );
  }

  const isMasonry = assembly.system === 'masonry';
  const fitMessage = describeStructureFit(structureFit, u);
  // How far the outside of the wall finishes from the line it was drawn on: the
  // offset, plus half the structural core, plus whatever is clad on the outside
  // of it. That last term is what makes this different from the offset itself —
  // the number a setback is actually checked against.
  const exteriorBuildUp = deriveWallAssemblyLayers(assembly).find((layer) => layer.side === 'exterior')?.buildUp || 0;
  const outboardFace = outboardMagnitude + wallAssemblyCoreDepth(assembly) / 2 + exteriorBuildUp;

  return (
    <div className={panelKitStyles.gutter}>
      <PhaseSelector phaseId={wall.phaseId} phases={phases} onChange={(v) => updateWall({ phaseId: v })} />

      {/* What the model did to this wall, before any control it might explain.
          A bypass wall was not fitted to anything, so there is nothing to
          report — the Facade section says where it runs instead. */}
      {heightMode === WALL_HEIGHT_MODES.AUTO && !isBypass && fitMessage ? (
        <Status tone={fitMessage.tone}>{fitMessage.text}</Status>
      ) : null}

      <Section id="wall.size" title="Size" summary={`${u.toDisplay(len)} × ${u.toDisplay(wall.height)}`}>
        <NumberField
          label="Length"
          value={u.toDisplay(len)}
          step={u.step(100)}
          unit={u.suffix}
          onChange={updateWallLength}
        />
        <NumberField
          label="Height"
          value={u.toDisplay(wall.height)}
          step={u.step(100)}
          unit={u.suffix}
          onChange={(v) =>
            updateWall({ height: Math.max(100, u.fromDisplay(v)), heightMode: WALL_HEIGHT_MODES.MANUAL })
          }
        />
        <SelectField
          label="Top"
          value={heightMode}
          disabled={isBypass}
          onChange={(value) => updateWall({ heightMode: value })}
        >
          <option value={WALL_HEIGHT_MODES.AUTO}>Fit under beam</option>
          <option value={WALL_HEIGHT_MODES.MANUAL}>Fixed height</option>
        </SelectField>
        {isBypass ? (
          <Hint>
            A bypass wall runs past the beams by definition, so neither the top fit nor the height above places it. See
            Runs from / to under Facade.
          </Hint>
        ) : null}
        {clearRun?.trimmed ? (
          <>
            <Readout label="Clear run" value={u.toDisplay(clearRun.length)} unit={u.suffix} />
            <Hint>Built length, column face to column face. Length above is centreline.</Hint>
          </>
        ) : null}
        <Readout label="Built thickness" value={u.toDisplay(wallAssemblyThickness(assembly))} unit={u.suffix} />
      </Section>

      {/* Where the wall is BUILT, as opposed to where it is drawn. The axis
          stays on the grid line the structure is dimensioned to; the body can
          stand off it. */}
      <Section
        id="wall.facade"
        title="Facade"
        // A wall on its axis and framed the ordinary way has nothing here worth
        // unfolding; one that is offset or bypassing opens, because this section
        // is then the reason its plan does not match its grid line or its
        // elevation does not stop at the floor.
        defaultOpen={outboardMagnitude > 0 || isBypass}
        summary={outboardMagnitude ? `${u.toDisplay(outboardMagnitude)} ${u.suffix} ${outboardSide}` : 'On the axis'}
      >
        <NumberField
          label="Offset from axis"
          value={u.toDisplay(outboardMagnitude)}
          step={u.step(25)}
          unit={u.suffix}
          min={0}
          onChange={setOutboardMagnitude}
        />
        <SelectField label="Side" value={outboardSide} onChange={setOutboardSide}>
          <option value={OUTBOARD_SIDE_NONE}>On the axis</option>
          <option value={OUTBOARD_SIDES.LEFT}>Left of start → end</option>
          <option value={OUTBOARD_SIDES.RIGHT}>Right of start → end</option>
        </SelectField>
        <Readout label="Outboard face" value={u.toDisplay(Math.round(outboardFace))} unit={u.suffix} />
        <Hint>
          Measured from the drawn axis to the outside of the exterior skin. Left and right are read looking from the
          wall start point toward its end point; with no side picked, an offset goes to the right.
        </Hint>

        <SelectField label="Framing" value={framingMode} onChange={(value) => updateWall({ framingMode: value })}>
          <option value={WALL_FRAMING_MODES.PLATFORM}>Platform (on the slab)</option>
          <option value={WALL_FRAMING_MODES.BYPASS}>Bypass (past the slab)</option>
        </SelectField>

        {/* The other thing this wall's relationship to the structure turns on,
            and the one nothing could set until now. */}
        <SelectField
          label="Structural role"
          value={structuralRole}
          onChange={(value) => updateWall({ structuralRole: value })}
        >
          <option value={STRUCTURAL_ROLES.NONSTRUCTURAL}>Non-structural</option>
          <option value={STRUCTURAL_ROLES.LOADBEARING}>Load-bearing</option>
        </SelectField>
        <Hint>
          {structuralRole === STRUCTURAL_ROLES.LOADBEARING
            ? 'Load-bearing walls are asked for the member or foundation they stand on, and are offered to a slab as one of its supports. Choosing a board assembly resets this to non-structural.'
            : 'Declare a wall load-bearing only if it carries something. Choosing a board assembly resets this to non-structural.'}
        </Hint>
        {isBypass ? (
          <>
            <Readout
              label="Runs from / to"
              value={`${u.toDisplay(Math.round(verticalSpan.base))} → ${u.toDisplay(Math.round(verticalSpan.top))}`}
              unit={u.suffix}
            />
            <Hint>
              Starts {u.toDisplay(Math.round(verticalSpan.drop))} {u.suffix} below this floor — the depth of the
              structure it crosses — and finishes level with the floor above, so the storey below shows no line across
              the facade.
            </Hint>
          </>
        ) : null}
      </Section>

      <Section id="wall.assembly" title="Assembly" summary={ASSEMBLY_SUMMARY[assembly.preset] || assembly.preset}>
        <SelectField
          label="Assembly"
          value={assembly.preset}
          onChange={(preset) => applyAssembly(createWallAssembly(preset, {}, wall.thickness))}
        >
          <option value={WALL_ASSEMBLY_PRESETS.CHB}>CHB masonry</option>
          <option value={WALL_ASSEMBLY_PRESETS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
          <option value={WALL_ASSEMBLY_PRESETS.PLYWOOD}>Plywood</option>
          <option value={WALL_ASSEMBLY_PRESETS.MIXED_BOARD}>Mixed board wall</option>
        </SelectField>
        {isMasonry ? (
          <NumberField
            label="CHB core"
            value={u.toDisplay(assembly.coreThickness)}
            step={u.step(10)}
            unit={u.suffix}
            onChange={(v) => updateAssembly({ coreThickness: Math.max(50, u.fromDisplay(v)) })}
          />
        ) : (
          <>
            <SelectField
              label="Inside side"
              value={assembly.interiorSide}
              onChange={(interiorSide) => updateAssembly({ interiorSide })}
            >
              <option value={WALL_INTERIOR_SIDES.LEFT}>Left of start → end</option>
              <option value={WALL_INTERIOR_SIDES.RIGHT}>Right of start → end</option>
            </SelectField>
            <Stack>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() =>
                  updateAssembly({
                    interiorSide:
                      assembly.interiorSide === WALL_INTERIOR_SIDES.LEFT
                        ? WALL_INTERIOR_SIDES.RIGHT
                        : WALL_INTERIOR_SIDES.LEFT,
                  })
                }
              >
                Flip Inside / Outside
              </button>
            </Stack>
            <Hint>Inside is measured while looking from the wall start point toward its end point.</Hint>

            <SelectField
              label="Inside board"
              value={assembly.interior.material}
              onChange={(material) => changeBoardMaterial('interior', material)}
            >
              <option value={WALL_BOARD_MATERIALS.NONE}>None</option>
              <option value={WALL_BOARD_MATERIALS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
              <option value={WALL_BOARD_MATERIALS.PLYWOOD}>Plywood</option>
              <option value={WALL_BOARD_MATERIALS.RAINSCREEN}>Rainscreen panel</option>
            </SelectField>
            {assembly.interior.material !== WALL_BOARD_MATERIALS.NONE ? (
              <>
                <NumberField
                  label="Inside thick."
                  value={u.toDisplay(assembly.interior.thickness)}
                  step={u.step(1)}
                  unit={u.suffix}
                  onChange={(v) => updateBoardLayer('interior', { thickness: Math.max(1, u.fromDisplay(v)) })}
                />
                <NumberField
                  label="Inside layers"
                  value={assembly.interior.layerCount}
                  step={1}
                  onChange={(v) => updateBoardLayer('interior', { layerCount: clampLayers(v) })}
                />
                {boardOverhangFields('interior', 'Inside')}
              </>
            ) : null}
            <SelectField
              label="Outside board"
              value={assembly.exterior.material}
              onChange={(material) => changeBoardMaterial('exterior', material)}
            >
              <option value={WALL_BOARD_MATERIALS.NONE}>None</option>
              <option value={WALL_BOARD_MATERIALS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
              <option value={WALL_BOARD_MATERIALS.PLYWOOD}>Plywood</option>
              <option value={WALL_BOARD_MATERIALS.RAINSCREEN}>Rainscreen panel</option>
            </SelectField>
            {assembly.exterior.material !== WALL_BOARD_MATERIALS.NONE ? (
              <>
                <NumberField
                  label="Outside thick."
                  value={u.toDisplay(assembly.exterior.thickness)}
                  step={u.step(1)}
                  unit={u.suffix}
                  onChange={(v) => updateBoardLayer('exterior', { thickness: Math.max(1, u.fromDisplay(v)) })}
                />
                <NumberField
                  label="Outside layers"
                  value={assembly.exterior.layerCount}
                  step={1}
                  onChange={(v) => updateBoardLayer('exterior', { layerCount: clampLayers(v) })}
                />
                {boardOverhangFields('exterior', 'Outside')}
              </>
            ) : null}
            {assembly.interior.material !== WALL_BOARD_MATERIALS.NONE ||
            assembly.exterior.material !== WALL_BOARD_MATERIALS.NONE ? (
              <Hint>
                Overhang runs the board past the wall end — usually by the built depth of the wall it meets — so the
                corner closes instead of showing the neighbour&apos;s cut edge. A negative value sets the board back
                instead, which is what the wall being lapped wants. Framing never follows: this is cladding only.
              </Hint>
            ) : null}
            <Stack>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => openWallDetailEditor(WALL_DETAIL_SIDES.INTERIOR)}
              >
                Design Inside Face — {boardMaterialLabel(assembly.interior.material)}
              </button>
            </Stack>
            <Stack>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => openWallDetailEditor(WALL_DETAIL_SIDES.EXTERIOR)}
              >
                Design Outside Face — {boardMaterialLabel(assembly.exterior.material)}
              </button>
            </Stack>
          </>
        )}
      </Section>

      {isMasonry ? null : (
        <Section
          id="wall.framing"
          title="Framing"
          defaultOpen={false}
          summary={`${framingLayout.studCount} studs @ ${u.toDisplay(assembly.framing.spacing)}`}
        >
          <SelectField
            label="Frame"
            value={assembly.framing.material}
            onChange={(material) => updateFraming({ material })}
          >
            <option value={WALL_FRAME_MATERIALS.LIGHT_GAUGE_STEEL}>Light-gauge steel</option>
            <option value={WALL_FRAME_MATERIALS.TIMBER}>Timber</option>
          </SelectField>
          <NumberField
            label="Stud spacing"
            value={u.toDisplay(assembly.framing.spacing)}
            step={u.step(50)}
            unit={u.suffix}
            onChange={(v) => updateFraming({ spacing: Math.max(100, u.fromDisplay(v)) })}
          />
          <NumberField
            label="Stud width"
            value={u.toDisplay(assembly.framing.studWidth)}
            step={u.step(5)}
            unit={u.suffix}
            onChange={(v) => updateFraming({ studWidth: Math.max(20, u.fromDisplay(v)) })}
          />
          <NumberField
            label="Frame depth"
            value={u.toDisplay(assembly.framing.studDepth)}
            step={u.step(5)}
            unit={u.suffix}
            onChange={(v) => updateFraming({ studDepth: Math.max(25, u.fromDisplay(v)) })}
          />
          <NumberField
            label="Layout offset"
            value={u.toDisplay(assembly.framing.startOffset)}
            step={u.step(10)}
            unit={u.suffix}
            onChange={(v) => updateFraming({ startOffset: Math.max(0, u.fromDisplay(v)) })}
          />
          <SelectField
            label="Frame rows"
            value={String(assembly.framing.frameCount)}
            onChange={(value) => updateFraming({ frameCount: Number(value) })}
          >
            <option value="1">Single frame</option>
            <option value="2">Double-stud wall</option>
          </SelectField>
          {assembly.framing.frameCount === 2 ? (
            <NumberField
              label="Frame gap"
              value={u.toDisplay(assembly.framing.frameGap)}
              step={u.step(5)}
              unit={u.suffix}
              onChange={(v) => updateFraming({ frameGap: Math.max(0, u.fromDisplay(v)) })}
            />
          ) : null}
          <NumberField
            label="Noggin rows"
            value={assembly.framing.nogginRows}
            step={1}
            onChange={(v) => updateFraming({ nogginRows: Math.max(0, Math.min(6, Math.round(v))) })}
          />
          <Readout label="Stud count" value={framingLayout.studCount} />
          <Readout label="Frame length" value={(framingLayout.totalLinearLengthMm / 1000).toFixed(2)} unit="m" />
          <Note label="Nonstructural partition — review required">
            Board framing is modeled and quantified as a nonstructural partition. Member capacity, fixings, bracing,
            fire resistance, moisture exposure, and product-specific spacing still require professional confirmation.
          </Note>
        </Section>
      )}

      {isMasonry ? null : (
        <Section
          id="wall.preview"
          title="3D view"
          defaultOpen={false}
          summary={hiddenSides.length ? `${hiddenSides.length} face hidden` : 'Fully clad'}
        >
          {boardedSides.length ? (
            <>
              <Stack>
                <div className={styles.segmentControl}>
                  {boardVisibilityOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={sameSides(option.sides, hiddenSides) ? styles.segmentBtnActive : styles.segmentBtn}
                      onClick={() =>
                        editorDispatch({
                          type: 'SET_WALL_BOARD_VISIBILITY',
                          wallId: wall.id,
                          hiddenSides: option.sides,
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Stack>
              <Hint>
                {hiddenSides.length
                  ? 'Stripped in the 3D preview only — the framing behind is exposed. Drawings and quantities are unaffected.'
                  : 'Strip a face to check the framing behind it. The other side stays clad.'}
              </Hint>
            </>
          ) : (
            <Hint>This wall has no boards, so its framing is already exposed in 3D.</Hint>
          )}
        </Section>
      )}

      <Section
        id="wall.position"
        title="Position"
        defaultOpen={false}
        summary={`${u.toDisplay(wall.start.x)}, ${u.toDisplay(wall.start.y)}`}
      >
        <NumberField
          label="Start X"
          value={u.toDisplay(wall.start.x)}
          unit={u.suffix}
          onChange={(v) => updateWall({ start: { ...wall.start, x: u.fromDisplay(v) } })}
        />
        <NumberField
          label="Start Y"
          value={u.toDisplay(wall.start.y)}
          unit={u.suffix}
          onChange={(v) => updateWall({ start: { ...wall.start, y: u.fromDisplay(v) } })}
        />
        <NumberField
          label="End X"
          value={u.toDisplay(wall.end.x)}
          unit={u.suffix}
          onChange={(v) => updateWall({ end: { ...wall.end, x: u.fromDisplay(v) } })}
        />
        <NumberField
          label="End Y"
          value={u.toDisplay(wall.end.y)}
          unit={u.suffix}
          onChange={(v) => updateWall({ end: { ...wall.end, y: u.fromDisplay(v) } })}
        />
      </Section>

      <Section id="wall.continue" title="Continue from end" defaultOpen={false}>
        <WallDrawingInput
          start={wall.end}
          dispatch={dispatch}
          editorDispatch={editorDispatch}
          activeFloorId={floorId}
          u={u}
          selectNewWall
          wallOptions={{ assembly, thickness: wallAssemblyThickness(assembly), height: wall.height }}
        />
      </Section>
    </div>
  );
}

export default memo(WallProperties);
