import { useState } from 'react';
import { useSketchEditor } from '../app/SketchEditorProvider';
import { useSketch } from '../app/SketchProvider';
import { useSketchProject } from '../SketchWorkspace';
import { SKETCH_TOOLS } from '../domain/defaults';
import { downloadSketchSvg } from '../export/sketchSheetExport';
import { createSheetViewport } from '@/domain/sheetModels';
import { exportActiveSheetAsPdf, exportActiveSheetAsPng } from '@/export/sheetExport';
import styles from './SketchToolbar.module.css';

const drawingTools = [
  { tool: SKETCH_TOOLS.SELECT, label: 'Select', shortcut: 'V', icon: 'cursor' },
  { tool: SKETCH_TOOLS.LINE, label: 'Line', shortcut: 'L', icon: 'line' },
  { tool: SKETCH_TOOLS.SOLID, label: 'Profile', shortcut: 'S', icon: 'solid' },
  { tool: SKETCH_TOOLS.PANEL, label: 'Panel', shortcut: 'P', icon: 'panel' },
  { tool: SKETCH_TOOLS.LEG, label: 'Leg', shortcut: 'G', icon: 'leg' },
  { tool: SKETCH_TOOLS.FRAME, label: 'Frame', shortcut: 'F', icon: 'frame' },
  { tool: SKETCH_TOOLS.FREEFORM, label: 'Freeform', shortcut: '3', icon: 'freeform' },
];

const constructionTools = [
  { tool: SKETCH_TOOLS.GUIDE_POINT, label: 'Guide Point', shortcut: 'I', icon: 'guide-point' },
  { tool: SKETCH_TOOLS.GUIDE_LINE, label: 'Guide Line', shortcut: 'K', icon: 'guide-line' },
  { tool: SKETCH_TOOLS.REFERENCE_PLANE, label: 'Reference Plane', shortcut: '[', icon: 'reference-plane' },
  { tool: SKETCH_TOOLS.SECTION_PLANE, label: 'Section Plane', shortcut: ']', icon: 'section-plane' },
];

const PLANE_MODES = [
  { mode: 'camera', label: 'Camera' },
  { mode: 'ground', label: 'Ground' },
  { mode: 'front', label: 'Front' },
  { mode: 'side', label: 'Side' },
];

const modificationTools = [
  { tool: SKETCH_TOOLS.PUSH_PULL, label: 'Push/Pull', shortcut: 'E', icon: 'pushpull' },
  { tool: SKETCH_TOOLS.MOVE, label: 'Move', shortcut: 'T', icon: 'move' },
  { tool: SKETCH_TOOLS.ROTATE, label: 'Rotate', shortcut: 'R', icon: 'rotate' },
  { tool: SKETCH_TOOLS.ERASER, label: 'Eraser', shortcut: 'X', icon: 'eraser' },
];

const utilityTools = [
  { tool: SKETCH_TOOLS.MEASURE, label: 'Measure', shortcut: 'D', icon: 'measure' },
];

const toolItems = [...drawingTools, ...constructionTools, ...modificationTools, ...utilityTools];

const cameraPresets = [
  { preset: 'plan_aligned', label: 'Top' },
  { preset: 'front_aligned', label: 'Front' },
  { preset: 'side_aligned', label: 'Side' },
  { preset: 'bottom_aligned', label: 'Bottom' },
  { preset: 'default', label: 'Perspective' },
];

const viewportSourceOptions = [
  { value: 'sketch_object_top', label: 'Object Top' },
  { value: 'sketch_object_front', label: 'Object Front' },
  { value: 'sketch_object_side', label: 'Object Side' },
  { value: 'sketch_part_detail', label: 'Part Detail' },
  { value: 'sketch_part_list', label: 'Parts List' },
  { value: 'sketch_assembly_top', label: 'Assembly Top (Legacy)' },
  { value: 'sketch_assembly_front', label: 'Assembly Front (Legacy)' },
  { value: 'sketch_assembly_side', label: 'Assembly Side (Legacy)' },
];

function ToolIcon({ icon }) {
  switch (icon) {
    case 'cursor':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M4 2l10 7.5-4.5 1L7 15z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case 'panel':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <rect x="2" y="5" width="14" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case 'solid':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M3 13l4-8 5 3 3-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="3" cy="13" r="1" fill="currentColor" />
          <circle cx="7" cy="5" r="1" fill="currentColor" />
          <circle cx="12" cy="8" r="1" fill="currentColor" />
          <circle cx="15" cy="4" r="1" fill="currentColor" />
        </svg>
      );
    case 'leg':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <rect x="7" y="2" width="4" height="14" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case 'frame':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <rect x="2" y="7" width="14" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case 'cutout':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <rect x="3" y="4" width="12" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <rect x="6" y="6" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
        </svg>
      );
    case 'hole':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 1.5" />
        </svg>
      );
    case 'pushpull':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <rect x="3" y="7" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M11 11V3h4v8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M7 7L11 3" fill="none" stroke="currentColor" strokeWidth="1.0" strokeDasharray="1.5 1" />
          <path d="M9 4l2-1M9 4l1 2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'dimension':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.2" />
          <line x1="3" y1="5" x2="3" y2="13" stroke="currentColor" strokeWidth="1.2" />
          <line x1="15" y1="5" x2="15" y2="13" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="3,9 6,7.5 6,10.5" fill="currentColor" />
          <polygon points="15,9 12,7.5 12,10.5" fill="currentColor" />
        </svg>
      );
    case 'line':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M3 14L8 6l4 5 3-8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'move':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M9 2v14M2 9h14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9 2l-2 3h4zM9 16l-2-3h4zM2 9l3-2v4zM16 9l-3-2v4z" fill="currentColor" />
        </svg>
      );
    case 'rotate':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M14 5A6 6 0 1 0 15 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M14 2v4h-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'eraser':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M5 14l-2-2a1.4 1.4 0 0 1 0-2L11 2l5 5-8 8H5z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 5l5 5" fill="none" stroke="currentColor" strokeWidth="1.0" />
          <line x1="4" y1="16" x2="14" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'measure':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <line x1="2" y1="15" x2="16" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="2" cy="15" r="1.5" fill="currentColor" />
          <circle cx="16" cy="3" r="1.5" fill="currentColor" />
          <line x1="6" y1="12" x2="8" y2="10" stroke="currentColor" strokeWidth="1.0" strokeLinecap="round" />
          <line x1="10" y1="8" x2="12" y2="6" stroke="currentColor" strokeWidth="1.0" strokeLinecap="round" />
        </svg>
      );
    case 'freeform':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M3 14L7 5l4 7 4-10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="3" cy="14" r="1.5" fill="currentColor" />
          <circle cx="7" cy="5" r="1.5" fill="currentColor" />
          <circle cx="11" cy="12" r="1.5" fill="currentColor" />
          <circle cx="15" cy="2" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'guide-point':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <circle cx="9" cy="9" r="2.2" fill="currentColor" />
          <path d="M9 2v4M9 12v4M2 9h4M12 9h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'guide-line':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <circle cx="4" cy="13" r="1.4" fill="currentColor" />
          <circle cx="14" cy="5" r="1.4" fill="currentColor" />
          <path d="M4 13L14 5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5" strokeLinecap="round" />
        </svg>
      );
    case 'reference-plane':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M4 6l6-3 4 2-6 3z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M4 6v6l6 3V9zM10 9l4-2v6l-4 2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case 'section-plane':
      return (
        <svg viewBox="0 0 18 18" className={styles.toolIcon}>
          <path d="M4 6l6-3 4 2-6 3z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M4 6v6l6 3V9zM10 9l4-2v6l-4 2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M2 15h14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function SketchToolbar() {
  const {
    activeTool,
    activeAssemblyId,
    showGrid,
    snapEnabled,
    workspaceMode,
    activeSheetId,
    planeMode,
    selectedId,
    selectedType,
    lastModelSelectedId,
    lastModelSelectedType,
    dispatch: editorDispatch,
  } = useSketchEditor();
  const { project, canUndo, canRedo, dispatch } = useSketch();
  const { handleNew, handleSave, handleLoadClick, setShowTemplateDialog } = useSketchProject();
  const [showAddViewport, setShowAddViewport] = useState(false);

  const isSheetMode = workspaceMode === 'sheet';
  const sheet = isSheetMode
    ? (project.sheets || []).find((entry) => entry.id === activeSheetId)
    : null;

  const resolveViewportSource = (sourceView) => {
    const objects = project.objects || [];
    const assemblies = project.assemblies || [];
    const parts = project.parts.filter((part) => part.type !== 'dimension');
    const contextSelectedId = workspaceMode === 'sheet'
      ? (lastModelSelectedId || selectedId)
      : selectedId;
    const contextSelectedType = workspaceMode === 'sheet'
      ? (lastModelSelectedType || selectedType)
      : selectedType;

    if (sourceView.startsWith('sketch_object')) {
      let objectId = null;
      if (contextSelectedType === 'object') {
        objectId = contextSelectedId;
      } else if (contextSelectedType === 'assembly') {
        objectId = assemblies.find((assembly) => assembly.id === contextSelectedId)?.objectId || null;
      } else if (contextSelectedType === 'part') {
        objectId = parts.find((part) => part.id === contextSelectedId)?.objectId || null;
      } else if (activeAssemblyId) {
        objectId = assemblies.find((assembly) => assembly.id === activeAssemblyId)?.objectId || null;
      }
      objectId = objectId || objects[0]?.id || null;
      if (!objectId) return null;
      return {
        sourceRefId: objectId,
        title: `${objects.find((object) => object.id === objectId)?.name || 'Object'} — ${sourceView.split('_').at(-1)}`,
      };
    }

    if (sourceView.startsWith('sketch_assembly')) {
      let assemblyId = null;
      if (contextSelectedType === 'assembly') {
        assemblyId = contextSelectedId;
      } else if (activeAssemblyId) {
        assemblyId = activeAssemblyId;
      } else if (contextSelectedType === 'part') {
        assemblyId = parts.find((part) => part.id === contextSelectedId)?.assemblyId || null;
      }
      assemblyId = assemblyId || assemblies[0]?.id || null;
      if (!assemblyId) return null;
      return {
        sourceRefId: assemblyId,
        title: `${assemblies.find((assembly) => assembly.id === assemblyId)?.name || 'Module'} — ${sourceView.split('_').at(-1)}`,
      };
    }

    if (sourceView === 'sketch_part_detail') {
      let partId = contextSelectedType === 'part' ? contextSelectedId : null;
      partId = partId || parts[0]?.id || null;
      if (!partId) return null;
      return {
        sourceRefId: partId,
        title: `${parts.find((part) => part.id === partId)?.name || 'Part'} — Detail`,
      };
    }

    if (sourceView === 'sketch_part_list') {
      if (contextSelectedType === 'object') {
        const object = objects.find((entry) => entry.id === contextSelectedId);
        return object
          ? { sourceRefId: object.id, sourceObjectId: object.id, title: `${object.name} — Parts List` }
          : null;
      }

      if (contextSelectedType === 'assembly') {
        const assembly = assemblies.find((entry) => entry.id === contextSelectedId);
        return assembly
          ? { sourceRefId: assembly.id, title: `${assembly.name} — Parts List` }
          : null;
      }

      const fallbackObject = objects[0] || null;
      if (fallbackObject) {
        return {
          sourceRefId: fallbackObject.id,
          sourceObjectId: fallbackObject.id,
          title: `${fallbackObject.name} — Parts List`,
        };
      }

      const fallbackAssembly = assemblies[0] || null;
      if (fallbackAssembly) {
        return {
          sourceRefId: fallbackAssembly.id,
          title: `${fallbackAssembly.name} — Parts List`,
        };
      }

      return { title: 'Parts List' };
    }

    return {};
  };

  const handleUndo = () => {
    if (!canUndo) return;
    dispatch({ type: 'UNDO' });
    editorDispatch({ type: 'DESELECT' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Undid last change.' });
  };

  const handleRedo = () => {
    if (!canRedo) return;
    dispatch({ type: 'REDO' });
    editorDispatch({ type: 'DESELECT' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Redid last change.' });
  };

  const handleAddViewport = (sourceView) => {
    if (!sheet) return;
    const sourceOptions = resolveViewportSource(sourceView);
    if (sourceOptions === null) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Select or create an object, module, or part before adding that viewport type.',
      });
      return;
    }
    const viewport = createSheetViewport(sourceView, null, {
      scale: sourceView === 'sketch_part_list' ? 1 : 5,
      ...sourceOptions,
    });
    dispatch({ type: 'SKETCH_SHEET_VIEWPORT_ADD', sheetId: sheet.id, viewport });
    setShowAddViewport(false);
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: 'Viewport added to sheet.',
    });
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <button className={styles.btn} onClick={handleUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <svg viewBox="0 0 18 18" className={styles.icon}>
            <path d="M6 7l-4 3 4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 10h10a4 4 0 1 1 0 8H8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button className={styles.btn} onClick={handleRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <svg viewBox="0 0 18 18" className={styles.icon}>
            <path d="M12 7l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 10H6a4 4 0 1 0 0 8h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.group}>
        <span className={styles.groupLabel}>Project</span>
        <button className={styles.btn} onClick={handleNew} aria-label="New Project" title="New Project">
          <svg viewBox="0 0 18 18" className={styles.icon}>
            <path d="M4 2h7l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M11 2v4h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
        <button className={styles.btn} onClick={handleSave} aria-label="Save Project" title="Save Project (Ctrl+S)">
          <svg viewBox="0 0 18 18" className={styles.icon}>
            <path d="M14 16H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h8l4 4v9a1 1 0 0 1-1 1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M6 2v5h6V2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 16v-5h6v5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button className={styles.btn} onClick={handleLoadClick} aria-label="Open Project" title="Open Project">
          <svg viewBox="0 0 18 18" className={styles.icon}>
            <path d="M2 6V4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M2 6h14l-2 9H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className={styles.divider} />

      {isSheetMode ? (
        <>
          <div className={styles.group}>
            <button className={styles.btn} onClick={() => editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'model' })} aria-label="Back to Model" title="Back to Model">
              <svg viewBox="0 0 18 18" className={styles.icon}>
                <path d="M10 4L5 9l5 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className={styles.groupLabel}>Model</span>
          </div>

          <div className={styles.divider} />

          <div className={styles.group} style={{ position: 'relative' }}>
            <span className={styles.groupLabel}>Viewport</span>
            <button className={styles.btn} onClick={() => setShowAddViewport((prev) => !prev)} aria-label="Add Viewport" title="Add Viewport">
              <svg viewBox="0 0 18 18" className={styles.icon}>
                <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            {showAddViewport && (
              <div className={styles.dropdown}>
                {viewportSourceOptions.map((option) => (
                  <button key={option.value} className={styles.dropdownItem} onClick={() => handleAddViewport(option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.spacer} />

          <div className={styles.group}>
            <span className={styles.groupLabel}>Export</span>
            <button className={styles.btn} onClick={() => exportActiveSheetAsPdf(sheet?.title || 'sketch-sheet', sheet?.paperSize)} disabled={!sheet} aria-label="Export PDF" title="Export PDF">
              PDF
            </button>
            <button className={styles.btn} onClick={() => exportActiveSheetAsPng(sheet?.title || 'sketch-sheet')} disabled={!sheet} aria-label="Export PNG" title="Export PNG">
              PNG
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            className={styles.newObjectBtn}
            onClick={() => setShowTemplateDialog(true)}
            aria-label="Create Object"
            title="Create free-canvas object or start from template"
          >
            <svg viewBox="0 0 18 18" className={styles.icon}>
              <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Create Object
          </button>

          <div className={styles.divider} />

          <div className={styles.group}>
            <span className={styles.groupLabel}>Camera</span>
            {cameraPresets.map(({ preset, label }) => (
              <button
                key={preset}
                className={styles.toolBtn}
                onClick={() => {
                  // Camera presets are dispatched as a custom event that SketchViewport listens for
                  window.dispatchEvent(new CustomEvent('sketch-camera-preset', { detail: { preset } }));
                }}
                aria-label={`${label} view`}
                title={`${label} camera angle`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.group}>
            <span className={styles.groupLabel}>Display</span>
            <button
              className={`${styles.toggleBtn} ${showGrid ? styles.toggleActive : ''}`}
              onClick={() => editorDispatch({ type: 'TOGGLE_GRID' })}
              aria-label="Toggle Grid"
              title="Toggle Grid"
            >
              <svg viewBox="0 0 18 18" className={styles.icon}>
                <path d="M1 6h16M1 12h16M6 1v16M12 1v16" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
            <button
              className={`${styles.toggleBtn} ${snapEnabled ? styles.toggleActive : ''}`}
              onClick={() => editorDispatch({ type: 'TOGGLE_SNAP' })}
              aria-label="Toggle Snap"
              title="Toggle Snap"
            >
              <svg viewBox="0 0 18 18" className={styles.icon}>
                <circle cx="9" cy="9" r="2" fill="currentColor" />
                <path d="M9 2v4M9 12v4M2 9h4M12 9h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className={styles.divider} />

          <div className={styles.toolPalette}>
            <span className={styles.groupLabel}>Drawing</span>
            {drawingTools.map(({ tool, label, shortcut, icon }) => (
              <button
                key={tool}
                className={activeTool === tool ? styles.toolBtnActive : styles.toolBtn}
                onClick={() => editorDispatch({ type: 'SET_TOOL', tool })}
                aria-label={label}
                title={`${label} (${shortcut})`}
              >
                <ToolIcon icon={icon} />
              </button>
            ))}
          </div>

          {['solid', 'panel', 'leg', 'frame', 'line', 'freeform', 'guide_point', 'guide_line', 'reference_plane', 'section_plane'].includes(activeTool) && (
            <>
              <div className={styles.divider} />
              <div className={styles.group}>
                <span className={styles.groupLabel}>Plane</span>
                {PLANE_MODES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    className={planeMode === mode ? styles.toolBtnActive : styles.toolBtn}
                    onClick={() => editorDispatch({ type: 'SET_PLANE_MODE', mode })}
                    aria-label={`${label} plane`}
                    title={`${label} drawing plane`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className={styles.divider} />

          <div className={styles.toolPalette}>
            <span className={styles.groupLabel}>Modify</span>
            {modificationTools.map(({ tool, label, shortcut, icon }) => (
              <button
                key={tool}
                className={activeTool === tool ? styles.toolBtnActive : styles.toolBtn}
                onClick={() => editorDispatch({ type: 'SET_TOOL', tool })}
                aria-label={label}
                title={`${label} (${shortcut})`}
              >
                <ToolIcon icon={icon} />
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.toolPalette}>
            <span className={styles.groupLabel}>Construct</span>
            {constructionTools.map(({ tool, label, shortcut, icon }) => (
              <button
                key={tool}
                className={activeTool === tool ? styles.toolBtnActive : styles.toolBtn}
                onClick={() => editorDispatch({ type: 'SET_TOOL', tool })}
                aria-label={label}
                title={`${label} (${shortcut})`}
              >
                <ToolIcon icon={icon} />
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.toolPalette}>
            <span className={styles.groupLabel}>Utility</span>
            {utilityTools.map(({ tool, label, shortcut, icon }) => (
              <button
                key={tool}
                className={activeTool === tool ? styles.toolBtnActive : styles.toolBtn}
                onClick={() => editorDispatch({ type: 'SET_TOOL', tool })}
                aria-label={label}
                title={`${label} (${shortcut})`}
              >
                <ToolIcon icon={icon} />
              </button>
            ))}
          </div>

          <div className={styles.spacer} />

          <div className={styles.group}>
            <button
              className={styles.btn}
              onClick={() => downloadSketchSvg(project)}
              disabled={project.parts.length === 0}
              aria-label="Export SVG"
              title="Export SVG Sheet"
            >
              <svg viewBox="0 0 18 18" className={styles.icon}>
                <path d="M3 12v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M9 2v9M6 8l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
