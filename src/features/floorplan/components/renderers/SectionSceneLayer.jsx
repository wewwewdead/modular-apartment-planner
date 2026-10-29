import { memo, useId } from 'react';
import { getVisibleSectionDrawables } from '@/sections/visibility';
import OpeningDetails from './OpeningDetails';
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
  railing_cut: {
    fill: DRAWING_GRAPHICS.section.cutFill,
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: DRAWING_GRAPHICS.section.cutStrokeWidth,
    opacity: 1,
  },
  railing_projection: {
    fill: DRAWING_GRAPHICS.section.projectionFill,
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: DRAWING_GRAPHICS.section.projectionStrokeWidth,
    opacity: 1,
  },
  truss_cut: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.section.cutStroke,
    strokeWidth: 1.35,
    opacity: 1,
  },
  truss_projection: {
    fill: 'none',
    stroke: DRAWING_GRAPHICS.section.projectionStroke,
    strokeWidth: 0.9,
    opacity: 1,
  },
};

function outlinesPath(outlines) {
  return outlines.map((ring) => `M${ring.map((p) => `${p.x},${p.y}`).join('L')}Z`).join(' ');
}

function regionsPath(regions) {
  return outlinesPath(regions.flatMap(({ outline, holes }) => [outline, ...holes]));
}

function SectionSceneLayer({ scene, showTitle = true }) {
  const clipPrefix = useId();
  if (!scene) return null;
  const drawables = getVisibleSectionDrawables(scene);

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
      {drawables.map((element, index) => {
        const style =
          SECTION_STYLE_MAP[`${element.category}_${element.renderMode}`] ||
          SECTION_STYLE_MAP[`wall_${element.renderMode}`];
        if (element.shape === 'line') {
          return (
            <path
              key={element.id}
              d={element.segments.map(([a, b]) => `M${a.x},${a.y}L${b.x},${b.y}`).join(' ')}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const clipId = `${clipPrefix}-section-${index}`;
        return (
          <g key={element.id} data-section-source={element.sourceId} data-section-mode={element.renderMode}>
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <path d={regionsPath(element.visibleRegions)} clipRule="evenodd" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              <path
                d={regionsPath(element.visibleRegions)}
                fillRule="evenodd"
                fill={element.style === 'railingGlass' ? 'rgba(159, 196, 232, 0.22)' : style.fill}
                stroke="none"
              />
              <path
                d={outlinesPath(element.strokeOutlines || [element.outline])}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth * 2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {element.renderMode === 'projection' && <OpeningDetails element={element} stroke={style.stroke} />}
            </g>
          </g>
        );
      })}
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

export default memo(SectionSceneLayer);
