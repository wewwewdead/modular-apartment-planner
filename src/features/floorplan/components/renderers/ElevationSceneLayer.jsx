import { memo, useId } from 'react';
import { getVisibleElevationDrawables } from '@/elevations/visibility';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';
import OpeningDetails from './OpeningDetails';

const STYLE_MAP = {
  wall: {
    fill: DRAWING_GRAPHICS.elevation.fill,
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  slab: {
    fill: DRAWING_GRAPHICS.elevation.accentFill,
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  roof: {
    fill: '#eef2f6',
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  roofEdge: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  roofRidge: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  roofHip: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
  },
  roofValley: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
  },
  column: {
    fill: DRAWING_GRAPHICS.elevation.accentFill,
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  beam: {
    fill: DRAWING_GRAPHICS.elevation.accentFill,
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  stair: {
    fill: '#fbfcfd',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  door: {
    fill: '#ffffff',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  window: {
    fill: '#edf3f7',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  roofOpening: {
    fill: '#ffffff',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  railingGuardrail: {
    fill: '#dfe5ea',
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  railingGlass: {
    fill: 'rgba(159, 196, 232, 0.22)',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  railingHandrail: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  railingHandrailBand: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  trussChord: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  trussPurlin: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  trussWeb: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
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

function polygonPoints(element) {
  return (element.points || []).map((point) => `${point.x},${-point.z}`).join(' ');
}

function regionPath(regions) {
  return regions
    .flatMap(({ outline, holes }) => [outline, ...holes])
    .map((ring) => `M${ring.map((p) => `${p.x},${p.y}`).join('L')}Z`)
    .join(' ');
}

function ElevationSceneLayer({ scene, annotationScene, showTitle = true, selectedId = null, selectedType = null }) {
  const clipPrefix = useId();
  if (!scene) return null;

  const titleX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const titleY = -scene.bounds.maxZ - 500;
  const drawables = getVisibleElevationDrawables(scene);

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
      {drawables.map((element, index) => {
        const style = STYLE_MAP[element.style] || STYLE_MAP.wall;
        const isSelected =
          (selectedType === 'trussInstance' && element.sourceId === selectedId) ||
          (selectedType === 'trussSystem' && element.systemId === selectedId) ||
          (element.category === selectedType && element.sourceId === selectedId);
        if (element.shape === 'line') {
          return (
            <path
              key={element.id}
              d={element.segments.map(([a, b]) => `M${a.x},${a.y}L${b.x},${b.y}`).join(' ')}
              fill="none"
              stroke={isSelected ? 'var(--color-selection)' : style.stroke}
              strokeWidth={isSelected ? 1.5 : style.strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const clipId = `${clipPrefix}-elevation-${index}`;
        const stroke = isSelected ? 'var(--color-selection)' : style.stroke;
        return (
          <g key={element.id} data-elevation-source={element.sourceId}>
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <path d={regionPath(element.visibleRegions)} clipRule="evenodd" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              <polygon
                points={element.shape === 'rect' ? rectPoints(element) : polygonPoints(element)}
                fill={style.fill}
                stroke={stroke}
                // The clip retains the inside half of the boundary stroke.
                strokeWidth={(isSelected ? 1.5 : style.strokeWidth) * 2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <OpeningDetails element={element} stroke={stroke} />
            </g>
          </g>
        );
      })}
      {Number.isFinite(scene.groundLevel) && (
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
      )}
      {annotationScene && (
        <BlueprintAnnotationLayer className="elevation-annotations" dimensions={annotationScene.dimensions} />
      )}
    </g>
  );
}

export default memo(ElevationSceneLayer);
