const EPSILON = 1e-6;
const SINE_ARCH_INTEGRATION_STEPS = 256;
const SINE_ARCH_BINARY_SEARCH_STEPS = 28;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize2d(vector) {
  const length = Math.sqrt((vector.x * vector.x) + (vector.z * vector.z));
  if (length <= EPSILON) {
    return { x: 1, z: 0 };
  }

  return {
    x: vector.x / length,
    z: vector.z / length,
  };
}

function distance2d(start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  return Math.sqrt((dx * dx) + (dz * dz));
}

export function polylineLength(points = []) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += distance2d(points[index], points[index + 1]);
  }
  return total;
}

export function samplePolyline(points = [], distanceAlong = 0) {
  if (!points.length) return null;
  if (points.length === 1) {
    return {
      point: { ...points[0] },
      tangent: { x: 1, z: 0 },
      distanceAlong: 0,
    };
  }

  const totalLength = polylineLength(points);
  let remaining = clamp(distanceAlong, 0, totalLength);

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentLength = distance2d(start, end);
    if (segmentLength <= EPSILON) continue;

    if (remaining <= segmentLength + EPSILON || index === points.length - 2) {
      const ratio = clamp(remaining / segmentLength, 0, 1);
      return {
        point: {
          x: start.x + ((end.x - start.x) * ratio),
          z: start.z + ((end.z - start.z) * ratio),
        },
        tangent: normalize2d({
          x: end.x - start.x,
          z: end.z - start.z,
        }),
        distanceAlong: clamp(distanceAlong, 0, totalLength),
      };
    }

    remaining -= segmentLength;
  }

  const lastPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2] || lastPoint;
  return {
    point: { ...lastPoint },
    tangent: normalize2d({
      x: lastPoint.x - previousPoint.x,
      z: lastPoint.z - previousPoint.z,
    }),
    distanceAlong: totalLength,
  };
}

function evaluateSineArchPoint(curve, x) {
  const span = Math.max(Number(curve?.endX || 0) - Number(curve?.startX || 0), EPSILON);
  const rise = Number(curve?.rise || 0);
  const startX = Number(curve?.startX || 0);
  const ratio = (x - startX) / span;

  return {
    x,
    z: rise * Math.sin(Math.PI * clamp(ratio, 0, 1)),
  };
}

function evaluateSineArchDerivative(curve, x) {
  const span = Math.max(Number(curve?.endX || 0) - Number(curve?.startX || 0), EPSILON);
  const rise = Number(curve?.rise || 0);
  const startX = Number(curve?.startX || 0);
  const ratio = (x - startX) / span;
  return (rise * Math.PI / span) * Math.cos(Math.PI * clamp(ratio, 0, 1));
}

function integrateSimpson(fn, start, end, steps = SINE_ARCH_INTEGRATION_STEPS) {
  const evenSteps = Math.max(2, steps + (steps % 2));
  const h = (end - start) / evenSteps;
  let sum = fn(start) + fn(end);

  for (let index = 1; index < evenSteps; index += 1) {
    const x = start + (index * h);
    sum += fn(x) * (index % 2 === 0 ? 2 : 4);
  }

  return (h / 3) * sum;
}

function getSineArchLengthAtX(curve, x) {
  const startX = Number(curve?.startX || 0);
  const endX = Number(curve?.endX || 0);
  const clampedX = clamp(x, startX, endX);
  if (clampedX <= startX + EPSILON) return 0;

  return integrateSimpson((value) => {
    const dzdx = evaluateSineArchDerivative(curve, value);
    return Math.sqrt(1 + (dzdx * dzdx));
  }, startX, clampedX);
}

export function getMeasurementCurveLength(curve = null) {
  if (!curve) return 0;
  if (curve.kind === 'sine_arch') {
    return getSineArchLengthAtX(curve, Number(curve.endX || 0));
  }
  return 0;
}

export function sampleMeasurementCurve(curve = null, distanceAlong = 0) {
  if (!curve) return null;

  if (curve.kind === 'sine_arch') {
    const startX = Number(curve?.startX || 0);
    const endX = Number(curve?.endX || 0);
    const totalLength = getMeasurementCurveLength(curve);
    const targetLength = clamp(distanceAlong, 0, totalLength);

    let low = startX;
    let high = endX;
    for (let index = 0; index < SINE_ARCH_BINARY_SEARCH_STEPS; index += 1) {
      const midpoint = (low + high) / 2;
      const midpointLength = getSineArchLengthAtX(curve, midpoint);
      if (midpointLength < targetLength) {
        low = midpoint;
      } else {
        high = midpoint;
      }
    }

    const sampleX = (low + high) / 2;
    const point = evaluateSineArchPoint(curve, sampleX);
    const tangent = normalize2d({
      x: 1,
      z: evaluateSineArchDerivative(curve, sampleX),
    });

    return {
      point,
      tangent,
      distanceAlong: targetLength,
    };
  }

  return null;
}

export function getTopChordRunLength(run = null) {
  const points = run?.points || [];
  if (run?.measurementCurve) {
    return getMeasurementCurveLength(run.measurementCurve);
  }
  return polylineLength(points);
}

export function sampleTopChordRun(run = null, distanceAlong = 0) {
  if (!run) return null;
  if (run.measurementCurve) {
    return sampleMeasurementCurve(run.measurementCurve, distanceAlong);
  }
  return samplePolyline(run.points || [], distanceAlong);
}

export function sampleTopChordRunMidpoint(run = null) {
  return sampleTopChordRun(run, getTopChordRunLength(run) / 2);
}
