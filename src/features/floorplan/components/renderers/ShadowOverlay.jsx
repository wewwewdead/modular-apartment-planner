import { memo, useMemo } from 'react';

/**
 * Draws the sun study on the plan: the shadow cast right now, the ground swept
 * by shadow across the whole day, and the sun-hours heatmap.
 *
 * Sits below the plan itself so walls and rooms stay legible on top, and never
 * takes pointer events — a shadow is something you read, not something you
 * select.
 */

/** Ramp from fully overshadowed to fully open, walking through warm midtones. */
const SUN_HOURS_RAMP = [
  { stop: 0, color: [46, 58, 78] },
  { stop: 0.25, color: [86, 96, 118] },
  { stop: 0.5, color: [176, 152, 108] },
  { stop: 0.75, color: [226, 186, 92] },
  { stop: 1, color: [252, 226, 130] },
];

function rampColor(fraction) {
  const clamped = Math.min(1, Math.max(0, fraction));
  for (let index = 1; index < SUN_HOURS_RAMP.length; index += 1) {
    const previous = SUN_HOURS_RAMP[index - 1];
    const current = SUN_HOURS_RAMP[index];
    if (clamped > current.stop) continue;

    const span = current.stop - previous.stop || 1;
    const t = (clamped - previous.stop) / span;
    return [
      Math.round(previous.color[0] + (current.color[0] - previous.color[0]) * t),
      Math.round(previous.color[1] + (current.color[1] - previous.color[1]) * t),
      Math.round(previous.color[2] + (current.color[2] - previous.color[2]) * t),
    ];
  }
  return SUN_HOURS_RAMP[SUN_HOURS_RAMP.length - 1].color;
}

/**
 * A region and its holes as one path. `fill-rule="evenodd"` then punches the
 * holes out, so courtyards and light wells read as lit rather than shaded.
 */
function regionPath(region) {
  const ring = (points) =>
    points.length < 3 ? '' : `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} Z`;

  return [ring(region.outline), ...(region.holes || []).map(ring)].filter(Boolean).join(' ');
}

function regionsPath(regions) {
  return regions.map(regionPath).filter(Boolean).join(' ');
}

/**
 * Rasterise the sun-hours grid to a data URL rather than emitting one SVG rect
 * per cell — a 200 x 200 grid is 40,000 nodes, which stalls the canvas on every
 * pan. One <image> scales just as well and costs one node.
 */
function useSunHoursImage(grid) {
  return useMemo(() => {
    if (!grid || typeof document === 'undefined') return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = grid.columns;
      canvas.height = grid.rows;
      const context = canvas.getContext('2d');
      if (!context) return null;

      const image = context.createImageData(grid.columns, grid.rows);
      // Normalise against the longest possible day, not the grid maximum, so
      // the colours mean the same thing when you change date or massing.
      const span = Math.max(grid.maxHours, 1);

      for (let index = 0; index < grid.hours.length; index += 1) {
        if (grid.mask && !grid.mask[index]) {
          image.data[index * 4 + 3] = 0;
          continue;
        }
        const [red, green, blue] = rampColor(grid.hours[index] / span);
        const offset = index * 4;
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
        image.data[offset + 3] = 205;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL();
    } catch {
      // Canvas is unavailable in some test environments; the rest of the study
      // still renders.
      return null;
    }
  }, [grid]);
}

function ShadowOverlay({ study }) {
  const sunHoursImage = useSunHoursImage(study?.mode === 'sunHours' ? study.grid : null);
  const targetPolygon = study?.target?.polygon;

  const envelopePath = useMemo(() => regionsPath(study?.envelope || []), [study?.envelope]);
  const instantPath = useMemo(() => regionsPath(study?.regions || []), [study?.regions]);
  const targetPath = useMemo(
    () => (targetPolygon?.length >= 3 ? regionPath({ outline: targetPolygon, holes: [] }) : ''),
    [targetPolygon],
  );

  if (!study) return null;

  const grid = study.grid;
  const showEnvelope = study.mode === 'range' && envelopePath;
  const showInstant = Boolean(instantPath);

  return (
    <g data-layer="sun-study" data-mode={study.mode} style={{ pointerEvents: 'none' }}>
      <defs>
        {/* Hatching keeps the day-long envelope readable against the instant
            shadow drawn on top of it. */}
        <pattern id="shadow-envelope-hatch" width="600" height="600" patternUnits="userSpaceOnUse">
          <path d="M 0 600 L 600 0" stroke="rgba(58, 74, 102, 0.30)" strokeWidth="70" fill="none" />
        </pattern>
      </defs>

      {sunHoursImage && grid && (
        <image
          data-type="sun-hours-map"
          href={sunHoursImage}
          x={grid.origin.x}
          y={grid.origin.y}
          width={grid.columns * grid.cellSize}
          height={grid.rows * grid.cellSize}
          preserveAspectRatio="none"
          style={{ imageRendering: 'pixelated' }}
        />
      )}

      {showEnvelope && (
        <>
          <path
            data-type="shadow-envelope-fill"
            d={envelopePath}
            fill="url(#shadow-envelope-hatch)"
            fillRule="evenodd"
          />
          <path
            data-type="shadow-envelope-outline"
            d={envelopePath}
            fill="none"
            stroke="rgba(58, 74, 102, 0.55)"
            strokeWidth="1.5"
            strokeDasharray="12 6"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}

      {showInstant && (
        <path
          data-type="shadow-instant"
          d={instantPath}
          fill="rgba(32, 44, 66, 0.26)"
          fillRule="evenodd"
          stroke="rgba(32, 44, 66, 0.42)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Last in this layer so the assessed boundary remains visible over the
          heatmap and shadow fills it is measuring. */}
      {targetPath && (
        <path
          data-type="sun-study-target"
          d={targetPath}
          fill="rgba(216, 146, 42, 0.035)"
          stroke="rgba(184, 111, 18, 0.9)"
          strokeWidth="2"
          strokeDasharray="7 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

export default memo(ShadowOverlay);
export { rampColor, regionPath };
