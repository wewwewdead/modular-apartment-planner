import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoofSystem } from '@/domain/roofModels';
import RoofDrainageRenderer from './RoofDrainageRenderer';

describe('RoofDrainageRenderer', () => {
  it('renders an explicit coordinated route from a modeled roof drain', () => {
    const roofSystem = createRoofSystem('Flat roof', {
      roofType: 'flat',
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 5000 },
        { x: 0, y: 5000 },
      ],
      drains: [
        {
          id: 'drain_1',
          position: { x: 3000, y: 2500 },
          diameter: 100,
          routePoints: [
            { x: 3000, y: 2500 },
            { x: 0, y: 2500 },
          ],
          outletRef: { kind: 'site_discharge', id: 'outlet', point: { x: 0, y: 2500 } },
        },
      ],
    });
    const html = renderToStaticMarkup(
      <svg>
        <RoofDrainageRenderer roofSystem={roofSystem} />
      </svg>,
    );
    expect(html).toContain('data-type="roof-drainage-route"');
    expect(html).toContain('data-drain-id="drain_1"');
    expect(html).toContain('RD');
  });
});
