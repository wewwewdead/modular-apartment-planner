import { useCallback, useMemo } from 'react';
import { exportBomWithCost, downloadAsFile, getBomEstimateSummary } from '../../utils/bomExportUtils';
import { isHardwareBomRow } from '../utils/entityBomAdapter';
import styles from '../styles/craftsman.module.css';

function formatMoney(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : '-';
}

function PartsTable({ rows, onRemoveRow, onDuplicateRow, onRemove, onDuplicate }) {
  return (
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
          {rows.map((row, i) => {
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
                    {estimate.costApproximate && <span className={styles.bomEstimateNote}>Approximate cost</span>}
                  </div>
                </td>
                <td className={styles.bomActions}>
                  {onDuplicateRow && (
                    <button
                      type="button"
                      className={styles.bomDuplicateBtn}
                      onClick={() => onDuplicate(row)}
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
                      onClick={() => onRemove(row)}
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
  );
}

/**
 * Hardware is counted, not cut, so it gets its own item/qty/price table instead
 * of zero-width rows in the cutting list. Placement (and removal) of fasteners
 * happens on the canvas, so these rows carry no row actions.
 */
function HardwareTable({ rows }) {
  return (
    <>
      <h4 className={styles.panelTitle}>Hardware</h4>
      <div className={styles.bomTableWrap}>
        <table className={styles.bomTable}>
          <colgroup>
            <col style={{ width: '52%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.hardwareId || row.material || `hardware-${i}`}>
                <td>{row.partName || row.materialName || row.material}</td>
                <td>{row.quantity}</td>
                <td>{formatMoney(row.unitCost)}</td>
                <td>{row.totalCost > 0 ? formatMoney(row.totalCost) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function BomPanel({ bomRows, totalCost, costByMaterial, onRemoveRow, onDuplicateRow }) {
  const handleExportCSV = useCallback(() => {
    const content = exportBomWithCost(bomRows, 'csv', { rows: bomRows, totalCost, costByMaterial });
    downloadAsFile(content, 'cutting-list.csv', 'text/csv');
  }, [bomRows, totalCost, costByMaterial]);

  const handleExportJSON = useCallback(() => {
    const content = exportBomWithCost(bomRows, 'json', { rows: bomRows, totalCost, costByMaterial });
    downloadAsFile(content, 'cutting-list.json', 'application/json');
  }, [bomRows, totalCost, costByMaterial]);

  const handleRemove = useCallback(
    (row) => {
      if (!onRemoveRow || !row.entityIds?.length) return;
      onRemoveRow(row.entityIds, null);
    },
    [onRemoveRow],
  );

  const handleDuplicate = useCallback(
    (row) => {
      if (!onDuplicateRow || !row.entityIds?.length) return;
      onDuplicateRow(row.entityIds);
    },
    [onDuplicateRow],
  );

  const { partRows, hardwareRows } = useMemo(
    () => ({
      partRows: bomRows.filter((row) => !isHardwareBomRow(row)),
      hardwareRows: bomRows.filter(isHardwareBomRow),
    }),
    [bomRows],
  );

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
      {partRows.length > 0 && (
        <PartsTable
          rows={partRows}
          onRemoveRow={onRemoveRow}
          onDuplicateRow={onDuplicateRow}
          onRemove={handleRemove}
          onDuplicate={handleDuplicate}
        />
      )}
      {hardwareRows.length > 0 && <HardwareTable rows={hardwareRows} />}
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
          <button type="button" onClick={handleExportCSV} className={styles.exportBtn}>
            Export CSV
          </button>
          <button type="button" onClick={handleExportJSON} className={styles.exportBtn}>
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}
