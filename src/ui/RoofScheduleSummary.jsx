import styles from './PropertiesPanel.module.css';
import { buildRoofScheduleSummary } from '@/roof/roofSchedule';

function formatLength(mm, u) {
  return `${u.toDisplay(mm)} ${u.suffix}`;
}

function formatArea(area) {
  return `${(area / 1_000_000).toFixed(2)} m²`;
}

export default function RoofScheduleSummary({ roofSystem, u }) {
  const schedule = buildRoofScheduleSummary(roofSystem);
  const metrics = [
    { key: 'net-surface-area', label: 'Net Roof Area', value: formatArea(schedule.netSurfaceArea) },
    { key: 'net-plan-area', label: 'Projected Area', value: formatArea(schedule.netPlanArea) },
    { key: 'parapet-length', label: 'Parapet Length', value: formatLength(schedule.parapetLengthTotal, u) },
    { key: 'gutter-length', label: 'Gutter Length', value: formatLength(schedule.gutterLengthTotal, u), meta: schedule.gutterSource === 'derived_roof_edges' ? 'derived' : null },
    { key: 'downspouts', label: 'Downspouts', value: String(schedule.downspoutCount), meta: schedule.downspoutSource === 'derived_from_gutters' ? 'derived' : null },
    { key: 'drains', label: 'Drains', value: String(schedule.drainCount) },
    { key: 'skylights', label: 'Skylights', value: String(schedule.skylightCount) },
    { key: 'access-openings', label: 'Roof Hatches', value: String(schedule.accessOpeningCount || 0) },
    { key: 'openings', label: 'Other Openings', value: String(schedule.roofOpeningCount) },
  ];

  return (
    <div className={styles.scheduleSection}>
      <div className={styles.subtitle}>Roof Schedule</div>
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
              <th>Item</th>
              <th>Type</th>
              <th>Size</th>
              <th>Area</th>
              <th>Curb</th>
            </tr>
          </thead>
          <tbody>
            {schedule.openings.length ? schedule.openings.map((opening) => (
              <tr key={opening.id}>
                <td>{opening.name}</td>
                <td>{opening.type}</td>
                <td>{formatLength(opening.length, u)} x {formatLength(opening.width, u)}</td>
                <td>{formatArea(opening.planArea)}</td>
                <td>{formatLength(opening.curbHeight, u)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className={styles.scheduleEmptyRow}>No roof openings scheduled.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {schedule.notes.length ? (
        <div className={styles.scheduleNotes}>
          {schedule.notes.map((note, index) => (
            <p key={`${schedule.roofId || 'roof'}-note-${index}`}>{note}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
