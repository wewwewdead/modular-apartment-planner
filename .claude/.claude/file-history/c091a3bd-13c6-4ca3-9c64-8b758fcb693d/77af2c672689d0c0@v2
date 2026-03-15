import { useCallback, useEffect } from 'react';
import { useEditor } from '@/app/EditorProvider';
import { useProject } from '@/app/ProjectProvider';
import { usePlanClipboardController } from '@/clipboard/usePlanClipboardController';
import { TOOLS } from '@/editor/tools';
import { detectRooms } from '@/geometry/roomDetection';
import { createRoom } from '@/domain/models';
import { isTypingTarget } from '@/utils/keyboard';
import {
  NewIcon, SaveIcon, LoadIcon, UndoIcon, RedoIcon,
  CopyIcon, CutIcon, PasteIcon,
  SelectIcon, DimensionIcon, WallIcon, BeamIcon, StairIcon,
  SectionCutIcon, SlabIcon, RoomIcon, DoorIcon, WindowIcon,
  ColumnIcon, LandingIcon,
  GridIcon, SnapIcon, DetectRoomsIcon,
  SidebarIcon, PropertiesIcon,
} from './ToolbarIcons';
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
];

export default function Toolbar({
  onNew,
  onSave,
  onLoad,
  isSidebarCollapsed,
  isPropertiesCollapsed,
  onToggleSidebar,
  onToggleProperties,
}) {
  const { activeTool, showGrid, snapEnabled, activeFloorId, viewMode, workspaceMode, dispatch: editorDispatch } = useEditor();
  const { project, isDirty, canUndo, canRedo, dispatch } = useProject();
  const {
    canCopySelection,
    canPaste,
    copySelection,
    cutSelection,
    beginPaste,
  } = usePlanClipboardController();
  const isPlanView = workspaceMode === 'model' && viewMode === 'plan';

  const setTool = (tool) => editorDispatch({ type: 'SET_TOOL', tool });

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

  const handleDetectRooms = () => {
    const floor = project.floors.find(f => f.id === activeFloorId);
    if (!floor || floor.walls.length < 3) {
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Draw at least 3 walls first.' });
      return;
    }
    const detected = detectRooms(floor.walls, floor.columns || []);
    const rooms = detected.map((d, i) => createRoom(`Room ${i + 1}`, d.points));
    dispatch({ type: 'ROOMS_SET', floorId: activeFloorId, rooms });
    editorDispatch({ type: 'DESELECT' });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: rooms.length ? `Detected ${rooms.length} room${rooms.length === 1 ? '' : 's'}.` : 'No enclosed rooms detected.',
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

  const activeViewKey = workspaceMode === 'sheet' ? 'sheets' :
    viewModes.find(v => v.viewMode === viewMode)?.key || 'plan';

  return (
    <div className={styles.toolbar}>
      {/* File & clipboard actions */}
      <div className={styles.group}>
        <button className={styles.btn} onClick={onNew} title="New Project">
          <NewIcon className={styles.icon} />
        </button>
        <button
          className={styles.btn}
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <UndoIcon className={styles.icon} />
        </button>
        <button
          className={styles.btn}
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <RedoIcon className={styles.icon} />
        </button>
        <button
          className={styles.saveBtn}
          onClick={onSave}
          title="Save (Ctrl+S)"
          data-dirty={isDirty}
        >
          <SaveIcon className={styles.icon} />
        </button>
        <div className={styles.divider} />
        <button className={styles.btn} onClick={onLoad} title="Load Project">
          <LoadIcon className={styles.icon} />
        </button>
        <button
          className={styles.btn}
          onClick={copySelection}
          disabled={!canCopySelection}
          title="Copy (Ctrl+C)"
        >
          <CopyIcon className={styles.icon} />
        </button>
        <button
          className={styles.btn}
          onClick={cutSelection}
          disabled={!canCopySelection}
          title="Cut (Ctrl+X)"
        >
          <CutIcon className={styles.icon} />
        </button>
        <button
          className={styles.btn}
          onClick={() => beginPaste()}
          disabled={!canPaste}
          title="Paste (Ctrl+V)"
        >
          <PasteIcon className={styles.icon} />
        </button>
      </div>

      {/* View mode segmented control */}
      <div className={styles.segmentedGroup}>
        {viewModes.map(({ key, label, viewMode: vm }) => (
          <button
            key={key}
            className={activeViewKey === key ? styles.segmentedBtnActive : styles.segmentedBtn}
            onClick={() => editorDispatch({ type: 'SET_VIEW_MODE', viewMode: vm })}
            title={`${label} View`}
          >
            {label}
          </button>
        ))}
        <button
          className={activeViewKey === 'sheets' ? styles.segmentedBtnActive : styles.segmentedBtn}
          onClick={() => editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'sheet' })}
          title="Sheet Workspace"
        >
          Sheets
        </button>
      </div>

      {/* Tool palette - inline row of 12 icons */}
      <div className={styles.toolPalette}>
        {toolItems.map(({ tool, label, shortcut, Icon }) => (
          <button
            key={tool}
            className={activeTool === tool ? styles.toolPaletteBtnActive : styles.toolPaletteBtn}
            onClick={() => setTool(tool)}
            disabled={!isPlanView}
            title={`${label} (${shortcut})`}
            aria-label={label}
          >
            <Icon className={styles.toolPaletteIcon} />
          </button>
        ))}
      </div>

      {/* Panel toggles & utility toggles */}
      <div className={styles.group}>
        <button
          className={`${styles.toggleBtn} ${!isSidebarCollapsed ? styles.toggleActive : ''}`}
          onClick={onToggleSidebar}
          title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
          aria-label={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
        >
          <SidebarIcon className={styles.icon} />
        </button>
        <button
          className={`${styles.toggleBtn} ${!isPropertiesCollapsed ? styles.toggleActive : ''}`}
          onClick={onToggleProperties}
          title={isPropertiesCollapsed ? 'Show Properties' : 'Hide Properties'}
          aria-label={isPropertiesCollapsed ? 'Show Properties' : 'Hide Properties'}
        >
          <PropertiesIcon className={styles.icon} />
        </button>
        <div className={styles.divider} />
        <button
          className={`${styles.toggleBtn} ${showGrid ? styles.toggleActive : ''}`}
          onClick={() => editorDispatch({ type: 'TOGGLE_GRID' })}
          title="Toggle Grid"
          aria-label="Toggle Grid"
        >
          <GridIcon className={styles.icon} />
        </button>
        <button
          className={`${styles.toggleBtn} ${snapEnabled ? styles.toggleActive : ''}`}
          onClick={() => editorDispatch({ type: 'TOGGLE_SNAP' })}
          title="Toggle Snap"
          aria-label="Toggle Snap"
        >
          <SnapIcon className={styles.icon} />
        </button>
        <button
          className={styles.btn}
          onClick={handleDetectRooms}
          title="Auto-detect Rooms"
          disabled={!isPlanView}
          aria-label="Auto-detect Rooms"
        >
          <DetectRoomsIcon className={styles.icon} />
        </button>
      </div>

      <div className={styles.spacer} />
    </div>
  );
}
