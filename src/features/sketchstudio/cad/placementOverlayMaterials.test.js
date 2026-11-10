import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { clearPlacementOverlay, createOverlayMaterials } from './placementLayer.js';

describe('placement overlay materials', () => {
  it('hands out one material per kind, colour and opacity', () => {
    const materials = createOverlayMaterials();
    expect(materials.basic('#1d6fe0', 0.9)).toBe(materials.basic('#1d6fe0', 0.9));
    expect(materials.basic('#1d6fe0', 1)).not.toBe(materials.basic('#1d6fe0', 0.9));
    expect(materials.line('#1d6fe0', 0.9)).not.toBe(materials.basic('#1d6fe0', 0.9));
    expect(materials.basic('#1d6fe0', 0.9).side).toBe(THREE.DoubleSide);
  });

  // three destroys a program when its last material is disposed; a redraw that
  // disposed the grips' material relinked that program on every drag frame.
  it('keeps cached materials alive through a redraw and frees them with the layer', () => {
    const materials = createOverlayMaterials();
    const cached = materials.basic('#c62f2f', 1);
    const dispose = vi.spyOn(cached, 'dispose');
    const ownMaterial = new THREE.MeshBasicMaterial();
    const disposeOwn = vi.spyOn(ownMaterial, 'dispose');
    const layer = new THREE.Group();
    layer.add(
      new THREE.Mesh(new THREE.SphereGeometry(1), cached),
      new THREE.Mesh(new THREE.BoxGeometry(), ownMaterial),
    );

    clearPlacementOverlay(layer);
    expect(layer.children).toHaveLength(0);
    expect(dispose).not.toHaveBeenCalled();
    expect(disposeOwn).toHaveBeenCalledTimes(1);
    expect(materials.basic('#c62f2f', 1)).toBe(cached);

    materials.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
