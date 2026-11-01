// The three origin plane tiles a new sketch is started from (Phase I,
// docs/sketch-studio-start-sketch.md). Pure: sizes, corners, names and the
// hint lines; CadViewport draws and picks them.
import { planeFrame, toWorld } from './sketchPlane.js';
import { formatMm } from './marks.js';

// The standard view that looks square at each plane (CadViewport `directions`:
// top = [0, 0, 1] looks down the XY normal, front = [0, -1, 0] at XZ whose
// normal is -Y, right = [1, 0, 0] at YZ).
export const PLANE_NAMES = { XY: 'Top', XZ: 'Front', YZ: 'Right' };
export const ORIGIN_PLANES = ['XY', 'XZ', 'YZ'];

// Tile side: 400 mm for an empty model, else half the largest extent of the
// displayed model, kept between 200 mm and 3 m.
export const EMPTY_TILE_SIZE = 400;
export const MIN_TILE_SIZE = 200;
export const MAX_TILE_SIZE = 3000;
export function tileSize(bounds) {
  if (!bounds) return EMPTY_TILE_SIZE;
  const [min, max] = bounds;
  const extent = Math.max(...[0, 1, 2].map((i) => max[i] - min[i]));
  if (!Number.isFinite(extent)) return EMPTY_TILE_SIZE;
  return Math.min(MAX_TILE_SIZE, Math.max(MIN_TILE_SIZE, 0.5 * extent));
}

// Each tile is the square origin + u·x + v·y, u, v ∈ [−S/2, S/2], of the frame
// the sketch will get: centred on the frame origin (sketch (0, 0) is its
// centre), so the three tiles cross at the origin and each keeps one quarter
// that no other tile covers from the default isometric view. Corners in
// (u, v) order (−, −), (+, −), (+, +), (−, +); a label sits at the third.
export function planeTiles({ bounds = null, offset = 0 } = {}) {
  const size = tileSize(bounds);
  const amount = Number(offset) || 0;
  const half = size / 2;
  const tiles = {};
  for (const plane of ORIGIN_PLANES) {
    const frame = planeFrame(plane, amount);
    tiles[plane] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ].map((uv) => toWorld(frame, uv));
  }
  return { size, offset: amount, tiles };
}
// The corner a tile's label is anchored at, (+S/2, +S/2).
export const LABEL_CORNER = 2;

export const planeLabel = (plane) => `${PLANE_NAMES[plane]} · ${plane}`;
const signedMm = (offset) => `${offset > 0 ? '+' : '-'}${formatMm(Math.abs(offset))} mm`;
// Hovering a tile (or its label).
export function planeHint(plane, offset = 0) {
  const amount = Number(offset) || 0;
  return `Sketch on ${PLANE_NAMES[plane]} (${plane}${amount ? `, ${signedMm(amount)}` : ''}) · click to start`;
}

// The hint lines (asserted by scripts/verify-start-sketch.mjs; keep them exact).
export const REST_HINT =
  'Click an origin plane to start a sketch · S starts one anywhere · Solid tab adds a board or tube';
export const PICK_HINT = 'New sketch: click a flat face or an origin plane · Esc cancels';
export const CURVED_HINT = 'Curved face — pick a flat one';
export const faceHint = (partName) => `Sketch on this face of ${partName || 'this part'} · click to start`;
