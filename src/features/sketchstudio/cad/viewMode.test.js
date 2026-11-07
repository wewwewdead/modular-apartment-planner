// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  BODY_COLORS,
  DEFAULT_VIEW_MODE,
  DIMMED_EDGE_ALPHA,
  EDGE_ALPHA,
  EDGE_COLOR,
  EDGE_RENDER_ORDER,
  GHOST_ALPHA,
  GHOST_RENDER_ORDER,
  VIEW_MODES,
  VIEW_MODE_COPY,
  bodyAppearance,
  bodyColorKey,
  createMaterialCache,
  isHardwarePart,
  isSeeThrough,
  nextViewMode,
  resolveViewMode,
  viewKeyAction,
} from './viewMode.js';
import { hardwareDefaults } from './hardware.js';

describe('modes', () => {
  it('has the three modes, Solid by default, and resolves unknown values to it', () => {
    expect(VIEW_MODES).toEqual({ SOLID: 'solid', XRAY: 'xray', WIREFRAME: 'wireframe' });
    expect(DEFAULT_VIEW_MODE).toBe('solid');
    for (const mode of ['solid', 'xray', 'wireframe']) expect(resolveViewMode(mode)).toBe(mode);
    for (const mode of [undefined, null, '', 'ghost', 'XRAY']) expect(resolveViewMode(mode)).toBe('solid');
    expect(isSeeThrough('solid')).toBe(false);
    expect(isSeeThrough('xray')).toBe(true);
    expect(isSeeThrough('wireframe')).toBe(true);
    expect(isSeeThrough('nonsense')).toBe(false);
  });

  it('nextViewMode: X toggles Solid ↔ X-ray (Wireframe → Solid), Shift+X toggles Wireframe ↔ Solid', () => {
    const table = [
      ['solid', false, 'xray'],
      ['xray', false, 'solid'],
      ['wireframe', false, 'solid'],
      ['solid', true, 'wireframe'],
      ['xray', true, 'wireframe'],
      ['wireframe', true, 'solid'],
    ];
    for (const [from, wireframe, to] of table) expect(nextViewMode(from, { wireframe })).toBe(to);
    expect(nextViewMode('solid')).toBe('xray');
  });

  it('carries the copy of §6', () => {
    expect(VIEW_MODE_COPY.solid.label).toBe('Solid');
    expect(VIEW_MODE_COPY.xray.label).toBe('X-ray');
    expect(VIEW_MODE_COPY.wireframe.label).toBe('Wire');
    expect(VIEW_MODE_COPY.wireframe.ariaLabel).toBe('Wireframe');
    expect(VIEW_MODE_COPY.solid.title).toBe('Parts as they are (X returns here)');
    expect(VIEW_MODE_COPY.xray.title).toBe('Other parts turn to glass; the selected part and hardware stay solid (X)');
    expect(VIEW_MODE_COPY.wireframe.title).toBe('Edges only, every edge visible (Shift+X)');
    expect(VIEW_MODE_COPY.xray.hint).toBe('X-ray · selected part and hardware stay solid · X back to Solid');
    expect(VIEW_MODE_COPY.wireframe.hint).toBe('Wireframe · every edge shows · Shift+X back to Solid');
  });
});

describe('viewKeyAction', () => {
  const key = (event, state) => viewKeyAction({ target: null, ...event }, state);
  it('reads x, X and KeyX; Shift picks Wireframe', () => {
    expect(key({ key: 'x' })).toEqual({ type: 'view', wireframe: false });
    expect(key({ key: 'X', shiftKey: true })).toEqual({ type: 'view', wireframe: true });
    // A layout where the KeyX key types something else.
    expect(key({ key: 'ч', code: 'KeyX' })).toEqual({ type: 'view', wireframe: false });
    expect(key({ key: 'y', code: 'KeyY' })).toBeNull();
  });
  it('ignores modifiers, repeat, a handled event, editable targets and drags', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) expect(key({ key: 'x', [modifier]: true })).toBeNull();
    expect(key({ key: 'x', repeat: true })).toBeNull();
    expect(key({ key: 'x', defaultPrevented: true })).toBeNull();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inside = document.createElement('span');
    editable.append(inside);
    for (const target of ['input', 'select', 'textarea'].map((t) => document.createElement(t)).concat(editable, inside))
      expect(key({ key: 'x', target })).toBeNull();
    expect(key({ key: 'x', target: document.createElement('canvas') })).not.toBeNull();
    expect(key({ key: 'x' }, { dragging: true })).toBeNull();
  });
});

describe('isHardwarePart and bodyColorKey', () => {
  it('detects a part with a hardware feature', () => {
    expect(isHardwarePart({ features: [hardwareDefaults('bolt', 'M6')] })).toBe(true);
    expect(isHardwarePart({ features: [{ type: 'box' }, { type: 'hardware' }] })).toBe(true);
    expect(isHardwarePart({ features: [{ type: 'box' }] })).toBe(false);
    expect(isHardwarePart({ features: [] })).toBe(false);
    expect(isHardwarePart({})).toBe(false);
    expect(isHardwarePart(undefined)).toBe(false);
  });
  it('keeps today’s colour rule', () => {
    expect(bodyColorKey({ material: 'Oak' }, true)).toBe('selected');
    expect(bodyColorKey({ material: 'Birch plywood' }, false)).toBe('wood');
    expect(bodyColorKey({ material: 'Pine' }, false)).toBe('wood');
    expect(bodyColorKey({ material: 'Steel' }, false)).toBe('metal');
    expect(bodyColorKey(undefined, false)).toBe('metal');
    expect(BODY_COLORS).toEqual({ selected: '#3687bd', wood: '#bd956b', metal: '#8795a4' });
  });
});

describe('bodyAppearance', () => {
  const look = (mode, kind, dim) =>
    bodyAppearance({ mode, selected: kind === 'selected', hardware: kind === 'hardware', dim });
  const opaque = {
    opaque: true,
    opacity: 1,
    depthWrite: true,
    edgeOpacity: 0.65,
    edgeColorKey: 'edge',
    renderOrder: 0,
  };
  it('follows the §3.2 table', () => {
    for (const kind of ['selected', 'hardware', 'plain']) expect(look('solid', kind)).toEqual(opaque);
    expect(look('xray', 'selected')).toEqual(opaque);
    expect(look('xray', 'hardware')).toEqual(opaque);
    expect(look('xray', 'plain')).toEqual({
      opaque: false,
      opacity: GHOST_ALPHA.xray,
      depthWrite: false,
      edgeOpacity: EDGE_ALPHA.xray,
      edgeColorKey: 'edge',
      renderOrder: GHOST_RENDER_ORDER,
    });
    const wire = {
      opaque: false,
      opacity: GHOST_ALPHA.wireframe,
      depthWrite: false,
      edgeOpacity: 1,
      edgeColorKey: 'edge',
      renderOrder: GHOST_RENDER_ORDER,
    };
    expect(look('wireframe', 'plain')).toEqual(wire);
    expect(look('wireframe', 'hardware')).toEqual(wire);
    expect(look('wireframe', 'selected')).toEqual({ ...wire, edgeColorKey: 'selected' });
    expect(GHOST_ALPHA.xray).toBeGreaterThanOrEqual(0.18);
    expect(GHOST_ALPHA.xray).toBeLessThanOrEqual(0.3);
    expect(GHOST_ALPHA.wireframe).toBeGreaterThanOrEqual(0.03);
    expect(GHOST_ALPHA.wireframe).toBeLessThanOrEqual(0.06);
    expect(GHOST_RENDER_ORDER).toBe(1);
    expect(EDGE_RENDER_ORDER).toBe(2);
    // An unknown mode is Solid.
    expect(look('nonsense', 'plain')).toEqual(opaque);
  });
  it('composes the sketch dim in every mode', () => {
    // Solid: as today.
    expect(look('solid', 'plain', 0.5)).toMatchObject({ opacity: 0.5, depthWrite: false, edgeOpacity: 0.35 });
    expect(look('solid', 'plain', 0.28)).toMatchObject({ opacity: 0.28, depthWrite: false, renderOrder: 1 });
    // X-ray: an opaque body takes the dim; a ghost takes the smaller of the two.
    expect(look('xray', 'selected', 0.5)).toMatchObject({ opaque: true, opacity: 0.5, edgeOpacity: 0.35 });
    expect(look('xray', 'hardware', 0.28)).toMatchObject({ opaque: true, opacity: 0.28 });
    expect(look('xray', 'plain', 0.5)).toMatchObject({ opaque: false, opacity: 0.22, edgeOpacity: 0.35 });
    expect(look('xray', 'plain', 0.28)).toMatchObject({ opacity: Math.min(GHOST_ALPHA.xray, 0.28) });
    // The part a sketch is drawn on stays solid in X-ray, at its sketch dim; Wireframe ghosts it.
    expect(bodyAppearance({ mode: 'xray', support: true, dim: 0.5 })).toMatchObject({ opaque: true, opacity: 0.5 });
    expect(bodyAppearance({ mode: 'wireframe', support: true, dim: 0.5 })).toMatchObject({
      opaque: false,
      opacity: GHOST_ALPHA.wireframe,
      edgeColorKey: 'edge',
    });
    // Wireframe: the ghost alpha is already below any dim; edges drop to the dimmed value.
    expect(look('wireframe', 'plain', 0.5)).toMatchObject({
      opacity: GHOST_ALPHA.wireframe,
      edgeOpacity: DIMMED_EDGE_ALPHA,
    });
    expect(look('wireframe', 'selected', 0.28)).toMatchObject({ opacity: GHOST_ALPHA.wireframe, edgeOpacity: 0.35 });
  });
});

describe('createMaterialCache', () => {
  it('hands out one material per key', () => {
    const cache = createMaterialCache();
    const a = cache.body(BODY_COLORS.metal, 1, { depthWrite: true });
    expect(cache.body('#8795a4', 1, { depthWrite: true })).toBe(a);
    expect(a).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(a.side).toBe(THREE.DoubleSide);
    expect(a.roughness).toBe(0.55);
    expect(a.metalness).toBe(0.15);
    expect(a.transparent).toBe(false);
    expect(a.depthWrite).toBe(true);
    const ghost = cache.body(BODY_COLORS.metal, 0.22, { depthWrite: false });
    expect(ghost).not.toBe(a);
    expect(ghost.transparent).toBe(true);
    expect(ghost.opacity).toBe(0.22);
    expect(ghost.depthWrite).toBe(false);
    expect(cache.body(BODY_COLORS.wood, 1, { depthWrite: true })).not.toBe(a);
    expect(cache.body(BODY_COLORS.metal, 0.22, { depthWrite: true })).not.toBe(ghost);
    expect(cache.body(BODY_COLORS.metal, 0.22, { depthWrite: true }).depthWrite).toBe(true);
    const edge = cache.edge(EDGE_COLOR, 0.65);
    expect(edge).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(edge.transparent).toBe(true);
    expect(edge.opacity).toBe(0.65);
    expect(cache.edge('#3e4e5f', 0.65)).toBe(edge);
    expect(cache.edge(EDGE_COLOR, 1)).not.toBe(edge);
    expect(cache.edge(BODY_COLORS.selected, 1).color.getHexString()).toBe('3687bd');
    expect(cache.size()).toBe(7);
  });
  it('clips every material, present and later', () => {
    const cache = createMaterialCache();
    const before = [cache.body(BODY_COLORS.metal, 1), cache.edge(EDGE_COLOR, 0.65)];
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
    cache.setClippingPlanes([plane]);
    const after = [cache.body(BODY_COLORS.wood, 0.22, { depthWrite: false }), cache.edge(EDGE_COLOR, 1)];
    for (const material of [...before, ...after]) expect(material.clippingPlanes).toEqual([plane]);
    cache.setClippingPlanes([]);
    for (const material of [...before, ...after]) expect(material.clippingPlanes).toEqual([]);
    expect(cache.body(BODY_COLORS.selected, 1).clippingPlanes).toEqual([]);
  });
  it('disposes every material once and empties', () => {
    const cache = createMaterialCache();
    const materials = [cache.body(BODY_COLORS.metal, 1), cache.body(BODY_COLORS.metal, 0.04), cache.edge(EDGE_COLOR)];
    const spies = materials.map((m) => vi.spyOn(m, 'dispose'));
    cache.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(0);
    cache.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
