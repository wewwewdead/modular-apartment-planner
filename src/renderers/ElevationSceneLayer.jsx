import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';

const STYLE_MAP = {
  wall: { fill: '#f7f8fa', stroke: '#4c5b70' },
  slab: { fill: '#d7dee8', stroke: '#4c5b70' },
  column: { fill: '#c2c8cf', stroke: '#4c5b70' },
  beam: { fill: '#b3c0cf', stroke: '#4c5b70' },
  stair: { fill: '#e4e8ef', stroke: '#4c5b70' },
  door: { fill: '#ffffff', stroke: '#4c5b70' },
  window: { fill: '#e6f3ff', stroke: '#4c5b70' },
};

function rectPoints(element) {
  return [
    `${element.left},${-element.top}`,
    `${element.right},${-element.top}`,
    `${element.right},${-element.bottom}`,
    `${element.left},${-element.bottom}`,
  ].join(' ');
}

export default function ElevationSceneLayer({ scene, annotationScene, showTitle = true, selectedId = null, selectedType = null }) {
  if (!scene) return null;

  const titleX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const titleY = -scene.bounds.maxZ - 500;

  return (
    <g className="elevation">
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
      {scene.elements.map((element) => {
        const style = STYLE_MAP[element.style] || STYLE_MAP.wall;
        const isSelected = element.category === selectedType && element.sourceId === selectedId;
        return (
          <polygon
            key={element.id}
            points={rectPoints(element)}
            fill={style.fill}
            stroke={isSelected ? 'var(--color-selection)' : style.stroke}
            strokeWidth={isSelected ? 2 : 1}
            vectorEffect="non-scaling-stroke"
            opacity={isSelected ? 0.95 : 1}
          />
        );
      })}
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
      {annotationScene && (
        <BlueprintAnnotationLayer
          className="elevation-annotations"
          dimensions={annotationScene.dimensions}
        />
      )}
    </g>
  );
}
