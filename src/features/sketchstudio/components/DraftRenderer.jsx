import { getArcPath } from '../utils/arcUtils';
import { buildDraftMeasurementAnnotations } from '../utils/draftMeasurementUtils';
import { getRectDraftPreviewPolygonPoints } from '../utils/draftPreviewUtils';
import { formatDimensionText, getDimensionGeometry, measureDistance } from '../utils/dimensionUtils';
import { getAngleDimensionGeometry, formatAngleText } from '../utils/angleUtils';
import { getTextMetrics, normalizeRectFromPoints } from '../utils/entityUtils';
import { getTextLeaderGeometry } from '../utils/textLeaderUtils';

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

  if (draftPreview.type === 'fillet-preview') {
    const { tangentPoint1, tangentPoint2, controlPoint, cornerPoint, radius } = draftPreview;

    // Corner-only highlight (geometry failed, e.g. radius too large)
    if (!tangentPoint1 || !tangentPoint2 || !controlPoint) {
      if (!cornerPoint) {
        return null;
      }

      return (
        <circle
          className="sketchStudioDraftEntity"
          cx={cornerPoint.x}
          cy={cornerPoint.y}
          r={8}
          fill="rgba(59, 130, 246, 0.15)"
          stroke="var(--color-accent, #3b82f6)"
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    const midX = (tangentPoint1.x + tangentPoint2.x) / 2;
    const midY = (tangentPoint1.y + tangentPoint2.y) / 2;
    const labelOffX = midX + (midX - controlPoint.x) * 0.3;
    const labelOffY = midY + (midY - controlPoint.y) * 0.3;

    return (
      <g>
        {cornerPoint && (
          <circle
            className="sketchStudioDraftEntity"
            cx={cornerPoint.x}
            cy={cornerPoint.y}
            r={8}
            fill="rgba(59, 130, 246, 0.15)"
            stroke="var(--color-accent, #3b82f6)"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          className="sketchStudioDraftEntity"
          d={`M ${tangentPoint1.x} ${tangentPoint1.y} Q ${controlPoint.x} ${controlPoint.y} ${tangentPoint2.x} ${tangentPoint2.y}`}
          fill="none"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle className="sketchStudioDraftEntity" cx={tangentPoint1.x} cy={tangentPoint1.y} r={4} vectorEffect="non-scaling-stroke" />
        <circle className="sketchStudioDraftEntity" cx={tangentPoint2.x} cy={tangentPoint2.y} r={4} vectorEffect="non-scaling-stroke" />
        {cornerPoint && (
          <>
            <line
              className="sketchStudioDraftEntity"
              x1={tangentPoint1.x} y1={tangentPoint1.y} x2={cornerPoint.x} y2={cornerPoint.y}
              strokeDasharray="4 2"
              opacity={0.4}
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="sketchStudioDraftEntity"
              x1={tangentPoint2.x} y1={tangentPoint2.y} x2={cornerPoint.x} y2={cornerPoint.y}
              strokeDasharray="4 2"
              opacity={0.4}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        <text
          className="sketchStudioDimensionDraftText"
          x={labelOffX}
          y={labelOffY}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          R{radius.toFixed(0)}
        </text>
      </g>
    );
  }

  if (draftPreview.type === 'feature') {
    return renderFeaturePreview(draftPreview);
  }

  if (draftPreview.type === 'text-leader') {
    const previewEntity = {
      x: draftPreview.x,
      y: draftPreview.y,
      text: draftPreview.text,
      fontSize: draftPreview.fontSize,
      rotation: draftPreview.rotation ?? 0,
      leader: {
        target: draftPreview.target,
      },
    };
    const leaderGeometry = getTextLeaderGeometry(previewEntity);
    const textMetrics = getTextMetrics(previewEntity);

    return (
      <g>
        {leaderGeometry ? (
          <>
            <line
              className="sketchStudioDraftLeader"
              x1={leaderGeometry.anchor.x}
              y1={leaderGeometry.anchor.y}
              x2={leaderGeometry.shaftEnd.x}
              y2={leaderGeometry.shaftEnd.y}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
            <polygon
              className="sketchStudioDraftLeaderHead"
              points={leaderGeometry.arrowHead.map((point) => `${point.x},${point.y}`).join(' ')}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </>
        ) : null}
        <rect
          className="sketchStudioDraftTextBox"
          x={draftPreview.x}
          y={draftPreview.y}
          width={textMetrics.width}
          height={textMetrics.height}
          rx={6}
          ry={6}
          vectorEffect="non-scaling-stroke"
        />
        <text
          className="sketchStudioDimensionDraftText"
          x={draftPreview.x}
          y={draftPreview.y}
          dominantBaseline="hanging"
        >
          {textMetrics.text}
        </text>
      </g>
    );
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

  if (draftPreview.type === 'dimension-guide' || draftPreview.type === 'angle-guide') {
    return (
      <g className="sketchStudioDraftLayer" pointerEvents="none">
        <line className="sketchStudioDraftEntity" x1={draftPreview.p1.x} y1={draftPreview.p1.y} x2={draftPreview.p2.x} y2={draftPreview.p2.y} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </g>
    );
  }

  if (draftPreview.type === 'angle-dimension') {
    const geometry = getAngleDimensionGeometry({
      vertex: draftPreview.vertex,
      p1: draftPreview.p1,
      p2: draftPreview.p2,
      arcRadius: draftPreview.arcRadius,
      isometricPlane: draftPreview.isometricPlane,
    });
    const text = formatAngleText(geometry.angleDeg);

    return (
      <g className="sketchStudioDimensionDraft" pointerEvents="none">
        <line className="sketchStudioDimensionDraftLine" {...geometry.ray1} vectorEffect="non-scaling-stroke" />
        <line className="sketchStudioDimensionDraftLine" {...geometry.ray2} vectorEffect="non-scaling-stroke" />
        <path className="sketchStudioDimensionDraftLine" d={geometry.arcPath} fill="none" vectorEffect="non-scaling-stroke" />
        <text className="sketchStudioDimensionDraftText" x={geometry.textPoint.x} y={geometry.textPoint.y} textAnchor="middle" dominantBaseline="middle">
          {text}
        </text>
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
