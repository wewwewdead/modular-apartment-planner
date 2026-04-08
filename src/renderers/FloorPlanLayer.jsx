import { memo } from 'react';
import AnnotationRenderer from './AnnotationRenderer';
import BeamRenderer from './BeamRenderer';
import ColumnRenderer from './ColumnRenderer';
import DoorRenderer from './DoorRenderer';
import FixtureDefs from './FixtureDefs';
import FixtureRenderer from './FixtureRenderer';
import LandingRenderer from './LandingRenderer';
import RailingRenderer from './RailingRenderer';
import RoomRenderer from './RoomRenderer';
import SectionCutRenderer from './SectionCutRenderer';
import SlabRenderer from './SlabRenderer';
import StairRenderer from './StairRenderer';
import WallRenderer from './WallRenderer';
import WindowRenderer from './WindowRenderer';
import { RenderProfilerScope, useRenderProfile } from './renderProfiling';

const FloorPlanLayer = memo(function FloorPlanLayer({ floor, filteredFloor, selectedId }) {
  useRenderProfile('FloorPlanLayer', {
    floor,
    filteredFloor,
    selectedId,
  });

  if (!floor || !filteredFloor) return null;

  return (
    <RenderProfilerScope name="FloorPlanLayer">
      <>
        <FixtureDefs />
        {(filteredFloor.slabs || []).map((slab) => (
          <SlabRenderer key={slab.id} slab={slab} selectedId={selectedId} />
        ))}
        <RoomRenderer rooms={filteredFloor.rooms} selectedId={selectedId} />
        <WallRenderer walls={filteredFloor.walls} columns={filteredFloor.columns || []} />
        <BeamRenderer beams={filteredFloor.beams || []} columns={filteredFloor.columns || []} />
        <StairRenderer stairs={filteredFloor.stairs || []} />
        <LandingRenderer landings={filteredFloor.landings || []} />
        <RailingRenderer railings={filteredFloor.railings || []} />
        <ColumnRenderer columns={filteredFloor.columns || []} />
        <FixtureRenderer fixtures={filteredFloor.fixtures || []} />
        <DoorRenderer doors={filteredFloor.doors} walls={filteredFloor.walls} />
        <WindowRenderer windows={filteredFloor.windows} walls={filteredFloor.walls} />
        {(floor.sectionCuts || []).map((sectionCut) => (
          <SectionCutRenderer key={sectionCut.id} sectionCut={sectionCut} selectedId={selectedId} />
        ))}
        <AnnotationRenderer floor={floor} />
      </>
    </RenderProfilerScope>
  );
});

export default FloorPlanLayer;
