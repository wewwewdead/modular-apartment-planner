import { useMemo, useState } from 'react';
import { DaylightIcon } from '@/ui/ToolbarIcons';
import { daylightFactorToLux } from '@/analysis/daylightModel';
import styles from './DaylightPanel.module.css';

const MODES = [
  { id: 'average', label: 'Room average', hint: 'One daylight factor per room, from the BRE split-flux formula' },
  { id: 'grid', label: 'Daylight map', hint: 'Where the light actually falls, by ray sampling under an overcast sky' },
];

/** Bands the ramp and the readouts share, so colour and words never disagree. */
const BANDS = [
  { limit: 1, label: 'Gloomy', tone: 'poor' },
  { limit: 2, label: 'Modest', tone: 'fair' },
  { limit: 5, label: 'Well lit', tone: 'good' },
  { limit: Infinity, label: 'Very bright', tone: 'bright' },
];

function bandFor(percent) {
  return BANDS.find((band) => percent < band.limit) || BANDS[BANDS.length - 1];
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function formatArea(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(value < 10 ? 1 : 0)} m²`;
}

/**
 * Controls and results for the daylight study.
 *
 * Laid out as a summary that is always readable and a table that is always
 * scrollable, because the useful action here is comparing rooms, not tuning
 * settings. Everything adjustable folds away.
 */
export default function DaylightPanel({
  project,
  daylight,
  study,
  gridStatus = 'idle',
  gridProgress = null,
  gridError = null,
  gridStale = false,
  onPatch,
  onToggle,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedRoomId, setExpandedRoomId] = useState(null);

  const hasRooms = (project?.floors || []).some((floor) => (floor.rooms || []).length > 0);
  const summary = study?.summary || null;

  const rooms = useMemo(() => {
    if (!study?.rooms) return [];
    // Darkest first: the rooms that need a decision are the ones failing, and
    // scrolling past the good ones to find them is the wrong way round.
    return [...study.rooms].sort((a, b) => a.averageDaylightFactor - b.averageDaylightFactor);
  }, [study]);

  const patch = (next) => onPatch(next);

  return (
    <section className={styles.panel} data-panel="daylight">
      <header className={styles.header}>
        <DaylightIcon className={styles.headerIcon} />
        <span className={styles.title}>Daylight</span>
        {hasRooms && (
          <button
            type="button"
            className={daylight.enabled ? styles.toggleActive : styles.toggle}
            onClick={onToggle}
            aria-pressed={daylight.enabled}
          >
            {daylight.enabled ? 'On' : 'Off'}
          </button>
        )}
      </header>

      {!hasRooms && (
        <p className={styles.hint}>
          Daylight is measured room by room. Draw rooms, or use Detect Rooms, and this will fill in.
        </p>
      )}

      {hasRooms && !daylight.enabled && (
        <p className={styles.hint}>
          Daylight factors under a standard overcast sky — no date, no orientation, no weather file.
        </p>
      )}

      {hasRooms && daylight.enabled && (
        <>
          <div className={styles.modeRow} role="group" aria-label="Daylight method">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={daylight.mode === mode.id ? styles.modeButtonActive : styles.modeButton}
                onClick={() => patch({ mode: mode.id })}
                title={mode.hint}
                aria-pressed={daylight.mode === mode.id}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {daylight.mode === 'grid' && (
            <div className={styles.gridStatus} data-status={gridStatus}>
              {gridStatus === 'running' && (
                <span>
                  {gridProgress
                    ? `Sampling ${gridProgress.roomName} — ${gridProgress.done} of ${gridProgress.total}`
                    : 'Preparing…'}
                  {gridStale ? ' · showing the previous map' : ''}
                </span>
              )}
              {gridStatus === 'ready' && (
                <span>Ray-sampled map · {study?.rooms?.[0]?.grid?.rayCount ?? 0} rays per sensor</span>
              )}
              {(gridStatus === 'error' || gridStatus === 'unavailable') && (
                <span className={styles.error}>{gridError || 'The daylight map could not be computed.'}</span>
              )}
            </div>
          )}

          {summary && (
            <div className={styles.summary}>
              <div className={styles.summaryFigure}>
                <strong className={styles.summaryValue}>{formatPercent(summary.areaWeightedDaylightFactor)}</strong>
                <span className={styles.summaryLabel}>average, area-weighted</span>
              </div>
              <div className={styles.summaryStats}>
                <span>
                  {summary.meetingTargetCount}/{summary.judgedRoomCount} rooms meet their target
                </span>
                <span>
                  {formatArea(summary.totalGlazedAreaM2)} glazing ·{' '}
                  {summary.totalAreaM2 > 0
                    ? `${((summary.totalGlazedAreaM2 / summary.totalAreaM2) * 100).toFixed(0)}% of floor`
                    : '—'}
                </span>
                {summary.darkRoomCount > 0 && (
                  <span className={styles.warn}>
                    {summary.darkRoomCount} room{summary.darkRoomCount === 1 ? '' : 's'} with no window
                  </span>
                )}
              </div>
            </div>
          )}

          <ul className={styles.roomList}>
            {rooms.map((room) => {
              const band = bandFor(room.averageDaylightFactor);
              const expanded = expandedRoomId === room.id;

              return (
                <li key={room.id} className={styles.room} data-tone={band.tone}>
                  <button
                    type="button"
                    className={styles.roomRow}
                    onClick={() => setExpandedRoomId(expanded ? null : room.id)}
                    aria-expanded={expanded}
                  >
                    <span className={styles.roomName}>{room.name}</span>
                    <span className={styles.roomValue}>{formatPercent(room.averageDaylightFactor)}</span>
                    <span className={styles.roomTarget}>
                      {room.target === null ? '—' : `of ${room.target}%`}
                      {room.meetsTarget === false && <span className={styles.shortfall}> ✕</span>}
                      {room.meetsTarget === true && <span className={styles.pass}> ✓</span>}
                    </span>
                  </button>

                  {expanded && (
                    <dl className={styles.detail}>
                      <div>
                        <dt>Illuminance</dt>
                        <dd>{Math.round(daylightFactorToLux(room.averageDaylightFactor, study.designSkyLux))} lux</dd>
                      </div>
                      <div>
                        <dt>Glazing</dt>
                        <dd>
                          {formatArea(room.netGlazedAreaM2)} · {(room.glazingToFloorRatio * 100).toFixed(0)}% of floor
                        </dd>
                      </div>
                      <div>
                        <dt>Visible sky</dt>
                        <dd>
                          {room.skyAngleDeg.toFixed(0)}°
                          {room.obstructionAngleDeg > 1 && ` · ${room.obstructionAngleDeg.toFixed(0)}° obstructed`}
                        </dd>
                      </div>
                      <div>
                        <dt>Interreflected</dt>
                        {/* Both numbers, because either alone misleads: the
                            component is a daylight factor in its own right, and
                            its share is what says whether the room is lit by
                            the sky or by its own walls. */}
                        <dd>
                          {formatPercent(room.internallyReflected)}
                          {room.averageDaylightFactor > 0 && (
                            <span className={styles.detailNote}>
                              {' '}
                              ({Math.round((room.internallyReflected / room.averageDaylightFactor) * 100)}% of the
                              total)
                            </span>
                          )}
                        </dd>
                      </div>
                      {room.limitingDepthRatio > 1 && (
                        <div className={styles.detailWide}>
                          <dt>Too deep for one-sided light</dt>
                          <dd>
                            The back of this room is beyond the depth a single window wall can light. A second window
                            wall or a rooflight is the fix; a bigger window is not.
                          </dd>
                        </div>
                      )}
                      {room.grid && (
                        <>
                          <div>
                            <dt>Map average</dt>
                            <dd>
                              {formatPercent(room.grid.mean)}
                              <span className={styles.detailNote}> vs {formatPercent(room.averageDaylightFactor)}</span>
                            </dd>
                          </div>
                          <div>
                            <dt>Range</dt>
                            <dd>
                              {formatPercent(room.grid.min)} – {formatPercent(room.grid.max)}
                            </dd>
                          </div>
                          <div>
                            <dt>Uniformity</dt>
                            <dd>{room.grid.uniformity.toFixed(2)}</dd>
                          </div>
                          {room.grid.fractionAboveTarget !== null && (
                            <div>
                              <dt>Over target</dt>
                              <dd>{Math.round(room.grid.fractionAboveTarget * 100)}% of the room</dd>
                            </div>
                          )}
                        </>
                      )}
                      {!room.hasDaylight && (
                        <div className={styles.detailWide}>
                          <dt>No window</dt>
                          <dd>Nothing in this room opens to the outside, so it has no daylight at all.</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setShowAdvanced((current) => !current)}
            aria-expanded={showAdvanced}
          >
            <span className={showAdvanced ? styles.chevronOpen : styles.chevron}>›</span>
            Glazing, finishes &amp; sampling
          </button>

          {showAdvanced && (
            <div className={styles.advancedBody}>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Glass transmittance</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={daylight.transmittance}
                    onChange={(event) => patch({ transmittance: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Glass fraction of opening</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={daylight.frameFactor}
                    onChange={(event) => patch({ frameFactor: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Ceiling reflectance</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={daylight.ceilingReflectance}
                    onChange={(event) => patch({ ceilingReflectance: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Wall reflectance</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={daylight.wallReflectance}
                    onChange={(event) => patch({ wallReflectance: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Floor reflectance</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={daylight.floorReflectance}
                    onChange={(event) => patch({ floorReflectance: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Dirt factor</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={daylight.maintenance}
                    onChange={(event) => patch({ maintenance: event.target.value })}
                  />
                </label>
              </div>

              <label className={styles.checkField}>
                <input
                  type="checkbox"
                  checked={daylight.includeGlazedDoors}
                  onChange={(event) => patch({ includeGlazedDoors: event.target.checked })}
                />
                <span>Count sliding doors as glazing</span>
              </label>

              {daylight.mode === 'grid' && (
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Sensor spacing</span>
                    <select
                      value={daylight.sensorSpacing}
                      onChange={(event) => patch({ sensorSpacing: Number(event.target.value) })}
                    >
                      <option value={250}>250 mm (fine)</option>
                      <option value={500}>500 mm</option>
                      <option value={1000}>1 m (fast)</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Rays per sensor</span>
                    <select
                      value={daylight.rayCount}
                      onChange={(event) => patch({ rayCount: Number(event.target.value) })}
                    >
                      <option value={128}>128 (fast)</option>
                      <option value={256}>256</option>
                      <option value={1024}>1024 (smooth)</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Working plane</span>
                    <input
                      type="number"
                      min="0"
                      max="2000"
                      step="50"
                      value={daylight.workingPlaneHeight}
                      onChange={(event) => patch({ workingPlaneHeight: event.target.value })}
                    />
                  </label>
                </div>
              )}

              <label className={styles.field}>
                <span>Design sky illuminance (lux)</span>
                <input
                  type="number"
                  min="1000"
                  max="50000"
                  step="500"
                  value={daylight.designSkyLux}
                  onChange={(event) => patch({ designSkyLux: event.target.value })}
                />
              </label>

              {/*
                The point of the whole feature. Everything above produces a
                number; this says what the number is and is not, so nobody
                takes a browser calculation for a Radiance run.
              */}
              <p className={styles.disclaimer}>
                Daylight factors under the CIE standard overcast sky. Because that sky is the same in every direction,
                these results do not depend on orientation, date or climate — and they cannot tell you about sunlight,
                glare or annual metrics like sDA and ASE, which need a weather file and a backward raytracer.
              </p>
              <p className={styles.disclaimer}>
                The room average comes from the BRE split-flux formula; the map samples rays under the same sky and adds
                the interreflected component from the same formula. The two usually agree within about a quarter — where
                they diverge, the map is the better guide to a deep or awkwardly shaped room. Furniture, curtains,
                internal glazing and ground-reflected light are not modelled.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
