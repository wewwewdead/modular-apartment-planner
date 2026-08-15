import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DimensionRenderer from './DimensionRenderer';

function createDimension(overrides = {}) {
  return {
    id: 'dim-1',
    type: 'dimension',
    subtype: 'horizontal',
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    offset: 20,
    units: 'mm',
    visible: true,
    meta: {},
    ...overrides,
  };
}

function createAngleDimension(overrides = {}) {
  return {
    id: 'ang-1',
    type: 'angle-dimension',
    vertex: { x: 0, y: 0 },
    p1: { x: 100, y: 0 },
    p2: { x: 0, y: 100 },
    arcRadius: 50,
    visible: true,
    meta: {},
    ...overrides,
  };
}

function renderDimensions(entities) {
  return renderToStaticMarkup(
    <svg>
      <DimensionRenderer entities={entities} allEntities={[]} hoveredId={null} selectedIds={[]} />
    </svg>,
  );
}

/**
 * Dimensions MEASURE geometry — they never drive it. These are the structural
 * assertions that pin the emitted markup: exactly the two extension lines, the
 * dimension line, the two ticks and the text, with no extra element of any kind.
 * Every stored sketch and every export depends on it.
 */
describe('reference dimension markup', () => {
  it('emits exactly the extension lines, dimension line, ticks and text', () => {
    const markup = renderDimensions([createDimension()]);

    expect(markup.match(/<rect/g)).toBeNull();
    expect(markup.match(/<line/g)).toHaveLength(5);
    expect(markup.match(/<text/g)).toHaveLength(1);
  });

  it('ignores driving fields left over in a pre-removal document', () => {
    expect(renderDimensions([createDimension({ driving: true, drivingValue: 250 })])).toBe(
      renderDimensions([createDimension()]),
    );
  });

  it('emits an angle dimension with no extra element and reports the angle', () => {
    const markup = renderDimensions([createAngleDimension()]);

    expect(markup.match(/<rect/g)).toBeNull();
    expect(markup).toContain('90');
  });

  it('ignores driving fields on an angle dimension too', () => {
    expect(renderDimensions([createAngleDimension({ driving: true, drivingValue: 30 })])).toBe(
      renderDimensions([createAngleDimension()]),
    );
  });
});

describe('DimensionRenderer', () => {
  it('renders broken-line dimensions with the dashed class', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <DimensionRenderer
          entities={[
            {
              id: 'dim-1',
              type: 'dimension',
              p1: { x: 0, y: 0 },
              p2: { x: 100, y: 0 },
              subtype: 'horizontal',
              offset: 20,
              units: 'mm',
              visible: true,
              meta: { lineStyle: 'broken' },
            },
          ]}
          allEntities={[]}
          hoveredId={null}
          selectedIds={[]}
        />
      </svg>,
    );

    expect(markup).toContain('is-broken-line');
  });
});
