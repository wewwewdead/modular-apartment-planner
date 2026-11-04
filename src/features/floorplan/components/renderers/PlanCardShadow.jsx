import { memo, useMemo, useState } from 'react';
import { buildPlanCardRegion, regionsToPath } from '@/geometry/planPresentationGeometry';
import { PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { useCanvasZoom } from './CanvasZoomContext';
import { usePlanDragActive } from './PlanStyleContext';

const FILTER_ID = 'plan-card-shadow';

function regionBounds(regions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { outline } of regions) {
    for (const p of outline) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * The white card the presentation plan sits on: the building's own footprint
 * (walls, columns, rooms and slabs unioned), filled white under the zone tints
 * and lifted off the canvas by one soft drop shadow.
 *
 * This is one of the two filtered elements the canvas carries (the other is the
 * shared fixture shadow). One path, one filter, a region sized to the
 * footprint plus the blur — never a filter per wall or per room.
 *
 * During a drag the footprint is not re-unioned per frame: the card from the
 * last settled render stays up, which is indistinguishable under a moving
 * pointer, and the next settled render catches it up.
 */
function PlanCardShadow({ walls, columns, rooms, slabs }) {
  const dragging = usePlanDragActive();
  const zoom = useCanvasZoom();
  const fresh = useMemo(
    () => (dragging ? null : buildPlanCardRegion({ walls, columns, rooms, slabs })),
    [dragging, walls, columns, rooms, slabs],
  );
  const [held, setHeld] = useState(null);
  if (fresh && fresh !== held) setHeld(fresh);
  const regions = fresh || held;
  if (!regions?.length) return null;

  const bounds = regionBounds(regions);
  if (!bounds) return null;
  const shadow = PRESENTATION_GRAPHICS.plan.cardShadow;
  // A drop shadow is a property of the screen, not of the building: the same
  // few pixels of soft edge at every zoom. In world units it grew with the
  // zoom, and a blur a thousand pixels wide was re-rasterised on every pan
  // frame. Outside a zoomed canvas (no zoom context) the world values stand.
  const dy = zoom ? shadow.dyPx / zoom : shadow.dy;
  const blur = zoom ? shadow.blurPx / zoom : shadow.blur;
  const color = shadow.color;
  const margin = blur * 3 + Math.abs(dy);

  return (
    <g className="plan-card" data-type="plan-card" style={{ pointerEvents: 'none' }}>
      <defs>
        <filter
          id={FILTER_ID}
          filterUnits="userSpaceOnUse"
          x={bounds.minX - margin}
          y={bounds.minY - margin}
          width={bounds.maxX - bounds.minX + margin * 2}
          height={bounds.maxY - bounds.minY + margin * 2}
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow dx={0} dy={dy} stdDeviation={blur} floodColor={color} />
        </filter>
      </defs>
      {/* Outlines only: a card is a footprint, so the space walls enclose is
          on it even before any rooms have been detected. */}
      <path
        d={regionsToPath(regions.map(({ outline }) => ({ outline, holes: [] })))}
        fillRule="nonzero"
        fill={PRESENTATION_GRAPHICS.plan.cardFill}
        filter={`url(#${FILTER_ID})`}
      />
    </g>
  );
}

export default memo(PlanCardShadow);
