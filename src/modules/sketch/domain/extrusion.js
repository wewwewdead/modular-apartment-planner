/**
 * Extrusion computation - pure functions for push/pull.
 * Creates new part specs from face + distance.
 */

import { generateId } from '@/domain/ids';
import { getPartDimensions } from './partGeometry';

/**
 * Compute a new part extruded from a face of an existing part.
 *
 * @param {Object} part - The source part
 * @param {string} faceId - Face ID ('+x', '-x', '+y', '-y', '+z', '-z')
 * @param {number} distance - Extrusion distance in mm (positive = outward)
 * @returns {{ partOverrides: Object, constraint: Object }} New part overrides + constraint config
 */
export function computeExtrusionFromFace(part, faceId, distance) {
  const dims = getPartDimensions(part);
  const absDist = Math.abs(distance);
  if (absDist < 1) return null;

  const pos = { ...part.position };
  let newWidth, newDepth, newThickness;

  switch (faceId) {
    case '+z': // top face - extrude upward
      newWidth = dims.width;
      newDepth = dims.depth;
      newThickness = absDist;
      pos.z = part.position.z + dims.height;
      break;
    case '-z': // bottom face - extrude downward
      newWidth = dims.width;
      newDepth = dims.depth;
      newThickness = absDist;
      pos.z = part.position.z - absDist;
      break;
    case '+x': // right face - extrude right
      newWidth = absDist;
      newDepth = dims.depth;
      newThickness = dims.height;
      pos.x = part.position.x + dims.width;
      break;
    case '-x': // left face - extrude left
      newWidth = absDist;
      newDepth = dims.depth;
      newThickness = dims.height;
      pos.x = part.position.x - absDist;
      break;
    case '+y': // back face - extrude back
      newWidth = dims.width;
      newDepth = absDist;
      newThickness = dims.height;
      pos.y = part.position.y + dims.depth;
      break;
    case '-y': // front face - extrude front
      newWidth = dims.width;
      newDepth = absDist;
      newThickness = dims.height;
      pos.y = part.position.y - absDist;
      break;
    default:
      return null;
  }

  // Determine anchor mapping for constraint
  const anchorMap = {
    '+z': { sourceAnchor: 'bottom', targetAnchor: 'top' },
    '-z': { sourceAnchor: 'top', targetAnchor: 'bottom' },
    '+x': { sourceAnchor: 'left', targetAnchor: 'right' },
    '-x': { sourceAnchor: 'right', targetAnchor: 'left' },
    '+y': { sourceAnchor: 'front', targetAnchor: 'back' },
    '-y': { sourceAnchor: 'back', targetAnchor: 'front' },
  };

  const anchors = anchorMap[faceId];

  return {
    partOverrides: {
      name: 'Panel',
      position: pos,
      width: newWidth,
      depth: newDepth,
      thickness: newThickness,
      assemblyId: part.assemblyId || null,
      objectId: part.objectId || null,
    },
    constraint: {
      type: 'attach_face',
      targetPartId: part.id,
      sourceAnchor: anchors.sourceAnchor,
      targetAnchor: anchors.targetAnchor,
      offset: 0,
    },
  };
}
