/**
 * Plain-language readouts for whatever is selected in the wall detail editor.
 *
 * Clicking a board, a stud, or a noggin has to answer "how big is this piece?"
 * on the spot — a builder reads a size off the drawing, not out of a distant
 * form. These pure builders produce the on-canvas size tag and the matching
 * lines in the selection inspector from one source, so the two can never drift.
 *
 * Sizes are always stated as they read on the face elevation: width across the
 * wall (U) × height up from the finished floor (V), with depth into the wall
 * carried separately. Mirroring a face flips the view, never the piece, so the
 * numbers hold on both faces.
 */

import { WALL_BOARD_MATERIALS, WALL_FRAME_MATERIALS } from '@/domain/wallAssemblies';

/**
 * Tag text size and its stand-off from the piece, in screen pixels. Both the
 * placement maths and the drawn tag scale these by `unitPx`, so they must come
 * from one place or the tag would be placed for a size it is not drawn at.
 */
export const SIZE_TAG_FONT_PX = 11;
export const SIZE_TAG_GAP_PX = 11;
export const SIZE_TAG_LINE_STEP = 1.28;

const FRAMING_KIND_LABELS = Object.freeze({
  stud: 'Stud',
  noggin: 'Noggin',
  top_track: 'Top track',
  bottom_track: 'Bottom track',
  header: 'Header',
  sill: 'Sill',
});

/** Title case for member kinds the generator has not been taught to name yet. */
export function framingKindLabel(kind) {
  if (!kind) return 'Frame member';
  const known = FRAMING_KIND_LABELS[kind];
  if (known) return known;
  const words = String(kind).replaceAll('_', ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Frame member';
}

export function frameMaterialLabel(material) {
  if (material === WALL_FRAME_MATERIALS.TIMBER) return 'Timber';
  if (material === WALL_FRAME_MATERIALS.LIGHT_GAUGE_STEEL) return 'Light-gauge steel';
  return 'Framing';
}

export function boardMaterialLabel(material) {
  if (material === WALL_BOARD_MATERIALS.PLYWOOD) return 'Plywood';
  if (material === WALL_BOARD_MATERIALS.FIBER_CEMENT) return 'Fiber cement';
  return 'No board';
}

/**
 * A size the way a builder writes it: rounded to the drawing's own precision,
 * with trailing zeros dropped. A stud reads "50", not "50.00" — but a traced
 * cut still reads "1219.5" when that is what it measures. The unit is added
 * once at the end of a line, never per number.
 */
export function formatSize(value, precision = 0.01) {
  const step = Number(precision) > 0 ? Number(precision) : 0.01;
  const decimals = Math.max(0, Math.min(6, Math.round(-Math.log10(step))));
  const rounded = Math.round((Number(value) || 0) / step) * step;
  return Number(rounded.toFixed(decimals)).toString();
}

/** "Fiber cement · 2 × 6 mm" — the sheet spec behind the selected board. */
export function boardLayerLabel(layer, precision) {
  const material = layer?.material;
  if (!material || material === WALL_BOARD_MATERIALS.NONE) return 'No board layer';
  const layers = Math.max(1, Math.round(Number(layer.layerCount) || 1));
  const thickness = formatSize(Math.max(0, Number(layer.thickness) || 0), precision);
  return `${boardMaterialLabel(material)} · ${layers > 1 ? `${layers} × ` : ''}${thickness} mm`;
}

/** "1219 × 2438 mm" — width across the wall × height up from the floor. */
export function faceSizeLine(width, height, precision) {
  return `${formatSize(Math.max(0, width), precision)} × ${formatSize(Math.max(0, height), precision)} mm`;
}

/** Square metres, because a board is bought and cut by area, not by mm². */
export function squareMetres(areaMm2) {
  const value = (Number(areaMm2) || 0) / 1e6;
  return `${value.toFixed(value >= 10 ? 1 : 2)} m²`;
}

/**
 * The selected board: its name, its face size, and the sheet it is cut from.
 * `netArea` is the area left after doors and windows are cut out of it.
 */
export function describeSelectedPanel(panel, layer, precision) {
  if (!panel) return null;
  const width = Number(panel.width) || 0;
  const height = Number(panel.height) || 0;
  return {
    type: 'panel',
    name: panel.label || 'Board',
    size: faceSizeLine(width, height, precision),
    note: boardLayerLabel(layer, precision),
    areaNote:
      Number(panel.netArea) > 0 && Number(panel.netArea) < Number(panel.grossArea) - 1
        ? `${squareMetres(panel.netArea)} after cutouts`
        : `${squareMetres(panel.netArea || panel.grossArea || width * height)} face area`,
    box: {
      u0: Number(panel.u0) || 0,
      u1: (Number(panel.u0) || 0) + width,
      v0: Number(panel.v0) || 0,
      v1: (Number(panel.v0) || 0) + height,
    },
  };
}

/**
 * The selected frame member. Width and height are what the elevation shows;
 * depth is the timber/steel dimension running back into the wall.
 *
 * The material is read off the wall assembly, never off the member. A member
 * carries a `material` field, but it is a snapshot taken when the member was
 * created, and a custom member — anything moved, copied, or materialised out of
 * the generated frame — keeps that snapshot for good. Switching the wall from
 * steel to timber would leave those members still claiming steel. The assembly
 * is the only framing material the editor can set, and the only one the 3D
 * scene, the plan, and the takeoff read, so it is the one the drawing states.
 */
export function describeSelectedFraming(member, framing, precision) {
  if (!member) return null;
  const u0 = Number(member.u0) || 0;
  const u1 = Number(member.u1) || 0;
  const v0 = Number(member.v0) || 0;
  const v1 = Number(member.v1) || 0;
  const width = Math.abs(u1 - u0);
  const height = Math.abs(v1 - v0);
  const depth = Math.max(0, Number(member.depth) || Number(framing?.studDepth) || 0);
  const vertical = member.orientation !== 'horizontal';
  return {
    type: 'framing',
    name: framingKindLabel(member.kind),
    size: faceSizeLine(width, height, precision),
    note: `${frameMaterialLabel(framing?.material || member.material)} · ${formatSize(depth, precision)} mm deep`,
    width,
    height,
    depth,
    // Set-out is measured to the centre line: across the wall for a stud, up
    // from the floor for a noggin.
    setOut: vertical
      ? `centre U ${formatSize((u0 + u1) / 2, precision)} mm`
      : `centre V ${formatSize((v0 + v1) / 2, precision)} mm`,
    box: { u0, u1, v0, v1 },
  };
}

/** Screws have no width and height — head size and exact position instead. */
export function describeSelectedFastener(fastener, headDiameter, precision) {
  if (!fastener) return null;
  const u = Number(fastener.u) || 0;
  const v = Number(fastener.v) || 0;
  const head = Math.max(0, Number(headDiameter) || 0);
  return {
    type: 'fastener',
    name: 'Screw',
    size: head > 0 ? `Ø ${formatSize(head, precision)} mm head` : 'Screw',
    note: `U ${formatSize(u, precision)} · V ${formatSize(v, precision)} mm`,
    box: { u0: u, u1: u, v0: v, v1: v },
  };
}

/** The tag lines, longest-first ordering preserved for width estimation. */
export function selectionTagLines(description) {
  if (!description) return [];
  return [description.name, description.size, description.note].filter(Boolean);
}

/**
 * A rough text width in wall units. SVG cannot measure text before it paints,
 * and the tag only needs to know when it would overhang the drawing edge.
 */
export function estimateTagWidth(lines, fontSize) {
  const longest = lines.reduce((max, line) => Math.max(max, String(line).length), 0);
  return longest * fontSize * 0.56;
}

/**
 * Park the tag just clear of the piece's top edge, then keep it inside the
 * drawing: a full-height stud has nothing above it, and a board against either
 * end of the wall would push a centred label off the sheet.
 */
export function placeSelectionTag(box, bounds, { fontSize = 1, lines = [], gap = 0 } = {}) {
  if (!box || !bounds) return null;
  const halfWidth = estimateTagWidth(lines, fontSize) / 2;
  const stack = Math.max(0, lines.length - 1) * fontSize * SIZE_TAG_LINE_STEP;
  const centreU = (box.u0 + box.u1) / 2;
  const topV = Math.max(box.v0, box.v1);
  const headroom = bounds.height - topV;
  // Not enough room above the piece: drop the tag inside its own top edge.
  const placement = headroom >= stack + gap * 2 ? 'above' : 'below';
  const limit = Math.max(0, bounds.length / 2 - halfWidth);
  return {
    point: {
      u: clamp(centreU, bounds.length / 2 - limit, bounds.length / 2 + limit),
      v: clamp(topV, 0, bounds.height),
    },
    placement,
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
