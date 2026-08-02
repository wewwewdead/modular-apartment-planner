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

// Shared, referentially stable fallback for absent collections. Using a single
// frozen array (instead of an inline `|| []` per render) keeps the props passed
// to the memoized leaf renderers stable, so a floor edit that only touches one
// collection (e.g. moving a door) skips re-rendering the untouched renderers.
const EMPTY = Object.freeze([]);

const FloorPlanLayer = memo(function FloorPlanLayer({ floor, filteredFloor, selectedId }) {
  useRenderProfile('FloorPlanLayer', {
    floor,
    filteredFloor,
    selectedId,
  });

  if (!floor || !filteredFloor) return null;

  const columns = filteredFloor.columns || EMPTY;

  return (
    <RenderProfilerScope name="FloorPlanLayer">
      <>
        <FixtureDefs />
        {(filteredFloor.slabs || EMPTY).map((slab) => (
          <SlabRenderer key={slab.id} slab={slab} selectedId={selectedId} />
        ))}
        <RoomRenderer rooms={filteredFloor.rooms} selectedId={selectedId} />
        <WallRenderer
          walls={filteredFloor.walls}
          columns={columns}
          doors={filteredFloor.doors || EMPTY}
          windows={filteredFloor.windows || EMPTY}
        />
        <BeamRenderer beams={filteredFloor.beams || EMPTY} columns={columns} />
        <StairRenderer stairs={filteredFloor.stairs || EMPTY} />
        <LandingRenderer landings={filteredFloor.landings || EMPTY} />
        <RailingRenderer railings={filteredFloor.railings || EMPTY} />
        <ColumnRenderer columns={columns} />
        <FixtureRenderer fixtures={filteredFloor.fixtures || EMPTY} />
        <DoorRenderer doors={filteredFloor.doors} walls={filteredFloor.walls} />
        <WindowRenderer windows={filteredFloor.windows} walls={filteredFloor.walls} />
        {(floor.sectionCuts || EMPTY).map((sectionCut) => (
          <SectionCutRenderer key={sectionCut.id} sectionCut={sectionCut} selectedId={selectedId} />
        ))}
        <AnnotationRenderer floor={floor} />
      </>
    </RenderProfilerScope>
  );
});

export default FloorPlanLayer;
