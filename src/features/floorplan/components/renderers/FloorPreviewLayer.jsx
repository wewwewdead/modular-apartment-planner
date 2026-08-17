import { memo } from 'react';
import { getFloorElevation } from '@/domain/floorModels';
import BeamPreview from './BeamPreview';
import CantileverPreview from './CantileverPreview';
import CeilingBeamPickOverlay from './CeilingBeamPickOverlay';
import CeilingPreview from './CeilingPreview';
import ColumnPreview from './ColumnPreview';
import DimensionPreview from './DimensionPreview';
import DoorWindowPreview from './DoorWindowPreview';
import ElectricalPreview from './ElectricalPreview';
import FilletPreview from './FilletPreview';
import FixturePreview from './FixturePreview';
import LandingPreview from './LandingPreview';
import RailingPreview from './RailingPreview';
import RoomPreview from './RoomPreview';
import SectionCutPreview from './SectionCutPreview';
import SlabEditPreview from './SlabEditPreview';
import SlabPreview from './SlabPreview';
import StairPreview from './StairPreview';
import WallPreview from './WallPreview';

const FloorPreviewLayer = memo(function FloorPreviewLayer({ toolState, activeTool, floor, selectedId, selectedType }) {
  if (!floor) return null;

  return (
    <>
      <RoomPreview toolState={toolState} activeTool={activeTool} />
      <DimensionPreview toolState={toolState} activeTool={activeTool} />
      <WallPreview toolState={toolState} activeTool={activeTool} />
      <SlabPreview toolState={toolState} activeTool={activeTool} />
      {/* Belongs to the select tool, not the slab tool: it reports an edge drag
          on a slab that already exists. */}
      <SlabEditPreview toolState={toolState} />
      {/* The typed alternative to that drag. It works one already-selected
          plate, so unlike the placement previews it needs the selection. */}
      <CantileverPreview
        toolState={toolState}
        activeTool={activeTool}
        floor={floor}
        selectedId={selectedId}
        selectedType={selectedType}
      />
      <CeilingPreview toolState={toolState} activeTool={activeTool} />
      <CeilingBeamPickOverlay toolState={toolState} activeTool={activeTool} floor={floor} />
      <BeamPreview
        toolState={toolState}
        activeTool={activeTool}
        columns={floor.columns || []}
        floorLevel={getFloorElevation(floor)}
      />
      <StairPreview toolState={toolState} activeTool={activeTool} floorId={floor.id} />
      <DoorWindowPreview toolState={toolState} activeTool={activeTool} walls={floor.walls} />
      <ElectricalPreview toolState={toolState} activeTool={activeTool} walls={floor.walls} />
      <SectionCutPreview toolState={toolState} activeTool={activeTool} />
      <RailingPreview toolState={toolState} activeTool={activeTool} />
      <ColumnPreview toolState={toolState} activeTool={activeTool} />
      <LandingPreview toolState={toolState} activeTool={activeTool} />
      <FixturePreview toolState={toolState} activeTool={activeTool} />
      <FilletPreview toolState={toolState} activeTool={activeTool} />
    </>
  );
});

export default FloorPreviewLayer;
