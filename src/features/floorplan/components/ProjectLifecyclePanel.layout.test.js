import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * The lifecycle panel lives in a 256px sidebar. Inside a stage card there are
 * 201px for content, 187px inside a bordered row card. CSS Grid never shrinks a
 * track below its minimum, so a grid whose fixed tracks, minmax() minimums and
 * gaps add up past the space it is given simply runs out of the sidebar — that
 * is how the surveyed-lot E/W select and remove button went missing. This reads
 * the stylesheet as text and holds every grid to a 180px floor (the 187px row
 * budget less a margin for rounding), so the defect cannot come back unseen.
 */
const BUDGET_PX = 180;
const cssPath = fileURLToPath(new URL('./ProjectLifecyclePanel.module.css', import.meta.url));

/** Splits on top-level whitespace or commas, leaving parentheses intact. */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    const splits = depth === 0 && (separator === ',' ? char === ',' : /\s/.test(char));
    if (splits) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Minimum width in px of one length, or null if it cannot be read. */
function lengthMinimum(value) {
  const text = value.trim();
  if (text === '0' || text === 'auto' || /^[\d.]+fr$/.test(text)) return 0;
  const px = text.match(/^([\d.]+)px$/);
  return px ? Number(px[1]) : null;
}

/** { width, tracks } for a track list, or null if any part cannot be read. */
function trackListMinimum(value) {
  let width = 0;
  let tracks = 0;
  for (const token of splitTopLevel(value, ' ')) {
    if (token.startsWith('[')) continue; // named grid line
    const repeat = token.match(/^repeat\((.*)\)$/s);
    if (repeat) {
      const [countText, ...rest] = splitTopLevel(repeat[1], ',');
      const count = Number(countText);
      const inner = trackListMinimum(rest.join(','));
      if (!Number.isInteger(count) || !inner) return null;
      width += count * inner.width;
      tracks += count * inner.tracks;
      continue;
    }
    const minmax = token.match(/^minmax\((.*)\)$/s);
    const minimum = minmax ? lengthMinimum(splitTopLevel(minmax[1], ',')[0]) : lengthMinimum(token);
    if (minimum == null) return null;
    width += minimum;
    tracks += 1;
  }
  return { width, tracks };
}

/** Column gap in px from a rule body; 0 when absent, null when unreadable. */
function columnGap(body) {
  const columnOnly = body.match(/(?:^|[;\s])column-gap\s*:\s*([^;]+)/);
  const shorthand = body.match(/(?:^|[;\s])gap\s*:\s*([^;]+)/);
  const raw = columnOnly ? columnOnly[1] : shorthand ? (splitTopLevel(shorthand[1], ' ')[1] ?? shorthand[1]) : null;
  if (raw == null) return 0;
  return lengthMinimum(raw.trim());
}

function gridMinimums(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const results = [];
  // Innermost blocks only: a rule inside @media still matches, the @media
  // wrapper itself does not (its body contains braces).
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const body = match[2];
    const columns = body.match(/grid-template-columns\s*:\s*([^;]+)/);
    if (!columns) continue;
    const list = trackListMinimum(columns[1]);
    const gap = columnGap(body);
    if (!list || gap == null) {
      console.warn(`Skipping unparseable grid in ${selector}: ${columns[1].trim()}`);
      continue;
    }
    results.push({ selector, minimum: list.width + Math.max(0, list.tracks - 1) * gap, value: columns[1].trim() });
  }
  return results;
}

describe('ProjectLifecyclePanel stylesheet width budget', () => {
  it('reads the tracks and gaps the way the browser sizes them', () => {
    const [bearing] = gridMinimums(
      '.x { grid-template-columns: 26px 44px minmax(38px, 1fr) minmax(38px, 1fr) 44px 24px; gap: 4px; }',
    );
    expect(bearing.minimum).toBe(234);
    const [repeated] = gridMinimums(
      '.y { grid-template-columns: minmax(86px, 1.4fr) repeat(3, minmax(48px, .65fr)) 40px; gap: 4px }',
    );
    expect(repeated.minimum).toBe(286);
    const [fluid] = gridMinimums('.z { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 9px }');
    expect(fluid.minimum).toBe(9);
  });

  it(`keeps every grid's minimum width within ${BUDGET_PX}px`, () => {
    const grids = gridMinimums(readFileSync(cssPath, 'utf8'));
    expect(grids.length).toBeGreaterThan(0);
    const offenders = grids
      .filter((grid) => grid.minimum > BUDGET_PX)
      .map((grid) => `${grid.selector} needs ${grid.minimum}px (${grid.value})`);
    expect(offenders, `Grids wider than the ${BUDGET_PX}px sidebar budget`).toEqual([]);
  });
});
