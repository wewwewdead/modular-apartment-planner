import { useMemo, useState } from 'react';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import { generateId } from '@/domain/ids';
import { solarPosition, sunTimes, siteInstant, siteClock } from '@/analysis/solarPosition';
import { isValidTimeZone } from '@/utils/timeZone';
import {
  formatStudyTime,
  parseSunStudyDate,
  siteSupportsSunStudy,
  SUN_STUDY_KEY_DATES,
} from '@/analysis/sunStudyState';
import { SunIcon } from '@/ui/ToolbarIcons';
import { SUN_HOURS_RAMP } from './renderers/ShadowOverlay';
import LocationPicker from './LocationPicker';
import styles from './SunStudyPanel.module.css';

const RAD = 180 / Math.PI;
const MINUTES_PER_DAY = 1440;

const MODES = [
  { id: 'instant', label: 'Moment', hint: 'The shadow at one time of day' },
  { id: 'range', label: 'All day', hint: 'Every patch of ground the shadow touches during the day' },
  { id: 'sunHours', label: 'Sun hours', hint: 'How many hours of direct sun each patch of ground gets' },
];

/** Sixteen-point compass, so the azimuth reads as a direction and not just a number. */
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function compassPoint(azimuthDeg) {
  return COMPASS[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16];
}

/** Formats an instant as the site's own wall clock, never the viewer's. */
function formatSiteTime(date, timeZone) {
  if (!date) return null;
  return formatStudyTime(siteClock({ date, timeZone }).minutes);
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

function formatArea(mm2) {
  return Number.isFinite(mm2) ? `${(mm2 / 1_000_000).toFixed(mm2 >= 10_000_000 ? 0 : 1)} m²` : '—';
}

function formatCoordinate(value, positive, negative) {
  if (!Number.isFinite(value)) return '';
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

/**
 * The map's key.
 *
 * The overlay stretches its ramp across the best-lit ground in the study, so a
 * colour only means a number of hours once something says what the ends of the
 * ramp are. The contours on the map carry hours of their own; this is what ties
 * the wash between them back to the same scale, and marks where the target
 * falls on it.
 */
function SunHoursLegend({ grid }) {
  const gradient = `linear-gradient(90deg, ${SUN_HOURS_RAMP.map(
    ({ stop, color: [red, green, blue] }) => `rgb(${red}, ${green}, ${blue}) ${(stop * 100).toFixed(0)}%`,
  ).join(', ')})`;

  const maxHours = Math.max(grid.maxHours, 0.5);
  const thresholdShare = Math.min(1, Math.max(0, grid.thresholdHours / maxHours));
  const thresholdIsOnScale = grid.thresholdHours > 0 && grid.thresholdHours < maxHours;

  return (
    <div className={styles.legend} data-legend="sun-hours">
      <div className={styles.legendBar} style={{ background: gradient }}>
        {thresholdIsOnScale && (
          <span
            className={styles.legendMarker}
            style={{ left: `${(thresholdShare * 100).toFixed(2)}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className={styles.legendScale}>
        <span>0 h</span>
        {thresholdIsOnScale && <span className={styles.legendTarget}>{grid.thresholdHours} h target</span>}
        <span>{maxHours.toFixed(1)} h</span>
      </div>
    </div>
  );
}

function formatStudyDate(date) {
  const { year, month, day } = parseSunStudyDate(date);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Controls for the sun and shadow study.
 *
 * Laid out as three states rather than one long form, because the location is
 * set once and the time is dragged constantly. Showing both at full size all
 * the time buries the control people actually use.
 *
 *   1. No location  → a single button. Nothing else is meaningful yet.
 *   2. Located, off → one summary line. Out of the way.
 *   3. Running      → mode, date, time. Sampling settings stay folded away.
 */
export default function SunStudyPanel({
  project,
  sunStudy,
  study = null,
  recomputing = false,
  studyError = null,
  lastCommand,
  onExecuteCommand,
  onPatch,
  onToggle,
}) {
  const site = project?.building?.site;
  const located = siteSupportsSunStudy(site);

  // Identity of the stored location. Editing is tracked against this rather
  // than as a boolean so the form closes itself the moment a command actually
  // lands, with no effect and no cascading render: a successful save changes
  // the key, a rejected one leaves it alone and the form stays open.
  const siteKey = `${site?.latitude}|${site?.longitude}|${site?.timeZone}|${site?.northAngle}`;
  const [editingFromKey, setEditingFromKey] = useState(null);
  const editingLocation = editingFromKey !== null && editingFromKey === siteKey;
  const [dismissedCommand, setDismissedCommand] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [draft, setDraft] = useState(() => ({
    latitude: site?.latitude ?? '',
    longitude: site?.longitude ?? '',
    northAngle: site?.northAngle ?? 0,
    timeZone: site?.timeZone ?? browserTimeZone(),
    label: site?.locationLabel ?? '',
  }));
  const [draftError, setDraftError] = useState(null);
  const [targetDraft, setTargetDraft] = useState({ name: '', kind: 'neighbor', points: '' });
  const [targetDraftError, setTargetDraftError] = useState(null);

  // The command owns the range rules, so let its rejection message through
  // rather than restating those rules here and letting the two drift apart.
  const rejection =
    lastCommand &&
    lastCommand !== dismissedCommand &&
    !lastCommand.ok &&
    lastCommand.commandType === BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION
      ? lastCommand.error?.message || 'Could not set the location.'
      : null;
  const locationError = draftError || rejection;
  const targetRejection =
    lastCommand &&
    !lastCommand.ok &&
    [BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET, BUILDING_COMMANDS.REMOVE_SOLAR_STUDY_TARGET].includes(
      lastCommand.commandType,
    )
      ? lastCommand.error?.message || 'Could not update the assessment mask.'
      : null;

  // A rejection has to be shown next to the fields that caused it, so it opens
  // the form itself rather than relying on the form still being open.
  const formOpen = editingLocation || Boolean(rejection);

  const readout = useMemo(() => {
    if (!located) return null;

    const { year, month, day } = parseSunStudyDate(sunStudy.date);
    const { latitude, longitude } = site;
    const { timeZone } = site;
    const instant = siteInstant({ year, month, day, minutes: sunStudy.minutes, timeZone });
    const noon = siteInstant({ year, month, day, minutes: 720, timeZone });
    const position = solarPosition({ latitude, longitude, date: instant });
    const times = sunTimes({ latitude, longitude, date: noon });

    return {
      altitude: position.trueAltitude * RAD,
      azimuth: position.azimuth * RAD,
      times,
      sunriseLabel: formatSiteTime(times.sunrise, timeZone),
      sunsetLabel: formatSiteTime(times.sunset, timeZone),
      sunriseMinutes: times.sunrise ? siteClock({ date: times.sunrise, timeZone }).minutes : null,
      sunsetMinutes: times.sunset ? siteClock({ date: times.sunset, timeZone }).minutes : null,
    };
  }, [located, site, sunStudy.date, sunStudy.minutes]);

  // Paint the daylight window straight onto the time slider. Seeing the lit
  // band beats reading sunrise and sunset out of a table and doing the mental
  // arithmetic yourself.
  const trackStyle = useMemo(() => {
    if (!readout) return undefined;
    const { sunriseMinutes, sunsetMinutes, times } = readout;
    if (times.alwaysUp) return { '--daylight-start': '0%', '--daylight-end': '100%' };
    if (times.alwaysDown || sunriseMinutes == null || sunsetMinutes == null) {
      return { '--daylight-start': '0%', '--daylight-end': '0%' };
    }
    return {
      '--daylight-start': `${(sunriseMinutes / MINUTES_PER_DAY) * 100}%`,
      '--daylight-end': `${(sunsetMinutes / MINUTES_PER_DAY) * 100}%`,
    };
  }, [readout]);

  const submitLocation = (event) => {
    event.preventDefault();
    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);
    const northAngle = Number(draft.northAngle);

    if (draft.latitude === '' || draft.longitude === '' || ![latitude, longitude, northAngle].every(Number.isFinite)) {
      setDraftError('Pick a place on the map, or type both coordinates.');
      return;
    }
    if (!isValidTimeZone(draft.timeZone)) {
      setDraftError('Enter a valid IANA timezone, such as Asia/Manila.');
      return;
    }

    setDraftError(null);
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_SITE_LOCATION,
      latitude,
      longitude,
      northAngle,
      timeZone: draft.timeZone,
      locationLabel: draft.label || '',
    });
  };

  const useBrowserLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDraftError('This browser cannot report a location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setDraft((current) => ({
          ...current,
          latitude: Number(coords.latitude.toFixed(4)),
          longitude: Number(coords.longitude.toFixed(4)),
          timeZone: browserTimeZone(),
          label: '',
        })),
      () => setDraftError('Location request was refused.'),
    );
  };

  const openLocationEditor = () => {
    setDraft({
      latitude: site?.latitude ?? '',
      longitude: site?.longitude ?? '',
      northAngle: site?.northAngle ?? 0,
      timeZone: site?.timeZone ?? browserTimeZone(),
      label: site?.locationLabel ?? '',
    });
    setDraftError(null);
    setEditingFromKey(siteKey);
  };

  const sunIsUp = readout ? readout.altitude > 0 : false;
  const targets = site?.solarStudyTargets || [];
  const hasPropertyTarget = site?.boundary?.length >= 3;
  const result = useMemo(() => {
    if (!study) return null;
    if (!study.target) {
      return {
        label: 'Exploratory extent',
        metric: 'No compliance mask',
        detail: 'Choose a property or target polygon.',
      };
    }
    if (study.mode === 'sunHours' && study.grid) {
      return {
        label: study.target.name,
        metric: `${formatPercent(study.grid.compliantFraction)} compliant`,
        detail: `${formatPercent(study.grid.compliantFraction)} of ${formatArea(study.grid.assessedAreaMm2)} receives at least ${study.grid.thresholdHours} h · mean ${study.grid.meanSunHours.toFixed(1)} h`,
      };
    }
    return {
      label: study.target.name,
      metric: `${formatPercent(study.targetShadowFraction)} shaded`,
      detail:
        study.mode === 'range'
          ? `${formatPercent(study.targetShadowFraction)} of ${formatArea(study.targetAreaMm2)} is touched by shadow during the sampled day.`
          : `${formatPercent(study.targetShadowFraction)} of ${formatArea(study.targetAreaMm2)} is shaded at ${formatStudyTime(sunStudy.minutes)}.`,
    };
  }, [study, sunStudy.minutes]);

  const addTarget = (event) => {
    event.preventDefault();
    const polygon = targetDraft.points
      .split(/\r?\n|;/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/[\s,]+/).map(Number))
      .map(([x, y]) => ({ x, y }));
    if (
      !targetDraft.name.trim() ||
      polygon.length < 3 ||
      polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    ) {
      setTargetDraftError('Give the target a name and at least three x,y points in millimetres.');
      return;
    }
    const id = generateId('solar_target');
    setTargetDraftError(null);
    onExecuteCommand({
      type: BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET,
      id,
      name: targetDraft.name.trim(),
      kind: targetDraft.kind,
      polygon,
    });
    onPatch({ targetId: id });
    setTargetDraft({ name: '', kind: 'neighbor', points: '' });
  };

  return (
    <section className={styles.panel} data-panel="sun-study">
      <header className={styles.header}>
        <SunIcon className={styles.headerIcon} />
        <span className={styles.title}>Sun &amp; Shadow</span>
        {located && (
          <button
            type="button"
            className={sunStudy.enabled ? styles.toggleActive : styles.toggle}
            onClick={onToggle}
            aria-pressed={sunStudy.enabled}
          >
            {sunStudy.enabled ? 'On' : 'Off'}
          </button>
        )}
      </header>

      {/* State 1: nothing to configure yet beyond where the site is. */}
      {!located && !formOpen && (
        <>
          <p className={styles.hint}>Shadows need to know where on Earth the site is.</p>
          <button type="button" className={styles.primaryButton} onClick={openLocationEditor}>
            Set site location
          </button>
        </>
      )}

      {/* State 2: located and folded down to one line. */}
      {located && !formOpen && (
        <div className={styles.locationSummary}>
          <span className={styles.locationText}>
            {site.locationLabel ? `${site.locationLabel} · ` : ''}
            {formatCoordinate(site.latitude, 'N', 'S')} {formatCoordinate(site.longitude, 'E', 'W')}
            {' · '}
            {site.timeZone}
            {' · N '}
            {Math.round(site.northAngle || 0)}°
          </span>
          <button type="button" className={styles.linkButton} onClick={openLocationEditor}>
            Edit
          </button>
        </div>
      )}

      {formOpen && (
        <form className={styles.locationForm} onSubmit={submitLocation}>
          <LocationPicker
            latitude={Number(draft.latitude)}
            longitude={Number(draft.longitude)}
            onChange={({ latitude, longitude, timeZone, label }) =>
              setDraft((current) => ({
                ...current,
                latitude,
                longitude,
                timeZone: timeZone || current.timeZone,
                label,
              }))
            }
          />

          <details className={styles.coordDetails}>
            <summary className={styles.coordSummary}>Type coordinates</summary>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Latitude</span>
                <input
                  type="number"
                  step="0.0001"
                  value={draft.latitude}
                  onChange={(event) => setDraft({ ...draft, latitude: event.target.value, label: '' })}
                  placeholder="14.5995"
                />
              </label>
              <label className={styles.field}>
                <span>Longitude</span>
                <input
                  type="number"
                  step="0.0001"
                  value={draft.longitude}
                  onChange={(event) => setDraft({ ...draft, longitude: event.target.value, label: '' })}
                  placeholder="120.9842"
                />
              </label>
            </div>
          </details>

          <label className={styles.field}>
            <span>Civil timezone (IANA) — includes daylight saving</span>
            <input
              type="text"
              value={draft.timeZone}
              onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}
              placeholder="Asia/Manila"
              autoComplete="off"
            />
          </label>

          <label className={styles.field}>
            <span>North angle (°) — which way the drawing is turned</span>
            <input
              type="number"
              step="1"
              value={draft.northAngle}
              onChange={(event) => setDraft({ ...draft, northAngle: event.target.value })}
            />
          </label>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton}>
              Save
            </button>
            <button type="button" className={styles.secondaryButton} onClick={useBrowserLocation}>
              Use my location
            </button>
            {located && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  // Dismiss the rejection too, or it would immediately reopen
                  // the form it just closed.
                  setDismissedCommand(lastCommand);
                  setDraftError(null);
                  setEditingFromKey(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
          {locationError && <p className={styles.error}>{locationError}</p>}
        </form>
      )}

      {/* State 3: running. Mode, date and time only; the rest folds away. */}
      {located && sunStudy.enabled && !formOpen && (
        <>
          <div className={styles.modeBlock}>
            <div className={styles.modeRow} role="group" aria-label="Study mode">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={sunStudy.mode === mode.id ? styles.modeButtonActive : styles.modeButton}
                  onClick={() => onPatch({ mode: mode.id })}
                  title={mode.hint}
                  aria-pressed={sunStudy.mode === mode.id}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {/* Fades in only if the work outlasts a moment, so a quick switch
                does not flash a progress bar at you. */}
            <div className={styles.progressTrack} data-busy={recomputing || undefined} aria-hidden="true">
              <span className={styles.progressBar} />
            </div>
            {/* The day study runs on a worker now; a run that dies must say so
                rather than leaving a stale overlay pretending to be current. */}
            {studyError && <p className={styles.error}>{studyError}</p>}
          </div>

          <div className={styles.dateRow}>
            <input
              type="date"
              className={styles.dateInput}
              value={sunStudy.date}
              onChange={(event) => onPatch({ date: event.target.value })}
              aria-label="Study date"
            />
            <span className={styles.dateReadout}>{formatStudyDate(sunStudy.date)}</span>
          </div>

          <div className={styles.presetRow}>
            {SUN_STUDY_KEY_DATES.map((preset) => {
              const { year } = parseSunStudyDate(sunStudy.date);
              const value = `${year}-${String(preset.month).padStart(2, '0')}-${String(preset.day).padStart(2, '0')}`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={sunStudy.date === value ? styles.presetButtonActive : styles.presetButton}
                  onClick={() => onPatch({ date: value })}
                  title={`Jump to the ${preset.label.toLowerCase()}`}
                >
                  {preset.short}
                </button>
              );
            })}
          </div>

          <div className={styles.timeBlock}>
            <div className={styles.timeHeader}>
              <strong className={styles.timeValue}>{formatStudyTime(sunStudy.minutes)}</strong>
              <span className={sunIsUp ? styles.sunUp : styles.sunDown}>
                {readout?.times.alwaysDown
                  ? 'Polar night'
                  : readout?.times.alwaysUp
                    ? 'Midnight sun'
                    : sunIsUp
                      ? `${readout.altitude.toFixed(0)}° up · ${compassPoint(readout.azimuth)}`
                      : 'Below horizon'}
              </span>
            </div>
            <input
              type="range"
              className={styles.timeSlider}
              style={trackStyle}
              min="0"
              max="1439"
              step="5"
              value={sunStudy.minutes}
              onChange={(event) => onPatch({ minutes: Number(event.target.value) })}
              aria-label="Time of day"
            />
            <div className={styles.timeScale}>
              <span>{readout?.sunriseLabel ? `↑ ${readout.sunriseLabel}` : '00:00'}</span>
              <span className={styles.timeScaleNote}>{site.timeZone} civil time</span>
              <span>{readout?.sunsetLabel ? `↓ ${readout.sunsetLabel}` : '23:59'}</span>
            </div>
          </div>

          <div className={styles.assessmentBlock} data-stale={recomputing || undefined}>
            <label className={styles.field}>
              <span>Assessment mask</span>
              <select
                value={sunStudy.targetId || 'property'}
                onChange={(event) => onPatch({ targetId: event.target.value })}
              >
                <option value="property" disabled={!hasPropertyTarget}>
                  Property boundary{hasPropertyTarget ? '' : ' (not defined)'}
                </option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.kind === 'neighbor' ? 'Neighbor' : 'Amenity'} · {target.name}
                  </option>
                ))}
                <option value="extent">Exploratory shadow extent</option>
              </select>
            </label>
            {result && (
              <div className={styles.resultCard} aria-live="polite">
                <div className={styles.resultHeader}>
                  <strong>{result.metric}</strong>
                  <span>{result.label}</span>
                </div>
                <p>{result.detail}</p>
              </div>
            )}
            {study?.mode === 'sunHours' && study.grid && <SunHoursLegend grid={study.grid} />}
          </div>

          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setShowAdvanced((current) => !current)}
            aria-expanded={showAdvanced}
          >
            <span className={showAdvanced ? styles.chevronOpen : styles.chevron}>›</span>
            Accuracy &amp; sampling
          </button>

          {showAdvanced && (
            <div className={styles.advancedBody}>
              {sunStudy.mode !== 'instant' && (
                <label className={styles.field}>
                  <span>Sample every</span>
                  <select
                    value={sunStudy.stepMinutes}
                    onChange={(event) => onPatch({ stepMinutes: Number(event.target.value) })}
                  >
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                  </select>
                </label>
              )}
              {sunStudy.mode === 'sunHours' && (
                <>
                  <label className={styles.field}>
                    <span>Grid cell</span>
                    <select
                      value={sunStudy.gridCellSize}
                      onChange={(event) => onPatch({ gridCellSize: Number(event.target.value) })}
                    >
                      <option value={500}>500 mm (fine)</option>
                      <option value={1000}>1 m</option>
                      <option value={2000}>2 m (fast)</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Target sun hours</span>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={sunStudy.thresholdHours}
                      onChange={(event) => onPatch({ thresholdHours: Number(event.target.value) })}
                    />
                  </label>
                </>
              )}
              <div className={styles.targetManager}>
                <span className={styles.subheading}>Property / neighbor masks</span>
                {targets.map((target) => (
                  <div key={target.id} className={styles.targetRow}>
                    <span>
                      {target.name} · {target.kind}
                    </span>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        onExecuteCommand({ type: BUILDING_COMMANDS.REMOVE_SOLAR_STUDY_TARGET, id: target.id });
                        if (sunStudy.targetId === target.id)
                          onPatch({ targetId: hasPropertyTarget ? 'property' : 'extent' });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <form className={styles.targetForm} onSubmit={addTarget}>
                  <div className={styles.fieldGrid}>
                    <label className={styles.field}>
                      <span>Name</span>
                      <input
                        value={targetDraft.name}
                        onChange={(event) => setTargetDraft({ ...targetDraft, name: event.target.value })}
                        placeholder="North neighbor garden"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Kind</span>
                      <select
                        value={targetDraft.kind}
                        onChange={(event) => setTargetDraft({ ...targetDraft, kind: event.target.value })}
                      >
                        <option value="neighbor">Neighbor</option>
                        <option value="amenity">Amenity</option>
                      </select>
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span>Polygon points — one x,y pair per line, millimetres</span>
                    <textarea
                      rows="4"
                      value={targetDraft.points}
                      onChange={(event) => setTargetDraft({ ...targetDraft, points: event.target.value })}
                      placeholder={'0,-20000\n10000,-20000\n10000,-10000\n0,-10000'}
                    />
                  </label>
                  <button type="submit" className={styles.secondaryButton}>
                    Add assessment mask
                  </button>
                  {(targetDraftError || targetRejection) && (
                    <p className={styles.error}>{targetDraftError || targetRejection}</p>
                  )}
                </form>
              </div>
              <p className={styles.disclaimer}>
                Geometric shadows for a clear sky. Terrain, neighbouring buildings outside the model, and vegetation are
                not accounted for.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
