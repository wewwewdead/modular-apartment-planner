import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FixtureRenderer from './FixtureRenderer';

// Regression: ISSUE-001 — TV inner bezel <rect> rendered with negative height
// Found by /qa on 2026-04-05
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-05.md

describe('FixtureRenderer', () => {
  function renderFixture(fixture) {
    return renderToStaticMarkup(
      <svg>
        <FixtureRenderer fixtures={[fixture]} />
      </svg>,
    );
  }

  function extractRectHeights(markup) {
    const matches = [...markup.matchAll(/<rect[^>]*\sheight="([^"]+)"/g)];
    return matches.map(m => parseFloat(m[1]));
  }

  function extractRectWidths(markup) {
    const matches = [...markup.matchAll(/<rect[^>]*\swidth="([^"]+)"/g)];
    return matches.map(m => parseFloat(m[1]));
  }

  it('renders a thin wall-mounted TV without negative rect dimensions', () => {
    // Playground demo ships this exact fixture. Prior to the fix the inner
    // bezel rect height came out to depth - (width * 0.04) * 2 = 100 - 160 = -60.
    const markup = renderFixture({
      id: 'tv-thin',
      fixtureType: 'tv',
      x: 0,
      y: 0,
      width: 2000,
      depth: 100,
      rotation: 0,
    });

    const heights = extractRectHeights(markup);
    const widths = extractRectWidths(markup);
    expect(heights.length).toBeGreaterThan(0);
    heights.forEach(h => expect(h).toBeGreaterThan(0));
    widths.forEach(w => expect(w).toBeGreaterThan(0));
  });

  it('renders a normal TV (square-ish) with a positive-height inner bezel', () => {
    const markup = renderFixture({
      id: 'tv-normal',
      fixtureType: 'tv',
      x: 0,
      y: 0,
      width: 1200,
      depth: 800,
      rotation: 0,
    });

    const heights = extractRectHeights(markup);
    expect(heights.length).toBeGreaterThan(0);
    heights.forEach(h => expect(h).toBeGreaterThan(0));
  });

  it('keeps TV bezel inset proportional to the smaller dimension', () => {
    // For a 2000 x 100 TV the inset is min(width, depth) * 0.04 = 4mm,
    // so the inner rect measures (2000 - 8) x (100 - 8) = 1992 x 92.
    const markup = renderFixture({
      id: 'tv-thin-proportions',
      fixtureType: 'tv',
      x: 0,
      y: 0,
      width: 2000,
      depth: 100,
      rotation: 0,
    });

    const heights = extractRectHeights(markup);
    const widths = extractRectWidths(markup);
    expect(heights).toContain(92);
    expect(widths).toContain(1992);
  });
});
