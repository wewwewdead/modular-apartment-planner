/**
 * How the wall elevation draws a screw (docs/wall-fastener-visibility.md §2.3).
 *
 * A screw head is 8 mm across on a wall drawn 3–4 m wide, so at true scale it
 * is a pixel or two on screen — present in the DOM, invisible on the sheet. The
 * ceiling plan solved this first (`CeilingScrewLayer`): a head is never drawn
 * smaller than a 6 px dot, and becomes true size once you zoom in past that.
 * The wall elevation now does the same, with the same halo.
 */

/** The smallest head radius on screen, in pixels: a 6 px dot. */
export const FASTENER_SYMBOL_MIN_RADIUS_PX = 3;
/** How far the selected halo stands off the head, in pixels. */
export const FASTENER_HALO_GAP_PX = 7;
/** The contrast a tonal head's ring keeps against the board it is drawn on (WCAG non-text). */
export const TONAL_RING_CONTRAST = 3;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * The head's drawn radius in wall millimetres: true size, or 3 px when true
 * size would be smaller. `unitPx` is millimetres per screen pixel
 * (`wallUnitsPerPixel`).
 */
export function fastenerSymbolRadius(headDiameter, unitPx) {
  const trueRadius = finitePositive(headDiameter, 0) / 2;
  return Math.max(trueRadius, FASTENER_SYMBOL_MIN_RADIUS_PX * finitePositive(unitPx, 0));
}

/** The selected halo's radius, a fixed 7 px outside the head at any zoom. */
export function fastenerHaloRadius(radius, unitPx) {
  return radius + FASTENER_HALO_GAP_PX * finitePositive(unitPx, 0);
}

function parseHex(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return null;
  return [0, 2, 4].map((index) => parseInt(match[1].slice(index, index + 2), 16));
}

function toHex(channels) {
  return `#${channels
    .map((value) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function linearChannel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB `[r, g, b]`. */
function luminance(channels) {
  const [r, g, b] = channels.map(linearChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours, or null if either is not one. */
export function contrastRatio(a, b) {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return null;
  const [high, low] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function mix(channels, pole, amount) {
  return channels.map((value) => value + (pole - value) * amount);
}

/**
 * The smallest step from `fill` towards `pole` (0 black, 255 white) that
 * reaches `target` contrast — the quietest ring that still reads — or the pole
 * itself when nothing short of it does.
 */
function quietestStep(fill, pole, target) {
  const fillLuminance = luminance(fill);
  const reaches = (amount) => {
    const other = luminance(mix(fill, pole, amount));
    const [high, low] = [fillLuminance, other].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05) >= target;
  };
  if (!reaches(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

const NEUTRAL_TONAL_INK = Object.freeze({ fill: '#d3d7da', stroke: '#5f6264', slot: '#8a8d8f' });
const tonalInkCache = new Map();

/**
 * A tonal ("quiet, panel-matched") head drawn on a board filled `boardFill`:
 * filled in the board's own colour, ringed in the same hue taken just far
 * enough to hold 3 : 1 against it. Darker on a light board, lighter on a dark
 * one — whichever way has the room — so a dark face finish gets a light ring
 * from the same rule rather than one grey for every board. The slot line sits
 * between the two.
 */
export function tonalFastenerInk(boardFill) {
  const cached = tonalInkCache.get(boardFill);
  if (cached) return cached;
  const fill = parseHex(boardFill);
  if (!fill) return NEUTRAL_TONAL_INK;
  // Black and white offer the same contrast against a luminance of ~0.18;
  // above it a darker ring has more room, below it a lighter one does.
  const fillLuminance = luminance(fill);
  const pole = (fillLuminance + 0.05) / 0.05 >= 1.05 / (fillLuminance + 0.05) ? 0 : 255;
  const amount = quietestStep(fill, pole, TONAL_RING_CONTRAST + 0.05);
  const ink = Object.freeze({
    fill: toHex(fill),
    stroke: toHex(mix(fill, pole, amount)),
    slot: toHex(mix(fill, pole, amount * 0.75)),
  });
  if (tonalInkCache.size > 64) tonalInkCache.clear();
  tonalInkCache.set(boardFill, ink);
  return ink;
}
