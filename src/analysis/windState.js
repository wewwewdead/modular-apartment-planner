export const WIND_STUDY_MODES = Object.freeze(['direction', 'comfort']);
export const WIND_DIRECTIONS = Object.freeze(Array.from({ length: 16 }, (_, index) => index * 22.5));

export function createUniformWindRose() {
  return WIND_DIRECTIONS.map((directionDeg) => ({
    directionDeg,
    frequency: 1 / WIND_DIRECTIONS.length,
    weibullK: 2,
    weibullC: 5,
  }));
}

export function createWindStudyState(overrides = {}) {
  return {
    enabled: false,
    mode: 'direction',
    // Meteorological convention: where the wind comes FROM, clockwise from
    // true north.
    directionDeg: 0,
    referenceSpeed: 5,
    sliceHeight: 1500,
    resolution: 96,
    iterations: 450,
    relaxationTime: 0.58,
    domainPadding: 30000,
    windRose: createUniformWindRose(),
    windRoseSource: 'illustrative',
    windClimate: null,
    ...overrides,
  };
}

function finiteInRange(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeDirection(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return ((numeric % 360) + 360) % 360;
}

export function normalizeWindRose(entries) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const normalized = [];
  let totalFrequency = 0;
  for (const entry of entries) {
    const directionDeg = normalizeDirection(entry?.directionDeg);
    const frequency = Number(entry?.frequency);
    const weibullK = Number(entry?.weibullK);
    const weibullC = Number(entry?.weibullC);
    if (
      directionDeg == null ||
      !Number.isFinite(frequency) ||
      frequency < 0 ||
      !Number.isFinite(weibullK) ||
      weibullK <= 0 ||
      !Number.isFinite(weibullC) ||
      weibullC <= 0
    ) {
      return null;
    }
    totalFrequency += frequency;
    normalized.push({ directionDeg, frequency, weibullK, weibullC });
  }
  if (!(totalFrequency > 0)) return null;
  return normalized.map((entry) => ({ ...entry, frequency: entry.frequency / totalFrequency }));
}

export function applyWindStudyPatch(state, patch = {}) {
  const next = { ...state };
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (WIND_STUDY_MODES.includes(patch.mode)) next.mode = patch.mode;
  if (patch.directionDeg !== undefined) {
    const direction = normalizeDirection(patch.directionDeg);
    if (direction != null) next.directionDeg = direction;
  }
  if (patch.referenceSpeed !== undefined) {
    next.referenceSpeed = finiteInRange(patch.referenceSpeed, 0.1, 60, state.referenceSpeed);
  }
  if (patch.sliceHeight !== undefined) {
    next.sliceHeight = Math.round(finiteInRange(patch.sliceHeight, 100, 20000, state.sliceHeight));
  }
  if (patch.resolution !== undefined) {
    next.resolution = Math.round(finiteInRange(patch.resolution, 48, 256, state.resolution));
  }
  if (patch.iterations !== undefined) {
    next.iterations = Math.round(finiteInRange(patch.iterations, 100, 3000, state.iterations));
  }
  if (patch.relaxationTime !== undefined) {
    next.relaxationTime = finiteInRange(patch.relaxationTime, 0.51, 1.5, state.relaxationTime);
  }
  if (patch.domainPadding !== undefined) {
    next.domainPadding = Math.round(finiteInRange(patch.domainPadding, 5000, 250000, state.domainPadding));
  }
  if (patch.windRose !== undefined) {
    const windRose = normalizeWindRose(patch.windRose);
    if (windRose) next.windRose = windRose;
  }
  if (['illustrative', 'user', 'site-climate'].includes(patch.windRoseSource)) {
    next.windRoseSource = patch.windRoseSource;
  }
  if (patch.windClimate === null || (patch.windClimate && typeof patch.windClimate === 'object')) {
    next.windClimate = patch.windClimate;
  }
  return next;
}

export function windRunSettingsOf(state) {
  return {
    mode: state.mode,
    directionDeg: state.directionDeg,
    referenceSpeed: state.referenceSpeed,
    sliceHeight: state.sliceHeight,
    resolution: state.resolution,
    iterations: state.iterations,
    relaxationTime: state.relaxationTime,
    domainPadding: state.domainPadding,
    windRose: state.windRose,
    windRoseSource: state.windRoseSource,
  };
}
