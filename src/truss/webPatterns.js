/**
 * Named truss web patterns (docs/roof-truss-industrial.md §7.3, RT-3).
 *
 * A pattern says where the panel points sit on each chord and which of them a
 * web joins. `build(metrics)` returns `{topFractions, bottomFractions, webs}`:
 *
 * - `topFractions` / `bottomFractions`: INTERIOR panel points as fractions of
 *   the span (0 < f < 1). The heels (0 and 1) are always there on both chords
 *   and are not listed.
 * - `webs`: `[[ref, ref] …]` where a ref is `t<i>` / `b<i>` and `i` indexes the
 *   FULL list of that chord's points, heels included: `t0` is the start-heel
 *   top-chord point, `t1` the first listed top fraction … `t<n+1>` the end
 *   heel. So for Fink (top 0.25, 0.5, 0.75; bottom 1/3, 2/3) `t1` is x = 0.25 S
 *   and `b1` is x = S/3.
 *
 * `families` lists the truss shapes a pattern can draw: 'gable' (gable and
 * scissor), 'shed' (mono) and 'flat'. `gable_studs` (the gable end frame)
 * draws on every non-hip shape: profile.js adds the chord's own kinks (ridge,
 * crown corners) as extra top-chord points so the frame keeps the truss's
 * outline. Hip trusses and the outline-sampled shapes (box gable, pyramid,
 * domed, dropped eaves) keep their panel layout unless a gable frame is asked
 * for (spec §7.3).
 */

const EPSILON = 1e-6;
export const GABLE_STUD_SPACING = 600;

function sixths() {
  return [1, 2, 3, 4, 5].map((i) => i / 6);
}

function evenFractions(count) {
  return Array.from({ length: Math.max(count - 1, 0) }, (_, index) => (index + 1) / count);
}

function verticals(count, offset = 1) {
  // b_i–t_i for i = offset … offset + count - 1.
  return Array.from({ length: count }, (_, index) => [`b${index + offset}`, `t${index + offset}`]);
}

/**
 * Gable studs: verticals every 600 from each heel toward the middle, meeting at
 * mid-span (a stud under the ridge when the two runs land there or leave a gap
 * wider than the spacing). A 7200 span gets 11, at 600 … 6600.
 */
export function gableStudFractions(span, spacing = GABLE_STUD_SPACING) {
  const safeSpan = Math.max(Number(span) || 0, EPSILON);
  const half = safeSpan / 2;
  const xs = [];
  for (let x = spacing; x <= half + EPSILON; x += spacing) xs.push(x);
  for (let x = safeSpan - spacing; x >= half - EPSILON; x -= spacing) xs.push(x);
  const sorted = [...xs].sort((a, b) => a - b);
  const unique = sorted.filter((x, index) => index === 0 || x - sorted[index - 1] > 1);
  const leftInner = unique.filter((x) => x < half - 1).pop();
  const rightInner = unique.filter((x) => x > half + 1)[0];
  const hasMiddle = unique.some((x) => Math.abs(x - half) <= 1);
  if (!hasMiddle && leftInner !== undefined && rightInner !== undefined && rightInner - leftInner > spacing + 1) {
    unique.push(half);
    unique.sort((a, b) => a - b);
  }
  return unique.filter((x) => x > 1 && x < safeSpan - 1).map((x) => x / safeSpan);
}

export const WEB_PATTERNS = Object.freeze({
  king_post: {
    label: 'King post',
    families: ['gable'],
    symmetric: true,
    build: () => ({ topFractions: [0.5], bottomFractions: [0.5], webs: [['b1', 't1']] }),
  },
  queen_post: {
    label: 'Queen post',
    families: ['gable'],
    symmetric: true,
    build: () => ({
      topFractions: [0.25, 0.5, 0.75],
      bottomFractions: [0.25, 0.75],
      webs: [
        ['b1', 't1'],
        ['b2', 't3'],
      ],
    }),
  },
  fink: {
    label: 'Fink',
    families: ['gable'],
    symmetric: true,
    build: () => ({
      topFractions: [0.25, 0.5, 0.75],
      bottomFractions: [1 / 3, 2 / 3],
      // Zigzag t0.25–b1/3–t0.5–b2/3–t0.75.
      webs: [
        ['t1', 'b1'],
        ['b1', 't2'],
        ['t2', 'b2'],
        ['b2', 't3'],
      ],
    }),
  },
  howe: {
    label: 'Howe',
    families: ['gable'],
    symmetric: true,
    build: () => ({
      topFractions: [0.25, 0.5, 0.75],
      bottomFractions: [0.25, 0.5, 0.75],
      webs: [...verticals(3), ['t1', 'b2'], ['t3', 'b2']],
    }),
  },
  fan: {
    label: 'Fan',
    families: ['gable'],
    symmetric: true,
    build: () => ({
      topFractions: sixths(),
      bottomFractions: [1 / 3, 2 / 3],
      webs: [
        ['b1', 't1'],
        ['b1', 't2'],
        ['b1', 't3'],
        ['b2', 't3'],
        ['b2', 't4'],
        ['b2', 't5'],
      ],
    }),
  },
  double_fink: {
    label: 'Double Fink',
    families: ['gable'],
    symmetric: true,
    build: () => ({
      topFractions: sixths(),
      bottomFractions: [0.2, 0.4, 0.6, 0.8],
      // Zigzag t1/6–b1/5–t2/6–b2/5–t3/6–b3/5–t4/6–b4/5–t5/6.
      webs: [
        ['t1', 'b1'],
        ['b1', 't2'],
        ['t2', 'b2'],
        ['b2', 't3'],
        ['t3', 'b3'],
        ['b3', 't4'],
        ['t4', 'b4'],
        ['b4', 't5'],
      ],
    }),
  },
  double_howe: {
    label: 'Double Howe',
    families: ['gable'],
    symmetric: true,
    build: () => ({
      topFractions: sixths(),
      bottomFractions: sixths(),
      // Verticals at every sixth + diagonals rising toward the ridge.
      webs: [...verticals(5), ['b1', 't2'], ['b2', 't3'], ['b5', 't4'], ['b4', 't3']],
    }),
  },
  mono_howe: {
    label: 'Mono Howe',
    families: ['shed'],
    symmetric: false,
    build: () => ({
      topFractions: [0.25, 0.5, 0.75],
      bottomFractions: [0.25, 0.5, 0.75],
      // Verticals at each quarter and the high-end post; diagonals rise toward
      // the high end.
      webs: [...verticals(4), ['b1', 't2'], ['b2', 't3'], ['b3', 't4']],
    }),
  },
  mono_fan: {
    label: 'Mono Fan',
    families: ['shed'],
    symmetric: false,
    build: (metrics) => {
      const panels = Math.max(2, Math.round(metrics?.panelCount || 4));
      const fractions = evenFractions(panels);
      const diagonals = Array.from({ length: panels }, (_, index) =>
        index % 2 === 0 ? [`b${index}`, `t${index + 1}`] : [`t${index}`, `b${index + 1}`],
      ).filter(([a, b]) => !(a === 'b0' && b === 't0'));
      // The alternating layout mono trusses always had, plus the high-end post.
      return { topFractions: fractions, bottomFractions: fractions, webs: [...verticals(panels), ...diagonals] };
    },
  },
  warren: {
    label: 'Warren',
    families: ['flat'],
    symmetric: false,
    build: (metrics) => {
      const panels = Math.max(2, Math.round(metrics?.panelCount || 6));
      const fractions = evenFractions(panels);
      const diagonals = Array.from({ length: panels }, (_, index) =>
        index % 2 === 0 ? [`b${index}`, `t${index + 1}`] : [`t${index}`, `b${index + 1}`],
      );
      // The alternating layout flat trusses always had, plus the two end posts.
      return {
        topFractions: fractions,
        bottomFractions: fractions,
        webs: [['b0', 't0'], ...verticals(panels), ...diagonals],
      };
    },
  },
  pratt: {
    label: 'Pratt',
    families: ['flat'],
    symmetric: true,
    build: (metrics) => {
      const panels = Math.max(2, 2 * Math.round(Math.max(2, Math.round(metrics?.panelCount || 6)) / 2));
      const fractions = evenFractions(panels);
      const half = panels / 2;
      const diagonals = [];
      for (let index = 0; index < half; index += 1) diagonals.push([`t${index}`, `b${index + 1}`]);
      for (let index = panels; index > half; index -= 1) diagonals.push([`t${index}`, `b${index - 1}`]);
      // End posts, verticals at every panel point, diagonals falling toward the centre.
      return {
        topFractions: fractions,
        bottomFractions: fractions,
        webs: [['b0', 't0'], ...verticals(panels), ...diagonals],
      };
    },
  },
  gable_studs: {
    label: 'Gable studs (end frame)',
    families: ['gable', 'shed', 'flat', 'outline'],
    symmetric: true,
    build: (metrics) => {
      const fractions = gableStudFractions(metrics?.span);
      return {
        topFractions: fractions,
        bottomFractions: fractions,
        webs: verticals(fractions.length),
      };
    },
  },
});

export const WEB_PATTERN_KEYS = Object.freeze(Object.keys(WEB_PATTERNS));
export const GABLE_END_FRAME_PATTERN = 'gable_studs';

/** Which pattern family a truss shape belongs to ('outline' for the sampled shapes, null for hip). */
export function webPatternFamilyForShape(shape) {
  if (shape === 'gable' || shape === 'scissor') return 'gable';
  if (shape === 'shed') return 'shed';
  if (shape === 'flat') return 'flat';
  if (shape === 'hip') return null;
  return 'outline';
}

/** Patterns a user may pick for a shape (the gable end frame is automatic, never picked). */
export function listWebPatternsForShape(shape) {
  const family = webPatternFamilyForShape(shape);
  if (!family || family === 'outline') return [];
  return WEB_PATTERN_KEYS.filter(
    (key) => key !== GABLE_END_FRAME_PATTERN && WEB_PATTERNS[key].families.includes(family),
  ).map((key) => ({ key, label: WEB_PATTERNS[key].label }));
}

/**
 * The pattern a profile draws: an explicit override (the gable end frame)
 * first, then the instance's `webPatternKey`, then the truss type's default —
 * each only when the pattern can draw that shape. `null` = the legacy panel
 * layout (hip slices and the outline-sampled shapes).
 */
export function resolveWebPatternKey(shape, instanceKey = null, typeKey = null, overrideKey = null) {
  const family = webPatternFamilyForShape(shape);
  if (!family) return null;
  for (const key of [overrideKey, instanceKey, typeKey]) {
    if (key && WEB_PATTERNS[key]?.families.includes(family)) return key;
  }
  return null;
}

/** Parse a `t<i>` / `b<i>` ref. */
export function parseWebNodeRef(ref) {
  const match = /^([tb])(\d+)$/.exec(String(ref || ''));
  if (!match) return null;
  return { chord: match[1] === 't' ? 'top' : 'bottom', index: Number(match[2]) };
}

export function getWebPatternLabel(key) {
  return WEB_PATTERNS[key]?.label || 'Panel layout';
}
