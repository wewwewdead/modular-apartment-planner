// The zero point of the in-viewport sketcher (docs/sketch-studio-hand-drawing.md
// §6.1, HD-2): a sketch-plane point every X and Y shown or typed is measured
// from. Entities, dimensions, snap and the profile stay in sketch coordinates;
// these two helpers are the only place the zero is subtracted or added back.
// Pure: no imports, no three, no DOM (sketchProfile.js, which runs in the
// kernel worker, imports it).

const round = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};

export const ORIGIN = Object.freeze([0, 0]);

// The zero at the sketch origin (null, missing or [0, 0]).
export const isOrigin = (zero) => !zero || (zero[0] === 0 && zero[1] === 0);

// A sketch point as X, Y measured from the zero: what is shown.
export const fromZero = (point, zero) =>
  isOrigin(zero) ? point : [round(point[0] - zero[0]), round(point[1] - zero[1])];

// X, Y measured from the zero back to the sketch point: what is typed.
export const toZero = (values, zero) =>
  isOrigin(zero) ? values : [round(values[0] + zero[0]), round(values[1] + zero[1])];

// A stored `sketch.zero` read back: two finite numbers that are not the origin, else null.
export const storedZero = (value) =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && !isOrigin(value)
    ? [value[0], value[1]]
    : null;
