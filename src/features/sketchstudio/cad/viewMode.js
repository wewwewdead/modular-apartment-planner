import * as THREE from 'three';

/**
 * See-through view modes for the 3D workstation viewport: Solid, X-ray and
 * Wireframe (docs/sketch-studio-xray-mode.md). The CAD sibling of the
 * floor-plan preview's modes: same names, same keys (X / Shift+X), never
 * persisted — but its own module, because a parts model has no skin and no
 * structure tiers.
 *
 * ## The tier rule for a parts model (§3.2)
 *
 * X-ray turns the other parts to glass while the selected part and hardware
 * (bolts, nuts, washers, screws: a part with a `hardware` feature) stay solid,
 * so what sits inside a board — a bolt in its hole, a tube in a sleeve — shows
 * through it. Wireframe ghosts every body to a faint fill and draws every edge
 * at full strength, the far ones included. Colours are kept: here wood vs
 * steel is information.
 *
 * ## Why the viewport owns its materials (§2.3, §3.4)
 *
 * `transparent` is part of three's program key and a program is destroyed when
 * the last material using it is disposed. The viewport used to create and
 * dispose a material per mesh on every snapshot, so a see-through mode would
 * relink its transparent program after every edit. `createMaterialCache` hands
 * out one shared material per (colour, opacity, depth write) and keeps it for
 * the viewport's life: a mode change, a sketch dim or an edit swaps which cached
 * material a mesh holds and links nothing new after the first time.
 *
 * ## What a mode never touches
 *
 * `visible` (hidden parts and Isolate keep working in every mode), picking (the
 * raycaster ignores opacity), the model, the saved document and the drawings.
 */

export const VIEW_MODES = Object.freeze({ SOLID: 'solid', XRAY: 'xray', WIREFRAME: 'wireframe' });
export const DEFAULT_VIEW_MODE = VIEW_MODES.SOLID;

/** Body alpha of a ghost (other parts in X-ray; every part in Wireframe). */
export const GHOST_ALPHA = Object.freeze({ xray: 0.22, wireframe: 0.03 });
/** Edge alpha of a ghost body per mode (an opaque body's edges stay at the Solid value). */
export const EDGE_ALPHA = Object.freeze({ solid: 0.65, xray: 0.55, wireframe: 1 });
/** Edge alpha while a sketch is drawn and the model is dimmed. */
export const DIMMED_EDGE_ALPHA = 0.35;
export const BODY_COLORS = Object.freeze({ selected: '#3687bd', wood: '#bd956b', metal: '#8795a4' });
export const EDGE_COLOR = '#3e4e5f';
/** Ghost bodies draw before every edge in the transparent pass (§3.6). */
export const GHOST_RENDER_ORDER = 1;
export const EDGE_RENDER_ORDER = 2;

export const VIEW_MODE_COPY = Object.freeze({
  solid: Object.freeze({ label: 'Solid', title: 'Parts as they are (X returns here)', hint: '' }),
  xray: Object.freeze({
    label: 'X-ray',
    title: 'Other parts turn to glass; the selected part and hardware stay solid (X)',
    hint: 'X-ray · selected part and hardware stay solid · X back to Solid',
  }),
  wireframe: Object.freeze({
    label: 'Wire',
    ariaLabel: 'Wireframe',
    title: 'Edges only, every edge visible (Shift+X)',
    hint: 'Wireframe · every edge shows · Shift+X back to Solid',
  }),
});

const MODES = Object.values(VIEW_MODES);

/** A known mode, or the default for anything else. */
export function resolveViewMode(mode) {
  return MODES.includes(mode) ? mode : DEFAULT_VIEW_MODE;
}

/** X-ray and Wireframe: some bodies are glass. */
export function isSeeThrough(mode) {
  return resolveViewMode(mode) !== VIEW_MODES.SOLID;
}

/**
 * The X / Shift+X rule (§3.1): X toggles Solid ↔ X-ray (from Wireframe back to
 * Solid); Shift+X toggles Wireframe ↔ Solid (from X-ray to Wireframe).
 */
export function nextViewMode(mode, { wireframe = false } = {}) {
  const current = resolveViewMode(mode);
  if (wireframe) return current === VIEW_MODES.WIREFRAME ? VIEW_MODES.SOLID : VIEW_MODES.WIREFRAME;
  return current === VIEW_MODES.SOLID ? VIEW_MODES.XRAY : VIEW_MODES.SOLID;
}

/** A part made by the hardware library (bolt, nut, washer, screw…): stays solid in X-ray. */
export function isHardwarePart(part) {
  return Boolean(part?.features?.some((f) => f?.type === 'hardware'));
}

/** Which body colour a part wears: the selection blue, wood, or the metal grey. */
export function bodyColorKey(part, selected) {
  if (selected) return 'selected';
  return /wood|ply|oak|pine/i.test(part?.material || '') ? 'wood' : 'metal';
}

/**
 * What the viewport applies to one part's body and edges.
 *
 * @param {object} input
 * @param {string} input.mode       View mode.
 * @param {boolean} input.selected  The part shows as selected (blue).
 * @param {boolean} input.hardware  The part is hardware.
 * @param {boolean} [input.support] The part a sketch is being drawn on: like the selected part it is
 *   the one being worked on, so it stays solid in X-ray (and keeps its 0.5 sketch dim).
 * @param {number} [input.dim]      Sketch dim (1 = none, 0.5 the sketched-on part, 0.28 the rest).
 * @returns {{ opaque: boolean, opacity: number, depthWrite: boolean, edgeOpacity: number,
 *   edgeColorKey: 'edge' | 'selected', renderOrder: number }}
 *   `opaque` = the body is solid in this mode (not a ghost), whatever the sketch dim.
 */
export function bodyAppearance({ mode, selected = false, hardware = false, support = false, dim = 1 }) {
  const current = resolveViewMode(mode);
  const ghost = current === VIEW_MODES.WIREFRAME || (current === VIEW_MODES.XRAY && !selected && !hardware && !support);
  const opacity = ghost ? Math.min(GHOST_ALPHA[current], dim) : dim;
  const edgeAlpha = ghost ? EDGE_ALPHA[current] : EDGE_ALPHA.solid;
  return {
    opaque: !ghost,
    opacity,
    depthWrite: opacity === 1,
    edgeOpacity: Math.min(edgeAlpha, dim < 1 ? DIMMED_EDGE_ALPHA : 1),
    edgeColorKey: selected && current === VIEW_MODES.WIREFRAME ? 'selected' : 'edge',
    renderOrder: opacity < 1 ? GHOST_RENDER_ORDER : 0,
  };
}

const editable = (target) =>
  Boolean(target?.closest?.('input, select, textarea, [contenteditable=""], [contenteditable="true"]'));

/**
 * X / Shift+X → `{ type: 'view', wireframe }`; null while typing, dragging, with
 * Ctrl/Meta/Alt, on key repeat or when another handler took the key.
 */
export function viewKeyAction(event, { dragging = false } = {}) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return null;
  if (dragging || editable(event.target)) return null;
  if (event.key !== 'x' && event.key !== 'X' && event.code !== 'KeyX') return null;
  if (event.repeat) return null;
  return { type: 'view', wireframe: Boolean(event.shiftKey) };
}

/**
 * The viewport's materials: one shared instance per distinct key, created
 * lazily, kept until `dispose()` (the viewport's unmount). Meshes borrow them
 * and never dispose them.
 */
export function createMaterialCache() {
  const materials = new Map();
  let clippingPlanes = [];
  const keep = (key, make) => {
    let material = materials.get(key);
    if (!material) {
      material = make();
      material.clippingPlanes = clippingPlanes;
      materials.set(key, material);
    }
    return material;
  };
  return {
    body(color, opacity = 1, { depthWrite = opacity === 1 } = {}) {
      const hex = new THREE.Color(color).getHexString();
      return keep(`body|${hex}|${opacity}|${depthWrite ? 1 : 0}`, () => {
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.55,
          metalness: 0.15,
          side: THREE.DoubleSide,
          transparent: opacity < 1,
          opacity,
          depthWrite,
        });
        material.name = `cad-body-${hex}-${opacity}`;
        return material;
      });
    },
    edge(color, opacity = EDGE_ALPHA.solid) {
      const hex = new THREE.Color(color).getHexString();
      return keep(`edge|${hex}|${opacity}`, () => {
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        material.name = `cad-edge-${hex}-${opacity}`;
        return material;
      });
    },
    // Section: every material, present and later, clips by the same planes.
    setClippingPlanes(planes = []) {
      clippingPlanes = planes;
      for (const material of materials.values()) material.clippingPlanes = planes;
    },
    size: () => materials.size,
    dispose() {
      for (const material of materials.values()) material.dispose();
      materials.clear();
    },
  };
}
