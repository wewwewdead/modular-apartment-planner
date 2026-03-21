export default function SnapOverlay({ snap }) {
  if (!snap.point) {
    return null;
  }

  const markerClass = ['sketchStudioSnapMarker', snap.snapType ? `is-${snap.snapType}` : ''].filter(Boolean).join(' ');

  return (
    <g className="sketchStudioSnapOverlay" pointerEvents="none">
      <circle className={markerClass} cx={snap.point.x} cy={snap.point.y} r={5} vectorEffect="non-scaling-stroke" />
      <text className="sketchStudioSnapLabel" x={snap.point.x + 12} y={snap.point.y - 12} vectorEffect="non-scaling-stroke">
        {snap.snapType ?? snap.sourceType}
      </text>
    </g>
  );
}
