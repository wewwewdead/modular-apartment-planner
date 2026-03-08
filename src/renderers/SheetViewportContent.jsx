import { useEffect, useState } from 'react';
import AnnotationRenderer from './AnnotationRenderer';
import BeamRenderer from './BeamRenderer';
import ColumnRenderer from './ColumnRenderer';
import DoorRenderer from './DoorRenderer';
import ElevationSceneLayer from './ElevationSceneLayer';
import LandingRenderer from './LandingRenderer';
import RoomRenderer from './RoomRenderer';
import SectionCutRenderer from './SectionCutRenderer';
import SectionSceneLayer from './SectionSceneLayer';
import SlabRenderer from './SlabRenderer';
import StairRenderer from './StairRenderer';
import WallRenderer from './WallRenderer';
import WindowRenderer from './WindowRenderer';

function PlanViewportContent({ floor }) {
  return (
    <>
      {(floor.slabs || []).map(slab => (
        <SlabRenderer key={slab.id} slab={slab} selectedId={null} />
      ))}
      <RoomRenderer rooms={floor.rooms} selectedId={null} />
      <WallRenderer walls={floor.walls} columns={floor.columns || []} />
      <BeamRenderer beams={floor.beams || []} columns={floor.columns || []} />
      <StairRenderer stairs={floor.stairs || []} />
      <LandingRenderer landings={floor.landings || []} />
      <ColumnRenderer columns={floor.columns || []} />
      <DoorRenderer doors={floor.doors} walls={floor.walls} />
      <WindowRenderer windows={floor.windows} walls={floor.walls} />
      {(floor.sectionCuts || []).map(sc => (
        <SectionCutRenderer key={sc.id} sectionCut={sc} selectedId={null} />
      ))}
      <AnnotationRenderer floor={floor} />
    </>
  );
}

function ThreePreviewViewportContent({ source }) {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    if (!source?.project) return;
    let cancelled = false;

    import('@/three/viewer/renderToImage').then(({ renderSceneToImage }) => {
      if (cancelled) return;
      const url = renderSceneToImage(source.project, {
        activeFloorId: source.activeFloorId,
        width: 1600,
        height: 1000,
      });
      if (!cancelled) setImageUrl(url);
    });

    return () => { cancelled = true; };
  }, [source?.project, source?.activeFloorId]);

  if (!imageUrl) {
    return (
      <text x={8000} y={5000} textAnchor="middle" fontSize={400} fill="#8899aa">
        Rendering 3D preview...
      </text>
    );
  }

  const { bounds } = source;
  return (
    <image
      href={imageUrl}
      x={bounds.minX}
      y={bounds.minY}
      width={bounds.maxX - bounds.minX}
      height={bounds.maxY - bounds.minY}
    />
  );
}

export default function SheetViewportContent({ source }) {
  if (!source || source.kind === 'empty') return null;

  if (source.kind === 'plan') {
    return <PlanViewportContent floor={source.floor} />;
  }

  if (source.kind === '3d_preview') {
    return <ThreePreviewViewportContent source={source} />;
  }

  if (source.kind === 'section') {
    return <SectionSceneLayer scene={source.scene} showTitle={false} />;
  }

  if (source.kind === 'elevation') {
    return (
      <ElevationSceneLayer
        scene={source.scene}
        annotationScene={source.annotationScene}
        showTitle={false}
      />
    );
  }

  return null;
}
