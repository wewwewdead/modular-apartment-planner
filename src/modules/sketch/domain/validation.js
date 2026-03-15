const MAX_DIMENSION = 100000;
const MIN_DIMENSION = 1;

export function clampDimension(value, min = MIN_DIMENSION, max = MAX_DIMENSION) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function isValidNumber(v) {
  return Number.isFinite(v) && v > 0 && v <= MAX_DIMENSION;
}

function isFiniteNumber(v) {
  return Number.isFinite(v);
}

const DIMENSION_PROPS = {
  panel: ['width', 'depth', 'thickness'],
  leg: ['width', 'depth', 'height'],
  frame: ['width', 'height', 'length'],
  solid: ['extrusionDepth'],
  cutout: ['width', 'height', 'depth'],
  hole: ['diameter', 'depth'],
};

export function validatePartDimensions(part) {
  const errors = [];
  const props = DIMENSION_PROPS[part.type];
  if (!props) return { valid: true, errors };

  for (const prop of props) {
    const val = part[prop];
    if (val === undefined || val === null) continue;
    if (!isValidNumber(val)) {
      errors.push(`${prop}: must be a positive number <= ${MAX_DIMENSION} (got ${val})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validatePartPosition(part) {
  const errors = [];
  const pos = part.position;
  if (!pos) return { valid: true, errors };

  for (const axis of ['x', 'y', 'z']) {
    if (!isFiniteNumber(pos[axis])) {
      errors.push(`position.${axis}: must be a finite number (got ${pos[axis]})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCutoutFit(cutout, parent) {
  const errors = [];
  if (!cutout || !parent) return { valid: true, errors };

  if (cutout.width > parent.width) {
    errors.push(`cutout width (${cutout.width}) exceeds parent width (${parent.width})`);
  }
  if (cutout.depth && parent.depth && cutout.depth > parent.depth) {
    errors.push(`cutout depth (${cutout.depth}) exceeds parent depth (${parent.depth})`);
  }

  return { valid: errors.length === 0, errors };
}

export function sanitizePartDimensions(part) {
  const props = DIMENSION_PROPS[part.type];
  if (!props) return part;

  const sanitized = { ...part };
  for (const prop of props) {
    if (sanitized[prop] !== undefined && sanitized[prop] !== null) {
      sanitized[prop] = clampDimension(sanitized[prop]);
    }
  }
  return sanitized;
}

export function sanitizePartPosition(part) {
  if (!part.position) return part;
  const pos = { ...part.position };
  for (const axis of ['x', 'y', 'z']) {
    if (!isFiniteNumber(pos[axis])) pos[axis] = 0;
  }
  return { ...part, position: pos };
}
