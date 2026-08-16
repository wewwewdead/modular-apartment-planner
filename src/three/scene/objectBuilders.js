import { ELECTRICAL_PLATE } from '@/domain/defaults';
import { getFloorElevation } from '@/domain/floorModels';
import { getSlabBottomLevel } from '@/elevations/slab';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { computeLandingElevation } from '@/geometry/landingGeometry';
import { isValidSlabBoundary } from '@/geometry/slabGeometry';
import { getRailingStairProfile } from '@/geometry/railingGeometry';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { positionOnWall, wallAngle, wallDirection, wallLength, wallOutline } from '@/geometry/wallGeometry';
import { add, perpendicular, scale } from '@/geometry/point';
import { arcWallOutline } from '@/geometry/filletGeometry';
import { buildWallPreviewContexts, buildWallSolidSegments } from './wallPreviewContext';
import {
  WALL_BOARD_MATERIALS,
  WALL_FRAME_MATERIALS,
  deriveWallAssemblyLayers,
  resolveWallAssembly,
  wallAssemblyCoreDepth,
} from '@/domain/wallAssemblies';
import {
  FASTENER_APPEARANCE_MODES,
  deriveWallFasteners,
  deriveWallFramingMembers,
  deriveWallPanels,
  resolveWallDetailing,
} from '@/domain/wallDetailing';

const FIXTURE_3D_HEIGHTS = {
  kitchenTop: 900,
  toilet: 400,
  lavatory: 850,
  table: 750,
  tv: 750,
  sofa: 800,
  bed: 550,
};

const DOOR_INSERT_THICKNESS_MIN = 35;
const DOOR_INSERT_THICKNESS_MAX = 70;
const WINDOW_INSERT_THICKNESS_MIN = 45;
const WINDOW_INSERT_THICKNESS_MAX = 90;

function createBoundsFromPoints(points, baseElevation, topElevation) {
  if (!points?.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minElevation: baseElevation,
      maxElevation: topElevation,
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minElevation: baseElevation,
    maxElevation: topElevation,
  };
}

function createPrismDescriptor(id, kind, outline, baseElevation, height, metadata = {}) {
  const topElevation = baseElevation + height;
  return {
    id,
    kind,
    geometry: 'prism',
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    holes: (metadata.holes || []).map((hole) => hole.map((point) => ({ x: point.x, y: point.y }))),
    baseElevation,
    height,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, topElevation),
  };
}

function createLinearBoxDescriptor(id, kind, startPoint, endPoint, width, baseElevation, height, metadata = {}) {
  const outline = wallOutline({
    start: { x: startPoint.x, y: startPoint.y },
    end: { x: endPoint.x, y: endPoint.y },
    thickness: width,
  });
  const direction = wallDirection({
    start: { x: startPoint.x, y: startPoint.y },
    end: { x: endPoint.x, y: endPoint.y },
  });
  const topElevation = baseElevation + height;

  return {
    id,
    kind,
    geometry: 'box',
    center: {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    },
    size: {
      x: wallLength({ start: startPoint, end: endPoint }),
      y: height,
      z: width,
    },
    rotation: Math.atan2(direction.y, direction.x),
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, topElevation),
  };
}

function createBoxDescriptor(id, kind, center, size, baseElevation, rotation = 0, metadata = {}) {
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners = [
    { x: -halfX, y: -halfZ },
    { x: halfX, y: -halfZ },
    { x: halfX, y: halfZ },
    { x: -halfX, y: halfZ },
  ].map((point) => ({
    x: center.x + (point.x * cos - point.y * sin),
    y: center.y + (point.x * sin + point.y * cos),
  }));

  return {
    id,
    kind,
    geometry: 'box',
    center: { x: center.x, y: center.y },
    size,
    rotation,
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(corners, baseElevation, baseElevation + size.y),
  };
}

function resolveLandingElevation(landing, stairs, floorLevel) {
  if (landing.elevation) return landing.elevation;
  return computeLandingElevation(landing, stairs, floorLevel) - floorLevel;
}

function resolveStairBaseElevation(stair, floorLevel, landingElevationMap) {
  if (stair?.startLandingAttachment) {
    const elev = landingElevationMap?.get(stair.startLandingAttachment.landingId);
    if (elev != null) return floorLevel + elev;
  }
  return floorLevel;
}

/**
 * Absolute base elevation for every stair across all floors. Railings attach to
 * stairs by plan position regardless of which floor holds the stair — a railing
 * drawn on the upper floor over the stairwell must follow the flight arriving
 * from the floor below, so each candidate carries its own floor's base.
 */
export function buildStairElevationContexts(floors = []) {
  return floors.flatMap((floor) => {
    const stairs = floor.stairs || [];
    if (!stairs.length) return [];
    const floorLevel = getFloorElevation(floor);
    const landings = floor.landings || [];
    const landingElevationMap = new Map(landings.map((l) => [l.id, resolveLandingElevation(l, stairs, floorLevel)]));
    return stairs.map((stair) => ({
      stair,
      floorId: floor.id,
      baseElevation: resolveStairBaseElevation(stair, floorLevel, landingElevationMap),
    }));
  });
}

function createStairDescriptor(stair, floorLevel, floorId, landings, landingElevationMap) {
  const renderData = getStairRenderData(stair);
  if (!renderData?.outline?.length) return null;

  const baseElevation = resolveStairBaseElevation(stair, floorLevel, landingElevationMap);

  return {
    id: stair.id,
    kind: 'stair',
    geometry: 'stair',
    startPoint: { ...stair.startPoint },
    width: stair.width,
    numberOfRisers: stair.numberOfRisers,
    riserHeight: stair.riserHeight,
    treadDepth: stair.treadDepth,
    angle: renderData.angle,
    baseElevation,
    materialKey: 'stair',
    metadata: {
      sourceId: stair.id,
      floorId,
    },
    bounds: createBoundsFromPoints(renderData.outline, baseElevation, baseElevation + renderData.totalRise),
  };
}

function boardMaterialKey(material) {
  return material === WALL_BOARD_MATERIALS.PLYWOOD ? 'wallPlywood' : 'wallFiberCement';
}

function fastenerMaterialKey(appearance, boardMaterial) {
  if (appearance === FASTENER_APPEARANCE_MODES.TONAL) return boardMaterialKey(boardMaterial);
  if (appearance === FASTENER_APPEARANCE_MODES.CONTRAST) return 'wallFastenerContrast';
  if (appearance === FASTENER_APPEARANCE_MODES.CONSTRUCTION) return 'wallFastenerConstruction';
  return 'wallFastener';
}

function detailedWallMetadata(context, assembly, extra = {}) {
  return {
    sourceId: context.wall.id,
    floorId: context.floorId,
    wallId: context.wall.id,
    wallAssembly: assembly,
    wallDetail: true,
    ...extra,
  };
}

function shiftedWallPoint(wall, position, normal, offset) {
  return add(positionOnWall(wall, position), scale(normal, offset));
}

function createWallPanelDescriptor(id, context, region, normal, layer, metadata) {
  const direction = wallDirection(context.sourceWall);
  const origin = shiftedWallPoint(context.sourceWall, 0, normal, layer.centerOffset);
  const planOutline = region.outline.map((point) =>
    shiftedWallPoint(context.sourceWall, point.u, normal, layer.centerOffset),
  );
  const minV = Math.min(...region.outline.map((point) => point.v));
  const maxV = Math.max(...region.outline.map((point) => point.v));
  return {
    id,
    kind: 'wall',
    geometry: 'wallPanel',
    outline: region.outline.map((point) => ({ x: point.u, y: point.v })),
    holes: (region.holes || []).map((hole) => hole.map((point) => ({ x: point.u, y: point.v }))),
    origin,
    rotation: Math.atan2(direction.y, direction.x),
    baseElevation: context.wallBase,
    depth: layer.buildUp,
    materialKey: metadata.materialKey,
    metadata,
    bounds: createBoundsFromPoints(planOutline, context.wallBase + minV, context.wallBase + maxV),
  };
}

const EMPTY_HIDDEN_BOARDS = new Map();

/** Board skins for the given faces, one box per wall segment per face. */
function buildSkinDescriptors(segments, layers, normal, assembly) {
  return segments.flatMap((segment) =>
    layers.map((layer) => {
      const delta = scale(normal, layer.centerOffset);
      return createLinearBoxDescriptor(
        `${segment.id}:${layer.side}`,
        'wall',
        add(segment.startPoint, delta),
        add(segment.endPoint, delta),
        layer.buildUp,
        segment.baseElevation,
        segment.topElevation - segment.baseElevation,
        {
          sourceId: segment.wallId,
          floorId: segment.floorId,
          wallId: segment.wallId,
          wallAssembly: assembly,
          materialKey: boardMaterialKey(layer.material),
          assemblySide: layer.side,
          boardMaterial: layer.material,
        },
      );
    }),
  );
}

function buildFramingMemberDescriptors(context, assembly, options = {}) {
  const normal = perpendicular(wallDirection(context.sourceWall));
  const coreMaterialKey =
    assembly.framing.material === WALL_FRAME_MATERIALS.TIMBER ? 'wallFramingTimber' : 'wallFramingSteel';
  return deriveWallFramingMembers(context.wall, context.floor, options).map((member) =>
    createLinearBoxDescriptor(
      `${member.id}:3d`,
      'wall',
      shiftedWallPoint(context.sourceWall, member.u0, normal, member.frameOffset || 0),
      shiftedWallPoint(context.sourceWall, member.u1, normal, member.frameOffset || 0),
      member.depth,
      context.wallBase + member.v0,
      member.v1 - member.v0,
      detailedWallMetadata(context, assembly, {
        materialKey: coreMaterialKey,
        assemblySide: 'core',
        wallDetailKind: 'framing',
        wallDetailElementId: member.id,
        framingKind: member.kind,
      }),
    ),
  );
}

function buildDetailedWallObjects(context, assembly, layers) {
  const detailing = resolveWallDetailing(context.wall);
  const normal = perpendicular(wallDirection(context.sourceWall));
  const descriptors = buildFramingMemberDescriptors(context, assembly);

  for (const layer of layers) {
    const face = detailing.sides[layer.side];
    if (!face?.enabled) continue;
    const panels = deriveWallPanels(context.wall, context.floor, layer.side);
    for (const panel of panels) {
      if (panel.polygonal) {
        panel.regions.forEach((region, regionIndex) => {
          descriptors.push(
            createWallPanelDescriptor(
              `${panel.id}:region:${regionIndex + 1}:3d`,
              context,
              region,
              normal,
              layer,
              detailedWallMetadata(context, assembly, {
                materialKey: boardMaterialKey(layer.material),
                assemblySide: layer.side,
                boardMaterial: layer.material,
                wallDetailKind: 'panel',
                // The bare id the wall editor selects by, not the wall-and-side
                // qualified one, so its selection can drive the highlight here.
                wallDetailElementId: panel.localId,
                panelLabel: panel.label,
                panelRegionIndex: regionIndex,
              }),
            ),
          );
        });
        continue;
      }
      panel.fragments.forEach((fragment, fragmentIndex) => {
        descriptors.push(
          createLinearBoxDescriptor(
            `${panel.id}:fragment:${fragmentIndex + 1}:3d`,
            'wall',
            shiftedWallPoint(context.sourceWall, fragment.u0, normal, layer.centerOffset),
            shiftedWallPoint(context.sourceWall, fragment.u1, normal, layer.centerOffset),
            layer.buildUp,
            context.wallBase + fragment.v0,
            fragment.v1 - fragment.v0,
            detailedWallMetadata(context, assembly, {
              materialKey: boardMaterialKey(layer.material),
              assemblySide: layer.side,
              boardMaterial: layer.material,
              wallDetailKind: 'panel',
              wallDetailElementId: panel.localId,
              panelLabel: panel.label,
              panelFragmentIndex: fragmentIndex,
            }),
          ),
        );
      });
    }

    const fastenerSettings = detailing.sides[layer.side].fasteners;
    const fastenerRadius = fastenerSettings.headDiameter / 2;
    const fastenerDepth = fastenerSettings.appearance === FASTENER_APPEARANCE_MODES.TONAL ? 1.5 : 3;
    const surfaceOffset = layer.centerOffset + layer.sign * (layer.buildUp / 2 + 2);
    for (const fastener of deriveWallFasteners(context.wall, context.floor, layer.side)) {
      const descriptor = createBoxDescriptor(
        `${fastener.id}:3d`,
        'wall',
        shiftedWallPoint(context.sourceWall, fastener.u, normal, surfaceOffset),
        { x: fastenerRadius * 2, y: fastenerRadius * 2, z: fastenerDepth },
        context.wallBase + fastener.v - fastenerRadius,
        Math.atan2(wallDirection(context.sourceWall).y, wallDirection(context.sourceWall).x),
        detailedWallMetadata(context, assembly, {
          materialKey: fastenerMaterialKey(fastenerSettings.appearance, layer.material),
          assemblySide: layer.side,
          wallDetailKind: 'fastener',
          wallDetailElementId: fastener.id,
          fastenerType: fastener.type,
        }),
      );
      descriptor.geometry = 'fastener';
      descriptor.radius = fastenerRadius;
      descriptor.depth = fastenerDepth;
      descriptors.push(descriptor);
    }
  }

  // A face that has not opted into explicit panelization keeps the existing
  // opening-aware schematic skin while the opposite detailed face remains real.
  const fallbackLayers = layers.filter((layer) => !detailing.sides[layer.side]?.enabled);
  for (const segment of buildWallSolidSegments(context)) {
    const height = segment.topElevation - segment.baseElevation;
    fallbackLayers.forEach((layer) => {
      const delta = scale(normal, layer.centerOffset);
      descriptors.push(
        createLinearBoxDescriptor(
          `${segment.id}:${layer.side}`,
          'wall',
          add(segment.startPoint, delta),
          add(segment.endPoint, delta),
          layer.buildUp,
          segment.baseElevation,
          height,
          detailedWallMetadata(context, assembly, {
            materialKey: boardMaterialKey(layer.material),
            assemblySide: layer.side,
            boardMaterial: layer.material,
          }),
        ),
      );
    });
  }
  return descriptors;
}

function buildWallObjects(wallContexts, hiddenBoardSides = EMPTY_HIDDEN_BOARDS) {
  return wallContexts.flatMap((context) => {
    const assembly = resolveWallAssembly(context.wall);
    // Arc walls: create prism directly from wall geometry, skip segment splitting
    // (positionOnWall uses linear interpolation which gives wrong endpoints for arcs)
    if (context.wall.controlPoint) {
      const outline = arcWallOutline({
        start: context.renderWall.start,
        end: context.renderWall.end,
        controlPoint: context.wall.controlPoint,
        thickness: context.renderWall.thickness,
      });
      return [
        createPrismDescriptor(context.wall.id, 'wall', outline, context.wallBase, context.wallTop - context.wallBase, {
          sourceId: context.wall.id,
          floorId: context.floorId,
          wallId: context.wall.id,
          materialKey: 'wall',
          wallAssembly: assembly,
        }),
      ];
    }

    const segments = buildWallSolidSegments(context);
    if (assembly.system !== 'framed') {
      return segments.map((segment) =>
        createLinearBoxDescriptor(
          segment.id,
          'wall',
          segment.startPoint,
          segment.endPoint,
          segment.thickness,
          segment.baseElevation,
          segment.topElevation - segment.baseElevation,
          {
            sourceId: segment.wallId,
            floorId: segment.floorId,
            wallId: segment.wallId,
            materialKey: 'wall',
            wallAssembly: assembly,
          },
        ),
      );
    }

    const normal = perpendicular(wallDirection(context.renderWall));
    const layers = deriveWallAssemblyLayers(assembly).filter(
      (layer) => layer.material !== WALL_BOARD_MATERIALS.NONE && layer.buildUp > 0,
    );
    const coreMaterialKey =
      assembly.framing.material === WALL_FRAME_MATERIALS.TIMBER ? 'wallFramingTimber' : 'wallFramingSteel';

    // Board faces stripped for inspection. Whichever side is left keeps its
    // cladding, so you can strip one face and still read the wall's thickness.
    const hiddenSides = hiddenBoardSides.get(context.wall.id);
    const visibleLayers = hiddenSides ? layers.filter((layer) => !hiddenSides.includes(layer.side)) : layers;

    const detailing = resolveWallDetailing(context.wall);
    if (detailing.enabled && visibleLayers.some((layer) => detailing.sides[layer.side]?.enabled)) {
      return buildDetailedWallObjects(context, assembly, visibleLayers);
    }

    // With a face stripped, show the studs, tracks and noggins the wall is
    // actually built from rather than the slab that stands in for them. The
    // layout derives even when detailing is off — that flag governs drawing the
    // wall, not whether it has a frame. A wall with no derivable members falls
    // through to the core slab so it never vanishes.
    if (visibleLayers.length < layers.length) {
      const members = buildFramingMemberDescriptors(context, assembly, { includeWhenDisabled: true });
      if (members.length) {
        return [...members, ...buildSkinDescriptors(segments, visibleLayers, normal, assembly)];
      }
    }

    return segments.flatMap((segment) => {
      const metadata = {
        sourceId: segment.wallId,
        floorId: segment.floorId,
        wallId: segment.wallId,
        wallAssembly: assembly,
      };
      const height = segment.topElevation - segment.baseElevation;
      const core = createLinearBoxDescriptor(
        `${segment.id}:core`,
        'wall',
        segment.startPoint,
        segment.endPoint,
        wallAssemblyCoreDepth(assembly),
        segment.baseElevation,
        height,
        { ...metadata, materialKey: coreMaterialKey, assemblySide: 'core' },
      );
      return [core, ...buildSkinDescriptors([segment], visibleLayers, normal, assembly)];
    });
  });
}

function buildSlabObjects(floor) {
  return (floor.slabs || [])
    .filter((slab) => isValidSlabBoundary(slab.boundaryPoints))
    .map((slab) =>
      createPrismDescriptor(slab.id, 'slab', slab.boundaryPoints, getSlabBottomLevel(slab), slab.thickness ?? 0, {
        sourceId: slab.id,
        floorId: floor.id,
        holes: (slab.openings || []).map((opening) => opening.boundaryPoints || []),
      }),
    );
}

function buildColumnObjects(floor, floorLevel) {
  return (floor.columns || []).map((column) =>
    createBoxDescriptor(
      column.id,
      'column',
      { x: column.x, y: column.y },
      {
        x: column.width,
        y: column.height,
        z: column.depth,
      },
      floorLevel,
      ((column.rotation || 0) * Math.PI) / 180,
      {
        sourceId: column.id,
        floorId: floor.id,
      },
    ),
  );
}

function buildBeamObjects(floor) {
  return (floor.beams || [])
    .map((beam) => {
      const renderData = getBeamRenderData(beam, floor.columns || []);
      if (!renderData) return null;

      return createLinearBoxDescriptor(
        beam.id,
        'beam',
        renderData.start,
        renderData.end,
        beam.width,
        beam.floorLevel - beam.depth,
        beam.depth,
        {
          sourceId: beam.id,
          floorId: floor.id,
        },
      );
    })
    .filter(Boolean);
}

function getInsertThickness(kind, wallThickness) {
  if (kind === 'door') {
    return Math.max(DOOR_INSERT_THICKNESS_MIN, Math.min(wallThickness * 0.22, DOOR_INSERT_THICKNESS_MAX));
  }

  return Math.max(WINDOW_INSERT_THICKNESS_MIN, Math.min(wallThickness * 0.32, WINDOW_INSERT_THICKNESS_MAX));
}

function createOpeningInsertDescriptor(opening) {
  return createBoxDescriptor(
    opening.id,
    opening.kind,
    opening.centerPoint,
    {
      x: opening.visibleWidth,
      y: opening.visibleHeight,
      z: getInsertThickness(opening.kind, opening.wallThickness),
    },
    opening.visibleBaseElevation,
    opening.angle,
    {
      sourceId: opening.sourceId,
      floorId: opening.metadata.floorId,
      wallId: opening.wallId,
      openingKind: opening.kind,
    },
  );
}

function buildDoorObjects(wallContexts) {
  return wallContexts
    .flatMap((context) => context.openings)
    .filter((opening) => opening.kind === 'door')
    .map((opening) => createOpeningInsertDescriptor(opening));
}

function buildWindowObjects(wallContexts) {
  return wallContexts
    .flatMap((context) => context.openings)
    .filter((opening) => opening.kind === 'window')
    .map((opening) => {
      const desc = createOpeningInsertDescriptor(opening);
      desc.geometry = 'window';
      desc.windowType = opening.type || 'standard';
      desc.openDirection = opening.openDirection || 'left';
      return desc;
    });
}

function buildStairObjects(floor, floorLevel, landings, landingElevationMap) {
  return (floor.stairs || [])
    .map((stair) => createStairDescriptor(stair, floorLevel, floor.id, landings, landingElevationMap))
    .filter(Boolean);
}

function buildLandingObjects(floor, floorLevel, landingElevationMap) {
  return (floor.landings || []).map((landing) =>
    createBoxDescriptor(
      landing.id,
      'landing',
      { x: landing.position.x, y: landing.position.y },
      {
        x: landing.width,
        y: landing.thickness ?? 200,
        z: landing.depth,
      },
      floorLevel + (landingElevationMap.get(landing.id) || 0),
      ((landing.rotation || 0) * Math.PI) / 180,
      {
        sourceId: landing.id,
        floorId: floor.id,
      },
    ),
  );
}

function buildFixtureObjects(floor, floorLevel) {
  // Sit fixtures on top of the highest slab surface (or floorLevel if no slabs)
  // +1mm offset prevents z-fighting where fixture bottom meets slab top
  const slabs = floor.slabs || [];
  const slabTop = slabs.length > 0 ? Math.max(...slabs.map((s) => s.elevation ?? floorLevel)) : floorLevel;
  const fixtureBase = Math.max(slabTop, floorLevel) + 1;

  return (floor.fixtures || []).map((fixture) => {
    const descriptor = createBoxDescriptor(
      fixture.id,
      'fixture',
      { x: fixture.x, y: fixture.y },
      {
        x: fixture.width,
        y: FIXTURE_3D_HEIGHTS[fixture.fixtureType] || 750,
        z: fixture.depth,
      },
      fixtureBase,
      ((fixture.rotation || 0) * Math.PI) / 180,
      {
        sourceId: fixture.id,
        floorId: floor.id,
        materialKey: 'fixture_' + fixture.fixtureType,
      },
    );
    descriptor.geometry = 'fixture';
    descriptor.fixtureType = fixture.fixtureType;
    return descriptor;
  });
}

function buildElectricalDeviceObjects(floor, floorLevel) {
  const walls = floor.walls || [];
  return (floor.electricalDevices || [])
    .map((device) => {
      const wall = walls.find((w) => w.id === device.wallId);
      if (!wall) return null;
      // Plan centre sits half a plate proud of the mounted face; `mountHeight`
      // is the plate centre, matching how device heights are called out on site.
      const sideSign = device.side === 'left' ? -1 : 1;
      const outset = sideSign * ((wall.thickness + ELECTRICAL_PLATE.depth) / 2);
      const center = add(positionOnWall(wall, device.offset), scale(perpendicular(wallDirection(wall)), outset));
      const descriptor = createBoxDescriptor(
        device.id,
        'electricalDevice',
        center,
        { x: ELECTRICAL_PLATE.width, y: ELECTRICAL_PLATE.height, z: ELECTRICAL_PLATE.depth },
        floorLevel + Math.max(0, (device.mountHeight ?? 300) - ELECTRICAL_PLATE.height / 2),
        wallAngle(wall),
        { sourceId: device.id, floorId: floor.id, materialKey: 'electricalPlate' },
      );
      descriptor.geometry = 'electricalDevice';
      descriptor.deviceType = device.deviceType;
      // Which local ±z the faceplate details face: +perpendicular ('right') maps
      // to local +z after the plan→world rotation, 'left' to −z.
      descriptor.faceSign = sideSign;
      return descriptor;
    })
    .filter(Boolean);
}

function buildRailingObjects(floor, floorLevel, landingElevationMap, crossFloorStairContexts = []) {
  const ownStairs = floor.stairs || [];
  return (floor.railings || []).map((railing) => {
    const type = railing.type || 'guardrail';

    // Railings drawn along a stair follow its run instead of sitting flat.
    // Own-floor stairs take precedence; otherwise fall back to stairs from
    // other floors (a stairwell railing drawn on the arrival floor must follow
    // the flight coming up from below).
    let profile = getRailingStairProfile(railing, ownStairs);
    let stairBase = null;
    if (profile) {
      stairBase = resolveStairBaseElevation(profile.stair, floorLevel, landingElevationMap);
    } else if (crossFloorStairContexts.length) {
      profile = getRailingStairProfile(
        railing,
        crossFloorStairContexts.map((context) => context.stair),
      );
      if (profile) {
        const context = crossFloorStairContexts.find((candidate) => candidate.stair === profile.stair);
        stairBase = context ? context.baseElevation : null;
      }
    }

    let startElevation = floorLevel;
    let endElevation = floorLevel;
    if (profile && stairBase != null) {
      startElevation = stairBase + profile.startRise;
      endElevation = stairBase + profile.endRise;
    }

    const descriptor = createLinearBoxDescriptor(
      railing.id,
      'railing',
      railing.startPoint,
      railing.endPoint,
      railing.width,
      (startElevation + endElevation) / 2,
      railing.height,
      {
        sourceId: railing.id,
        floorId: floor.id,
        materialKey: 'railing_' + type,
      },
    );
    descriptor.geometry = 'railing';
    descriptor.railingType = type;
    descriptor.slopeRise = endElevation - startElevation;
    if (descriptor.slopeRise !== 0) {
      descriptor.bounds.minElevation = Math.min(startElevation, endElevation);
      descriptor.bounds.maxElevation = Math.max(startElevation, endElevation) + railing.height;
    }
    return descriptor;
  });
}

export function buildFloorPreviewObjects(floor, options = {}) {
  const floorLevel = getFloorElevation(floor);
  const landings = floor.landings || [];
  const stairs = floor.stairs || [];

  const landingElevationMap = new Map(landings.map((l) => [l.id, resolveLandingElevation(l, stairs, floorLevel)]));
  const crossFloorStairContexts = (options.stairContexts || []).filter((context) => context.floorId !== floor.id);

  const wallContexts = buildWallPreviewContexts(floor, floorLevel);

  return [
    ...buildSlabObjects(floor),
    ...buildWallObjects(wallContexts, options.hiddenBoardSides || EMPTY_HIDDEN_BOARDS),
    ...buildColumnObjects(floor, floorLevel),
    ...buildBeamObjects(floor),
    ...buildStairObjects(floor, floorLevel, landings, landingElevationMap),
    ...buildLandingObjects(floor, floorLevel, landingElevationMap),
    ...buildDoorObjects(wallContexts),
    ...buildWindowObjects(wallContexts),
    ...buildFixtureObjects(floor, floorLevel),
    ...buildElectricalDeviceObjects(floor, floorLevel),
    ...buildRailingObjects(floor, floorLevel, landingElevationMap, crossFloorStairContexts),
  ];
}

export function buildFloorSystemsPreviewObjects(floor, systems = {}) {
  const floorLevel = getFloorElevation(floor);
  const floorHeight = floor.floorToFloorHeight ?? 3000;
  const electrical = systems.electrical || {};
  const water = systems.water || {};
  const mechanical = systems.mechanical || {};
  const plumbing = systems.plumbing || {};
  const boxes = [
    ...(electrical.riserZones || [])
      .filter((entry) => entry.servedFloorIds?.includes(floor.id))
      .map((entry) =>
        createBoxDescriptor(
          entry.id,
          'electricalRiser',
          entry.origin,
          { x: entry.width, y: floorHeight, z: entry.depth },
          floorLevel,
          0,
          { sourceId: entry.id, floorId: floor.id, materialKey: 'systemElectrical' },
        ),
      ),
    ...(electrical.panelZones || [])
      .filter((entry) => entry.floorId === floor.id)
      .map((entry) =>
        createBoxDescriptor(
          entry.id,
          'electricalPanel',
          entry.origin,
          { x: entry.width, y: 1800, z: entry.depth },
          floorLevel,
          entry.rotation || 0,
          { sourceId: entry.id, floorId: floor.id, materialKey: 'systemElectrical' },
        ),
      ),
    ...(water.equipmentZones || [])
      .filter((entry) => entry.floorId === floor.id)
      .map((entry) =>
        createBoxDescriptor(
          entry.id,
          entry.kind,
          entry.origin,
          { x: entry.width, y: entry.kind === 'water_tank' ? 1800 : 900, z: entry.depth },
          floorLevel,
          entry.rotation || 0,
          { sourceId: entry.id, floorId: floor.id, materialKey: 'systemWater' },
        ),
      ),
    ...(mechanical.outdoorUnitZones || [])
      .filter((entry) => entry.floorId === floor.id)
      .map((entry) =>
        createBoxDescriptor(
          entry.id,
          entry.kind,
          entry.origin,
          { x: entry.width, y: 900, z: entry.depth },
          floorLevel,
          entry.rotation || 0,
          { sourceId: entry.id, floorId: floor.id, materialKey: 'systemMechanical' },
        ),
      ),
    ...(electrical.points || [])
      .filter((entry) => entry.floorId === floor.id)
      .map((entry) =>
        createBoxDescriptor(
          entry.id,
          'electricalPoint',
          entry.position,
          { x: 120, y: 120, z: 120 },
          floorLevel + 1100,
          0,
          { sourceId: entry.id, floorId: floor.id, materialKey: 'systemElectrical' },
        ),
      ),
  ];
  const routes = (plumbing.drainageRoutes || [])
    .filter((entry) => entry.floorId === floor.id)
    .flatMap((route) =>
      (route.points || [])
        .slice(1)
        .map((point, index) =>
          createLinearBoxDescriptor(
            `${route.id}_segment_${index + 1}`,
            'drainageRoute',
            route.points[index],
            point,
            60,
            floorLevel + 40,
            60,
            { sourceId: route.id, floorId: floor.id, materialKey: 'systemWater' },
          ),
        ),
    );
  return [...boxes, ...routes];
}
