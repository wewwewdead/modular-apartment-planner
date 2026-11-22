/**
 * Whole-project derivations, memoised per project object (docs/perf-pass-3.md D1.1).
 *
 * One settled edit asks the same whole-project questions many times over: the
 * store's coordination pass derives the feasibility economics, the cost and
 * documentation realizations and the professional handoff, and so does nearly
 * every one of those for its own ends — the cost realization prices every
 * scenario, the documentation realization reads the cost realization, the
 * document package and the validators read all of them again. Each ask walked
 * the whole project afresh for an answer that could not have changed.
 *
 * Keyed on the project object and held weakly, the pattern of the validation
 * memo in buildingGraph.js: the store never mutates a project in place, so the
 * same object always derives the same. What the project holds is still checked
 * by identity on every ask, down to each storey's entities (see `projectParts`),
 * so a caller that swapped a slice, a storey's collection or one entity in place
 * is not handed a stale answer; tests do exactly that. An entity edited field by
 * field in place would go unseen, as it already does by every other memo here.
 * The answer is shared between every caller that asks, so none may write into
 * it; each call site was checked for that when these memos went in.
 */

/*
 * Everything a whole-project derivation can read, one level of objects at a
 * time: the project's own values, the building's, each storey's, and each entry
 * of a storey's collections. A few hundred identity checks, against derivations
 * that serialise or measure the whole building.
 */
function projectParts(project) {
  const parts = Object.values(project);
  const building = project.building;
  if (building && typeof building === 'object') parts.push(...Object.values(building));
  for (const floor of Array.isArray(project.floors) ? project.floors : []) {
    if (!floor || typeof floor !== 'object') continue;
    for (const value of Object.values(floor)) {
      parts.push(value);
      if (Array.isArray(value)) parts.push(...value);
    }
  }
  return parts;
}

function samePartsAs(cachedParts, parts) {
  if (cachedParts.length !== parts.length) return false;
  for (let index = 0; index < parts.length; index += 1) {
    if (cachedParts[index] !== parts[index]) return false;
  }
  return true;
}

// How many times each memo actually derived, for the tests that hold one edit
// to one derivation. Counted in development builds only.
const computeCounts = new Map();

/**
 * `derive(project, key)` memoised per project object and, within it, per `key`
 * (a scenario id, or nothing). A `project` that is not an object is passed
 * straight through.
 */
export function memoizePerProject(name, derive) {
  const cache = new WeakMap();
  return function derivePerProject(project, key = null) {
    if (!project || typeof project !== 'object') return derive(project, key);
    const parts = projectParts(project);
    let entry = cache.get(project);
    if (!entry || !samePartsAs(entry.parts, parts)) {
      entry = { parts, results: new Map() };
      cache.set(project, entry);
    }
    if (entry.results.has(key)) return entry.results.get(key);
    if (import.meta.env?.DEV) computeCounts.set(name, (computeCounts.get(name) || 0) + 1);
    const result = derive(project, key);
    entry.results.set(key, result);
    return result;
  };
}

/** Development builds: how many times the memo `name` has derived since the last reset. */
export function projectMemoComputeCount(name) {
  return computeCounts.get(name) || 0;
}

export function resetProjectMemoComputeCounts() {
  computeCounts.clear();
}
