/* @vitest-environment jsdom */
/**
 * DOM half of the WindOverlay characterization suite (T18).
 *
 * `WindOverlay.test.jsx` runs in the `node` environment and can only reach the
 * re-exported `windRampColor`: the component itself paints its map into a
 * `<canvas>` (`useWindImage`, WindOverlay.jsx:6-32) and bails out to `null`
 * whenever `document` or a 2D context is missing, which is every node test.
 *
 * jsdom supplies `document` but no 2D context either — the `canvas` npm package
 * is not installed and is not worth a native build here. The tests below stub
 * `HTMLCanvasElement.prototype.getContext` with the three calls the component
 * actually makes (`createImageData`, `putImageData`, then `toDataURL` on the
 * element), which also makes the pixel buffer inspectable: the alpha and colour
 * rules are otherwise unobservable from the DOM.
 *
 * Nothing here re-pins the colour ramp; that stays in the node file.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import WindOverlay from './WindOverlay';

const STUB_DATA_URL = 'data:image/png;base64,STUB';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Installs a minimal 2D context and returns the ImageData objects written. */
function stubCanvas2d() {
  const written = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image) => written.push(image),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(STUB_DATA_URL);
  return written;
}

function uniformGrid(overrides = {}) {
  const columns = 12;
  const rows = 12;
  const cells = columns * rows;
  return {
    columns,
    rows,
    cellSize: 500,
    origin: { x: 1000, y: 2000 },
    obstacles: new Uint8Array(cells),
    amplification: new Float32Array(cells).fill(1),
    velocityX: new Float32Array(cells).fill(1),
    velocityY: new Float32Array(cells).fill(0),
    ...overrides,
  };
}

function mount(props) {
  const view = render(
    <svg>
      <WindOverlay {...props} />
    </svg>,
  );
  return {
    ...view,
    layer: () => view.container.querySelector('[data-layer="wind-study"]'),
    lines: () => Array.from(view.container.querySelectorAll('line')),
    image: () => view.container.querySelector('[data-type="wind-map"]'),
  };
}

describe('WindOverlay absence (characterization)', () => {
  it('renders nothing without a study', () => {
    stubCanvas2d();
    const { container } = mount({ study: null });
    expect(container.querySelector('[data-layer="wind-study"]')).toBeNull();
  });

  it('renders nothing when a comfort study carries no grid', () => {
    stubCanvas2d();
    const { container } = mount({ study: { mode: 'comfort' } });
    expect(container.querySelector('[data-layer="wind-study"]')).toBeNull();
  });

  it('THROWS when a direction study carries no grid', () => {
    // characterization: pins current behaviour; see T2. `flowArrows` runs above
    // the `if (!study || !image) return null` guard (WindOverlay.jsx:57-59) and
    // dereferences `grid.columns` unconditionally for direction mode, so a
    // gridless direction result takes down the whole canvas rather than
    // degrading to no overlay the way every other missing-data path does.
    stubCanvas2d();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => mount({ study: { mode: 'direction' } })).toThrow(TypeError);
  });

  it('renders nothing when the browser gives back no 2D context', () => {
    // characterization: the fallback is silent — no placeholder, no warning.
    // A canvas-less environment simply loses the wind map.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    expect(container.querySelector('[data-layer="wind-study"]')).toBeNull();
  });

  it('renders nothing when canvas access throws, e.g. a tainted or blocked canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { container } = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    expect(container.querySelector('[data-layer="wind-study"]')).toBeNull();
  });
});

describe('WindOverlay layer and image (characterization)', () => {
  it('tags the layer with the study mode and never takes pointer events', () => {
    stubCanvas2d();
    const view = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    expect(view.layer().getAttribute('data-mode')).toBe('direction');
    expect(view.layer().style.pointerEvents).toBe('none');
  });

  it('places the image at the grid origin, sized by cellSize', () => {
    stubCanvas2d();
    const view = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    const image = view.image();
    expect(image.getAttribute('href')).toBe(STUB_DATA_URL);
    expect(image.getAttribute('x')).toBe('1000');
    expect(image.getAttribute('y')).toBe('2000');
    expect(image.getAttribute('width')).toBe('6000');
    expect(image.getAttribute('height')).toBe('6000');
    expect(image.getAttribute('preserveAspectRatio')).toBe('none');
    expect(image.style.imageRendering).toBe('pixelated');
  });

  it('rasterises at one canvas pixel per grid cell', () => {
    const written = stubCanvas2d();
    mount({ study: { mode: 'direction', grid: uniformGrid({ columns: 9, rows: 7 }) } });
    expect(written).toHaveLength(1);
    expect(written[0].width).toBe(9);
    expect(written[0].height).toBe(7);
  });

  it('defines the arrowhead marker exactly once', () => {
    stubCanvas2d();
    const { container } = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    expect(container.querySelectorAll('#wind-arrowhead')).toHaveLength(1);
  });
});

describe('WindOverlay staleness (characterization)', () => {
  // The overlay carries no `data-stale` attribute — staleness is expressed only
  // as opacity. Pinned so a later marker-based design is a deliberate change.
  it('paints at full opacity when fresh', () => {
    stubCanvas2d();
    const view = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    expect(view.layer().getAttribute('opacity')).toBe('1');
    expect(view.layer().hasAttribute('data-stale')).toBe(false);
  });

  it('dims to 0.42 when stale', () => {
    stubCanvas2d();
    const view = mount({ study: { mode: 'direction', grid: uniformGrid() }, stale: true });
    expect(view.layer().getAttribute('opacity')).toBe('0.42');
    expect(view.layer().hasAttribute('data-stale')).toBe(false);
  });

  it('defaults to fresh when the prop is omitted', () => {
    stubCanvas2d();
    const view = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    expect(view.layer().getAttribute('opacity')).toBe('1');
  });
});

describe('WindOverlay flow arrows (characterization)', () => {
  it('samples a 12x12 direction grid on a stride of 5, giving four arrows', () => {
    stubCanvas2d();
    const view = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    expect(view.lines()).toHaveLength(4);
    expect(view.lines()[0].getAttribute('marker-end')).toBe('url(#wind-arrowhead)');
    expect(view.lines()[0].getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('centres each arrow on its sample cell and scales it to 1.8 cells', () => {
    stubCanvas2d();
    const view = mount({ study: { mode: 'direction', grid: uniformGrid() } });
    const [first] = view.lines();
    // Cell (row 2, column 2): centre 1000 + 2.5*500 = 2250, 2000 + 2.5*500 = 3250.
    // Length 500 * 1.8 = 900, drawn half either side of the centre.
    expect(first.getAttribute('x1')).toBe('1800');
    expect(first.getAttribute('x2')).toBe('2700');
    expect(first.getAttribute('y1')).toBe('3250');
    expect(first.getAttribute('y2')).toBe('3250');
  });

  it('skips sample cells that are obstacles', () => {
    stubCanvas2d();
    const grid = uniformGrid();
    grid.obstacles[2 * 12 + 2] = 1;
    const view = mount({ study: { mode: 'direction', grid } });
    expect(view.lines()).toHaveLength(3);
  });

  it('skips sample cells whose flow is below 0.05 m/s', () => {
    stubCanvas2d();
    const grid = uniformGrid();
    grid.velocityX[2 * 12 + 7] = 0.03;
    grid.velocityY[2 * 12 + 7] = 0;
    const view = mount({ study: { mode: 'direction', grid } });
    expect(view.lines()).toHaveLength(3);
  });

  it('draws no arrows in comfort mode, but still draws the map', () => {
    stubCanvas2d();
    const grid = uniformGrid({ categories: new Uint8Array(144).fill(2) });
    const view = mount({ study: { mode: 'comfort', grid } });
    expect(view.lines()).toHaveLength(0);
    expect(view.image()).not.toBeNull();
    expect(view.layer().getAttribute('data-mode')).toBe('comfort');
  });

  it('widens the stride on a large grid so the arrow field stays readable', () => {
    stubCanvas2d();
    // stride = max(5, ceil(120 / 12)) = 10, sampled from index 5 → 12 per axis.
    const view = mount({ study: { mode: 'direction', grid: uniformGrid({ columns: 120, rows: 120 }) } });
    expect(view.lines()).toHaveLength(144);
  });
});

describe('WindOverlay pixel rules (characterization)', () => {
  function pixel(image, index) {
    const offset = index * 4;
    return Array.from(image.data.slice(offset, offset + 4));
  }

  it('leaves obstacle cells fully transparent and colours the rest at alpha 188', () => {
    const written = stubCanvas2d();
    const grid = {
      columns: 2,
      rows: 2,
      cellSize: 100,
      origin: { x: 0, y: 0 },
      obstacles: new Uint8Array([1, 0, 0, 0]),
      amplification: new Float32Array([1, 1, 1, 1]),
      velocityX: new Float32Array(4),
      velocityY: new Float32Array(4),
    };
    mount({ study: { mode: 'direction', grid } });
    const image = written[0];
    expect(pixel(image, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(image, 1)).toEqual([103, 181, 111, 188]);
  });

  it('paints unsafe cells the safety red at alpha 245, whatever the amplification', () => {
    const written = stubCanvas2d();
    const grid = {
      columns: 2,
      rows: 1,
      cellSize: 100,
      origin: { x: 0, y: 0 },
      obstacles: new Uint8Array([0, 0]),
      unsafe: new Uint8Array([0, 1]),
      amplification: new Float32Array([1, 0.2]),
      velocityX: new Float32Array(2),
      velocityY: new Float32Array(2),
    };
    mount({ study: { mode: 'direction', grid } });
    const image = written[0];
    expect(pixel(image, 0)).toEqual([103, 181, 111, 188]);
    expect(pixel(image, 1)).toEqual([205, 35, 45, 245]);
  });

  it('uses the comfort category palette rather than the amplification ramp in comfort mode', () => {
    const written = stubCanvas2d();
    const grid = {
      columns: 2,
      rows: 1,
      cellSize: 100,
      origin: { x: 0, y: 0 },
      obstacles: new Uint8Array([0, 0]),
      categories: new Uint8Array([0, 4]),
      amplification: new Float32Array([1, 1]),
      velocityX: new Float32Array(2),
      velocityY: new Float32Array(2),
    };
    mount({ study: { mode: 'comfort', grid } });
    const image = written[0];
    expect(pixel(image, 0)).toEqual([144, 151, 160, 188]);
    expect(pixel(image, 1)).toEqual([205, 64, 55, 188]);
  });
});
