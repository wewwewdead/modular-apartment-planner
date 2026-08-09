import { wallDirection, wallLength } from '@/geometry/wallGeometry';
import { add, perpendicular, scale } from '@/geometry/point';

export const WALL_ASSEMBLY_PRESETS = Object.freeze({
  CHB: 'chb',
  FIBER_CEMENT: 'fiber_cement',
  PLYWOOD: 'plywood',
  MIXED_BOARD: 'mixed_board',
});

export const WALL_BOARD_MATERIALS = Object.freeze({
  NONE: 'none',
  FIBER_CEMENT: 'fiber_cement',
  PLYWOOD: 'plywood',
});

export const WALL_FRAME_MATERIALS = Object.freeze({
  LIGHT_GAUGE_STEEL: 'light_gauge_steel',
  TIMBER: 'timber',
});

export const WALL_INTERIOR_SIDES = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
});

const BOARD_DEFAULT_THICKNESS = Object.freeze({
  [WALL_BOARD_MATERIALS.NONE]: 0,
  [WALL_BOARD_MATERIALS.FIBER_CEMENT]: 6,
  [WALL_BOARD_MATERIALS.PLYWOOD]: 12,
});

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function wholeNumber(value, fallback, min = 0, max = 10) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeBoardLayer(layer, fallbackMaterial) {
  const material = Object.values(WALL_BOARD_MATERIALS).includes(layer?.material) ? layer.material : fallbackMaterial;
  return {
    material,
    thickness: finitePositive(layer?.thickness, BOARD_DEFAULT_THICKNESS[material] || 0),
    layerCount: material === WALL_BOARD_MATERIALS.NONE ? 0 : wholeNumber(layer?.layerCount, 1, 1, 4),
  };
}

function presetDefaults(preset, legacyThickness = 150) {
  if (preset === WALL_ASSEMBLY_PRESETS.FIBER_CEMENT) {
    return {
      preset,
      system: 'framed',
      interior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, thickness: 6, layerCount: 1 },
      exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, thickness: 6, layerCount: 1 },
    };
  }
  if (preset === WALL_ASSEMBLY_PRESETS.PLYWOOD) {
    return {
      preset,
      system: 'framed',
      interior: { material: WALL_BOARD_MATERIALS.PLYWOOD, thickness: 12, layerCount: 1 },
      exterior: { material: WALL_BOARD_MATERIALS.PLYWOOD, thickness: 12, layerCount: 1 },
    };
  }
  if (preset === WALL_ASSEMBLY_PRESETS.MIXED_BOARD) {
    return {
      preset,
      system: 'framed',
      interior: { material: WALL_BOARD_MATERIALS.PLYWOOD, thickness: 12, layerCount: 1 },
      exterior: { material: WALL_BOARD_MATERIALS.FIBER_CEMENT, thickness: 6, layerCount: 1 },
    };
  }
  return {
    preset: WALL_ASSEMBLY_PRESETS.CHB,
    system: 'masonry',
    coreMaterial: 'chb',
    coreThickness: finitePositive(legacyThickness, 150),
    interior: { material: WALL_BOARD_MATERIALS.NONE, thickness: 0, layerCount: 0 },
    exterior: { material: WALL_BOARD_MATERIALS.NONE, thickness: 0, layerCount: 0 },
  };
}

export function createWallAssembly(preset = WALL_ASSEMBLY_PRESETS.CHB, overrides = {}, legacyThickness = 150) {
  const defaults = presetDefaults(preset, legacyThickness);
  if (defaults.system === 'masonry') {
    return {
      ...defaults,
      ...overrides,
      preset: WALL_ASSEMBLY_PRESETS.CHB,
      system: 'masonry',
      coreMaterial: 'chb',
      coreThickness: finitePositive(overrides.coreThickness, defaults.coreThickness),
      interior: normalizeBoardLayer(overrides.interior, WALL_BOARD_MATERIALS.NONE),
      exterior: normalizeBoardLayer(overrides.exterior, WALL_BOARD_MATERIALS.NONE),
      interiorSide:
        overrides.interiorSide === WALL_INTERIOR_SIDES.RIGHT ? WALL_INTERIOR_SIDES.RIGHT : WALL_INTERIOR_SIDES.LEFT,
      framing: null,
      engineeringStatus: 'modeled_only',
      professionalReviewRequired: true,
    };
  }

  const framing = overrides.framing || {};
  return {
    ...defaults,
    ...overrides,
    preset: Object.values(WALL_ASSEMBLY_PRESETS).includes(preset) ? preset : WALL_ASSEMBLY_PRESETS.MIXED_BOARD,
    system: 'framed',
    coreMaterial: null,
    coreThickness: 0,
    interior: normalizeBoardLayer(overrides.interior || defaults.interior, defaults.interior.material),
    exterior: normalizeBoardLayer(overrides.exterior || defaults.exterior, defaults.exterior.material),
    interiorSide:
      overrides.interiorSide === WALL_INTERIOR_SIDES.RIGHT ? WALL_INTERIOR_SIDES.RIGHT : WALL_INTERIOR_SIDES.LEFT,
    framing: {
      material: Object.values(WALL_FRAME_MATERIALS).includes(framing.material)
        ? framing.material
        : WALL_FRAME_MATERIALS.LIGHT_GAUGE_STEEL,
      studWidth: finitePositive(framing.studWidth, 50),
      studDepth: finitePositive(framing.studDepth, 75),
      spacing: finitePositive(framing.spacing, 400),
      startOffset: Math.max(0, Number(framing.startOffset) || 0),
      nogginRows: wholeNumber(framing.nogginRows, 1, 0, 6),
      frameCount: wholeNumber(framing.frameCount, 1, 1, 2),
      frameGap: Math.max(0, Number(framing.frameGap) || 0),
    },
    engineeringStatus: 'modeled_only',
    professionalReviewRequired: true,
  };
}

export function resolveWallAssembly(wall) {
  const preset = wall?.assembly?.preset || WALL_ASSEMBLY_PRESETS.CHB;
  return createWallAssembly(preset, wall?.assembly || {}, wall?.thickness || 150);
}

function boardBuildUp(layer) {
  return (layer?.thickness || 0) * (layer?.layerCount || 0);
}

export function wallAssemblyCoreDepth(assembly) {
  if (assembly.system !== 'framed') return finitePositive(assembly.coreThickness, 150);
  const framing = assembly.framing;
  return framing.studDepth * framing.frameCount + framing.frameGap * Math.max(0, framing.frameCount - 1);
}

/**
 * Returns the physical skin placement relative to the wall centreline.
 * "Left" and "right" are evaluated while looking from wall.start to wall.end.
 */
export function deriveWallAssemblyLayers(assembly) {
  const coreDepth = wallAssemblyCoreDepth(assembly);
  // Plan/SVG Y increases downward, so perpendicular(direction) points to the
  // viewer's right while looking from wall.start toward wall.end. Keep the
  // stored left/right meaning visual and physical, independent of that axis.
  const interiorSign = assembly.interiorSide === WALL_INTERIOR_SIDES.RIGHT ? 1 : -1;
  return [
    { side: 'interior', sign: interiorSign, layer: assembly.interior },
    { side: 'exterior', sign: -interiorSign, layer: assembly.exterior },
  ].map(({ side, sign, layer }) => {
    const buildUp = boardBuildUp(layer);
    return {
      side,
      sign,
      material: layer.material,
      thickness: layer.thickness,
      layerCount: layer.layerCount,
      buildUp,
      centerOffset: sign * (coreDepth / 2 + buildUp / 2),
    };
  });
}

export function wallAssemblyThickness(assembly) {
  if (assembly.system !== 'framed') return finitePositive(assembly.coreThickness, 150);
  return wallAssemblyCoreDepth(assembly) + boardBuildUp(assembly.interior) + boardBuildUp(assembly.exterior);
}

/**
 * Whether a true front-on elevation of this face runs opposite the wall's U
 * axis. U is anchored at wall.start, and a viewer standing on the
 * +perpendicular side (the viewer's right walking start → end) sees U grow to
 * their right. The face whose skin sits on the other side of the centreline is
 * viewed from the −perpendicular side, where U grows to the viewer's LEFT — so
 * an elevation of that face must mirror U to show what the installer sees,
 * matching the built wall in the 3D preview.
 */
export function wallFaceViewMirrorsU(assembly, side) {
  const interiorSign = assembly?.interiorSide === WALL_INTERIOR_SIDES.RIGHT ? 1 : -1;
  const faceSign = side === 'exterior' ? -interiorSign : interiorSign;
  return faceSign === -1;
}

function uniqueSorted(values, tolerance = 0.5) {
  return [...values]
    .sort((a, b) => a - b)
    .filter((value, index, entries) => index === 0 || Math.abs(value - entries[index - 1]) > tolerance);
}

function studOutline(wall, position, frameOffset, studWidth, studDepth) {
  const axis = wallDirection(wall);
  const normal = perpendicular(axis);
  const center = add(add(wall.start, scale(axis, position)), scale(normal, frameOffset));
  const along = scale(axis, studWidth / 2);
  const across = scale(normal, studDepth / 2);
  return [
    add(add(center, along), across),
    add(add(center, scale(along, -1)), across),
    add(add(center, scale(along, -1)), scale(across, -1)),
    add(add(center, along), scale(across, -1)),
  ];
}

export function deriveWallFramingLayout(wall, openings = []) {
  const assembly = resolveWallAssembly(wall);
  if (assembly.system !== 'framed' || wall?.controlPoint) {
    return { studs: [], studCount: 0, totalLinearLengthMm: 0, assembly };
  }

  const length = wallLength(wall);
  if (!length) return { studs: [], studCount: 0, totalLinearLengthMm: 0, assembly };
  const frame = assembly.framing;
  const openingRanges = openings.map((opening) => ({
    min: Math.max(0, (opening.offset || 0) - (opening.width || 0) / 2),
    max: Math.min(length, (opening.offset || 0) + (opening.width || 0) / 2),
    kind: opening.openingKind || 'opening',
  }));
  const positions = [0, length, ...openingRanges.flatMap((range) => [range.min, range.max])];
  const firstRegular = frame.startOffset > 0 ? frame.startOffset : frame.spacing;
  for (let position = firstRegular; position < length; position += frame.spacing) {
    if (!openingRanges.some((range) => position > range.min && position < range.max)) positions.push(position);
  }

  const frameOffsets =
    frame.frameCount === 2 ? [-(frame.studDepth + frame.frameGap) / 2, (frame.studDepth + frame.frameGap) / 2] : [0];
  const studs = frameOffsets.flatMap((frameOffset, frameIndex) =>
    uniqueSorted(positions).map((position) => ({
      id: `${wall.id}:frame-${frameIndex + 1}:stud-${Math.round(position * 10)}`,
      frameIndex,
      position,
      frameOffset,
      outline: studOutline(wall, position, frameOffset, frame.studWidth, frame.studDepth),
    })),
  );
  const headerLength = openingRanges.reduce(
    (total, range) => total + (range.max - range.min + frame.studWidth * 2) * frame.frameCount,
    0,
  );
  const windowSillLength = openingRanges
    .filter((range) => range.kind === 'window')
    .reduce((total, range) => total + (range.max - range.min) * frame.frameCount, 0);
  const platesLength = length * 2 * frame.frameCount;
  const nogginLength = length * frame.nogginRows * frame.frameCount;
  const studLength = studs.length * Math.max(0, Number(wall.height) || 0);

  return {
    assembly,
    studs,
    studCount: studs.length,
    totalLinearLengthMm: studLength + platesLength + nogginLength + headerLength + windowSillLength,
    components: { studLength, platesLength, nogginLength, headerLength, windowSillLength },
  };
}

export function boardLayerAreaMultiplier(assembly, material) {
  return [assembly.interior, assembly.exterior].reduce(
    (total, layer) => total + (layer.material === material ? layer.layerCount : 0),
    0,
  );
}
