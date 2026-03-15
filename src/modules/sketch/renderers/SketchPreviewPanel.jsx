import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useSketch } from '../app/SketchProvider';
import { useSketchEditor } from '../app/SketchEditorProvider';
import { buildSketchPreviewRoot } from './buildSketchPreview';
import { getSketchInspection } from './sketchPreviewInspection';
import { createPreviewViewport } from '@/three/viewer/createPreviewViewport';
import { disposeScene } from '@/three/viewer/disposeScene';
import CompassOverlay from '@/ui/CompassOverlay';
import { ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import styles from './SketchPreviewPanel.module.css';

export default function SketchPreviewPanel({ isMaximized = false, onToggleMaximize, className = '' }) {
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const rootRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const compassNeedleRef = useRef(null);

  const { project } = useSketch();
  const { selectedId, selectedType, dispatch: editorDispatch } = useSketchEditor();
  const [previewScope, setPreviewScope] = useState('all');

  const previewOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'All Objects' }];
    for (const object of project.objects || []) {
      options.push({ value: `object:${object.id}`, label: object.name });
    }
    if (project.parts.some((part) => !part.objectId && part.type !== 'dimension' && part.type !== 'cutout' && part.type !== 'hole')) {
      options.push({ value: 'manual', label: 'Custom Assemblies' });
    }
    return options;
  }, [project.objects, project.parts]);

  const visibleParts = useMemo(() => {
    const renderable = project.parts.filter(
      (part) => part.type !== 'dimension' && part.type !== 'cutout' && part.type !== 'hole'
    );
    if (previewScope === 'all') return renderable;
    if (previewScope === 'manual') return renderable.filter((part) => !part.objectId);
    if (previewScope.startsWith('object:')) {
      const objectId = previewScope.slice('object:'.length);
      return renderable.filter((part) => part.objectId === objectId);
    }
    return renderable;
  }, [project.parts, previewScope]);

  const inspection = useMemo(
    () => getSketchInspection(project, selectedId, selectedType),
    [project, selectedId, selectedType]
  );

  useEffect(() => {
    if (selectedType === 'object' && selectedId) {
      setPreviewScope(`object:${selectedId}`);
    }
  }, [selectedId, selectedType]);

  const handlePreviewPick = useCallback((target) => {
    if (!target?.sourceId || !target?.kind) {
      editorDispatch({ type: 'DESELECT' });
      return;
    }
    editorDispatch({ type: 'SELECT_OBJECT', id: target.sourceId, objectType: target.kind });
  }, [editorDispatch]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const viewport = createPreviewViewport(container);
    viewport.setNavigationMode('inspect');
    viewportRef.current = viewport;

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => viewport.resize());
      observer.observe(container);
      resizeObserverRef.current = observer;
    }

    viewport.setPickHandler(handlePreviewPick);
    viewport.setCompassHeadingHandler((headingDeg) => {
      if (!compassNeedleRef.current) return;
      compassNeedleRef.current.style.setProperty('--compass-heading', `${headingDeg}deg`);
    });
    viewport.resize();

    return () => {
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;
      if (rootRef.current) {
        disposeScene(rootRef.current, { disposeMaterials: true });
        rootRef.current = null;
      }
      viewport.dispose();
      viewportRef.current = null;
    };
  }, [handlePreviewPick]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (rootRef.current) {
      disposeScene(rootRef.current, { disposeMaterials: true });
    }

    const root = buildSketchPreviewRoot(visibleParts, { selectedId, selectedType });
    rootRef.current = root;

    const box = new THREE.Box3();
    root.updateMatrixWorld(true);
    box.expandByObject(root);

    if (box.isEmpty()) {
      box.set(
        new THREE.Vector3(-500, 0, -300),
        new THREE.Vector3(500, 800, 300)
      );
    }

    viewport.setWorld(root, {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    }, 0);
  }, [visibleParts, selectedId, selectedType]);

  return (
    <section className={`${styles.panel} ${className}`}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.eyebrow}>3D Preview</span>
          <span className={styles.title}>
            {visibleParts.length === 1 ? '1 part' : `${visibleParts.length} parts`}
          </span>
        </div>
        <div className={styles.actions}>
          <select
            className={styles.assemblySelect}
            value={previewOptions.some((option) => option.value === previewScope) ? previewScope : 'all'}
            onChange={(event) => {
              const value = event.target.value;
              setPreviewScope(value);
              if (value.startsWith('object:')) {
                editorDispatch({ type: 'SELECT_OBJECT', id: value.slice('object:'.length), objectType: 'object' });
                return;
              }
              editorDispatch({ type: 'DESELECT' });
            }}
          >
            {previewOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="button" className={styles.button} onClick={() => viewportRef.current?.resetView()}>
            Reset View
          </button>
          {onToggleMaximize && (
            <button
              type="button"
              className={`${styles.button} ${styles.iconButton}`}
              onClick={onToggleMaximize}
              title={isMaximized ? 'Restore split view' : 'Maximize preview'}
              aria-label={isMaximized ? 'Restore split view' : 'Maximize preview'}
            >
              {isMaximized ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          )}
        </div>
      </div>

      <div className={styles.viewportWrap}>
        <div ref={containerRef} className={styles.viewport} />
        <CompassOverlay className={styles.compassDock} needleRef={compassNeedleRef} />
        {inspection && (
          <div className={styles.inspectCard}>
            <span className={styles.inspectEyebrow}>{selectedType === 'object' ? 'Selected Object' : 'Selected Part'}</span>
            <span className={styles.inspectTitle}>{inspection.title}</span>
            <span className={styles.inspectMeta}>{inspection.subtitle}</span>
            <div className={styles.inspectGrid}>
              {inspection.rows.map((row) => (
                <div key={`${inspection.id}-${row.label}`} className={styles.inspectRow}>
                  <span className={styles.inspectLabel}>{row.label}</span>
                  <span className={styles.inspectValue}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {visibleParts.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>No Geometry</span>
            <span className={styles.emptyBody}>
              Create a template-driven object to inspect it in 3D.
            </span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span>Inspect-only preview.</span>
        <span>Orbit: drag · Pan: right drag · Zoom: wheel · Inspect: click object</span>
      </div>
    </section>
  );
}
