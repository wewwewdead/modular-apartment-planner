import { getArcPath } from '../utils/arcUtils';
import { buildDraftMeasurementAnnotations } from '../utils/draftMeasurementUtils';
import { getRectDraftPreviewPolygonPoints } from '../utils/draftPreviewUtils';
import { formatDimensionText, getDimensionGeometry, measureDistance } from '../utils/dimensionUtils';
import { normalizeRectFromPoints } from '../utils/entityUtils';

function renderFeaturePreview(draftPreview) {
  if (draftPreview.shape === 'circle') {
    return <circle className="sketchStudioDraftEntity is-feature" cx={draftPreview.cx} cy={draftPreview.cy} r={draftPreview.diameter / 2} vectorEffect="non-scaling-stroke" />;
  }

  if (draftPreview.shape === 'ellipse') {
    return (
      <ellipse
        className="sketchStudioDraftEntity is-feature"
        cx={draftPreview.cx}
        cy={draftPreview.cy}
        rx={draftPreview.rx}
        ry={draftPreview.ry}
        transform={`rotate(${draftPreview.rotation ?? 0} ${draftPreview.cx} ${draftPreview.cy})`}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (draftPreview.shape === 'polygon') {
    const points = (draftPreview.points || []).map((point) => `${point.x},${point.y}`).join(' ');
    return <polygon className="sketchStudioDraftEntity is-feature" points={points} vectorEffect="non-scaling-stroke" />;
  }

  const previewRect = normalizeRectFromPoints(draftPreview.startPoint, draftPreview.endPoint);
  return <rect className="sketchStudioDraftEntity is-feature" x={previewRect.x} y={previewRect.y} width={previewRect.width} height={previewRect.height} vectorEffect="non-scaling-stroke" />;
}

function renderGenericEntityPreview(draftPreview) {
  if (draftPreview.type === 'line') {
    return <line className="sketchStudioDraftEntity" x1={draftPreview.x1} y1={draftPreview.y1} x2={draftPreview.x2} y2={draftPreview.y2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
  }

  if (draftPreview.type === 'rect') {
    const points = getRectDraftPreviewPolygonPoints(draftPreview);

    if (!points?.length) {
      return null;
    }

    return (
      <polygon
        className="sketchStudioDraftEntity"
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (draftPreview.type === 'circle') {
    return <circle className="sketchStudioDraftEntity" cx={draftPreview.center.x} cy={draftPreview.center.y} r={draftPreview.radius} vectorEffect="non-scaling-stroke" />;
  }

  if (draftPreview.type === 'ellipse') {
    return (
      <ellipse
        className="sketchStudioDraftEntity"
        cx={draftPreview.cx}
        cy={draftPreview.cy}
        rx={draftPreview.rx}
        ry={draftPreview.ry}
        transform={`rotate(${draftPreview.rotation ?? 0} ${draftPreview.cx} ${draftPreview.cy})`}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (draftPreview.type === 'polyline') {
    const points = draftPreview.points.map((point) => `${point.x},${point.y}`).join(' ');
    if (draftPreview.closed) {
      return <polygon className="sketchStudioDraftEntity is-profile" points={points} vectorEffect="non-scaling-stroke" />;
    }

    return <polyline className="sketchStudioDraftEntity" points={points} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }

  if (draftPreview.type === 'arc') {
    return <path className="sketchStudioDraftEntity" d={getArcPath(draftPreview)} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" />;
  }

  if (draftPreview.type === 'feature') {
    return renderFeaturePreview(draftPreview);
  }

  return null;
}

export default function DraftRenderer({ draft, draftPreview, units, zoom }) {
  if (!draft.type || !draftPreview) {
    return null;
  }

  const draftMeasurementAnnotations = buildDraftMeasurementAnnotations({
    draft,
    draftPreview,
    units,
    zoom,
  });

  if (draftPreview.type === 'dimension-guide') {
    return (
      <g className="sketchStudioDraftLayer" pointerEvents="none">
        <line className="sketchStudioDraftEntity" x1={draftPreview.p1.x} y1={draftPreview.p1.y} x2={draftPreview.p2.x} y2={draftPreview.p2.y} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </g>
    );
  }

  if (draftPreview.type === 'dimension') {
    const geometry = getDimensionGeometry({
      p1: draftPreview.p1,
      p2: draftPreview.p2,
      subtype: draftPreview.subtype,
      offset: draftPreview.offset,
    });
    const text = formatDimensionText(measureDistance(draftPreview.p1, draftPreview.p2, draftPreview.subtype), units);

    return (
      <g className="sketchStudioDimensionDraft" pointerEvents="none">
        <line className="sketchStudioDimensionDraftLine" {...geometry.ext1} vectorEffect="non-scaling-stroke" />
        <line className="sketchStudioDimensionDraftLine" {...geometry.ext2} vectorEffect="non-scaling-stroke" />
        <line className="sketchStudioDimensionDraftLine" {...geometry.dimLine} vectorEffect="non-scaling-stroke" />
        <line className="sketchStudioDimensionDraftTick" {...geometry.tick1} vectorEffect="non-scaling-stroke" />
        <line className="sketchStudioDimensionDraftTick" {...geometry.tick2} vectorEffect="non-scaling-stroke" />
        <text className="sketchStudioDimensionDraftText" x={geometry.textPoint.x} y={geometry.textPoint.y} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${geometry.textAngle} ${geometry.textPoint.x} ${geometry.textPoint.y})`}>
          {text}
        </text>
      </g>
    );
  }

  return (
    <g className="sketchStudioDraftLayer" pointerEvents="none">
      {renderGenericEntityPreview(draftPreview)}
      {draftMeasurementAnnotations.map((annotation) => (
        <text
          key={annotation.id}
          className="sketchStudioDimensionDraftText"
          x={annotation.x}
          y={annotation.y}
          textAnchor={annotation.textAnchor || 'middle'}
          dominantBaseline="middle"
          transform={`rotate(${annotation.angle ?? 0} ${annotation.x} ${annotation.y})`}
        >
          {annotation.text}
        </text>
      ))}
    </g>
  );
}
