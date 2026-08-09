import { describe, expect, it } from 'vitest';
import {
  buildRulerTicks,
  chooseRulerStep,
  computeCanvasFit,
  friendlyAnchorPhrase,
  mirrorAngleDegrees,
  wallLocalToSvg,
  wallPointToFrame,
  wallUnitsPerPixel,
} from './wallDetailCanvasMath';

describe('computeCanvasFit', () => {
  it('contain-fits a long wall against the frame width', () => {
    const fit = computeCanvasFit({ frameWidth: 1256, frameHeight: 800, length: 6000, height: 2700, margin: 28 });
    expect(fit.ready).toBe(true);
    expect(fit.fitWidth).toBeCloseTo(1200);
    expect(fit.fitHeight).toBeCloseTo(540);
    expect(fit.pxPerMm).toBeCloseTo(0.2);
  });

  it('contain-fits a short tall wall against the frame height without letterboxing', () => {
    const fit = computeCanvasFit({ frameWidth: 1256, frameHeight: 596, length: 1000, height: 2700, margin: 28 });
    expect(fit.fitHeight).toBeCloseTo(540);
    expect(fit.fitWidth).toBeCloseTo((1000 / 2700) * 540);
    // The SVG box keeps the drawing aspect exactly, so pointer math stays valid.
    expect(fit.fitWidth / fit.fitHeight).toBeCloseTo(1000 / 2700);
  });

  it('reports not ready for an unmeasured or degenerate frame', () => {
    expect(computeCanvasFit({ frameWidth: 0, frameHeight: 0, length: 6000, height: 2700 }).ready).toBe(false);
    expect(computeCanvasFit({ frameWidth: 900, frameHeight: 700, length: 0, height: 2700 }).ready).toBe(false);
  });
});

describe('wallPointToFrame', () => {
  const metrics = computeCanvasFit({ frameWidth: 1256, frameHeight: 800, length: 6000, height: 2700, margin: 28 });

  it('centres the wall at zoom 1 with no pan', () => {
    const origin = wallPointToFrame({ u: 0, v: 0 }, metrics, { zoom: 1, panU: 0, panV: 0 });
    expect(origin.x).toBeCloseTo((1256 - 1200) / 2);
    expect(origin.y).toBeCloseTo((800 - 540) / 2 + 540); // floor sits at the bottom of the fitted box
    const top = wallPointToFrame({ u: 6000, v: 2700 }, metrics, { zoom: 1, panU: 0, panV: 0 });
    expect(top.x).toBeCloseTo(1256 - (1256 - 1200) / 2);
    expect(top.y).toBeCloseTo((800 - 540) / 2);
  });

  it('applies pan and zoom around the frame centre like the CSS camera', () => {
    const centre = wallPointToFrame({ u: 3000, v: 1350 }, metrics, { zoom: 2, panU: 40, panV: -12 });
    expect(centre.x).toBeCloseTo(1256 / 2 + 40);
    expect(centre.y).toBeCloseTo(800 / 2 - 12);
  });

  it('reflects U on mirrored metrics so U 0 lands where the far end normally sits', () => {
    const mirroredMetrics = computeCanvasFit({
      frameWidth: 1256,
      frameHeight: 800,
      length: 6000,
      height: 2700,
      margin: 28,
      mirrorU: true,
    });
    const viewport = { zoom: 1, panU: 0, panV: 0 };
    const origin = wallPointToFrame({ u: 0, v: 0 }, mirroredMetrics, viewport);
    expect(origin.x).toBeCloseTo(1256 - (1256 - 1200) / 2);
    const farEnd = wallPointToFrame({ u: 6000, v: 0 }, mirroredMetrics, viewport);
    expect(farEnd.x).toBeCloseTo((1256 - 1200) / 2);
    // V is untouched by the mirror.
    expect(origin.y).toBeCloseTo((800 - 540) / 2 + 540);
  });
});

describe('wallLocalToSvg', () => {
  it('maps V up-from-floor to SVG Y down, straight U by default', () => {
    expect(wallLocalToSvg({ u: 400, v: 300 }, { length: 3000, height: 2400, mirrorU: false })).toEqual({
      x: 400,
      y: 2100,
    });
  });

  it('reflects U across the wall length when the view is mirrored', () => {
    expect(wallLocalToSvg({ u: 400, v: 300 }, { length: 3000, height: 2400, mirrorU: true })).toEqual({
      x: 2600,
      y: 2100,
    });
  });
});

describe('mirrorAngleDegrees', () => {
  it('keeps horizontal dimension text horizontal and upright', () => {
    expect(mirrorAngleDegrees(0)).toBe(0);
    expect(mirrorAngleDegrees(180)).toBe(0);
  });

  it('keeps vertical dimension text reading in the same direction', () => {
    expect(mirrorAngleDegrees(-90)).toBe(-90);
    expect(mirrorAngleDegrees(90)).toBe(90);
  });

  it('flips the sign of sloped text so it follows the mirrored line', () => {
    expect(mirrorAngleDegrees(30)).toBe(-30);
    expect(mirrorAngleDegrees(-30)).toBe(30);
    expect(mirrorAngleDegrees(45)).toBe(-45);
  });
});

describe('chooseRulerStep', () => {
  it('labels every 500 mm at a typical fit scale', () => {
    expect(chooseRulerStep(0.2).step).toBe(500);
    expect(chooseRulerStep(0.2).minor).toBe(100);
  });

  it('tightens to fine steps when zoomed right in', () => {
    const { step, minor } = chooseRulerStep(4);
    expect(step).toBe(20);
    expect(minor).toBe(4);
  });

  it('never drops minors below legible spacing', () => {
    const { minor } = chooseRulerStep(0.02);
    expect(minor === null || minor * 0.02 >= 7).toBe(true);
  });
});

describe('buildRulerTicks', () => {
  const metrics = computeCanvasFit({ frameWidth: 1256, frameHeight: 800, length: 6000, height: 2700, margin: 28 });
  const viewport = { zoom: 1, panU: 0, panV: 0 };

  it('covers the wall from 0 to its far end with a labelled final tick', () => {
    const { ticks } = buildRulerTicks({ axis: 'u', sizeMm: 6000, metrics, viewport });
    expect(ticks[0].value).toBe(0);
    expect(ticks[0].labeled).toBe(true);
    const last = ticks[ticks.length - 1];
    expect(last.value).toBe(6000);
    expect(last.labeled).toBe(true);
  });

  it('labels the wall end even when it is off the regular step', () => {
    const { ticks } = buildRulerTicks({ axis: 'u', sizeMm: 3125, metrics, viewport });
    expect(ticks.some((tick) => tick.value === 3125 && tick.labeled)).toBe(true);
  });

  it('clips ticks that pan outside the frame', () => {
    const panned = buildRulerTicks({ axis: 'u', sizeMm: 6000, metrics, viewport: { zoom: 3, panU: -1200, panV: 0 } });
    expect(panned.ticks.every((tick) => tick.pos >= -2 && tick.pos <= 1256 + 2)).toBe(true);
    expect(panned.ticks.length).toBeGreaterThan(0);
  });

  it('runs the V axis upward from the floor', () => {
    const { ticks } = buildRulerTicks({ axis: 'v', sizeMm: 2700, metrics, viewport });
    const floor = ticks.find((tick) => tick.value === 0);
    const top = ticks.find((tick) => tick.value === 2700);
    expect(floor.pos).toBeGreaterThan(top.pos);
  });
});

describe('wallUnitsPerPixel', () => {
  it('inverts the fitted scale and zoom', () => {
    const metrics = computeCanvasFit({ frameWidth: 1256, frameHeight: 800, length: 6000, height: 2700, margin: 28 });
    expect(wallUnitsPerPixel(metrics, { zoom: 1 }, null)).toBeCloseTo(5);
    expect(wallUnitsPerPixel(metrics, { zoom: 2 }, null)).toBeCloseTo(2.5);
  });

  it('falls back to a sane estimate before the frame is measured', () => {
    const estimate = wallUnitsPerPixel({ ready: false }, { zoom: 1 }, { length: 6000, height: 2700 });
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(60);
  });
});

describe('friendlyAnchorPhrase', () => {
  it('speaks installer language for the common anchors', () => {
    expect(friendlyAnchorPhrase('edge_left')).toBe('left edge');
    expect(friendlyAnchorPhrase('bottom_left')).toBe('bottom-left corner');
    expect(friendlyAnchorPhrase('axis_center')).toBe('centerline');
    expect(friendlyAnchorPhrase('guide_intersection')).toBe('measurement crossing');
  });

  it('numbers traced-outline anchors from 1', () => {
    expect(friendlyAnchorPhrase('vertex_0')).toBe('corner 1');
    expect(friendlyAnchorPhrase('outline_edge_2')).toBe('edge 3');
  });

  it('falls back to a readable form for unknown anchors', () => {
    expect(friendlyAnchorPhrase('some_new_anchor')).toBe('some new anchor');
    expect(friendlyAnchorPhrase(null)).toBe('');
  });
});
