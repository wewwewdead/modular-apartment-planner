import { useState } from 'react';
import { SunIcon } from '@/ui/ToolbarIcons';
import { siteSupportsSunStudy } from '@/analysis/sunStudyState';
import styles from './SolarAccessPanel.module.css';

const PERIODS = [
  { id: 'annual', label: 'Year', hint: 'The fifteenth of every month, weighted by month length' },
  { id: 'day', label: 'One day', hint: 'A single date' },
];

const METRICS = [
  { id: 'sunHours', label: 'Sun hours', hint: 'Hours of direct sun. Pure geometry — no weather model involved' },
  { id: 'irradiation', label: 'Energy', hint: 'Clear-sky irradiation in kWh/m². Theoretical, not a yield forecast' },
];

function formatHours(value) {
  if (!Number.isFinite(value)) return '—';
  return value >= 100 ? `${Math.round(value)} h` : `${value.toFixed(1)} h`;
}

function formatEnergy(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)} kWh/m²`;
}

function formatArea(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} m²`;
}

/**
 * Controls and results for the solar access study.
 *
 * The orientation table leads, because "which way should this face" is the
 * question the study exists to answer and the one a plan cannot show. Surfaces
 * come second, sorted by how much they receive.
 */
export default function SolarAccessPanel({
  project,
  solarAccess,
  study,
  status = 'idle',
  progress = null,
  error = null,
  stale = false,
  onPatch,
  onToggle,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const located = siteSupportsSunStudy(project?.building?.site);
  const energy = solarAccess.metric === 'irradiation';

  const totals = study?.totals;
  const format = energy ? formatEnergy : formatHours;
  const valueOf = (entry) => (energy ? entry.meanIrradiation : entry.meanSunHours);

  return (
    <section className={styles.panel} data-panel="solar-access">
      <header className={styles.header}>
        <SunIcon className={styles.headerIcon} />
        <span className={styles.title}>Solar Access</span>
        {located && (
          <button
            type="button"
            className={solarAccess.enabled ? styles.toggleActive : styles.toggle}
            onClick={onToggle}
            aria-pressed={solarAccess.enabled}
          >
            {solarAccess.enabled ? 'On' : 'Off'}
          </button>
        )}
      </header>

      {!located && (
        <p className={styles.hint}>
          Set the site location in Sun &amp; Shadow first — solar access needs to know where on Earth this is.
        </p>
      )}

      {located && !solarAccess.enabled && (
        <p className={styles.hint}>
          How much sun each facade and roof gets, by raycasting against the building itself.
        </p>
      )}

      {located && solarAccess.enabled && (
        <>
          <div className={styles.controlRow}>
            <div className={styles.segmented} role="group" aria-label="Study period">
              {PERIODS.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  className={solarAccess.period === period.id ? styles.segmentActive : styles.segment}
                  onClick={() => onPatch({ period: period.id })}
                  title={period.hint}
                  aria-pressed={solarAccess.period === period.id}
                >
                  {period.label}
                </button>
              ))}
            </div>
            <div className={styles.segmented} role="group" aria-label="Metric">
              {METRICS.map((metric) => (
                <button
                  key={metric.id}
                  type="button"
                  className={solarAccess.metric === metric.id ? styles.segmentActive : styles.segment}
                  onClick={() => onPatch({ metric: metric.id })}
                  title={metric.hint}
                  aria-pressed={solarAccess.metric === metric.id}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>

          {solarAccess.period === 'day' && (
            <input
              type="date"
              className={styles.dateInput}
              value={solarAccess.date}
              onChange={(event) => onPatch({ date: event.target.value })}
              aria-label="Study date"
            />
          )}

          <div className={styles.status} data-status={status}>
            {status === 'running' && (
              <span>
                {progress ? `Tracing ${progress.done} of ${progress.total} sensors` : 'Building the model…'}
                {stale ? ' · showing the previous run' : ''}
              </span>
            )}
            {status === 'ready' && study && (
              <span>
                {study.meta.sensorCount} sensors · {study.meta.sunSampleCount} sun positions ·{' '}
                {Math.round(study.meta.sensorSpacing)} mm grid
              </span>
            )}
            {(status === 'error' || status === 'unavailable') && (
              <span className={styles.error}>{error || 'The solar study could not be computed.'}</span>
            )}
          </div>

          {totals && (
            <div className={styles.summary}>
              <div className={styles.summaryFigure}>
                <strong className={styles.summaryValue}>
                  {format(energy ? totals.roofMeanIrradiation : totals.meanSunHours)}
                </strong>
                <span className={styles.summaryLabel}>{energy ? 'roof average' : 'average, all surfaces'}</span>
              </div>
              <div className={styles.summaryStats}>
                <span>
                  {formatArea(totals.roofAreaM2)} roof · {formatArea(totals.facadeAreaM2)} facade
                </span>
                {energy ? (
                  <span>Roof total {Math.round(totals.roofPotentialMWh)} MWh/yr before any panel efficiency</span>
                ) : (
                  <span>
                    {Math.round(totals.compliantAreaFraction * 100)}% of surfaces get {solarAccess.thresholdHours} h or
                    more
                  </span>
                )}
              </div>
            </div>
          )}

          {study?.orientations?.length > 0 && (
            <div className={styles.block}>
              <h4 className={styles.blockTitle}>By orientation</h4>
              <ul className={styles.bars}>
                {[...study.orientations]
                  .sort((a, b) => valueOf(b) - valueOf(a))
                  .map((entry) => {
                    const best = Math.max(...study.orientations.map(valueOf), 1);
                    return (
                      <li key={entry.orientation} className={styles.bar}>
                        <span className={styles.barLabel}>{entry.orientation}</span>
                        <span className={styles.barTrack}>
                          <span className={styles.barFill} style={{ width: `${(valueOf(entry) / best) * 100}%` }} />
                        </span>
                        <span className={styles.barValue}>{format(valueOf(entry))}</span>
                        <span className={styles.barArea}>{formatArea(entry.areaM2)}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          {study?.surfaces?.length > 0 && (
            <div className={styles.block}>
              <h4 className={styles.blockTitle}>Best and worst surfaces</h4>
              <ul className={styles.surfaceList}>
                {[...study.surfaces.slice(0, 3), ...study.surfaces.slice(-2)]
                  .filter((surface, index, list) => list.findIndex((entry) => entry.id === surface.id) === index)
                  .map((surface) => (
                    <li key={surface.id} className={styles.surface}>
                      <span className={styles.surfaceName}>{surface.label}</span>
                      <span className={styles.surfaceValue}>{format(valueOf(surface))}</span>
                      <span className={styles.surfaceMeta}>
                        {formatArea(surface.areaM2)} · sky {Math.round(surface.meanSkyView * 100)}%
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setShowAdvanced((current) => !current)}
            aria-expanded={showAdvanced}
          >
            <span className={showAdvanced ? styles.chevronOpen : styles.chevron}>›</span>
            Sampling &amp; assumptions
          </button>

          {showAdvanced && (
            <div className={styles.advancedBody}>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Sensor grid</span>
                  <select
                    value={solarAccess.sensorSpacing}
                    onChange={(event) => onPatch({ sensorSpacing: Number(event.target.value) })}
                  >
                    <option value={500}>500 mm (fine)</option>
                    <option value={1000}>1 m</option>
                    <option value={2000}>2 m (fast)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Time step</span>
                  <select
                    value={solarAccess.stepMinutes}
                    onChange={(event) => onPatch({ stepMinutes: Number(event.target.value) })}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Sky view rays</span>
                  <select
                    value={solarAccess.skyViewRays}
                    onChange={(event) => onPatch({ skyViewRays: Number(event.target.value) })}
                  >
                    <option value={32}>32 (fast)</option>
                    <option value={64}>64</option>
                    <option value={128}>128 (smooth)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Ground reflectance</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={solarAccess.groundReflectance}
                    onChange={(event) => onPatch({ groundReflectance: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Target sun hours</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={solarAccess.thresholdHours}
                    onChange={(event) => onPatch({ thresholdHours: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Facade band height (mm)</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={solarAccess.facadeSliceHeight}
                    onChange={(event) => onPatch({ facadeSliceHeight: event.target.value })}
                  />
                </label>
              </div>

              <label className={styles.checkField}>
                <input
                  type="checkbox"
                  checked={solarAccess.includeRoofs}
                  onChange={(event) => onPatch({ includeRoofs: event.target.checked })}
                />
                <span>Include roofs</span>
              </label>
              <label className={styles.checkField}>
                <input
                  type="checkbox"
                  checked={solarAccess.includeFacades}
                  onChange={(event) => onPatch({ includeFacades: event.target.checked })}
                />
                <span>Include facades</span>
              </label>

              {/*
                The whole point of separating the two metrics. One is geometry
                and stands on its own; the other rests on a sky model with no
                weather behind it, and saying so is the difference between a
                design tool and a lie.
              */}
              <p className={styles.disclaimer}>
                <strong>Sun hours are geometry.</strong> They count the time the sun is actually visible from each
                point, given the massing you drew, and rest on no weather data at all.
              </p>
              <p className={styles.disclaimer}>
                <strong>Energy is theoretical clear sky.</strong> Every day is modelled cloudless, so the kWh/m² figures
                run well above a real year — commonly 20-40% above, and more in a cloudy climate. Use them to compare
                facades, pitches and massing options, which is sound because every option meets the same sky. Do not
                size an array from them: that needs a TMY or EPW weather file and a Perez sky.
              </p>
              <p className={styles.disclaimer}>
                Terrain, trees, buildings outside the model and any shading device you have not drawn are not accounted
                for. The plan shows facades as a band at one height; a tall elevation varies a great deal from base to
                parapet.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
