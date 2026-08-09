/* @vitest-environment jsdom */
/**
 * Structural pins for the shadow overlay's paint cost.
 *
 * The day envelope is the largest thing on the plan and lives under the
 * canvas's pan/zoom transform, so how it is painted IS its frame cost. Two
 * choices dropped the frame rate the moment "All day" was switched on, and
 * each is pinned here against quiet reintroduction:
 *
 *   - an SVG `<pattern>` hatch fill, which re-tiled the whole envelope on
 *     every pan frame — now a flat translucent fill;
 *   - `vector-effect: non-scaling-stroke` with dashing, which re-tessellated
 *     the outline on every zoom step — now zoom-divided widths, so stroke
 *     attributes change only when the zoom does.
 *
 * Plus the display-only ring decimation that keeps the union's collinear
 * vertex chains out of the rasteriser.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CanvasZoomProvider } from './CanvasZoomContext';
import ShadowOverlay, { decimateRing } from './ShadowOverlay';

afterEach(cleanup);

const square = (size) => [
  { x: 0, y: 0 },
  { x: size, y: 0 },
  { x: size, y: size },
  { x: 0, y: size },
];

const study = {
  mode: 'range',
  grid: null,
  envelope: [{ outline: square(10000), holes: [square(2000)] }],
  regions: [{ outline: square(5000), holes: [] }],
  target: { polygon: square(20000) },
};

function renderOverlay(zoom = 0.1, subject = study) {
  const view = render(
    <svg>
      <CanvasZoomProvider value={zoom}>
        <ShadowOverlay study={subject} />
      </CanvasZoomProvider>
    </svg>,
  );
  return view.container;
}

/** A cone of sun hours, falling 1 h per metre from the middle of the grid. */
function sunHoursStudy({ thresholdHours = 4, target = { polygon: square(20000) } } = {}) {
  const columns = 21;
  const rows = 21;
  const cellSize = 1000;
  const hours = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + 0.5 - columns / 2) * cellSize;
      const y = (row + 0.5 - rows / 2) * cellSize;
      hours[row * columns + column] = Math.max(0, 10 - Math.hypot(x, y) / 1000);
    }
  }

  return {
    mode: 'sunHours',
    envelope: [],
    regions: [],
    target,
    grid: {
      hours,
      mask: new Uint8Array(columns * rows).fill(1),
      columns,
      rows,
      cellSize,
      origin: { x: 0, y: 0 },
      maxHours: 10,
      thresholdHours,
    },
  };
}

describe('ShadowOverlay paint structure', () => {
  it('paints the envelope as a flat fill, with no pattern anywhere in the layer', () => {
    const container = renderOverlay();

    expect(container.querySelector('pattern')).toBeNull();
    const fill = container.querySelector('[data-type="shadow-envelope-fill"]');
    expect(fill.getAttribute('fill')).toMatch(/^rgba\(/);
    expect(fill.getAttribute('fill')).not.toContain('url(');
  });

  it('uses zoom-divided stroke widths instead of non-scaling-stroke', () => {
    const container = renderOverlay(0.5);

    for (const path of container.querySelectorAll('path')) {
      expect(path.getAttribute('vector-effect')).toBeNull();
    }
    const outline = container.querySelector('[data-type="shadow-envelope-outline"]');
    expect(Number(outline.getAttribute('stroke-width'))).toBeCloseTo(1.5 / 0.5);
    const [dash, gap] = outline.getAttribute('stroke-dasharray').split(' ').map(Number);
    expect(dash).toBeCloseTo(12 / 0.5);
    expect(gap).toBeCloseTo(6 / 0.5);
  });

  it('still punches holes with evenodd so courtyards read as lit', () => {
    const container = renderOverlay();
    const fill = container.querySelector('[data-type="shadow-envelope-fill"]');

    expect(fill.getAttribute('fill-rule')).toBe('evenodd');
    // Outline plus one hole: two closed subpaths.
    expect(fill.getAttribute('d').match(/Z/g)).toHaveLength(2);
  });
});

describe('the sun-hours layer reads as a map', () => {
  it('never falls back to painting the sampling grid as blocks', () => {
    // `image-rendering: pixelated` is what made the study read as a swarm of
    // cells rather than as a surface. The raster is filtered up now, and the
    // contours are what carry the numbers.
    expect(renderOverlay(0.1, sunHoursStudy()).innerHTML).not.toContain('pixelated');
  });

  it('draws a labelled line at each hour level', () => {
    const container = renderOverlay(0.1, sunHoursStudy());

    const levels = [...container.querySelectorAll('[data-type="sun-hours-contour"]')].map((path) =>
      Number(path.getAttribute('data-level')),
    );
    // A ten-hour field is contoured every two hours; four is the threshold and
    // is drawn separately.
    expect(levels).toEqual([2, 6, 8]);
    for (const path of container.querySelectorAll('[data-type="sun-hours-contour"]')) {
      expect(path.getAttribute('d')).toMatch(/^M /);
    }
    expect(container.querySelectorAll('[data-type="sun-hours-contour-label"]').length).toBeGreaterThan(0);
  });

  it('gives the assessed hour its own cased line, drawn over the rest', () => {
    const container = renderOverlay(0.1, sunHoursStudy({ thresholdHours: 4 }));

    // 4 h belongs to the threshold line, so it is not also drawn as an ordinary
    // contour.
    const levels = [...container.querySelectorAll('[data-type="sun-hours-contour"]')].map((path) =>
      path.getAttribute('data-level'),
    );
    expect(levels).not.toContain('4');

    const casing = container.querySelector('[data-type="sun-hours-threshold-casing"]');
    const line = container.querySelector('[data-type="sun-hours-threshold"]');
    expect(casing.getAttribute('d')).toBe(line.getAttribute('d'));
    expect(Number(casing.getAttribute('stroke-width'))).toBeGreaterThan(Number(line.getAttribute('stroke-width')));
  });

  it('keeps contour and label weights constant on screen', () => {
    const contour = (zoom) =>
      Number(
        renderOverlay(zoom, sunHoursStudy())
          .querySelector('[data-type="sun-hours-contour"]')
          .getAttribute('stroke-width'),
      );

    expect(contour(0.5)).toBeCloseTo(contour(0.1) / 5);
  });

  it('cuts the map to the assessed boundary rather than to the grid rectangle', () => {
    const clipped = renderOverlay(0.1, sunHoursStudy());
    const group = clipped.querySelector('[data-type="sun-hours-map-group"]');
    const clipPath = clipped.querySelector('clipPath');

    expect(group.getAttribute('clip-path')).toBe(`url(#${clipPath.getAttribute('id')})`);
    expect(clipPath.querySelector('path').getAttribute('d')).toContain('20000');

    // Exploratory extent has no boundary to cut to, so nothing is clipped away.
    const unclipped = renderOverlay(0.1, sunHoursStudy({ target: null }));
    expect(unclipped.querySelector('[data-type="sun-hours-map-group"]').getAttribute('clip-path')).toBeNull();
  });
});

describe('decimateRing', () => {
  it('drops collinear chains but keeps every real corner', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 2500, y: 0 },
      { x: 5000, y: 0.2 }, // within tolerance of the 0-10000 baseline
      { x: 7500, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];

    const decimated = decimateRing(ring, 1);

    expect(decimated.map(({ x, y }) => `${x},${Math.round(y)}`)).toEqual(['0,0', '10000,0', '10000,10000', '0,10000']);
  });

  it('keeps vertices that deviate more than the tolerance', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 5000, y: 40 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];

    expect(decimateRing(ring, 1)).toHaveLength(5);
  });

  it('never decimates a ring below a triangle', () => {
    const sliver = [
      { x: 0, y: 0 },
      { x: 10000, y: 0.1 },
      { x: 20000, y: 0 },
      { x: 10000, y: -0.1 },
      { x: 5000, y: 0 },
    ];

    expect(decimateRing(sliver, 1).length).toBeGreaterThanOrEqual(3);
  });
});
