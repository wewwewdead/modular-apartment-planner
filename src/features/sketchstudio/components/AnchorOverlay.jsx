export default function AnchorOverlay({ anchors, activeAnchorId, onAnchorPointerDown }) {
  if (!anchors?.length) {
    return null;
  }

  return (
    <g className="sketchStudioAnchorLayer">
      {anchors.map((anchor) => {
        const isActive = anchor.id === activeAnchorId || anchor.kind === 'primary';
        return (
          <g key={anchor.id} className={`sketchStudioAnchorMarker ${isActive ? 'is-active' : ''}`}>
            <line x1={anchor.x - 10} y1={anchor.y} x2={anchor.x + 10} y2={anchor.y} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <line x1={anchor.x} y1={anchor.y - 10} x2={anchor.x} y2={anchor.y + 10} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <circle
              cx={anchor.x}
              cy={anchor.y}
              r={6}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => onAnchorPointerDown(anchor.id, event)}
            />
            <text x={anchor.x + 10} y={anchor.y - 12} className="sketchStudioAnchorLabel">
              {anchor.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}
