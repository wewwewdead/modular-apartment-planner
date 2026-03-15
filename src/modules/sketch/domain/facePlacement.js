import { PART_DEFAULTS } from './partDefaults';
import { getPartExtents } from './viewProjection';

const FACE_ANCHOR_MAP = {
  '+z': { sourceAnchor: 'bottom', targetAnchor: 'top', planeAxes: [
    { axis: 'x', startAnchor: 'left', endAnchor: 'right' },
    { axis: 'y', startAnchor: 'front', endAnchor: 'back' },
  ] },
  '-z': { sourceAnchor: 'top', targetAnchor: 'bottom', planeAxes: [
    { axis: 'x', startAnchor: 'left', endAnchor: 'right' },
    { axis: 'y', startAnchor: 'front', endAnchor: 'back' },
  ] },
  '+x': { sourceAnchor: 'left', targetAnchor: 'right', planeAxes: [
    { axis: 'y', startAnchor: 'front', endAnchor: 'back' },
    { axis: 'z', startAnchor: 'bottom', endAnchor: 'top' },
  ] },
  '-x': { sourceAnchor: 'right', targetAnchor: 'left', planeAxes: [
    { axis: 'y', startAnchor: 'front', endAnchor: 'back' },
    { axis: 'z', startAnchor: 'bottom', endAnchor: 'top' },
  ] },
  '+y': { sourceAnchor: 'front', targetAnchor: 'back', planeAxes: [
    { axis: 'x', startAnchor: 'left', endAnchor: 'right' },
    { axis: 'z', startAnchor: 'bottom', endAnchor: 'top' },
  ] },
  '-y': { sourceAnchor: 'back', targetAnchor: 'front', planeAxes: [
    { axis: 'x', startAnchor: 'left', endAnchor: 'right' },
    { axis: 'z', startAnchor: 'bottom', endAnchor: 'top' },
  ] },
};

function getAxisSize(extents, axis) {
  switch (axis) {
    case 'x':
      return extents.width;
    case 'y':
      return extents.depth;
    case 'z':
      return extents.height;
    default:
      return 0;
  }
}

function normalizePosition(position, axis, sign, size) {
  if (sign < 0) {
    return { ...position, [axis]: position[axis] - size };
  }
  return position;
}

export function computeFaceAlignedPartOverrides(plane, faceId, worldPos, uSize, vSize, partType) {
  const defaults = PART_DEFAULTS[partType] || {};
  const normal = plane?.normal || { x: 0, y: 0, z: 1 };
  const position = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
  const isHorizontal = Math.abs(normal.z) > 0.5;
  const isXFacing = Math.abs(normal.x) > 0.5;
  const isYFacing = Math.abs(normal.y) > 0.5;

  if (isHorizontal) {
    if (partType === 'panel') {
      const thickness = defaults.thickness || 18;
      return {
        position: normalizePosition(position, 'z', normal.z, thickness),
        width: uSize,
        depth: vSize,
        thickness,
      };
    }
    if (partType === 'leg') {
      const height = defaults.height || 720;
      return {
        position: normalizePosition(position, 'z', normal.z, height),
        width: uSize,
        depth: vSize,
        height,
      };
    }
    if (partType === 'frame') {
      const height = defaults.height || 60;
      return {
        position: normalizePosition(position, 'z', normal.z, height),
        length: uSize,
        width: vSize,
        height,
        axis: 'x',
      };
    }
    return { position, width: uSize, depth: vSize };
  }

  if (isXFacing) {
    if (partType === 'panel') {
      const width = defaults.thickness || 18;
      return {
        position: normalizePosition(position, 'x', normal.x, width),
        width,
        depth: uSize,
        thickness: vSize,
      };
    }
    if (partType === 'leg') {
      const width = defaults.width || 40;
      return {
        position: normalizePosition(position, 'x', normal.x, width),
        width,
        depth: uSize,
        height: vSize,
      };
    }
    if (partType === 'frame') {
      const width = defaults.width || 40;
      return {
        position: normalizePosition(position, 'x', normal.x, width),
        width,
        height: vSize,
        length: uSize,
        axis: 'y',
      };
    }
    return { position, width: defaults.width || 40, depth: uSize };
  }

  if (isYFacing) {
    if (partType === 'panel') {
      const depth = defaults.thickness || 18;
      return {
        position: normalizePosition(position, 'y', normal.y, depth),
        width: uSize,
        depth,
        thickness: vSize,
      };
    }
    if (partType === 'leg') {
      const depth = defaults.depth || 40;
      return {
        position: normalizePosition(position, 'y', normal.y, depth),
        width: uSize,
        depth,
        height: vSize,
      };
    }
    if (partType === 'frame') {
      const width = defaults.width || 40;
      return {
        position: normalizePosition(position, 'y', normal.y, width),
        length: uSize,
        width,
        height: vSize,
        axis: 'x',
      };
    }
    return { position, width: uSize, depth: defaults.depth || 40 };
  }

  return { position, width: uSize, depth: vSize };
}

function buildInsetConstraint(sourcePart, targetPart, axisConfig) {
  const sourceExt = getPartExtents(sourcePart);
  const targetExt = getPartExtents(targetPart);
  const axis = axisConfig.axis;

  const sourceStart = sourcePart.position[axis];
  const sourceSize = getAxisSize(sourceExt, axis);
  const targetStart = targetPart.position[axis];
  const targetSize = getAxisSize(targetExt, axis);

  const startOffset = sourceStart - targetStart;
  const endOffset = (targetStart + targetSize) - (sourceStart + sourceSize);
  const centerDelta = Math.abs(startOffset - endOffset);

  if (centerDelta <= 4) {
    return {
      type: 'center_axis',
      axis,
      sourceAnchor: axisConfig.startAnchor,
      targetAnchor: axisConfig.startAnchor,
    };
  }

  if (Math.abs(startOffset) <= Math.abs(endOffset)) {
    return {
      type: 'inset_edge',
      sourceAnchor: axisConfig.startAnchor,
      targetAnchor: axisConfig.startAnchor,
      offset: startOffset,
    };
  }

  return {
    type: 'inset_edge',
    sourceAnchor: axisConfig.endAnchor,
    targetAnchor: axisConfig.endAnchor,
    offset: endOffset,
  };
}

export function buildFaceAttachmentConstraints(sourcePart, targetPart, faceId) {
  const mapping = FACE_ANCHOR_MAP[faceId];
  if (!mapping) return [];

  const constraints = [
    {
      type: 'attach_face',
      sourcePartId: sourcePart.id,
      targetPartId: targetPart.id,
      sourceAnchor: mapping.sourceAnchor,
      targetAnchor: mapping.targetAnchor,
      offset: 0,
    },
  ];

  for (const axisConfig of mapping.planeAxes) {
    constraints.push({
      sourcePartId: sourcePart.id,
      targetPartId: targetPart.id,
      ...buildInsetConstraint(sourcePart, targetPart, axisConfig),
    });
  }

  return constraints;
}
