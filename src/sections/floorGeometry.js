import { getFloorElevation } from '@/domain/floorModels';
import { resolveWallVerticalSpan } from '@/domain/wallFit';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { landingOutline } from '@/geometry/landingGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { doorOutlineOnWall, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getSlabBottomLevel, getSlabTopLevel } from '@/elevations/slab';
import { buildSectionPrism, sectionCutIntervals, sectionProjectedFaces } from './geometry';

function buildWallGeometry(floor, cut) {
  const walls = [];
  const openings = [];
  for (const wall of floor.walls || []) {
    const renderData = getWallRenderData(wall, floor.columns || []);
    const span = resolveWallVerticalSpan(wall, floor);
    const faces = buildSectionPrism({
      id: `section-wall-${wall.id}`,
      category: 'wall',
      sourceId: wall.id,
      cut,
      outline: renderData.outline,
      bottom: span.base,
      top: span.top,
    });
    const wallOpenings = [];
    for (const [category, entries, outlineOnWall] of [
      ['door', floor.doors || [], doorOutlineOnWall],
      ['window', floor.windows || [], windowOutlineOnWall],
    ]) {
      for (const opening of entries.filter((entry) => entry.wallId === wall.id)) {
        const body = renderData.bodyWall;
        const info = outlineOnWall(body, opening);
        const bottom = Math.max(span.base, span.datum + (opening.sillHeight ?? 0));
        const top = Math.min(span.top, span.datum + (opening.sillHeight ?? 0) + (opening.height ?? 0));
        if (top <= bottom) continue;
        const footprint = [info.p1, info.p2, info.p3, info.p4];
        const cutIntervals = sectionCutIntervals(cut, footprint);
        const insertThickness =
          category === 'door'
            ? Math.max(35, Math.min(body.thickness * 0.22, 70))
            : Math.max(45, Math.min(body.thickness * 0.32, 90));
        const insertInfo = outlineOnWall({ ...body, thickness: insertThickness }, opening);
        const insertIntervals = sectionCutIntervals(cut, [insertInfo.p1, insertInfo.p2, insertInfo.p3, insertInfo.p4]);
        const common = {
          category,
          sourceId: opening.id,
          hostId: wall.id,
          bottom,
          top,
          actualWidth: opening.width,
          openingType: opening.type,
        };
        wallOpenings.push(
          ...cutIntervals.map((interval, index) => ({
            ...common,
            ...interval,
            id: `section-${category}-${opening.id}-cut-${index}`,
            renderMode: 'cut',
            depth: 0,
            isOpeningCut: true,
            insertIntervals: insertIntervals
              .map((insert) => ({
                left: Math.max(interval.left, insert.left),
                right: Math.min(interval.right, insert.right),
              }))
              .filter((insert) => insert.right > insert.left),
          })),
        );
        // Only the broad window/door faces are visible in projection. Its
        // thickness is a section detail, not a window on the end of a wall.
        const broadFaces = sectionProjectedFaces(cut, footprint).filter(
          (face) => face.edgeIndex === 0 || face.edgeIndex === 2,
        );
        wallOpenings.push(
          ...broadFaces.map((face) => ({
            ...common,
            ...face,
            id: `section-${category}-${opening.id}-face-${face.edgeIndex}`,
            renderMode: 'projection',
          })),
        );
      }
    }
    walls.push(
      ...faces.map((face) => ({
        ...face,
        apertures: face.renderMode === 'cut' ? wallOpenings.filter((opening) => opening.isOpeningCut) : [],
      })),
    );
    openings.push(...wallOpenings);
  }
  return { walls, openings };
}

export function buildFloorSectionGeometry(floor, cut, landingElevationMap) {
  const floorLevel = getFloorElevation(floor);
  const { walls, openings } = buildWallGeometry(floor, cut);
  const slabs = (floor.slabs || []).flatMap((slab) =>
    buildSectionPrism({
      id: `section-slab-${slab.id}`,
      category: 'slab',
      sourceId: slab.id,
      cut,
      outline: slab.boundaryPoints,
      holes: (slab.openings || []).map((opening) => opening.boundaryPoints || []),
      bottom: getSlabBottomLevel(slab),
      top: getSlabTopLevel(slab),
    }),
  );
  const columns = (floor.columns || []).flatMap((column) =>
    buildSectionPrism({
      id: `section-column-${column.id}`,
      category: 'column',
      sourceId: column.id,
      cut,
      outline: columnOutline(column),
      bottom: floorLevel,
      top: floorLevel + column.height,
    }),
  );
  const beams = (floor.beams || []).flatMap((beam) =>
    buildSectionPrism({
      id: `section-beam-${beam.id}`,
      category: 'beam',
      sourceId: beam.id,
      cut,
      outline: getBeamRenderData(beam, floor.columns || [])?.outline,
      bottom: beam.floorLevel - beam.depth,
      top: beam.floorLevel,
    }),
  );
  const landings = (floor.landings || []).flatMap((landing) => {
    const bottom = floorLevel + (landingElevationMap.get(landing.id) || 0);
    return buildSectionPrism({
      id: `section-landing-${landing.id}`,
      category: 'landing',
      sourceId: landing.id,
      cut,
      outline: landingOutline(landing),
      bottom,
      top: bottom + (landing.thickness ?? 200),
    });
  });
  const stairs = (floor.stairs || []).flatMap((stair) => {
    const data = getStairRenderData(stair);
    if (!data || !stair.numberOfRisers) return [];
    const base = floorLevel + (landingElevationMap.get(stair.startLandingAttachment?.landingId) || 0);
    const dx = (data.endPoint.x - data.startPoint.x) / stair.numberOfRisers;
    const dy = (data.endPoint.y - data.startPoint.y) / stair.numberOfRisers;
    return data.treads.flatMap((tread, index) =>
      buildSectionPrism({
        id: `section-stair-${stair.id}-${index}`,
        category: 'stair',
        sourceId: stair.id,
        cut,
        outline: [
          tread.start,
          { x: tread.start.x + dx, y: tread.start.y + dy },
          { x: tread.end.x + dx, y: tread.end.y + dy },
          tread.end,
        ],
        bottom: base + index * stair.riserHeight,
        top: base + (index + 1) * stair.riserHeight,
      }),
    );
  });
  return [...walls, ...slabs, ...columns, ...beams, ...landings, ...stairs, ...openings];
}
