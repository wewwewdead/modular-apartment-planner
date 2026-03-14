import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { buildTrussDetailScene } from '@/geometry/trussGeometry';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';

function pointString(point) {
  return `${point.x},${-point.z}`;
}

export default function TrussDetailRenderer({ trussSystem, trussInstanceId = null, showTitle = true }) {
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
  const profile = scene.instanceGeometry;

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
      <polyline
        points={profile.roofOutline.map(pointString).join(' ')}
        fill="none"
        stroke={DRAWING_GRAPHICS.section.cutStroke}
        strokeWidth={1.8}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={profile.bottomOutline.map(pointString).join(' ')}
        fill="none"
        stroke={DRAWING_GRAPHICS.section.cutStroke}
        strokeWidth={1.3}
        vectorEffect="non-scaling-stroke"
      />
      {scene.lineSegments.map((segment) => (
        <line
          key={segment.id}
          x1={segment.start.x}
          y1={-segment.start.z}
          x2={segment.end.x}
          y2={-segment.end.z}
          stroke={segment.memberType === 'web'
            ? DRAWING_GRAPHICS.section.projectionStroke
            : DRAWING_GRAPHICS.section.cutStroke}
          strokeWidth={segment.memberType === 'web' ? 0.95 : 1.45}
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
