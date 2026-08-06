/**
 * Editor-side settings for the sun and shadow study. Pure helpers, kept out of
 * the reducer so they can be unit tested and reused by the panel and the 3D
 * preview without importing store internals.
 *
 * The study's date and time are the site's own wall clock, not the viewer's:
 * someone in Manila reviewing a Manila site and someone in London reviewing the
 * same site must see the same shadows.
 */

import { isValidTimeZone } from '@/utils/timeZone';

export const SUN_STUDY_MODES = Object.freeze(['instant', 'range', 'sunHours']);

/**
 * Dates that matter in a shadow study, offered as one-click presets. `short` is
 * the button face; `label` is the tooltip. Both solstices and the equinox are
 * unambiguous worldwide, unlike "longest day", which flips hemisphere.
 */
export const SUN_STUDY_KEY_DATES = Object.freeze([
  { id: 'summer', label: 'June solstice', short: '21 Jun', month: 6, day: 21 },
  { id: 'equinox', label: 'March equinox', short: '20 Mar', month: 3, day: 20 },
  { id: 'winter', label: 'December solstice', short: '21 Dec', month: 12, day: 21 },
]);

export function createSunStudyState(overrides = {}) {
  return {
    enabled: false,
    mode: 'instant',
    // Local date at the site, as YYYY-MM-DD. The December solstice is the
    // default because it is the worst case in the northern hemisphere and the
    // date most overshadowing rules are written against.
    date: '2026-12-21',
    // Minutes past local midnight.
    minutes: 12 * 60,
    // Sampling interval for range and sun-hours studies.
    stepMinutes: 15,
    // Ground grid resolution for the sun-hours map, in mm.
    gridCellSize: 1000,
    // Hours of direct sun a cell needs to count as compliant.
    thresholdHours: 2,
    // Built-in property mask, a stored neighbor/amenity target id, or `extent`
    // for an exploratory (non-compliance) map around the massing.
    targetId: 'property',
    ...overrides,
  };
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce a patch into a valid state. The panel drives this from text inputs and
 * sliders, so every field has to survive nonsense without corrupting the study.
 */
export function applySunStudyPatch(state, patch = {}) {
  const next = { ...state };

  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (SUN_STUDY_MODES.includes(patch.mode)) next.mode = patch.mode;
  if (typeof patch.date === 'string' && DATE_PATTERN.test(patch.date)) next.date = patch.date;
  if (patch.minutes !== undefined) next.minutes = Math.round(clampNumber(patch.minutes, 0, 1439, state.minutes));
  if (patch.stepMinutes !== undefined) {
    next.stepMinutes = Math.round(clampNumber(patch.stepMinutes, 1, 120, state.stepMinutes));
  }
  if (patch.gridCellSize !== undefined) {
    next.gridCellSize = Math.round(clampNumber(patch.gridCellSize, 100, 20000, state.gridCellSize));
  }
  if (patch.thresholdHours !== undefined) {
    next.thresholdHours = clampNumber(patch.thresholdHours, 0, 24, state.thresholdHours);
  }
  if (typeof patch.targetId === 'string' && patch.targetId.trim()) next.targetId = patch.targetId.trim();

  return next;
}

/** Split a YYYY-MM-DD study date into the parts `siteInstant` wants. */
export function parseSunStudyDate(date) {
  const [year, month, day] = String(date || '')
    .split('-')
    .map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { year: 2026, month: 12, day: 21 };
  }
  return { year, month, day };
}

/** Format minutes past midnight as HH:MM for the scrubber readout. */
export function formatStudyTime(minutes) {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes || 0)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Whether a site carries enough information to run a civil-time study.
 */
export function siteSupportsSunStudy(site) {
  return Number.isFinite(site?.latitude) && Number.isFinite(site?.longitude) && isValidTimeZone(site?.timeZone);
}
