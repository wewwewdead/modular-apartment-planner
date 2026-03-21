import { calculateDistance } from './canvasMath';
import { inferDimensionSubtype, measureDistance } from './dimensionUtils';

function parsePositiveNumber(rawValue) {
  if (rawValue === '') {
    return null;
  }

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function getPrecisionHudData(draft, previewEntity) {
  if (!draft?.type || !previewEntity) {
    return null;
  }

  if (draft.type === 'line') {
    return {
      tool: 'line',
      measurements: [{ key: 'length', label: 'Length', value: calculateDistance(draft.startPoint, { x: previewEntity.x2, y: previewEntity.y2 }) }],
      inputs: [{ key: 'length', label: 'Length', value: draft.precisionInput.length, placeholder: 'Exact length' }],
    };
  }

  if (draft.type === 'rect') {
    return {
      tool: 'rect',
      measurements: [
        { key: 'width', label: 'Width', value: previewEntity.width ?? Math.abs(previewEntity.endPoint.x - previewEntity.startPoint.x) },
        { key: 'height', label: 'Height', value: previewEntity.height ?? Math.abs(previewEntity.endPoint.y - previewEntity.startPoint.y) },
      ],
      inputs: [
        { key: 'width', label: 'Width', value: draft.precisionInput.width, placeholder: 'Width' },
        { key: 'height', label: 'Height', value: draft.precisionInput.height, placeholder: 'Height' },
      ],
    };
  }

  if (draft.type === 'circle') {
    return {
      tool: 'circle',
      measurements: [{ key: 'radius', label: 'Radius', value: previewEntity.radius }],
      inputs: [{ key: 'radius', label: 'Radius', value: draft.precisionInput.radius, placeholder: 'Radius' }],
    };
  }

  if (draft.type === 'holeCircle') {
    return {
      tool: 'hole',
      measurements: [{ key: 'diameter', label: 'Diameter', value: previewEntity.diameter }],
      inputs: [{ key: 'diameter', label: 'Diameter', value: draft.precisionInput.diameter, placeholder: 'Diameter' }],
    };
  }

  if (draft.type === 'cutoutRect') {
    return {
      tool: 'cutout',
      measurements: [
        { key: 'width', label: 'Width', value: previewEntity.width ?? Math.abs(previewEntity.endPoint.x - previewEntity.startPoint.x) },
        { key: 'height', label: 'Height', value: previewEntity.height ?? Math.abs(previewEntity.endPoint.y - previewEntity.startPoint.y) },
      ],
      inputs: [
        { key: 'width', label: 'Width', value: draft.precisionInput.width, placeholder: 'Width' },
        { key: 'height', label: 'Height', value: draft.precisionInput.height, placeholder: 'Height' },
      ],
    };
  }

  if (draft.type === 'offset') {
    return {
      tool: 'offset',
      measurements: [{ key: 'offset', label: 'Distance', value: parsePositiveNumber(draft.precisionInput.offset) ?? 0 }],
      inputs: [{ key: 'offset', label: 'Distance', value: draft.precisionInput.offset, placeholder: 'Offset' }],
    };
  }

  if (draft.type === 'polyline') {
    const previousPoint = draft.points.at(-1);
    return {
      tool: 'polyline',
      measurements: [
        { key: 'vertices', label: 'Vertices', value: draft.points.length },
        { key: 'segment', label: 'Segment', value: previousPoint && draft.currentPoint ? calculateDistance(previousPoint, draft.currentPoint) : 0 },
      ],
      inputs: [],
    };
  }

  if (draft.type === 'arc') {
    if (previewEntity.type === 'line') {
      return {
        tool: 'arc',
        measurements: [{ key: 'chord', label: 'Chord', value: calculateDistance({ x: previewEntity.x1, y: previewEntity.y1 }, { x: previewEntity.x2, y: previewEntity.y2 }) }],
        inputs: [],
      };
    }

    if (previewEntity.type === 'arc') {
      return {
        tool: 'arc',
        measurements: [{ key: 'chord', label: 'Chord', value: calculateDistance(previewEntity.start, previewEntity.end) }],
        inputs: [],
      };
    }
  }

  if (draft.type === 'dimension') {
    if (previewEntity.type === 'dimension-guide') {
      const subtype = inferDimensionSubtype(previewEntity.p1, previewEntity.p2);

      return {
        tool: 'dimension',
        measurements: [{ key: 'value', label: 'Value', value: measureDistance(previewEntity.p1, previewEntity.p2, subtype) }],
        inputs: [],
      };
    }

    if (previewEntity.type === 'dimension') {
      return {
        tool: 'dimension',
        measurements: [
          { key: 'value', label: 'Value', value: measureDistance(previewEntity.p1, previewEntity.p2, previewEntity.subtype) },
          { key: 'offset', label: 'Offset', value: Math.abs(previewEntity.offset) },
        ],
        inputs: [],
      };
    }
  }

  return null;
}
