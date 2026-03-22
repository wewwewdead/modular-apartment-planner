import { TOOLS } from '@/editor/tools';
import { FILLET_DEFAULT_RADIUS } from '@/domain/defaults';

export default function FilletPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.FILLET) return null;

  const corner = toolState.hoveredCorner;
  const geometry = toolState.previewGeometry;
  const radius = toolState.radius ?? FILLET_DEFAULT_RADIUS;

  if (!corner) return null;

  const { cornerPoint } = corner;

  // Always show a highlight on the hovered corner
  const elements = [
    <circle
      key="corner-highlight"
      cx={cornerPoint.x}
      cy={cornerPoint.y}
      r={80}
      fill="rgba(59, 130, 246, 0.15)"
      stroke="var(--color-selection)"
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: 'none' }}
    />,
  ];

  // If fillet geometry is valid, show the preview arc and trimmed portions
  if (geometry) {
    const { tangentPoint1, tangentPoint2, controlPoint } = geometry;

    // The proposed arc curve
    elements.push(
      <path
        key="arc-preview"
        d={`M ${tangentPoint1.x} ${tangentPoint1.y} Q ${controlPoint.x} ${controlPoint.y} ${tangentPoint2.x} ${tangentPoint2.y}`}
        fill="none"
        stroke="var(--color-selection)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
      />,
    );

    // Tangent point markers
    elements.push(
      <circle
        key="tp1"
        cx={tangentPoint1.x}
        cy={tangentPoint1.y}
        r={40}
        fill="var(--color-selection)"
        style={{ pointerEvents: 'none' }}
      />,
      <circle
        key="tp2"
        cx={tangentPoint2.x}
        cy={tangentPoint2.y}
        r={40}
        fill="var(--color-selection)"
        style={{ pointerEvents: 'none' }}
      />,
    );

    // Trimmed-away portions (dashed lines from tangent points to corner)
    elements.push(
      <line
        key="trim1"
        x1={tangentPoint1.x}
        y1={tangentPoint1.y}
        x2={cornerPoint.x}
        y2={cornerPoint.y}
        stroke="rgba(239, 68, 68, 0.5)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
      />,
      <line
        key="trim2"
        x1={tangentPoint2.x}
        y1={tangentPoint2.y}
        x2={cornerPoint.x}
        y2={cornerPoint.y}
        stroke="rgba(239, 68, 68, 0.5)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
      />,
    );

    // Radius label near the arc midpoint
    const midX = (tangentPoint1.x + tangentPoint2.x) / 2;
    const midY = (tangentPoint1.y + tangentPoint2.y) / 2;
    const labelOffX = (midX - controlPoint.x) * 0.3 + midX;
    const labelOffY = (midY - controlPoint.y) * 0.3 + midY;
    elements.push(
      <text
        key="radius-label"
        x={labelOffX}
        y={labelOffY}
        fontSize={120}
        fill="var(--color-selection)"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ pointerEvents: 'none' }}
      >
        R{radius}
      </text>,
    );
  }

  return <g className="fillet-preview">{elements}</g>;
}
