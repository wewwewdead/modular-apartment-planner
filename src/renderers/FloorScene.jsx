import { memo, useMemo } from 'react';
import { normalizeRectBounds } from '@/clipboard/planClipboard';
import ElevationRenderer from './ElevationRenderer';
import FloorPlanLayer from './FloorPlanLayer';
import FloorPreviewLayer from './FloorPreviewLayer';
import FloorSelectionLayer from './FloorSelectionLayer';
import SectionRenderer from './SectionRenderer';
import { RenderProfilerScope, useRenderProfile } from './renderProfiling';

const FloorScene = memo(function FloorScene({
  floor,
  filteredFloor,
  filteredProject,
  viewMode,
  selectedId,
  selectedType,
  activeTool,
  toolState,
  zoom,
  previewContent,
  regionSelection,
  activeSectionCutId,
  roofHiddenByPhase,
  hasProjectRoof,
  railingsHiddenByPhase,
  hasProjectRailings,
}) {
  const marqueeBounds = useMemo(
    () =>
      toolState.dragType === 'marquee' && toolState.startPos && toolState.currentPos
        ? normalizeRectBounds(toolState.startPos, toolState.currentPos)
        : null,
    [toolState.currentPos, toolState.dragType, toolState.startPos],
  );

  useRenderProfile('FloorScene', {
    viewMode,
    selectedId,
    selectedType,
    activeTool,
    zoom,
    floor,
    filteredFloor,
    toolState,
    previewContent,
    marqueeBounds,
    regionSelection,
    activeSectionCutId,
  });

  if (!floor) return null;

  return (
    <RenderProfilerScope name="FloorScene">
      <>
        {viewMode === 'plan' ? (
          <>
            <FloorPlanLayer floor={floor} filteredFloor={filteredFloor} selectedId={selectedId} />
            <FloorSelectionLayer
              previewContent={previewContent}
              marqueeBounds={marqueeBounds}
              selectionBounds={regionSelection?.bounds || null}
              selectedId={selectedId}
              selectedType={selectedType}
              floor={floor}
              zoom={zoom}
            />
            <FloorPreviewLayer toolState={toolState} activeTool={activeTool} floor={floor} />
          </>
        ) : viewMode === 'section_view' ? (
          <SectionRenderer
            project={filteredProject}
            floor={filteredFloor}
            activeSectionCutId={activeSectionCutId}
            roofHiddenByPhase={roofHiddenByPhase}
            hasProjectRoof={hasProjectRoof}
            railingsHiddenByPhase={railingsHiddenByPhase}
            hasProjectRailings={hasProjectRailings}
          />
        ) : (
          <ElevationRenderer
            project={filteredProject}
            floor={filteredFloor}
            viewMode={viewMode}
            selectedId={selectedId}
            selectedType={selectedType}
          />
        )}
      </>
    </RenderProfilerScope>
  );
});

export default FloorScene;
