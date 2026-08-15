import { useCallback, useMemo, useState } from 'react';
import { downloadDxf } from '../export/dxfExport';
import { DEFAULT_BIT_DIAMETER, DOGBONE_STYLES } from '../export/dogboneUtils';
import { downloadSvg } from '../export/svgExport';
import { printEntities } from '../export/pdfExport';
import { printTemplatePdf } from '../export/templatePdfExport';
import { DEFAULT_OVERLAP_MM, MIN_OVERLAP_MM } from '../export/pageTilingUtils';
import { generateWorkshopZip } from '../export/workshopExport';
import { DEFAULT_BLADE_KERF, DEFAULT_SHEET } from '../utils/nestingOptimizer';
import { DEFAULT_CUT_KERF_MM } from '../utils/linearStockOptimizer';
import Toast from '../../components/Toast';
import styles from '../styles/craftsman.module.css';

const DEFAULT_KERF = 0.2; // mm, typical laser kerf

const TEMPLATE_PAGE_OPTIONS = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
];

function isLinearStockRow(row) {
  if (row?.stockKind === 'piece' || row?.role === 'hardware') return false;
  return row?.stockKind === 'linear' || row?.costBasis === 'perLinearMeter';
}

const DOGBONE_STYLE_OPTIONS = [
  { value: DOGBONE_STYLES.DOGBONE, label: 'Dogbone (bisector)' },
  { value: DOGBONE_STYLES.TBONE_X, label: 'T-bone (X wall)' },
  { value: DOGBONE_STYLES.TBONE_Y, label: 'T-bone (Y wall)' },
];

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
  const [dogboneEnabled, setDogboneEnabled] = useState(false);
  const [dogboneStyle, setDogboneStyle] = useState(DOGBONE_STYLES.DOGBONE);
  const [bitDiameter, setBitDiameter] = useState(DEFAULT_BIT_DIAMETER);
  const [sheetWidth, setSheetWidth] = useState(DEFAULT_SHEET.width);
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET.height);
  const [bladeKerf, setBladeKerf] = useState(DEFAULT_BLADE_KERF);
  const [templatePageId, setTemplatePageId] = useState('a4');
  const [templateOverlap, setTemplateOverlap] = useState(DEFAULT_OVERLAP_MM);
  const [cutKerf, setCutKerf] = useState(DEFAULT_CUT_KERF_MM);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  // Both fabrication settings live in component state, exactly like the kerf
  // setting they sit next to: they describe the machine in front of the operator
  // right now, not the document, so they are not persisted with the sketch.
  const kerfOption = kerfEnabled ? { kerf: kerfWidth } : {};
  const dogboneOption = dogboneEnabled ? { dogbone: { style: dogboneStyle, bitDiameter } } : {};
  const cutOptions = { ...kerfOption, ...dogboneOption };

  // The cut-list optimizer's own sheet size / blade gap live in NestingPanel's
  // local state, which the export bar cannot read, so the workshop package
  // carries its own copy of the two values the per-sheet DXFs need.
  const hasSheetStock = useMemo(() => (bomRows || []).some(isSheetStockRow), [bomRows]);
  // The 1D cut-list kerf only means anything when something is cut to length.
  const hasLinearStock = useMemo(() => (bomRows || []).some(isLinearStockRow), [bomRows]);

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const handleDxfAll = useCallback(() => {
    try {
      downloadDxf(entities, 'sketch-all.dxf', { ...cutOptions, referenceEntities });
    } catch (err) {
      showToast(`DXF export failed: ${err.message}`);
    }
  }, [entities, cutOptions, referenceEntities, showToast]);

  const handleDxfSelected = useCallback(() => {
    try {
      downloadDxf(entities, 'sketch-selected.dxf', {
        selectedOnly: true,
        selectedIds,
        ...cutOptions,
        referenceEntities,
      });
    } catch (err) {
      showToast(`DXF export failed: ${err.message}`);
    }
  }, [entities, selectedIds, cutOptions, referenceEntities, showToast]);

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

  const handleTemplatePdf = useCallback(
    (selectedOnly) => {
      try {
        printTemplatePdf(entities, {
          referenceEntities,
          selectedOnly,
          selectedIds,
          pageId: templatePageId,
          overlapMm: templateOverlap,
        });
      } catch (err) {
        showToast(`Template export failed: ${err.message}`);
      }
    },
    [entities, referenceEntities, selectedIds, templatePageId, templateOverlap, showToast],
  );

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
          ...cutOptions,
          referenceEntities,
          sheetSize: { width: sheetWidth, height: sheetHeight },
          bladeKerf,
          cutKerfMm: cutKerf,
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
    cutOptions,
    exporting,
    referenceEntities,
    sheetWidth,
    sheetHeight,
    bladeKerf,
    cutKerf,
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
      <button
        type="button"
        onClick={() => handleTemplatePdf(false)}
        className={styles.exportBtn}
        title="Full-scale paper template, tiled across pages with registration crosses and glue tabs"
      >
        PDF Template
      </button>
      {hasSelection && (
        <button type="button" onClick={() => handleTemplatePdf(true)} className={styles.exportBtn}>
          Template (sel)
        </button>
      )}
      <select
        className={styles.kerfInput}
        value={templatePageId}
        onChange={(e) => setTemplatePageId(e.target.value)}
        title="Paper size for the tiled template"
      >
        {TEMPLATE_PAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        className={styles.kerfInput}
        value={templateOverlap}
        min={MIN_OVERLAP_MM}
        step="1"
        onChange={(e) => setTemplateOverlap(Number(e.target.value) || DEFAULT_OVERLAP_MM)}
        title="Glue-tab overlap between template pages, in mm"
      />

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

      <label className={styles.kerfToggle}>
        <input type="checkbox" checked={dogboneEnabled} onChange={(e) => setDogboneEnabled(e.target.checked)} />
        <span title="Corner relief so a round bit can reach square inside corners">Dogbone</span>
      </label>
      {dogboneEnabled && (
        <>
          <select
            className={styles.kerfInput}
            value={dogboneStyle}
            onChange={(e) => setDogboneStyle(e.target.value)}
            title="Corner relief style"
          >
            {DOGBONE_STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            className={styles.kerfInput}
            value={bitDiameter}
            min="0.1"
            max="25"
            step="0.05"
            onChange={(e) => setBitDiameter(Number(e.target.value) || DEFAULT_BIT_DIAMETER)}
            title="Cutter diameter in mm"
          />
        </>
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

      {hasLinearStock && (
        <>
          <span className={styles.exportDivider} />

          <span className={styles.exportLabel} title="Saw kerf charged per cut in the workshop package's cutlist.csv">
            Cut kerf:
          </span>
          <input
            type="number"
            className={styles.kerfInput}
            value={cutKerf}
            min="0"
            step="0.5"
            onChange={(e) => setCutKerf(Number(e.target.value) || 0)}
            title="Saw kerf per cut, in mm"
          />
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={clearToast} />}
    </div>
  );
}
