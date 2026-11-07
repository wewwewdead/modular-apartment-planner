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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CanvasZoomProvider } from './CanvasZoomContext';
import ShadowOverlay, { decimateRing, SUN_STUDY_MAX_PATH_VERTICES } from './ShadowOverlay';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

/**
 * A many-vertex envelope: `count` overlapping 20-gons, the shape of an
 * unmerged union fallback (thousands of overlapping pieces).
 */
function overlappingPieces(count, sides = 20) {
  return Array.from({ length: count }, (_, index) => ({
    outline: Array.from({ length: sides }, (__, corner) => {
      const angle = (corner / sides) * Math.PI * 2;
      return { x: index * 300 + Math.cos(angle) * 5000, y: Math.sin(angle) * 5000 };
    }),
    holes: [],
  }));
}

/** jsdom has no canvas; a stub that records the fill and returns a data URL. */
function stubCanvas() {
  const calls = { fill: [], moveTo: 0 };
  const context = {
    setTransform() {},
    beginPath() {},
    moveTo() {
      calls.moveTo += 1;
    },
    lineTo() {},
    closePath() {},
    fill(rule) {
      calls.fill.push(rule);
    },
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,stub');
  return calls;
}

describe('the sun-study layer guards its own complexity (docs/all-day-shadow-freeze.md §4.3)', () => {
  it('draws a small envelope as a path and says so', () => {
    const container = renderOverlay();
    const layer = container.querySelector('g[data-layer="sun-study"]');

    expect(layer.getAttribute('data-envelope-render')).toBe('path');
    // Outline (4) + hole (4).
    expect(layer.getAttribute('data-envelope-vertices')).toBe('8');
    expect(layer.getAttribute('data-envelope-regions')).toBe('1');
    expect(container.querySelector('[data-type="shadow-envelope-fill"]')).not.toBeNull();
    expect(container.querySelector('[data-type="shadow-envelope-image"]')).toBeNull();
  });

  it('stays on the path just under the budget', () => {
    // 249 pieces x 20 vertices = 4,980; the instant shadow (4) and the target
    // (4) bring the layer to 4,988.
    const container = renderOverlay(0.1, { ...study, envelope: overlappingPieces(249) });
    const layer = container.querySelector('g[data-layer="sun-study"]');

    expect(Number(layer.getAttribute('data-envelope-vertices'))).toBe(4980);
    expect(layer.getAttribute('data-envelope-render')).toBe('path');
  });

  it('switches the envelope to one nonzero bitmap past the budget, and drops the dashed outline', () => {
    const calls = stubCanvas();
    const envelope = overlappingPieces(300);
    const container = renderOverlay(0.1, { ...study, envelope });
    const layer = container.querySelector('g[data-layer="sun-study"]');

    expect(Number(layer.getAttribute('data-envelope-vertices'))).toBeGreaterThan(SUN_STUDY_MAX_PATH_VERTICES);
    expect(layer.getAttribute('data-envelope-render')).toBe('image');
    expect(layer.getAttribute('data-envelope-regions')).toBe('300');
    expect(container.querySelector('[data-type="shadow-envelope-fill"]')).toBeNull();
    expect(container.querySelector('[data-type="shadow-envelope-outline"]')).toBeNull();

    const image = container.querySelector('image[data-type="shadow-envelope-image"]');
    expect(image.getAttribute('href')).toBe('data:image/png;base64,stub');
    // Every piece filled in one nonzero pass, so overlaps cannot cancel.
    expect(calls.fill).toEqual(['nonzero']);
    expect(calls.moveTo).toBe(300);
    // The image covers the envelope's extent.
    expect(Number(image.getAttribute('x'))).toBeCloseTo(-5000, 0);
    expect(Number(image.getAttribute('width'))).toBeGreaterThanOrEqual(299 * 300 + 10000 - 1);
  });

  it('draws nothing for the envelope rather than a huge path when no canvas exists', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const container = renderOverlay(0.1, { ...study, envelope: overlappingPieces(300) });

    expect(container.querySelector('g[data-layer="sun-study"]').getAttribute('data-envelope-render')).toBe('image');
    expect(container.querySelector('[data-type="shadow-envelope-fill"]')).toBeNull();
    expect(container.querySelector('image[data-type="shadow-envelope-image"]')).toBeNull();
  });

  it('draws the instant shadow as one nonzero path per region', () => {
    const regions = [
      { outline: square(5000), holes: [] },
      // Overlaps the first: with one evenodd path the overlap would read as lit.
      { outline: square(3000).map(({ x, y }) => ({ x: x + 4000, y: y + 4000 })), holes: [] },
      { outline: square(8000).map(({ x, y }) => ({ x: x + 20000, y })), holes: [square(1000)] },
    ];
    const container = renderOverlay(0.1, { ...study, regions });
    const paths = [...container.querySelectorAll('[data-type="shadow-instant"]')];

    expect(paths).toHaveLength(3);
    for (const path of paths) expect(path.getAttribute('fill-rule')).toBe('nonzero');
    // The third region still punches its hole: two closed subpaths.
    expect(paths[2].getAttribute('d').match(/Z/g)).toHaveLength(2);
  });

  it('winds holes against their outline so nonzero still punches them', () => {
    // Outline and hole given with the SAME winding, as an unmerged piece can be.
    const region = { outline: square(10000), holes: [square(2000).map(({ x, y }) => ({ x: x + 4000, y: y + 4000 }))] };
    const container = renderOverlay(0.1, { ...study, regions: [region] });
    const d = container.querySelector('[data-type="shadow-instant"]').getAttribute('d');
    const rings = d
      .split('Z')
      .filter((part) => part.trim())
      .map((part) =>
        part
          .replace(/[ML]/g, ' ')
          .trim()
          .split(/\s+/)
          .map(Number)
          .reduce(
            (points, value, index, all) => (index % 2 ? points : [...points, { x: value, y: all[index + 1] }]),
            [],
          ),
      );
    const signedArea = (points) =>
      points.reduce((sum, a, index) => {
        const b = points[(index + 1) % points.length];
        return sum + a.x * b.y - b.x * a.y;
      }, 0);

    expect(rings).toHaveLength(2);
    expect(Math.sign(signedArea(rings[0]))).toBe(-Math.sign(signedArea(rings[1])));
  });
});
