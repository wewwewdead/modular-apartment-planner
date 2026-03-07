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
  return {
    nw: { x: viewport.x - size / 2, y: viewport.y - size / 2, width: size, height: size },
    ne: { x: viewport.x + viewport.width - size / 2, y: viewport.y - size / 2, width: size, height: size },
    sw: { x: viewport.x - size / 2, y: viewport.y + viewport.height - size / 2, width: size, height: size },
    se: { x: viewport.x + viewport.width - size / 2, y: viewport.y + viewport.height - size / 2, width: size, height: size },
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

export function hitTestViewport(point, viewports) {
  for (let index = viewports.length - 1; index >= 0; index -= 1) {
    const viewport = viewports[index];
    if (pointInRect(point, viewport)) {
      return viewport;
    }
  }
  return null;
}
