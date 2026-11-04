import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWall } from '@/domain/models';
import { CanvasZoomProvider } from './CanvasZoomContext';
import { PLAN_STYLES, PlanStyleProvider } from './PlanStyleContext';
import FixtureDefs from './FixtureDefs';
import PlanCardShadow from './PlanCardShadow';

const attr = (html, name) => {
  const match = html.match(new RegExp(`${name}="([^"]+)"`));
  return match ? Number(match[1]) : null;
};

function render(node, { zoom = null, style = null } = {}) {
  let tree = node;
  if (style) tree = <PlanStyleProvider value={style}>{tree}</PlanStyleProvider>;
  if (zoom) tree = <CanvasZoomProvider value={zoom}>{tree}</CanvasZoomProvider>;
  return renderToStaticMarkup(<svg>{tree}</svg>);
}

describe('shadow blur is a screen-space quantity on the canvas', () => {
  it('scales the presentation fixture shadow by 1/zoom', () => {
    const atHalf = render(<FixtureDefs />, { zoom: 0.5, style: PLAN_STYLES.PRESENTATION });
    expect(attr(atHalf, 'stdDeviation')).toBeCloseTo(6);
    expect(attr(atHalf, 'dy')).toBeCloseTo(6);
    const atFour = render(<FixtureDefs />, { zoom: 4, style: PLAN_STYLES.PRESENTATION });
    expect(attr(atFour, 'stdDeviation')).toBeCloseTo(0.75);
  });

  it('scales the drafting fixture shadow on the canvas, and leaves it alone where there is no zoom', () => {
    const canvas = render(<FixtureDefs />, { zoom: 0.5 });
    expect(attr(canvas, 'stdDeviation')).toBeCloseTo(5);
    expect(attr(canvas, 'dy')).toBeCloseTo(5);
    // A sheet or an export: no zoom context, the world-unit values as before.
    const sheet = render(<FixtureDefs />);
    expect(attr(sheet, 'stdDeviation')).toBe(25);
    expect(attr(sheet, 'dy')).toBe(30);
  });

  it('scales the card shadow by 1/zoom and falls back to world units without a zoom', () => {
    const walls = [createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200)];
    const props = { walls, columns: [], rooms: [], slabs: [] };
    const zoomed = render(<PlanCardShadow {...props} />, { zoom: 2, style: PLAN_STYLES.PRESENTATION });
    expect(zoomed).toContain('data-type="plan-card"');
    expect(attr(zoomed, 'stdDeviation')).toBeCloseTo(9);
    expect(attr(zoomed, 'dy')).toBeCloseTo(6);
    const plain = render(<PlanCardShadow {...props} />, { style: PLAN_STYLES.PRESENTATION });
    expect(attr(plain, 'stdDeviation')).toBe(220);
    expect(attr(plain, 'dy')).toBe(160);
  });
});
