/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { planImageFileName, resolveCssVariables, scaleNonScalingStrokes } from './planImageExport';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(markup) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml');
  return doc.documentElement;
}

describe('resolveCssVariables', () => {
  const lookup = (name) => ({ '--font-ui': 'Manrope, sans-serif', '--ink': '#123456' })[name] || '';

  it('swaps every var() for the value the page resolves it to', () => {
    expect(resolveCssVariables('var(--font-ui)', lookup)).toBe('Manrope, sans-serif');
    expect(resolveCssVariables('1px solid var(--ink)', lookup)).toBe('1px solid #123456');
  });

  it('falls back to the declared fallback, and leaves plain values alone', () => {
    expect(resolveCssVariables('var(--missing, #fff)', lookup)).toBe('#fff');
    expect(resolveCssVariables('#abcdef', lookup)).toBe('#abcdef');
  });
});

describe('scaleNonScalingStrokes', () => {
  it('scales the screen-pixel strokes and their dashes, and nothing else', () => {
    const root = svg(
      '<line vector-effect="non-scaling-stroke" stroke-width="1.5" stroke-dasharray="4 3"/>' +
        '<line vector-effect="non-scaling-stroke"/>' +
        '<rect stroke-width="40"/>',
    );
    scaleNonScalingStrokes(root, 3);
    const [dashed, bare] = root.querySelectorAll('line');
    expect(dashed.getAttribute('stroke-width')).toBe('4.5');
    expect(dashed.getAttribute('stroke-dasharray')).toBe('12 9');
    // An unset width is 1 screen pixel.
    expect(bare.getAttribute('stroke-width')).toBe('3');
    // World-unit strokes already scale with the drawing.
    expect(root.querySelector('rect').getAttribute('stroke-width')).toBe('40');
  });
});

describe('planImageFileName', () => {
  it('names the file after the project', () => {
    expect(planImageFileName('My House 2')).toBe('my-house-2-plan.png');
    expect(planImageFileName('')).toBe('floor-plan.png');
  });
});
