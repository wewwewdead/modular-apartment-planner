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
 * Returns a shared frozen array when nothing overhangs, so a consumer memo
 * downstream is not invalidated by a fresh empty array every time.
 */

const NO_OVERHANGS = Object.freeze([]);

export function useFloorOverhangs(floors) {
  return useMemo(() => {
    const stack = floors || NO_OVERHANGS;
    // The lowest floor has nothing under it to overhang, so one storey can
    // never produce a result — skip the walk entirely.
    if (stack.length < 2) return NO_OVERHANGS;

    const overhangs = computeFloorOverhangs({ floors: stack });
    return overhangs.length ? overhangs : NO_OVERHANGS;
  }, [floors]);
}
