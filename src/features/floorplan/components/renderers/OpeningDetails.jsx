function OpeningDetails({ element, stroke }) {
  if (!['window', 'door'].includes(element.category)) return null;
  const width = element.right - element.left;
  const height = element.top - element.bottom;
  const actualWidth = element.actualWidth || width;
  const frame = Math.max(40, Math.min(actualWidth, height) * 0.06);
  const insetX = Math.min(width * 0.2, (frame * width) / actualWidth);
  const insetY = Math.min(height * 0.2, frame);
  const left = element.left + insetX;
  const right = element.right - insetX;
  const top = -element.top + insetY;
  const bottom = -element.bottom - insetY;
  const lines = [];
  if (element.category === 'window') {
    const type = element.openingType || 'standard';
    const horizontalFractions =
      type === 'standard'
        ? [1 / 3, 2 / 3]
        : type === 'awning'
          ? [0.3]
          : type === 'jalousie'
            ? [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
            : [];
    horizontalFractions.forEach((t) => lines.push([left, top + (bottom - top) * t, right, top + (bottom - top) * t]));
    if (type === 'casement' || type === 'sliding') lines.push([(left + right) / 2, top, (left + right) / 2, bottom]);
  } else if (element.openingType === 'double' || element.openingType === 'sliding') {
    lines.push([(left + right) / 2, top, (left + right) / 2, bottom]);
  }
  return (
    <g fill="none" stroke={stroke} strokeWidth={0.6}>
      <rect x={left} y={top} width={right - left} height={bottom - top} vectorEffect="non-scaling-stroke" />
      {lines.map(([x1, y1, x2, y2], index) => (
        <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

export default OpeningDetails;
