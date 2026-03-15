import { generateId } from '@/domain/ids';
import { normalizeSketchObjects } from './objectModels';

export function createSketchProject(name = 'Untitled Sketch') {
  return normalizeSketchObjects({
    id: generateId('sketch'),
    name,
    description: '',
    category: 'general',
    canvasWidth: 297000,  // A4 landscape in mm
    canvasHeight: 210000,
    objects: [],
    parts: [],
    assemblies: [],
    constraints: [],
    annotations: [],
    sheets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function createAnnotation(type, props = {}) {
  return {
    id: generateId('annot'),
    type,  // 'dimension', 'label', 'callout'
    ...props,
  };
}
