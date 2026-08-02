import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WetCoreOverlay from './WetCoreOverlay';

describe('WetCoreOverlay', () => {
  it('renders served shafts, planning distance, and explicit fixture links', () => {
    const html = renderToStaticMarkup(
      <svg>
        <WetCoreOverlay
          plumbingSystem={{
            shafts: [
              {
                id: 'shaft_1',
                origin: { x: 2000, y: 3000 },
                width: 600,
                depth: 800,
                maxFixtureDistance: 2500,
                servedFloorIds: ['ground'],
              },
            ],
          }}
          floor={{
            id: 'ground',
            fixtures: [{ id: 'toilet_1', fixtureType: 'toilet', x: 3000, y: 3000, plumbingShaftId: 'shaft_1' }],
          }}
        />
      </svg>,
    );
    expect(html).toContain('data-layer="services-coordination"');
    expect(html).toContain('data-type="plumbing-shaft"');
    expect(html).toContain('data-type="fixture-shaft-link"');
    expect(html).toContain('data-fixture-id="toilet_1"');
  });

  it('omits shafts that do not serve the active floor', () => {
    const html = renderToStaticMarkup(
      <svg>
        <WetCoreOverlay
          plumbingSystem={{
            shafts: [
              {
                id: 'shaft_1',
                origin: { x: 0, y: 0 },
                width: 600,
                depth: 600,
                maxFixtureDistance: 2000,
                servedFloorIds: ['upper'],
              },
            ],
          }}
          floor={{ id: 'ground', fixtures: [] }}
        />
      </svg>,
    );
    expect(html).not.toContain('data-layer="services-coordination"');
  });

  it('renders electrical, drainage, and egress relationships from one services model', () => {
    const html = renderToStaticMarkup(
      <svg>
        <WetCoreOverlay
          plumbingSystem={{
            shafts: [],
            drainageRoutes: [
              {
                id: 'drain_1',
                floorId: 'ground',
                points: [
                  { x: 0, y: 0 },
                  { x: 1000, y: 0 },
                ],
              },
            ],
          }}
          electricalSystem={{
            riserZones: [
              { id: 'riser_1', origin: { x: 500, y: 500 }, width: 400, depth: 400, servedFloorIds: ['ground'] },
            ],
          }}
          egressSystem={{
            exits: [{ id: 'exit_1', floorId: 'ground', point: { x: 2000, y: 1000 } }],
            routes: [
              {
                id: 'route_1',
                floorId: 'ground',
                points: [
                  { x: 100, y: 100 },
                  { x: 2000, y: 1000 },
                ],
              },
            ],
          }}
          floor={{ id: 'ground', fixtures: [] }}
        />
      </svg>,
    );
    expect(html).toContain('data-type="electrical-riser"');
    expect(html).toContain('data-type="drainage-route"');
    expect(html).toContain('data-type="egress-route"');
    expect(html).toContain('data-type="egress-exit"');
  });

  it('renders equipment reservations and point-to-panel relationships', () => {
    const html = renderToStaticMarkup(
      <svg>
        <WetCoreOverlay
          electricalSystem={{
            panelZones: [
              {
                id: 'panel_1',
                kind: 'electrical_panel',
                floorId: 'ground',
                origin: { x: 500, y: 500 },
                width: 600,
                depth: 600,
              },
            ],
            points: [
              {
                id: 'point_1',
                kind: 'outlet',
                floorId: 'ground',
                position: { x: 1500, y: 500 },
                panelZoneId: 'panel_1',
              },
            ],
          }}
          waterSystem={{
            equipmentZones: [
              {
                id: 'tank_1',
                kind: 'water_tank',
                location: 'ground',
                origin: { x: 2000, y: 2000 },
                width: 1000,
                depth: 1000,
              },
            ],
          }}
          mechanicalSystem={{
            outdoorUnitZones: [
              {
                id: 'ac_1',
                kind: 'ac_outdoor_zone',
                floorId: 'ground',
                origin: { x: 3000, y: 2000 },
                width: 1200,
                depth: 600,
              },
            ],
          }}
          floor={{ id: 'ground', level: 0, fixtures: [] }}
        />
      </svg>,
    );
    expect(html.match(/data-type="equipment-zone"/g)).toHaveLength(3);
    expect(html).toContain('data-type="electrical-point"');
    expect(html).toContain('data-point-kind="outlet"');
  });

  it('exposes selected service footprints for direct-manipulation feedback', () => {
    const html = renderToStaticMarkup(
      <svg>
        <WetCoreOverlay
          plumbingSystem={{
            shafts: [
              {
                id: 'shaft_1',
                origin: { x: 500, y: 500 },
                width: 600,
                depth: 600,
                maxFixtureDistance: 2000,
                servedFloorIds: ['ground'],
              },
            ],
          }}
          electricalSystem={{
            riserZones: [
              { id: 'riser_1', origin: { x: 1500, y: 500 }, width: 400, depth: 400, servedFloorIds: ['ground'] },
            ],
            panelZones: [
              {
                id: 'panel_1',
                kind: 'electrical_panel',
                floorId: 'ground',
                origin: { x: 2500, y: 500 },
                width: 600,
                depth: 300,
              },
            ],
          }}
          floor={{ id: 'ground', fixtures: [] }}
          selectedId="panel_1"
          selectedType="electricalPanelZone"
        />
      </svg>,
    );

    expect(html).toContain('data-zone-id="panel_1"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('stroke="#1677ff"');
  });
});
