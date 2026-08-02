import { memo } from 'react';

function pointsAttribute(points = []) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function selectionStroke(selected, normal) {
  return selected ? '#1677ff' : normal;
}

function WetCoreOverlay({
  plumbingSystem,
  electricalSystem,
  waterSystem,
  mechanicalSystem,
  egressSystem,
  floor,
  selectedId,
  selectedType,
}) {
  if (!floor) return null;
  const shafts = (plumbingSystem?.shafts || []).filter((shaft) => (shaft.servedFloorIds || []).includes(floor.id));
  const risers = (electricalSystem?.riserZones || []).filter((riser) =>
    (riser.servedFloorIds || []).includes(floor.id),
  );
  const drainageRoutes = (plumbingSystem?.drainageRoutes || []).filter((route) => route.floorId === floor.id);
  const exits = (egressSystem?.exits || []).filter((exit) => exit.floorId === floor.id);
  const routes = (egressSystem?.routes || []).filter((route) => route.floorId === floor.id);
  const panelZones = (electricalSystem?.panelZones || []).filter(
    (zone) => zone.floorId === floor.id || zone.servedFloorIds?.includes(floor.id),
  );
  const electricalPoints = (electricalSystem?.points || []).filter((entry) => entry.floorId === floor.id);
  const equipmentZones = [...(waterSystem?.equipmentZones || []), ...(mechanicalSystem?.outdoorUnitZones || [])].filter(
    (zone) => zone.floorId === floor.id || (zone.location === 'ground' && floor.level === 0),
  );
  if (
    !shafts.length &&
    !risers.length &&
    !drainageRoutes.length &&
    !exits.length &&
    !routes.length &&
    !panelZones.length &&
    !electricalPoints.length &&
    !equipmentZones.length
  )
    return null;

  return (
    <g data-layer="services-coordination" style={{ pointerEvents: 'none' }}>
      {shafts.map((shaft) => {
        const fixtures = (floor.fixtures || []).filter((fixture) => fixture.plumbingShaftId === shaft.id);
        const planningRadius = shaft.maxFixtureDistance + Math.max(shaft.width, shaft.depth) / 2;
        return (
          <g
            key={shaft.id}
            data-type="plumbing-shaft"
            data-shaft-id={shaft.id}
            data-selected={selectedType === 'plumbingShaft' && selectedId === shaft.id ? 'true' : undefined}
          >
            <circle
              cx={shaft.origin.x}
              cy={shaft.origin.y}
              r={planningRadius}
              fill="rgba(35, 132, 157, 0.035)"
              stroke="#23849d"
              strokeWidth="1"
              strokeDasharray="6 6"
              opacity="0.65"
              vectorEffect="non-scaling-stroke"
            />
            {fixtures.map((fixture) => (
              <line
                key={fixture.id}
                data-type="fixture-shaft-link"
                data-fixture-id={fixture.id}
                x1={fixture.x}
                y1={fixture.y}
                x2={shaft.origin.x}
                y2={shaft.origin.y}
                stroke="#23849d"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <rect
              x={shaft.origin.x - shaft.width / 2}
              y={shaft.origin.y - shaft.depth / 2}
              width={shaft.width}
              height={shaft.depth}
              fill="rgba(35, 132, 157, 0.2)"
              stroke={selectionStroke(selectedType === 'plumbingShaft' && selectedId === shaft.id, '#176578')}
              strokeWidth={selectedType === 'plumbingShaft' && selectedId === shaft.id ? 4 : 2}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={shaft.origin.x}
              y={shaft.origin.y + 65}
              fill="#176578"
              fontSize="180"
              fontWeight="700"
              textAnchor="middle"
            >
              WS
            </text>
          </g>
        );
      })}
      {risers.map((riser) => (
        <g
          key={riser.id}
          data-type="electrical-riser"
          data-riser-id={riser.id}
          data-selected={selectedType === 'electricalRiser' && selectedId === riser.id ? 'true' : undefined}
        >
          <rect
            x={riser.origin.x - riser.width / 2}
            y={riser.origin.y - riser.depth / 2}
            width={riser.width}
            height={riser.depth}
            fill="rgba(230, 160, 35, 0.2)"
            stroke={selectionStroke(selectedType === 'electricalRiser' && selectedId === riser.id, '#a76500')}
            strokeWidth={selectedType === 'electricalRiser' && selectedId === riser.id ? 4 : 2}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={riser.origin.x}
            y={riser.origin.y + 55}
            fill="#8b5700"
            fontSize="150"
            fontWeight="700"
            textAnchor="middle"
          >
            ER
          </text>
        </g>
      ))}
      {[...panelZones, ...equipmentZones].map((zone) => {
        const label =
          zone.kind === 'electrical_panel'
            ? 'EP'
            : zone.kind === 'water_tank'
              ? 'WT'
              : zone.kind === 'water_pump'
                ? 'WP'
                : 'AC';
        return (
          <g
            key={zone.id}
            data-type="equipment-zone"
            data-equipment-kind={zone.kind}
            data-zone-id={zone.id}
            data-selected={
              zone.kind === 'electrical_panel' && selectedType === 'electricalPanelZone' && selectedId === zone.id
                ? 'true'
                : undefined
            }
            transform={`rotate(${zone.rotation || 0} ${zone.origin.x} ${zone.origin.y})`}
          >
            <rect
              x={zone.origin.x - zone.width / 2}
              y={zone.origin.y - zone.depth / 2}
              width={zone.width}
              height={zone.depth}
              fill="rgba(121, 91, 166, 0.16)"
              stroke={selectionStroke(
                zone.kind === 'electrical_panel' && selectedType === 'electricalPanelZone' && selectedId === zone.id,
                '#7452a3',
              )}
              strokeWidth={
                zone.kind === 'electrical_panel' && selectedType === 'electricalPanelZone' && selectedId === zone.id
                  ? 4
                  : 2
              }
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={zone.origin.x}
              y={zone.origin.y + 55}
              fill="#5a3d82"
              fontSize="150"
              fontWeight="700"
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        );
      })}
      {electricalPoints.map((entry) => {
        const panel = panelZones.find((zone) => zone.id === entry.panelZoneId);
        return (
          <g key={entry.id} data-type="electrical-point" data-point-kind={entry.kind}>
            {panel && (
              <line
                x1={entry.position.x}
                y1={entry.position.y}
                x2={panel.origin.x}
                y2={panel.origin.y}
                stroke="#a76500"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <circle
              cx={entry.position.x}
              cy={entry.position.y}
              r="70"
              fill="#f8cf6b"
              stroke="#8b5700"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {drainageRoutes.map((route) => (
        <polyline
          key={route.id}
          data-type="drainage-route"
          data-route-id={route.id}
          points={pointsAttribute(route.points)}
          fill="none"
          stroke="#156f89"
          strokeWidth="3"
          strokeDasharray="10 5"
          markerEnd="url(#arrowhead)"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {routes.map((route) => (
        <polyline
          key={route.id}
          data-type="egress-route"
          data-route-id={route.id}
          points={pointsAttribute(route.points)}
          fill="none"
          stroke="#168148"
          strokeWidth="4"
          strokeDasharray="12 5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {exits.map((exit) => (
        <g key={exit.id} data-type="egress-exit" data-exit-id={exit.id}>
          <circle
            cx={exit.point.x}
            cy={exit.point.y}
            r="120"
            fill="#168148"
            stroke="#0b552e"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={exit.point.x}
            y={exit.point.y + 48}
            fill="#ffffff"
            fontSize="130"
            fontWeight="800"
            textAnchor="middle"
          >
            E
          </text>
        </g>
      ))}
    </g>
  );
}

export default memo(WetCoreOverlay);
