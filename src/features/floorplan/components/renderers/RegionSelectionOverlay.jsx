function rectShape(bounds) {
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(0, bounds.maxX - bounds.minX),
    height: Math.max(0, bounds.maxY - bounds.minY),
  };
}

function RegionRect({ bounds, committed }) {
  if (!bounds) return null;
  const rect = rectShape(bounds);
  if (rect.width <= 0 && rect.height <= 0) return null;

  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill={committed ? 'var(--color-selection-fill)' : 'rgba(13, 124, 102, 0.05)'}
      stroke="var(--color-selection)"
      strokeWidth={2}
      strokeDasharray={committed ? '10 6' : '8 5'}
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: 'none' }}
    />
  );
}

export default function RegionSelectionOverlay({ marqueeBounds, selectionBounds }) {
  if (!marqueeBounds && !selectionBounds) return null;

  return (
    <g className="region-selection" style={{ pointerEvents: 'none' }}>
      <RegionRect bounds={selectionBounds} committed />
      <RegionRect bounds={marqueeBounds} committed={false} />
    </g>
  );
}
