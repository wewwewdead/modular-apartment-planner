import { getBeamRenderData, resolveBeamAxis } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { distanceToSegment } from '@/geometry/line';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getFloorElevation } from './floorModels';
import { resolveWallVerticalSpan } from './wallFit';

const EPSILON = 0.01;

// Two anchors that land within a millimetre of a member are, for this question,
// the same distance from it: nothing in a building is dimensioned finely enough
// for the last millimetre to decide which support a wall belongs to.
const NEAREST_TIE = 1;

/**
 * Plan footprints of the structure a ceiling has to stop at: the beams it hangs
 * beside, the columns that pass through it, and the walls and partitions that
 * divide the space under it.
 *
 * Everything is filtered by elevation, because only structure that actually
 * crosses the ceiling's own slice of the room can obstruct it — a beam two
 * floors down or a half-height partition that dies below the band does not.
 *
 * The band is not the boards' own plane. A ceiling hung inside a beam bay is
 * bounded by everything built up to the underside of those beams, which is
 * below the boards, so `ceilingElevationRange` hands down a band that reaches
 * the beam soffit and the walls fitted under it are traced like any other
 * obstruction. Deciding where the band stops is that function's job alone; this
 * one only asks what crosses it.
 *
 * With one exception, and it is a refinement of that band rather than a second
 * opinion about it: the band's FLOOR is not one number once the bay steps. A bay
 * with beams over both a tall step and a low one has two bearing planes at once,
 * and a partition built up to the low step's framing is beside the assembly just
 * as surely as one built to the high step's — it is simply beside a lower part
 * of it. So the caller may hand down the bay's bearing statements as positions,
 * and each obstruction is then judged against the plane of the support nearest
 * it. The field can only ever lower the floor below what the band already
 * states, because the band's own bottom has already folded in the highest of
 * those same statements.
 */

/**
 * Closed on both ends on purpose: structure that reaches the band exactly — a
 * wall whose top finishes level with the beam soffit the ceiling hangs in, or
 * with the board underside where it hangs from nothing — bounds the ceiling
 * rather than passing under it.
 *
 * The floor is passed in rather than read off the range because the band's
 * bottom is not one number wherever the bay steps; see `bandFloorAt`. Without a
 * bearing field to refine it, it is the range's own bottom for everything.
 */
function reachesCeilingBand(bottom, top, range, bandFloor = range.min) {
  return top >= bandFloor - EPSILON && bottom <= range.max + EPSILON;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function planPoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * A cheap plan stand-in for the member being judged — the wall's drawn
 * centreline, the column's centre, the beam's resolved axis — as a segment to
 * measure to. The question it answers is only which support this member stands
 * with, and no member's exact outline moves that answer at the scale a bay
 * steps at: a wall is metres from one bearing and centimetres from another, or
 * it is genuinely between the two and the tie rule decides.
 */
function planProxy(start, end) {
  const a = planPoint(start);
  const b = planPoint(end);
  return a && b ? { a, b } : null;
}

/**
 * The bearing plane of the support nearest a member, or null when the field can
 * say nothing about it — no positioned statement, or a member with no plan
 * position of its own to measure from.
 *
 * Ties go to the HIGHEST plane, and this is load-bearing rather than tidiness:
 * a partition down the middle of a square bay is exactly equidistant from all
 * four of its corners, so the field genuinely cannot say which step that wall
 * belongs to. Where it cannot say, the bay's governing plane answers, and the
 * error that leaves is boards running over a wall that divides them rather than
 * boards cut short around one they clear by a metre — the direction a fitter can
 * see and scribe, not the one that leaves a hole nothing fills.
 */
function nearestBearingLevel(bearingEnds, proxy) {
  let nearest = Infinity;
  const measured = [];
  for (const end of bearingEnds) {
    const level = Number(end?.level);
    const anchor = planPoint(end);
    if (!Number.isFinite(level) || !anchor) continue;
    const away = distanceToSegment(anchor, proxy.a, proxy.b);
    if (!Number.isFinite(away)) continue;
    measured.push({ away, level });
    if (away < nearest) nearest = away;
  }
  if (!measured.length) return null;

  return measured.reduce(
    (highest, entry) => (entry.away <= nearest + NEAREST_TIE ? Math.max(highest, entry.level) : highest),
    -Infinity,
  );
}

/**
 * Where the band bottoms out for ONE member, which is not where it bottoms out
 * for the bay. The scalar band already carries the bay's highest bearing plane,
 * because that is the only honest summary of a bay whose supports disagree —
 * but "the level the framing stood at" is a local fact in a split-level bay, and
 * a partition built up to the low step's framing stands beside the assembly
 * exactly as one built to the high step does. So each member is judged against
 * the bearing plane of the support nearest it in plan.
 *
 * This can only ever LOWER the floor, never raise it: every level in the field
 * is one of the statements the scalar took its maximum over, so
 * min(range.min, local) is exactly min(boardUnderside, soffit, local) — the same
 * band the shipped rule builds, with the local plane in place of the bay-wide
 * one. A bay that does not step, or a caller with no field to hand, therefore
 * gets byte-for-byte the shipped answer.
 */
function bandFloorAt(range, bearingEnds, proxy) {
  if (!bearingEnds || !proxy) return range.min;
  const local = nearestBearingLevel(bearingEnds, proxy);
  return local === null ? range.min : Math.min(range.min, local);
}

/**
 * The structure of one floor that reaches the ceiling band, as the objects
 * themselves rather than their footprints. Tracing a cutout and deciding what a
 * ceiling-only view has to contain are the same question asked twice, so both
 * ask it here: anything that answers the elevation test separately will sooner
 * or later disagree with the boards it is supposed to explain.
 *
 * `bearingEnds` is optional — `resolveCeilingElevations` hands over the bay's
 * bearing statements as positions when it has any — and a caller that omits it
 * gets the band exactly as the range states it.
 */
export function collectCeilingBandStructure(floor, range, bearingEnds = null) {
  if (!floor || !range || !(range.max > range.min)) return { beams: [], columns: [], walls: [] };

  const columns = floor.columns || [];
  const floorLevel = getFloorElevation(floor);
  const ends = Array.isArray(bearingEnds) && bearingEnds.length ? bearingEnds : null;
  // Nothing is measured, and no proxy is built, where there is no field to
  // measure against: this routine is read on every frame of a drag, and a bay
  // that does not step must not pay for one that does.
  const bandFloor = (start, end) => (ends ? bandFloorAt(range, ends, planProxy(start, end)) : range.min);

  return {
    // Beam levels are absolute: the stored level is the beam's top, and it hangs
    // its own depth below that.
    beams: (floor.beams || []).filter((beam) => {
      const top = Number(beam?.floorLevel || 0);
      // A beam that resolves to no axis has no plan position to judge locally,
      // and falls back to the band's own floor.
      const axis = ends ? resolveBeamAxis(beam, columns) : null;
      return reachesCeilingBand(top - positive(beam?.depth), top, range, bandFloor(axis?.startCenter, axis?.endCenter));
    }),
    columns: columns.filter((column) =>
      reachesCeilingBand(floorLevel, floorLevel + positive(column?.height), range, bandFloor(column, column)),
    ),
    walls: (floor.walls || []).filter((wall) => {
      const { base, top } = resolveWallVerticalSpan(wall, floor);
      // A wall with a nonsense height occupies no band rather than an inverted
      // one, the way it did when this read the height through `positive`.
      return reachesCeilingBand(base, Math.max(base, top), range, bandFloor(wall?.start, wall?.end));
    }),
  };
}

function floorObstructions(floor, range, bearingEnds) {
  const columns = floor?.columns || [];
  const band = collectCeilingBandStructure(floor, range, bearingEnds);
  const outlines = [
    ...band.beams.map((beam) => getBeamRenderData(beam, columns)?.outline),
    ...band.columns.map((column) => columnOutline(column)),
    ...band.walls.map((wall) => getWallRenderData(wall, columns)?.outline),
  ];

  return outlines.filter((outline) => (outline?.length || 0) >= 3);
}

export function collectCeilingObstructions(floors = [], range = null, bearingEnds = null) {
  if (!range || !(range.max > range.min)) return [];
  return floors.filter(Boolean).flatMap((floor) => floorObstructions(floor, range, bearingEnds));
}
