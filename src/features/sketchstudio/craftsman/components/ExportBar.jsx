import { useCallback, useState } from 'react';
import { downloadDxf } from '../export/dxfExport';
import { downloadSvg } from '../export/svgExport';
import { printEntities } from '../export/pdfExport';
import { generateWorkshopZip } from '../export/workshopExport';
import Toast from '../../components/Toast';
import styles from '../styles/craftsman.module.css';

const DEFAULT_KERF = 0.2; // mm, typical laser kerf

export default function ExportBar({
  entities,
  referenceEntities = entities,
  selectedIds,
  bomRows,
  totalCost,
  costByMaterial,
  projectName,
}) {
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
      downloadDxf(entities, 'sketch-all.dxf', { ...kerfOption, referenceEntities });
    } catch (err) {
      showToast(`DXF export failed: ${err.message}`);
    }
  }, [entities, kerfOption, referenceEntities, showToast]);

  const handleDxfSelected = useCallback(() => {
    try {
      downloadDxf(entities, 'sketch-selected.dxf', {
        selectedOnly: true,
        selectedIds,
        ...kerfOption,
        referenceEntities,
      });
    } catch (err) {
      showToast(`DXF export failed: ${err.message}`);
    }
  }, [entities, selectedIds, kerfOption, referenceEntities, showToast]);

  const handleSvgAll = useCallback(() => {
    try {
      downloadSvg(entities, 'sketch-all.svg', { referenceEntities });
    } catch (err) {
      showToast(`SVG export failed: ${err.message}`);
    }
  }, [entities, referenceEntities, showToast]);

  const handleSvgSelected = useCallback(() => {
    try {
      downloadSvg(entities, 'sketch-selected.svg', { selectedOnly: true, selectedIds, referenceEntities });
    } catch (err) {
      showToast(`SVG export failed: ${err.message}`);
    }
  }, [entities, selectedIds, referenceEntities, showToast]);

  const handlePdf = useCallback(() => {
    try {
      printEntities(entities, { referenceEntities });
    } catch (err) {
      showToast(`PDF export failed: ${err.message}`);
    }
  }, [entities, referenceEntities, showToast]);

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
        { ...kerfOption, referenceEntities },
      );
      if (result.errors.length) {
        showToast(`Workshop package exported with warnings:\n${result.errors.join(', ')}`, 'warning');
      }
    } catch (err) {
      showToast(`Workshop export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }, [entities, bomRows, totalCost, costByMaterial, projectName, kerfOption, exporting, referenceEntities, showToast]);

  const hasSelection = selectedIds?.length > 0;

  return (
    <div className={styles.exportBar}>
      <button type="button" onClick={handleWorkshopExport} className={styles.workshopExportBtn} disabled={exporting}>
        {exporting ? 'Exporting...' : 'Workshop Package'}
      </button>

      <span className={styles.exportDivider} />

      <span className={styles.exportLabel}>Individual:</span>
      <button type="button" onClick={handleDxfAll} className={styles.exportBtn}>
        DXF
      </button>
      {hasSelection && (
        <button type="button" onClick={handleDxfSelected} className={styles.exportBtn}>
          DXF (sel)
        </button>
      )}
      <button type="button" onClick={handleSvgAll} className={styles.exportBtn}>
        SVG
      </button>
      {hasSelection && (
        <button type="button" onClick={handleSvgSelected} className={styles.exportBtn}>
          SVG (sel)
        </button>
      )}
      <button type="button" onClick={handlePdf} className={styles.exportBtn}>
        PDF 1:1
      </button>

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
