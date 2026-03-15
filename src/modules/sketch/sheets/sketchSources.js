import {
  buildAssemblyDraftSource,
  buildObjectDraftSource,
  buildPartDetailSource,
  buildPartListSource,
} from '../domain/objectDrafting';

function extractView(sourceView) {
  if (sourceView === 'sketch_object_top' || sourceView === 'sketch_assembly_top') return 'top';
  if (sourceView === 'sketch_object_front' || sourceView === 'sketch_assembly_front') return 'front';
  if (sourceView === 'sketch_object_side' || sourceView === 'sketch_assembly_side') return 'side';
  return 'top';
}

export function resolveSketchViewportSource(sketchProject, viewport) {
  const { sourceView, sourceRefId } = viewport;

  if (sourceView === 'sketch_object_top' || sourceView === 'sketch_object_front' || sourceView === 'sketch_object_side') {
    return buildObjectDraftSource(sketchProject, sourceRefId, extractView(sourceView));
  }

  if (sourceView === 'sketch_assembly_top' || sourceView === 'sketch_assembly_front' || sourceView === 'sketch_assembly_side') {
    return buildAssemblyDraftSource(sketchProject, sourceRefId, extractView(sourceView));
  }

  if (sourceView === 'sketch_part_detail') {
    return buildPartDetailSource(sketchProject, sourceRefId);
  }

  if (sourceView === 'sketch_part_list') {
    const sourceObjectId = viewport.sourceObjectId || null;
    if (sourceObjectId) {
      return buildPartListSource(sketchProject, { objectId: sourceObjectId });
    }
    if (sourceRefId) {
      const objectExists = (sketchProject.objects || []).some((object) => object.id === sourceRefId);
      if (objectExists) return buildPartListSource(sketchProject, { objectId: sourceRefId });
      return buildPartListSource(sketchProject, { assemblyId: sourceRefId });
    }
    return buildPartListSource(sketchProject, {});
  }

  return {
    kind: 'empty',
    title: 'Unknown Source',
    message: `Unknown source view: ${sourceView}`,
    bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1500 },
  };
}

export function getSketchViewportSourceLabel(sourceView) {
  switch (sourceView) {
    case 'sketch_object_top': return 'Object Top';
    case 'sketch_object_front': return 'Object Front';
    case 'sketch_object_side': return 'Object Side';
    case 'sketch_assembly_top': return 'Assembly Top';
    case 'sketch_assembly_front': return 'Assembly Front';
    case 'sketch_assembly_side': return 'Assembly Side';
    case 'sketch_part_detail': return 'Part Detail';
    case 'sketch_part_list': return 'Parts List';
    default: return 'Unknown';
  }
}
