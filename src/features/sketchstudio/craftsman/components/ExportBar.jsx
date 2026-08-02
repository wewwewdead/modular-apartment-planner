import { useCallback, useMemo, useState } from 'react';
import { downloadDxf } from '../export/dxfExport';
import { downloadSvg } from '../export/svgExport';
import { printEntities } from '../export/pdfExport';
import { generateWorkshopZip } from '../export/workshopExport';
import { DEFAULT_BLADE_KERF, DEFAULT_SHEET } from '../utils/nestingOptimizer';
import Toast from '../../components/Toast';
import styles from '../styles/craftsman.module.css';

const DEFAULT_KERF = 0.2; // mm, typical laser kerf

function isSheetStockRow(row) {
  return row?.stockKind !== 'linear' && row?.stockKind !== 'piece' && row?.costBasis !== 'perLinearMeter';
}

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
  const [sheetWidth, setSheetWidth] = useState(DEFAULT_SHEET.width);
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET.height);
  const [bladeKerf, setBladeKerf] = useState(DEFAULT_BLADE_KERF);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  const kerfOption = kerfEnabled ? { kerf: kerfWidth } : {};

  // The cut-list optimizer's own sheet size / blade gap live in NestingPanel's
  // local state, which the export bar cannot read, so the workshop package
  // carries its own copy of the two values the per-sheet DXFs need.
  const hasSheetStock = useMemo(() => (bomRows || []).some(isSheetStockRow), [bomRows]);

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
        {
          ...kerfOption,
          referenceEntities,
          sheetSize: { width: sheetWidth, height: sheetHeight },
          bladeKerf,
        },
      );
      if (result.errors.length) {
        showToast(`Workshop package exported with warnings:\n${result.errors.join(', ')}`, 'warning');
      }
    } catch (err) {
      showToast(`Workshop export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }, [
    entities,
    bomRows,
    totalCost,
    costByMaterial,
    projectName,
    kerfOption,
    exporting,
    referenceEntities,
    sheetWidth,
    sheetHeight,
    bladeKerf,
    showToast,
  ]);

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

      {hasSheetStock && (
        <>
          <span className={styles.exportDivider} />

          <span className={styles.exportLabel} title="Stock sheet for the nested sheet DXFs in the workshop package">
            Sheet:
          </span>
          <input
            type="number"
            className={styles.kerfInput}
            value={sheetWidth}
            min="1"
            step="1"
            onChange={(e) => setSheetWidth(Number(e.target.value) || DEFAULT_SHEET.width)}
            title="Nesting sheet width in mm"
          />
          <span className={styles.nestingSizeX}>x</span>
          <input
            type="number"
            className={styles.kerfInput}
            value={sheetHeight}
            min="1"
            step="1"
            onChange={(e) => setSheetHeight(Number(e.target.value) || DEFAULT_SHEET.height)}
            title="Nesting sheet height in mm"
          />
          <span className={styles.exportLabel} title="Blade gap left between nested parts">
            Gap:
          </span>
          <input
            type="number"
            className={styles.kerfInput}
            value={bladeKerf}
            min="0"
            step="0.5"
            onChange={(e) => setBladeKerf(Number(e.target.value) || DEFAULT_BLADE_KERF)}
            title="Blade gap left between nested parts in mm"
          />
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={clearToast} />}
    </div>
  );
}
