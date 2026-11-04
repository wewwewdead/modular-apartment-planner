import { memo } from 'react';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { buildTrussDetailScene } from '@/geometry/trussGeometry';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';

function pointString(point) {
  return `${point.x},${-point.z}`;
}

// Hairline CAD weights (screen px, non-scaling): chords are the profile line,
// webs and studs the lighter frame line (memory wall-detail-dimension-rendering).
const CHORD_LINE = 1.1;
const WEB_LINE = 0.85;

function TrussDetailRenderer({ trussSystem, trussInstanceId = null, showTitle = true }) {
  const scene = buildTrussDetailScene(trussSystem, trussInstanceId);
  if (!scene) {
    return (
      <g className="truss-detail-empty">
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-secondary)"
          fontSize={180}
          fontFamily="var(--font-blueprint)"
        >
          Add a truss instance to view its detail.
        </text>
      </g>
    );
  }

  const titleX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const titleY = -scene.bounds.maxZ + 260;

  return (
    <g className="truss-detail">
      {showTitle && (
        <text
          x={titleX}
          y={titleY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={DRAWING_GRAPHICS.annotation.textMuted}
          fontSize={180}
          fontFamily="var(--font-blueprint)"
        >
          {scene.title}
        </text>
      )}
      {/* RT-3: every member drawn with its depth — two parallel edges — webs first so the chords read on top. */}
      {[...(scene.memberOutlines || [])]
        .sort((a, b) => (a.memberType === 'web' ? 0 : 1) - (b.memberType === 'web' ? 0 : 1))
        .map((outline) => (
          <polygon
            key={outline.id}
            data-member-type={outline.memberType}
            points={outline.points.map(pointString).join(' ')}
            fill={
              outline.memberType === 'web' ? DRAWING_GRAPHICS.section.projectionFill : DRAWING_GRAPHICS.section.cutFill
            }
            stroke={
              outline.memberType === 'web'
                ? DRAWING_GRAPHICS.section.projectionStroke
                : DRAWING_GRAPHICS.section.cutStroke
            }
            strokeWidth={outline.memberType === 'web' ? WEB_LINE : CHORD_LINE}
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {(scene.purlinMarkers || []).map((marker) => (
        <line
          key={marker.id}
          x1={marker.start.x}
          y1={-marker.start.z}
          x2={marker.end.x}
          y2={-marker.end.z}
          stroke={DRAWING_GRAPHICS.section.projectionStroke}
          strokeWidth={1.1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={scene.bounds.minX}
        y1={0}
        x2={scene.bounds.maxX}
        y2={0}
        stroke={DRAWING_GRAPHICS.section.groundStroke}
        strokeWidth={0.8}
        strokeDasharray={DRAWING_GRAPHICS.section.groundDash}
        vectorEffect="non-scaling-stroke"
      />
      <BlueprintAnnotationLayer
        dimensions={scene.dimensions || []}
        tags={[...(scene.tags || []), ...(scene.topChordTags || []), ...(scene.webTags || [])]}
        className="truss-detail-annotations"
      />
    </g>
  );
}

export default memo(TrussDetailRenderer);
