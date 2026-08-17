import { memo, useMemo } from 'react';
import { normalizeRectBounds } from '@/features/floorplan/utils/planClipboard';
import CeilingRenderer from './CeilingRenderer';
import ElevationRenderer from './ElevationRenderer';
import FloorPlanLayer from './FloorPlanLayer';
import FloorPreviewLayer from './FloorPreviewLayer';
import FloorSelectionLayer from './FloorSelectionLayer';
import FloorUnderlayLayer from './FloorUnderlayLayer';
import OverhangIndicatorLayer from './OverhangIndicatorLayer';
import SectionRenderer from './SectionRenderer';
import ShadowOverlay from './ShadowOverlay';
import DaylightOverlay from './DaylightOverlay';
import SolarAccessOverlay from './SolarAccessOverlay';
import SitePlanOverlay from './SitePlanOverlay';
import StructuralGridOverlay from './StructuralGridOverlay';
import WetCoreOverlay from './WetCoreOverlay';
import ApartmentDesignOverlay from './ApartmentDesignOverlay';
import { useDaylightStudy } from '../../context/DaylightStudyContext';
import { RenderProfilerScope, useRenderProfile } from './renderProfiling';

const FloorScene = memo(function FloorScene({
  floor,
  filteredFloor,
  filteredProject,
  floorBelow,
  showFloorBelowUnderlay,
  floorOverhangs,
  selectedOverhangEdge,
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

  // Computed once by the provider and read here, rather than recomputed: the
  // sidebar panel is looking at the same study, and the grid variant costs a
  // worker run nobody wants to pay for twice.
  const daylight = useDaylightStudy();

  useRenderProfile('FloorScene', {
    viewMode,
    selectedId,
    selectedType,
    activeTool,
    zoom,
    floor,
    filteredFloor,
    floorBelow,
    showFloorBelowUnderlay,
    floorOverhangs,
    selectedOverhangEdge,
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
            <ShadowOverlay study={daylight.sunStudy} />
            {/* The floor below, immediately under the plan being edited — above
                the grid and the site it stands on, below everything on this
                floor. Anything drawn over it belongs to the active floor, which
                is exactly how an overhang should read. */}
            {showFloorBelowUnderlay && floorBelow ? <FloorUnderlayLayer floor={floorBelow} /> : null}
            <FloorPlanLayer floor={floor} filteredFloor={filteredFloor} selectedId={selectedId} />
            {/* Annotates THIS floor's slabs, so unlike the ghost underlay it
                belongs on top of the plan rather than beneath it. */}
            <OverhangIndicatorLayer overhangs={floorOverhangs} selectedEdge={selectedOverhangEdge} />
            {/* Ceilings are project-level, so they ride here rather than inside
                the floor layer — above the rooms and walls they cover, because
                that is where they are in the building, and below everything the
                user is actively pointing at. */}
            <CeilingRenderer project={filteredProject} floorId={floor.id} />
            {/* Above the plan, unlike the shadow overlay below it. A shadow
                falls on open ground; a daylight factor is a property of the
                inside of a room, and rooms are drawn with an opaque fill — put
                this underneath and the whole map disappears behind it. It is
                translucent enough that walls, doors and furniture still read
                through. */}
            <DaylightOverlay study={daylight.study} stale={daylight.gridStale} />
            <SolarAccessOverlay
              study={daylight.solarStudy}
              metric={daylight.solarAccess?.metric}
              sliceHeight={daylight.solarAccess?.facadeSliceHeight}
              stale={daylight.solarStale}
            />
            <StructuralGridOverlay
              structuralSystem={filteredProject.building?.systems?.structural}
              floor={filteredFloor}
              loadPath={structuralLoadPath}
              selectedId={selectedId}
              selectedType={selectedType}
              previewTransform={toolState.wallDragPreview?.gridTransform || null}
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
              selectedOverhangEdge={selectedOverhangEdge}
              floor={floor}
              zoom={zoom}
            />
            <FloorPreviewLayer
              toolState={toolState}
              activeTool={activeTool}
              floor={floor}
              selectedId={selectedId}
              selectedType={selectedType}
            />
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
