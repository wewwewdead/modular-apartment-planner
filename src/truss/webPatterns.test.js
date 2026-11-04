import { describe, expect, it } from 'vitest';
import {
  GABLE_END_FRAME_PATTERN,
  WEB_PATTERNS,
  WEB_PATTERN_KEYS,
  gableStudFractions,
  listWebPatternsForShape,
  parseWebNodeRef,
  resolveWebPatternKey,
} from './webPatterns';

const METRICS = { span: 7200, rise: 1800, panelCount: 6 };

function fullLists(built) {
  return {
    top: [0, ...built.topFractions, 1],
    bottom: [0, ...built.bottomFractions, 1],
  };
}

describe('WEB_PATTERNS (spec §7.3)', () => {
  it.each(WEB_PATTERN_KEYS)('%s: every web references an existing node', (key) => {
    const built = WEB_PATTERNS[key].build(METRICS);
    const { top, bottom } = fullLists(built);
    for (const fraction of [...built.topFractions, ...built.bottomFractions]) {
      expect(fraction).toBeGreaterThan(0);
      expect(fraction).toBeLessThan(1);
    }
    for (const web of built.webs) {
      expect(web).toHaveLength(2);
      for (const ref of web) {
        const parsed = parseWebNodeRef(ref);
        expect(parsed).not.toBeNull();
        const list = parsed.chord === 'top' ? top : bottom;
        expect(parsed.index).toBeLessThan(list.length);
      }
    }
  });

  it.each(WEB_PATTERN_KEYS)('%s: no duplicate members', (key) => {
    const built = WEB_PATTERNS[key].build(METRICS);
    const keys = built.webs.map((web) => [...web].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    for (const [a, b] of built.webs) expect(a).not.toBe(b);
  });

  const symmetric = WEB_PATTERN_KEYS.filter((key) => WEB_PATTERNS[key].symmetric);

  it.each(symmetric)('%s: is mirror-symmetric about mid-span', (key) => {
    const built = WEB_PATTERNS[key].build(METRICS);
    const { top, bottom } = fullLists(built);
    const position = (ref) => {
      const parsed = parseWebNodeRef(ref);
      return `${parsed.chord}:${(parsed.chord === 'top' ? top : bottom)[parsed.index].toFixed(6)}`;
    };
    const mirror = (ref) => {
      const parsed = parseWebNodeRef(ref);
      const value = (parsed.chord === 'top' ? top : bottom)[parsed.index];
      return `${parsed.chord}:${(1 - value).toFixed(6)}`;
    };
    const webs = new Set(built.webs.map((web) => web.map(position).sort().join('|')));
    const mirrored = new Set(built.webs.map((web) => web.map(mirror).sort().join('|')));
    expect(mirrored).toEqual(webs);
  });

  it('has the named gable web counts', () => {
    const count = (key) => WEB_PATTERNS[key].build(METRICS).webs.length;
    expect(count('king_post')).toBe(1);
    expect(count('fink')).toBe(4);
    expect(count('howe')).toBe(5);
    expect(count('fan')).toBe(6);
    expect(count('double_fink')).toBe(8);
  });
});

describe('gable studs', () => {
  it('stands a stud every 600 from each heel: 11 on a 7200 span', () => {
    expect(gableStudFractions(7200).map((f) => Math.round(f * 7200))).toEqual([
      600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000, 6600,
    ]);
  });

  it('meets in the middle on an odd span, with a stud under the ridge when the gap is wide', () => {
    const xs = gableStudFractions(7000).map((f) => Math.round(f * 7000));
    expect(xs.slice(0, 5)).toEqual([600, 1200, 1800, 2400, 3000]);
    expect(xs.slice(-5)).toEqual([4000, 4600, 5200, 5800, 6400]);
    // 3000 → 4000 is wider than 600: a stud under the ridge at 3500.
    expect(xs).toContain(3500);
    for (let index = 1; index < xs.length; index += 1) expect(xs[index] - xs[index - 1]).toBeLessThanOrEqual(600);
  });
});

describe('pattern resolution', () => {
  it('prefers the override, then the instance, then the type, within the shape family', () => {
    expect(resolveWebPatternKey('gable', 'howe', 'fink')).toBe('howe');
    expect(resolveWebPatternKey('gable', 'warren', 'fink')).toBe('fink');
    expect(resolveWebPatternKey('gable', 'howe', 'fink', GABLE_END_FRAME_PATTERN)).toBe('gable_studs');
    expect(resolveWebPatternKey('scissor', null, 'fink')).toBe('fink');
    expect(resolveWebPatternKey('shed', null, 'mono_fan')).toBe('mono_fan');
    expect(resolveWebPatternKey('flat', 'pratt', 'warren')).toBe('pratt');
    // Hip slices and the outline-sampled shapes keep their panel layout…
    expect(resolveWebPatternKey('hip', 'fink', 'hip')).toBeNull();
    expect(resolveWebPatternKey('box_gable', 'fink', 'box_gable')).toBeNull();
    // …but an outline shape can still be a gable end frame.
    expect(resolveWebPatternKey('box_gable', null, null, GABLE_END_FRAME_PATTERN)).toBe('gable_studs');
  });

  it('lists the pickable patterns per shape, never the automatic end frame', () => {
    expect(listWebPatternsForShape('gable').map((entry) => entry.key)).toEqual([
      'king_post',
      'queen_post',
      'fink',
      'howe',
      'fan',
      'double_fink',
      'double_howe',
    ]);
    expect(listWebPatternsForShape('shed').map((entry) => entry.key)).toEqual(['mono_howe', 'mono_fan']);
    expect(listWebPatternsForShape('flat').map((entry) => entry.key)).toEqual(['warren', 'pratt']);
    expect(listWebPatternsForShape('hip')).toEqual([]);
  });
});
