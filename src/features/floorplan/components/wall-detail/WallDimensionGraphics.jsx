import { deriveWallDimensionGeometry, formatWallDimensionValue } from '@/domain/wallDetailing';
import { deriveWallDimensionGuideSegment } from './wallDetailEditorGeometry';
import { mirrorAngleDegrees, wallLocalToSvg } from './wallDetailCanvasMath';
import styles from './WallDetailEditor.module.css';

/**
 * One dimension drawn to CAD convention, in the un-flipped SVG space both detail
 * editors share: `wallLocalToSvg` turns UV into drawing coordinates, so the text
 * stays upright whichever way the assembly's own frame runs.
 *
 * Every visual size comes from `unitPx` or from `vector-effect: non-scaling-stroke`,
 * so the whole figure holds its screen size at any zoom. Nothing changes weight
 * on hover or selection — state is colour and fill only — because a line that
 * thickened under the pointer would move the edge the drawing is measured
 * against.
 */
export function DimensionGraphic({
  dimension,
  view,
  selected,
  editable = false,
  showScrewGuide = false,
  unitPx = 1,
  handleRadius = 4.5,
  fontSize = null,
  title = null,
  onPointerDown,
  onStartHandlePointerDown,
  onEndHandlePointerDown,
}) {
  const geometry = deriveWallDimensionGeometry(dimension);
  const px = unitPx > 0 ? unitPx : 1;
  const labelOffset = fontSize ? fontSize * 0.62 : 10;
  const svgPoint = (point) => wallLocalToSvg(point, view);
  const textAngle = view.mirrorU ? mirrorAngleDegrees(geometry.angleDegrees) : geometry.angleDegrees;
  const witnessStart = svgPoint(geometry.witnessStart);
  const witnessEnd = svgPoint(geometry.witnessEnd);
  const dimensionStart = svgPoint(geometry.dimensionStart);
  const dimensionEnd = svgPoint(geometry.dimensionEnd);
  const textPoint = svgPoint(geometry.textPoint);
  const screwGuide = deriveWallDimensionGuideSegment(dimension);
  const screwGuideStart = svgPoint(screwGuide.start);
  const screwGuideEnd = svgPoint(screwGuide.end);
  const dimensionLength = Math.hypot(dimensionEnd.x - dimensionStart.x, dimensionEnd.y - dimensionStart.y);
  const direction =
    dimensionLength > 1e-6
      ? {
          x: (dimensionEnd.x - dimensionStart.x) / dimensionLength,
          y: (dimensionEnd.y - dimensionStart.y) / dimensionLength,
        }
      : { x: 1, y: 0 };
  // Architectural tick terminators: 45° slashes across the dimension line,
  // sized via unitPx so they hold the same screen size at every zoom level.
  const tickHalf = 4 * px;
  const tick = {
    x: (direction.x - direction.y) * Math.SQRT1_2 * tickHalf,
    y: (direction.x + direction.y) * Math.SQRT1_2 * tickHalf,
  };
  // Extension lines keep a small gap off the measured point and overshoot
  // slightly past the dimension line, so they read as annotation rather than
  // part of the construction linework.
  const witnessLine = (from, to) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-6) return null;
    const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const gap = Math.min(5 * px, length * 0.4);
    return {
      x1: from.x + along.x * gap,
      y1: from.y + along.y * gap,
      x2: to.x + along.x * 4 * px,
      y2: to.y + along.y * 4 * px,
    };
  };
  const witnessLines = [witnessLine(witnessStart, dimensionStart), witnessLine(witnessEnd, dimensionEnd)].filter(
    Boolean,
  );
  return (
    <g
      className={`${styles.wallDimension} ${selected ? styles.wallDimensionSelected : ''}`}
      data-source={dimension.source}
      data-movable={editable ? 'true' : 'false'}
      onPointerDown={onPointerDown}
    >
      {title ? <title>{title}</title> : null}
      {showScrewGuide ? (
        <>
          <line
            x1={screwGuideStart.x}
            y1={screwGuideStart.y}
            x2={screwGuideEnd.x}
            y2={screwGuideEnd.y}
            className={styles.dimensionScrewGuide}
            style={{ strokeDasharray: `${8 * px} ${6 * px}` }}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={screwGuideStart.x}
            cy={screwGuideStart.y}
            r={handleRadius * 0.8}
            className={styles.dimensionScrewGuidePoint}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={screwGuideEnd.x}
            cy={screwGuideEnd.y}
            r={handleRadius * 0.8}
            className={styles.dimensionScrewGuidePoint}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
      {witnessLines.map((line, index) => (
        <line
          key={`witness-${index}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          className={styles.dimensionWitness}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={dimensionStart.x}
        y1={dimensionStart.y}
        x2={dimensionEnd.x}
        y2={dimensionEnd.y}
        className={styles.dimensionHit}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={dimensionStart.x}
        y1={dimensionStart.y}
        x2={dimensionEnd.x}
        y2={dimensionEnd.y}
        className={styles.dimensionLine}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={dimensionStart.x - tick.x}
        y1={dimensionStart.y - tick.y}
        x2={dimensionStart.x + tick.x}
        y2={dimensionStart.y + tick.y}
        className={styles.dimensionTick}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={dimensionEnd.x - tick.x}
        y1={dimensionEnd.y - tick.y}
        x2={dimensionEnd.x + tick.x}
        y2={dimensionEnd.y + tick.y}
        className={styles.dimensionTick}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={textPoint.x}
        y={textPoint.y - labelOffset}
        className={styles.dimensionText}
        style={fontSize ? { fontSize, strokeWidth: 3 * px } : undefined}
        transform={`rotate(${textAngle} ${textPoint.x} ${textPoint.y - labelOffset})`}
      >
        {dimension.label}
      </text>
      {selected ? (
        <>
          <g
            className={`${styles.dimensionGrip} ${editable ? styles.dimensionGripEditable : ''}`}
            onPointerDown={editable ? onStartHandlePointerDown : undefined}
          >
            <circle
              cx={witnessStart.x}
              cy={witnessStart.y}
              r={handleRadius * 2.4}
              className={styles.dimensionGripHit}
            />
            <circle
              cx={witnessStart.x}
              cy={witnessStart.y}
              r={handleRadius}
              className={styles.dimensionGripDot}
              vectorEffect="non-scaling-stroke"
            />
          </g>
          <g
            className={`${styles.dimensionGrip} ${editable ? styles.dimensionGripEditable : ''}`}
            onPointerDown={editable ? onEndHandlePointerDown : undefined}
          >
            <circle cx={witnessEnd.x} cy={witnessEnd.y} r={handleRadius * 2.4} className={styles.dimensionGripHit} />
            <circle
              cx={witnessEnd.x}
              cy={witnessEnd.y}
              r={handleRadius}
              className={styles.dimensionGripDot}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </>
      ) : null}
    </g>
  );
}

/**
 * The cross-hair the measuring tool puts on the exact point it has acquired,
 * saying whether that point is locked to a piece of geometry or floating free.
 */
export function DimensionAcquisitionGraphic({ acquisition, view, precision, referenceLabel = '' }) {
  if (!acquisition?.point) return null;
  const radius = Math.max(1, acquisition.markerRadius || 10);
  const { x, y } = wallLocalToSvg(acquisition.point, view);
  const primary = acquisition.reference ? referenceLabel || 'Snapped' : 'Free point';
  const coords = `U ${formatWallDimensionValue(acquisition.point.u, precision)} · V ${formatWallDimensionValue(
    acquisition.point.v,
    precision,
  )}`;
  return (
    <g className={styles.dimensionAcquisition} data-snapped={acquisition.reference ? 'true' : 'false'}>
      <circle cx={x} cy={y} r={radius} vectorEffect="non-scaling-stroke" />
      <line x1={x - radius * 1.7} y1={y} x2={x + radius * 1.7} y2={y} vectorEffect="non-scaling-stroke" />
      <line x1={x} y1={y - radius * 1.7} x2={x} y2={y + radius * 1.7} vectorEffect="non-scaling-stroke" />
      <text
        x={x + radius * 1.9}
        y={y - radius * 3.1}
        style={{ fontSize: radius * 1.3 }}
        vectorEffect="non-scaling-stroke"
      >
        {primary}
      </text>
      <text
        x={x + radius * 1.9}
        y={y - radius * 1.5}
        className={styles.dimensionAcquisitionCoords}
        style={{ fontSize: radius * 1.05 }}
        vectorEffect="non-scaling-stroke"
      >
        {coords}
      </text>
    </g>
  );
}
