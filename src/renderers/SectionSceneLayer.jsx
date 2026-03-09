import { DRAWING_GRAPHICS } from '@/sheets/standards';

const SECTION_STYLE_MAP = {
  wall_cut: {
    fill: DRAWING_GRAPHICS.section.cutFill,
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: DRAWING_GRAPHICS.section.cutStrokeWidth,
    opacity: 1,
  },
  wall_projection: {
    fill: DRAWING_GRAPHICS.section.projectionFill,
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
    opacity: 1,
  },
  slab_cut: {
    fill: DRAWING_GRAPHICS.section.cutFill,
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: DRAWING_GRAPHICS.section.cutStrokeWidth,
    opacity: 1,
  },
  slab_projection: {
    fill: DRAWING_GRAPHICS.section.projectionFill,
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
    opacity: 1,
  },
  column_cut: {
    fill: DRAWING_GRAPHICS.section.cutFill,
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: DRAWING_GRAPHICS.section.cutStrokeWidth,
    opacity: 1,
  },
  column_projection: {
    fill: DRAWING_GRAPHICS.section.projectionFill,
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
    opacity: 1,
  },
  beam_cut: {
    fill: DRAWING_GRAPHICS.section.cutFill,
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: DRAWING_GRAPHICS.section.cutStrokeWidth,
    opacity: 1,
  },
  beam_projection: {
    fill: DRAWING_GRAPHICS.section.projectionFill,
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
    opacity: 1,
  },
  door_cut: {
    fill: '#ffffff',
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: 1.15,
    opacity: 1,
  },
  door_projection: {
    fill: '#ffffff',
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: 0.82,
    opacity: 1,
  },
  window_cut: {
    fill: '#ffffff',
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: 1.15,
    opacity: 1,
  },
  window_projection: {
    fill: '#ffffff',
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: 0.82,
    opacity: 1,
  },
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
          fill={DRAWING_GRAPHICS.annotation.textMuted}
          fontSize={220}
          fontFamily="var(--font-blueprint)"
          style={{ pointerEvents: 'none' }}
        >
          {scene.title}
        </text>
      )}
      {scene.rectElements.map((element) => {
        const style = SECTION_STYLE_MAP[`${element.category}_${element.renderMode}`] || SECTION_STYLE_MAP.wall_projection;
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
          stroke={element.renderMode === 'cut'
            ? DRAWING_GRAPHICS.section.cutStroke
            : DRAWING_GRAPHICS.section.projectionStroke}
          strokeWidth={element.renderMode === 'cut'
            ? DRAWING_GRAPHICS.section.cutStrokeWidth
            : DRAWING_GRAPHICS.section.projectionStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={scene.bounds.minX - 500}
        y1={-scene.groundLevel}
        x2={scene.bounds.maxX + 500}
        y2={-scene.groundLevel}
        stroke={DRAWING_GRAPHICS.section.groundStroke}
        strokeWidth={0.8}
        strokeDasharray={DRAWING_GRAPHICS.section.groundDash}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
