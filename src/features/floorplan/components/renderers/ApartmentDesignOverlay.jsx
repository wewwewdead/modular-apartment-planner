import { memo } from 'react';

function ApartmentDesignOverlay({ apartmentDesign, profile, floor }) {
  if (!floor || apartmentDesign?.status !== 'detailed') return null;
  const probes = (floor.fixtures || []).filter((fixture) => fixture.generatedByApartmentDesignId);
  if (!probes.length) return null;
  return (
    <g data-layer="apartment-design-clearance" style={{ pointerEvents: 'none' }}>
      {probes.map((fixture) => {
        const clearance = profile?.fixtureClearances?.[fixture.fixtureType] ?? 300;
        return (
          <g
            key={fixture.id}
            data-type="fixture-clearance-probe"
            data-fixture-id={fixture.id}
            transform={`rotate(${fixture.rotation || 0} ${fixture.x} ${fixture.y})`}
          >
            <rect
              x={fixture.x - fixture.width / 2 - clearance}
              y={fixture.y - fixture.depth / 2 - clearance}
              width={fixture.width + clearance * 2}
              height={fixture.depth + clearance * 2}
              fill="rgba(137, 96, 183, 0.035)"
              stroke="#8960b7"
              strokeWidth="1.5"
              strokeDasharray="7 4"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
}

export default memo(ApartmentDesignOverlay);
