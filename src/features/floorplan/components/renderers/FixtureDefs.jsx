/**
 * Shared SVG <defs> for fixture gradients and drop shadow filter.
 * Rendered once inside SvgCanvas before FixtureRenderer.
 */
import { memo } from 'react';
import { PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { useCanvasZoom } from './CanvasZoomContext';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

// The drafting fixture shadow: world units for a render with no zoom (sheets,
// exports), screen pixels on the canvas — see `shadowOffsets`.
const DRAFTING_FIXTURE_SHADOW = { dy: 30, blur: 25, dyPx: 2.5, blurPx: 2.5 };

/**
 * A fixture's shadow is a couple of screen pixels at any zoom. In world units
 * it scaled with the zoom, so zoomed in on a sofa the browser blurred a kernel
 * a hundred pixels wide for every fixture on every frame.
 */
function shadowOffsets(shadow, zoom) {
  if (!zoom) return { dy: shadow.dy, blur: shadow.blur };
  return { dy: shadow.dyPx / zoom, blur: shadow.blurPx / zoom };
}

/**
 * The presentation plan's furniture is flat-filled — its depth is in the
 * shapes and in this one shared shadow, a touch deeper than the drafting one so
 * a bed reads as standing on the floor.
 */
function PresentationFixtureDefs({ zoom }) {
  const { color } = PRESENTATION_GRAPHICS.plan.fixtureShadow;
  const { dy, blur } = shadowOffsets(PRESENTATION_GRAPHICS.plan.fixtureShadow, zoom);
  return (
    <defs>
      <filter id="fixture-shadow" x="-25%" y="-25%" width="150%" height="160%" colorInterpolationFilters="sRGB">
        <feDropShadow dx="0" dy={dy} stdDeviation={blur} floodColor={color} />
      </filter>
    </defs>
  );
}

function FixtureDefs() {
  const presentation = isPresentationStyle(usePlanStyle());
  const zoom = useCanvasZoom();
  const draftingShadow = shadowOffsets(DRAFTING_FIXTURE_SHADOW, zoom);
  if (presentation) return <PresentationFixtureDefs zoom={zoom} />;
  return (
    <defs>
      {/* Fixture gradients */}
      <linearGradient id="grad-kitchenTop" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F0E4CE" />
        <stop offset="100%" stopColor="#D8C5A4" />
      </linearGradient>

      <linearGradient id="grad-toilet" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EAF3F8" />
        <stop offset="100%" stopColor="#C2D8E6" />
      </linearGradient>

      <radialGradient id="grad-lavatory" gradientUnits="objectBoundingBox" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#EDF5F9" />
        <stop offset="100%" stopColor="#C4D9E8" />
      </radialGradient>

      <linearGradient id="grad-table" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EDE5D8" />
        <stop offset="100%" stopColor="#D0C4B0" />
      </linearGradient>

      <linearGradient id="grad-tv" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#444444" />
        <stop offset="100%" stopColor="#1A1A1A" />
      </linearGradient>

      <linearGradient id="grad-sofa" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#D8CABC" />
        <stop offset="100%" stopColor="#B8A898" />
      </linearGradient>

      <linearGradient id="grad-bed" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E8EDF4" />
        <stop offset="100%" stopColor="#C8D2E1" />
      </linearGradient>

      {/* Drop shadow filter */}
      <filter id="fixture-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy={draftingShadow.dy} stdDeviation={draftingShadow.blur} floodColor="rgba(0,0,0,0.10)" />
      </filter>
    </defs>
  );
}

export default memo(FixtureDefs);
