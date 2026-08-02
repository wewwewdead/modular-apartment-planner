import { memo, useMemo } from 'react';
import { normalizeRectBounds } from '@/features/floorplan/utils/planClipboard';
import ElevationRenderer from './ElevationRenderer';
import FloorPlanLayer from './FloorPlanLayer';
import FloorPreviewLayer from './FloorPreviewLayer';
import FloorSelectionLayer from './FloorSelectionLayer';
import SectionRenderer from './SectionRenderer';
import SitePlanOverlay from './SitePlanOverlay';
import StructuralGridOverlay from './StructuralGridOverlay';
import WetCoreOverlay from './WetCoreOverlay';
import ApartmentDesignOverlay from './ApartmentDesignOverlay';
import { RenderProfilerScope, useRenderProfile } from './renderProfiling';

const FloorScene = memo(function FloorScene({
  floor,
  filteredFloor,
  filteredProject,
  structuralLoadPath,
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
            <SitePlanOverlay site={filteredProject.building?.site} />
            <FloorPlanLayer floor={floor} filteredFloor={filteredFloor} selectedId={selectedId} />
            <StructuralGridOverlay
              structuralSystem={filteredProject.building?.systems?.structural}
              floor={filteredFloor}
              loadPath={structuralLoadPath}
            />
            <WetCoreOverlay
              plumbingSystem={filteredProject.building?.systems?.plumbing}
              electricalSystem={filteredProject.building?.systems?.electrical}
              waterSystem={filteredProject.building?.systems?.water}
              mechanicalSystem={filteredProject.building?.systems?.mechanical}
              egressSystem={filteredProject.building?.systems?.egress}
              floor={filteredFloor}
              selectedId={selectedId}
              selectedType={selectedType}
            />
            <ApartmentDesignOverlay
              apartmentDesign={filteredProject.building?.apartmentDesign}
              profile={filteredProject.building?.apartmentDesignProfile}
              floor={filteredFloor}
            />
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
