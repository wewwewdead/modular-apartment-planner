import { useCallback } from 'react';
import { exportBomWithCost, downloadAsFile, getBomEstimateSummary } from '../../utils/bomExportUtils';
import styles from '../styles/craftsman.module.css';

export default function BomPanel({ bomRows, totalCost, costByMaterial, onRemoveRow, onDuplicateRow }) {
  const handleExportCSV = useCallback(() => {
    const content = exportBomWithCost(bomRows, 'csv', { rows: bomRows, totalCost, costByMaterial });
    downloadAsFile(content, 'cutting-list.csv', 'text/csv');
  }, [bomRows, totalCost, costByMaterial]);

  const handleExportJSON = useCallback(() => {
    const content = exportBomWithCost(bomRows, 'json', { rows: bomRows, totalCost, costByMaterial });
    downloadAsFile(content, 'cutting-list.json', 'application/json');
  }, [bomRows, totalCost, costByMaterial]);

  const handleRemove = useCallback((row) => {
    if (!onRemoveRow || !row.entityIds?.length) return;
    onRemoveRow(row.entityIds, null);
  }, [onRemoveRow]);

  const handleDuplicate = useCallback((row) => {
    if (!onDuplicateRow || !row.entityIds?.length) return;
    onDuplicateRow(row.entityIds);
  }, [onDuplicateRow]);

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
            <col style={{ width: '20%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '10%' }} />
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bomRows.map((row, i) => {
              const estimate = getBomEstimateSummary(row);

              return (
                <tr key={row.entityIds?.join(',') || `bom-${i}`}>
                  <td>
                    <div className={styles.bomPartCell}>
                      <span>{row.partName}</span>
                      {estimate.shortLabel && (
                        <span className={styles.bomEstimateBadge} title={estimate.estimateNote || estimate.shortLabel}>
                          {estimate.shortLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={styles.materialCell}>{row.materialName || row.material}</td>
                  <td>{Math.round(row.width)}</td>
                  <td>{Math.round(row.height)}</td>
                  <td>{row.thickness}</td>
                  <td>{row.quantity}</td>
                  <td>
                    <div className={styles.bomCostCell}>
                      <span>{row.totalCost > 0 ? `$${row.totalCost.toFixed(2)}` : '-'}</span>
                      {estimate.costApproximate && (
                        <span className={styles.bomEstimateNote}>Approximate cost</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.bomActions}>
                    {onDuplicateRow && (
                      <button
                        type="button"
                        className={styles.bomDuplicateBtn}
                        onClick={() => handleDuplicate(row)}
                        title={`Duplicate - add another ${row.quantity > 1 ? row.quantity + ' pieces' : 'piece'}`}
                        aria-label={`Duplicate ${row.partName}`}
                      >
                        +
                      </button>
                    )}
                    {onRemoveRow && (
                      <button
                        type="button"
                        className={styles.bomRemoveBtn}
                        onClick={() => handleRemove(row)}
                        title={`Remove ${row.partName} (clears material from ${row.entityIds?.length || 0} entit${row.entityIds?.length === 1 ? 'y' : 'ies'})`}
                        aria-label={`Remove ${row.partName}`}
                      >
                        &times;
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
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
