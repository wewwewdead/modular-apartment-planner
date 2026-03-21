import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DimensionRenderer from './DimensionRenderer';

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
