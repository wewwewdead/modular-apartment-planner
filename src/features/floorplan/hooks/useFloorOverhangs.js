import { useMemo } from 'react';
import { computeFloorOverhangs } from '@/geometry/floorOverhang';

/**
 * Where the project's slabs reach out past the storey below them.
 *
 * Measuring an overhang walks every upper slab's boundary at 100 mm steps
 * against every polygon underneath it, so it is not something to redo on each
 * render. It is keyed to the floor stack rather than the whole project on
 * purpose: renaming the project, editing a sheet or switching phase cannot
 * change where a slab sits over the one below it.
 *
 * Nor can anything on a floor but its slabs: a fixture dragged across a floor
 * hands back a new floors array every frame, and the overhangs it would
 * measure are the ones already measured. So the last stack measured is kept,
 * and a stack whose floors differ from it only in what the measurement never
 * reads returns the same array. Both the canvas and the properties panel ask
 * with the same floors, so the one entry serves both.
 *
 * Returns a shared frozen array when nothing overhangs, so a consumer memo
 * downstream is not invalidated by a fresh empty array every time.
 */

const NO_OVERHANGS = Object.freeze([]);

// Everything `computeFloorOverhangs` reads off a floor: what orders the stack
// (`getOrderedFloors`: level, elevation, storey height, name), the id it
// reports, and the slabs it measures.
function sameFloorForOverhangs(a, b) {
  return (
    a === b ||
    (a.id === b.id &&
      a.slabs === b.slabs &&
      a.levelIndex === b.levelIndex &&
      a.level === b.level &&
      a.elevation === b.elevation &&
      a.floorToFloorHeight === b.floorToFloorHeight &&
      a.name === b.name)
  );
}

function sameStack(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!sameFloorForOverhangs(a[index], b[index])) return false;
  }
  return true;
}

let lastMeasured = null;

export function measureFloorOverhangs(floors) {
  const stack = floors || NO_OVERHANGS;
  // The lowest floor has nothing under it to overhang, so one storey can
  // never produce a result — skip the walk entirely.
  if (stack.length < 2) return NO_OVERHANGS;
  if (lastMeasured && sameStack(lastMeasured.floors, stack)) return lastMeasured.overhangs;

  const measured = computeFloorOverhangs({ floors: stack });
  const overhangs = measured.length ? measured : NO_OVERHANGS;
  lastMeasured = { floors: stack, overhangs };
  return overhangs;
}

export function useFloorOverhangs(floors) {
  return useMemo(() => measureFloorOverhangs(floors), [floors]);
}
