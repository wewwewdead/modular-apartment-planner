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
import { MASONRY_FINISH_COAT, wallFastenerTonalMaterialKey, wallFinishMaterialKey } from '@/domain/wallFinishes';
import { accentAtPoint, resolveWallAccents, splitRectByAccents } from '@/domain/wallAccents';
import {
  FASTENER_APPEARANCE_MODES,
  deriveRainscreenPanels,
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
  // Tray plus the glass screen standing on it.
  shower: 1940,
};

/** A plant stands about a third taller than it is wide. */
const PLANT_HEIGHT_PER_WIDTH = 1.3;

function fixture3dHeight(fixture) {
  if (fixture.fixtureType === 'plant')
    return Math.max(200, Math.min(fixture.width, fixture.depth) * PLANT_HEIGHT_PER_WIDTH);
  return FIXTURE_3D_HEIGHTS[fixture.fixtureType] || 750;
}

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

/**
 * The three shared corten tones, in cycling order. Three instances for the whole
 * scene, not three per wall and certainly not one per cassette: the batcher
 * buckets on material identity, so a facade of a hundred panels drawn in a
 * hundred tones would be a hundred draw calls.
 */
const RAINSCREEN_TONE_KEYS = Object.freeze(['wallRainscreen', 'wallRainscreenWarm', 'wallRainscreenDeep']);

/**
 * Which tone a cassette wears, from where it sits on the module grid.
 *
 * Deterministic on purpose. A random shuffle would look right once and then
 * re-roll on the next rebuild, which both flickers the facade mid-drag and
 * defeats the descriptor carry-over that makes dragging cheap — the descriptor
 * would differ from the one before it every single frame. `column + 2·row` walks
 * the three tones one step along a course and two steps up a course, so no two
 * cassettes that share an edge share a tone.
 */
function rainscreenToneKey(panel) {
  const column = Number.isFinite(panel?.moduleColumn) ? panel.moduleColumn : (panel?.index ?? 1) - 1;
  const row = Number.isFinite(panel?.moduleRow) ? panel.moduleRow : 0;
  return RAINSCREEN_TONE_KEYS[(((column + 2 * row) % 3) + 3) % 3];
}

function boardMaterialKey(material) {
  if (material === WALL_BOARD_MATERIALS.PLYWOOD) return 'wallPlywood';
  if (material === WALL_BOARD_MATERIALS.RAINSCREEN) return RAINSCREEN_TONE_KEYS[0];
  return 'wallFiberCement';
}

/**
 * What a whole face is drawn in: its finish's key when it has one
 * (docs/wall-cladding-finishes.md §5.3), its board's stock key otherwise. A
 * stock face gets exactly the key it always did, which is what keeps a wall
 * nobody has painted byte-identical in 3D.
 */
function layerMaterialKey(layer, system) {
  return wallFinishMaterialKey(layer, system) || boardMaterialKey(layer.material);
}

/**
 * A board's material key, tone-cycled when the board is a stock rainscreen
 * cassette. A finished face is one finish on every board — a painted rainscreen
 * is one colour with its joints, not a quilt — so the cycle is stock only.
 */
function panelMaterialKey(layer, system, panel) {
  const finishKey = wallFinishMaterialKey(layer, system);
  if (finishKey) return finishKey;
  return layer.material === WALL_BOARD_MATERIALS.RAINSCREEN
    ? rainscreenToneKey(panel)
    : boardMaterialKey(layer.material);
}

function isRainscreenLayer(layer) {
  return layer.material === WALL_BOARD_MATERIALS.RAINSCREEN;
}

function fastenerMaterialKey(appearance, layer, system) {
  // A tonal screw head is painted with the face it sits in — a shade darker,
  // the dimple a painted-over screw still makes. Not the face's own material:
  // that drew the head pixel for pixel as the board around it
  // (docs/wall-fastener-visibility.md §2.2).
  if (appearance === FASTENER_APPEARANCE_MODES.TONAL) {
    return wallFastenerTonalMaterialKey(layerMaterialKey(layer, system));
  }
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

// Where a point of the wall's own u/v drawing lands in plan. `wall` here is
// always the body's axis, never the drawn one: a facade pushed clear of its
// columns carries its studs, boards and screws with it, and reading them off
// the line the wall was drawn on would leave the frame standing beside the
// wall it is inside.
function shiftedWallPoint(wall, position, normal, offset) {
  return add(positionOnWall(wall, position), scale(normal, offset));
}

function createWallPanelDescriptor(id, context, region, normal, layer, metadata) {
  const direction = wallDirection(context.sourceWall);
  const origin = shiftedWallPoint(context.bodyWall, 0, normal, layer.centerOffset);
  const planOutline = region.outline.map((point) =>
    shiftedWallPoint(context.bodyWall, point.u, normal, layer.centerOffset),
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

/**
 * Which segments of a wall's run are its first and last, and which way the wall
 * points — everything an overhanging board needs to know to run on past the end
 * of the wall without touching anything in between.
 *
 * A wall broken into three by two windows still has exactly two outer ends, and
 * only those two move. The openings in the middle are holes in the cladding, not
 * ends of it.
 */
function boardRunOf(segments, direction) {
  return {
    direction,
    firstId: segments[0]?.id ?? null,
    lastId: segments[segments.length - 1]?.id ?? null,
  };
}

function skinStartPoint(segment, layer, run) {
  return run && segment.id === run.firstId && layer.overhangStart
    ? add(segment.startPoint, scale(run.direction, -layer.overhangStart))
    : segment.startPoint;
}

function skinEndPoint(segment, layer, run) {
  return run && segment.id === run.lastId && layer.overhangEnd
    ? add(segment.endPoint, scale(run.direction, layer.overhangEnd))
    : segment.endPoint;
}

/**
 * The accents that show on one face of the wall in this context
 * (docs/wall-cladding-finishes.md §7.1), already placed and clipped in the
 * wall's own u/v. Empty for a face nobody has picked out — and every builder
 * below takes exactly its old path when this is empty.
 */
function faceAccentsOf(context, side) {
  if (!context) return [];
  return resolveWallAccents(context.wall, context.floor, side).filter((accent) => accent.visible);
}

/** An accent's palette key: the face's own key with the accent's finish on it (courses and all). */
function accentMaterialKey(layer, system, accent) {
  return wallFinishMaterialKey({ ...layer, finish: accent.finish }, system) || layerMaterialKey(layer, system);
}

/**
 * One rectangle of skin cut across the face's accents, or `null` when no accent
 * touches it — the caller then builds the descriptor it always built, under its
 * own id. Pieces are numbered per kind in tiling order, so the ids are the
 * same on every build: `<base id>:base:<n>` and `<base id>:accent:<id>:<n>`.
 */
function accentPiecesOf(baseId, rect, accents) {
  if (!accents.length) return null;
  const pieces = splitRectByAccents(rect, accents);
  if (pieces.length === 1 && pieces[0].accentId === null) return null;
  const counts = new Map();
  return pieces.map((piece) => {
    const name = piece.accentId ? `accent:${piece.accentId}` : 'base';
    const n = (counts.get(name) || 0) + 1;
    counts.set(name, n);
    return {
      id: `${baseId}:${name}:${n}`,
      rect: piece.rect,
      accent: piece.accentId ? accents.find((accent) => accent.id === piece.accentId) : null,
    };
  });
}

/** What an accent piece adds to the metadata of the board it was cut from. */
function accentPieceMetadata(metadata, layer, system, accent) {
  if (!accent) return metadata;
  return {
    ...metadata,
    materialKey: accentMaterialKey(layer, system, accent),
    // The editor's selection contract (`readAssemblyPart`): its pane lights the
    // accent the drawing selects, and a click there selects it back.
    wallDetailKind: 'accent',
    wallDetailElementId: accent.id,
  };
}

/** Distance along a wall's own line, unclamped — a lapped board runs past both ends. */
function alongWall(wall, point) {
  const direction = wallDirection(wall);
  return (point.x - wall.start.x) * direction.x + (point.y - wall.start.y) * direction.y;
}

/** A box of skin placed on the body's line from a rectangle in the wall's u/v. */
function skinPieceDescriptor(id, context, layer, normal, rect, metadata) {
  return createLinearBoxDescriptor(
    id,
    'wall',
    shiftedWallPoint(context.bodyWall, rect.u0, normal, layer.centerOffset),
    shiftedWallPoint(context.bodyWall, rect.u1, normal, layer.centerOffset),
    layer.buildUp,
    context.wallBase + rect.v0,
    rect.v1 - rect.v0,
    metadata,
  );
}

/**
 * A segment's skin box as pieces across the face's accents, or `null` to build
 * the stock box. The segment's rectangle is read off the very points the stock
 * box would be built between — the trimmed run, the lap on the first and last
 * segment — so the pieces cover exactly what the stock box covers.
 */
function accentedSegmentSkin(baseId, segment, layer, run, context, normal, accents, metadata, system) {
  if (!accents.length) return null;
  const rect = {
    u0: alongWall(context.bodyWall, skinStartPoint(segment, layer, run)),
    u1: alongWall(context.bodyWall, skinEndPoint(segment, layer, run)),
    v0: segment.baseElevation - context.wallBase,
    v1: segment.topElevation - context.wallBase,
  };
  const pieces = accentPiecesOf(baseId, rect, accents);
  if (!pieces) return null;
  return pieces.map((piece) =>
    skinPieceDescriptor(
      piece.id,
      context,
      layer,
      normal,
      piece.rect,
      accentPieceMetadata(metadata, layer, system, piece.accent),
    ),
  );
}

/** Board skins for the given faces, one box per wall segment per face. */
function buildSkinDescriptors(segments, layers, normal, assembly, run = null, context = null) {
  const accentsBySide = new Map(layers.map((layer) => [layer.side, faceAccentsOf(context, layer.side)]));
  return segments.flatMap((segment) =>
    layers.flatMap((layer) => {
      const delta = scale(normal, layer.centerOffset);
      const metadata = {
        sourceId: segment.wallId,
        floorId: segment.floorId,
        wallId: segment.wallId,
        wallAssembly: assembly,
        materialKey: layerMaterialKey(layer, assembly.system),
        assemblySide: layer.side,
        boardMaterial: layer.material,
      };
      const accented = accentedSegmentSkin(
        `${segment.id}:${layer.side}`,
        segment,
        layer,
        run,
        context,
        normal,
        accentsBySide.get(layer.side),
        metadata,
        assembly.system,
      );
      if (accented) return accented;
      return createLinearBoxDescriptor(
        `${segment.id}:${layer.side}`,
        'wall',
        add(skinStartPoint(segment, layer, run), delta),
        add(skinEndPoint(segment, layer, run), delta),
        layer.buildUp,
        segment.baseElevation,
        segment.topElevation - segment.baseElevation,
        metadata,
      );
    }),
  );
}

/**
 * A rainscreen face as separate cassettes with open joints between them.
 *
 * The gaps are the finish, so the skin cannot be one box: what makes a corten
 * facade read as a facade rather than as a brown wall is the shadow line every
 * 900 mm. The layout comes from the same panel generator the wall detail editor
 * draws, so what you see here is what an elevation of the wall shows and what
 * the bill counts.
 *
 * Openings need no handling of their own. Each cassette arrives already cut
 * against the doors and windows on the wall — a panel lapping a jamb comes back
 * as the fragments left over, and one that lands wholly inside an opening comes
 * back not at all.
 */
function buildRainscreenDescriptors(context, assembly, layer) {
  const normal = perpendicular(wallDirection(context.sourceWall));
  const accents = faceAccentsOf(context, layer.side);
  return deriveRainscreenPanels(context.wall, context.floor, layer.side).flatMap((panel) => {
    const materialKey = panelMaterialKey(layer, assembly.system, panel);
    return panel.fragments.flatMap((fragment, fragmentIndex) => {
      const id = `${panel.id}:cassette:${fragmentIndex + 1}:3d`;
      const metadata = {
        sourceId: context.wall.id,
        floorId: context.floorId,
        wallId: context.wall.id,
        wallAssembly: assembly,
        materialKey,
        assemblySide: layer.side,
        boardMaterial: layer.material,
        panelLabel: panel.label,
        panelFragmentIndex: fragmentIndex,
      };
      // A cassette an accent crosses is cut along it: the accent is painted
      // on the cassettes it lands on, and the open joints stay where they are.
      const pieces = accentPiecesOf(id, fragment, accents);
      if (pieces) {
        return pieces.map((piece) =>
          skinPieceDescriptor(
            piece.id,
            context,
            layer,
            normal,
            piece.rect,
            accentPieceMetadata(metadata, layer, assembly.system, piece.accent),
          ),
        );
      }
      return createLinearBoxDescriptor(
        id,
        'wall',
        shiftedWallPoint(context.bodyWall, fragment.u0, normal, layer.centerOffset),
        shiftedWallPoint(context.bodyWall, fragment.u1, normal, layer.centerOffset),
        layer.buildUp,
        context.wallBase + fragment.v0,
        fragment.v1 - fragment.v0,
        metadata,
      );
    });
  });
}

function buildFramingMemberDescriptors(context, assembly, options = {}) {
  const normal = perpendicular(wallDirection(context.sourceWall));
  const coreMaterialKey =
    assembly.framing.material === WALL_FRAME_MATERIALS.TIMBER ? 'wallFramingTimber' : 'wallFramingSteel';
  return deriveWallFramingMembers(context.wall, context.floor, options).map((member) =>
    createLinearBoxDescriptor(
      `${member.id}:3d`,
      'wall',
      shiftedWallPoint(context.bodyWall, member.u0, normal, member.frameOffset || 0),
      shiftedWallPoint(context.bodyWall, member.u1, normal, member.frameOffset || 0),
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

// One entry per wall object, valid while the floor it was built against is the
// same object: the members are a pure function of the wall and its floor (the
// context, the assembly and the layout all derive from those two), and both are
// replaced, never mutated, by the reducers — the rule `resolveWallDetailFrame`'s
// cache already relies on. Every framed wall builds its frame on every rebuild
// (§13), so without this a drag on one floor re-derived the studs of every
// framed wall on every other floor, fifteen times a second (measured in §13.6:
// about a fifth of what the members add to a drag frame).
const wallFrameCache = new WeakMap();

function wallFrameDescriptors(context, assembly) {
  const cached = wallFrameCache.get(context.wall);
  if (cached && cached.floor === context.floor) return cached.members;
  const members = buildFramingMemberDescriptors(context, assembly, { includeWhenDisabled: true });
  wallFrameCache.set(context.wall, { floor: context.floor, members });
  return members;
}

function buildDetailedWallObjects(context, assembly, layers) {
  const detailing = resolveWallDetailing(context.wall);
  const normal = perpendicular(wallDirection(context.sourceWall));
  const descriptors = buildFramingMemberDescriptors(context, assembly);

  for (const layer of layers) {
    const face = detailing.sides[layer.side];
    if (!face?.enabled) continue;
    const panels = deriveWallPanels(context.wall, context.floor, layer.side);
    const accents = faceAccentsOf(context, layer.side);
    for (const panel of panels) {
      if (panel.polygonal) {
        // A traced cut is not split: it wears the accent its centre lies in.
        const centroidAccent = accents.length
          ? accentAtPoint(accents, { u: (panel.u0 + panel.u1) / 2, v: (panel.v0 + panel.v1) / 2 })
          : null;
        panel.regions.forEach((region, regionIndex) => {
          descriptors.push(
            createWallPanelDescriptor(
              `${panel.id}:region:${regionIndex + 1}:3d`,
              context,
              region,
              normal,
              layer,
              detailedWallMetadata(context, assembly, {
                materialKey: centroidAccent
                  ? accentMaterialKey(layer, assembly.system, centroidAccent)
                  : panelMaterialKey(layer, assembly.system, panel),
                assemblySide: layer.side,
                boardMaterial: layer.material,
                wallDetailKind: 'panel',
                // The bare id the wall editor selects by, not the wall-and-side
                // qualified one, so its selection can drive the highlight here.
                wallDetailElementId: panel.localId,
                panelLabel: panel.label,
                panelRegionIndex: regionIndex,
                ...(centroidAccent ? { accentId: centroidAccent.id } : {}),
              }),
            ),
          );
        });
        continue;
      }
      panel.fragments.forEach((fragment, fragmentIndex) => {
        const id = `${panel.id}:fragment:${fragmentIndex + 1}:3d`;
        const metadata = detailedWallMetadata(context, assembly, {
          materialKey: panelMaterialKey(layer, assembly.system, panel),
          assemblySide: layer.side,
          boardMaterial: layer.material,
          wallDetailKind: 'panel',
          wallDetailElementId: panel.localId,
          panelLabel: panel.label,
          panelFragmentIndex: fragmentIndex,
        });
        const pieces = accentPiecesOf(id, fragment, accents);
        if (pieces) {
          for (const piece of pieces) {
            descriptors.push(
              skinPieceDescriptor(
                piece.id,
                context,
                layer,
                normal,
                piece.rect,
                accentPieceMetadata(metadata, layer, assembly.system, piece.accent),
              ),
            );
          }
          return;
        }
        descriptors.push(
          createLinearBoxDescriptor(
            id,
            'wall',
            shiftedWallPoint(context.bodyWall, fragment.u0, normal, layer.centerOffset),
            shiftedWallPoint(context.bodyWall, fragment.u1, normal, layer.centerOffset),
            layer.buildUp,
            context.wallBase + fragment.v0,
            fragment.v1 - fragment.v0,
            metadata,
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
        shiftedWallPoint(context.bodyWall, fastener.u, normal, surfaceOffset),
        { x: fastenerRadius * 2, y: fastenerRadius * 2, z: fastenerDepth },
        context.wallBase + fastener.v - fastenerRadius,
        Math.atan2(wallDirection(context.sourceWall).y, wallDirection(context.sourceWall).x),
        detailedWallMetadata(context, assembly, {
          materialKey: fastenerMaterialKey(fastenerSettings.appearance, layer, assembly.system),
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
  // opening-aware schematic skin while the opposite detailed face remains real —
  // unless it is a rainscreen, whose cassettes are the finish rather than a
  // documentation option and are laid out whether or not anyone detailed them.
  const undetailedLayers = layers.filter((layer) => !detailing.sides[layer.side]?.enabled);
  for (const layer of undetailedLayers.filter(isRainscreenLayer)) {
    descriptors.push(...buildRainscreenDescriptors(context, assembly, layer));
  }
  const fallbackLayers = undetailedLayers.filter((layer) => !isRainscreenLayer(layer));
  const fallbackSegments = buildWallSolidSegments(context);
  const fallbackRun = boardRunOf(fallbackSegments, wallDirection(context.bodyWall));
  const fallbackAccents = new Map(fallbackLayers.map((layer) => [layer.side, faceAccentsOf(context, layer.side)]));
  for (const segment of fallbackSegments) {
    const height = segment.topElevation - segment.baseElevation;
    fallbackLayers.forEach((layer) => {
      const delta = scale(normal, layer.centerOffset);
      const metadata = detailedWallMetadata(context, assembly, {
        materialKey: layerMaterialKey(layer, assembly.system),
        assemblySide: layer.side,
        boardMaterial: layer.material,
      });
      const accented = accentedSegmentSkin(
        `${segment.id}:${layer.side}`,
        segment,
        layer,
        fallbackRun,
        context,
        normal,
        fallbackAccents.get(layer.side),
        metadata,
        assembly.system,
      );
      if (accented) {
        descriptors.push(...accented);
        return;
      }
      descriptors.push(
        createLinearBoxDescriptor(
          `${segment.id}:${layer.side}`,
          'wall',
          add(skinStartPoint(segment, layer, fallbackRun), delta),
          add(skinEndPoint(segment, layer, fallbackRun), delta),
          layer.buildUp,
          segment.baseElevation,
          height,
          metadata,
        ),
      );
    });
  }
  return descriptors;
}

/**
 * A masonry wall with a finish on either face (docs/wall-cladding-finishes.md
 * §5.3), or `null` for a stock one — whose caller then builds the single box
 * per segment it always has, untouched.
 *
 * The block is one box, and a box is one material, so the two faces are told
 * apart by splitting it: the BODY takes the outside look, because the ends, the
 * jamb reveals and the top of a wall are what you see of it from the street,
 * and an INTERIOR SKIN `MASONRY_FINISH_COAT` thick takes the inside look. The
 * body gives up that coat's thickness and moves half of it outward, so body and
 * skin tile the wall's thickness exactly and both outer faces stay where they
 * were — the wall is the same size; only its colour is in two pieces. When both
 * faces look alike there is nothing to tell apart and it stays one box.
 *
 * "Outward" is read off the same sign `deriveWallAssemblyLayers` gives the
 * faces, against the same perpendicular the framed skins are offset along, so
 * a masonry wall's inside is the side a framed wall's inside board would be on.
 */
function buildFinishedMasonryDescriptors(context, segments, assembly) {
  const layers = deriveWallAssemblyLayers(assembly);
  const interior = layers.find((layer) => layer.side === 'interior');
  const exterior = layers.find((layer) => layer.side === 'exterior');
  const exteriorKey = wallFinishMaterialKey(exterior, assembly.system);
  const interiorKey = wallFinishMaterialKey(interior, assembly.system);
  if (!exteriorKey && !interiorKey) return null;

  const bodyKey = exteriorKey || 'wall';
  const skinKey = interiorKey || 'wall';
  const normal = perpendicular(wallDirection(context.renderWall));
  return segments.flatMap((segment) => {
    const metadata = {
      sourceId: segment.wallId,
      floorId: segment.floorId,
      wallId: segment.wallId,
      wallAssembly: assembly,
    };
    const height = segment.topElevation - segment.baseElevation;
    if (skinKey === bodyKey) {
      return [
        createLinearBoxDescriptor(
          segment.id,
          'wall',
          segment.startPoint,
          segment.endPoint,
          segment.thickness,
          segment.baseElevation,
          height,
          { ...metadata, materialKey: bodyKey },
        ),
      ];
    }
    // Never more than half the wall: a coat thicker than its own block would
    // turn the body inside out.
    const coat = Math.min(MASONRY_FINISH_COAT, segment.thickness / 2);
    const bodyShift = scale(normal, (-interior.sign * coat) / 2);
    const skinShift = scale(normal, (interior.sign * (segment.thickness - coat)) / 2);
    return [
      createLinearBoxDescriptor(
        segment.id,
        'wall',
        add(segment.startPoint, bodyShift),
        add(segment.endPoint, bodyShift),
        segment.thickness - coat,
        segment.baseElevation,
        height,
        { ...metadata, materialKey: bodyKey },
      ),
      createLinearBoxDescriptor(
        `${segment.id}:interior`,
        'wall',
        add(segment.startPoint, skinShift),
        add(segment.endPoint, skinShift),
        coat,
        segment.baseElevation,
        height,
        { ...metadata, materialKey: skinKey, assemblySide: 'interior' },
      ),
    ];
  });
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
      // One prism, so one look: the outside face's, which is what an arc wall
      // is seen by. No skin — an arc has no inside box to hang one on.
      const exteriorLayer = deriveWallAssemblyLayers(assembly).find((layer) => layer.side === 'exterior');
      return [
        createPrismDescriptor(context.wall.id, 'wall', outline, context.wallBase, context.wallTop - context.wallBase, {
          sourceId: context.wall.id,
          floorId: context.floorId,
          wallId: context.wall.id,
          materialKey: wallFinishMaterialKey(exteriorLayer, assembly.system) || 'wall',
          wallAssembly: assembly,
        }),
      ];
    }

    const segments = buildWallSolidSegments(context);
    if (assembly.system !== 'framed') {
      const finished = buildFinishedMasonryDescriptors(context, segments, assembly);
      if (finished) return finished;
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
    // Measured on the body's own untrimmed axis: a board's overhang is the
    // corner detail at the end of the WALL, and a wall cut back to a column face
    // is still the same length of wall.
    const boardRun = boardRunOf(segments, wallDirection(context.bodyWall));
    const layers = deriveWallAssemblyLayers(assembly, wallLength(context.bodyWall)).filter(
      (layer) => layer.material !== WALL_BOARD_MATERIALS.NONE && layer.buildUp > 0,
    );
    // The fallback core wears the framing's look under its own palette keys:
    // it stands in for studs but is not studs, and the see-through modes tier
    // by material — X-ray keeps the real members (`buildFramingMemberDescriptors`)
    // solid and ghosts this slab with the boards (docs/preview-xray-mode.md §12).
    // Since §13 the slab is only the fallback for a wall with no derivable
    // frame; every other framed wall draws its members (below).
    const coreMaterialKey =
      assembly.framing.material === WALL_FRAME_MATERIALS.TIMBER ? 'wallCoreTimber' : 'wallCoreSteel';

    // Board faces stripped for inspection. Whichever side is left keeps its
    // cladding, so you can strip one face and still read the wall's thickness.
    const hiddenSides = hiddenBoardSides.get(context.wall.id);
    const visibleLayers = hiddenSides ? layers.filter((layer) => !hiddenSides.includes(layer.side)) : layers;

    const detailing = resolveWallDetailing(context.wall);
    if (detailing.enabled && visibleLayers.some((layer) => detailing.sides[layer.side]?.enabled)) {
      return buildDetailedWallObjects(context, assembly, visibleLayers);
    }

    // A rainscreen leaves the segment loop entirely: its skin is a grid of
    // cassettes over the wall's whole resolved span, not one box per gap
    // between openings. Every other board keeps the schematic skin exactly as
    // it was — a wall with no rainscreen on it takes the same path, in the same
    // order, and builds the same descriptors it always did.
    const rainscreenLayers = visibleLayers.filter(isRainscreenLayer);
    const skinLayers = rainscreenLayers.length
      ? visibleLayers.filter((layer) => !isRainscreenLayer(layer))
      : visibleLayers;
    const rainscreen = rainscreenLayers.flatMap((layer) => buildRainscreenDescriptors(context, assembly, layer));

    // Every framed wall draws the studs, tracks, noggins and headers it is
    // actually built from, boarded or stripped, detailed or not — the contract a
    // ceiling's furring and hangers already have (`buildCeilingPreviewObjects`)
    // and the one the 2D plan keeps by drawing every stud. The layout derives
    // even when detailing is off: that flag governs documenting the wall, not
    // whether it has a frame. Opaque boards hide the members in Solid; X-ray and
    // Wireframe tier by material and show them (docs/preview-xray-mode.md §13).
    // Member ids are the generator's, so a rebuild carries them over and
    // batching folds them into one instanced call per framing material.
    const members = wallFrameDescriptors(context, assembly);
    if (members.length) {
      return [
        ...members,
        ...buildSkinDescriptors(segments, skinLayers, normal, assembly, boardRun, context),
        ...rainscreen,
      ];
    }

    // Fallback: a framed wall whose layout yields no members — a custom frame
    // with every member deleted, or every generated member removed — keeps a
    // core slab per segment between its boards, so it never vanishes and still
    // reads as thick as it is built.
    return [
      ...segments.flatMap((segment) => {
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
        return [core, ...buildSkinDescriptors([segment], skinLayers, normal, assembly, boardRun, context)];
      }),
      ...rainscreen,
    ];
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
    .map((opening) => {
      const desc = createOpeningInsertDescriptor(opening);
      desc.geometry = 'door';
      desc.doorType = opening.type || 'swing';
      desc.openDirection = opening.openDirection || 'left';
      return desc;
    });
}

/**
 * The middle of the floor's walls — a cheap stand-in for "inside" that is good
 * enough to tell which face of a window looks into the building.
 */
function wallEndpointCentre(walls = []) {
  if (!walls.length) return null;
  let x = 0;
  let y = 0;
  for (const wall of walls) {
    x += wall.start.x + wall.end.x;
    y += wall.start.y + wall.end.y;
  }
  return { x: x / (walls.length * 2), y: y / (walls.length * 2) };
}

/**
 * +1 when the window's local +z (the plan perpendicular `(-sin a, cos a)` of
 * its wall) points into the building, -1 when it points out. The preview hangs
 * the warm interior glow on that side of the glass, so from outside the sky
 * reflection is in front and the room is behind it.
 */
function windowInteriorSign(opening, centre) {
  if (!centre || !opening.centerPoint) return 1;
  const angle = opening.angle || 0;
  const dx = centre.x - opening.centerPoint.x;
  const dy = centre.y - opening.centerPoint.y;
  return -Math.sin(angle) * dx + Math.cos(angle) * dy >= 0 ? 1 : -1;
}

function buildWindowObjects(wallContexts, floor = null) {
  const centre = wallEndpointCentre(floor?.walls || []);
  return wallContexts
    .flatMap((context) => context.openings)
    .filter((opening) => opening.kind === 'window')
    .map((opening) => {
      const desc = createOpeningInsertDescriptor(opening);
      desc.geometry = 'window';
      desc.windowType = opening.type || 'standard';
      desc.openDirection = opening.openDirection || 'left';
      desc.interiorSign = windowInteriorSign(opening, centre);
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
        y: fixture3dHeight(fixture),
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

  const wallContexts = buildWallPreviewContexts(floor);

  return [
    ...buildSlabObjects(floor),
    ...buildWallObjects(wallContexts, options.hiddenBoardSides || EMPTY_HIDDEN_BOARDS),
    ...buildColumnObjects(floor, floorLevel),
    ...buildBeamObjects(floor),
    ...buildStairObjects(floor, floorLevel, landings, landingElevationMap),
    ...buildLandingObjects(floor, floorLevel, landingElevationMap),
    ...buildDoorObjects(wallContexts),
    ...buildWindowObjects(wallContexts, floor),
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
