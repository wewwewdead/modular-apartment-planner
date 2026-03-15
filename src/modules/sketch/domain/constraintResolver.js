import { getPartExtents } from './viewProjection';

function getAnchorPosition(part, anchor) {
  const ext = getPartExtents(part);
  const pos = part.position;

  switch (anchor) {
    case 'top': return pos.z + ext.height;
    case 'bottom': return pos.z;
    case 'left': return pos.x;
    case 'right': return pos.x + ext.width;
    case 'front': return pos.y;
    case 'back': return pos.y + ext.depth;
    case 'center': return null; // handled per-type
    default: return 0;
  }
}

function getAnchorAxis(anchor) {
  switch (anchor) {
    case 'top':
    case 'bottom':
      return 'z';
    case 'left':
    case 'right':
      return 'x';
    case 'front':
    case 'back':
      return 'y';
    case 'center':
      return null;
    default:
      return null;
  }
}

function getAnchorExtentSize(part, anchor) {
  const ext = getPartExtents(part);
  switch (anchor) {
    case 'top':
    case 'bottom':
      return ext.height;
    case 'left':
    case 'right':
      return ext.width;
    case 'front':
    case 'back':
      return ext.depth;
    default:
      return 0;
  }
}

function getPartSizeOnAxis(part, axis) {
  const ext = getPartExtents(part);
  switch (axis) {
    case 'x': return ext.width;
    case 'y': return ext.depth;
    case 'z': return ext.height;
    default: return 0;
  }
}

function resolveEqualSpacing(constraint, partsById, positions) {
  const parts = constraint.partIds
    .map((id) => partsById.get(id))
    .filter(Boolean);

  if (parts.length < 2) return;

  const axis = constraint.axis || 'z';
  const refPart = constraint.referencePartId ? partsById.get(constraint.referencePartId) : null;

  // Get effective positions (use already-resolved if available)
  const getPos = (part) => ({
    ...part.position,
    ...(positions.get(part.id) || {}),
  });

  let rangeStart, rangeEnd;

  if (refPart) {
    const refPos = getPos(refPart);
    const refExt = getPartExtents({ ...refPart, position: refPos });
    const startAnchor = constraint.startAnchor || 'bottom';
    const endAnchor = constraint.endAnchor || 'top';

    const startPart = { ...refPart, position: refPos };
    rangeStart = getAnchorPosition(startPart, startAnchor) ?? refPos[axis];
    rangeEnd = getAnchorPosition(startPart, endAnchor) ?? (refPos[axis] + getPartSizeOnAxis(startPart, axis));
  } else {
    // Compute range from min/max of the parts themselves
    let min = Infinity, max = -Infinity;
    for (const part of parts) {
      const pos = getPos(part);
      const size = getPartSizeOnAxis({ ...part, position: pos }, axis);
      min = Math.min(min, pos[axis]);
      max = Math.max(max, pos[axis] + size);
    }
    rangeStart = min;
    rangeEnd = max;
  }

  const rangeSize = rangeEnd - rangeStart;

  // Sort parts by current position on axis
  const sorted = [...parts].sort((a, b) => {
    const posA = getPos(a);
    const posB = getPos(b);
    return posA[axis] - posB[axis];
  });

  const totalPartSize = sorted.reduce((sum, part) => {
    return sum + getPartSizeOnAxis({ ...part, position: getPos(part) }, axis);
  }, 0);

  const gap = (rangeSize - totalPartSize) / (sorted.length + 1);

  let cursor = rangeStart;
  for (const part of sorted) {
    cursor += gap;
    const pos = getPos(part);
    const newPos = { ...pos, [axis]: cursor };
    cursor += getPartSizeOnAxis({ ...part, position: pos }, axis);
    positions.set(part.id, newPos);
  }
}

export function resolveConstraints(constraints, parts) {
  const positions = new Map();
  const partsById = new Map(parts.map((p) => [p.id, p]));

  for (const constraint of constraints) {
    if (constraint.type === 'equal_spacing') {
      resolveEqualSpacing(constraint, partsById, positions);
      continue;
    }

    const source = partsById.get(constraint.sourcePartId);
    const target = partsById.get(constraint.targetPartId);
    if (!source || !target) continue;

    // Use already-resolved position if available
    const sourcePos = { ...source.position, ...(positions.get(source.id) || {}) };
    const targetPos = { ...target.position, ...(positions.get(target.id) || {}) };

    const workingSource = { ...source, position: sourcePos };
    const workingTarget = { ...target, position: targetPos };

    const newPos = { ...sourcePos };

    switch (constraint.type) {
      case 'attach_face': {
        const axis = getAnchorAxis(constraint.targetAnchor);
        if (!axis) break;
        const targetAnchorVal = getAnchorPosition(workingTarget, constraint.targetAnchor);
        const sourceExtent = getAnchorExtentSize(workingSource, constraint.sourceAnchor);

        // Position source so its sourceAnchor face touches target's targetAnchor face
        if (constraint.sourceAnchor === 'bottom' || constraint.sourceAnchor === 'left' || constraint.sourceAnchor === 'front') {
          newPos[axis] = targetAnchorVal + constraint.offset;
        } else {
          newPos[axis] = targetAnchorVal - sourceExtent + constraint.offset;
        }
        break;
      }

      case 'flush_surface': {
        const axis = getAnchorAxis(constraint.targetAnchor);
        if (!axis) break;
        const targetAnchorVal = getAnchorPosition(workingTarget, constraint.targetAnchor);
        const sourceExtent = getAnchorExtentSize(workingSource, constraint.sourceAnchor);

        if (constraint.sourceAnchor === 'bottom' || constraint.sourceAnchor === 'left' || constraint.sourceAnchor === 'front') {
          newPos[axis] = targetAnchorVal;
        } else {
          newPos[axis] = targetAnchorVal - sourceExtent;
        }
        break;
      }

      case 'align_edge': {
        const axis = getAnchorAxis(constraint.targetAnchor);
        if (!axis) break;
        const targetVal = getAnchorPosition(workingTarget, constraint.targetAnchor);
        const sourceVal = getAnchorPosition(workingSource, constraint.sourceAnchor);
        newPos[axis] = sourcePos[axis] + (targetVal - sourceVal) + constraint.offset;
        break;
      }

      case 'center_axis': {
        const targetExt = getPartExtents(workingTarget);
        const sourceExt = getPartExtents(workingSource);
        const axisMode = constraint.axis || 'both';

        if (axisMode === 'x' || axisMode === 'both') {
          newPos.x = targetPos.x + (targetExt.width - sourceExt.width) / 2;
        }
        if (axisMode === 'y' || axisMode === 'both') {
          newPos.y = targetPos.y + (targetExt.depth - sourceExt.depth) / 2;
        }
        if (axisMode === 'z') {
          newPos.z = targetPos.z + (targetExt.height - sourceExt.height) / 2;
        }
        break;
      }

      case 'inset_edge': {
        const axis = getAnchorAxis(constraint.targetAnchor);
        if (!axis) break;
        const targetExt = getPartExtents(workingTarget);
        const sourceExt = getPartExtents(workingSource);
        const inset = constraint.offset || 0;

        if (constraint.targetAnchor === 'right' || constraint.targetAnchor === 'top' || constraint.targetAnchor === 'back') {
          const axisSize = axis === 'x' ? targetExt.width : axis === 'y' ? targetExt.depth : targetExt.height;
          const sourceSize = axis === 'x' ? sourceExt.width : axis === 'y' ? sourceExt.depth : sourceExt.height;
          newPos[axis] = targetPos[axis] + axisSize - sourceSize - inset;
        } else {
          newPos[axis] = targetPos[axis] + inset;
        }
        break;
      }
    }

    positions.set(source.id, newPos);
  }

  return positions;
}
