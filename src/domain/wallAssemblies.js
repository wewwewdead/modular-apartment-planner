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
  RAINSCREEN: 'rainscreen',
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
  // A rainscreen layer is a cassette, not a sheet. The face of a weathering
  // steel cassette is only about 3 mm, but nobody hangs 3 mm of steel flat on a
  // wall — it is folded into a tray with a return leg, and the tray is what
  // occupies the wall's build-up. 8 mm is the depth that tray takes once its
  // return is counted, and it is also what a fibre-cement rainscreen cassette
  // measures outright, so the same number serves whichever product the facade
  // is finally specified in. The drained cavity behind it is battens and air,
  // not board, so it stays out of the layer thickness the way it stays out of
  // a real board schedule.
  [WALL_BOARD_MATERIALS.RAINSCREEN]: 8,
});

/**
 * The facade module a rainscreen skin panelizes on.
 *
 * A rainscreen is not sheet goods cut to fit. It arrives as cassettes on a
 * setting-out grid, and the grid is the architecture — the joints are the only
 * lines the facade has, so they are laid out before anything else and the
 * building is dimensioned to them. 900 × 1800 is the metric cassette module
 * that reads at street scale: wide enough that a storey takes two courses
 * rather than four, narrow enough that a bay still shows several joints.
 *
 * `joint` is the gap between cassettes, and it is an OPEN joint — the water
 * that gets past it drains down the cavity behind, which is the whole idea of a
 * rainscreen. That makes it wider than the 6 mm express joint the sheet layout
 * defaults to, where the two boards are on one plane and the joint is closed:
 * 10 mm is about the practical minimum for a gap that has to be drained and
 * back-ventilated, and it is what casts the shadow line the facade is for.
 *
 * Sizes are the cassette face; the pitch is face + joint, matching the sheet
 * grid's convention so one layout generator serves both.
 */
export const RAINSCREEN_MODULE = Object.freeze({
  width: 900,
  height: 1800,
  joint: 10,
});

/** What a board layer is worth switching to when its material changes. */
export function boardDefaultThickness(material) {
  return BOARD_DEFAULT_THICKNESS[material] || 0;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function wholeNumber(value, fallback, min = 0, max = 10) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * The furthest a board layer may be run past — or pulled back from — the end of
 * the wall it is hung on.
 *
 * An overhang is a corner detail, not a cantilever: the number a builder types
 * here is the build-up of the wall around the corner, so that this wall's board
 * closes over the cut edge of that one's. A metre is already far more than any
 * wall is thick, and capping it stops a mistyped 4000 from throwing a board
 * clean across the plan before anyone notices.
 */
export const BOARD_OVERHANG_LIMIT = 1000;

// What has to survive between the two setbacks. A board pulled back from both
// ends by half its own wall would invert, and an inverted rectangle draws as
// nothing anywhere while still being billed — so the span keeps a millimetre.
const MIN_BOARD_RUN = 1;

function boardOverhangValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return clampValue(number, -BOARD_OVERHANG_LIMIT, BOARD_OVERHANG_LIMIT);
}

function normalizeBoardLayer(layer, fallbackMaterial) {
  const material = Object.values(WALL_BOARD_MATERIALS).includes(layer?.material) ? layer.material : fallbackMaterial;
  const bare = material === WALL_BOARD_MATERIALS.NONE;
  return {
    material,
    thickness: finitePositive(layer?.thickness, BOARD_DEFAULT_THICKNESS[material] || 0),
    layerCount: bare ? 0 : wholeNumber(layer?.layerCount, 1, 1, 4),
    // No board, no overhang — the same reason a bare face carries no layers.
    overhangStart: bare ? 0 : boardOverhangValue(layer?.overhangStart),
    overhangEnd: bare ? 0 : boardOverhangValue(layer?.overhangEnd),
  };
}

/**
 * The stretch of the wall's own U axis a board layer covers — the ONE place a
 * board's extent is derived, and what the plan skin, the 3D boxes, the panel
 * grid, the cassette grid, the detail drawing and the bill all measure from.
 *
 * Two bypass-framed walls meeting at a corner each stop their boards at their
 * own wall end, which leaves the corner open and the neighbour's cut edge on
 * show. `overhangStart` / `overhangEnd` run this wall's board PAST that end —
 * typically by the neighbour's build-up — so it laps over and closes the corner.
 * A negative value is the other half of the same detail: the wall being lapped
 * pulls its board back so the two do not double up in the same 8 mm of air.
 *
 * The core never moves. This is cladding, and a stud that ran past its own plate
 * would be a framing error rather than a facade decision.
 */
export function boardLayerUSpan(layer, length) {
  const run = Math.max(0, Number.isFinite(Number(length)) ? Number(length) : 0);
  // Neither setback may eat more than its half of the wall, so whatever the two
  // are set to the board still has a run left to be drawn and cut from.
  const maximumSetback = Math.max(0, (run - MIN_BOARD_RUN) / 2);
  const start = Math.max(-maximumSetback, boardOverhangValue(layer?.overhangStart));
  const end = Math.max(-maximumSetback, boardOverhangValue(layer?.overhangEnd));
  // `start ? -start : 0` rather than a bare negation: -0 is a real value in
  // JavaScript, it survives into every rect and descriptor built from it, and it
  // is not deep-equal to 0 — so a flush wall would stop matching itself.
  return { start, end, u0: start ? -start : 0, u1: run + end, length: run + start + end };
}

/** Whether a board layer runs anywhere other than exactly wall start to wall end. */
export function boardLayerHasOverhang(layer) {
  return (
    Boolean(layer) && (boardOverhangValue(layer.overhangStart) !== 0 || boardOverhangValue(layer.overhangEnd) !== 0)
  );
}

// An arc's board cannot simply run on past the end: "past the end" of a curve is
// along a tangent that leaves the surface, and there is no straight extension of
// an arc panel that is still the same panel. Refused outright rather than
// applied as a translation, exactly as `wallOutboardOffset` refuses an offset.
function withoutBoardOverhangs(assembly) {
  if (!boardLayerHasOverhang(assembly.interior) && !boardLayerHasOverhang(assembly.exterior)) return assembly;
  return {
    ...assembly,
    interior: { ...assembly.interior, overhangStart: 0, overhangEnd: 0 },
    exterior: { ...assembly.exterior, overhangStart: 0, overhangEnd: 0 },
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
  const assembly = createWallAssembly(preset, wall?.assembly || {}, wall?.thickness || 150);
  return wall?.controlPoint ? withoutBoardOverhangs(assembly) : assembly;
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
 *
 * `length` is the wall's own run, and is only ever used to clamp the setbacks —
 * pass it wherever the skin is going to be DRAWN, and leave it out where the
 * caller only wants the build-up. Each layer answers the u-range it covers
 * alongside its offset, so a view that draws the skin and a view that places a
 * board box are reading the same two numbers.
 */
export function deriveWallAssemblyLayers(assembly, length = 0) {
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
    const span = boardLayerUSpan(layer, length);
    return {
      side,
      sign,
      material: layer.material,
      thickness: layer.thickness,
      layerCount: layer.layerCount,
      buildUp,
      centerOffset: sign * (coreDepth / 2 + buildUp / 2),
      overhangStart: span.start,
      overhangEnd: span.end,
      u0: span.u0,
      u1: span.u1,
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

/** Every kind of member the automatic frame generator emits. */
export const WALL_FRAMING_KINDS = Object.freeze({
  STUD: 'stud',
  KING: 'king',
  TRIMMER: 'trimmer',
  BOTTOM_TRACK: 'bottom_track',
  TOP_TRACK: 'top_track',
  NOGGIN: 'noggin',
  HEADER: 'header',
  SILL: 'sill',
  LEDGER: 'ledger',
});

// Wall-local geometry is in millimetres and the members are laid out by
// arithmetic on those millimetres, so a hundredth is already below anything a
// builder could set out.
const LAYOUT_EPSILON = 0.01;

function clampValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rectsOverlap(a, b) {
  return (
    a.u0 < b.u1 - LAYOUT_EPSILON &&
    a.u1 > b.u0 + LAYOUT_EPSILON &&
    a.v0 < b.v1 - LAYOUT_EPSILON &&
    a.v1 > b.v0 + LAYOUT_EPSILON
  );
}

/**
 * Openings as rectangles in the wall's own elevation.
 *
 * `datumV` is where the finished floor sits inside that elevation: zero for a
 * platform wall, whose base IS the floor, and the bypass drop for a wall whose
 * plane starts below the deck it runs past. A sill is measured from the floor
 * you walk on, never from the bottom of the plane — so a door on a bypass wall
 * sits at the storey line, not sunk by the drop.
 */
export function wallOpeningRects(openings = [], bounds = {}) {
  const length = Math.max(0, finiteNumber(bounds.length));
  const height = Math.max(0, finiteNumber(bounds.height));
  const datumV = clampValue(finiteNumber(bounds.datumV), 0, height);
  return openings
    .map((opening) => {
      const width = Math.max(0, finiteNumber(opening?.width));
      const center = finiteNumber(opening?.offset);
      const v0 = clampValue(datumV + finiteNumber(opening?.sillHeight), 0, height);
      const v1 = clampValue(v0 + Math.max(0, finiteNumber(opening?.height)), v0, height);
      return {
        id: opening?.id,
        kind: opening?.openingKind || opening?.kind || 'opening',
        u0: clampValue(center - width / 2, 0, length),
        u1: clampValue(center + width / 2, 0, length),
        v0,
        v1,
      };
    })
    .filter((rect) => rect.u1 - rect.u0 > LAYOUT_EPSILON && rect.v1 - rect.v0 > LAYOUT_EPSILON);
}

/**
 * The stretches of a horizontal member's run that survive the openings it
 * crosses, as `{start, end}` spans of U.
 *
 * The test is BAND OVERLAP, not "is the centreline inside the hole". A bottom
 * plate occupies v ∈ [0, 50] and a door starts at v = 0: their bands overlap,
 * so the plate is genuinely interrupted, even though the plate's centreline sits
 * on the door's own bottom edge. Reading the centreline was what let plates run
 * straight through doorways. Bands that merely touch — a header sitting on the
 * head of its own opening, a sill under its own cill — do not overlap, which is
 * exactly right: those members bound the hole, they do not cross it.
 */
export function horizontalMemberIntervals(rect, openings = []) {
  let intervals = [{ start: rect.u0, end: rect.u1 }];
  for (const opening of openings) {
    if (opening.v0 >= rect.v1 - LAYOUT_EPSILON || opening.v1 <= rect.v0 + LAYOUT_EPSILON) continue;
    intervals = intervals.flatMap((interval) => {
      if (opening.u1 <= interval.start + LAYOUT_EPSILON || opening.u0 >= interval.end - LAYOUT_EPSILON) {
        return [interval];
      }
      return [
        { start: interval.start, end: Math.max(interval.start, opening.u0) },
        { start: Math.min(interval.end, opening.u1), end: interval.end },
      ].filter((candidate) => candidate.end - candidate.start > LAYOUT_EPSILON);
    });
  }
  return intervals;
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

const EMPTY_FRAMING_COMPONENTS = Object.freeze({
  studLength: 0,
  platesLength: 0,
  nogginLength: 0,
  headerLength: 0,
  windowSillLength: 0,
  ledgerLength: 0,
});

// Which takeoff line a member is billed on. Reading the bucket off the member
// is what keeps the quantities honest: every length in `components` below is
// measured off a rectangle the generator actually emitted, so a plate broken at
// a doorway bills short without anybody remembering to subtract it.
const COMPONENT_BY_KIND = Object.freeze({
  [WALL_FRAMING_KINDS.STUD]: 'studLength',
  [WALL_FRAMING_KINDS.KING]: 'studLength',
  [WALL_FRAMING_KINDS.TRIMMER]: 'studLength',
  [WALL_FRAMING_KINDS.BOTTOM_TRACK]: 'platesLength',
  [WALL_FRAMING_KINDS.TOP_TRACK]: 'platesLength',
  [WALL_FRAMING_KINDS.NOGGIN]: 'nogginLength',
  [WALL_FRAMING_KINDS.HEADER]: 'headerLength',
  [WALL_FRAMING_KINDS.SILL]: 'windowSillLength',
  [WALL_FRAMING_KINDS.LEDGER]: 'ledgerLength',
});

function memberRunLength(member) {
  return member.orientation === 'vertical' ? member.v1 - member.v0 : member.u1 - member.u0;
}

/**
 * The frame a wall is built from: every member as a rectangle in the wall's own
 * elevation, plus the plan outlines the floor plan draws studs with and the
 * linear quantities the takeoff bills.
 *
 * `options.height` is the wall's RESOLVED span — a bypass wall frames from the
 * bottom of its plane to the floor above in one run, which is the whole point of
 * bypass framing — and defaults to the wall's own height. `options.datumV` puts
 * the finished floor inside that span, and `options.bands` are the slab bands the
 * plane runs past, each of which gets a ledger.
 *
 * Openings are framed the way they are built: a full-height KING outside, a
 * TRIMMER between it and the hole carrying the HEADER, and the header itself
 * running trimmer face to trimmer face so it bears on something. No member may
 * stand inside an opening, which the final filter guarantees outright.
 */
export function deriveWallFramingLayout(wall, openings = [], options = {}) {
  const assembly = resolveWallAssembly(wall);
  const length = wallLength(wall);
  const height = Math.max(0, finiteNumber(options.height, Math.max(0, finiteNumber(wall?.height))));
  const datumV = clampValue(finiteNumber(options.datumV), 0, height);
  const emptyLayout = {
    assembly,
    length,
    height,
    datumV,
    openings: [],
    studs: [],
    members: [],
    studCount: 0,
    totalLinearLengthMm: 0,
    components: EMPTY_FRAMING_COMPONENTS,
  };
  if (assembly.system !== 'framed' || wall?.controlPoint || !length) return emptyLayout;

  const frame = assembly.framing;
  const studWidth = frame.studWidth;
  const openingRects = wallOpeningRects(openings, { length, height, datumV });

  // The width a jamb needs on each side: a king plus the trimmer inside it. The
  // regular stud rhythm makes room for that pair rather than dropping a stud
  // half inside the hole.
  const jambReach = studWidth * 2;
  const positions = [0, length];
  const firstRegular = frame.startOffset > 0 ? frame.startOffset : frame.spacing;
  for (let position = firstRegular; position < length; position += frame.spacing) {
    const blocked = openingRects.some(
      (rect) =>
        position + studWidth / 2 > rect.u0 - jambReach + LAYOUT_EPSILON &&
        position - studWidth / 2 < rect.u1 + jambReach - LAYOUT_EPSILON,
    );
    if (!blocked) positions.push(position);
  }

  const regular = uniqueSorted(positions).map((position) => ({
    position,
    kind: WALL_FRAMING_KINDS.STUD,
    v0: 0,
    v1: height,
  }));
  // A trimmer stops at the header underside; its king carries on to the top
  // plate. Centres are placed so the trimmer's inner face lands exactly on the
  // jamb line and the king's inner face one trimmer clear of it.
  const jambs = openingRects.flatMap((rect) => [
    { position: rect.u0 - studWidth * 1.5, kind: WALL_FRAMING_KINDS.KING, v0: 0, v1: height, openingId: rect.id },
    { position: rect.u0 - studWidth * 0.5, kind: WALL_FRAMING_KINDS.TRIMMER, v0: 0, v1: rect.v1, openingId: rect.id },
    { position: rect.u1 + studWidth * 0.5, kind: WALL_FRAMING_KINDS.TRIMMER, v0: 0, v1: rect.v1, openingId: rect.id },
    { position: rect.u1 + studWidth * 1.5, kind: WALL_FRAMING_KINDS.KING, v0: 0, v1: height, openingId: rect.id },
  ]);
  // Two openings a stud's width apart share the king between them: one member,
  // one id, drawn once.
  const verticals = [
    ...new Map([...regular, ...jambs].map((entry) => [`${entry.kind}:${Math.round(entry.position * 10)}`, entry])),
  ].map(([, entry]) => entry);

  const frameOffsets =
    frame.frameCount === 2 ? [-(frame.studDepth + frame.frameGap) / 2, (frame.studDepth + frame.frameGap) / 2] : [0];

  const raw = [];
  const pushHorizontal = (id, kind, rect, frameIndex, frameOffset) => {
    horizontalMemberIntervals(rect, openingRects).forEach((interval, index) => {
      raw.push({
        id: `${id}:${index}`,
        kind,
        orientation: 'horizontal',
        u0: interval.start,
        u1: interval.end,
        v0: rect.v0,
        v1: rect.v1,
        depth: frame.studDepth,
        frameIndex,
        frameOffset,
        material: frame.material,
      });
    });
  };

  frameOffsets.forEach((frameOffset, frameIndex) => {
    for (const vertical of verticals) {
      raw.push({
        id: `${wall.id}:auto:${vertical.kind}:${frameIndex}:${Math.round(vertical.position * 10)}`,
        kind: vertical.kind,
        orientation: 'vertical',
        position: vertical.position,
        u0: clampValue(vertical.position - studWidth / 2, 0, length),
        u1: clampValue(vertical.position + studWidth / 2, 0, length),
        v0: clampValue(vertical.v0, 0, height),
        v1: clampValue(vertical.v1, 0, height),
        depth: frame.studDepth,
        frameIndex,
        frameOffset,
        material: frame.material,
        ...(vertical.openingId ? { openingId: vertical.openingId } : {}),
      });
    }

    // One plate at each end of the run and nothing at the storey lines between:
    // a bypass wall is one frame, not two stacked ones.
    pushHorizontal(
      `${wall.id}:auto:track:bottom:${frameIndex}`,
      WALL_FRAMING_KINDS.BOTTOM_TRACK,
      { u0: 0, u1: length, v0: 0, v1: Math.min(studWidth, height) },
      frameIndex,
      frameOffset,
    );
    pushHorizontal(
      `${wall.id}:auto:track:top:${frameIndex}`,
      WALL_FRAMING_KINDS.TOP_TRACK,
      { u0: 0, u1: length, v0: Math.max(0, height - studWidth), v1: height },
      frameIndex,
      frameOffset,
    );

    for (let row = 1; row <= frame.nogginRows; row += 1) {
      const centerV = (height * row) / (frame.nogginRows + 1);
      pushHorizontal(
        `${wall.id}:auto:noggin:${frameIndex}:${row}`,
        WALL_FRAMING_KINDS.NOGGIN,
        {
          u0: 0,
          u1: length,
          v0: clampValue(centerV - studWidth / 2, 0, height),
          v1: clampValue(centerV + studWidth / 2, 0, height),
        },
        frameIndex,
        frameOffset,
      );
    }

    for (const band of options.bands || []) {
      const v1 = clampValue(finiteNumber(band?.v1), 0, height);
      // The ledger reads as deep as the deck it carries — that is what it is for
      // — but a token band still gets a plate-sized member rather than a hairline.
      const v0 = clampValue(Math.min(finiteNumber(band?.v0), v1 - studWidth), 0, v1);
      pushHorizontal(
        `${wall.id}:auto:ledger:${frameIndex}:${band?.slabId || band?.id || 'band'}`,
        WALL_FRAMING_KINDS.LEDGER,
        { u0: 0, u1: length, v0, v1 },
        frameIndex,
        frameOffset,
      );
    }

    for (const rect of openingRects) {
      pushHorizontal(
        `${wall.id}:auto:header:${frameIndex}:${rect.id}`,
        WALL_FRAMING_KINDS.HEADER,
        {
          u0: clampValue(rect.u0 - studWidth, 0, length),
          u1: clampValue(rect.u1 + studWidth, 0, length),
          v0: rect.v1,
          v1: clampValue(rect.v1 + studWidth, 0, height),
        },
        frameIndex,
        frameOffset,
      );
      if (rect.kind !== 'window') continue;
      // The rough sill lands BETWEEN the trimmers — they run past it to the
      // header — so it measures the clear opening, while the header runs over
      // their tops and picks up a trimmer width each side.
      pushHorizontal(
        `${wall.id}:auto:sill:${frameIndex}:${rect.id}`,
        WALL_FRAMING_KINDS.SILL,
        { u0: rect.u0, u1: rect.u1, v0: clampValue(rect.v0 - studWidth, 0, height), v1: rect.v0 },
        frameIndex,
        frameOffset,
      );
    }
  });

  // The invariant, enforced rather than hoped for: nothing the generator emits
  // may stand inside an opening. The interval cutter already keeps horizontals
  // out; this catches the pathological case of two openings so close that one's
  // king lands inside the other.
  const members = raw.filter(
    (member) =>
      member.u1 - member.u0 > LAYOUT_EPSILON &&
      member.v1 - member.v0 > LAYOUT_EPSILON &&
      !openingRects.some((rect) => rectsOverlap(member, rect)),
  );

  const studs = members
    .filter((member) => member.orientation === 'vertical')
    .map((member) => ({
      id: member.id,
      kind: member.kind,
      frameIndex: member.frameIndex,
      position: member.position,
      frameOffset: member.frameOffset,
      outline: studOutline(wall, member.position, member.frameOffset, studWidth, frame.studDepth),
    }));

  const components = members.reduce(
    (totals, member) => {
      const bucket = COMPONENT_BY_KIND[member.kind];
      if (!bucket) return totals;
      return { ...totals, [bucket]: totals[bucket] + memberRunLength(member) };
    },
    { ...EMPTY_FRAMING_COMPONENTS },
  );

  return {
    assembly,
    length,
    height,
    datumV,
    openings: openingRects,
    studs,
    members,
    studCount: studs.length,
    totalLinearLengthMm: members.reduce((total, member) => total + memberRunLength(member), 0),
    components,
  };
}

export function boardLayerAreaMultiplier(assembly, material) {
  return [assembly.interior, assembly.exterior].reduce(
    (total, layer) => total + (layer.material === material ? layer.layerCount : 0),
    0,
  );
}
