import { describe, expect, it } from 'vitest';
import { layoutFastenerTags, measureTagWidth } from '../export/fastenerTagLayout';
import { buildFastenerLegend } from '../export/fastenerLegend';
import { buildFastenerFeatureConfig } from '../../utils/fastenerUtils';
import { createFeatureEntity } from '../../utils/entityUtils';

/** A #8 wood screw's drill site: 3mm pilot under an 8mm head. */
function drillSite(symbol, x, y, overrides = {}) {
  return {
    symbol,
    hardwareId: 'hw-screw-8-32',
    entityId: `${symbol}@${x},${y}`,
    joineryGenerated: false,
    sites: 1,
    x,
    y,
    headRadius: 4,
    ...overrides,
  };
}

function boxesIntersect(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function anyPairIntersects(marks) {
  return marks.some((mark, index) =>
    marks.slice(index + 1).some((other) => boxesIntersect(mark.tag.box, other.tag.box)),
  );
}

function boxIntersectsCircle(box, circle) {
  const closestX = Math.min(Math.max(circle.x, box.minX), box.maxX);
  const closestY = Math.min(Math.max(circle.y, box.minY), box.maxY);
  return Math.hypot(circle.x - closestX, circle.y - closestY) < circle.r;
}

function fastener(id, hardwareId, point, targetPartId = null) {
  return {
    ...createFeatureEntity(buildFastenerFeatureConfig(hardwareId, point, { targetPartId }), [], 'default'),
    id,
  };
}

describe('fastener tag layout', () => {
  it('keeps the historical up-right position when nothing is in the way', () => {
    const [tagged] = layoutFastenerTags([drillSite('F1', 100, 50)]);

    // The exact coordinates the export used before collision handling existed:
    // (x + headRadius + clearance, y - headRadius - clearance).
    expect(tagged.tag.x).toBeCloseTo(105.2, 6);
    expect(tagged.tag.y).toBeCloseTo(44.8, 6);
    expect(tagged.tag.quadrant).toBe('up-right');
    expect(tagged.tag.push).toBe(0);
    expect(tagged.tag.leader).toBeNull();
  });

  it('leaves well-spaced fasteners on their defaults', () => {
    const tagged = layoutFastenerTags([drillSite('F1', 0, 0), drillSite('F2', 100, 0), drillSite('F3', 200, 0)]);

    tagged.forEach((mark) => {
      expect(mark.tag.x).toBeCloseTo(mark.x + 5.2, 6);
      expect(mark.tag.y).toBeCloseTo(mark.y - 5.2, 6);
      expect(mark.tag.quadrant).toBe('up-right');
      expect(mark.tag.leader).toBeNull();
    });
    expect(anyPairIntersects(tagged)).toBe(false);
  });

  it('separates two fasteners 4mm apart', () => {
    const tagged = layoutFastenerTags([drillSite('F1', 0, 0), drillSite('F2', 4, 0)]);

    // Default boxes would overlap: each is 4.48mm wide and they start 4mm apart.
    expect(anyPairIntersects(tagged)).toBe(false);
    expect(tagged.map((mark) => mark.tag.quadrant)).not.toEqual(['up-right', 'up-right']);
  });

  it('resolves a five-fastener cluster with the four quadrants alone', () => {
    // Loose enough that flipping quadrants is all it takes - no tag should be
    // pushed away from its hole while a quadrant is still free.
    const tagged = layoutFastenerTags([
      drillSite('F1', 0, 0),
      drillSite('F1', 5, 0),
      drillSite('F1', 10, 0),
      drillSite('F1', 0, 5),
      drillSite('F1', 5, 5),
    ]);

    expect(anyPairIntersects(tagged)).toBe(false);
    expect(tagged.every((mark) => mark.tag.push === 0)).toBe(true);
    expect(new Set(tagged.map((mark) => mark.tag.quadrant)).size).toBeGreaterThan(1);
  });

  it('resolves a tight five-fastener cluster without any overlap', () => {
    // Five holes 0.5mm apart: the four quadrants get used up and the last tag
    // has to be pushed clear.
    const cluster = [
      drillSite('F1', 0, 0),
      drillSite('F1', 0.5, 0),
      drillSite('F1', 1, 0),
      drillSite('F1', 1.5, 0),
      drillSite('F1', 2, 0),
    ];
    const tagged = layoutFastenerTags(cluster);
    const circles = tagged.map((mark) => ({ x: mark.x, y: mark.y, r: mark.headRadius }));

    expect(tagged).toHaveLength(5);
    expect(anyPairIntersects(tagged)).toBe(false);

    // No tag sits on top of another fastener's head either.
    tagged.forEach((mark, index) => {
      circles.forEach((circle, circleIndex) => {
        if (circleIndex !== index) {
          expect(boxIntersectsCircle(mark.tag.box, circle)).toBe(false);
        }
      });
    });

    // At least one tag had to be pushed clear, and a pushed tag is drawn with a
    // leader back to its hole.
    const pushed = tagged.filter((mark) => mark.tag.push > 0);
    expect(pushed.length).toBeGreaterThan(0);
    const withLeaders = tagged.filter((mark) => mark.tag.leader);
    expect(withLeaders.length).toBeGreaterThan(0);
    withLeaders.forEach((mark) => {
      // The leader starts on the hole's edge, not at its centre (coordinates are
      // rounded to 3 decimals for the SVG output).
      expect(Math.hypot(mark.tag.leader.x1 - mark.x, mark.tag.leader.y1 - mark.y)).toBeCloseTo(mark.headRadius, 3);
    });
  });

  it('produces byte-identical output for the same input', () => {
    const cluster = [
      drillSite('F1', 0, 0),
      drillSite('F2', 4, 0),
      drillSite('F1', 8, 0),
      drillSite('F3', 2, 4),
      drillSite('F1', 6, 4),
    ];

    expect(JSON.stringify(layoutFastenerTags(cluster))).toBe(JSON.stringify(layoutFastenerTags(cluster)));
  });

  it('places marks in a canonical top-to-bottom, left-to-right order', () => {
    const tagged = layoutFastenerTags([drillSite('F2', 50, 40), drillSite('F1', 10, 40), drillSite('F3', 30, 5)]);

    expect(tagged.map((mark) => [mark.x, mark.y])).toEqual([
      [30, 5],
      [10, 40],
      [50, 40],
    ]);
  });

  it('reserves more room for a longer label', () => {
    expect(measureTagWidth('F1')).toBeCloseTo(4.48, 6);
    expect(measureTagWidth('F12')).toBeCloseTo(6.72, 6);

    const [short] = layoutFastenerTags([drillSite('F1', 0, 0)]);
    const [long] = layoutFastenerTags([drillSite('F12', 0, 0)]);

    expect(long.tag.box.maxX - long.tag.box.minX).toBeGreaterThan(short.tag.box.maxX - short.tag.box.minX);
  });

  it('carries every mark field through untouched', () => {
    const [tagged] = layoutFastenerTags([
      drillSite('F1', 12, 8, { sites: 2, joineryGenerated: true, headRadius: 4.75 }),
    ]);

    expect(tagged).toMatchObject({
      symbol: 'F1',
      hardwareId: 'hw-screw-8-32',
      sites: 2,
      joineryGenerated: true,
      x: 12,
      y: 8,
      headRadius: 4.75,
    });
  });

  it('keeps a bigger head at a bigger clearance', () => {
    const [small] = layoutFastenerTags([drillSite('F1', 0, 0, { headRadius: 4 })]);
    const [large] = layoutFastenerTags([drillSite('F1', 0, 0, { headRadius: 10 })]);

    expect(large.tag.x).toBeGreaterThan(small.tag.x);
    expect(large.tag.y).toBeLessThan(small.tag.y);
  });
});

describe('fastener tag layout through the legend', () => {
  it('lays out real placed fasteners drilled 4mm apart', () => {
    const legend = buildFastenerLegend([
      fastener('f1', 'hw-screw-8-32', { x: 0, y: 0 }),
      fastener('f2', 'hw-screw-8-32', { x: 4, y: 0 }),
    ]);

    expect(legend.items).toHaveLength(1);
    expect(legend.items[0].quantity).toBe(2);
    expect(legend.marks).toHaveLength(2);
    expect(anyPairIntersects(legend.marks)).toBe(false);
  });

  it('leaves the legend table untouched by tag placement', () => {
    const spread = buildFastenerLegend([
      fastener('f1', 'hw-screw-8-32', { x: 0, y: 0 }),
      fastener('f2', 'hw-screw-8-32', { x: 200, y: 0 }),
    ]);
    const tight = buildFastenerLegend([
      fastener('f1', 'hw-screw-8-32', { x: 0, y: 0 }),
      fastener('f2', 'hw-screw-8-32', { x: 3, y: 0 }),
    ]);

    expect(tight.items).toEqual(spread.items);
  });
});
