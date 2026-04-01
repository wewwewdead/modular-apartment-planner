import { useCallback, useState } from 'react';
import { downloadDxf } from '../export/dxfExport';
import { downloadSvg } from '../export/svgExport';
import { printEntities } from '../export/pdfExport';
import styles from '../styles/craftsman.module.css';

const DEFAULT_KERF = 0.2; // mm, typical laser kerf

export default function ExportBar({ entities, selectedIds }) {
  const [kerfEnabled, setKerfEnabled] = useState(false);
  const [kerfWidth, setKerfWidth] = useState(DEFAULT_KERF);

  const kerfOption = kerfEnabled ? { kerf: kerfWidth } : {};

  const handleDxfAll = useCallback(() => {
    downloadDxf(entities, 'sketch-all.dxf', kerfOption);
  }, [entities, kerfOption]);

  const handleDxfSelected = useCallback(() => {
    downloadDxf(entities, 'sketch-selected.dxf', { selectedOnly: true, selectedIds, ...kerfOption });
  }, [entities, selectedIds, kerfOption]);

  const handleSvgAll = useCallback(() => {
    downloadSvg(entities, 'sketch-all.svg');
  }, [entities]);

  const handleSvgSelected = useCallback(() => {
    downloadSvg(entities, 'sketch-selected.svg', { selectedOnly: true, selectedIds });
  }, [entities, selectedIds]);

  const handlePdf = useCallback(() => {
    printEntities(entities);
  }, [entities]);

  const hasSelection = selectedIds?.length > 0;

  return (
    <div className={styles.exportBar}>
      <span className={styles.exportLabel}>Export:</span>
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
    </div>
  );
}
