import { useCallback, useState, useEffect } from 'react';
import { downloadDxf } from '../export/dxfExport';
import { downloadSvg } from '../export/svgExport';
import { printEntities } from '../export/pdfExport';
import { generateWorkshopZip } from '../export/workshopExport';
import styles from '../styles/craftsman.module.css';

const DEFAULT_KERF = 0.2; // mm, typical laser kerf
const TOAST_DURATION = 4000;

function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bgColor = type === 'error' ? '#ff6b6b' : type === 'warning' ? '#d4856b' : '#51cf66';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 60,
        right: 16,
        padding: '10px 16px',
        background: bgColor,
        color: '#1a1a2e',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 9999,
        maxWidth: 320,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      {message}
    </div>
  );
}

export default function ExportBar({ entities, selectedIds, bomRows, totalCost, costByMaterial, projectName }) {
  const [kerfEnabled, setKerfEnabled] = useState(false);
  const [kerfWidth, setKerfWidth] = useState(DEFAULT_KERF);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  const kerfOption = kerfEnabled ? { kerf: kerfWidth } : {};

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const handleDxfAll = useCallback(() => {
    try {
      downloadDxf(entities, 'sketch-all.dxf', kerfOption);
    } catch (err) {
      showToast(`DXF export failed: ${err.message}`);
    }
  }, [entities, kerfOption, showToast]);

  const handleDxfSelected = useCallback(() => {
    try {
      downloadDxf(entities, 'sketch-selected.dxf', { selectedOnly: true, selectedIds, ...kerfOption });
    } catch (err) {
      showToast(`DXF export failed: ${err.message}`);
    }
  }, [entities, selectedIds, kerfOption, showToast]);

  const handleSvgAll = useCallback(() => {
    try {
      downloadSvg(entities, 'sketch-all.svg');
    } catch (err) {
      showToast(`SVG export failed: ${err.message}`);
    }
  }, [entities, showToast]);

  const handleSvgSelected = useCallback(() => {
    try {
      downloadSvg(entities, 'sketch-selected.svg', { selectedOnly: true, selectedIds });
    } catch (err) {
      showToast(`SVG export failed: ${err.message}`);
    }
  }, [entities, selectedIds, showToast]);

  const handlePdf = useCallback(() => {
    try {
      printEntities(entities);
    } catch (err) {
      showToast(`PDF export failed: ${err.message}`);
    }
  }, [entities, showToast]);

  const handleWorkshopExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await generateWorkshopZip(
        entities,
        bomRows || [],
        totalCost || 0,
        costByMaterial || {},
        projectName || 'Untitled Sketch',
        kerfOption,
      );
      if (result.errors.length) {
        showToast(`Workshop package exported with warnings:\n${result.errors.join(', ')}`, 'warning');
      }
    } catch (err) {
      showToast(`Workshop export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }, [entities, bomRows, totalCost, costByMaterial, projectName, kerfOption, exporting, showToast]);

  const hasSelection = selectedIds?.length > 0;

  return (
    <div className={styles.exportBar}>
      <button
        type="button"
        onClick={handleWorkshopExport}
        className={styles.workshopExportBtn}
        disabled={exporting}
      >
        {exporting ? 'Exporting...' : 'Workshop Package'}
      </button>

      <span className={styles.exportDivider} />

      <span className={styles.exportLabel}>Individual:</span>
      <button type="button" onClick={handleDxfAll} className={styles.exportBtn}>DXF</button>
      {hasSelection && <button type="button" onClick={handleDxfSelected} className={styles.exportBtn}>DXF (sel)</button>}
      <button type="button" onClick={handleSvgAll} className={styles.exportBtn}>SVG</button>
      {hasSelection && <button type="button" onClick={handleSvgSelected} className={styles.exportBtn}>SVG (sel)</button>}
      <button type="button" onClick={handlePdf} className={styles.exportBtn}>PDF 1:1</button>

      <span className={styles.exportDivider} />

      <label className={styles.kerfToggle}>
        <input type="checkbox" checked={kerfEnabled} onChange={(e) => setKerfEnabled(e.target.checked)} />
        <span>Kerf</span>
      </label>
      {kerfEnabled && (
        <input
          type="number"
          className={styles.kerfInput}
          value={kerfWidth}
          min="0.05"
          max="5"
          step="0.05"
          onChange={(e) => setKerfWidth(Number(e.target.value) || DEFAULT_KERF)}
          title="Kerf width in mm"
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={clearToast} />}
    </div>
  );
}
