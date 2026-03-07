const STYLE_MAP = {
  wall_cut: { fill: '#cfd7e3', stroke: '#35465d', strokeWidth: 1.8, opacity: 1 },
  wall_projection: { fill: '#f7f8fa', stroke: '#7d8ca0', strokeWidth: 1, opacity: 0.7 },
  slab_cut: { fill: '#bcc7d6', stroke: '#35465d', strokeWidth: 1.8, opacity: 1 },
  slab_projection: { fill: '#dfe6ef', stroke: '#7d8ca0', strokeWidth: 1, opacity: 0.7 },
  column_cut: { fill: '#b9c1cb', stroke: '#35465d', strokeWidth: 1.8, opacity: 1 },
  column_projection: { fill: '#d7dde5', stroke: '#7d8ca0', strokeWidth: 1, opacity: 0.7 },
  beam_cut: { fill: '#b4c1d0', stroke: '#35465d', strokeWidth: 1.8, opacity: 1 },
  beam_projection: { fill: '#d8e0ea', stroke: '#7d8ca0', strokeWidth: 1, opacity: 0.7 },
  door_cut: { fill: '#ffffff', stroke: '#35465d', strokeWidth: 1.5, opacity: 1 },
  door_projection: { fill: '#ffffff', stroke: '#7d8ca0', strokeWidth: 1, opacity: 0.75 },
  window_cut: { fill: '#e6f3ff', stroke: '#35465d', strokeWidth: 1.5, opacity: 1 },
  window_projection: { fill: '#eef7ff', stroke: '#7d8ca0', strokeWidth: 1, opacity: 0.75 },
};

function rectPoints(element) {
  return [
    `${element.left},${-element.top}`,
    `${element.right},${-element.top}`,
    `${element.right},${-element.bottom}`,
    `${element.left},${-element.bottom}`,
  ].join(' ');
}

function stairPolylinePoints(element) {
  return element.points.map((point) => `${point.x},${-point.z}`).join(' ');
}

export default function SectionSceneLayer({ scene, showTitle = true }) {
  if (!scene) return null;

  const titleX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const titleY = -scene.bounds.maxZ - 500;

  return (
    <g className="section">
      {showTitle && (
        <text
          x={titleX}
          y={titleY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-secondary)"
          fontSize={220}
          fontFamily="var(--font-blueprint)"
          style={{ pointerEvents: 'none' }}
        >
          {scene.title}
        </text>
      )}
      {scene.rectElements.map((element) => {
        const style = STYLE_MAP[`${element.category}_${element.renderMode}`] || STYLE_MAP.wall_projection;
        return (
          <polygon
            key={element.id}
            points={rectPoints(element)}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            vectorEffect="non-scaling-stroke"
            opacity={style.opacity}
          />
        );
      })}
      {scene.stairElements.map((element) => (
        <polyline
          key={element.id}
          points={stairPolylinePoints(element)}
          fill="none"
          stroke={element.renderMode === 'cut' ? '#35465d' : '#7d8ca0'}
          strokeWidth={element.renderMode === 'cut' ? 1.8 : 1}
          vectorEffect="non-scaling-stroke"
          opacity={element.renderMode === 'cut' ? 1 : 0.75}
        />
      ))}
      <line
        x1={scene.bounds.minX - 500}
        y1={-scene.groundLevel}
        x2={scene.bounds.maxX + 500}
        y2={-scene.groundLevel}
        stroke="var(--color-text-secondary)"
        strokeWidth={1}
        strokeDasharray="10 6"
        vectorEffect="non-scaling-stroke"
        opacity={0.6}
      />
    </g>
  );
}
