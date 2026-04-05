import {
  resolveEntityReference,
  updateEllipseCenter,
  updateEllipseRadius,
  updateCircleCenter,
  updateCircleRadius,
  updateLineEndpoint,
  updateRectCorner,
  updateTextFontSize,
} from './entityUtils';

export function getEntityHandles(entity) {
  if (!entity) {
    return [];
  }

  if (entity.type === 'line') {
    return [
      { id: 'start', ...resolveEntityReference(entity, { sourceType: 'endpoint', sourceKey: 'start' }) },
      { id: 'end', ...resolveEntityReference(entity, { sourceType: 'endpoint', sourceKey: 'end' }) },
    ];
  }

  if (entity.type === 'rect' && !(entity.rotation ?? 0)) {
    return [
      { id: 'topLeft', ...resolveEntityReference(entity, { sourceType: 'corner', sourceKey: 'topLeft' }) },
      { id: 'topRight', ...resolveEntityReference(entity, { sourceType: 'corner', sourceKey: 'topRight' }) },
      { id: 'bottomLeft', ...resolveEntityReference(entity, { sourceType: 'corner', sourceKey: 'bottomLeft' }) },
      { id: 'bottomRight', ...resolveEntityReference(entity, { sourceType: 'corner', sourceKey: 'bottomRight' }) },
    ];
  }

  if (entity.type === 'circle') {
    return [
      { id: 'center', ...resolveEntityReference(entity, { sourceType: 'center', sourceKey: 'center' }) },
      { id: 'radius', ...resolveEntityReference(entity, { sourceType: 'radius', sourceKey: 'radius' }) },
    ];
  }

  if (entity.type === 'ellipse') {
    return [
      { id: 'center', ...resolveEntityReference(entity, { sourceType: 'center', sourceKey: 'center' }) },
      { id: 'east', ...resolveEntityReference(entity, { sourceType: 'extrema', sourceKey: 'east' }) },
      { id: 'north', ...resolveEntityReference(entity, { sourceType: 'extrema', sourceKey: 'north' }) },
    ];
  }

  if (entity.type === 'text') {
    const handles = [
      { id: 'size', ...resolveEntityReference(entity, { sourceType: 'corner', sourceKey: 'bottomRight' }) },
    ];

    if (entity.leader?.target) {
      handles.push({
        id: 'leaderTarget',
        x: entity.leader.target.x,
        y: entity.leader.target.y,
      });
    }

    return handles;
  }

  return [];
}

export function updateEntityFromHandle(entity, handleId, point) {
  if (entity.type === 'line') {
    return updateLineEndpoint(entity, handleId, point);
  }

  if (entity.type === 'rect') {
    return {
      ...entity,
      ...updateRectCorner(entity, handleId, point),
    };
  }

  if (entity.type === 'circle') {
    if (handleId === 'center') {
      return updateCircleCenter(entity, point);
    }

    return updateCircleRadius(entity, point);
  }

  if (entity.type === 'ellipse') {
    if (handleId === 'center') {
      return updateEllipseCenter(entity, point);
    }

    return updateEllipseRadius(entity, handleId, point);
  }

  if (entity.type === 'text' && handleId === 'size') {
    return updateTextFontSize(entity, point);
  }

  if (entity.type === 'text' && handleId === 'leaderTarget') {
    return {
      ...entity,
      leader: {
        ...(entity.leader || {}),
        target: {
          x: point.x,
          y: point.y,
        },
      },
    };
  }

  return entity;
}
