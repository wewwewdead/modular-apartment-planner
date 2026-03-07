import { rotate, midpoint, normalize, subtract, perpendicular, scale, add } from './point';

export function columnCenter(column) {
  return { x: column.x, y: column.y };
}

export function columnAxes(column) {
  const angle = ((column.rotation || 0) * Math.PI) / 180;
  const xAxis = { x: Math.cos(angle), y: Math.sin(angle) };
  const yAxis = { x: -Math.sin(angle), y: Math.cos(angle) };
  return { xAxis, yAxis };
}

export function columnOutline(column) {
  const hw = column.width / 2, hd = column.depth / 2;
  const { x: cx, y: cy } = column;
  const corners = [
    { x: cx - hw, y: cy - hd }, { x: cx + hw, y: cy - hd },
    { x: cx + hw, y: cy + hd }, { x: cx - hw, y: cy + hd },
  ];
  if (!column.rotation) return corners;
  return corners.map(p => rotate(p, { x: cx, y: cy }, column.rotation));
}

export function columnEdgeMidpoints(column) {
  const corners = columnOutline(column);
  return [
    midpoint(corners[0], corners[1]),
    midpoint(corners[1], corners[2]),
    midpoint(corners[2], corners[3]),
    midpoint(corners[3], corners[0]),
  ];
}

export function columnEdges(column) {
  const corners = columnOutline(column);
  return corners.map((c, i) => ({
    index: i,
    start: c,
    end: corners[(i + 1) % corners.length],
  }));
}

export function columnFaces(column) {
  return columnEdges(column).map((edge) => {
    const tangent = normalize(subtract(edge.end, edge.start));
    const inwardNormal = perpendicular(tangent);
    return {
      ...edge,
      midpoint: midpoint(edge.start, edge.end),
      tangent,
      outwardNormal: scale(inwardNormal, -1),
      length: Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y),
    };
  });
}

export function columnCenterlines(column) {
  const center = columnCenter(column);
  const { xAxis, yAxis } = columnAxes(column);

  return [
    {
      index: 0,
      axis: xAxis,
      halfLength: column.width / 2,
      start: add(center, scale(xAxis, -column.width / 2)),
      end: add(center, scale(xAxis, column.width / 2)),
    },
    {
      index: 1,
      axis: yAxis,
      halfLength: column.depth / 2,
      start: add(center, scale(yAxis, -column.depth / 2)),
      end: add(center, scale(yAxis, column.depth / 2)),
    },
  ];
}

export function columnSnapPoints(column) {
  return [
    { x: column.x, y: column.y },
    ...columnOutline(column),
    ...columnEdgeMidpoints(column),
  ];
}

export function columnWallSnapPoints(column) {
  return [
    ...columnOutline(column),
    ...columnEdgeMidpoints(column),
  ];
}
