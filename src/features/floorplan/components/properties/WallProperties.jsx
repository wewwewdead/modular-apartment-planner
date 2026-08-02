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
  formatSurveyorBearing,
  pointsToSurveyorBearing,
  surveyorBearingToSvgAngle,
  endpointFromBearing,
} from '@/geometry/bearing';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

const selectStyle = {
  flex: 1,
  height: '28px',
  padding: '0 4px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '12px',
  background: 'var(--color-surface-elevated)',
};

function PropertySelect({ label, value, onChange, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <label style={{ flex: '0 0 92px', fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
        {children}
      </select>
    </div>
  );
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

function WallProperties({ wall, floor, dispatch, editorDispatch, floorId, u, phases }) {
  const len = wallLength(wall);
  const isArc = Boolean(wall.controlPoint);
  const assembly = resolveWallAssembly(wall);
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
          onChange={(v) => updateWall({ height: Math.max(100, u.fromDisplay(v)) })}
        />
        <InputField label="Arc Length" type="number" suffix={u.suffix} value={u.toDisplay(len)} readOnly />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.title}>Wall</div>
      <PhaseSelector phaseId={wall.phaseId} phases={phases} onChange={(v) => updateWall({ phaseId: v })} />
      <div className={styles.subtitle}>Start Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(wall.start.x)}
        onChange={(v) => updateWall({ start: { ...wall.start, x: u.fromDisplay(v) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(wall.start.y)}
        onChange={(v) => updateWall({ start: { ...wall.start, y: u.fromDisplay(v) } })}
      />
      <div className={styles.subtitle}>End Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(wall.end.x)}
        onChange={(v) => updateWall({ end: { ...wall.end, x: u.fromDisplay(v) } })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(wall.end.y)}
        onChange={(v) => updateWall({ end: { ...wall.end, y: u.fromDisplay(v) } })}
      />
      <div className={styles.subtitle}>Properties</div>
      <PropertySelect
        label="Assembly"
        value={assembly.preset}
        onChange={(preset) => applyAssembly(createWallAssembly(preset, {}, wall.thickness))}
      >
        <option value={WALL_ASSEMBLY_PRESETS.CHB}>CHB masonry</option>
        <option value={WALL_ASSEMBLY_PRESETS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
        <option value={WALL_ASSEMBLY_PRESETS.PLYWOOD}>Plywood</option>
        <option value={WALL_ASSEMBLY_PRESETS.MIXED_BOARD}>Mixed board wall</option>
      </PropertySelect>
      {assembly.system === 'masonry' ? (
        <InputField
          label="CHB core"
          type="number"
          suffix={u.suffix}
          step={u.step(10)}
          value={u.toDisplay(assembly.coreThickness)}
          onChange={(v) => updateAssembly({ coreThickness: Math.max(50, u.fromDisplay(v)) })}
        />
      ) : (
        <>
          <PropertySelect
            label="Inside side"
            value={assembly.interiorSide}
            onChange={(interiorSide) => updateAssembly({ interiorSide })}
          >
            <option value={WALL_INTERIOR_SIDES.LEFT}>Left of start → end</option>
            <option value={WALL_INTERIOR_SIDES.RIGHT}>Right of start → end</option>
          </PropertySelect>
          <button
            type="button"
            className={styles.confirmBtn}
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
          <div className={styles.drawingHint}>
            Inside is measured while looking from the wall start point toward its end point.
          </div>
          <PropertySelect
            label="Inside board"
            value={assembly.interior.material}
            onChange={(material) => changeBoardMaterial('interior', material)}
          >
            <option value={WALL_BOARD_MATERIALS.NONE}>None</option>
            <option value={WALL_BOARD_MATERIALS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
            <option value={WALL_BOARD_MATERIALS.PLYWOOD}>Plywood</option>
          </PropertySelect>
          {assembly.interior.material !== WALL_BOARD_MATERIALS.NONE ? (
            <>
              <InputField
                label="Inside board thick."
                type="number"
                suffix={u.suffix}
                step={u.step(1)}
                value={u.toDisplay(assembly.interior.thickness)}
                onChange={(v) => updateBoardLayer('interior', { thickness: Math.max(1, u.fromDisplay(v)) })}
              />
              <InputField
                label="Inside layers"
                type="number"
                step={1}
                value={assembly.interior.layerCount}
                onChange={(v) => updateBoardLayer('interior', { layerCount: Math.max(1, Math.min(4, Math.round(v))) })}
              />
            </>
          ) : null}
          <PropertySelect
            label="Outside board"
            value={assembly.exterior.material}
            onChange={(material) => changeBoardMaterial('exterior', material)}
          >
            <option value={WALL_BOARD_MATERIALS.NONE}>None</option>
            <option value={WALL_BOARD_MATERIALS.FIBER_CEMENT}>HardieFlex / fiber cement</option>
            <option value={WALL_BOARD_MATERIALS.PLYWOOD}>Plywood</option>
          </PropertySelect>
          {assembly.exterior.material !== WALL_BOARD_MATERIALS.NONE ? (
            <>
              <InputField
                label="Outside board thick."
                type="number"
                suffix={u.suffix}
                step={u.step(1)}
                value={u.toDisplay(assembly.exterior.thickness)}
                onChange={(v) => updateBoardLayer('exterior', { thickness: Math.max(1, u.fromDisplay(v)) })}
              />
              <InputField
                label="Outside layers"
                type="number"
                step={1}
                value={assembly.exterior.layerCount}
                onChange={(v) => updateBoardLayer('exterior', { layerCount: Math.max(1, Math.min(4, Math.round(v))) })}
              />
            </>
          ) : null}
          <PropertySelect
            label="Frame"
            value={assembly.framing.material}
            onChange={(material) => updateFraming({ material })}
          >
            <option value={WALL_FRAME_MATERIALS.LIGHT_GAUGE_STEEL}>Light-gauge steel</option>
            <option value={WALL_FRAME_MATERIALS.TIMBER}>Timber</option>
          </PropertySelect>
          <InputField
            label="Stud spacing"
            type="number"
            suffix={u.suffix}
            step={u.step(50)}
            value={u.toDisplay(assembly.framing.spacing)}
            onChange={(v) => updateFraming({ spacing: Math.max(100, u.fromDisplay(v)) })}
          />
          <InputField
            label="Stud width"
            type="number"
            suffix={u.suffix}
            step={u.step(5)}
            value={u.toDisplay(assembly.framing.studWidth)}
            onChange={(v) => updateFraming({ studWidth: Math.max(20, u.fromDisplay(v)) })}
          />
          <InputField
            label="Layout offset"
            type="number"
            suffix={u.suffix}
            step={u.step(10)}
            value={u.toDisplay(assembly.framing.startOffset)}
            onChange={(v) => updateFraming({ startOffset: Math.max(0, u.fromDisplay(v)) })}
          />
          <InputField
            label="Frame depth"
            type="number"
            suffix={u.suffix}
            step={u.step(5)}
            value={u.toDisplay(assembly.framing.studDepth)}
            onChange={(v) => updateFraming({ studDepth: Math.max(25, u.fromDisplay(v)) })}
          />
          <PropertySelect
            label="Frame rows"
            value={String(assembly.framing.frameCount)}
            onChange={(value) => updateFraming({ frameCount: Number(value) })}
          >
            <option value="1">Single frame</option>
            <option value="2">Double-stud wall</option>
          </PropertySelect>
          {assembly.framing.frameCount === 2 ? (
            <InputField
              label="Frame gap"
              type="number"
              suffix={u.suffix}
              step={u.step(5)}
              value={u.toDisplay(assembly.framing.frameGap)}
              onChange={(v) => updateFraming({ frameGap: Math.max(0, u.fromDisplay(v)) })}
            />
          ) : null}
          <InputField
            label="Noggin rows"
            type="number"
            step={1}
            value={assembly.framing.nogginRows}
            onChange={(v) => updateFraming({ nogginRows: Math.max(0, Math.min(6, Math.round(v))) })}
          />
          <InputField label="Stud count" value={framingLayout.studCount} readOnly />
          <InputField
            label="Frame length"
            suffix="m"
            value={(framingLayout.totalLinearLengthMm / 1000).toFixed(2)}
            readOnly
          />
          <div className={styles.drawingHint}>
            Board framing is modeled and quantified as a nonstructural partition. Member capacity, fixings, bracing,
            fire resistance, moisture exposure, and product-specific spacing still require professional confirmation.
          </div>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={() => openWallDetailEditor(WALL_DETAIL_SIDES.INTERIOR)}
          >
            Design Inside Face — {boardMaterialLabel(assembly.interior.material)}
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={() => openWallDetailEditor(WALL_DETAIL_SIDES.EXTERIOR)}
          >
            Design Outside Face — {boardMaterialLabel(assembly.exterior.material)}
          </button>
        </>
      )}
      <InputField
        label="Built thickness"
        suffix={u.suffix}
        value={u.toDisplay(wallAssemblyThickness(assembly))}
        readOnly
      />
      <InputField
        label="Height"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(wall.height)}
        onChange={(v) => updateWall({ height: Math.max(100, u.fromDisplay(v)) })}
      />
      <InputField
        label="Length"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(len)}
        onChange={updateWallLength}
      />
      <div className={styles.subtitle}>Continue from End</div>
      <WallDrawingInput
        start={wall.end}
        dispatch={dispatch}
        editorDispatch={editorDispatch}
        activeFloorId={floorId}
        u={u}
        selectNewWall
        wallOptions={{ assembly, thickness: wallAssemblyThickness(assembly), height: wall.height }}
      />
    </div>
  );
}

export default memo(WallProperties);
