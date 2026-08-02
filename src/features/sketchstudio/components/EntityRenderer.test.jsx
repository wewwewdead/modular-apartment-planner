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

  it('renders placed fasteners as a drafting symbol keyed to the catalog hardware', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <EntityRenderer
          entities={[
            {
              id: 'feature-1',
              type: 'feature',
              featureType: 'hole',
              operation: 'subtract',
              shape: 'circle',
              cx: 100,
              cy: 50,
              diameter: 3,
              hardwareId: 'hw-screw-8-32',
              targetPartId: 'rect-1',
              visible: true,
              meta: {},
            },
          ]}
          hoveredId={null}
          selectedIds={['feature-1']}
        />
      </svg>,
    );

    expect(markup).toContain('is-fastener is-fastener-wood-screw');
    expect(markup).toContain('is-selected');
    // Pilot circle at the catalog pilot diameter, head footprint at the head
    // diameter, plus the two crosshair ticks.
    expect(markup).toContain('r="1.5"');
    expect(markup).toContain('r="4"');
    expect(markup).toContain('is-fastener-head');
    expect((markup.match(/is-fastener-tick/g) || []).length).toBe(2);
    expect((markup.match(/<line/g) || []).length).toBe(2);
  });

  it('leaves joinery-generated holes on the plain feature rendering', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <EntityRenderer
          entities={[
            {
              id: 'joinery-feature-1',
              type: 'feature',
              featureType: 'hole',
              operation: 'subtract',
              shape: 'circle',
              cx: 10,
              cy: 10,
              diameter: 8,
              visible: true,
              meta: { joineryGenerated: true, joinery: { fabrication: { hardware: { kind: 'dowel' } } } },
            },
          ]}
          hoveredId={null}
          selectedIds={[]}
        />
      </svg>,
    );

    expect(markup).toContain('is-feature is-hole');
    expect(markup).not.toContain('is-fastener');
    expect(markup).not.toContain('<line');
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
