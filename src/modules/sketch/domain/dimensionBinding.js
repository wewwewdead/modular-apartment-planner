import { getPartExtents } from './viewProjection';

export function bindDimensionToPart(dimension, part, property) {
  const ext = getPartExtents(part);
  const pos = part.position;

  let startPoint, endPoint, boundAxis;

  switch (property) {
    case 'width':
      startPoint = { x: pos.x, y: pos.y, z: pos.z };
      endPoint = { x: pos.x + ext.width, y: pos.y, z: pos.z };
      boundAxis = 'x';
      break;
    case 'depth':
      startPoint = { x: pos.x, y: pos.y, z: pos.z };
      endPoint = { x: pos.x, y: pos.y + ext.depth, z: pos.z };
      boundAxis = 'y';
      break;
    case 'height':
    case 'thickness':
      startPoint = { x: pos.x, y: pos.y, z: pos.z };
      endPoint = { x: pos.x, y: pos.y, z: pos.z + ext.height };
      boundAxis = 'z';
      break;
    case 'length':
      // Frame length maps to width or depth depending on axis
      startPoint = { x: pos.x, y: pos.y, z: pos.z };
      endPoint = part.axis === 'y'
        ? { x: pos.x, y: pos.y + ext.depth, z: pos.z }
        : { x: pos.x + ext.width, y: pos.y, z: pos.z };
      boundAxis = part.axis === 'y' ? 'y' : 'x';
      break;
    case 'diameter':
      startPoint = { x: pos.x, y: pos.y, z: pos.z };
      endPoint = { x: pos.x + ext.width, y: pos.y, z: pos.z };
      boundAxis = 'x';
      break;
    default:
      return dimension;
  }

  return {
    ...dimension,
    startPoint,
    endPoint,
    boundPartId: part.id,
    boundProperty: property,
    boundAxis,
  };
}

export function updateBoundDimensionEndpoints(dimension, part) {
  if (!dimension.boundPartId || !dimension.boundProperty) return dimension;
  return bindDimensionToPart(dimension, part, dimension.boundProperty);
}

export function applyDimensionValueToPart(dimension, newMeasurement, part) {
  if (!dimension.boundProperty) return null;
  return {
    partId: part.id,
    changes: { [dimension.boundProperty]: newMeasurement },
  };
}
