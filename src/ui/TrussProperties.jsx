import InputField from './InputField';
import styles from './PropertiesPanel.module.css';
import { useEditor } from '@/app/EditorProvider';
import PhaseSelector from './PhaseSelector';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import { buildTrussSystemGeometry, getTrussSystemPurlinTotalLength } from '@/geometry/trussGeometry';
import { distance } from '@/geometry/point';
import { getFloorTopElevation, getOrderedFloors } from '@/domain/floorModels';
import {
  detachBeamSupportedTrussInstances,
  getDefaultTrussTypes,
  resolveTrussType,
  TRUSS_MATERIALS,
  TRUSS_SUPPORT_MODES,
} from '@/domain/trussModels';
import { TOOLS } from '@/editor/tools';
import { deriveBeamSupportedInstanceGeometry, getBeamSupportCountLimit } from '@/truss/beamSupports';
import { resolveTrussSystemRoofAttachmentType } from '@/truss/roofAttachment';
import {
  MIN_TRUSS_SYSTEM_LENGTH,
  normalizePlanLengthScale,
  normalizePlanOffset,
  normalizeRotationDegrees,
} from '@/truss/systemTransform';

function formatMaterialLabel(material) {
  return material ? material.charAt(0).toUpperCase() + material.slice(1) : '';
}

function formatShapeLabel(shape) {
  return String(shape || '')
    .split('_')
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : '')
    .join(' ');
}

function formatRoofMappingLabel(roofAttachmentType, hasMixedTypes = false) {
  if (hasMixedTypes) return 'Mixed / Unsupported';
  if (!roofAttachmentType) return 'Unsupported';
  return roofAttachmentType.charAt(0).toUpperCase() + roofAttachmentType.slice(1);
}

function startTrussDraw(editorDispatch, floorId, trussTypeId, trussMaterial, targetTrussSystemId = null) {
  editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'truss' });
  if (floorId) {
    editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId });
  }
  editorDispatch({ type: 'SET_VIEW_MODE', viewMode: 'plan' });
  editorDispatch({ type: 'SET_TOOL', tool: TOOLS.TRUSS_DRAW });
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      trussTypeId,
      trussMaterial,
      targetTrussSystemId,
    },
  });
  editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Select two support beams to create a truss.' });
}

function resolveSupportBeamLabel(project, floorId, beamId) {
  if (!beamId) return 'None';

  const floor = (project?.floors || []).find((entry) => entry.id === floorId) || null;
  const beam = (floor?.beams || []).find((entry) => entry.id === beamId) || null;
  if (!floor || !beam) {
    return 'Missing beam';
  }
  return getBeamDisplayLabel(beam, floor.columns || []);
}

function offsetsDiffer(a, b) {
  return Math.abs((a?.x || 0) - (b?.x || 0)) > 1e-6 || Math.abs((a?.y || 0) - (b?.y || 0)) > 1e-6;
}

export function TrussEmptyState({ project, activeFloorId, editorDispatch }) {
  const { toolState } = useEditor();
  const floors = getOrderedFloors(project);
  const trussTypes = getDefaultTrussTypes();
  const activeTrussTypeId = toolState.trussTypeId || trussTypes[0]?.id || '';
  const activeTrussMaterial = toolState.trussMaterial
    || resolveTrussType(activeTrussTypeId, trussTypes).material
    || TRUSS_MATERIALS[0];

  return (
    <div>
      <div className={styles.title}>Truss</div>
      <div className={styles.drawingHint}>
        Trusses stay in their own module. Draw them only by selecting two beams on the target floor.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Floor</label>
        <select
          value={activeFloorId || ''}
          onChange={(e) => editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId: e.target.value || null })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>{floor.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Type</label>
        <select
          value={activeTrussTypeId}
          onChange={(e) => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { trussTypeId: e.target.value } })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {trussTypes.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Material</label>
        <select
          value={activeTrussMaterial}
          onChange={(e) => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { trussMaterial: e.target.value } })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {TRUSS_MATERIALS.map((entry) => (
            <option key={entry} value={entry}>{formatMaterialLabel(entry)}</option>
          ))}
        </select>
      </div>
      <button
        className={styles.actionBtn}
        onClick={() => startTrussDraw(editorDispatch, activeFloorId, activeTrussTypeId, activeTrussMaterial, null)}
      >
        Draw truss above beams
      </button>
    </div>
  );
}

export function TrussSystemProperties({
  project,
  trussSystem,
  dispatch,
  editorDispatch,
  u,
  phases = [],
  isHiddenByPhase = false,
  activePhaseName = null,
  phaseViewMode = 'all',
}) {
  const { activeTool, toolState } = useEditor();
  const floors = getOrderedFloors(project);
  const roofSystem = project.roofSystem || null;
  const attachedRoofId = roofSystem?.trussAttachmentId === trussSystem.id ? roofSystem.id : null;
  const trussTypes = getDefaultTrussTypes();
  const lastInstance = trussSystem.trussInstances?.[trussSystem.trussInstances.length - 1] || null;
  const activeTrussTypeId = toolState.trussTypeId || lastInstance?.trussTypeId || trussTypes[0]?.id || '';
  const activeTrussMaterial = toolState.trussMaterial
    || lastInstance?.material
    || resolveTrussType(activeTrussTypeId, trussTypes).material
    || TRUSS_MATERIALS[0];
  const baseElevationLocked = (trussSystem.trussInstances || []).some((instance) => (
    instance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
  ));
  const purlinSystem = trussSystem.purlinSystem || {};
  const roofAttachmentType = resolveTrussSystemRoofAttachmentType(trussSystem, trussTypes);
  const hasMixedRoofMapping = (trussSystem.trussInstances || []).length > 1 && !roofAttachmentType;
  const systemGeometry = buildTrussSystemGeometry(trussSystem);
  const systemTransform = systemGeometry.transform || {};
  const planOffset = normalizePlanOffset(trussSystem.planOffset);
  const canResizeSystem = Boolean(systemTransform.resizable);
  const systemLength = Number(systemTransform.currentLength || 0);
  const purlinTotalLength = getTrussSystemPurlinTotalLength(systemGeometry);

  const updateSystem = (updates) => {
    dispatch({ type: 'TRUSS_SYSTEM_UPDATE', trussSystem: { id: trussSystem.id, ...updates } });
  };

  const updateSystemTransform = (updates) => {
    const nextOffset = Object.prototype.hasOwnProperty.call(updates, 'planOffset')
      ? normalizePlanOffset(updates.planOffset)
      : planOffset;
    const nextLengthScale = Object.prototype.hasOwnProperty.call(updates, 'planLengthScale')
      ? normalizePlanLengthScale(updates.planLengthScale)
      : normalizePlanLengthScale(trussSystem.planLengthScale);
    const transformChanged = (
      offsetsDiffer(planOffset, nextOffset)
      || Math.abs(nextLengthScale - normalizePlanLengthScale(trussSystem.planLengthScale)) > 1e-6
    );

    updateSystem({
      ...updates,
      ...(transformChanged
        ? { trussInstances: detachBeamSupportedTrussInstances(trussSystem.trussInstances || []) }
        : {}),
    });
  };

  const updatePurlins = (updates) => {
    updateSystem({
      purlinSystem: {
        ...purlinSystem,
        ...updates,
      },
    });
  };

  const setAsRoofSource = () => {
    if (!roofSystem) return;
    dispatch({
      type: 'ROOF_UPDATE',
      roofSystem: {
        id: roofSystem.id,
        trussAttachmentId: trussSystem.id,
      },
    });
  };

  return (
    <div>
      <div className={styles.title}>Truss System</div>
      {isHiddenByPhase && (
        <div className={styles.drawingHint}>
          Truss geometry is hidden in the current phase view{activePhaseName ? ` (${activePhaseName}, ${phaseViewMode})` : ''}, but you can still reassign its phase here.
        </div>
      )}
      <PhaseSelector
        phaseId={trussSystem.phaseId}
        phases={phases}
        onChange={(value) => updateSystem({ phaseId: value })}
      />
      <InputField
        label="Name"
        value={trussSystem.name}
        onChange={(value) => updateSystem({ name: value })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Floor</label>
        <select
          value={trussSystem.floorId || ''}
          onChange={(e) => {
            const floorId = e.target.value || null;
            const floor = floors.find((entry) => entry.id === floorId) || null;
            updateSystem({
              floorId,
              baseElevation: floor ? getFloorTopElevation(floor) : trussSystem.baseElevation,
            });
            if (floorId) {
              editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId });
            }
          }}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>{floor.name}</option>
          ))}
        </select>
      </div>
      <InputField
        label="Base Elev."
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(trussSystem.baseElevation || 0)}
        readOnly={baseElevationLocked}
        onChange={(value) => updateSystem({ baseElevation: u.fromDisplay(value) })}
      />
      <InputField
        label="Instances"
        value={(trussSystem.trussInstances || []).length}
        readOnly
      />
      <InputField
        label="Rotation"
        type="number"
        suffix="°"
        step={1}
        value={Number(trussSystem.planRotationOffsetDegrees || 0).toFixed(1)}
        onChange={(value) => updateSystem({ planRotationOffsetDegrees: normalizeRotationDegrees(value) })}
      />
      <InputField
        label="Offset X"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(planOffset.x || 0)}
        onChange={(value) => updateSystemTransform({ planOffset: { ...planOffset, x: u.fromDisplay(value) } })}
      />
      <InputField
        label="Offset Y"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(planOffset.y || 0)}
        onChange={(value) => updateSystemTransform({ planOffset: { ...planOffset, y: u.fromDisplay(value) } })}
      />
      <InputField
        label="Sys. Length"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(systemLength || 0)}
        readOnly={!canResizeSystem}
        onChange={(value) => {
          if (!canResizeSystem || !systemTransform.rawLength) return;
          const nextLength = Math.max(MIN_TRUSS_SYSTEM_LENGTH, u.fromDisplay(value));
          updateSystemTransform({
            planLengthScale: nextLength / systemTransform.rawLength,
          });
        }}
      />
      <InputField
        label="Roof Link"
        value={roofSystem ? (attachedRoofId ? (roofSystem.name || 'Active Roof') : 'Other roof source or none') : 'No roof'}
        readOnly
      />
      <InputField
        label="Roof Fit"
        value={formatRoofMappingLabel(roofAttachmentType, hasMixedRoofMapping)}
        readOnly
      />
      <div className={styles.subtitle}>Purlins</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '4px 0' }}>
        <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Enable on top chord</label>
        <input
          type="checkbox"
          checked={Boolean(purlinSystem.enabled)}
          onChange={(e) => updatePurlins({ enabled: e.target.checked })}
        />
      </div>
      {purlinSystem.enabled && (
        <>
          <InputField
            label="Purlin Spacing"
            type="number"
            suffix={u.suffix}
            step={u.step(50)}
            value={u.toDisplay(purlinSystem.spacing || 0)}
            onChange={(value) => updatePurlins({ spacing: Math.max(100, u.fromDisplay(value)) })}
          />
          <InputField
            label="Purlin OH A"
            type="number"
            suffix={u.suffix}
            step={u.step(10)}
            value={u.toDisplay(purlinSystem.overhangStart || 0)}
            onChange={(value) => updatePurlins({ overhangStart: Math.max(0, u.fromDisplay(value)) })}
          />
          <InputField
            label="Start Offset"
            type="number"
            suffix={u.suffix}
            step={u.step(10)}
            value={u.toDisplay(purlinSystem.startOffset || 0)}
            onChange={(value) => updatePurlins({ startOffset: Math.max(0, u.fromDisplay(value)) })}
          />
          <InputField
            label="End Offset"
            type="number"
            suffix={u.suffix}
            step={u.step(10)}
            value={u.toDisplay(purlinSystem.endOffset || 0)}
            onChange={(value) => updatePurlins({ endOffset: Math.max(0, u.fromDisplay(value)) })}
          />
          <InputField
            label="Purlin OH B"
            type="number"
            suffix={u.suffix}
            step={u.step(10)}
            value={u.toDisplay(purlinSystem.overhangEnd || 0)}
            onChange={(value) => updatePurlins({ overhangEnd: Math.max(0, u.fromDisplay(value)) })}
          />
          <InputField
            label="Total Length"
            value={purlinTotalLength > 0 ? `${u.toDisplay(purlinTotalLength)} ${u.suffix}` : 'Single support only'}
            readOnly
          />
          <InputField
            label="Purlin Width"
            type="number"
            suffix={u.suffix}
            step={u.step(5)}
            value={u.toDisplay(purlinSystem.width || 0)}
            onChange={(value) => updatePurlins({ width: Math.max(25, u.fromDisplay(value)) })}
          />
          <InputField
            label="Purlin Depth"
            type="number"
            suffix={u.suffix}
            step={u.step(5)}
            value={u.toDisplay(purlinSystem.depth || 0)}
            onChange={(value) => updatePurlins({ depth: Math.max(25, u.fromDisplay(value)) })}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Purlin Mat.</label>
            <select
              value={purlinSystem.material || TRUSS_MATERIALS[0]}
              onChange={(e) => updatePurlins({ material: e.target.value })}
              style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
            >
              {TRUSS_MATERIALS.map((entry) => (
                <option key={entry} value={entry}>{formatMaterialLabel(entry)}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Draw Type</label>
        <select
          value={activeTrussTypeId}
          onChange={(e) => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { trussTypeId: e.target.value } })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {trussTypes.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Material</label>
        <select
          value={activeTrussMaterial}
          onChange={(e) => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { trussMaterial: e.target.value } })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {TRUSS_MATERIALS.map((entry) => (
            <option key={entry} value={entry}>{formatMaterialLabel(entry)}</option>
          ))}
        </select>
      </div>
      <button
        className={styles.actionBtn}
        onClick={() => startTrussDraw(editorDispatch, trussSystem.floorId, activeTrussTypeId, activeTrussMaterial, trussSystem.id)}
      >
        {activeTool === TOOLS.TRUSS_DRAW ? 'Drawing truss on beams' : 'Draw another truss'}
      </button>
      {roofSystem && (
        <button
          className={styles.actionBtn}
          disabled={attachedRoofId || !roofAttachmentType}
          onClick={setAsRoofSource}
        >
          {attachedRoofId ? 'Roof attached here' : (roofAttachmentType ? 'Set as roof source' : 'Roof fit unavailable')}
        </button>
      )}
      <div className={styles.drawingHint}>
        Beam-supported trusses remain separate from floor and roof geometry. Rotating keeps the current support relationship. Moving or resizing the system detaches beam-supported instances and keeps the new free placement.
        {purlinSystem.enabled && ((purlinSystem.overhangStart || 0) > 0 || (purlinSystem.overhangEnd || 0) > 0) ? ' Purlin overhang extends the outer purlins past the first and last truss supports.' : ''}
        {!roofAttachmentType ? ' This system cannot drive a roof fit because its truss type mix does not map to a supported roof type.' : ''}
        {!canResizeSystem ? ' Length resize is unavailable because the truss instances in this system do not share one consistent layout axis.' : ''}
      </div>
    </div>
  );
}

export function TrussInstanceProperties({
  project,
  trussSystem,
  trussInstance,
  dispatch,
  u,
  phases = [],
}) {
  const trussTypes = getDefaultTrussTypes();
  const trussType = resolveTrussType(trussInstance.trussTypeId, trussTypes);
  const floor = (project?.floors || []).find((entry) => entry.id === trussSystem.floorId) || null;
  const beamSupport = trussInstance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
    ? deriveBeamSupportedInstanceGeometry(trussInstance, floor)
    : null;
  const supportLength = beamSupport?.valid
    ? beamSupport.supportLength
    : distance(trussInstance.startPoint, trussInstance.endPoint);
  const supportSpan = beamSupport?.valid ? beamSupport.span : null;
  const countLimit = beamSupport?.valid
    ? beamSupport.countLimit
    : trussInstance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
      ? getBeamSupportCountLimit(supportLength, trussInstance.spacing)
      : null;
  const alignmentOffset = beamSupport?.valid
    ? beamSupport.effectiveOffset
    : Math.max(0, Number(trussInstance.supportOffsetAlongAxis || 0));
  const maxOffset = beamSupport?.valid ? beamSupport.maxOffset : 0;
  const canSlideAlongSupport = beamSupport?.valid && maxOffset > 0;
  const roofMapping = trussType.attachedRoofType || null;

  const updateInstance = (updates) => {
    dispatch({
      type: 'TRUSS_INSTANCE_UPDATE',
      trussSystemId: trussSystem.id,
      trussInstance: {
        id: trussInstance.id,
        ...updates,
      },
    });
  };

  return (
    <div>
      <div className={styles.title}>Truss Instance</div>
      <PhaseSelector
        phaseId={trussSystem.phaseId}
        phases={phases}
        label="System Phase"
        onChange={(value) => dispatch({
          type: 'TRUSS_SYSTEM_UPDATE',
          trussSystem: {
            id: trussSystem.id,
            phaseId: value,
          },
        })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Type</label>
        <select
          value={trussInstance.trussTypeId}
          onChange={(e) => {
            const nextType = resolveTrussType(e.target.value, trussTypes);
            updateInstance({
              trussTypeId: nextType.id,
              rise: nextType.defaultRise,
              pitch: nextType.defaultPitch,
            });
          }}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {trussTypes.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
      </div>
      <InputField label="Family" value={formatShapeLabel(trussType.family)} readOnly />
      <InputField label="Shape" value={formatShapeLabel(trussType.shape || trussType.family)} readOnly />
      <InputField label="Roof Fit" value={formatRoofMappingLabel(roofMapping)} readOnly />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Material</label>
        <select
          value={trussInstance.material || TRUSS_MATERIALS[0]}
          onChange={(e) => updateInstance({ material: e.target.value })}
          style={{ flex: 1, height: '28px', padding: '0 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-surface-elevated)' }}
        >
          {TRUSS_MATERIALS.map((entry) => (
            <option key={entry} value={entry}>{formatMaterialLabel(entry)}</option>
          ))}
        </select>
      </div>
      <div className={styles.subtitle}>Supports</div>
      <InputField
        label="Support A"
        value={resolveSupportBeamLabel(project, trussSystem.floorId, trussInstance.supportBeamIds?.start)}
        readOnly
      />
      <InputField
        label="Support B"
        value={resolveSupportBeamLabel(project, trussSystem.floorId, trussInstance.supportBeamIds?.end)}
        readOnly
      />
      <InputField
        label="Run Length"
        value={`${u.toDisplay(supportLength)} ${u.suffix}`}
        readOnly
      />
      {supportSpan != null && (
        <InputField
          label="Beam Span"
          value={`${u.toDisplay(supportSpan)} ${u.suffix}`}
          readOnly
        />
      )}
      {trussInstance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR && (
        <>
          <InputField
            label="Alignment"
            type="number"
            suffix={u.suffix}
            step={u.step(50)}
            value={u.toDisplay(alignmentOffset)}
            readOnly={!canSlideAlongSupport}
            onChange={(value) => updateInstance({
              supportOffsetAlongAxis: Math.max(0, Math.min(u.fromDisplay(value), maxOffset)),
            })}
          />
          <InputField
            label="Max Offset"
            value={`${u.toDisplay(maxOffset)} ${u.suffix}`}
            readOnly
          />
        </>
      )}
      <InputField
        label="System Rot."
        type="number"
        suffix="°"
        step={1}
        value={Number(trussSystem.planRotationOffsetDegrees || 0).toFixed(1)}
        onChange={(value) => dispatch({
          type: 'TRUSS_SYSTEM_UPDATE',
          trussSystem: {
            id: trussSystem.id,
            planRotationOffsetDegrees: normalizeRotationDegrees(value),
          },
        })}
      />
      <div className={styles.drawingHint}>
        {canSlideAlongSupport
          ? 'Beams control the support run and support spacing. Drag the truss in plan view to slide it, use the system handles to move, resize, or rotate the whole layout, and edit Span to extend the truss inward or outward relative to those supports.'
          : 'Beams control the support run and support spacing. This truss cannot slide farther on the current overlap, but you can still move, resize, or rotate the whole system and edit Span independently from the beam spacing.'}
      </div>
      <div className={styles.subtitle}>Geometry</div>
      <InputField
        label="Span"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(trussInstance.span)}
        onChange={(value) => updateInstance({ span: Math.max(1000, u.fromDisplay(value)) })}
      />
      <InputField
        label={trussType.family === 'flat' ? 'Depth' : 'Rise'}
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(trussInstance.rise)}
        onChange={(value) => updateInstance({ rise: Math.max(0, u.fromDisplay(value)) })}
      />
      <InputField
        label="Pitch"
        type="number"
        suffix="%"
        step={0.1}
        value={trussType.family === 'flat' ? 0 : trussInstance.pitch}
        readOnly={trussType.family === 'flat'}
        onChange={(value) => updateInstance({ pitch: Math.max(0, value) })}
      />
      <InputField
        label="Spacing"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(trussInstance.spacing)}
        onChange={(value) => updateInstance({ spacing: Math.max(300, u.fromDisplay(value)) })}
      />
      <InputField
        label="Count"
        type="number"
        step={1}
        value={trussInstance.count}
        onChange={(value) => updateInstance({
          count: countLimit
            ? Math.max(1, Math.min(Math.round(value), countLimit))
            : Math.max(1, Math.round(value)),
        })}
      />
      <div className={styles.subtitle}>Bearing / Overhang</div>
      <InputField
        label="Bearing A"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(trussInstance.bearingOffsets?.start || 0)}
        onChange={(value) => updateInstance({
          bearingOffsets: {
            ...(trussInstance.bearingOffsets || {}),
            start: u.fromDisplay(value),
          },
        })}
      />
      <InputField
        label="Bearing B"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(trussInstance.bearingOffsets?.end || 0)}
        onChange={(value) => updateInstance({
          bearingOffsets: {
            ...(trussInstance.bearingOffsets || {}),
            end: u.fromDisplay(value),
          },
        })}
      />
      <InputField
        label="Overhang A"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(trussInstance.overhangs?.start || 0)}
        onChange={(value) => updateInstance({
          overhangs: {
            ...(trussInstance.overhangs || {}),
            start: Math.max(0, u.fromDisplay(value)),
          },
        })}
      />
      <InputField
        label="Overhang B"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(trussInstance.overhangs?.end || 0)}
        onChange={(value) => updateInstance({
          overhangs: {
            ...(trussInstance.overhangs || {}),
            end: Math.max(0, u.fromDisplay(value)),
          },
        })}
      />
      <InputField
        label="Roof Link"
        value={trussInstance.roofAttachmentId || 'None'}
        readOnly
      />
    </div>
  );
}
