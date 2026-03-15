import { getSolidBounds, getSolidProjectionBounds } from './solidGeometry';

export const VIEWS = { TOP: 'top', FRONT: 'front', SIDE: 'side' };

export function getPartExtents(part) {
  switch (part.type) {
    case 'panel':
      return { width: part.width, depth: part.depth, height: part.thickness };
    case 'leg':
      return { width: part.width, depth: part.depth, height: part.height };
    case 'frame':
      return part.axis === 'y'
        ? { width: part.width, depth: part.length, height: part.height }
        : { width: part.length, depth: part.width, height: part.height };
    case 'solid': {
      const bounds = getSolidBounds(part);
      return {
        width: bounds.max.x - bounds.min.x,
        depth: bounds.max.y - bounds.min.y,
        height: bounds.max.z - bounds.min.z,
      };
    }
    case 'cutout':
      return { width: part.width, depth: part.depth, height: part.height || part.depth };
    case 'hole':
      return { width: part.diameter, depth: part.diameter, height: part.depth };
    default:
      return { width: 0, depth: 0, height: 0 };
  }
}

export function projectPartToView(part, view) {
  if (part.type === 'solid') {
    return getSolidProjectionBounds(part, view);
  }

  const ext = getPartExtents(part);
  const pos = part.position;

  switch (view) {
    case 'top':
      return { svgX: pos.x, svgY: pos.y, svgWidth: ext.width, svgHeight: ext.depth };
    case 'front':
      return { svgX: pos.x, svgY: -(pos.z + ext.height), svgWidth: ext.width, svgHeight: ext.height };
    case 'side':
      return { svgX: pos.y, svgY: -(pos.z + ext.height), svgWidth: ext.depth, svgHeight: ext.height };
    default:
      return { svgX: pos.x, svgY: pos.y, svgWidth: ext.width, svgHeight: ext.depth };
  }
}

export function viewToModelPosition(svgX, svgY, view, existingPosition = {}) {
  const pos = { x: existingPosition.x ?? 0, y: existingPosition.y ?? 0, z: existingPosition.z ?? 0 };

  switch (view) {
    case 'top':
      return { ...pos, x: svgX, y: svgY };
    case 'front':
      return { ...pos, x: svgX, z: -svgY };
    case 'side':
      return { ...pos, y: svgX, z: -svgY };
    default:
      return { ...pos, x: svgX, y: svgY };
  }
}

export function viewToModelExtents(svgW, svgH, view, partType) {
  const w = Math.abs(svgW);
  const h = Math.abs(svgH);

  switch (view) {
    case 'top':
      if (partType === 'panel') return { width: w, depth: h };
      if (partType === 'leg') return { width: w, depth: h };
      if (partType === 'frame') return { length: w, width: h };
      return { width: w, depth: h };
    case 'front':
      if (partType === 'panel') return { width: w, thickness: h };
      if (partType === 'leg') return { width: w, height: h };
      if (partType === 'frame') return { length: w, height: h, width: 40 };
      return { width: w, height: h };
    case 'side':
      if (partType === 'panel') return { depth: w, thickness: h };
      if (partType === 'leg') return { depth: w, height: h };
      if (partType === 'frame') return { width: w, height: h, length: 500 };
      return { depth: w, height: h };
    default:
      return { width: w, depth: h };
  }
}

export function getViewLabel(view) {
  switch (view) {
    case 'top': return 'Top (X\u2013Y)';
    case 'front': return 'Front (X\u2013Z)';
    case 'side': return 'Side (Y\u2013Z)';
    default: return view;
  }
}
