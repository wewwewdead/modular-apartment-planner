import { useEffect, useState } from 'react';
import AnnotationRenderer from './AnnotationRenderer';
import BeamRenderer from './BeamRenderer';
import ColumnRenderer from './ColumnRenderer';
import DoorRenderer from './DoorRenderer';
import FixtureDefs from './FixtureDefs';
import FixtureRenderer from './FixtureRenderer';
import ElevationSceneLayer from './ElevationSceneLayer';
import LandingRenderer from './LandingRenderer';
import RoomRenderer from './RoomRenderer';
import RoofRenderer from './RoofRenderer';
import RoofDrainageRenderer from './RoofDrainageRenderer';
import RoofScheduleRenderer from './RoofScheduleRenderer';
import SectionCutRenderer from './SectionCutRenderer';
import SectionSceneLayer from './SectionSceneLayer';
import SlabRenderer from './SlabRenderer';
import StairRenderer from './StairRenderer';
import TrussDetailRenderer from './TrussDetailRenderer';
import TrussRenderer from './TrussRenderer';
import WallRenderer from './WallRenderer';
import WindowRenderer from './WindowRenderer';
import SitePlanOverlay from './SitePlanOverlay';
import SheetPreviewPlaceholder from './SheetPreviewPlaceholder';
import BuildingReportRenderer from './BuildingReportRenderer';
import StructuralGridOverlay from './StructuralGridOverlay';
import { deriveConceptualLoadPath } from '@/domain/structuralCoordination';
import WetCoreOverlay from './WetCoreOverlay';

// The sheet axonometric is a presentation image: the same white-model render
// the live preview shows, not the flat shaded box. The plans on a sheet stay
// drafting — that is a PDF exporter constraint, not a choice.
const SHEET_PREVIEW_OPTIONS = {
  width: 1600,
  height: 1000,
  preset: 'iso_northeast',
  style: 'realistic',
};
const sheetPreviewCache = new Map();
// The cache key each project + floor + view last rendered under. Every edit
// stamps a new `updatedAt`, so without this the cache kept one full-size PNG
// data URL per edit for as long as the page lived; only the latest is ever
// shown again.
const sheetPreviewKeyBySlot = new Map();

function getSheetPreviewSlotKey(source) {
  return [
    source?.project?.id || 'project',
    source?.activeFloorId || 'all',
    SHEET_PREVIEW_OPTIONS.width,
    SHEET_PREVIEW_OPTIONS.height,
    SHEET_PREVIEW_OPTIONS.preset,
    SHEET_PREVIEW_OPTIONS.style,
  ].join(':');
}

function getSheetPreviewCacheKey(source) {
  return [
    source?.project?.id || 'project',
    source?.project?.updatedAt || 'snapshot',
    source?.activeFloorId || 'all',
    SHEET_PREVIEW_OPTIONS.width,
    SHEET_PREVIEW_OPTIONS.height,
    SHEET_PREVIEW_OPTIONS.preset,
    SHEET_PREVIEW_OPTIONS.style,
  ].join(':');
}

export function renderSheetPreviewImage(source) {
  const cacheKey = getSheetPreviewCacheKey(source);
  if (!sheetPreviewCache.has(cacheKey)) {
    const slotKey = getSheetPreviewSlotKey(source);
    const supersededKey = sheetPreviewKeyBySlot.get(slotKey);
    if (supersededKey && supersededKey !== cacheKey) sheetPreviewCache.delete(supersededKey);
    sheetPreviewKeyBySlot.set(slotKey, cacheKey);
    sheetPreviewCache.set(
      cacheKey,
      import('@/features/floorplan/components/preview/renderToImage')
        .then(({ renderSceneToImage }) => {
          const imageUrl = renderSceneToImage(source.project, {
            activeFloorId: source.activeFloorId,
            width: SHEET_PREVIEW_OPTIONS.width,
            height: SHEET_PREVIEW_OPTIONS.height,
            preset: SHEET_PREVIEW_OPTIONS.preset,
            style: SHEET_PREVIEW_OPTIONS.style,
          });

          return imageUrl ? { status: 'ready', imageUrl } : { status: 'empty', imageUrl: null };
        })
        .catch((error) => {
          sheetPreviewCache.delete(cacheKey);
          throw error;
        }),
    );
  }

  return sheetPreviewCache.get(cacheKey);
}

function PlanViewportContent({ floor }) {
  return (
    <>
      {(floor.slabs || []).map((slab) => (
        <SlabRenderer key={slab.id} slab={slab} selectedId={null} />
      ))}
      <RoomRenderer rooms={floor.rooms} selectedId={null} interactive={false} />
      <WallRenderer
        walls={floor.walls}
        columns={floor.columns || []}
        doors={floor.doors || []}
        windows={floor.windows || []}
      />
      <BeamRenderer beams={floor.beams || []} columns={floor.columns || []} />
      <StairRenderer stairs={floor.stairs || []} />
      <LandingRenderer landings={floor.landings || []} />
      <ColumnRenderer columns={floor.columns || []} />
      <FixtureDefs />
      <FixtureRenderer fixtures={floor.fixtures || []} />
      <DoorRenderer doors={floor.doors} walls={floor.walls} />
      <WindowRenderer windows={floor.windows} walls={floor.walls} />
      {(floor.sectionCuts || []).map((sc) => (
        <SectionCutRenderer key={sc.id} sectionCut={sc} selectedId={null} />
      ))}
      <AnnotationRenderer floor={floor} />
    </>
  );
}

// The load path of the project a structural viewport draws, kept per project
// object: both of the sheet canvas's renderers draw the same scene, and every
// structural viewport on a sheet shares its project. Read-only to its consumers.
const loadPathCache = new WeakMap();

function cachedConceptualLoadPath(project) {
  if (!project || typeof project !== 'object') return deriveConceptualLoadPath(project);
  let loadPath = loadPathCache.get(project);
  if (!loadPath) {
    loadPath = deriveConceptualLoadPath(project);
    loadPathCache.set(project, loadPath);
  }
  return loadPath;
}

function StructuralPlanViewportContent({ source }) {
  const floor = source.floor;
  return (
    <>
      {(floor.slabs || []).map((slab) => (
        <SlabRenderer key={slab.id} slab={slab} selectedId={null} />
      ))}
      <BeamRenderer beams={floor.beams || []} columns={floor.columns || []} />
      <ColumnRenderer columns={floor.columns || []} />
      <StructuralGridOverlay
        structuralSystem={source.project?.building?.systems?.structural}
        floor={floor}
        loadPath={cachedConceptualLoadPath(source.project)}
      />
    </>
  );
}

function ServicesPlanViewportContent({ source }) {
  return (
    <>
      <PlanViewportContent floor={source.floor} />
      <WetCoreOverlay
        plumbingSystem={source.project?.building?.systems?.plumbing}
        electricalSystem={source.project?.building?.systems?.electrical}
        waterSystem={source.project?.building?.systems?.water}
        mechanicalSystem={source.project?.building?.systems?.mechanical}
        egressSystem={source.project?.building?.systems?.egress}
        floor={source.floor}
      />
    </>
  );
}

function ThreePreviewViewportContent({ source }) {
  const previewKey = source?.project ? getSheetPreviewCacheKey(source) : null;
  const [renderedPreview, setRenderedPreview] = useState({
    key: null,
    status: 'loading',
    imageUrl: null,
  });

  useEffect(() => {
    if (!previewKey || !source?.project) return undefined;

    let cancelled = false;

    renderSheetPreviewImage(source)
      .then((result) => {
        if (cancelled) return;
        setRenderedPreview({
          key: previewKey,
          ...result,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to render sheet 3D preview:', error);
        setRenderedPreview({
          key: previewKey,
          status: 'error',
          imageUrl: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [previewKey, source]);

  const previewState = !previewKey
    ? { status: 'empty', imageUrl: null }
    : renderedPreview.key === previewKey
      ? renderedPreview
      : { status: 'loading', imageUrl: null };

  const { bounds } = source;

  if (previewState.status !== 'ready' || !previewState.imageUrl) {
    return <SheetPreviewPlaceholder bounds={bounds} status={previewState.status} />;
  }

  return (
    <image
      data-sheet-preview-style={SHEET_PREVIEW_OPTIONS.style}
      href={previewState.imageUrl}
      x={bounds.minX}
      y={bounds.minY}
      width={bounds.maxX - bounds.minX}
      height={bounds.maxY - bounds.minY}
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
    />
  );
}

export default function SheetViewportContent({ source }) {
  if (!source || source.kind === 'empty') return null;

  if (source.kind === 'plan') {
    return <PlanViewportContent floor={source.floor} />;
  }

  if (source.kind === 'structural_plan') {
    return <StructuralPlanViewportContent source={source} />;
  }

  if (source.kind === 'services_plan') {
    return <ServicesPlanViewportContent source={source} />;
  }

  if (source.kind === 'site_plan') {
    return (
      <>
        <SitePlanOverlay site={source.site} />
        <PlanViewportContent floor={source.floor} />
      </>
    );
  }

  if (source.kind === 'building_report') {
    return <BuildingReportRenderer report={source.report} />;
  }

  // Every roof of the building, drawn into the one view.
  if (source.kind === 'roof_plan') {
    return source.roofSystems.map((roofSystem) => (
      <RoofRenderer key={roofSystem.id} roofSystem={roofSystem} interactive={false} />
    ));
  }

  if (source.kind === 'truss_plan') {
    return <TrussRenderer floor={source.floor} trussSystems={source.trussSystems} />;
  }

  if (source.kind === 'truss_detail') {
    return (
      <TrussDetailRenderer
        trussSystem={source.trussSystem}
        trussInstanceId={source.trussInstanceId}
        showTitle={false}
      />
    );
  }

  if (source.kind === 'roof_drainage') {
    return source.roofSystems.map((roofSystem) => (
      <RoofDrainageRenderer key={roofSystem.id} roofSystem={roofSystem} interactive={false} />
    ));
  }

  if (source.kind === 'roof_schedule') {
    return <RoofScheduleRenderer schedule={source.schedule} showTitle={false} />;
  }

  if (source.kind === '3d_preview') {
    return <ThreePreviewViewportContent source={source} />;
  }

  if (source.kind === 'section' || source.kind === 'roof_section') {
    return <SectionSceneLayer scene={source.scene} showTitle={false} />;
  }

  if (source.kind === 'elevation') {
    return <ElevationSceneLayer scene={source.scene} annotationScene={source.annotationScene} showTitle={false} />;
  }

  if (source.kind === 'roof_elevation') {
    return <ElevationSceneLayer scene={source.scene} annotationScene={null} showTitle={false} />;
  }

  return null;
}
