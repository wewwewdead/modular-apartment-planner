function pointInRect(point, rect) {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  );
}

export function getViewportHandleRects(viewport, handleSize) {
  const size = handleSize;
  const midX = viewport.x + viewport.width / 2;
  const midY = viewport.y + viewport.height / 2;
  return {
    nw: { x: viewport.x - size / 2, y: viewport.y - size / 2, width: size, height: size },
    n: { x: midX - size / 2, y: viewport.y - size / 2, width: size, height: size },
    ne: { x: viewport.x + viewport.width - size / 2, y: viewport.y - size / 2, width: size, height: size },
    e: { x: viewport.x + viewport.width - size / 2, y: midY - size / 2, width: size, height: size },
    se: { x: viewport.x + viewport.width - size / 2, y: viewport.y + viewport.height - size / 2, width: size, height: size },
    s: { x: midX - size / 2, y: viewport.y + viewport.height - size / 2, width: size, height: size },
    sw: { x: viewport.x - size / 2, y: viewport.y + viewport.height - size / 2, width: size, height: size },
    w: { x: viewport.x - size / 2, y: midY - size / 2, width: size, height: size },
  };
}

export function hitTestViewportHandle(point, viewports, handleSize) {
  for (let index = viewports.length - 1; index >= 0; index -= 1) {
    const viewport = viewports[index];
    const handles = getViewportHandleRects(viewport, handleSize);
    for (const [key, rect] of Object.entries(handles)) {
      if (pointInRect(point, rect)) {
        return { viewportId: viewport.id, handle: key };
      }
    }
  }
  return null;
}

export function getViewportRotationHandle(viewport, handleSize) {
  const cx = viewport.x + viewport.width / 2;
  const stemLength = handleSize * 2.5;
  const radius = handleSize / 2;
  const stemY1 = viewport.y;
  const stemY2 = viewport.y - stemLength;
  const cy = stemY2 - radius;
  return { cx, cy, radius, stemX: cx, stemY1, stemY2 };
}

export function hitTestViewportRotationHandle(point, viewport, handleSize) {
  const { cx, cy, radius } = getViewportRotationHandle(viewport, handleSize);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return dx * dx + dy * dy <= (radius + handleSize * 0.3) * (radius + handleSize * 0.3);
}

export function hitTestViewport(point, viewports) {
  for (let index = viewports.length - 1; index >= 0; index -= 1) {
    const viewport = viewports[index];
    if (pointInRect(point, viewport)) {
      return viewport;
    }
  }
  return null;
}
