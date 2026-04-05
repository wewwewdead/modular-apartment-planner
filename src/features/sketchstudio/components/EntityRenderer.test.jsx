import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EntityRenderer from './EntityRenderer';

describe('EntityRenderer', () => {
  it('renders broken-line entities with the dashed class', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <EntityRenderer
          entities={[
            {
              id: 'line-1',
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 100,
              y2: 0,
              visible: true,
              meta: { lineStyle: 'broken' },
            },
          ]}
          hoveredId={null}
          selectedIds={[]}
        />
      </svg>,
    );

    expect(markup).toContain('is-broken-line');
  });

  it('renders text entities as canvas labels', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <EntityRenderer
          entities={[
            {
              id: 'text-1',
              type: 'text',
              x: 120,
              y: 80,
              text: 'Desk A',
              fontSize: 120,
              rotation: 0,
              visible: true,
              meta: {},
            },
          ]}
          hoveredId={null}
          selectedIds={[]}
        />
      </svg>,
    );

    expect(markup).toContain('is-text');
    expect(markup).toContain('Desk A');
  });

  it('renders leader arrows for text entities when present', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <EntityRenderer
          entities={[
            {
              id: 'text-1',
              type: 'text',
              x: 120,
              y: 80,
              text: 'Desk A',
              fontSize: 120,
              rotation: 0,
              leader: { target: { x: 40, y: 180 } },
              visible: true,
              meta: {},
            },
          ]}
          hoveredId={null}
          selectedIds={[]}
        />
      </svg>,
    );

    expect(markup).toContain('sketchStudioEntityLeader');
    expect(markup).toContain('<line');
    expect(markup).toContain('<polygon');
  });
});
