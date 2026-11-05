import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getCeilingLocalSpace } from '@/domain/ceilingModels';
import { createDoor, createFixture, createRoom, createWall, createWindow } from '@/domain/models';
import { CeilingPlanUnderlay, CeilingPlanUnderlayLabels, planToCeilingTransform } from './CeilingPlanUnderlay';

function parseMatrix(transform) {
  const [a, b, c, d, e, f] = transform
    .replace(/^matrix\(|\)$/g, '')
    .trim()
    .split(/\s+/)
    .map(Number);
  return (point) => ({ u: a * point.x + c * point.y + e, v: b * point.x + d * point.y + f });
}

const RECT = [
  { x: 1000, y: 500 },
  { x: 7000, y: 500 },
  { x: 7000, y: 4500 },
  { x: 1000, y: 4500 },
];

// The same rectangle turned 20° about its first corner, so the ceiling's frame
// is genuinely rotated against plan north.
const ROTATED = RECT.map((point) => {
  const angle = (20 * Math.PI) / 180;
  const dx = point.x - 1000;
  const dy = point.y - 500;
  return {
    x: 1000 + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: 500 + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
});

describe('planToCeilingTransform', () => {
  it.each([
    ['a plan-aligned ceiling', RECT],
    ['a ceiling rotated off plan north', ROTATED],
  ])('maps a wall endpoint onto the ceiling frame for %s', (_label, boundary) => {
    const space = getCeilingLocalSpace(boundary);
    const apply = parseMatrix(planToCeilingTransform(space));
    const wall = createWall({ x: 2500, y: 1200 }, { x: 6100, y: 3900 });
    for (const endpoint of [wall.start, wall.end, { x: 0, y: 0 }]) {
      const mapped = apply(endpoint);
      const expected = space.toLocal(endpoint);
      expect(mapped.u).toBeCloseTo(expected.u, 6);
      expect(mapped.v).toBeCloseTo(expected.v, 6);
    }
  });
});

function floorFixture() {
  const wall = createWall({ x: 1000, y: 2500 }, { x: 7000, y: 2500 }, 150);
  const room = createRoom('Living room', [
    { x: 1000, y: 500 },
    { x: 7000, y: 500 },
    { x: 7000, y: 2500 },
    { x: 1000, y: 2500 },
  ]);
  return {
    id: 'floor_1',
    walls: [wall],
    columns: [{ id: 'col_1', x: 1000, y: 500, width: 300, height: 3000, depth: 300 }],
    doors: [createDoor(wall.id, 1500, 900)],
    windows: [createWindow(wall.id, 4000, 1200)],
    rooms: [room],
    fixtures: [createFixture('sofa', 3000, 1500, { width: 2000, depth: 900 })],
  };
}

describe('CeilingPlanUnderlay', () => {
  it('draws walls, columns, door and window bars, rooms and furniture, all pointer-transparent', () => {
    const space = getCeilingLocalSpace(RECT);
    const origin = space.toLocal({ x: 0, y: 0 });
    const markup = renderToStaticMarkup(
      <svg>
        <CeilingPlanUnderlay
          floor={floorFixture()}
          axisUx={space.axisU.x}
          axisUy={space.axisU.y}
          originU={origin.u}
          originV={origin.v}
        />
      </svg>,
    );
    expect(markup).toContain('data-plan-underlay="plan"');
    expect(markup).toContain('pointer-events:none');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-underlay-opening="door"');
    expect(markup).toContain('data-underlay-opening="window"');
    // Wall + column bodies, the room outline, the sofa and two opening bars.
    expect((markup.match(/<polygon/g) || []).length).toBe(6);
  });

  it('puts the door bar where the plan does: centred on its offset along the wall', () => {
    const space = getCeilingLocalSpace(RECT);
    const origin = space.toLocal({ x: 0, y: 0 });
    const markup = renderToStaticMarkup(
      <svg>
        <CeilingPlanUnderlay
          floor={floorFixture()}
          axisUx={space.axisU.x}
          axisUy={space.axisU.y}
          originU={origin.u}
          originV={origin.v}
        />
      </svg>,
    );
    const door = markup.match(/data-underlay-opening="door" points="([^"]+)"/)[1];
    const xs = door.split(' ').map((pair) => Number(pair.split(',')[0]));
    // Offset 1500 from the wall's start at x = 1000, 900 wide: 2050 … 2950.
    expect(Math.min(...xs)).toBeCloseTo(2050, 6);
    expect(Math.max(...xs)).toBeCloseTo(2950, 6);
  });

  it('labels each named room upright, in drawing coordinates', () => {
    const space = getCeilingLocalSpace(RECT);
    const origin = space.toLocal({ x: 0, y: 0 });
    const markup = renderToStaticMarkup(
      <svg>
        <CeilingPlanUnderlayLabels
          floor={floorFixture()}
          axisUx={space.axisU.x}
          axisUy={space.axisU.y}
          originU={origin.u}
          originV={origin.v}
          depth={space.depth}
          unitPx={2}
        />
      </svg>,
    );
    expect(markup).toContain('data-plan-underlay="labels"');
    expect(markup).toContain('>Living room</text>');
    // The room's centroid (4000, 1500) is u 3000, v 3000 in this frame, so it
    // is drawn at x 3000, y depth − 3000 = 1000.
    const label = space.toLocal({ x: 4000, y: 1500 });
    expect(markup).toContain(`x="${label.u}"`);
    expect(markup).toContain(`y="${space.depth - label.v}"`);
    expect(markup).toContain('font-size="25"');
    expect(markup).toContain('paint-order="stroke"');
  });

  it('draws nothing for a ceiling with no floor', () => {
    expect(renderToStaticMarkup(<CeilingPlanUnderlay floor={null} />)).toBe('');
    expect(renderToStaticMarkup(<CeilingPlanUnderlayLabels floor={null} />)).toBe('');
  });
});
