/**
 * Plank siding: how its courses are set out (docs/wall-cladding-finishes.md
 * §6.1).
 *
 * A siding face is not sheets. It is a field of boards — `exposure` of each
 * one showing, `joint` of shadow gap between — and the only geometry it has is
 * where the joints fall. Those are set out on a PROJECT datum rather than per
 * wall: a horizontal joint lies at every world elevation `k × pitch`, a
 * vertical one wherever the plan point's distance along the wall's own
 * direction (measured from the plan origin) is `k × pitch`. Two walls meeting
 * at a corner, or one storey standing on another, therefore show their boards
 * lining up without anybody having to line them up.
 *
 * This module is the one copy of those numbers. The wall detail drawing reads
 * them, the tests read them, and the 3D detail shader computes exactly the same
 * thing from a fragment's world position (`proceduralDetail.js`) — world space
 * is plan space at elevation y, so `y` is the horizontal coordinate and the dot
 * of `(x, z)` with the wall's direction the vertical one.
 *
 * Pure, no THREE.
 */

export const SIDING_COURSE_ORIENTATIONS = Object.freeze({
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
});

/** The face each board shows, in millimetres. */
export const SIDING_EXPOSURE_LIMITS = Object.freeze({ min: 40, max: 400 });
/** The shadow gap between boards, in millimetres. */
export const SIDING_JOINT_LIMITS = Object.freeze({ min: 0, max: 30 });

export const DEFAULT_SIDING_COURSE = Object.freeze({
  orientation: SIDING_COURSE_ORIENTATIONS.HORIZONTAL,
  exposure: 140,
  joint: 6,
});

/**
 * How long one board is, in millimetres. The 3D butt-joint stagger and the
 * bill's board count both read it, so the boards the render shows and the
 * boards the schedule orders are the same boards.
 */
export const SIDING_BOARD_LENGTH = 3600;

function clampWhole(value, limits, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  // Whole millimetres: a course is set out with a tape, and the value is part
  // of the 3D material key, where 140.0000001 must not be a second material.
  return Math.max(limits.min, Math.min(limits.max, Math.round(number)));
}

/** A course, filled and clamped: `{orientation, exposure, joint}`. */
export function normalizeSidingCourse(course) {
  return {
    orientation:
      course?.orientation === SIDING_COURSE_ORIENTATIONS.VERTICAL
        ? SIDING_COURSE_ORIENTATIONS.VERTICAL
        : SIDING_COURSE_ORIENTATIONS.HORIZONTAL,
    exposure: clampWhole(course?.exposure, SIDING_EXPOSURE_LIMITS, DEFAULT_SIDING_COURSE.exposure),
    joint: clampWhole(course?.joint, SIDING_JOINT_LIMITS, DEFAULT_SIDING_COURSE.joint),
  };
}

/** Board face plus gap — the same face-plus-joint convention `RAINSCREEN_MODULE` uses. */
export function sidingCoursePitch(course) {
  const normalized = normalizeSidingCourse(course);
  return normalized.exposure + normalized.joint;
}

/** `h140j6`: the course as the 3D material key carries it. */
export function sidingCourseKey(course) {
  const normalized = normalizeSidingCourse(course);
  return `${normalized.orientation === SIDING_COURSE_ORIENTATIONS.VERTICAL ? 'v' : 'h'}${normalized.exposure}j${normalized.joint}`;
}

/** The inverse of `sidingCourseKey`, or `null`. */
export function parseSidingCourseKey(key) {
  const match = /^(h|v)(\d+)j(\d+)$/.exec(typeof key === 'string' ? key : '');
  if (!match) return null;
  const course = {
    orientation: match[1] === 'v' ? SIDING_COURSE_ORIENTATIONS.VERTICAL : SIDING_COURSE_ORIENTATIONS.HORIZONTAL,
    exposure: Number(match[2]),
    joint: Number(match[3]),
  };
  // Only a key this module could have written: a clamped value would not
  // round-trip, and a material built from it would not be the one asked for.
  return sidingCourseKey(course) === key ? course : null;
}

/**
 * Where the datum lies in a wall's own drawing: the value of the project-wide
 * course coordinate at the drawing's origin.
 *
 * Horizontal courses run on world elevation, and a wall's v = 0 is at
 * `frameBase` (its resolved span's base), so a joint is at
 * `v = k × pitch − frameBase`. Vertical boards run on the distance along the
 * wall's direction from the plan origin, and a wall's u = 0 is its start point,
 * so a joint is at `u = k × pitch − dot(start, direction)`. The body of a wall
 * built off its axis moves only across the direction, never along it, so the
 * drawn start serves as well as the body's.
 */
export function sidingCourseDatum(course, { start, end, frameBase = 0 } = {}) {
  const normalized = normalizeSidingCourse(course);
  if (normalized.orientation === SIDING_COURSE_ORIENTATIONS.HORIZONTAL) return Number(frameBase) || 0;
  const dx = (end?.x ?? 0) - (start?.x ?? 0);
  const dy = (end?.y ?? 0) - (start?.y ?? 0);
  const length = Math.hypot(dx, dy);
  if (length <= 0) return 0;
  return ((start?.x ?? 0) * dx + (start?.y ?? 0) * dy) / length;
}

/**
 * Every joint centre-line `k × pitch − datum` inside `[from, to]`, in the wall's
 * own drawing coordinate (v for horizontal courses, u for vertical boards).
 */
export function sidingJointPositions(pitch, datum, from, to) {
  if (!(pitch > 0) || !(to > from)) return [];
  const positions = [];
  // Rounded so a line computed on the exact edge is not lost to float noise
  // either side of it.
  const first = Math.ceil((from + datum) / pitch - 1e-9);
  for (let k = first; k * pitch - datum <= to + 1e-9; k += 1) {
    positions.push(Number((k * pitch - datum).toFixed(6)));
  }
  return positions;
}

/**
 * The course lines of one siding face in its wall's drawing.
 *
 * `wall` supplies the start and end points (plan), `frame` the resolved span
 * (`base`, `height`), and `span` the board's u-range (`u0`, `u1`). Returns the
 * axis the lines are constant on — `'v'` for horizontal courses, `'u'` for
 * vertical boards — and their positions, inside the face.
 */
export function wallSidingCourseLines(course, { wall, frame, span }) {
  const normalized = normalizeSidingCourse(course);
  const pitch = normalized.exposure + normalized.joint;
  const datum = sidingCourseDatum(normalized, { start: wall?.start, end: wall?.end, frameBase: frame?.base });
  if (normalized.orientation === SIDING_COURSE_ORIENTATIONS.HORIZONTAL) {
    return { axis: 'v', pitch, positions: sidingJointPositions(pitch, datum, 0, Math.max(0, frame?.height || 0)) };
  }
  const u0 = span?.u0 ?? 0;
  const u1 = span?.u1 ?? (frame?.length || 0);
  return { axis: 'u', pitch, positions: sidingJointPositions(pitch, datum, u0, u1) };
}

/**
 * How many boards a face is set out in across its courses: the joints strictly
 * inside the face, plus one. A face of exactly one pitch between two joints is
 * one board; a face cut by four joints is five boards, the two end ones short.
 */
export function sidingBoardCountAcross(positions, from, to) {
  return positions.filter((position) => position > from + 1e-6 && position < to - 1e-6).length + 1;
}
