import { projectPartToView } from '../domain/viewProjection';

export default function AssemblyBoundingBoxRenderer({ assembly, parts, view, zoom, isSelected, isEditMode }) {
  // Filter to parts belonging to this assembly (non-dimension)
  const asmParts = parts.filter((p) => p.assemblyId === assembly.id && p.type !== 'dimension');
  if (asmParts.length === 0) return null;

  // Compute bounding rect from projected parts
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const part of asmParts) {
    const { svgX, svgY, svgWidth, svgHeight } = projectPartToView(part, view);
    if (svgX < minX) minX = svgX;
    if (svgY < minY) minY = svgY;
    if (svgX + svgWidth > maxX) maxX = svgX + svgWidth;
    if (svgY + svgHeight > maxY) maxY = svgY + svgHeight;
  }

  const pad = 8 / zoom;
  const x = minX - pad;
  const y = minY - pad;
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;

  const color = '#4682B4';

  let strokeDash;
  let strokeWidth;
  if (isEditMode) {
    strokeDash = `${3 / zoom} ${3 / zoom}`;
    strokeWidth = 1 / zoom;
  } else if (isSelected) {
    strokeDash = undefined;
    strokeWidth = 2 / zoom;
  } else {
    strokeDash = `${6 / zoom} ${4 / zoom}`;
    strokeWidth = 1.5 / zoom;
  }

  const fontSize = 12 / zoom;
  const labelY = y - 4 / zoom;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeDasharray={strokeDash}
        opacity={isSelected || isEditMode ? 1 : 0.6}
      />
      <text
        x={x}
        y={labelY}
        fill={color}
        fontSize={fontSize}
        fontFamily="var(--font-ui)"
        fontWeight={isSelected ? 700 : 500}
        opacity={isSelected || isEditMode ? 1 : 0.7}
      >
        {assembly.name}
      </text>
    </g>
  );
}
