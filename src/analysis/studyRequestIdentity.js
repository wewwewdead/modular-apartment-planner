import { normalizeWindRose } from './windState';

let nextProjectIdentity = 1;
const projectIdentities = new WeakMap();

function identityOf(project) {
  if (!project || (typeof project !== 'object' && typeof project !== 'function')) return 'none';
  let identity = projectIdentities.get(project);
  if (!identity) {
    identity = nextProjectIdentity;
    nextProjectIdentity += 1;
    projectIdentities.set(project, identity);
  }
  return identity;
}

/**
 * Identity of one worker run, including the exact phase-filtered project
 * object. Settings alone are insufficient: an edit can change the geometry
 * while leaving every analysis control untouched.
 *
 * This is the MAIN-THREAD gate, and it stays identity-based on purpose. The
 * hook needs an answer on every render, and the reducer already gives it a free
 * one: it replaces the project object exactly when the model changes. Hashing
 * the model here instead would pay a full traversal per render to learn what an
 * object comparison already knows.
 *
 * The worker's cache cannot use this. A structured clone arrives on the other
 * side as a different object every time, so identity there is meaningless and
 * the two content keys below are what a cached field is filed under.
 */
export function studyRequestKey({ project, projectRevision = null, settings = null, scope = null }) {
  return JSON.stringify({
    projectIdentity: identityOf(project),
    projectRevision,
    settings,
    scope,
  });
}

/* -------------------------------------------------------------------------- */
/* Wind content keys                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 64 bits of FNV-1a, as two independent 32-bit streams, plus the input length.
 *
 * A cache key is a correctness surface, not a convenience: two different
 * buildings that hash alike would be served each other's flow field, silently.
 * One 32-bit stream is nowhere near enough for that — birthday collisions start
 * showing up in the tens of thousands of keys — so two streams with different
 * offset bases run over the same bytes, and the byte length is appended, which
 * costs nothing and rules out every collision between inputs of different size.
 *
 * The alternative, keeping the whole descriptor as the key, was rejected for a
 * concrete reason rather than on principle: the key is stamped onto every result
 * as `sourceKey` and crosses `postMessage` with it, and a real floorplate's
 * descriptor is tens of kilobytes.
 */
function hashDescriptor(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}:${text.length}`;
}

function point(value) {
  return value ? [value.x ?? null, value.y ?? null] : null;
}

function points(list) {
  return (list || []).map(point);
}

/**
 * Every wall field the massing raster and the airflow network read.
 *
 * `controlPoint` is in the list because `wallOutline` branches on it into
 * `arcWallOutline`: a wall that gains a bulge occupies different cells while
 * every other field it has stays put.
 */
function wallDescriptor(wall) {
  return [
    wall?.id ?? null,
    point(wall?.start),
    point(wall?.end),
    wall?.thickness ?? null,
    wall?.height ?? null,
    point(wall?.controlPoint),
  ];
}

function ventilationDescriptor(opening) {
  const ventilation = opening?.ventilation;
  if (!ventilation) return null;
  return [ventilation.operable ?? null, ventilation.openFraction ?? null, ventilation.dischargeCoefficient ?? null];
}

function openingDescriptor(opening) {
  return [
    opening?.id ?? null,
    opening?.wallId ?? null,
    opening?.offset ?? null,
    opening?.width ?? null,
    opening?.height ?? null,
    opening?.sillHeight ?? null,
    opening?.type ?? null,
    ventilationDescriptor(opening),
  ];
}

function siteDescriptor(project) {
  const site = project?.building?.site || {};
  return [site.northAngle ?? null, site.exposureClass ?? null];
}

/**
 * The sector directions a run will actually solve, in the order it solves them.
 *
 * Normalised rather than raw, because that is what the runner solves: a rose
 * written with a 360 deg sector produces the identical lattice run to one
 * written with 0 deg, and a key that told them apart would throw away a legal
 * cache hit. A rose the normaliser rejects contributes `null` — the run is going
 * to throw before it solves anything, so there is nothing to file.
 */
function sectorDirections(settings) {
  if (settings?.mode !== 'comfort') return null;
  const rose = normalizeWindRose(settings.windRose);
  return rose ? rose.map((sector) => sector.directionDeg) : null;
}

/**
 * What invalidates the solved LBM raster, and nothing else.
 *
 * The enumeration mirrors `buildAnalysisMassing(project, { includeRoof: false })`
 * feeding `massesAtSlice` — walls, free-standing columns and slabs, each with
 * the floor elevation and floor-to-floor height that place it in space. Roofs
 * are absent because the wind runner asks for the massing without them.
 *
 * Note what is NOT here: rooms, windows and doors. That is the whole point of
 * the split. Opening a window changes the airflow network and changes nothing
 * about the solid the lattice flows around, so it must not cost a re-solve.
 *
 * The solver controls join it because they change the lattice itself, and the
 * site's north angle joins it because `buildWindDomain` rotates the domain by it.
 * `exposureClass` is here CONSERVATIVELY: it never enters the lattice — it scales
 * the reference speed the dimensionless field is read against — so filing it
 * under massing costs a needless re-solve when a user changes terrain category.
 * It is listed because the plan specifies it, and because a key that is too
 * sensitive wastes time while one that is not sensitive enough is wrong.
 *
 * @param {object} options
 * @param {object} options.project   Phase-filtered project, as the runner sees it.
 * @param {object} options.settings  Normalised wind run settings.
 * @returns {string}
 */
export function windMassingKey({ project, settings }) {
  const floors = (project?.floors || []).map((floor) => [
    floor?.id ?? null,
    floor?.elevation ?? null,
    floor?.floorToFloorHeight ?? null,
    (floor?.walls || []).map(wallDescriptor),
    (floor?.columns || []).map((column) => [
      column?.x ?? null,
      column?.y ?? null,
      column?.width ?? null,
      column?.depth ?? null,
      column?.rotation ?? null,
      column?.height ?? null,
    ]),
    (floor?.slabs || []).map((slab) => [
      points(slab?.boundaryPoints),
      slab?.elevation ?? null,
      slab?.thickness ?? null,
    ]),
  ]);

  return hashDescriptor(
    JSON.stringify({
      v: 1,
      floors,
      site: siteDescriptor(project),
      mode: settings?.mode ?? null,
      directionDeg: settings?.mode === 'comfort' ? null : (settings?.directionDeg ?? null),
      sectors: sectorDirections(settings),
      sliceHeight: settings?.sliceHeight ?? null,
      resolution: settings?.resolution ?? null,
      iterations: settings?.iterations ?? null,
      relaxationTime: settings?.relaxationTime ?? null,
      domainPadding: settings?.domainPadding ?? null,
    }),
  );
}

/**
 * What only re-solves the airflow network and re-assembles the summaries.
 *
 * Rooms and openings are the reason this key exists. Walls are in it as well as
 * in the massing key, and deliberately: the network reads them twice over —
 * `roomHeight` probes each wall's midpoint for the room it bounds, and every
 * opening's centre and outward normal are derived from the wall it sits in — so
 * a wall that moves invalidates both keys, which is the honest answer.
 *
 * The solver controls (resolution, iterations, padding, relaxation) are
 * deliberately absent. They are covered by the massing key, and a result is
 * identified by the PAIR: anything that changes the field changes the massing
 * key, so repeating those settings here would only make two keys move where one
 * suffices.
 *
 * @param {object} options
 * @param {object} options.project   Phase-filtered project, as the runner sees it.
 * @param {object} options.settings  Normalised wind run settings.
 * @returns {string}
 */
export function windNetworkKey({ project, settings }) {
  const floors = (project?.floors || []).map((floor) => [
    floor?.id ?? null,
    floor?.elevation ?? null,
    floor?.floorToFloorHeight ?? null,
    (floor?.walls || []).map(wallDescriptor),
    (floor?.rooms || []).map((room) => [room?.id ?? null, room?.name ?? null, points(room?.points)]),
    (floor?.windows || []).map(openingDescriptor),
    (floor?.doors || []).map(openingDescriptor),
  ]);

  return hashDescriptor(
    JSON.stringify({
      v: 1,
      floors,
      site: siteDescriptor(project),
      mode: settings?.mode ?? null,
      directionDeg: settings?.mode === 'comfort' ? null : (settings?.directionDeg ?? null),
      referenceSpeed: settings?.referenceSpeed ?? null,
      sliceHeight: settings?.sliceHeight ?? null,
      windRose: settings?.mode === 'comfort' ? normalizeWindRose(settings.windRose) : null,
      windRoseSource: settings?.windRoseSource ?? null,
    }),
  );
}

/**
 * Both halves of a wind request's content identity.
 *
 * `key` is the combined one — everything a result's NUMBERS are computed from,
 * as opposed to the field alone — and is derived from the pair rather than
 * computed separately, so the two can never disagree.
 *
 * One thing it deliberately does not cover: `phaseScope`. That is a disclosure
 * the runner stamps on the model so a stored study can say what view it was a
 * study OF, and it enters no calculation — the project reaching the runner has
 * already been filtered. Two runs of the same filtered geometry under different
 * phase views share these keys and still report their own scope correctly,
 * because the assembly is re-run every time and only the solved field is cached.
 */
export function windRequestKeys({ project, settings }) {
  const massingKey = windMassingKey({ project, settings });
  const networkKey = windNetworkKey({ project, settings });
  return { massingKey, networkKey, key: combinedWindRequestKey({ massingKey, networkKey }) };
}

/** The one string that identifies a result, given the two that identify its parts. */
export function combinedWindRequestKey({ massingKey, networkKey }) {
  return `${massingKey}|${networkKey}`;
}
