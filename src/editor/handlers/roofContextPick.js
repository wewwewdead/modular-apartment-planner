import { pointInPolygon, polygonArea } from '@/geometry/polygon';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';

/**
 * Which of the roofs drawn as context in the roof plan a point lands in
 * (docs/multi-roof.md §5.2), for the roof tools: the roof select tool makes it
 * the active roof, the place tools name it and stay on the active one.
 *
 * A roof is hit anywhere inside its outline (overhang included, the outline
 * the context layer draws), openings too: the click is about which roof, not
 * where on it. Where outlines overlap the highest roof wins — it is the one on
 * top in the building — and between two at one height the smaller, which is
 * the one a click inside both most likely meant.
 */
export function findContextRoofAt(roofSystems, point) {
  let best = null;
  for (const roofSystem of roofSystems || []) {
    const outline = buildRoofPlaneGeometry(roofSystem).roofOutline || roofSystem?.boundaryPolygon || [];
    if (outline.length < 3 || !pointInPolygon(point, outline)) continue;
    const elevation = Number(roofSystem.baseElevation) || 0;
    const area = polygonArea(outline);
    if (!best || elevation > best.elevation || (elevation === best.elevation && area < best.area)) {
      best = { roofSystem, elevation, area };
    }
  }
  return best?.roofSystem || null;
}

/** The status line for a place-tool press that landed on another roof. */
export function otherRoofMessage(roofSystem) {
  return `That is ${roofSystem?.name || 'Roof'}. Select it first to work on it.`;
}
