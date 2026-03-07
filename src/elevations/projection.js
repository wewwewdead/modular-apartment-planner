export const ELEVATION_VIEWS = {
  elevation_front: {
    key: 'elevation_front',
    label: 'Front Elevation',
    horizontalAxis: { x: 1, y: 0 },
    depthAxis: { x: 0, y: 1 },
  },
  elevation_rear: {
    key: 'elevation_rear',
    label: 'Rear Elevation',
    horizontalAxis: { x: -1, y: 0 },
    depthAxis: { x: 0, y: -1 },
  },
  elevation_left: {
    key: 'elevation_left',
    label: 'Left Elevation',
    horizontalAxis: { x: 0, y: 1 },
    depthAxis: { x: 1, y: 0 },
  },
  elevation_right: {
    key: 'elevation_right',
    label: 'Right Elevation',
    horizontalAxis: { x: 0, y: -1 },
    depthAxis: { x: -1, y: 0 },
  },
};

export function getElevationView(viewMode) {
  if (viewMode === 'elevation_side') return ELEVATION_VIEWS.elevation_left;
  return ELEVATION_VIEWS[viewMode] || ELEVATION_VIEWS.elevation_front;
}

export function projectElevationHorizontal(view, point) {
  return point.x * view.horizontalAxis.x + point.y * view.horizontalAxis.y;
}

export function projectElevationDepth(view, point) {
  return point.x * view.depthAxis.x + point.y * view.depthAxis.y;
}

export function projectPlanPoints(view, points = []) {
  if (!points.length) return null;

  const horizontals = points.map((point) => projectElevationHorizontal(view, point));
  const depths = points.map((point) => projectElevationDepth(view, point));

  return {
    left: Math.min(...horizontals),
    right: Math.max(...horizontals),
    depth: depths.reduce((sum, value) => sum + value, 0) / depths.length,
  };
}
