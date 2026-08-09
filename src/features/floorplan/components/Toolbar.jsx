import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useEditor } from '@/features/floorplan/context/FloorplanContext';
import { useProject } from '@/features/floorplan/context/FloorplanContext';
import { usePlanClipboardController } from '@/features/floorplan/hooks/usePlanClipboardController';
import { TOOLS } from '@/editor/tools';
import { reconcileFloorRooms } from '@/domain/roomReconcile';
import { getFloorElevation } from '@/domain/floorModels';
import { resolveFloorBeamBearingLevel } from '@/domain/beamLevels';
import { isTypingTarget } from '@/utils/keyboard';
import {
  NewIcon,
  SaveIcon,
  ShareIcon,
  LoadIcon,
  UndoIcon,
  RedoIcon,
  CopyIcon,
  CutIcon,
  PasteIcon,
  SelectIcon,
  DimensionIcon,
  WallIcon,
  BeamIcon,
  StairIcon,
  TrussDrawIcon,
  SectionCutIcon,
  SlabIcon,
  RoomIcon,
  DoorIcon,
  WindowIcon,
  ColumnIcon,
  LandingIcon,
  RailingIcon,
  ParapetIcon,
  DrainIcon,
  OpeningIcon,
  KitchenTopIcon,
  ToiletIcon,
  LavatoryIcon,
  TableIcon,
  TVIcon,
  SofaIcon,
  BedIcon,
  GridIcon,
  SnapIcon,
  DetectRoomsIcon,
  SidebarIcon,
  SunIcon,
  PropertiesIcon,
  FilletIcon,
  ElectricalIcon,
} from '@/ui/ToolbarIcons';
import { siteSupportsSunStudy } from '@/analysis/sunStudyState';
import { ELECTRICAL_DEVICE_DEFAULTS, ELECTRICAL_DEVICE_TYPES, FIXTURE_TYPES } from '@/editor/tools';
import Tooltip from './Tooltip';
import styles from './Toolbar.module.css';

const viewModes = [
  { key: 'plan', label: 'Plan', viewMode: 'plan' },
  { key: 'front', label: 'Front', viewMode: 'elevation_front' },
  { key: 'rear', label: 'Rear', viewMode: 'elevation_rear' },
  { key: 'left', label: 'Left', viewMode: 'elevation_left' },
  { key: 'right', label: 'Right', viewMode: 'elevation_right' },
  { key: 'section', label: 'Section', viewMode: 'section_view' },
];

const toolItems = [
  { tool: TOOLS.SELECT, label: 'Select', shortcut: 'V', Icon: SelectIcon },
  { tool: TOOLS.DIMENSION, label: 'Dimension', shortcut: 'M', Icon: DimensionIcon },
  { tool: TOOLS.WALL, label: 'Wall', shortcut: 'W', Icon: WallIcon },
  { tool: TOOLS.BEAM, label: 'Beam', shortcut: 'B', Icon: BeamIcon },
  { tool: TOOLS.STAIR, label: 'Stair', shortcut: 'T', Icon: StairIcon },
  { tool: TOOLS.SECTION, label: 'Section Cut', shortcut: 'Q', Icon: SectionCutIcon },
  { tool: TOOLS.SLAB, label: 'Slab', shortcut: 'S', Icon: SlabIcon },
  { tool: TOOLS.ROOM, label: 'Room', shortcut: 'R', Icon: RoomIcon },
  { tool: TOOLS.DOOR, label: 'Door', shortcut: 'D', Icon: DoorIcon },
  { tool: TOOLS.WINDOW, label: 'Window', shortcut: 'N', Icon: WindowIcon },
  { tool: TOOLS.COLUMN, label: 'Column', shortcut: 'C', Icon: ColumnIcon },
  { tool: TOOLS.LANDING, label: 'Landing', shortcut: 'L', Icon: LandingIcon },
  { tool: TOOLS.RAILING, label: 'Railing', shortcut: 'H', Icon: RailingIcon },
  { tool: TOOLS.ELECTRICAL, label: 'Electrical', shortcut: 'E', Icon: ElectricalIcon },
  { tool: TOOLS.FILLET, label: 'Fillet', shortcut: 'G', Icon: FilletIcon },
];

// Buttons carry the plan symbol's own lettering rather than a bespoke icon, so
// the palette reads the same way the drawing does.
const electricalDeviceCodes = {
  [ELECTRICAL_DEVICE_TYPES.OUTLET]: 'DUP',
  [ELECTRICAL_DEVICE_TYPES.OUTLET_GFCI]: 'GFCI',
  [ELECTRICAL_DEVICE_TYPES.OUTLET_220V]: '220',
  [ELECTRICAL_DEVICE_TYPES.SWITCH]: 'S',
  [ELECTRICAL_DEVICE_TYPES.SWITCH_3WAY]: 'S3',
  [ELECTRICAL_DEVICE_TYPES.SWITCH_DIMMER]: 'SD',
};

const electricalDeviceItems = Object.values(ELECTRICAL_DEVICE_TYPES).map((deviceType) => ({
  deviceType,
  label: ELECTRICAL_DEVICE_DEFAULTS[deviceType].label,
  code: electricalDeviceCodes[deviceType],
}));

export default function Toolbar({
  onNew,
  onSave,
  onShare,
  onLoad,
  isSidebarCollapsed,
  isPropertiesCollapsed,
  onToggleSidebar,
  onToggleProperties,
}) {
  const {
    activeTool,
    showGrid,
    snapEnabled,
    activeFloorId,
    viewMode,
    workspaceMode,
    modelTarget,
    toolState,
    activePhaseId,
    selectedId,
    selectedType,
    sunStudy,
    dispatch: editorDispatch,
  } = useEditor();
  const { project, isDirty, canUndo, canRedo, dispatch } = useProject();
  const { canCopySelection, canPaste, copySelection, cutSelection, beginPaste } = usePlanClipboardController();
  const activeFloor = (project.floors || []).find((floor) => floor.id === activeFloorId) || null;
  const isPlanView = workspaceMode === 'model' && viewMode === 'plan' && modelTarget === 'floor';
  const isRoofPlanView = workspaceMode === 'model' && viewMode === 'plan' && modelTarget === 'roof';
  const isTrussPlanView = workspaceMode === 'model' && viewMode === 'plan' && modelTarget === 'truss';

  const fixtureItems = [
    { fixtureType: FIXTURE_TYPES.KITCHEN_TOP, label: 'Kitchen Top', Icon: KitchenTopIcon },
    { fixtureType: FIXTURE_TYPES.TOILET, label: 'Toilet', Icon: ToiletIcon },
    { fixtureType: FIXTURE_TYPES.LAVATORY, label: 'Lavatory', Icon: LavatoryIcon },
    { fixtureType: FIXTURE_TYPES.TABLE, label: 'Table', Icon: TableIcon },
    { fixtureType: FIXTURE_TYPES.TV, label: 'TV', Icon: TVIcon },
    { fixtureType: FIXTURE_TYPES.SOFA, label: 'Sofa', Icon: SofaIcon },
    { fixtureType: FIXTURE_TYPES.BED, label: 'Bed', Icon: BedIcon },
  ];

  const setTool = (tool) => {
    editorDispatch({ type: 'SET_TOOL', tool });

    if (tool === TOOLS.BEAM) {
      // Default to the beam that sits on top of the columns: that is the one
      // carrying the storey you are drawing walls on. A floor/slab beam is the
      // deck below and sets no wall height here.
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { beamPlacementMode: 'roof_ring' },
      });
      return;
    }

    if (tool !== TOOLS.TRUSS_DRAW || modelTarget !== 'truss') return;

    const targetTrussSystem =
      selectedType === 'trussSystem'
        ? (project.trussSystems || []).find((entry) => entry.id === selectedId) || null
        : selectedType === 'trussInstance'
          ? (project.trussSystems || []).find((entry) =>
              (entry.trussInstances || []).some((trussInstance) => trussInstance.id === selectedId),
            ) || null
          : null;
    const selectedTrussInstance =
      selectedType === 'trussInstance' && targetTrussSystem
        ? (targetTrussSystem.trussInstances || []).find((entry) => entry.id === selectedId) || null
        : null;
    const lastSystemInstance =
      targetTrussSystem && (targetTrussSystem.trussInstances || []).length
        ? targetTrussSystem.trussInstances[targetTrussSystem.trussInstances.length - 1]
        : null;

    editorDispatch({
      type: 'UPDATE_TOOL_STATE',
      payload: {
        targetTrussSystemId: targetTrussSystem?.id || null,
        trussTypeId: selectedTrussInstance?.trussTypeId || lastSystemInstance?.trussTypeId || null,
        trussMaterial: selectedTrussInstance?.material || lastSystemInstance?.material || null,
      },
    });
  };
  const roofToolItems = [
    { tool: TOOLS.SELECT, label: 'Select', shortcut: 'V', Icon: SelectIcon },
    { tool: TOOLS.ROOF_PARAPET, label: 'Parapet', shortcut: 'P', Icon: ParapetIcon },
    { tool: TOOLS.ROOF_DRAIN, label: 'Drain', shortcut: 'G', Icon: DrainIcon },
    { tool: TOOLS.ROOF_OPENING, label: 'Opening', shortcut: 'O', Icon: OpeningIcon },
  ];
  const trussToolItems = [
    { tool: TOOLS.SELECT, label: 'Select', shortcut: 'V', Icon: SelectIcon },
    { tool: TOOLS.TRUSS_DRAW, label: 'Draw Truss', shortcut: 'T', Icon: TrussDrawIcon },
  ];
  const currentViewModes =
    modelTarget === 'truss'
      ? [
          { key: 'plan', label: 'Plan', viewMode: 'plan' },
          { key: 'detail', label: 'Detail', viewMode: 'truss_detail' },
          { key: 'section', label: 'Section', viewMode: 'section_view' },
        ]
      : viewModes;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    dispatch({ type: 'UNDO' });
    editorDispatch({ type: 'DESELECT' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Undid last change.' });
  }, [canUndo, dispatch, editorDispatch]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    dispatch({ type: 'REDO' });
    editorDispatch({ type: 'DESELECT' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Redid last change.' });
  }, [canRedo, dispatch, editorDispatch]);

  const siteIsLocated = siteSupportsSunStudy(project.building?.site);
  const sunStudyTooltip = siteIsLocated
    ? sunStudy?.enabled
      ? 'Hide Sun & Shadow'
      : 'Show Sun & Shadow'
    : 'Sun & Shadow — set the site location first';

  const handleToggleSunStudy = () => {
    if (!siteIsLocated) {
      // Nothing to show yet. Point at the panel that can fix it rather than
      // silently doing nothing, which is what a disabled button would do.
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Set the site location in the Sun & Shadow panel to cast shadows.',
      });
      document.querySelector('[data-panel="sun-study"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    editorDispatch({ type: 'TOGGLE_SUN_STUDY' });
  };

  const handleDetectRooms = () => {
    const floor = project.floors.find((f) => f.id === activeFloorId);
    if (!floor || floor.walls.length < 3) {
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Draw at least 3 walls first.' });
      return;
    }
    // Full-floor reconcile through the same identity-preserving path as the
    // live-model pipeline: existing room names/colors/phases survive; only
    // genuinely new loops become new rooms, and dead loops are removed.
    const reconciled = reconcileFloorRooms(floor, { phaseId: activePhaseId || null });
    const rooms = reconciled.rooms || [];
    dispatch({ type: 'ROOMS_SET', floorId: activeFloorId, rooms });
    editorDispatch({ type: 'DESELECT' });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: rooms.length
        ? `Detected ${rooms.length} room${rooms.length === 1 ? '' : 's'}.`
        : 'No enclosed rooms detected.',
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      const isUndo = key === 'z' && !e.shiftKey;
      if (!isUndo && !isRedo) return;

      e.preventDefault();
      if (isRedo) {
        handleRedo();
        return;
      }
      handleUndo();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleUndo]);

  const activeViewKey =
    workspaceMode === 'sheet' ? 'sheets' : currentViewModes.find((v) => v.viewMode === viewMode)?.key || 'plan';

  return (
    <div className={styles.toolbar}>
      {/* File & clipboard actions */}
      <div className={styles.group}>
        <Tooltip label="Home">
          <Link to="/" className={styles.homeBtn} aria-label="Back to home">
            <svg
              className={styles.homeBtnChevron}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <svg
              className={styles.homeBtnHouse}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 10.5L12 3l9 7.5" />
              <path d="M5 10v9a1 1 0 001 1h3v-5a1 1 0 011-1h4a1 1 0 011 1v5h3a1 1 0 001-1v-9" />
            </svg>
          </Link>
        </Tooltip>
        <div className={styles.divider} />
        <Tooltip label="New Project">
          <button className={styles.btn} onClick={onNew} aria-label="New Project">
            <NewIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Undo" shortcut="Ctrl+Z">
          <button className={styles.btn} onClick={handleUndo} disabled={!canUndo} aria-label="Undo">
            <UndoIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Redo" shortcut="Ctrl+Shift+Z">
          <button className={styles.btn} onClick={handleRedo} disabled={!canRedo} aria-label="Redo">
            <RedoIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Save" shortcut="Ctrl+S">
          <button className={styles.saveBtn} onClick={onSave} data-dirty={isDirty} aria-label="Save">
            <SaveIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Share Project">
          <button className={styles.btn} onClick={onShare} aria-label="Share Project">
            <ShareIcon className={styles.icon} />
          </button>
        </Tooltip>
        <div className={styles.divider} />
        <Tooltip label="Load Project">
          <button className={styles.btn} onClick={onLoad} aria-label="Load Project">
            <LoadIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Copy" shortcut="Ctrl+C">
          <button
            className={styles.btn}
            onClick={copySelection}
            disabled={!canCopySelection || modelTarget !== 'floor' || workspaceMode !== 'model'}
            aria-label="Copy"
          >
            <CopyIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Cut" shortcut="Ctrl+X">
          <button
            className={styles.btn}
            onClick={cutSelection}
            disabled={!canCopySelection || modelTarget !== 'floor' || workspaceMode !== 'model'}
            aria-label="Cut"
          >
            <CutIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Paste" shortcut="Ctrl+V">
          <button
            className={styles.btn}
            onClick={() => beginPaste()}
            disabled={!canPaste || modelTarget !== 'floor' || workspaceMode !== 'model'}
            aria-label="Paste"
          >
            <PasteIcon className={styles.icon} />
          </button>
        </Tooltip>
      </div>

      <div className={styles.segmentedGroup}>
        <button
          className={
            workspaceMode === 'model' && modelTarget === 'floor' ? styles.segmentedBtnActive : styles.segmentedBtn
          }
          onClick={() => {
            editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'floor' });
            if (viewMode === 'truss_detail') {
              editorDispatch({ type: 'SET_VIEW_MODE', viewMode: 'plan' });
            }
          }}
        >
          Floor
        </button>
        <button
          className={
            workspaceMode === 'model' && modelTarget === 'roof' ? styles.segmentedBtnActive : styles.segmentedBtn
          }
          onClick={() => {
            editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
            if (viewMode === 'truss_detail') {
              editorDispatch({ type: 'SET_VIEW_MODE', viewMode: 'plan' });
            }
          }}
        >
          Roof
        </button>
        <button
          className={
            workspaceMode === 'model' && modelTarget === 'truss' ? styles.segmentedBtnActive : styles.segmentedBtn
          }
          onClick={() => {
            editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'truss' });
            if (viewMode !== 'plan' && viewMode !== 'section_view' && viewMode !== 'truss_detail') {
              editorDispatch({ type: 'SET_VIEW_MODE', viewMode: 'plan' });
            }
          }}
        >
          Truss
        </button>
        <button
          className={workspaceMode === 'sheet' ? styles.segmentedBtnActive : styles.segmentedBtn}
          onClick={() => editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' })}
        >
          Sheets
        </button>
      </div>

      {/* View mode segmented control */}
      <div className={styles.segmentedGroup}>
        {currentViewModes.map(({ key, label, viewMode: vm }) => (
          <button
            key={key}
            className={activeViewKey === key ? styles.segmentedBtnActive : styles.segmentedBtn}
            onClick={() => editorDispatch({ type: 'SET_VIEW_MODE', viewMode: vm })}
          >
            {label}
          </button>
        ))}
      </div>

      {/*
        Sun & Shadow rides with the view modes rather than the Display group.
        It is a view state like Plan or Section, and the Display group sits
        roughly 800px past the fold on a 1680px screen — a toggle nobody can
        see is no better than no toggle at all.
      */}
      <Tooltip label={sunStudyTooltip}>
        <button
          className={`${styles.sunToggle} ${sunStudy?.enabled ? styles.sunToggleActive : ''}`}
          onClick={handleToggleSunStudy}
          aria-label="Toggle Sun and Shadow"
          aria-pressed={Boolean(sunStudy?.enabled)}
        >
          <SunIcon className={styles.sunToggleIcon} />
          <span className={styles.sunToggleLabel}>Sun</span>
        </button>
      </Tooltip>

      {/* Tool palette - inline row of icons */}
      <div className={styles.toolPalette}>
        <span className={styles.groupLabel}>Tools</span>
        {(modelTarget === 'roof' ? roofToolItems : modelTarget === 'truss' ? trussToolItems : toolItems).map(
          ({ tool, label, shortcut, Icon }) => (
            <Tooltip key={tool} label={label} shortcut={shortcut}>
              <button
                className={activeTool === tool ? styles.toolPaletteBtnActive : styles.toolPaletteBtn}
                onClick={() => setTool(tool)}
                disabled={
                  modelTarget === 'roof' ? !isRoofPlanView : modelTarget === 'truss' ? !isTrussPlanView : !isPlanView
                }
                aria-label={label}
              >
                <Icon className={styles.toolPaletteIcon} />
              </button>
            </Tooltip>
          ),
        )}
      </div>

      {activeTool === TOOLS.BEAM && isPlanView && activeFloor ? (
        <div className={styles.segmentedGroup} role="group" aria-label="Beam placement elevation">
          <span className={styles.groupLabel}>Beam level</span>
          <button
            className={toolState.beamPlacementMode === 'floor' ? styles.segmentedBtnActive : styles.segmentedBtn}
            onClick={() => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { beamPlacementMode: 'floor' } })}
            aria-label={`Place floor or slab beam at ${Math.round(getFloorElevation(activeFloor))} millimetres`}
          >
            Floor/slab · {Math.round(getFloorElevation(activeFloor))} mm
          </button>
          <button
            className={toolState.beamPlacementMode !== 'floor' ? styles.segmentedBtnActive : styles.segmentedBtn}
            onClick={() => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { beamPlacementMode: 'roof_ring' } })}
            aria-label={`Place top or roof beam at ${Math.round(resolveFloorBeamBearingLevel(activeFloor))} millimetres`}
          >
            Top/roof · {Math.round(resolveFloorBeamBearingLevel(activeFloor))} mm
          </button>
        </div>
      ) : null}

      {activeTool === TOOLS.ELECTRICAL && isPlanView ? (
        <div className={styles.toolPalette} role="group" aria-label="Electrical device type">
          <span className={styles.groupLabel}>Device</span>
          {electricalDeviceItems.map(({ deviceType, label, code }) => {
            const isActive = (toolState.deviceType || ELECTRICAL_DEVICE_TYPES.OUTLET) === deviceType;
            return (
              <Tooltip key={deviceType} label={label}>
                <button
                  className={isActive ? styles.toolPaletteBtnActive : styles.toolPaletteBtn}
                  onClick={() => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { deviceType } })}
                  aria-label={label}
                  aria-pressed={isActive}
                >
                  {code}
                </button>
              </Tooltip>
            );
          })}
        </div>
      ) : null}

      {/* Fixtures palette */}
      <div className={styles.fixturePalette}>
        <span className={styles.fixturePaletteLabel}>Fixtures</span>
        {fixtureItems.map(({ fixtureType, label, Icon }) => {
          const isActive = activeTool === TOOLS.FIXTURE && toolState.fixtureType === fixtureType;
          return (
            <Tooltip key={fixtureType} label={label} shortcut="F">
              <button
                className={isActive ? styles.toolPaletteBtnActive : styles.toolPaletteBtn}
                onClick={() => {
                  editorDispatch({ type: 'SET_TOOL', tool: TOOLS.FIXTURE });
                  editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { fixtureType, previewRotation: 0 } });
                }}
                disabled={!isPlanView}
                aria-label={label}
              >
                <Icon className={styles.toolPaletteIcon} />
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Panel toggles & utility toggles */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>Panels</span>
        <Tooltip label={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}>
          <button
            className={`${styles.toggleBtn} ${!isSidebarCollapsed ? styles.toggleActive : ''}`}
            onClick={onToggleSidebar}
            aria-label={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
          >
            <SidebarIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label={isPropertiesCollapsed ? 'Show Properties' : 'Hide Properties'}>
          <button
            className={`${styles.toggleBtn} ${!isPropertiesCollapsed ? styles.toggleActive : ''}`}
            onClick={onToggleProperties}
            aria-label={isPropertiesCollapsed ? 'Show Properties' : 'Hide Properties'}
          >
            <PropertiesIcon className={styles.icon} />
          </button>
        </Tooltip>
        <div className={styles.divider} />
        <span className={styles.groupLabel}>Display</span>
        <Tooltip label="Toggle Grid">
          <button
            className={`${styles.toggleBtn} ${showGrid ? styles.toggleActive : ''}`}
            onClick={() => editorDispatch({ type: 'TOGGLE_GRID' })}
            aria-label="Toggle Grid"
          >
            <GridIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Toggle Snap">
          <button
            className={`${styles.toggleBtn} ${snapEnabled ? styles.toggleActive : ''}`}
            onClick={() => editorDispatch({ type: 'TOGGLE_SNAP' })}
            aria-label="Toggle Snap"
          >
            <SnapIcon className={styles.icon} />
          </button>
        </Tooltip>
        <Tooltip label="Auto-detect Rooms">
          <button
            className={styles.btn}
            onClick={handleDetectRooms}
            disabled={!isPlanView}
            aria-label="Auto-detect Rooms"
          >
            <DetectRoomsIcon className={styles.icon} />
          </button>
        </Tooltip>
      </div>

      <div className={styles.spacer} />
    </div>
  );
}
