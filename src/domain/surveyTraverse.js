import { polygonArea } from '@/geometry/polygon';

/**
 * Metes-and-bounds boundary input: the technical-description table on a
 * surveyor's sketch plan, one quadrant bearing plus a distance per boundary
 * line, walked into the y-down millimetre polygon the site model expects.
 *
 * Conventions (shared with the sun study, see src/analysis/):
 * - plan space is millimetres with y increasing downward
 * - a compass azimuth θ maps to the plan direction (sin θ, -cos θ)
 * - northAngle follows SVG rotate(): 0 = north up, positive swings clockwise
 */

export function isValidTraverseLine(line) {
  if (!line) return false;
  const minutes = line.minutes ?? 0;
  return (
    (line.ns === 'N' || line.ns === 'S') &&
    (line.ew === 'E' || line.ew === 'W') &&
    Number.isFinite(line.degrees) &&
    line.degrees >= 0 &&
    Number.isFinite(minutes) &&
    minutes >= 0 &&
    minutes < 60 &&
    line.degrees + minutes / 60 <= 90 &&
    Number.isFinite(line.distance) &&
    line.distance > 0
  );
}

export function bearingToAzimuthDegrees({ ns, degrees, minutes = 0, ew }) {
  const fromMeridian = degrees + minutes / 60;
  if (ns === 'N' && ew === 'E') return fromMeridian;
  if (ns === 'S' && ew === 'E') return 180 - fromMeridian;
  if (ns === 'S' && ew === 'W') return 180 + fromMeridian;
  return (360 - fromMeridian) % 360;
}

export function formatBearing(line) {
  if (!line) return '';
  const minutes = Math.round(line.minutes ?? 0);
  return `${line.ns} ${line.degrees}°${String(minutes).padStart(2, '0')}′ ${line.ew}`;
}

/**
 * Walk the boundary lines from the origin. A closed traverse should land back
 * on its starting corner; rounded distances and minutes never close exactly,
 * so the polygon keeps the first corner of every line and the leftover gap is
 * reported as the misclosure for the caller to judge.
 */
export function traverseBoundary(lines = [], { origin = { x: 0, y: 0 }, northAngle = 0 } = {}) {
  if (lines.length < 3 || !lines.every(isValidTraverseLine)) return null;
  const points = [{ x: origin.x, y: origin.y }];
  let perimeter = 0;
  for (const line of lines) {
    const theta = ((northAngle + bearingToAzimuthDegrees(line)) * Math.PI) / 180;
    const last = points[points.length - 1];
    points.push({
      x: last.x + Math.sin(theta) * line.distance,
      y: last.y - Math.cos(theta) * line.distance,
    });
    perimeter += line.distance;
  }
  const end = points.pop();
  const misclosure = Math.hypot(end.x - origin.x, end.y - origin.y);
  return {
    points,
    perimeter,
    misclosure,
    misclosureRatio: perimeter > 0 ? misclosure / perimeter : Number.POSITIVE_INFINITY,
    area: polygonArea(points),
  };
}
