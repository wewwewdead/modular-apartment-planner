import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BuildingServiceProperties from './BuildingServiceProperties';

describe('BuildingServiceProperties', () => {
  it('shows the current service origin as exact editable coordinates', () => {
    const html = renderToStaticMarkup(
      <BuildingServiceProperties
        entity={{
          id: 'shaft_1',
          name: 'Wet shaft',
          origin: { x: 1250, y: 2750 },
          width: 600,
          depth: 800,
          servedFloorIds: ['ground'],
          maxFixtureDistance: 3000,
        }}
        serviceType="plumbingShaft"
        dispatch={() => {}}
        u={{ suffix: 'mm', step: (value) => value, toDisplay: (value) => value, fromDisplay: (value) => value }}
      />,
    );

    expect(html).toContain('Wet-service shaft');
    expect(html).toContain('value="1250"');
    expect(html).toContain('value="2750"');
    expect(html).toContain('Drag this footprint on the plan');
  });
});
