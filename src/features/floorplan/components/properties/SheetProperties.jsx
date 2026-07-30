import { memo, useEffect, useRef, useState } from 'react';
import { getDefaultActiveFloorId } from '@/domain/floorModels';
import { resolveRoofSectionFloor } from '@/domain/roofModels';
import { createSheetRevision, createSheetViewport } from '@/domain/sheetModels';
import { exportActiveSheetAsPdf, exportActiveSheetAsPng } from '@/export/sheetExport';
import { getDefaultViewportRect, materializeSheetViewportFrames } from '@/sheets/layout';
import { listPaperPresets } from '@/sheets/paper';
import { resolveSheetViewportSource } from '@/sheets/sources';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

function SheetExportMenuInner({ sheet, editorDispatch }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const pngOptions = [
    { label: 'PNG 150 DPI', dpi: 150 },
    { label: 'PNG 300 DPI', dpi: 300 },
    { label: 'PNG 600 DPI', dpi: 600 },
  ];

  useEffect(() => {
    if (!open) return undefined;

    const handleMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const handleExport = async (kind, options = {}) => {
    if (!sheet) return;
    try {
      if (kind === 'pdf') {
        await exportActiveSheetAsPdf(sheet.title || sheet.drawingName || 'sheet', sheet.paperSize);
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Exported sheet as PDF.' });
      } else {
        await exportActiveSheetAsPng(sheet.title || sheet.drawingName || 'sheet', options);
        const dpiLabel = options.dpi ? ` (${options.dpi} DPI)` : '';
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: `Exported sheet as PNG${dpiLabel}.` });
      }
    } catch (error) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: error.message || `${kind.toUpperCase()} export failed.`,
      });
    } finally {
      setOpen(false);
    }
  };

  return (
    <div className={styles.exportMenu} ref={rootRef}>
      <button className={styles.exportMenuTrigger} type="button" onClick={() => setOpen((value) => !value)}>
        Export sheet
        <span className={styles.exportMenuChevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className={styles.exportMenuList}>
          <button className={styles.exportMenuItem} type="button" onClick={() => handleExport('pdf')}>
            PDF
          </button>
          {pngOptions.map((option) => (
            <button
              key={option.dpi}
              className={styles.exportMenuItem}
              type="button"
              onClick={() => handleExport('png', { dpi: option.dpi })}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const SheetExportMenu = memo(SheetExportMenuInner);

function SheetProperties({ sheet, project, dispatch, editorDispatch, activeFloorId, modelTarget, viewMode, u }) {
  const updateSheet = (updates) => {
    dispatch({ type: 'SHEET_UPDATE', sheet: { id: sheet.id, ...updates } });
  };

  const updateLayoutTemplate = (nextLayoutTemplate) => {
    if (nextLayoutTemplate === sheet.layoutTemplate) return;

    if (nextLayoutTemplate === 'manual') {
      dispatch({
        type: 'SHEET_UPDATE',
        sheet: materializeSheetViewportFrames(project, sheet),
      });
      return;
    }

    updateSheet({
      layoutTemplate: nextLayoutTemplate,
      viewports: (sheet.viewports || []).map((viewport) => ({
        ...viewport,
        lockAutoLayout: false,
      })),
    });
  };

  const updateTitleBlock = (updates) => {
    updateSheet({
      titleBlock: {
        ...(sheet.titleBlock || {}),
        ...updates,
      },
    });
  };

  const updateRevisions = (nextRevisions) => {
    updateSheet({ revisions: nextRevisions });
  };

  const addViewport = () => {
    try {
      const sourceFloorId =
        modelTarget === 'roof'
          ? resolveRoofSectionFloor(project, activeFloorId)?.id || getDefaultActiveFloorId(project, activeFloorId)
          : getDefaultActiveFloorId(project, activeFloorId);
      const sourceView =
        modelTarget === 'roof'
          ? viewMode === 'section_view'
            ? 'roof_section'
            : viewMode.startsWith('elevation_')
              ? `roof_${viewMode}`
              : 'roof_plan'
          : modelTarget === 'truss'
            ? 'truss_plan'
            : 'plan';
      const viewportBase = createSheetViewport(sourceView, sourceFloorId, {
        scale: 100,
        lockAutoLayout: sheet.layoutTemplate !== 'auto',
      });

      let rect;
      try {
        const source = resolveSheetViewportSource(project, viewportBase);
        rect = getDefaultViewportRect(sheet, source, viewportBase.scale, { role: viewportBase.role });
      } catch {
        // Geometry resolution failed — use default dimensions
        rect = { x: 20, y: 20, width: 160, height: 100 };
      }

      const viewport = { ...viewportBase, ...rect };
      dispatch({ type: 'SHEET_VIEWPORT_ADD', sheetId: sheet.id, viewport });
      editorDispatch({ type: 'SELECT_OBJECT', id: viewport.id, objectType: 'sheetViewport' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Viewport added.' });
    } catch (err) {
      console.error('Failed to add viewport:', err);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Failed to add viewport.' });
    }
  };

  const addRevision = () => {
    updateRevisions([createSheetRevision(), ...(sheet.revisions || [])]);
  };

  const updateRevision = (revisionId, updates) => {
    updateRevisions(
      (sheet.revisions || []).map((revision) => (revision.id === revisionId ? { ...revision, ...updates } : revision)),
    );
  };

  const removeRevision = (revisionId) => {
    updateRevisions((sheet.revisions || []).filter((revision) => revision.id !== revisionId));
  };

  const paperPreset = listPaperPresets().find((preset) => preset.key === sheet.paperSize);
  const titleBlock = sheet.titleBlock || {};
  const projectTitleValue = titleBlock.projectTitleOverride || sheet.projectNameOverride;

  return (
    <div>
      <div className={styles.title}>Sheet</div>
      <InputField label="Title" value={sheet.title} onChange={(value) => updateSheet({ title: value })} />
      <InputField label="Number" value={sheet.number || ''} onChange={(value) => updateSheet({ number: value })} />
      <InputField label="Drawing" value={sheet.drawingName} onChange={(value) => updateSheet({ drawingName: value })} />
      <InputField
        label="Issue Date"
        value={sheet.issueDate || ''}
        onChange={(value) => updateSheet({ issueDate: value })}
      />
      <InputField label="Scale" value={sheet.scaleLabel} onChange={(value) => updateSheet({ scaleLabel: value })} />
      <InputField
        label="Project Title"
        value={projectTitleValue}
        onChange={(value) =>
          updateSheet({
            projectNameOverride: value,
            titleBlock: {
              ...(sheet.titleBlock || {}),
              projectTitleOverride: value,
            },
          })
        }
      />
      <InputField
        label="Address"
        value={titleBlock.projectAddressOverride || ''}
        onChange={(value) => updateTitleBlock({ projectAddressOverride: value })}
      />
      <InputField
        label="Drawn By"
        value={titleBlock.drawnBy || ''}
        onChange={(value) => updateTitleBlock({ drawnBy: value })}
      />
      <InputField
        label="Checked"
        value={titleBlock.checkedBy || ''}
        onChange={(value) => updateTitleBlock({ checkedBy: value })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Scale Mode</label>
        <select
          value={sheet.scaleMode}
          onChange={(e) => updateSheet({ scaleMode: e.target.value })}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <option value="custom">Custom</option>
          <option value="per_viewport">Per viewport</option>
          <option value="as_noted">As noted</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Layout</label>
        <select
          value={sheet.layoutTemplate}
          onChange={(e) => updateLayoutTemplate(e.target.value)}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          <option value="auto">Hybrid Auto</option>
          <option value="manual">Manual Frames</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Paper</label>
        <select
          value={sheet.paperSize}
          onChange={(e) => updateSheet({ paperSize: e.target.value })}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
          }}
        >
          {listPaperPresets().map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      <InputField label="Viewports" value={(sheet.viewports || []).length} readOnly />
      <button className={styles.actionBtn} onClick={addViewport}>
        Add viewport
      </button>
      <InputField label="Width" suffix={u.suffix} value={u.toDisplay(paperPreset?.width || 0)} readOnly />
      <InputField label="Height" suffix={u.suffix} value={u.toDisplay(paperPreset?.height || 0)} readOnly />

      <div className={styles.subtitle}>Revisions</div>
      <button className={styles.actionBtn} onClick={addRevision}>
        Add revision
      </button>
      {(sheet.revisions || []).map((revision) => (
        <div key={revision.id} className={styles.revisionCard}>
          <InputField
            label="Rev"
            value={revision.code}
            onChange={(value) => updateRevision(revision.id, { code: value })}
          />
          <InputField
            label="Date"
            value={revision.date}
            onChange={(value) => updateRevision(revision.id, { date: value })}
          />
          <InputField
            label="Note"
            value={revision.description}
            onChange={(value) => updateRevision(revision.id, { description: value })}
          />
          <button className={styles.deleteBtn} onClick={() => removeRevision(revision.id)}>
            Delete revision
          </button>
        </div>
      ))}
    </div>
  );
}

export default memo(SheetProperties);
