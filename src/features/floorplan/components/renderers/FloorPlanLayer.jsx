import { memo } from 'react';
import AnnotationRenderer from './AnnotationRenderer';
import BeamRenderer from './BeamRenderer';
import ColumnRenderer from './ColumnRenderer';
import DoorRenderer from './DoorRenderer';
import ElectricalRenderer from './ElectricalRenderer';
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

// The working canvas is not a drawing. A derived measurement on every wall —
// and on every room the moment a wall closes one — turns a dense plan into a
// lattice of overlapping labels, and the size of any one object is a click away
// in the properties panel. So the derived wall and room dimensions are
// suppressed here regardless of the floor's annotation settings. Those settings
// still mean what they always did on the sheets, where a plan without its
// dimensions is not a plan. Manual dimensions and the room name/area tags are
// untouched: someone placed the former on purpose, and the latter are identity,
// not measurement.
const PLAN_CANVAS_ANNOTATIONS = Object.freeze({ showWallDimensions: false, showRoomDimensions: false });

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
        <ElectricalRenderer devices={filteredFloor.electricalDevices || EMPTY} walls={filteredFloor.walls} />
        {(filteredFloor.sectionCuts || EMPTY).map((sectionCut) => (
          <SectionCutRenderer key={sectionCut.id} sectionCut={sectionCut} selectedId={selectedId} />
        ))}
        <AnnotationRenderer floor={filteredFloor} settingsOverrides={PLAN_CANVAS_ANNOTATIONS} />
      </>
    </RenderProfilerScope>
  );
});

export default FloorPlanLayer;
