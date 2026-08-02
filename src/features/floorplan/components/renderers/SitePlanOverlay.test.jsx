import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SitePlanOverlay from './SitePlanOverlay';

describe('SitePlanOverlay', () => {
  it('renders the property, derived envelope, road frontage, setbacks, and north indicator', () => {
    const html = renderToStaticMarkup(
      <svg>
        <SitePlanOverlay
          site={{
            boundary: [
              { x: 0, y: 0 },
              { x: 10000, y: 0 },
              { x: 10000, y: 20000 },
              { x: 0, y: 20000 },
            ],
            northAngle: 15,
            roadEdges: [{ edgeIndex: 0, roadName: 'Barangay Road' }],
            edgeSetbacks: [
              { edgeIndex: 0, distance: 3000, classification: 'front' },
              { edgeIndex: 1, distance: 1000, classification: 'left' },
              { edgeIndex: 2, distance: 2000, classification: 'rear' },
              { edgeIndex: 3, distance: 1000, classification: 'right' },
            ],
            parkingPlan: {
              bays: [{ id: 'bay_1', origin: { x: 7000, y: 3000 }, width: 2500, length: 5000, angle: 0 }],
              accessRoutes: [
                {
                  id: 'access_1',
                  points: [
                    { x: 7000, y: 0 },
                    { x: 7000, y: 3000 },
                  ],
                  clearWidth: 3000,
                },
              ],
            },
          }}
        />
      </svg>,
    );

    expect(html).toContain('data-type="property-boundary"');
    expect(html).toContain('data-type="buildable-envelope"');
    expect(html).toContain('data-type="road-frontage"');
    expect(html).toContain('Barangay Road');
    expect(html).toContain('front 3 m');
    expect(html).toContain('data-type="site-north-indicator"');
    expect(html).toContain('data-type="parking-bay"');
    expect(html).toContain('data-type="vehicle-access-route"');
    expect(html).toContain('rotate(15');
  });

  it('renders nothing before a valid boundary exists', () => {
    const html = renderToStaticMarkup(
      <svg>
        <SitePlanOverlay site={{ boundary: [] }} />
      </svg>,
    );
    expect(html).not.toContain('data-layer="site-plan"');
  });
});
