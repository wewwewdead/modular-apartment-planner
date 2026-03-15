import { getRailingRenderData } from '@/geometry/railingGeometry';

const RAILING_STYLES = {
  glass: {
    fill: 'rgba(100, 180, 255, 0.25)',
    stroke: '#4da6ff',
    strokeWidth: 1,
    strokeDasharray: 'none',
  },
  handrail: {
    fill: 'none',
    stroke: '#666',
    strokeWidth: 1.5,
    strokeDasharray: 'none',
  },
  guardrail: {
    fill: '#999',
    stroke: '#555',
    strokeWidth: 1.5,
    strokeDasharray: 'none',
  },
};

function getStyle(type) {
  return RAILING_STYLES[type] || RAILING_STYLES.guardrail;
}

export default function RailingRenderer({ railings }) {
  return (
    <g className="railings">
      {(railings || []).map((railing) => {
        const renderData = getRailingRenderData(railing);
        if (!renderData) return null;

        const style = getStyle(railing.type);
        const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');

        if (railing.type === 'handrail') {
          // Handrail: centerline + circles at ends
          return (
            <g key={railing.id} data-id={railing.id} data-type="railing">
              <polygon
                points={points}
                fill="none"
                stroke="none"
              />
              <line
                x1={renderData.start.x}
                y1={renderData.start.y}
                x2={renderData.end.x}
                y2={renderData.end.y}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={renderData.start.x}
                cy={renderData.start.y}
                r={railing.width / 2}
                fill="white"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={renderData.end.x}
                cy={renderData.end.y}
                r={railing.width / 2}
                fill="white"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        }

        return (
          <polygon
            key={railing.id}
            data-id={railing.id}
            data-type="railing"
            points={points}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
