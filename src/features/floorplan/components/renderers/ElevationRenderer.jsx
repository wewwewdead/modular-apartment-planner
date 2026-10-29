import { memo, useMemo } from 'react';
import { buildProjectElevationScene } from '@/elevations/scene';
import { buildElevationAnnotationScene } from '@/elevations/annotations';
import ElevationSceneLayer from './ElevationSceneLayer';

function ElevationRenderer({ project, floor, viewMode, selectedId, selectedType }) {
  const scene = useMemo(() => buildProjectElevationScene(project, floor?.id, viewMode), [project, floor?.id, viewMode]);
  if (!scene) return null;
  const annotationScene = buildElevationAnnotationScene(floor, scene);

  return (
    <ElevationSceneLayer
      scene={scene}
      annotationScene={annotationScene}
      selectedId={selectedId}
      selectedType={selectedType}
    />
  );
}

export default memo(ElevationRenderer);
