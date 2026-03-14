export const ANNOTATION_TRUST_LEVELS = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  INFORMATIONAL: 'informational',
});

export const ANNOTATION_SEMANTIC_ROLES = Object.freeze({
  MEASUREMENT: 'measurement',
  LABEL: 'label',
});

const DEFAULT_MEASUREMENT_POLICY = Object.freeze({
  unitSystem: 'metric',
  lengthUnit: 'mm',
  lengthPrecision: 0,
  roundingMode: 'nearest',
});

function clampPrecision(value) {
  return Math.max(0, Math.round(Number(value ?? DEFAULT_MEASUREMENT_POLICY.lengthPrecision) || 0));
}

function roundToPrecision(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function resolveMeasurementPolicy(projectOrPolicy = null, overrides = {}) {
  const source = projectOrPolicy?.documentDefaults?.measurementPolicy
    || projectOrPolicy?.measurementPolicy
    || projectOrPolicy
    || {};

  return {
    unitSystem: source.unitSystem === 'metric'
      ? 'metric'
      : DEFAULT_MEASUREMENT_POLICY.unitSystem,
    lengthUnit: source.lengthUnit === 'mm'
      ? 'mm'
      : DEFAULT_MEASUREMENT_POLICY.lengthUnit,
    lengthPrecision: clampPrecision(source.lengthPrecision ?? source.precision),
    roundingMode: DEFAULT_MEASUREMENT_POLICY.roundingMode,
    ...overrides,
  };
}

export function roundMeasurementValue(mm, projectOrPolicy = null, options = {}) {
  const policy = resolveMeasurementPolicy(projectOrPolicy, options.policy);
  const absolute = options.absolute ?? true;
  const rawValue = Number(mm) || 0;
  const normalizedValue = absolute ? Math.abs(rawValue) : rawValue;
  return roundToPrecision(normalizedValue, policy.lengthPrecision);
}

export function formatMeasurementValue(mm, projectOrPolicy = null, options = {}) {
  const policy = resolveMeasurementPolicy(projectOrPolicy, options.policy);
  const roundedValue = roundMeasurementValue(mm, policy, options);
  const valueText = policy.lengthPrecision > 0
    ? roundedValue.toFixed(policy.lengthPrecision)
    : String(Math.round(roundedValue));

  return `${valueText} ${policy.lengthUnit}`;
}

export function createMeasurementMetadata(mm, projectOrPolicy = null, options = {}) {
  const policy = resolveMeasurementPolicy(projectOrPolicy, options.policy);
  return {
    rawValueMm: Number(mm) || 0,
    roundedValueMm: roundMeasurementValue(mm, policy, options),
    displayValue: formatMeasurementValue(mm, policy, options),
    unit: policy.lengthUnit,
    precision: policy.lengthPrecision,
    unitSystem: policy.unitSystem,
  };
}
