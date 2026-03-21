export default function TransformOverlay({ bounds, onTransformPointerDown, selectedCount, zoom = 1 }) {
  if (!bounds) {
    return null;
  }

  const MIN_SIZE = 10;
  const rawWidth = bounds.maxX - bounds.minX;
  const rawHeight = bounds.maxY - bounds.minY;
  const width = Math.max(rawWidth, MIN_SIZE);
  const height = Math.max(rawHeight, MIN_SIZE);
  const centerX = bounds.minX + rawWidth / 2;
  const centerY = bounds.minY + rawHeight / 2;
  const displayMinX = centerX - width / 2;
  const displayMinY = centerY - height / 2;
  const pivot = {
    x: centerX,
    y: centerY,
  };
  const handleOffset = 28 / (zoom || 1);
  const rotateHandle = {
    x: pivot.x,
    y: displayMinY - handleOffset,
  };

  return (
    <g className="sketchStudioTransformOverlay">
      <rect
        className="sketchStudioTransformBounds"
        x={displayMinX}
        y={displayMinY}
        width={width}
        height={height}
        vectorEffect="non-scaling-stroke"
        onPointerDown={(event) => onTransformPointerDown('move', event, { pivot })}
      />
      <line
        className="sketchStudioTransformStem"
        x1={pivot.x}
        y1={displayMinY}
        x2={rotateHandle.x}
        y2={rotateHandle.y}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <circle
        className="sketchStudioTransformHandle"
        cx={rotateHandle.x}
        cy={rotateHandle.y}
        r={7}
        vectorEffect="non-scaling-stroke"
        onPointerDown={(event) => onTransformPointerDown('rotate', event, { pivot })}
      />
      <circle
        className="sketchStudioTransformPivot"
        cx={pivot.x}
        cy={pivot.y}
        r={4}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {selectedCount > 1 ? (
        <text className="sketchStudioSelectionLabel" x={displayMinX} y={displayMinY - 10 / (zoom || 1)}>
          {selectedCount} selected
        </text>
      ) : null}
    </g>
  );
}
