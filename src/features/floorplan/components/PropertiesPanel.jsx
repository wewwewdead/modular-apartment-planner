import { useMemo } from 'react';
import { useProject } from '@/features/floorplan/context/FloorplanContext';
import { useEditor } from '@/features/floorplan/context/FloorplanContext';
import { useConfirmDialog } from '@/ui/ConfirmDialog';
import { FILLET_DEFAULT_RADIUS, FILLET_MIN_RADIUS, FILLET_MAX_RADIUS } from '@/domain/defaults';
import { getOrderedFloors } from '@/domain/floorModels';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { findTrussInstance, getProjectTrussSystems } from '@/domain/trussModels';
import { TOOLS } from '@/editor/tools';
import { getOrderedPhases } from '@/domain/phaseModels';
import InputField from './InputField';
import {
  DrainProperties,
  ParapetProperties,
  RoofEdgeProperties,
  RoofEmptyState,
  RoofOpeningProperties,
  RoofPlaneProperties,
  RoofSystemProperties,
} from './RoofProperties';
import { TrussEmptyState, TrussInstanceProperties, TrussSystemProperties } from './TrussProperties';
import styles from './PropertiesPanel.module.css';
import { useUnits } from './properties/useUnits';
import WallProperties, { WallDrawingInput } from './properties/WallProperties';
import DoorProperties from './properties/DoorProperties';
import WindowProperties from './properties/WindowProperties';
import ElectricalProperties from './properties/ElectricalProperties';
import RoomProperties from './properties/RoomProperties';
import SlabProperties from './properties/SlabProperties';
import BeamProperties from './properties/BeamProperties';
import DimensionProperties from './properties/DimensionProperties';
import StairProperties from './properties/StairProperties';
import LandingProperties from './properties/LandingProperties';
import SectionCutProperties from './properties/SectionCutProperties';
import RailingProperties from './properties/RailingProperties';
import ColumnProperties from './properties/ColumnProperties';
import FixtureProperties from './properties/FixtureProperties';
import PhaseProperties from './properties/PhaseProperties';
import FloorProperties from './properties/FloorProperties';
import ProjectSummary from './properties/ProjectSummary';
import SheetProperties, { SheetExportMenu } from './properties/SheetProperties';
import SheetViewportProperties from './properties/SheetViewportProperties';
import BuildingServiceProperties from './properties/BuildingServiceProperties';

/*
 * Plain nouns for the selection types. The panel used to interpolate the raw
 * type string, so it offered "Delete electricalDevice" and "Delete sectionCut"
 * — internal identifiers surfaced on the one button that cannot be undone by
 * clicking it again.
 */
const OBJECT_NOUNS = {
  wall: 'wall',
  door: 'door',
  window: 'window',
  room: 'room',
  slab: 'slab',
  beam: 'beam',
  column: 'column',
  stair: 'stair',
  landing: 'landing',
  railing: 'railing',
  fixture: 'fixture',
  annotation: 'dimension',
  sectionCut: 'section cut',
  electricalDevice: 'outlet',
  phase: 'phase',
  floor: 'floor',
  sheet: 'sheet',
  sheetViewport: 'viewport',
  roofPlane: 'roof plane',
  roofEdge: 'roof edge',
  roofOpening: 'roof opening',
  roofParapet: 'parapet',
  roofDrain: 'drain',
  trussSystem: 'truss system',
  trussInstance: 'truss',
  plumbingShaft: 'plumbing shaft',
  electricalRiser: 'electrical riser',
  electricalPanelZone: 'panel zone',
};

function selectionLabel(selectedType, floorName) {
  if (!selectedType) return floorName || 'Project';
  const noun = OBJECT_NOUNS[selectedType] || 'Object';
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

function selectionMeta(selectedType, selectedId) {
  if (!selectedType) return 'Nothing selected';
  return selectedId || '';
}

export default function PropertiesPanel() {
  const { project, dispatch, duplicateFloor } = useProject();
  const {
    selectedId,
    selectedType,
    activeFloorId,
    activeSheetId,
    workspaceMode,
    modelTarget,
    viewMode,
    activeTool,
    toolState,
    activePhaseId,
    phaseViewMode,
    hiddenWallBoards,
    dispatch: editorDispatch,
  } = useEditor();
  const orderedFloors = getOrderedFloors(project);
  const confirm = useConfirmDialog();
  const phases = getOrderedPhases(project);
  const filteredProject = useMemo(
    () => filterProjectByPhase(project, activePhaseId, phaseViewMode),
    [project, activePhaseId, phaseViewMode],
  );
  const floor = orderedFloors.find((entry) => entry.id === activeFloorId) || null;
  const roofSystem = project.roofSystem || null;
  const floorTrussSystems = getProjectTrussSystems(project, activeFloorId);
  const visibleFloorTrussSystems = getProjectTrussSystems(filteredProject, activeFloorId);
  const visibleRoofSystem = filteredProject.roofSystem || null;
  const isRoofHiddenByPhase = Boolean(roofSystem && !visibleRoofSystem);
  const visibleTrussIds = new Set((filteredProject.trussSystems || []).map((entry) => entry.id));
  const activePhaseName = phases.find((phase) => phase.id === activePhaseId)?.name || null;
  const sheet = (project.sheets || []).find((entry) => entry.id === activeSheetId) || null;
  const u = useUnits();
  const { trussSystem: selectedTrussParent } =
    selectedType === 'trussInstance' ? findTrussInstance(project, selectedId) : { trussSystem: null };
  const activeTrussSystem =
    selectedType === 'trussSystem'
      ? (project.trussSystems || []).find((entry) => entry.id === selectedId) ||
        visibleFloorTrussSystems[0] ||
        floorTrussSystems[0] ||
        null
      : selectedTrussParent || visibleFloorTrussSystems[0] || floorTrussSystems[0] || null;
  const isActiveTrussHiddenByPhase = Boolean(activeTrussSystem && !visibleTrussIds.has(activeTrussSystem.id));

  const selectFloor = (floorId) => {
    editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'floor' });
    editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId });
    editorDispatch({ type: 'SELECT_OBJECT', id: floorId, objectType: 'floor' });
  };

  const handleDuplicateFloor = (floorToDuplicate) => {
    const duplicatedFloor = duplicateFloor(floorToDuplicate.id);
    if (!duplicatedFloor) return;

    dispatch({ type: 'FLOOR_DUPLICATE', floor: duplicatedFloor });
    selectFloor(duplicatedFloor.id);
  };

  const handleDeleteFloor = async (floorToDelete) => {
    if (orderedFloors.length <= 1) return;
    if (!(await confirm(`Delete "${floorToDelete.name}"?`))) return;

    const remainingFloors = orderedFloors.filter((entry) => entry.id !== floorToDelete.id);
    const fallbackFloor = remainingFloors[0] || null;

    dispatch({
      type: 'FLOOR_DELETE',
      floorId: floorToDelete.id,
      fallbackFloorId: fallbackFloor?.id ?? null,
    });

    if (fallbackFloor) {
      selectFloor(fallbackFloor.id);
    } else {
      editorDispatch({ type: 'DESELECT' });
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (selectedType === 'phase') {
      const phase = (project.phases || []).find((p) => p.id === selectedId);
      if (phase && (await confirm(`Delete phase "${phase.name}"?`))) {
        dispatch({ type: 'PHASE_DELETE', phaseId: selectedId });
      }
      editorDispatch({ type: 'DESELECT' });
      return;
    }
    if (selectedType === 'sheet') {
      dispatch({ type: 'SHEET_DELETE', sheetId: selectedId });
    } else if (selectedType === 'sheetViewport' && sheet) {
      dispatch({ type: 'SHEET_VIEWPORT_DELETE', sheetId: sheet.id, viewportId: selectedId });
    } else if (selectedType === 'slab') {
      dispatch({ type: 'SLAB_DELETE', floorId: activeFloorId, slabId: selectedId });
    } else if (selectedType === 'wall') {
      dispatch({ type: 'WALL_DELETE', floorId: activeFloorId, wallId: selectedId });
    } else if (selectedType === 'beam') {
      dispatch({ type: 'BEAM_DELETE', floorId: activeFloorId, beamId: selectedId });
    } else if (selectedType === 'sectionCut') {
      dispatch({ type: 'SECTION_DELETE', floorId: activeFloorId, sectionId: selectedId });
    } else if (selectedType === 'annotation') {
      dispatch({ type: 'ANNOTATION_DELETE', floorId: activeFloorId, annotationId: selectedId });
    } else if (selectedType === 'stair') {
      dispatch({ type: 'STAIR_DELETE', floorId: activeFloorId, stairId: selectedId });
    } else if (selectedType === 'landing') {
      dispatch({ type: 'LANDING_DELETE', floorId: activeFloorId, landingId: selectedId });
    } else if (selectedType === 'door') {
      dispatch({ type: 'DOOR_DELETE', floorId: activeFloorId, doorId: selectedId });
    } else if (selectedType === 'window') {
      dispatch({ type: 'WINDOW_DELETE', floorId: activeFloorId, windowId: selectedId });
    } else if (selectedType === 'electricalDevice') {
      dispatch({ type: 'ELECTRICAL_DEVICE_DELETE', floorId: activeFloorId, deviceId: selectedId });
    } else if (selectedType === 'column') {
      dispatch({ type: 'COLUMN_DELETE', floorId: activeFloorId, columnId: selectedId });
    } else if (selectedType === 'fixture') {
      dispatch({ type: 'FIXTURE_DELETE', floorId: activeFloorId, fixtureId: selectedId });
    } else if (selectedType === 'railing') {
      dispatch({ type: 'RAILING_DELETE', floorId: activeFloorId, railingId: selectedId });
    } else if (selectedType === 'room') {
      dispatch({ type: 'ROOM_DELETE', floorId: activeFloorId, roomId: selectedId });
    } else if (selectedType === 'roofSystem') {
      dispatch({ type: 'ROOF_DELETE' });
    } else if (selectedType === 'parapet') {
      dispatch({ type: 'PARAPET_DELETE', parapetId: selectedId });
    } else if (selectedType === 'drain') {
      dispatch({ type: 'DRAIN_DELETE', drainId: selectedId });
    } else if (selectedType === 'roofOpening') {
      dispatch({ type: 'ROOF_OPENING_DELETE', roofOpeningId: selectedId });
    } else if (selectedType === 'roofPlane') {
      dispatch({ type: 'ROOF_PLANE_DELETE', roofPlaneId: selectedId });
    } else if (selectedType === 'roofEdge') {
      dispatch({ type: 'ROOF_EDGE_DELETE', roofEdgeId: selectedId });
    } else if (selectedType === 'trussSystem') {
      dispatch({ type: 'TRUSS_SYSTEM_DELETE', trussSystemId: selectedId });
    } else if (selectedType === 'trussInstance') {
      const { trussSystem } = findTrussInstance(project, selectedId);
      if (trussSystem) {
        dispatch({ type: 'TRUSS_INSTANCE_DELETE', trussSystemId: trussSystem.id, trussInstanceId: selectedId });
      }
    } else if (selectedType === 'floor') {
      const targetFloor = orderedFloors.find((entry) => entry.id === selectedId) || null;
      if (targetFloor) {
        handleDeleteFloor(targetFloor);
        return;
      }
    }
    editorDispatch({ type: 'DESELECT' });
  };

  let content =
    workspaceMode === 'sheet' && sheet ? (
      <SheetProperties
        sheet={sheet}
        project={project}
        dispatch={dispatch}
        editorDispatch={editorDispatch}
        activeFloorId={activeFloorId}
        modelTarget={modelTarget}
        viewMode={viewMode}
        u={u}
      />
    ) : modelTarget === 'roof' ? (
      roofSystem ? (
        <RoofSystemProperties
          project={project}
          roofSystem={roofSystem}
          dispatch={dispatch}
          editorDispatch={editorDispatch}
          u={u}
          phases={phases}
          isHiddenByPhase={isRoofHiddenByPhase}
          activePhaseName={activePhaseName}
          phaseViewMode={phaseViewMode}
        />
      ) : (
        <RoofEmptyState
          project={project}
          dispatch={dispatch}
          editorDispatch={editorDispatch}
          activePhaseId={activePhaseId}
        />
      )
    ) : modelTarget === 'truss' ? (
      activeTrussSystem ? (
        <TrussSystemProperties
          project={project}
          trussSystem={activeTrussSystem}
          dispatch={dispatch}
          editorDispatch={editorDispatch}
          u={u}
          phases={phases}
          isHiddenByPhase={isActiveTrussHiddenByPhase}
          activePhaseName={activePhaseName}
          phaseViewMode={phaseViewMode}
        />
      ) : (
        <TrussEmptyState project={project} activeFloorId={activeFloorId} editorDispatch={editorDispatch} />
      )
    ) : (
      <>
        {floor && (
          <FloorProperties
            floor={floor}
            dispatch={dispatch}
            onDuplicate={handleDuplicateFloor}
            onDelete={handleDeleteFloor}
            canDelete={orderedFloors.length > 1}
            u={u}
          />
        )}
        <ProjectSummary project={project} floor={floor} dispatch={dispatch} />
      </>
    );

  if (selectedId && workspaceMode === 'sheet' && sheet) {
    if (selectedType === 'sheet') {
      if (sheet.id === selectedId) {
        content = (
          <SheetProperties
            sheet={sheet}
            project={project}
            dispatch={dispatch}
            editorDispatch={editorDispatch}
            activeFloorId={activeFloorId}
            modelTarget={modelTarget}
            viewMode={viewMode}
            u={u}
          />
        );
      }
    } else if (selectedType === 'sheetViewport') {
      const viewport = (sheet.viewports || []).find((entry) => entry.id === selectedId);
      if (viewport) {
        content = (
          <SheetViewportProperties sheet={sheet} viewport={viewport} project={project} dispatch={dispatch} u={u} />
        );
      }
    }
  } else if (selectedId && modelTarget === 'roof' && roofSystem) {
    if (selectedType === 'roofSystem' && selectedId === roofSystem.id) {
      content = (
        <RoofSystemProperties
          project={project}
          roofSystem={roofSystem}
          dispatch={dispatch}
          editorDispatch={editorDispatch}
          u={u}
          phases={phases}
          isHiddenByPhase={isRoofHiddenByPhase}
          activePhaseName={activePhaseName}
          phaseViewMode={phaseViewMode}
        />
      );
    } else if (selectedType === 'parapet') {
      const parapet = (roofSystem.parapets || []).find((entry) => entry.id === selectedId);
      if (parapet) {
        content = <ParapetProperties parapet={parapet} roofSystem={roofSystem} dispatch={dispatch} u={u} />;
      }
    } else if (selectedType === 'drain') {
      const drain = (roofSystem.drains || []).find((entry) => entry.id === selectedId);
      if (drain) {
        content = <DrainProperties drain={drain} dispatch={dispatch} u={u} />;
      }
    } else if (selectedType === 'roofOpening') {
      const roofOpening = (roofSystem.roofOpenings || []).find((entry) => entry.id === selectedId);
      if (roofOpening) {
        content = <RoofOpeningProperties roofOpening={roofOpening} project={project} dispatch={dispatch} u={u} />;
      }
    } else if (selectedType === 'roofPlane') {
      const roofPlane = (roofSystem.roofPlanes || []).find((entry) => entry.id === selectedId);
      if (roofPlane) {
        content = <RoofPlaneProperties roofPlane={roofPlane} dispatch={dispatch} u={u} />;
      }
    } else if (selectedType === 'roofEdge') {
      const roofEdge = (roofSystem.roofEdges || []).find((entry) => entry.id === selectedId);
      if (roofEdge) {
        content = <RoofEdgeProperties roofEdge={roofEdge} roofSystem={roofSystem} dispatch={dispatch} u={u} />;
      }
    }
  } else if (modelTarget === 'truss') {
    if (selectedType === 'trussSystem') {
      const trussSystem = (project.trussSystems || []).find((entry) => entry.id === selectedId) || activeTrussSystem;
      if (trussSystem) {
        content = (
          <TrussSystemProperties
            project={project}
            trussSystem={trussSystem}
            dispatch={dispatch}
            editorDispatch={editorDispatch}
            u={u}
            phases={phases}
            isHiddenByPhase={Boolean(trussSystem && !visibleTrussIds.has(trussSystem.id))}
            activePhaseName={activePhaseName}
            phaseViewMode={phaseViewMode}
          />
        );
      }
    } else if (selectedType === 'trussInstance') {
      const { trussSystem, trussInstance } = findTrussInstance(project, selectedId);
      if (trussSystem && trussInstance) {
        content = (
          <TrussInstanceProperties
            project={project}
            trussSystem={trussSystem}
            trussInstance={trussInstance}
            dispatch={dispatch}
            u={u}
            phases={phases}
          />
        );
      }
    }
  } else if (selectedId && floor) {
    if (selectedType === 'plumbingShaft') {
      const shaft = (project.building?.systems?.plumbing?.shafts || []).find((entry) => entry.id === selectedId);
      if (shaft)
        content = <BuildingServiceProperties entity={shaft} serviceType={selectedType} dispatch={dispatch} u={u} />;
    } else if (selectedType === 'electricalRiser') {
      const riser = (project.building?.systems?.electrical?.riserZones || []).find((entry) => entry.id === selectedId);
      if (riser)
        content = <BuildingServiceProperties entity={riser} serviceType={selectedType} dispatch={dispatch} u={u} />;
    } else if (selectedType === 'electricalPanelZone') {
      const panel = (project.building?.systems?.electrical?.panelZones || []).find((entry) => entry.id === selectedId);
      if (panel)
        content = <BuildingServiceProperties entity={panel} serviceType={selectedType} dispatch={dispatch} u={u} />;
    } else if (selectedType === 'floor') {
      const selectedFloor = orderedFloors.find((entry) => entry.id === selectedId) || floor;
      content = (
        <FloorProperties
          floor={selectedFloor}
          dispatch={dispatch}
          onDuplicate={handleDuplicateFloor}
          onDelete={handleDeleteFloor}
          canDelete={orderedFloors.length > 1}
          u={u}
        />
      );
    } else if (selectedType === 'phase') {
      const phase = (project.phases || []).find((p) => p.id === selectedId);
      if (phase) {
        content = <PhaseProperties phase={phase} project={project} dispatch={dispatch} />;
      }
    } else if (selectedType === 'slab') {
      const slab = (floor.slabs || []).find((s) => s.id === selectedId) || null;
      if (slab) {
        content = (
          <SlabProperties slab={slab} floor={floor} dispatch={dispatch} floorId={activeFloorId} u={u} phases={phases} />
        );
      }
    } else if (selectedType === 'wall') {
      const wall = floor.walls.find((w) => w.id === selectedId);
      if (wall) {
        content = (
          <WallProperties
            wall={wall}
            floor={floor}
            floors={project.floors}
            hiddenWallBoards={hiddenWallBoards}
            dispatch={dispatch}
            editorDispatch={editorDispatch}
            floorId={activeFloorId}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'beam') {
      const beam = (floor.beams || []).find((b) => b.id === selectedId);
      if (beam) {
        content = (
          <BeamProperties beam={beam} floor={floor} dispatch={dispatch} floorId={activeFloorId} u={u} phases={phases} />
        );
      }
    } else if (selectedType === 'sectionCut') {
      const sectionCut = (floor.sectionCuts || []).find((s) => s.id === selectedId) || null;
      if (sectionCut) {
        content = (
          <SectionCutProperties
            sectionCut={sectionCut}
            dispatch={dispatch}
            floorId={activeFloorId}
            editorDispatch={editorDispatch}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'annotation') {
      const annotation = (floor.annotations || []).find((entry) => entry.id === selectedId);
      if (annotation) {
        content = (
          <DimensionProperties
            annotation={annotation}
            floor={floor}
            dispatch={dispatch}
            floorId={activeFloorId}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'stair') {
      const stair = (floor.stairs || []).find((entry) => entry.id === selectedId);
      if (stair) {
        content = (
          <StairProperties
            stair={stair}
            project={project}
            dispatch={dispatch}
            floorId={activeFloorId}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'landing') {
      const landing = (floor.landings || []).find((l) => l.id === selectedId);
      if (landing) {
        content = (
          <LandingProperties
            landing={landing}
            floor={floor}
            dispatch={dispatch}
            floorId={activeFloorId}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'door') {
      const door = floor.doors.find((d) => d.id === selectedId);
      const wall = door ? floor.walls.find((w) => w.id === door.wallId) : null;
      if (door) {
        content = (
          <DoorProperties
            door={door}
            wall={wall}
            dispatch={dispatch}
            floorId={activeFloorId}
            editorDispatch={editorDispatch}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'window') {
      const win = floor.windows.find((w) => w.id === selectedId);
      const wall = win ? floor.walls.find((w) => w.id === win.wallId) : null;
      if (win) {
        content = (
          <WindowProperties
            window={win}
            wall={wall}
            dispatch={dispatch}
            floorId={activeFloorId}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'electricalDevice') {
      const device = (floor.electricalDevices || []).find((entry) => entry.id === selectedId);
      const wall = device ? floor.walls.find((w) => w.id === device.wallId) : null;
      if (device) {
        content = (
          <ElectricalProperties
            device={device}
            wall={wall}
            dispatch={dispatch}
            floorId={activeFloorId}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'column') {
      const column = (floor.columns || []).find((c) => c.id === selectedId);
      if (column) {
        content = (
          <ColumnProperties
            column={column}
            floor={floor}
            dispatch={dispatch}
            floorId={activeFloorId}
            editorDispatch={editorDispatch}
            u={u}
            phases={phases}
          />
        );
      }
    } else if (selectedType === 'fixture') {
      const fixture = (floor.fixtures || []).find((f) => f.id === selectedId);
      if (fixture) {
        content = (
          <FixtureProperties fixture={fixture} dispatch={dispatch} floorId={activeFloorId} u={u} phases={phases} />
        );
      }
    } else if (selectedType === 'railing') {
      const railing = (floor.railings || []).find((r) => r.id === selectedId);
      if (railing) {
        content = (
          <RailingProperties railing={railing} dispatch={dispatch} floorId={activeFloorId} u={u} phases={phases} />
        );
      }
    } else if (selectedType === 'room') {
      const room = floor.rooms.find((r) => r.id === selectedId);
      if (room) {
        content = <RoomProperties room={room} dispatch={dispatch} floorId={activeFloorId} phases={phases} />;
      }
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelIdentity}>
          <div className={styles.panelKind}>{selectionLabel(selectedType, floor?.name)}</div>
          <div className={styles.panelKindMeta}>{selectionMeta(selectedType, selectedId)}</div>
        </div>
        <div className={styles.segmentControl}>
          <button
            className={u.unit === 'mm' ? styles.segmentBtnActive : styles.segmentBtn}
            onClick={() => u.setUnit('mm')}
            aria-label="Show measurements in millimetres"
          >
            mm
          </button>
          <button
            className={u.unit === 'm' ? styles.segmentBtnActive : styles.segmentBtn}
            onClick={() => u.setUnit('m')}
            aria-label="Show measurements in metres"
          >
            m
          </button>
        </div>
      </div>
      <div className={styles.panelBody}>
        {workspaceMode === 'sheet' && sheet && <SheetExportMenu sheet={sheet} editorDispatch={editorDispatch} />}
        {activeTool === TOOLS.FILLET && modelTarget === 'floor' && workspaceMode === 'model' && (
          <div>
            <div className={styles.title}>Fillet Tool</div>
            <div className={styles.subtitle}>Settings</div>
            <InputField
              label="Radius"
              type="number"
              suffix={u.suffix}
              step={u.step(FILLET_DEFAULT_RADIUS / 4)}
              value={u.toDisplay(toolState.radius ?? FILLET_DEFAULT_RADIUS)}
              onChange={(v) => {
                const mm = u.fromDisplay(v);
                const clamped = Math.max(FILLET_MIN_RADIUS, Math.min(FILLET_MAX_RADIUS, mm));
                editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { ...toolState, radius: clamped } });
              }}
            />
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: '8px 0 0', lineHeight: 1.4 }}>
              Click a corner where two walls meet to round it. Use [ / ] to adjust radius.
            </p>
          </div>
        )}
        {activeTool === TOOLS.WALL && modelTarget === 'floor' && toolState.start && workspaceMode === 'model' && (
          <WallDrawingInput
            start={toolState.start}
            preview={toolState.preview}
            dispatch={dispatch}
            editorDispatch={editorDispatch}
            activeFloorId={activeFloorId}
            u={u}
          />
        )}
        {content}
      </div>
      {selectedId && selectedType !== 'floor' && (
        <div className={styles.panelFooter}>
          <button className={styles.deleteBtn} onClick={handleDelete}>
            Delete {OBJECT_NOUNS[selectedType] || 'object'}
          </button>
        </div>
      )}
    </div>
  );
}
