import { memo, useRef, useState } from 'react';
import { formatMeasurement } from '@/annotations/format';
import { MIN_WALL_LENGTH } from '@/domain/defaults';
import { describeWallEditRejection, validateWallEdit } from '@/domain/modelGraph';
import { resizeWallFromStart, wallLength } from '@/geometry/wallGeometry';
import { createWall } from '@/domain/models';
import {
  formatSurveyorBearing,
  pointsToSurveyorBearing,
  surveyorBearingToSvgAngle,
  endpointFromBearing,
} from '@/geometry/bearing';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

export function WallDrawingInput({ start, preview, dispatch, editorDispatch, activeFloorId, u, selectNewWall }) {
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
    const wall = createWall(start, endPt);

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

  const updateWall = (updates) => {
    dispatch({ type: 'WALL_UPDATE', floorId, wall: { id: wall.id, ...updates } });
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
      />
    </div>
  );
}

export default memo(WallProperties);
