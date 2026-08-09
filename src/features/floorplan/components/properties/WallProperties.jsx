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
  createWallAssembly,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallAssemblyThickness,
} from '@/domain/wallAssemblies';
import { WALL_DETAIL_SIDES, createWallDetailing, resolveWallDetailing } from '@/domain/wallDetailing';
import {
  WALL_HEIGHT_MODES,
  normalizeWallHeightMode,
  resolveWallClearRun,
  resolveWallStructureFit,
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
  const heightMode = normalizeWallHeightMode(wall.heightMode);
  // Whole-building beams: the one capping this wall is often filed on the
  // storey above, and the panel has to report what the fit actually used.
  const structureFit = resolveWallStructureFit(wall, floor, floors || [floor]);
  const clearRun = resolveWallClearRun(wall, floor);
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
  const framingLayout = deriveWallFramingLayout(wall, wallOpenings);

  const updateWall = (updates) => {
    dispatch({ type: 'WALL_UPDATE', floorId, wall: { id: wall.id, ...updates } });
  };

  const applyAssembly = (nextAssembly) => {
    updateWall({
      assembly: nextAssembly,
      thickness: wallAssemblyThickness(nextAssembly),
      structuralRole: nextAssembly.system === 'framed' ? 'nonstructural' : wall.structuralRole,
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

  const changeBoardMaterial = (side, material) => {
    updateBoardLayer(side, {
      material,
      thickness:
        material === WALL_BOARD_MATERIALS.PLYWOOD ? 12 : material === WALL_BOARD_MATERIALS.FIBER_CEMENT ? 6 : 0,
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
      </div>
    );
  }

  const isMasonry = assembly.system === 'masonry';
  const fitMessage = describeStructureFit(structureFit, u);

  return (
    <div className={panelKitStyles.gutter}>
      <PhaseSelector phaseId={wall.phaseId} phases={phases} onChange={(v) => updateWall({ phaseId: v })} />

      {/* What the model did to this wall, before any control it might explain. */}
      {heightMode === WALL_HEIGHT_MODES.AUTO && fitMessage ? (
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
        <SelectField label="Top" value={heightMode} onChange={(value) => updateWall({ heightMode: value })}>
          <option value={WALL_HEIGHT_MODES.AUTO}>Fit under beam</option>
          <option value={WALL_HEIGHT_MODES.MANUAL}>Fixed height</option>
        </SelectField>
        {clearRun?.trimmed ? (
          <>
            <Readout label="Clear run" value={u.toDisplay(clearRun.length)} unit={u.suffix} />
            <Hint>Built length, column face to column face. Length above is centreline.</Hint>
          </>
        ) : null}
        <Readout label="Built thickness" value={u.toDisplay(wallAssemblyThickness(assembly))} unit={u.suffix} />
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
              </>
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
