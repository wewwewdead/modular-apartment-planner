import { buildElevationScene } from '@/elevations/scene';
import { buildElevationAnnotationScene } from '@/elevations/annotations';
import ElevationSceneLayer from './ElevationSceneLayer';

export default function ElevationRenderer({ floor, viewMode }) {
  const scene = buildElevationScene(floor, viewMode);
  if (!scene) return null;
  const annotationScene = buildElevationAnnotationScene(floor, scene);

  return <ElevationSceneLayer scene={scene} annotationScene={annotationScene} />;
}
