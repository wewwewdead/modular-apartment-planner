/**
 * Surveyor bearing to SVG coordinate conversion.
 *
 * Surveyor bearings are expressed as N/S + degrees + minutes + E/W.
 * SVG uses a Y-down coordinate system where 0 rad points right (+X).
 */

/**
 * Convert a surveyor bearing to an SVG angle in radians.
 *
 * @param {'N'|'S'} ns  - North or South base direction
 * @param {number} degrees - Degrees (0–90)
 * @param {number} minutes - Arc-minutes (0–59)
 * @param {'E'|'W'} ew  - East or West deflection
 * @returns {number} Angle in radians (SVG Y-down: 0 = right, π/2 = down)
 */
export function surveyorBearingToSvgAngle(ns, degrees, minutes, ew) {
  const deviationRad = (degrees + minutes / 60) * (Math.PI / 180);

  if (ns === 'N' && ew === 'E') return -Math.PI / 2 + deviationRad;
  if (ns === 'N' && ew === 'W') return -Math.PI / 2 - deviationRad;
  if (ns === 'S' && ew === 'E') return Math.PI / 2 - deviationRad;
  // S … W
  return Math.PI / 2 + deviationRad;
}

/**
 * Compute the endpoint given a start point, length, and SVG angle.
 *
 * @param {{ x: number, y: number }} start
 * @param {number} lengthMm - Distance in millimeters
 * @param {number} angleRad - SVG angle in radians
 * @returns {{ x: number, y: number }}
 */
export function endpointFromBearing(start, lengthMm, angleRad) {
  return {
    x: start.x + Math.cos(angleRad) * lengthMm,
    y: start.y + Math.sin(angleRad) * lengthMm,
  };
}

export function svgVectorToSurveyorBearing(dx, dy) {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;

  const ns = dy <= 0 ? 'N' : 'S';
  const ew = dx >= 0 ? 'E' : 'W';
  const deviationDeg = Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI);
  const totalMinutes = Math.max(0, Math.min(90 * 60, Math.round(deviationDeg * 60)));

  return {
    ns,
    ew,
    degrees: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

export function pointsToSurveyorBearing(start, end) {
  return svgVectorToSurveyorBearing(end.x - start.x, end.y - start.y);
}

export function formatSurveyorBearing(bearing) {
  if (!bearing) return '';
  const minutes = String(bearing.minutes).padStart(2, '0');
  return `${bearing.ns} ${bearing.degrees}°${minutes}′ ${bearing.ew}`;
}
