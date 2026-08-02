import { memo } from 'react';
import { deriveBuildableEnvelope } from '@/domain/siteModels';
import { parkingBayPolygon } from '@/domain/siteAccessModels';

function pointsAttribute(points) {
  return (points || []).map((point) => `${point.x},${point.y}`).join(' ');
}

function polygonBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function edgeLabel(entry) {
  const distance = entry?.distance;
  if (!Number.isFinite(distance)) return null;
  return `${entry.classification || 'setback'} ${(distance / 1000).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} m`;
}

function SitePlanOverlay({ site }) {
  const boundary = site?.boundary || [];
  const envelope = deriveBuildableEnvelope(site);
  if (boundary.length < 3) return null;

  const roadEdges = new Map((site.roadEdges || []).map((entry) => [entry.edgeIndex, entry]));
  const setbacks = new Map((site.edgeSetbacks || []).map((entry) => [entry.edgeIndex, entry]));
  const bounds = polygonBounds(boundary);
  const northOrigin = { x: bounds.minX + 700, y: bounds.minY - 700 };

  return (
    <g data-layer="site-plan" style={{ pointerEvents: 'none' }}>
      <polygon
        data-type="property-boundary"
        points={pointsAttribute(boundary)}
        fill="rgba(183, 145, 73, 0.06)"
        stroke="var(--color-text-secondary)"
        strokeWidth="1.4"
        strokeDasharray="8 4"
        vectorEffect="non-scaling-stroke"
      />

      {envelope.points.length >= 3 && (
        <polygon
          data-type="buildable-envelope"
          data-status={envelope.status}
          points={pointsAttribute(envelope.points)}
          fill="rgba(45, 95, 142, 0.08)"
          stroke="var(--color-active-glow)"
          strokeWidth="1.4"
          strokeDasharray="10 4"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {boundary.map((start, index) => {
        const end = boundary[(index + 1) % boundary.length];
        const road = roadEdges.get(index);
        const setback = setbacks.get(index);
        const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        return (
          <g key={`${start.x}:${start.y}:${index}`}>
            {road && (
              <>
                <line
                  data-type="road-frontage"
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="#2d7d5d"
                  strokeWidth="4"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={midpoint.x}
                  y={midpoint.y - 180}
                  fill="#2d7d5d"
                  fontSize="240"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {road.roadName || 'ROAD'}
                </text>
              </>
            )}
            {setback && (
              <text
                x={midpoint.x}
                y={midpoint.y + 260}
                fill="var(--color-text-secondary)"
                fontSize="190"
                textAnchor="middle"
              >
                {edgeLabel(setback)}
              </text>
            )}
          </g>
        );
      })}

      {(site.parkingPlan?.accessRoutes || []).map((route) => (
        <g key={route.id} data-type="vehicle-access-route" data-route-id={route.id}>
          <polyline
            points={pointsAttribute(route.points)}
            fill="none"
            stroke="rgba(86, 95, 110, 0.22)"
            strokeWidth={route.clearWidth}
          />
          <polyline
            points={pointsAttribute(route.points)}
            fill="none"
            stroke="#56606e"
            strokeWidth="2"
            strokeDasharray="14 8"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}

      {(site.parkingPlan?.bays || []).map((bay, index) => (
        <g key={bay.id} data-type="parking-bay" data-bay-id={bay.id}>
          <polygon
            points={pointsAttribute(parkingBayPolygon(bay))}
            fill="rgba(64, 111, 153, 0.10)"
            stroke="#406f99"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={bay.origin.x}
            y={bay.origin.y + 70}
            fill="#315a7d"
            fontSize="190"
            fontWeight="700"
            textAnchor="middle"
          >
            P{index + 1}
          </text>
        </g>
      ))}

      <g
        data-type="site-north-indicator"
        transform={`rotate(${site.northAngle || 0} ${northOrigin.x} ${northOrigin.y})`}
      >
        <line
          x1={northOrigin.x}
          y1={northOrigin.y + 300}
          x2={northOrigin.x}
          y2={northOrigin.y - 450}
          stroke="var(--color-text-primary)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M ${northOrigin.x} ${northOrigin.y - 600} L ${northOrigin.x - 130} ${northOrigin.y - 350} L ${northOrigin.x + 130} ${northOrigin.y - 350} Z`}
          fill="var(--color-text-primary)"
        />
        <text
          x={northOrigin.x}
          y={northOrigin.y - 720}
          fill="var(--color-text-primary)"
          fontSize="240"
          fontWeight="700"
          textAnchor="middle"
        >
          N
        </text>
      </g>
    </g>
  );
}

export default memo(SitePlanOverlay);
