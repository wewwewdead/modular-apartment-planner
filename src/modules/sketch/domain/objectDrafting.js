import { createDimensionFigure } from '@/annotations/dimensions';
import { getPartExtents, projectPartToView } from './viewProjection';

const PART_PADDING = 500;
const VIEW_GAP = 300;

function projectDimensionPoint(point, view) {
  switch (view) {
    case 'top':
      return { x: point.x, y: point.y };
    case 'front':
      return { x: point.x, y: -(point.z || 0) };
    case 'side':
      return { x: point.y, y: -(point.z || 0) };
    default:
      return { x: point.x, y: point.y };
  }
}

function getPartsBounds(parts, view, dimensions = []) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const part of parts) {
    if (part.type === 'dimension') continue;
    const { svgX, svgY, svgWidth, svgHeight } = projectPartToView(part, view);
    minX = Math.min(minX, svgX);
    minY = Math.min(minY, svgY);
    maxX = Math.max(maxX, svgX + svgWidth);
    maxY = Math.max(maxY, svgY + svgHeight);
  }

  for (const dim of dimensions) {
    const start2D = projectDimensionPoint(dim.startPoint, view);
    const end2D = projectDimensionPoint(dim.endPoint, view);
    const figure = createDimensionFigure({
      id: dim.id,
      startPoint: start2D,
      endPoint: end2D,
      mode: 'aligned',
      offset: dim.offset || 200,
      label: dim.textOverride || undefined,
      source: 'manual',
    });
    if (!figure) continue;
    const points = [
      figure.lineStart,
      figure.lineEnd,
      ...figure.extensionLines.flatMap((line) => [line.start, line.end]),
    ];
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (minX === Infinity) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
  return {
    minX: minX - PART_PADDING,
    maxX: maxX + PART_PADDING,
    minY: minY - PART_PADDING,
    maxY: maxY + PART_PADDING,
  };
}

function resolveObject(project, objectId) {
  if (!objectId) return null;
  return (project.objects || []).find((object) => object.id === objectId) || null;
}

function resolveAssembly(project, assemblyId) {
  if (!assemblyId) return null;
  return (project.assemblies || []).find((assembly) => assembly.id === assemblyId) || null;
}

function gatherObjectParts(project, objectId) {
  if (!objectId) {
    return project.parts.filter((part) => part.type !== 'dimension');
  }
  return project.parts.filter((part) => part.objectId === objectId && part.type !== 'dimension');
}

function gatherObjectDimensions(project, objectId) {
  if (!objectId) {
    return project.parts.filter((part) => part.type === 'dimension');
  }

  const partIds = new Set(project.parts.filter((part) => part.objectId === objectId).map((part) => part.id));
  return project.parts.filter((part) => part.type === 'dimension' && part.boundPartId && partIds.has(part.boundPartId));
}

function gatherAssemblyParts(project, assemblyId) {
  if (!assemblyId) return gatherObjectParts(project, null);
  return project.parts.filter((part) => part.assemblyId === assemblyId && part.type !== 'dimension');
}

function gatherAssemblyDimensions(project, assemblyId) {
  if (!assemblyId) return gatherObjectDimensions(project, null);
  const partIds = new Set(project.parts.filter((part) => part.assemblyId === assemblyId).map((part) => part.id));
  return project.parts.filter((part) => part.type === 'dimension' && part.boundPartId && partIds.has(part.boundPartId));
}

function resolveObjectName(project, objectId) {
  return resolveObject(project, objectId)?.name || project.name || 'All Objects';
}

function resolveAssemblyName(project, assemblyId) {
  return resolveAssembly(project, assemblyId)?.name || project.name || 'Assembly';
}

export function buildObjectDraftSource(project, objectId, view) {
  const parts = gatherObjectParts(project, objectId);
  const dimensions = gatherObjectDimensions(project, objectId);

  if (parts.length === 0) {
    return {
      kind: 'empty',
      title: `${resolveObjectName(project, objectId)} — ${view}`,
      message: 'No parts in this object.',
      bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1500 },
    };
  }

  return {
    kind: 'sketch_object',
    title: `${resolveObjectName(project, objectId)} — ${view}`,
    view,
    parts,
    dimensions,
    object: resolveObject(project, objectId),
    bounds: getPartsBounds(parts, view, dimensions),
  };
}

export function buildAssemblyDraftSource(project, assemblyId, view) {
  const parts = gatherAssemblyParts(project, assemblyId);
  const dimensions = gatherAssemblyDimensions(project, assemblyId);

  if (parts.length === 0) {
    return {
      kind: 'empty',
      title: `${resolveAssemblyName(project, assemblyId)} — ${view}`,
      message: 'No parts in this assembly.',
      bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1500 },
    };
  }

  return {
    kind: 'sketch_assembly',
    title: `${resolveAssemblyName(project, assemblyId)} — ${view}`,
    view,
    parts,
    dimensions,
    assembly: resolveAssembly(project, assemblyId),
    bounds: getPartsBounds(parts, view, dimensions),
  };
}

export function buildPartDetailSource(project, partId) {
  const part = project.parts.find((entry) => entry.id === partId);
  if (!part || part.type === 'dimension') {
    return {
      kind: 'empty',
      title: 'Part Detail',
      message: 'Part not found.',
      bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1500 },
    };
  }

  const extents = getPartExtents(part);
  const views = ['top', 'front', 'side'];
  const viewBounds = views.map((view) => {
    const { svgX, svgY, svgWidth, svgHeight } = projectPartToView(part, view);
    return { view, svgX, svgY, svgWidth, svgHeight };
  });

  let offsetX = 0;
  const viewLayouts = [];

  for (const viewBound of viewBounds) {
    viewLayouts.push({
      view: viewBound.view,
      offsetX,
      offsetY: 0,
      width: viewBound.svgWidth,
      height: viewBound.svgHeight,
      svgX: viewBound.svgX,
      svgY: viewBound.svgY,
    });
    offsetX += viewBound.svgWidth + VIEW_GAP;
  }

  const maxHeight = Math.max(...viewBounds.map((viewBound) => viewBound.svgHeight));

  return {
    kind: 'sketch_part_detail',
    title: part.name || 'Part Detail',
    part,
    extents,
    viewLayouts,
    bounds: {
      minX: -PART_PADDING,
      maxX: offsetX - VIEW_GAP + PART_PADDING,
      minY: -PART_PADDING,
      maxY: maxHeight + PART_PADDING,
    },
  };
}

export function buildPartListSource(project, scope = {}) {
  const parts = scope.objectId
    ? gatherObjectParts(project, scope.objectId)
    : scope.assemblyId
      ? gatherAssemblyParts(project, scope.assemblyId)
      : gatherObjectParts(project, null);

  const groupMap = new Map();
  for (const part of parts) {
    const extents = getPartExtents(part);
    const key = `${part.type}|${part.material || ''}|${extents.width}|${extents.depth}|${extents.height}`;
    if (groupMap.has(key)) {
      groupMap.get(key).qty += 1;
    } else {
      groupMap.set(key, {
        name: part.name,
        type: part.type,
        material: part.material || '-',
        width: extents.width,
        depth: extents.depth,
        height: extents.height,
        qty: 1,
      });
    }
  }

  const rows = [];
  let item = 1;
  for (const group of groupMap.values()) {
    rows.push({
      item,
      name: group.name,
      type: group.type,
      material: group.material,
      qty: group.qty,
      dims: `${Math.round(group.width)} x ${Math.round(group.depth)} x ${Math.round(group.height)}`,
    });
    item += 1;
  }

  const columnWidths = [30, 120, 60, 80, 30, 120];
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const rowHeight = 20;
  const headerHeight = 24;
  const tableHeight = headerHeight + rows.length * rowHeight;

  const title = scope.objectId
    ? `${resolveObjectName(project, scope.objectId)} Parts List`
    : scope.assemblyId
      ? `${resolveAssemblyName(project, scope.assemblyId)} Parts List`
      : `${project.name || 'Sketch'} Parts List`;

  return {
    kind: 'sketch_part_list',
    title,
    rows,
    columnWidths,
    headers: ['Item', 'Name', 'Type', 'Material', 'Qty', 'Dimensions'],
    rowHeight,
    headerHeight,
    bounds: {
      minX: 0,
      maxX: tableWidth,
      minY: 0,
      maxY: tableHeight,
    },
  };
}
