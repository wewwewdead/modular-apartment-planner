import { computeGenericPartPlanBounds } from './genericObjectUtils';

function getSymbolBounds(symbol) {
  const points = [
    ...(symbol.polygons || []).flatMap((polygon) => polygon.points || []),
    ...(symbol.lines || []).flatMap((line) => line.points || []),
    ...(symbol.circles || []).flatMap((circle) => (
      circle
        ? [
            { x: circle.cx - circle.r, y: circle.cy - circle.r },
            { x: circle.cx + circle.r, y: circle.cy + circle.r },
          ]
        : []
    )),
  ];

  if (!points.length) {
    return null;
  }

  return points.reduce((accumulator, point) => ({
    minX: Math.min(accumulator.minX, point.x),
    minY: Math.min(accumulator.minY, point.y),
    maxX: Math.max(accumulator.maxX, point.x),
    maxY: Math.max(accumulator.maxY, point.y),
  }), {
    minX: points[0].x,
    minY: points[0].y,
    maxX: points[0].x,
    maxY: points[0].y,
  });
}

export function buildPlanSymbolShapeFromGenericPart(part, entities = [], index = 0) {
  const bounds = computeGenericPartPlanBounds(part, entities);
  if (!bounds) {
    return null;
  }

  const width = Math.max(0, bounds.width);
  const depth = Math.max(0, bounds.depth);
  const role = part?.role || 'generic';

  if (role === 'leg') {
    const radius = Math.max(6, Math.min(width || part?.thickness || 18, depth || part?.thickness || 18) / 2);
    return {
      circles: [{
        id: `${part.id || `part-${index}`}-leg`,
        role,
        cx: bounds.minX + (width / 2),
        cy: bounds.minY + (depth / 2),
        r: radius,
      }],
    };
  }

  if ((role === 'rail' || role === 'brace' || role === 'support') && (width > 0 || depth > 0)) {
    if (width >= depth) {
      return {
        lines: [{
          id: `${part.id || `part-${index}`}-line`,
          role,
          points: [
            { x: bounds.minX, y: bounds.minY + (depth / 2) },
            { x: bounds.maxX, y: bounds.minY + (depth / 2) },
          ],
        }],
      };
    }

    return {
      lines: [{
        id: `${part.id || `part-${index}`}-line`,
        role,
        points: [
          { x: bounds.minX + (width / 2), y: bounds.minY },
          { x: bounds.minX + (width / 2), y: bounds.maxY },
        ],
      }],
    };
  }

  return {
    polygons: [{
      id: `${part.id || `part-${index}`}-poly`,
      role,
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
      ],
    }],
  };
}

export function mergePlanSymbolWithTemplateDetails(symbol, objectLike = {}) {
  const generatorType = objectLike?.generator?.type || objectLike?.metadata?.generator?.type || objectLike?.template?.id || objectLike?.metadata?.template?.id;
  const bounds = getSymbolBounds(symbol);
  if (!bounds || !generatorType) {
    return symbol;
  }

  if (generatorType === 'cabinetBox' || generatorType === 'shelvingUnit') {
    return {
      ...symbol,
      lines: [
        ...(symbol.lines || []),
        {
          id: `${generatorType}-front-edge`,
          role: 'front',
          points: [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.minY },
          ],
        },
      ],
    };
  }

  return symbol;
}

export function buildPlanSymbolFromParts(parts = [], options = {}) {
  const base = parts.reduce((symbol, part, index) => {
    const shape = buildPlanSymbolShapeFromGenericPart(part, options.entities || [], index);
    if (!shape) {
      return symbol;
    }

    return {
      polygons: [...symbol.polygons, ...(shape.polygons || [])],
      lines: [...symbol.lines, ...(shape.lines || [])],
      circles: [...symbol.circles, ...(shape.circles || [])],
    };
  }, {
    polygons: [],
    lines: [],
    circles: [],
  });

  return mergePlanSymbolWithTemplateDetails(base, options.objectLike || {});
}

