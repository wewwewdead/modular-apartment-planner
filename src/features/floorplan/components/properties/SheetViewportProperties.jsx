import { memo } from 'react';
import { getOrderedFloors } from '@/domain/floorModels';
import { getProjectTrussSystems } from '@/domain/trussModels';
import { buildSheetScene, fitViewportToSheet } from '@/sheets/layout';
import { getViewportSourceLabel, resolveSheetViewportSource } from '@/sheets/sources';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

function SheetViewportProperties({ sheet, viewport, project, dispatch, u }) {
  const sheetScene = buildSheetScene(project, sheet);
  const sceneViewport = sheetScene?.viewports.find((entry) => entry.id === viewport.id) || null;
  const displayedViewport = sceneViewport || viewport;

  const updateViewport = (updates) => {
    const isManualEdit = ['x', 'y', 'width', 'height', 'rotation'].some((key) => key in updates);
    const baseViewport = sceneViewport
      ? {
          ...viewport,
          x: sceneViewport.x,
          y: sceneViewport.y,
          width: sceneViewport.width,
          height: sceneViewport.height,
          rotation: sceneViewport.rotation,
        }
      : viewport;
    const nextViewport = fitViewportToSheet(
      {
        ...baseViewport,
        ...updates,
        lockAutoLayout:
          'lockAutoLayout' in updates ? updates.lockAutoLayout : isManualEdit ? true : baseViewport.lockAutoLayout,
      },
      sheet,
    );
    dispatch({ type: 'SHEET_VIEWPORT_UPDATE', sheetId: sheet.id, viewport: nextViewport });
  };

  const floorOptions = getOrderedFloors(project);
  const trussInstanceOptions = getProjectTrussSystems(project, viewport.sourceFloorId).flatMap((trussSystem) =>
    (trussSystem.trussInstances || []).map((trussInstance, index) => ({
      id: trussInstance.id,
      label: `${trussSystem.name || 'Truss System'} · Instance ${index + 1}`,
    })),
  );
  const updateSource = (nextSourceView, nextFloorId = viewport.sourceFloorId, nextRefId) => {
    const floor = floorOptions.find((entry) => entry.id === nextFloorId) || null;
    const refId =
      nextRefId !== undefined
        ? nextRefId
        : nextSourceView === 'section' || nextSourceView === 'roof_section'
          ? (floor?.sectionCuts || [])[0]?.id || null
          : nextSourceView === 'truss_detail'
            ? getProjectTrussSystems(project, nextFloorId).flatMap((trussSystem) => trussSystem.trussInstances || [])[0]
                ?.id || null
            : null;
    updateViewport({
      sourceView: nextSourceView,
      sourceFloorId: nextFloorId,
      sourceRefId: refId,
      role:
        nextSourceView === '3d_preview'
          ? 'supplemental'
          : nextSourceView === 'plan' ||
              nextSourceView === 'structural_plan' ||
              nextSourceView === 'services_plan' ||
              nextSourceView === 'roof_plan' ||
              nextSourceView === 'roof_drainage' ||
              nextSourceView === 'truss_plan'
            ? 'primary'
            : nextSourceView === 'truss_detail'
              ? 'detail'
              : 'secondary',
    });
  };

  const currentFloor = floorOptions.find((entry) => entry.id === viewport.sourceFloorId) || null;
  const sectionCutOptions = currentFloor?.sectionCuts || [];

  const source = resolveSheetViewportSource(project, viewport);

  const toggleLayoutMode = () => {
    if (sheet.layoutTemplate !== 'auto') return;
    if (viewport.lockAutoLayout) {
      updateViewport({ lockAutoLayout: false });
      return;
    }
    updateViewport({
      x: displayedViewport.x,
      y: displayedViewport.y,
      width: displayedViewport.width,
      height: displayedViewport.height,
      rotation: displayedViewport.rotation || 0,
      lockAutoLayout: true,
    });
  };

  return (
    <div>
      <div className={styles.title}>Sheet Viewport</div>
      <InputField label="Title" value={viewport.title} onChange={(value) => updateViewport({ title: value })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Source</label>
        <select
          value={viewport.sourceView}
          onChange={(e) => updateSource(e.target.value)}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <option value="plan">Plan</option>
          <option value="structural_plan">Structural Coordination Plan</option>
          <option value="services_plan">Services and Egress Coordination Plan</option>
          <option value="site_plan">Site Development Plan</option>
          <option value="building_report">Building Report</option>
          <option value="roof_plan">Roof Plan</option>
          <option value="roof_elevation_front">Roof Front Elevation</option>
          <option value="roof_elevation_rear">Roof Rear Elevation</option>
          <option value="roof_elevation_left">Roof Left Elevation</option>
          <option value="roof_elevation_right">Roof Right Elevation</option>
          <option value="truss_plan">Truss Plan</option>
          <option value="truss_detail">Truss Detail</option>
          <option value="roof_drainage">Roof Drainage</option>
          <option value="roof_schedule">Roof Schedule</option>
          <option value="3d_preview">3D Preview</option>
          <option value="section">Section</option>
          <option value="roof_section">Roof Section</option>
          <option value="elevation_front">Front Elevation</option>
          <option value="elevation_rear">Rear Elevation</option>
          <option value="elevation_left">Left Elevation</option>
          <option value="elevation_right">Right Elevation</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Floor</label>
        <select
          value={viewport.sourceFloorId || ''}
          onChange={(e) => updateSource(viewport.sourceView, e.target.value)}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          {floorOptions.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
      </div>
      {(viewport.sourceView === 'section' || viewport.sourceView === 'roof_section') &&
        sectionCutOptions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Section Cut
            </label>
            <select
              value={viewport.sourceRefId || ''}
              onChange={(e) => updateSource(viewport.sourceView, viewport.sourceFloorId, e.target.value || null)}
              style={{
                flex: 1,
                height: '28px',
                padding: '0 4px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
              }}
            >
              {sectionCutOptions.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.label || sc.id}
                </option>
              ))}
            </select>
          </div>
        )}
      {viewport.sourceView === 'truss_detail' && trussInstanceOptions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Truss</label>
          <select
            value={viewport.sourceRefId || ''}
            onChange={(e) => updateSource(viewport.sourceView, viewport.sourceFloorId, e.target.value || null)}
            style={{
              flex: 1,
              height: '28px',
              padding: '0 4px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
            }}
          >
            {trussInstanceOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <InputField label="Source Label" value={source.title || getViewportSourceLabel(viewport.sourceView)} readOnly />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Role</label>
        <select
          value={viewport.role}
          onChange={(e) => updateViewport({ role: e.target.value })}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
          <option value="detail">Detail</option>
          <option value="supplemental">Supplemental</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Caption</label>
        <select
          value={viewport.captionPosition}
          onChange={(e) => updateViewport({ captionPosition: e.target.value })}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <option value="below">Below</option>
          <option value="above">Above</option>
        </select>
      </div>
      <InputField
        label="Reference"
        value={viewport.referenceNote || ''}
        onChange={(value) => updateViewport({ referenceNote: value })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Phase</label>
        <select
          value={viewport.phaseId || ''}
          onChange={(e) => {
            const nextPhaseId = e.target.value || null;
            if (!nextPhaseId) {
              updateViewport({ phaseId: null, phaseViewMode: 'all' });
            } else {
              updateViewport({
                phaseId: nextPhaseId,
                phaseViewMode: viewport.phaseViewMode === 'all' ? 'cumulative' : viewport.phaseViewMode,
              });
            }
          }}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <option value="">All Phases</option>
          {(project.phases || []).map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.name}
            </option>
          ))}
        </select>
      </div>
      {viewport.phaseId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Phase Mode</label>
          <select
            value={viewport.phaseViewMode || 'all'}
            onChange={(e) => updateViewport({ phaseViewMode: e.target.value })}
            style={{
              flex: 1,
              height: '28px',
              padding: '0 4px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
            }}
          >
            <option value="all">All</option>
            <option value="single">Single</option>
            <option value="cumulative">Cumulative</option>
          </select>
        </div>
      )}
      <InputField
        label="Frame Mode"
        value={sheet.layoutTemplate === 'auto' ? (viewport.lockAutoLayout ? 'Manual' : 'Auto') : 'Manual (sheet)'}
        readOnly
      />
      {sheet.layoutTemplate === 'auto' && (
        <button className={styles.actionBtn} onClick={toggleLayoutMode}>
          {viewport.lockAutoLayout ? 'Use auto layout' : 'Convert to manual frame'}
        </button>
      )}
      <div className={styles.subtitle}>Frame</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(displayedViewport.x)}
        onChange={(value) => updateViewport({ x: u.fromDisplay(value) })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(displayedViewport.y)}
        onChange={(value) => updateViewport({ y: u.fromDisplay(value) })}
      />
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(displayedViewport.width)}
        onChange={(value) => updateViewport({ width: Math.max(20, u.fromDisplay(value)) })}
      />
      <InputField
        label="Height"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(displayedViewport.height)}
        onChange={(value) => updateViewport({ height: Math.max(20, u.fromDisplay(value)) })}
      />
      <InputField
        label="Scale 1:"
        type="number"
        value={Math.round(viewport.scale)}
        onChange={(value) => updateViewport({ scale: Math.max(1, Math.round(value)) })}
      />
      <InputField
        label="Rotation"
        type="number"
        suffix="°"
        step={1}
        value={displayedViewport.rotation || 0}
        onChange={(value) => updateViewport({ rotation: ((value % 360) + 360) % 360 })}
      />
    </div>
  );
}

export default memo(SheetViewportProperties);
