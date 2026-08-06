import { useMemo, useState } from 'react';
import { createUniformWindRose } from '@/analysis/windState';
import { WIND_COMFORT_CATEGORIES } from '@/analysis/windComfort';
import { WindIcon } from '@/ui/ToolbarIcons';
import styles from './WindStudyPanel.module.css';

const DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function roseToText(rose) {
  return (rose || [])
    .map(
      (sector) =>
        `${sector.directionDeg}, ${(sector.frequency * 100).toFixed(2)}, ${sector.weibullK}, ${sector.weibullC}`,
    )
    .join('\n');
}

function parseRose(text) {
  const entries = text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[\s,]+/).map(Number));
  if (
    !entries.length ||
    entries.some(
      ([directionDeg, frequencyPercent, weibullK, weibullC]) =>
        ![directionDeg, frequencyPercent, weibullK, weibullC].every(Number.isFinite) ||
        frequencyPercent < 0 ||
        weibullK <= 0 ||
        weibullC <= 0,
    )
  ) {
    return null;
  }
  return entries.map(([directionDeg, frequencyPercent, weibullK, weibullC]) => ({
    directionDeg,
    frequency: frequencyPercent / 100,
    weibullK,
    weibullC,
  }));
}

function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function coordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

export default function WindStudyPanel({
  windStudy,
  study,
  status,
  progress,
  error,
  stale,
  climate,
  onPatch,
  onToggle,
}) {
  const [advanced, setAdvanced] = useState(false);
  const [roseDraft, setRoseDraft] = useState(() => ({
    windRose: windStudy.windRose,
    text: roseToText(windStudy.windRose),
  }));
  const [roseError, setRoseError] = useState(null);
  const roseText = roseDraft.windRose === windStudy.windRose ? roseDraft.text : roseToText(windStudy.windRose);
  const setRoseText = (text) => setRoseDraft({ windRose: windStudy.windRose, text });

  const statusText = useMemo(() => {
    if (status === 'running') {
      if (progress?.stage === 'sector') {
        return `Solving ${progress.sector}/${progress.sectors} · ${DIRECTIONS[Math.round(progress.directionDeg / 22.5) % 16]}`;
      }
      if (progress?.stage === 'solve') return `Solving · iteration ${progress.iteration}/${progress.iterations}`;
      return 'Preparing wind domain…';
    }
    if (status === 'error' || status === 'unavailable') return error;
    if (status === 'ready' && !study) return 'No solid massing crosses the selected pedestrian-height slice.';
    if (stale) return 'Showing the previous result while the new run completes.';
    return null;
  }, [error, progress, stale, status, study]);

  const applyRose = () => {
    const windRose = parseRose(roseText);
    if (!windRose) {
      setRoseError('Use direction, frequency %, Weibull k, Weibull c — one sector per line.');
      return;
    }
    setRoseError(null);
    onPatch({ windRose, windRoseSource: 'user', windClimate: null });
  };

  return (
    <section className={styles.panel} data-panel="wind-study">
      <header className={styles.header}>
        <WindIcon className={styles.headerIcon} />
        <span className={styles.title}>Pedestrian Wind</span>
        <button
          type="button"
          className={windStudy.enabled ? styles.toggleActive : styles.toggle}
          onClick={onToggle}
          aria-pressed={windStudy.enabled}
        >
          {windStudy.enabled ? 'On' : 'Off'}
        </button>
      </header>

      {!windStudy.enabled ? (
        <p className={styles.hint}>
          2D Lattice–Boltzmann screening at pedestrian height, run separately from solar studies.
        </p>
      ) : (
        <>
          <div className={styles.segmented} role="group" aria-label="Wind study mode">
            <button
              type="button"
              className={windStudy.mode === 'direction' ? styles.segmentActive : styles.segment}
              onClick={() => onPatch({ mode: 'direction' })}
              aria-pressed={windStudy.mode === 'direction'}
            >
              Direction
            </button>
            <button
              type="button"
              className={windStudy.mode === 'comfort' ? styles.segmentActive : styles.segment}
              onClick={() => onPatch({ mode: 'comfort' })}
              aria-pressed={windStudy.mode === 'comfort'}
            >
              Comfort
            </button>
          </div>

          <div className={styles.climateCard} data-status={climate?.status || 'unavailable'}>
            <div className={styles.climateHeading}>
              <strong>Site wind climate</strong>
              {climate?.site && (
                <span>
                  {coordinate(climate.site.latitude, 'N', 'S')} {coordinate(climate.site.longitude, 'E', 'W')}
                </span>
              )}
            </div>
            {!climate?.site ? (
              <p>Set latitude and longitude in Sun &amp; Shadow to simulate this site’s prevailing winds.</p>
            ) : climate.status === 'loading' ? (
              <p>Loading {climate.period.label} hourly 10 m wind history…</p>
            ) : climate.status === 'error' ? (
              <p>{climate.error} The current rose remains available as a fallback.</p>
            ) : windStudy.windRoseSource === 'site-climate' ? (
              <p>
                {windStudy.windClimate?.period} reanalysis · {windStudy.windClimate?.sampleCount?.toLocaleString()}{' '}
                hourly samples · prevailing{' '}
                {
                  DIRECTIONS[
                    Math.round((windStudy.windClimate?.prevailingDirectionDeg ?? windStudy.directionDeg) / 22.5) % 16
                  ]
                }{' '}
                at {(windStudy.windClimate?.prevailingMeanSpeed ?? windStudy.referenceSpeed).toFixed(1)} m/s.
                {climate.offlineReady ? ' Saved with this project · available offline.' : ''}
              </p>
            ) : windStudy.windRoseSource === 'user' ? (
              <p>A manual wind rose currently overrides this location.</p>
            ) : (
              <p>Site climate is not loaded; comfort results use the illustrative rose.</p>
            )}
            {climate?.site && climate.status !== 'loading' && (
              <div className={styles.climateActions}>
                <button
                  type="button"
                  onClick={windStudy.windRoseSource === 'site-climate' ? climate.refresh : climate.activate}
                >
                  {windStudy.windRoseSource === 'site-climate'
                    ? 'Refresh online'
                    : climate.offlineReady
                      ? 'Use saved site climate'
                      : 'Load site climate'}
                </button>
                <a href={climate.sourceUrl} target="_blank" rel="noreferrer">
                  Open-Meteo source
                </a>
              </div>
            )}
          </div>

          {windStudy.mode === 'direction' ? (
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Wind from</span>
                <select
                  value={windStudy.directionDeg}
                  onChange={(event) => onPatch({ directionDeg: Number(event.target.value) })}
                >
                  {DIRECTIONS.map((label, index) => (
                    <option key={label} value={index * 22.5}>
                      {label} · {index * 22.5}°
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Reference speed</span>
                <input
                  type="number"
                  min="0.1"
                  max="60"
                  step="0.5"
                  value={windStudy.referenceSpeed}
                  onChange={(event) => onPatch({ referenceSpeed: event.target.value })}
                />
              </label>
            </div>
          ) : (
            <p className={windStudy.windRoseSource === 'illustrative' ? styles.warning : styles.hint}>
              {windStudy.windRoseSource === 'site-climate'
                ? `${windStudy.windRose.length} location-backed Weibull sectors loaded.`
                : windStudy.windRoseSource === 'user'
                  ? `${windStudy.windRose.length} manually defined Weibull sectors loaded.`
                  : 'Illustrative uniform wind rose — set a site location or provide climate data before using comfort results.'}
            </p>
          )}

          {statusText && (
            <p
              className={status === 'error' || status === 'unavailable' ? styles.error : styles.status}
              data-status={status}
            >
              {statusText}
            </p>
          )}

          {study?.mode === 'direction' && (
            <>
              <div className={styles.summary} data-stale={stale || undefined}>
                <div>
                  <strong>{study.summary.peakAmplification.toFixed(2)}×</strong>
                  <span>peak amplification</span>
                </div>
                <dl>
                  <dt>Peak local speed</dt>
                  <dd>{study.summary.peakSpeed.toFixed(1)} m/s</dd>
                  <dt>Area ≥ 1.5×</dt>
                  <dd>{percent(study.summary.acceleratedFraction)}</dd>
                  <dt>Area ≤ 0.5×</dt>
                  <dd>{percent(study.summary.shelteredFraction)}</dd>
                </dl>
              </div>
              {study.ventilation && (
                <div className={styles.ventilationSummary} data-stale={stale || undefined}>
                  <div className={styles.ventilationHeading}>
                    <strong>Room airflow network</strong>
                    <span>steady wind pressure</span>
                  </div>
                  <div className={styles.ventilationMetrics}>
                    <div>
                      <strong>{study.ventilation.summary.meanAirChangesPerHour.toFixed(1)}</strong>
                      <span>mean ACH</span>
                    </div>
                    <div>
                      <strong>{study.ventilation.summary.maxAirChangesPerHour.toFixed(1)}</strong>
                      <span>maximum ACH</span>
                    </div>
                    <div>
                      <strong>{study.ventilation.summary.crossVentilatedRoomCount}</strong>
                      <span>cross-flow rooms</span>
                    </div>
                    <div>
                      <strong>{study.ventilation.summary.stagnantRoomCount}</strong>
                      <span>below 0.1 ACH</span>
                    </div>
                  </div>
                  {study.ventilation.summary.openExteriorCount === 0 ? (
                    <p className={styles.ventilationWarning}>
                      No exterior airflow path. Select façade windows or doors and set an open fraction.
                    </p>
                  ) : study.ventilation.summary.openExteriorCount === 1 ? (
                    <p className={styles.ventilationWarning}>
                      Only one exterior opening is active. Add a second pressure path for sustained cross-flow.
                    </p>
                  ) : null}
                  <div className={styles.roomFlowList}>
                    {study.ventilation.rooms.slice(0, 8).map((room) => (
                      <div key={room.id} className={styles.roomFlowRow}>
                        <span title={`${room.pressurePa.toFixed(2)} Pa`}>{room.name}</span>
                        <em>
                          {room.crossVentilated
                            ? 'Cross-flow'
                            : room.airChangesPerHour >= 0.1
                              ? 'Airflow path'
                              : 'Low / no flow'}
                        </em>
                        <strong>{room.airChangesPerHour.toFixed(1)} ACH</strong>
                      </div>
                    ))}
                  </div>
                  <p className={styles.ventilationNote}>
                    ACH is a design-screening result, not a code pass/fail; required rates depend on room use and local
                    rules.
                  </p>
                </div>
              )}
            </>
          )}

          {study?.mode === 'comfort' && (
            <div className={styles.comfortSummary} data-stale={stale || undefined}>
              <span className={styles.criteriaNote}>Modified City Lawson · 5% exceedance speed</span>
              {study.representativeFlow && (
                <span className={styles.criteriaNote}>
                  3D particles show the most frequent{' '}
                  {DIRECTIONS[Math.round(study.representativeFlow.directionDeg / 22.5) % 16]} sector; map colours
                  combine all {study.windRose.length} sectors.
                </span>
              )}
              {study.summary.fractions.map((entry, index) => (
                <div key={entry.id} className={styles.comfortRow}>
                  <span className={styles.swatch} data-category={index} />
                  <span>{entry.label}</span>
                  <strong>{percent(entry.fraction)}</strong>
                </div>
              ))}
              <div className={styles.safetyRow}>
                <span>Safety threshold exceeded</span>
                <strong>{percent(study.summary.unsafeFraction)}</strong>
              </div>
            </div>
          )}

          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setAdvanced((current) => !current)}
            aria-expanded={advanced}
          >
            <span className={advanced ? styles.chevronOpen : styles.chevron}>›</span>
            Solver &amp; wind rose
          </button>

          {advanced && (
            <div className={styles.advancedBody}>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Slice height (mm)</span>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={windStudy.sliceHeight}
                    onChange={(event) => onPatch({ sliceHeight: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Grid resolution</span>
                  <select
                    value={windStudy.resolution}
                    onChange={(event) => onPatch({ resolution: Number(event.target.value) })}
                  >
                    <option value={64}>64 · draft</option>
                    <option value={96}>96 · normal</option>
                    <option value={128}>128 · fine</option>
                    <option value={192}>192 · slow</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Iterations</span>
                  <input
                    type="number"
                    min="100"
                    max="3000"
                    step="50"
                    value={windStudy.iterations}
                    onChange={(event) => onPatch({ iterations: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Domain padding (mm)</span>
                  <input
                    type="number"
                    min="5000"
                    step="5000"
                    value={windStudy.domainPadding}
                    onChange={(event) => onPatch({ domainPadding: event.target.value })}
                  />
                </label>
              </div>

              {windStudy.mode === 'comfort' && (
                <div className={styles.roseEditor}>
                  <label className={styles.field}>
                    <span>Wind rose: direction°, frequency %, Weibull k, Weibull c (m/s)</span>
                    <textarea rows="8" value={roseText} onChange={(event) => setRoseText(event.target.value)} />
                  </label>
                  <div className={styles.actions}>
                    <button type="button" onClick={applyRose}>
                      Apply wind rose
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const windRose = createUniformWindRose();
                        setRoseText(roseToText(windRose));
                        setRoseError(null);
                        onPatch({ windRose, windRoseSource: 'illustrative', windClimate: null });
                      }}
                    >
                      Reset illustrative
                    </button>
                  </div>
                  {roseError && <p className={styles.error}>{roseError}</p>}
                </div>
              )}

              <p className={styles.disclaimer}>
                Screening model only: location climate is regional 10 m reanalysis, not an on-site anemometer record.
                The flow model is a steady 2D pedestrian slice with no vertical flow, atmospheric boundary layer,
                terrain, thermal buoyancy, transient gusts, or RANS/LES turbulence closure. Comfort colours use the
                modified City Lawson 2.5 / 4 / 6 / 8 m/s thresholds at 5% exceedance; safety flags exceed 15 m/s at
                0.022% exceedance. Room airflow is a steady pressure-network calculation using configured opening
                fractions and a height-uniform façade pressure from the outdoor slice; it excludes leakage, stack
                effect, fans, ducts, and indoor velocity detail. This is not a wind-engineering certification.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export { parseRose, roseToText, DIRECTIONS, WIND_COMFORT_CATEGORIES };
