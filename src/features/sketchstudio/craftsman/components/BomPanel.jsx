import { useCallback } from 'react';
import { exportBomWithCost, downloadAsFile } from '../../utils/bomExportUtils';
import styles from '../styles/craftsman.module.css';

export default function BomPanel({ bomRows, totalCost, costByMaterial }) {
  const handleExportCSV = useCallback(() => {
    const content = exportBomWithCost(bomRows, 'csv', { rows: bomRows, totalCost, costByMaterial });
    downloadAsFile(content, 'cutting-list.csv', 'text/csv');
  }, [bomRows, totalCost, costByMaterial]);

  const handleExportJSON = useCallback(() => {
    const content = exportBomWithCost(bomRows, 'json', { rows: bomRows, totalCost, costByMaterial });
    downloadAsFile(content, 'cutting-list.json', 'application/json');
  }, [bomRows, totalCost, costByMaterial]);

  if (!bomRows.length) {
    return (
      <div className={styles.bomPanel}>
        <h3 className={styles.panelTitle}>Bill of Materials</h3>
        <p className={styles.emptyMessage}>Assign materials to entities to see the cutting list.</p>
      </div>
    );
  }

  return (
    <div className={styles.bomPanel}>
      <h3 className={styles.panelTitle}>Bill of Materials</h3>
      <div className={styles.bomTableWrap}>
        <table className={styles.bomTable}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Part</th>
              <th>Material</th>
              <th>W</th>
              <th>H</th>
              <th>T</th>
              <th>Qty</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {bomRows.map((row, i) => (
              <tr key={`${row.partName}-${row.material}-${i}`}>
                <td>{row.partName}</td>
                <td className={styles.materialCell}>{row.materialName || row.material}</td>
                <td>{Math.round(row.width)}</td>
                <td>{Math.round(row.height)}</td>
                <td>{row.thickness}</td>
                <td>{row.quantity}</td>
                <td>{row.totalCost > 0 ? `$${row.totalCost.toFixed(2)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.bomFooter}>
        <div className={styles.totalCost}>
          Total: <strong>${totalCost.toFixed(2)}</strong>
        </div>
        {Object.keys(costByMaterial).length > 0 && (
          <div className={styles.costBreakdown}>
            {Object.entries(costByMaterial).map(([matId, cost]) => (
              <div key={matId} className={styles.costRow}>
                <span>{matId}</span>
                <span>${cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
        <div className={styles.exportButtons}>
          <button type="button" onClick={handleExportCSV} className={styles.exportBtn}>Export CSV</button>
          <button type="button" onClick={handleExportJSON} className={styles.exportBtn}>Export JSON</button>
        </div>
      </div>
    </div>
  );
}
