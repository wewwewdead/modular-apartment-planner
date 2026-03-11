import { useState } from 'react';
import { useProject } from '@/app/ProjectProvider';
import { useEditor } from '@/app/EditorProvider';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import { getColumnListLabel } from '@/domain/columnLabels';
import { createFloorAboveHighest, getFloorElevation, getFloorLevelIndex, getOrderedFloors } from '@/domain/floorModels';
import { createPhase, getNextPhaseOrder, getOrderedPhases, PHASE_COLORS, reorderPhases } from '@/domain/phaseModels';
import { createSheet, getSheetDisplayLabel } from '@/domain/sheetModels';
import { getSlabDisplayLabel } from '@/domain/slabLabels';
import { getStairDisplayLabel } from '@/domain/stairLabels';
import { getLandingDisplayLabel } from '@/domain/landingLabels';
import { getAnnotationDisplayLabel } from '@/annotations/format';
import styles from './Sidebar.module.css';

function ChevronSvg({ collapsed }) {
  return (
    <span className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}>
      <svg viewBox="0 0 14 14" aria-hidden="true" className={styles.chevronIcon}>
        <path
          d="M5 3.5l4 3.5-4 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className={styles.floorActionIcon}>
      <rect x="5" y="5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 9V3a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className={styles.floorActionIcon}>
      <path d="M3 4.5h8M5.5 4.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4 4.5l.5 7.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5l.5-7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function Section({ title, count, collapsed, onToggle, collapsible = true, action, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <button
          type="button"
          className={`${styles.sectionHeader} ${collapsible ? styles.sectionHeaderClickable : ''} ${styles.sectionHeaderContent}`}
          onClick={collapsible ? onToggle : undefined}
          aria-expanded={!collapsed}
        >
          {collapsible ? <ChevronSvg collapsed={collapsed} /> : <span style={{ width: 14 }} />}
          <span className={styles.sectionTitle}>{title}</span>
          {count !== undefined && <span className={styles.count}>{count}</span>}
        </button>
        {action}
      </div>
      {!collapsed && children}
    </div>
  );
}

export default function Sidebar() {
  const { project, dispatch, duplicateFloor } = useProject();
  const { activeFloorId, activeSheetId, selectedId, workspaceMode, activePhaseId, phaseViewMode, dispatch: editorDispatch } = useEditor();
  const orderedFloors = getOrderedFloors(project);
  const orderedPhases = getOrderedPhases(project);
  const floor = orderedFloors.find((entry) => entry.id === activeFloorId) || null;
  const [collapsedSections, setCollapsedSections] = useState({
    floors: false,
    sheets: false,
    phases: false,
    slabs: false,
    walls: false,
    annotations: false,
    beams: false,
    stairs: false,
    landings: false,
    doors: false,
    windows: false,
    columns: false,
    rooms: false,
  });

  const selectObject = (id, type) => {
    editorDispatch({ type: 'SELECT_OBJECT', id, objectType: type });
  };

  const selectFloor = (floorId) => {
    editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'model' });
    editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId });
    editorDispatch({ type: 'SELECT_OBJECT', id: floorId, objectType: 'floor' });
  };

  const setActiveFloor = (floorId) => {
    editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId });
  };

  const addFloor = () => {
    const nextFloor = createFloorAboveHighest(project.floors || []);
    dispatch({ type: 'FLOOR_ADD', floor: nextFloor });
    selectFloor(nextFloor.id);
  };

  const handleDuplicateFloor = (floorToDuplicate) => {
    const duplicatedFloor = duplicateFloor(floorToDuplicate.id);
    if (!duplicatedFloor) return;

    dispatch({ type: 'FLOOR_DUPLICATE', floor: duplicatedFloor });
    selectFloor(duplicatedFloor.id);
  };

  const handleDeleteFloor = (floorToDelete) => {
    if ((project.floors || []).length <= 1) return;

    const confirmed = window.confirm(`Delete "${floorToDelete.name}"?`);
    if (!confirmed) return;

    const remainingFloors = orderedFloors.filter((entry) => entry.id !== floorToDelete.id);
    const fallbackFloor = remainingFloors[0] || null;

    dispatch({
      type: 'FLOOR_DELETE',
      floorId: floorToDelete.id,
      fallbackFloorId: fallbackFloor?.id ?? null,
    });

    if (floorToDelete.id === activeFloorId && fallbackFloor) {
      if (workspaceMode === 'model') {
        selectFloor(fallbackFloor.id);
      } else {
        setActiveFloor(fallbackFloor.id);
      }
    }
  };

  const addPhase = () => {
    const nextOrder = getNextPhaseOrder(project.phases || []);
    const color = PHASE_COLORS[nextOrder % PHASE_COLORS.length];
    const phase = createPhase(`Phase ${nextOrder + 1}`, nextOrder, color);
    dispatch({ type: 'PHASE_ADD', phase });
    editorDispatch({ type: 'SET_ACTIVE_PHASE', phaseId: phase.id });
    editorDispatch({ type: 'SELECT_OBJECT', id: phase.id, objectType: 'phase' });
  };

  const selectPhase = (phaseId) => {
    editorDispatch({ type: 'SET_ACTIVE_PHASE', phaseId });
    if (phaseViewMode === 'all') {
      editorDispatch({ type: 'SET_PHASE_VIEW_MODE', mode: 'single' });
    }
    editorDispatch({ type: 'SELECT_OBJECT', id: phaseId, objectType: 'phase' });
  };

  const handleDeletePhase = (phase) => {
    if (!window.confirm(`Delete phase "${phase.name}"?`)) return;
    dispatch({ type: 'PHASE_DELETE', phaseId: phase.id });
    if (activePhaseId === phase.id) {
      editorDispatch({ type: 'SET_ACTIVE_PHASE', phaseId: null });
      editorDispatch({ type: 'SET_PHASE_VIEW_MODE', mode: 'all' });
    }
    editorDispatch({ type: 'DESELECT' });
  };

  const handleMovePhase = (phase, direction) => {
    const newOrder = phase.order + direction;
    const reordered = reorderPhases(project.phases || [], phase.id, newOrder);
    dispatch({ type: 'PHASE_REORDER', phases: reordered });
  };

  const handleTogglePhaseVisibility = (phase, e) => {
    e.stopPropagation();
    dispatch({ type: 'PHASE_UPDATE', phase: { id: phase.id, visible: phase.visible !== false ? false : true } });
  };

  const addSheet = () => {
    const nextIndex = (project.sheets || []).length + 1;
    const sheet = createSheet(`Sheet ${nextIndex}`, {
      drawingName: `Drawing ${nextIndex}`,
      number: `A${String(nextIndex).padStart(2, '0')}`,
    });
    dispatch({ type: 'SHEET_ADD', sheet });
    editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
    editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
    editorDispatch({ type: 'SELECT_OBJECT', id: sheet.id, objectType: 'sheet' });
  };

  const toggleSection = (sectionKey) => {
    setCollapsedSections(current => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  return (
    <div className={styles.sidebar}>
      <Section title="Project" collapsible={false}>
        <input
          className={styles.projectName}
          value={project.name}
          onChange={(e) => dispatch({ type: 'PROJECT_SET_NAME', name: e.target.value })}
        />
      </Section>

      <Section
        title="Floors"
        count={orderedFloors.length}
        collapsed={collapsedSections.floors}
        onToggle={() => toggleSection('floors')}
        action={
          <button type="button" className={styles.sectionAddBtn} onClick={addFloor} title="Add Floor">+</button>
        }
      >
        {orderedFloors.map((entry) => (
          <div
            key={entry.id}
            className={`${styles.floorCard} ${entry.id === activeFloorId ? styles.floorCardActive : ''}`}
          >
            <button
              type="button"
              className={styles.floorButton}
              onClick={() => selectFloor(entry.id)}
            >
              <span className={styles.floorName}>{entry.name}</span>
              <span className={styles.floorMeta}>
                L{getFloorLevelIndex(entry)} · {Math.round(getFloorElevation(entry))} mm
              </span>
            </button>
            <div className={styles.floorActions}>
              <button
                type="button"
                className={styles.floorActionBtn}
                onClick={() => handleDuplicateFloor(entry)}
                title={`Duplicate ${entry.name}`}
              >
                <DuplicateIcon />
              </button>
              <button
                type="button"
                className={`${styles.floorActionBtn} ${styles.floorActionDanger}`}
                onClick={() => handleDeleteFloor(entry)}
                title={`Delete ${entry.name}`}
                disabled={orderedFloors.length <= 1}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Sheets"
        count={(project.sheets || []).length}
        collapsed={collapsedSections.sheets}
        onToggle={() => toggleSection('sheets')}
        action={
          <button type="button" className={styles.sectionAddBtn} onClick={addSheet} title="Add Sheet">+</button>
        }
      >
        {(project.sheets || []).map((sheet, index) => (
          <div
            key={sheet.id}
            className={`${styles.item} ${workspaceMode === 'sheet' && activeSheetId === sheet.id ? styles.itemSelected : ''}`}
            onClick={() => {
              editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheet.id });
              editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' });
              editorDispatch({ type: 'SELECT_OBJECT', id: sheet.id, objectType: 'sheet' });
            }}
          >
            {getSheetDisplayLabel(sheet, index)}
          </div>
        ))}
      </Section>

      <Section
        title="Phases"
        count={orderedPhases.length}
        collapsed={collapsedSections.phases}
        onToggle={() => toggleSection('phases')}
        action={
          <button type="button" className={styles.sectionAddBtn} onClick={addPhase} title="Add Phase">+</button>
        }
      >
        <div className={styles.phaseViewControl} role="group" aria-label="Phase view mode">
          {['all', 'single', 'cumulative'].map(mode => (
            <button
              key={mode}
              type="button"
              className={phaseViewMode === mode ? styles.phaseViewBtnActive : styles.phaseViewBtn}
              onClick={() => editorDispatch({ type: 'SET_PHASE_VIEW_MODE', mode })}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        {orderedPhases.map((phase) => (
          <div
            key={phase.id}
            className={`${styles.phaseItem} ${phase.id === activePhaseId ? styles.phaseItemActive : ''} ${phase.visible === false ? styles.phaseItemHidden : ''}`}
          >
            <button
              type="button"
              className={styles.floorButton}
              onClick={() => selectPhase(phase.id)}
            >
              <span className={styles.phaseNameRow}>
                <span
                  className={styles.phaseColorDot}
                  style={{ background: phase.color }}
                />
                <span className={styles.floorName}>{phase.name}</span>
              </span>
              <span className={styles.floorMeta}>Order: {phase.order}</span>
            </button>
            <div className={styles.floorActions}>
              <button
                type="button"
                className={styles.phaseVisibilityBtn}
                onClick={(e) => handleTogglePhaseVisibility(phase, e)}
                title={phase.visible !== false ? 'Hide phase' : 'Show phase'}
              >
                {phase.visible !== false ? (
                  <svg viewBox="0 0 14 14" aria-hidden="true" className={styles.floorActionIcon}>
                    <path d="M7 4C4 4 1.5 7 1.5 7s2.5 3 5.5 3 5.5-3 5.5-3S10 4 7 4z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    <circle cx="7" cy="7" r="1.5" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 14 14" aria-hidden="true" className={styles.floorActionIcon}>
                    <path d="M7 4C4 4 1.5 7 1.5 7s2.5 3 5.5 3 5.5-3 5.5-3S10 4 7 4z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className={styles.floorActionBtn}
                onClick={() => handleMovePhase(phase, -1)}
                title="Move up"
                disabled={phase.order === 0}
              >
                <svg viewBox="0 0 14 14" aria-hidden="true" className={styles.floorActionIcon}>
                  <path d="M7 3l4 5H3z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.floorActionBtn}
                onClick={() => handleMovePhase(phase, 1)}
                title="Move down"
                disabled={phase.order >= orderedPhases.length - 1}
              >
                <svg viewBox="0 0 14 14" aria-hidden="true" className={styles.floorActionIcon}>
                  <path d="M7 11l4-5H3z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                className={`${styles.floorActionBtn} ${styles.floorActionDanger}`}
                onClick={() => handleDeletePhase(phase)}
                title={`Delete ${phase.name}`}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </Section>

      {floor && (
        <>
          <div className={styles.contextHeader}>Floor: {floor.name}</div>

          <Section
            title="Slabs"
            count={(floor.slabs || []).length}
            collapsed={collapsedSections.slabs}
            onToggle={() => toggleSection('slabs')}
          >
            {(floor.slabs || []).map(slab => (
              <div
                key={slab.id}
                className={`${styles.item} ${selectedId === slab.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(slab.id, 'slab')}
              >
                {getSlabDisplayLabel(slab)}
              </div>
            ))}
          </Section>

          <Section
            title="Walls"
            count={floor.walls.length}
            collapsed={collapsedSections.walls}
            onToggle={() => toggleSection('walls')}
          >
            {floor.walls.map(w => (
              <div
                key={w.id}
                className={`${styles.item} ${selectedId === w.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(w.id, 'wall')}
              >
                Wall {w.id.split('_').pop()}
              </div>
            ))}
          </Section>

          <Section
            title="Annotations"
            count={(floor.annotations || []).length}
            collapsed={collapsedSections.annotations}
            onToggle={() => toggleSection('annotations')}
          >
            {(floor.annotations || []).map((annotation) => (
              <div
                key={annotation.id}
                className={`${styles.item} ${selectedId === annotation.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(annotation.id, 'annotation')}
              >
                {getAnnotationDisplayLabel(annotation)}
              </div>
            ))}
          </Section>

          <Section
            title="Beams"
            count={(floor.beams || []).length}
            collapsed={collapsedSections.beams}
            onToggle={() => toggleSection('beams')}
          >
            {(floor.beams || []).map(beam => (
              <div
                key={beam.id}
                className={`${styles.item} ${selectedId === beam.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(beam.id, 'beam')}
              >
                {getBeamDisplayLabel(beam, floor.columns || [])}
              </div>
            ))}
          </Section>

          <Section
            title="Stairs"
            count={(floor.stairs || []).length}
            collapsed={collapsedSections.stairs}
            onToggle={() => toggleSection('stairs')}
          >
            {(floor.stairs || []).map(stair => (
              <div
                key={stair.id}
                className={`${styles.item} ${selectedId === stair.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(stair.id, 'stair')}
              >
                {getStairDisplayLabel(stair)}
              </div>
            ))}
          </Section>

          <Section
            title="Landings"
            count={(floor.landings || []).length}
            collapsed={collapsedSections.landings}
            onToggle={() => toggleSection('landings')}
          >
            {(floor.landings || []).map(landing => (
              <div
                key={landing.id}
                className={`${styles.item} ${selectedId === landing.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(landing.id, 'landing')}
              >
                {getLandingDisplayLabel(landing)}
              </div>
            ))}
          </Section>

          <Section
            title="Doors"
            count={floor.doors.length}
            collapsed={collapsedSections.doors}
            onToggle={() => toggleSection('doors')}
          >
            {floor.doors.map(d => (
              <div
                key={d.id}
                className={`${styles.item} ${selectedId === d.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(d.id, 'door')}
              >
                Door {d.id.split('_').pop()}
              </div>
            ))}
          </Section>

          <Section
            title="Windows"
            count={floor.windows.length}
            collapsed={collapsedSections.windows}
            onToggle={() => toggleSection('windows')}
          >
            {floor.windows.map(w => (
              <div
                key={w.id}
                className={`${styles.item} ${selectedId === w.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(w.id, 'window')}
              >
                Window {w.id.split('_').pop()}
              </div>
            ))}
          </Section>

          <Section
            title="Columns"
            count={(floor.columns || []).length}
            collapsed={collapsedSections.columns}
            onToggle={() => toggleSection('columns')}
          >
            {(floor.columns || []).map(column => (
              <div
                key={column.id}
                className={`${styles.item} ${selectedId === column.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(column.id, 'column')}
              >
                {getColumnListLabel(column, floor.columns || [])}
              </div>
            ))}
          </Section>

          <Section
            title="Rooms"
            count={floor.rooms.length}
            collapsed={collapsedSections.rooms}
            onToggle={() => toggleSection('rooms')}
          >
            {floor.rooms.map(r => (
              <div
                key={r.id}
                className={`${styles.item} ${selectedId === r.id ? styles.itemSelected : ''}`}
                onClick={() => selectObject(r.id, 'room')}
              >
                {r.name}
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
