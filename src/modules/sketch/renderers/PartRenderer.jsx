import { projectPartToView } from '../domain/viewProjection';
import { projectSolidOutlineToView } from '../domain/solidGeometry';

export default function PartRenderer({ part, view, isSelected = false, zoom = 1, dimmed = false }) {
  const { svgX, svgY, svgWidth, svgHeight } = projectPartToView(part, view);
  const solidOutline = part.type === 'solid' ? projectSolidOutlineToView(part, view) : null;

  const isSubtractive = part.type === 'cutout' || part.type === 'hole';
  const fill = isSubtractive ? 'rgba(200, 200, 200, 0.3)' : (part.fill || 'none');
  const stroke = part.stroke || '#1E2433';
  const strokeDash = isSubtractive ? `${6 / zoom} ${4 / zoom}` : undefined;

  const isHoleInTop = part.type === 'hole' && view === 'top';

  return (
    <g data-part-id={part.id} opacity={dimmed ? 0.3 : 1}>
      {solidOutline?.length >= 3 ? (
        <polygon
          points={solidOutline.map((point) => `${point.x},${point.y}`).join(' ')}
          fill={fill}
          stroke={stroke}
          strokeWidth={part.strokeWidth || 2}
          vectorEffect="non-scaling-stroke"
        />
      ) : isHoleInTop ? (
        <ellipse
          cx={svgX + svgWidth / 2}
          cy={svgY + svgHeight / 2}
          rx={svgWidth / 2}
          ry={svgHeight / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={part.strokeWidth || 2}
          vectorEffect="non-scaling-stroke"
          strokeDasharray={strokeDash}
        />
      ) : (
        <rect
          x={svgX}
          y={svgY}
          width={svgWidth}
          height={svgHeight}
          fill={fill}
          stroke={stroke}
          strokeWidth={part.strokeWidth || 2}
          vectorEffect="non-scaling-stroke"
          strokeDasharray={strokeDash}
        />
      )}
      {isSelected && (
        <rect
          x={svgX - 4 / zoom}
          y={svgY - 4 / zoom}
          width={svgWidth + 8 / zoom}
          height={svgHeight + 8 / zoom}
          fill="none"
          stroke="var(--color-workspace-sketch, #B8860B)"
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}
