import { memo, useId, useMemo } from 'react';
import { DEFAULT_ZOOM } from '@/domain/defaults';
import { contourLabelAnchor, contourPath, sunHoursContourLevels, sunHoursContours } from '@/analysis/sunHoursContours';
import { useCanvasZoom } from './CanvasZoomContext';

/**
 * Draws the sun study on the plan: the shadow cast right now, the ground swept
 * by shadow across the whole day, and the sun-hours map.
 *
 * Sits below the plan itself so walls and rooms stay legible on top, and never
 * takes pointer events — a shadow is something you read, not something you
 * select.
 *
 * ## Why the sun-hours layer is drawn as a map and not as its grid
 *
 * The study samples ground on a grid, but a grid is how the numbers were
 * computed, not what they mean. Painted cell by cell it reads as a swarm of
 * coloured blocks — the sampling shows through as the subject, and the shape of
 * the field, which is the actual finding, does not. So the raster is filtered
 * smoothly into a continuous surface, contour lines are laid over it at whole
 * hours with their values written on them, the hour a scheme is judged against
 * gets its own heavier line, and everything is cut to the assessed boundary. A
 * reader then gets what a map gives: a number wherever they look, and a shape
 * they can take in at once.
 *
 * ## Why everything here is a flat fill with a plain stroke
 *
 * This layer lives under the canvas's pan/zoom transform, so the browser
 * re-rasterises it whenever the view moves — and the day envelope is the
 * biggest thing on the plan, a whole day of shadow fused into one multi-region
 * path. Painting it with an SVG `<pattern>` hatch made every pan frame re-tile
 * hatching across that entire area, and `vector-effect: non-scaling-stroke`
 * plus dashing made every zoom step re-tessellate its outline; together they
 * are what dropped the frame rate the moment "All day" was switched on. So:
 * flat translucent fills only, and constant on-screen line weights obtained by
 * dividing by the current zoom instead of by `non-scaling-stroke`. Stroke
 * attributes then change only when the zoom does — never during a pan.
 *
 * ## Why the layer counts its own vertices
 *
 * Every repaint of this layer — every time-slider step, because the instant
 * shadow changes — re-rasterises everything in it on the GPU raster worker.
 * When the envelope's union once fell back to its unmerged pieces, that was
 * 8,408 overlapping polygons re-rasterised per step: 1.6 s frozen per slider
 * step, with the main thread idle (docs/all-day-shadow-freeze.md). The union
 * is fixed upstream; this layer still refuses to draw an envelope that would
 * push it past `SUN_STUDY_MAX_PATH_VERTICES` as a path, and paints it into one
 * bitmap instead — one texture whatever the input, filled with the nonzero
 * rule so overlapping pieces cannot cancel each other out.
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

/** Twice the signed area of a ring; the sign is its winding. */
function signedArea2(points) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

function wound(points, positive) {
  return signedArea2(points) >= 0 === positive ? points : [...points].reverse();
}

/**
 * One region as a path for the nonzero rule: outline wound one way, holes the
 * other, so the holes still punch out and an overlapping neighbour drawn as its
 * own path can never cancel this one's fill the way one evenodd path across
 * overlapping regions did.
 */
function nonzeroRegionPath(region) {
  return regionPath({
    outline: wound(region.outline || [], true),
    holes: (region.holes || []).filter((hole) => hole?.length >= 3).map((hole) => wound(hole, false)),
  });
}

function countVertices(regions) {
  let count = 0;
  for (const region of regions || []) {
    count += region.outline?.length || 0;
    for (const hole of region.holes || []) count += hole?.length || 0;
  }
  return count;
}

/**
 * The most vertices the sun-study layer draws as paths (envelope + instant
 * shadow + target). Past it the envelope is drawn as a bitmap.
 */
export const SUN_STUDY_MAX_PATH_VERTICES = 5000;

/** Long side of the envelope bitmap, px. */
const ENVELOPE_IMAGE_MAX_PIXELS = 2048;

const ENVELOPE_RGB = '58, 74, 102';
const ENVELOPE_FILL_OPACITY = 0.16;

/**
 * A data URL painted by `paint` into a `width` x `height` canvas, or null where
 * there is no usable canvas (some test environments) — callers still render.
 */
function canvasDataUrl(width, height, paint) {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    paint(context);
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

function regionsBounds(regions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const region of regions) {
    for (const point of region.outline || []) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  return Number.isFinite(minX) && maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null;
}

/** Bitmaps already painted, per regions array, so a route flip back and forth never repaints. */
const regionsImageCache = new WeakMap();

function paintRegionsImage(regions, bounds, maxPixels) {
  const box = bounds || regionsBounds(regions);
  if (!box) return null;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const scale = maxPixels / Math.max(width, height);
  const pixelWidth = Math.max(1, Math.ceil(width * scale));
  const pixelHeight = Math.max(1, Math.ceil(height * scale));
  const href = canvasDataUrl(pixelWidth, pixelHeight, (context) => {
    context.setTransform(scale, 0, 0, scale, -box.minX * scale, -box.minY * scale);
    context.beginPath();
    const ring = (points) => {
      if (points.length < 3) return;
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
      context.closePath();
    };
    for (const region of regions) {
      ring(wound(region.outline || [], true));
      for (const hole of region.holes || []) if (hole?.length >= 3) ring(wound(hole, false));
    }
    // Opaque here; the <image> carries the wash's opacity, so the colour is not
    // quantised through a premultiplied 16 % alpha.
    context.fillStyle = `rgb(${ENVELOPE_RGB})`;
    context.fill('nonzero');
  });
  if (!href) return null;
  // The bitmap's pixel grid is whole pixels; size the image to match it exactly.
  return { href, x: box.minX, y: box.minY, width: pixelWidth / scale, height: pixelHeight / scale };
}

/**
 * Regions filled into one bitmap with the nonzero rule, for one `<image>`: the
 * sun-hours map's approach applied to polygons. Overlapping pieces cannot
 * cancel, and the raster cost is one texture whatever the input. `null` for
 * `regions` (the path route) skips the work.
 *
 * @returns {{href: string, x: number, y: number, width: number, height: number}|null}
 */
export function useRegionsImage(regions, bounds = null, maxPixels = ENVELOPE_IMAGE_MAX_PIXELS) {
  return useMemo(() => {
    if (!regions?.length) return null;
    const cached = !bounds && regionsImageCache.get(regions);
    if (cached && cached.maxPixels === maxPixels) return cached.image;
    const image = paintRegionsImage(regions, bounds, maxPixels);
    if (!bounds && image) regionsImageCache.set(regions, { maxPixels, image });
    return image;
  }, [regions, bounds, maxPixels]);
}

/**
 * Deviation the display path may make from the analytic envelope, mm. One
 * millimetre is two device pixels at the canvas's maximum zoom and far inside
 * anything a geometric shadow can honestly claim; the analytics keep the exact
 * rings.
 */
const ENVELOPE_DISPLAY_TOLERANCE_MM = 1;

function perpendicularDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  return Math.abs((point.x - from.x) * dy - (point.y - from.y) * dx) / Math.sqrt(lengthSquared);
}

/**
 * Drop ring vertices that sit within `tolerance` of the line joining their
 * kept neighbours. Unioning fifty near-identical shadow casts leaves the
 * envelope's rings full of collinear and near-collinear points, and every one
 * of them is paid for again each time the canvas re-rasterises. Display-only:
 * area and coverage numbers are computed from the exact rings upstream.
 */
export function decimateRing(points, tolerance = ENVELOPE_DISPLAY_TOLERANCE_MM) {
  if (!Array.isArray(points) || points.length <= 4) return points;

  const kept = [points[0]];
  let anchor = points[0];
  for (let index = 1; index < points.length; index += 1) {
    const candidate = points[index];
    const next = points[(index + 1) % points.length];
    if (perpendicularDistance(candidate, anchor, next) > tolerance) {
      kept.push(candidate);
      anchor = candidate;
    }
  }
  // A decimation that destroys the ring is worse than none.
  return kept.length >= 3 ? kept : points;
}

function decimateRegions(regions) {
  return regions.map((region) => ({
    outline: decimateRing(region.outline),
    holes: (region.holes || []).map((hole) => decimateRing(hole)),
  }));
}

/**
 * How far the colour of the edge cells is carried past the assessed boundary,
 * in cells. The raster is filtered rather than blocked out now, and a filter
 * reaching across the edge of the data would pull the boundary colour towards
 * whatever sits outside it — nothing — and ring the map in a dark halo. Two
 * cells is more than any bilinear filter reaches; the clip path, not the
 * raster, decides where the map actually stops.
 */
const EDGE_BLEED_CELLS = 2;

/**
 * For every unassessed cell, the nearest assessed one to borrow a colour from.
 * A couple of passes of four-way spreading, which is all that a filter kernel
 * two cells wide can see.
 */
function bleedOutward(mask, columns, rows, rings) {
  const source = new Int32Array(columns * rows).fill(-1);
  for (let index = 0; index < source.length; index += 1) {
    if (mask[index]) source[index] = index;
  }

  for (let ring = 0; ring < rings; ring += 1) {
    const previous = Int32Array.from(source);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        if (previous[index] >= 0) continue;
        const west = column > 0 ? previous[index - 1] : -1;
        const east = column < columns - 1 ? previous[index + 1] : -1;
        const north = row > 0 ? previous[index - columns] : -1;
        const south = row < rows - 1 ? previous[index + columns] : -1;
        const nearest = west >= 0 ? west : east >= 0 ? east : north >= 0 ? north : south;
        if (nearest >= 0) source[index] = nearest;
      }
    }
  }

  return source;
}

/**
 * Rasterise the sun-hours grid to a data URL rather than emitting one SVG rect
 * per cell — a 200 x 200 grid is 40,000 nodes, which stalls the canvas on every
 * pan. One <image> scales just as well and costs one node, and letting the
 * browser filter it up to plan scale is what turns the sampling grid into a
 * continuous surface for free.
 */
function useSunHoursImage(grid) {
  return useMemo(() => {
    if (!grid) return null;

    // A canvas is unavailable in some test environments; `canvasDataUrl` then
    // returns null and the rest of the study still renders.
    return canvasDataUrl(grid.columns, grid.rows, (context) => {
      const image = context.createImageData(grid.columns, grid.rows);
      // The full ramp always spans the best ground in the study, so the map
      // uses its whole range. The contour labels and the panel legend are what
      // tie a colour back to a number of hours.
      const span = Math.max(grid.maxHours, 1);
      const source = grid.mask ? bleedOutward(grid.mask, grid.columns, grid.rows, EDGE_BLEED_CELLS) : null;

      for (let index = 0; index < grid.hours.length; index += 1) {
        const sample = source ? source[index] : index;
        if (sample < 0) {
          image.data[index * 4 + 3] = 0;
          continue;
        }
        const [red, green, blue] = rampColor(grid.hours[sample] / span);
        const offset = index * 4;
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
        image.data[offset + 3] = 205;
      }
      context.putImageData(image, 0, 0);
    });
  }, [grid]);
}

/**
 * Contours for the sun-hours field, split into the ordinary hour lines and the
 * one the scheme is judged against.
 *
 * The path strings and the label anchors are baked here rather than in the
 * render body: none of them depend on the zoom, and the zoom changes far more
 * often than the study does. Only the decision of whether a label *fits* is
 * left to render time, since that alone is a function of on-screen size.
 */
function useSunHoursContours(grid) {
  return useMemo(() => {
    if (!grid) return null;

    const threshold = grid.thresholdHours;
    const thresholdIsInside = threshold > 0 && threshold < grid.maxHours;
    const prepare = (entry) => ({
      ...entry,
      path: contourPath(entry.lines),
      // The longest line is the one with room to be labelled, and
      // `sunHoursContours` already returns them longest first.
      anchor: entry.lines[0] ? contourLabelAnchor(entry.lines[0]) : null,
      anchorLength: entry.lines[0]?.length ?? 0,
    });

    return {
      levels: sunHoursContours(grid, sunHoursContourLevels(grid.maxHours, { threshold })).map(prepare),
      threshold: thresholdIsInside ? (sunHoursContours(grid, [threshold]).map(prepare)[0] ?? null) : null,
    };
  }, [grid]);
}

function formatHours(hours) {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

function ShadowOverlay({ study }) {
  const sunHoursGrid = study?.mode === 'sunHours' ? study.grid : null;
  const sunHoursImage = useSunHoursImage(sunHoursGrid);
  const contours = useSunHoursContours(sunHoursGrid);
  const targetPolygon = study?.target?.polygon;

  // Constant on-screen line weight without `non-scaling-stroke`: divide by the
  // zoom instead. Null outside an interactive canvas (SVG exports render at
  // plot scale), where the default zoom is the honest stand-in.
  const zoom = useCanvasZoom() || DEFAULT_ZOOM;
  const px = (units) => units / zoom;

  // The complexity guard (§4.3): count what the layer would draw as paths. The
  // envelope is drawn only in "All day"; the instant shadow and the target are
  // drawn in every mode.
  const envelope = study?.envelope;
  const envelopeShown = study?.mode === 'range' && Boolean(envelope?.length);
  const envelopeDisplay = useMemo(() => (envelopeShown ? decimateRegions(envelope) : []), [envelopeShown, envelope]);
  const envelopeVertices = useMemo(() => countVertices(envelopeDisplay), [envelopeDisplay]);
  const instantRegions = study?.regions;
  const instantVertices = useMemo(() => countVertices(instantRegions), [instantRegions]);
  const targetVertices = targetPolygon?.length >= 3 ? targetPolygon.length : 0;
  const envelopeAsImage =
    envelopeShown && envelopeVertices + instantVertices + targetVertices > SUN_STUDY_MAX_PATH_VERTICES;

  const envelopePath = useMemo(
    () => (envelopeShown && !envelopeAsImage ? regionsPath(envelopeDisplay) : ''),
    [envelopeShown, envelopeAsImage, envelopeDisplay],
  );
  // The exact rings, not the decimated ones: the bitmap costs the same either way.
  const envelopeImage = useRegionsImage(envelopeAsImage ? envelope : null);
  // One path per region with the nonzero rule: a single evenodd path across
  // regions that overlap cancels their fill wherever an even number cross.
  const instantPaths = useMemo(() => (instantRegions || []).map(nonzeroRegionPath).filter(Boolean), [instantRegions]);
  const targetPath = useMemo(
    () => (targetPolygon?.length >= 3 ? regionPath({ outline: targetPolygon, holes: [] }) : ''),
    [targetPolygon],
  );

  // React's own ids carry colons, which are legal in an id but awkward in the
  // `url(#…)` a clip path is referenced by.
  const clipId = `sun-hours-clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  if (!study) return null;

  const grid = study.grid;
  const showEnvelope = Boolean(envelopePath);
  const envelopeRender = !envelopeShown ? 'none' : envelopeAsImage ? 'image' : 'path';
  // Contours are drawn even where the raster could not be built — a browser
  // without a usable canvas still gets a readable map, just an unshaded one.
  const showSunHoursMap = Boolean(grid && (sunHoursImage || contours?.levels.length || contours?.threshold));
  // The assessed area is the map's coastline. Cutting to it turns the ragged
  // edge of the sampling grid into the boundary the study is actually about.
  const mapClip = showSunHoursMap && targetPath ? `url(#${clipId})` : undefined;
  // Text and contour weights are constant on screen, so a label stays readable
  // at site scale and does not swell into a banner when you zoom in.
  const labelSize = px(11);

  return (
    <g
      data-layer="sun-study"
      data-mode={study.mode}
      data-envelope-render={envelopeRender}
      data-envelope-vertices={envelopeShown ? envelopeVertices : 0}
      data-envelope-regions={envelopeShown ? envelope.length : 0}
      style={{ pointerEvents: 'none' }}
    >
      {showSunHoursMap && targetPath && (
        <clipPath id={clipId}>
          <path d={targetPath} />
        </clipPath>
      )}

      {showSunHoursMap && (
        <g data-type="sun-hours-map-group" clipPath={mapClip}>
          {sunHoursImage && (
            <image
              data-type="sun-hours-map"
              href={sunHoursImage}
              x={grid.origin.x}
              y={grid.origin.y}
              width={grid.columns * grid.cellSize}
              height={grid.rows * grid.cellSize}
              preserveAspectRatio="none"
            />
          )}

          {contours?.levels.map((entry) => (
            <path
              key={`contour-${entry.level}`}
              data-type="sun-hours-contour"
              data-level={entry.level}
              d={entry.path}
              fill="none"
              stroke="rgba(48, 40, 30, 0.42)"
              strokeWidth={px(0.9)}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* The hour a scheme passes or fails on gets a cased line — a pale
              stroke under a dark one — so it stays the strongest line on the
              map whether it crosses bright ground or deep shade. */}
          {contours?.threshold && (
            <>
              <path
                data-type="sun-hours-threshold-casing"
                d={contours.threshold.path}
                fill="none"
                stroke="rgba(255, 248, 232, 0.75)"
                strokeWidth={px(4)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                data-type="sun-hours-threshold"
                d={contours.threshold.path}
                fill="none"
                stroke="rgba(150, 74, 12, 0.95)"
                strokeWidth={px(1.7)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {/* A label crammed onto a two-cell fragment of contour is noise, so a
              level is only named where its longest line has room for the text. */}
          {contours &&
            [...contours.levels, ...(contours.threshold ? [contours.threshold] : [])]
              .filter((entry) => entry.anchor && entry.anchorLength >= labelSize * 7)
              .map((entry) => (
                <text
                  key={`contour-label-${entry.level}`}
                  data-type="sun-hours-contour-label"
                  x={entry.anchor.x}
                  y={entry.anchor.y}
                  transform={`rotate(${entry.anchor.angle.toFixed(1)} ${entry.anchor.x} ${entry.anchor.y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontSize: labelSize,
                    fontWeight: 600,
                    fill: entry === contours.threshold ? '#7a3b06' : '#2f2820',
                    paintOrder: 'stroke',
                    stroke: 'rgba(255, 250, 238, 0.85)',
                    strokeWidth: px(3),
                    strokeLinejoin: 'round',
                  }}
                >
                  {formatHours(entry.level)} h
                </text>
              ))}
        </g>
      )}

      {showEnvelope && (
        <>
          {/* A flat wash rather than the hatch it used to be: the instant
              shadow drawn on top is darker, so the two still read apart, and
              the dashed boundary says "extent" the way hatching did. */}
          <path
            data-type="shadow-envelope-fill"
            d={envelopePath}
            fill={`rgba(${ENVELOPE_RGB}, ${ENVELOPE_FILL_OPACITY})`}
            fillRule="evenodd"
          />
          <path
            data-type="shadow-envelope-outline"
            d={envelopePath}
            fill="none"
            stroke="rgba(58, 74, 102, 0.55)"
            strokeWidth={px(1.5)}
            strokeDasharray={`${px(12)} ${px(6)}`}
          />
        </>
      )}

      {/* Past the vertex budget the envelope is one bitmap and has no dashed
          outline: the outline is the same rings again as a path. */}
      {envelopeImage && (
        <image
          data-type="shadow-envelope-image"
          href={envelopeImage.href}
          x={envelopeImage.x}
          y={envelopeImage.y}
          width={envelopeImage.width}
          height={envelopeImage.height}
          opacity={ENVELOPE_FILL_OPACITY}
          preserveAspectRatio="none"
        />
      )}

      {instantPaths.map((d, index) => (
        <path
          key={`instant-${index}`}
          data-type="shadow-instant"
          d={d}
          fill="rgba(32, 44, 66, 0.26)"
          fillRule="nonzero"
          stroke="rgba(32, 44, 66, 0.42)"
          strokeWidth={px(1)}
        />
      ))}

      {/* Last in this layer so the assessed boundary remains visible over the
          heatmap and shadow fills it is measuring. */}
      {targetPath && (
        <path
          data-type="sun-study-target"
          d={targetPath}
          fill="rgba(216, 146, 42, 0.035)"
          stroke="rgba(184, 111, 18, 0.9)"
          strokeWidth={px(2)}
          strokeDasharray={`${px(7)} ${px(4)}`}
        />
      )}
    </g>
  );
}

export default memo(ShadowOverlay);
export { rampColor, regionPath, SUN_HOURS_RAMP };
