import { buildSheetScene } from '@/sheets/layout';
import { resolveSketchViewportSource } from './sketchSources';

export function buildSketchSheetScene(sketchProject, sheet) {
  return buildSheetScene(sketchProject, sheet, {
    resolveSource: (project, viewport) => resolveSketchViewportSource(project, viewport),
  });
}
