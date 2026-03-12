import { DRAWING_GRAPHICS } from '@/sheets/standards';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';

const STYLE_MAP = {
  wall: { fill: DRAWING_GRAPHICS.elevation.fill, stroke: DRAWING_GRAPHICS.elevation.lineStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  slab: { fill: DRAWING_GRAPHICS.elevation.accentFill, stroke: DRAWING_GRAPHICS.elevation.accentStroke, strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth },
  column: { fill: DRAWING_GRAPHICS.elevation.accentFill, stroke: DRAWING_GRAPHICS.elevation.accentStroke, strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth },
  beam: { fill: DRAWING_GRAPHICS.elevation.accentFill, stroke: DRAWING_GRAPHICS.elevation.accentStroke, strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth },
  stair: { fill: '#fbfcfd', stroke: DRAWING_GRAPHICS.elevation.lineStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  door: { fill: '#ffffff', stroke: DRAWING_GRAPHICS.elevation.lineStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  window: { fill: '#ffffff', stroke: DRAWING_GRAPHICS.elevation.lineStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  roofOpening: { fill: '#ffffff', stroke: DRAWING_GRAPHICS.elevation.lineStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
};

function rectPoints(element) {
  return [
    `${element.left},${-element.top}`,
    `${element.right},${-element.top}`,
    `${element.right},${-element.bottom}`,
    `${element.left},${-element.bottom}`,
  ].join(' ');
}

function polygonPoints(element) {
  return (element.points || []).map((point) => `${point.x},${-point.z}`).join(' ');
}

export default function ElevationSceneLayer({ scene, annotationScene, showTitle = true, selectedId = null, selectedType = null }) {
  if (!scene) return null;

  const titleX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const titleY = -scene.bounds.maxZ - 500;
  const drawables = [
    ...scene.elements.map((element) => ({ shape: 'rect', ...element })),
    ...(scene.polygonElements || []).map((element) => ({ shape: 'polygon', ...element })),
  ].sort((a, b) => b.depth - a.depth);

  return (
    <g className="elevation">
      {showTitle && (
        <text
          x={titleX}
          y={titleY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={DRAWING_GRAPHICS.annotation.textMuted}
          fontSize={220}
          fontFamily="var(--font-blueprint)"
          style={{ pointerEvents: 'none' }}
        >
          {scene.title}
        </text>
      )}
      {drawables.map((element) => {
        const style = STYLE_MAP[element.style] || STYLE_MAP.wall;
        const isSelected = element.category === selectedType && element.sourceId === selectedId;
        return element.shape === 'rect'
          ? (
            <polygon
              key={element.id}
              points={rectPoints(element)}
              fill={style.fill}
              stroke={isSelected ? 'var(--color-selection)' : style.stroke}
              strokeWidth={isSelected ? 1.5 : style.strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          )
          : (
            <polygon
              key={element.id}
              points={polygonPoints(element)}
              fill={style.fill}
              stroke={isSelected ? 'var(--color-selection)' : style.stroke}
              strokeWidth={isSelected ? 1.5 : style.strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          );
      })}
      <line
        x1={scene.bounds.minX - 500}
        y1={-scene.groundLevel}
        x2={scene.bounds.maxX + 500}
        y2={-scene.groundLevel}
        stroke={DRAWING_GRAPHICS.elevation.groundStroke}
        strokeWidth={0.8}
        strokeDasharray={DRAWING_GRAPHICS.elevation.groundDash}
        vectorEffect="non-scaling-stroke"
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
