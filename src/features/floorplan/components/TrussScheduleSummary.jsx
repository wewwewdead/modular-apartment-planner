import { useMemo } from 'react';
import styles from './PropertiesPanel.module.css';
import { buildTrussSchedule } from '@/truss/trussSchedule';

function formatMetres(lm) {
  return `${lm.toFixed(2)} m`;
}

function formatLength(mm, u) {
  return `${u.toDisplay(mm || 0)}`;
}

/**
 * The truss schedule of a system (docs/roof-truss-industrial.md §7.5), shaped
 * like RoofScheduleSummary: total cards, one row per instance, and the cutting
 * list (each member length rounded up to 100).
 */
export default function TrussScheduleSummary({ trussSystem, systemGeometry = null, roofSystem = null, u }) {
  const schedule = useMemo(
    () => buildTrussSchedule(trussSystem, { systemGeometry, roofSystem }),
    [trussSystem, systemGeometry, roofSystem],
  );
  if (!schedule.rows.length) return null;
  const { totals } = schedule;
  const metrics = [
    { key: 'trusses', label: 'Trusses', value: String(totals.trussCount) },
    {
      key: 'gable-ends',
      label: 'Gable End Frames',
      value: String(totals.gableEndCount),
      show: totals.gableEndCount > 0,
    },
    ...totals.timberBySection.map((entry) => ({
      key: `timber-${entry.key}`,
      label: `Timber ${entry.label}`,
      value: formatMetres(entry.lengthM),
      meta: 'members',
    })),
    { key: 'purlins', label: 'Purlins', value: formatMetres(totals.purlinLm), show: totals.purlinLm > 0 },
    {
      key: 'closures',
      label: 'Closure Area',
      value: `${totals.closureAreaM2.toFixed(2)} m²`,
      show: totals.closureAreaM2 > 0,
    },
  ].filter((metric) => metric.show !== false);

  return (
    <div className={styles.scheduleSection} data-truss-schedule="">
      <div className={styles.subtitle}>Truss Schedule</div>
      <div className={styles.scheduleMetricGrid}>
        {metrics.map((metric) => (
          <div key={metric.key} className={styles.scheduleMetricCard}>
            <div className={styles.scheduleMetricLabel}>{metric.label}</div>
            <div className={styles.scheduleMetricValue}>{metric.value}</div>
            {metric.meta ? <div className={styles.scheduleMetricMeta}>{metric.meta}</div> : null}
          </div>
        ))}
      </div>

      <div className={styles.scheduleTableWrap}>
        <table className={styles.scheduleTable}>
          <thead>
            <tr>
              <th>Mark</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Span</th>
              <th>Pitch</th>
              <th>Heel</th>
              <th>OH A/B</th>
              <th>Members</th>
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row) => (
              <tr key={row.id} data-truss-schedule-row={row.label}>
                <td>{row.label}</td>
                <td>
                  {row.type}
                  <br />
                  {row.pattern}
                </td>
                <td>
                  {row.quantity}
                  {row.gableEnds ? ` (${row.gableEnds} GE)` : ''}
                </td>
                <td>
                  {formatLength(row.span, u)}
                  <br />@ {formatLength(row.spacing, u)}
                </td>
                <td>
                  {row.pitchDegrees.toFixed(1)}°
                  <br />
                  {row.pitchPercent.toFixed(1)} %
                </td>
                <td>{formatLength(row.heelHeight, u)}</td>
                <td>
                  {formatLength(row.overhangStart, u)} / {formatLength(row.overhangEnd, u)}
                </td>
                <td>
                  TC {row.topChord}
                  <br />
                  BC {row.bottomChord}
                  <br />W {row.web}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.subtitle}>Cutting List</div>
      <div className={styles.scheduleTableWrap}>
        <table className={styles.scheduleTable} data-truss-cutting-list="">
          <thead>
            <tr>
              <th>Member</th>
              <th>Section</th>
              <th>Count</th>
              <th>Length</th>
            </tr>
          </thead>
          <tbody>
            {schedule.cuttingList.map((cut) => (
              <tr key={cut.key}>
                <td>{cut.member}</td>
                <td>{cut.section}</td>
                <td>{cut.count}</td>
                <td>{formatLength(cut.length, u)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.scheduleNotes}>
        <p>
          Lengths are member centre-lines rounded up to 100 {u.suffix === 'mm' ? 'mm' : '(mm)'}; plumb and seat cuts,
          plates and connectors are not designed here.
        </p>
      </div>
    </div>
  );
}
