import { memo } from 'react';
import { buildRoofOnlyElevationScene } from '@/elevations/scene';
import ElevationSceneLayer from './ElevationSceneLayer';

function RoofElevationRenderer({ roofSystem, viewMode, selectedId = null, selectedType = null, showTitle = true }) {
  const scene = buildRoofOnlyElevationScene(roofSystem, viewMode);
  if (!scene) return null;

  return (
    <ElevationSceneLayer
      scene={scene}
      annotationScene={null}
      showTitle={showTitle}
      selectedId={selectedId}
      selectedType={selectedType}
    />
  );
}

export default memo(RoofElevationRenderer);
