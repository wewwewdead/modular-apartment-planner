import { memo, useId } from 'react';
import { getVisibleElevationDrawables } from '@/elevations/visibility';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';
import OpeningDetails from './OpeningDetails';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

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
  // The edge kit: fascia and barge boards are thin filled bands under the roof
  // silhouette; gutters and downpipes are drawn as line pairs.
  roofFascia: {
    fill: '#dfe4e9',
    stroke: DRAWING_GRAPHICS.elevation.accentStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth,
  },
  roofGutter: {
    fill: '#ffffff',
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
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
  // Gable-end infill (RT-2): the cladding that closes the gable triangle, drawn
  // like a wall face; its vent is an outline on it.
  gableInfill: {
    fill: DRAWING_GRAPHICS.elevation.fill,
    stroke: DRAWING_GRAPHICS.elevation.lineStroke,
    strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth,
  },
  gableVent: {
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

const PE = PRESENTATION_GRAPHICS.elevation;

/**
 * The presentation elevation: the white model the 3D preview renders, drawn
 * flat — warm white render, the frame a step darker, charcoal-framed glazing,
 * a dark timber door, thin dark rails. Everything not named keeps its drafting
 * paint.
 */
const PRESENTATION_STYLE_MAP = {
  ...STYLE_MAP,
  wall: { fill: PE.wallFill, stroke: PE.wallStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  gableInfill: { fill: PE.wallFill, stroke: PE.wallStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  slab: { fill: PE.accentFill, stroke: PE.accentStroke, strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth },
  column: { fill: PE.accentFill, stroke: PE.accentStroke, strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth },
  beam: { fill: PE.accentFill, stroke: PE.accentStroke, strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth },
  roof: { fill: PE.roofFill, stroke: PE.accentStroke, strokeWidth: DRAWING_GRAPHICS.elevation.accentStrokeWidth },
  stair: { fill: '#e6e8eb', stroke: PE.wallStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  door: { fill: PE.doorFill, stroke: PE.frameStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  window: { fill: PE.glazingFill, stroke: PE.frameStroke, strokeWidth: DRAWING_GRAPHICS.elevation.lineStrokeWidth },
  railingGuardrail: { fill: PE.railingStroke, stroke: PE.railingStroke, strokeWidth: 1 },
  railingHandrail: { fill: 'none', stroke: PE.railingStroke, strokeWidth: 1.2 },
  railingHandrailBand: { fill: 'none', stroke: PE.railingStroke, strokeWidth: 1.2 },
};

/**
 * The building's shadow on the backdrop: every wall shape pushed right by the
 * shadow offset, drawn beneath the drawing. Wherever the building itself stands
 * it covers its own shadow, so what is left is a crisp band down the side the
 * light is not on — geometry, not a blur, and no filter.
 */
function elevationShadowPath(drawables) {
  const dx = PE.shadowOffset;
  return drawables
    .filter((element) => element.style === 'wall' && element.shape !== 'line')
    .map((element) => {
      const points =
        element.shape === 'rect'
          ? [
              [element.left, -element.top],
              [element.right, -element.top],
              [element.right, -element.bottom],
              [element.left, -element.bottom],
            ]
          : (element.points || []).map((point) => [point.x, -point.z]);
      if (points.length < 3) return '';
      return `M${points.map(([x, y]) => `${x + dx},${y}`).join('L')}Z`;
    })
    .join('');
}

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

/**
 * `drawables`, when given, is the scene's visibility result already resolved
 * (the plan canvas runs that pass after paint, in slices); without it the pass
 * runs here, synchronously, as sheets and PDFs want.
 */
function ElevationSceneLayer({
  scene,
  annotationScene,
  showTitle = true,
  selectedId = null,
  selectedType = null,
  drawables: resolvedDrawables = null,
}) {
  const clipPrefix = useId();
  const presentation = isPresentationStyle(usePlanStyle());
  if (!scene) return null;

  const titleX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const titleY = -scene.bounds.maxZ - 500;
  const drawables = resolvedDrawables || getVisibleElevationDrawables(scene);
  const styles = presentation ? PRESENTATION_STYLE_MAP : STYLE_MAP;
  const hasGround = Number.isFinite(scene.groundLevel);

  return (
    <g className="elevation" data-elevation-style={presentation ? 'presentation' : undefined}>
      {showTitle && (
        <text
          x={titleX}
          y={titleY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={DRAWING_GRAPHICS.annotation.textMuted}
          fontSize={220}
          fontFamily={presentation ? 'var(--font-ui)' : 'var(--font-blueprint)'}
          fontWeight={presentation ? 700 : undefined}
          letterSpacing={presentation ? '0.06em' : undefined}
          style={{ pointerEvents: 'none' }}
        >
          {presentation ? String(scene.title || '').toUpperCase() : scene.title}
        </text>
      )}
      {presentation && hasGround ? (
        <rect
          data-elevation-ground=""
          x={scene.bounds.minX - 500}
          y={-scene.groundLevel}
          width={scene.bounds.maxX - scene.bounds.minX + 1000}
          height={PE.groundDepth}
          fill={PE.groundFill}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
      {presentation ? (
        <path
          data-elevation-shadow=""
          d={elevationShadowPath(drawables)}
          fill={PE.shadowFill}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
      {drawables.map((element, index) => {
        const style = styles[element.style] || styles.wall;
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
              <OpeningDetails element={element} stroke={stroke} presentation={presentation} />
            </g>
          </g>
        );
      })}
      {hasGround && (
        <line
          x1={scene.bounds.minX - 500}
          y1={-scene.groundLevel}
          x2={scene.bounds.maxX + 500}
          y2={-scene.groundLevel}
          stroke={presentation ? PE.groundStroke : DRAWING_GRAPHICS.elevation.groundStroke}
          strokeWidth={presentation ? 1 : 0.8}
          strokeDasharray={presentation ? undefined : DRAWING_GRAPHICS.elevation.groundDash}
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
