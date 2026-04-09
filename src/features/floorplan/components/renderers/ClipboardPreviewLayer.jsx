import { buildManualDimensionFigures } from '@/annotations/dimensions';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';
import BeamRenderer from './BeamRenderer';
import ColumnRenderer from './ColumnRenderer';
import DoorRenderer from './DoorRenderer';
import RoomRenderer from './RoomRenderer';
import SectionCutRenderer from './SectionCutRenderer';
import SlabRenderer from './SlabRenderer';
import StairRenderer from './StairRenderer';
import WallRenderer from './WallRenderer';
import WindowRenderer from './WindowRenderer';

export default function ClipboardPreviewLayer({ content }) {
  if (!content) return null;

  const dimensions = buildManualDimensionFigures(content.annotations || []);

  return (
    <g className="clipboard-preview" opacity={0.48} style={{ pointerEvents: 'none' }}>
      {(content.slabs || []).map((slab) => (
        <SlabRenderer key={slab.id} slab={slab} selectedId={null} />
      ))}
      <RoomRenderer rooms={content.rooms || []} selectedId={null} />
      <WallRenderer walls={content.walls || []} columns={content.columns || []} />
      <BeamRenderer beams={content.beams || []} columns={content.columns || []} />
      <StairRenderer stairs={content.stairs || []} />
      <ColumnRenderer columns={content.columns || []} />
      <DoorRenderer doors={content.doors || []} walls={content.walls || []} />
      <WindowRenderer windows={content.windows || []} walls={content.walls || []} />
      {(content.sectionCuts || []).map((sectionCut) => (
        <SectionCutRenderer key={sectionCut.id} sectionCut={sectionCut} selectedId={null} />
      ))}
      <BlueprintAnnotationLayer dimensions={dimensions} tags={[]} className="clipboard-preview-annotations" />
    </g>
  );
}
