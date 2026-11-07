import { memo } from 'react';
import { getProjectElevationScene } from '@/elevations/elevationSceneCache';
import { buildElevationAnnotationScene } from '@/elevations/annotations';
import { getElevationView } from '@/elevations/projection';
import { drawingElevation } from '@/ui/loading';
import DeferredSceneDrawing from './DeferredSceneDrawing';
import ElevationSceneLayer from './ElevationSceneLayer';

function ElevationRenderer({ project, floor, viewMode, selectedId, selectedType }) {
  // Shared with the elevation click handler (`elevationSceneCache`), so a click
  // finds the visibility pass this drawing already paid for.
  const scene = getProjectElevationScene(project, floor?.id, viewMode);
  if (!scene) return null;
  const side = getElevationView(viewMode).key.replace('elevation_', '');

  return (
    <DeferredSceneDrawing
      kind="elevation"
      scene={scene}
      viewKey={`${floor?.id}:${viewMode}`}
      label={drawingElevation(side)}
    >
      {(drawnScene, drawables) => (
        <ElevationSceneLayer
          scene={drawnScene}
          drawables={drawables}
          // Reads the visible openings, so it is built from the resolved scene
          // only — never the one whose pass is still running.
          annotationScene={buildElevationAnnotationScene(floor, drawnScene)}
          selectedId={selectedId}
          selectedType={selectedType}
        />
      )}
    </DeferredSceneDrawing>
  );
}

export default memo(ElevationRenderer);
