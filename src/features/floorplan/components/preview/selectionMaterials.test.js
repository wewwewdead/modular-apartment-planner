import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyRenderStyleToPalette, createMaterialPalette, disposeMaterialPalette } from './materials';
import { disposeSelectionMaterials, selectionMaterialFor, selectionMaterialsOf } from './selectionMaterials';
import { cloneWithProceduralDetail } from './proceduralDetail';

const tint = (material) => {
  material.emissive?.setHex(0x113311);
  material.depthFunc = THREE.LessEqualDepth;
};

describe('selection overlay materials', () => {
  it('hands back one shared tinted copy per source material and accent', () => {
    const palette = createMaterialPalette();
    const a = selectionMaterialFor(palette, palette.wall, 'plan', tint);
    const b = selectionMaterialFor(palette, palette.wall, 'plan', tint);
    const other = selectionMaterialFor(palette, palette.wall, 'assembly', tint);
    expect(a).toBe(b);
    expect(a).not.toBe(palette.wall);
    expect(other).not.toBe(a);
    expect(a.depthFunc).toBe(THREE.LessEqualDepth);
    expect(a.userData.ownedByPalette).toBe(true);
    expect(selectionMaterialsOf(palette)).toEqual([a, other]);
    disposeMaterialPalette(palette);
  });

  it('keeps the detail shader, so the copy shares the detailed palette program', () => {
    const palette = createMaterialPalette();
    const copy = selectionMaterialFor(palette, palette.wall, 'plan', tint);
    expect(palette.wall.userData.detailFamily).toBeTruthy();
    expect(typeof copy.customProgramCacheKey).toBe('function');
    expect(copy.customProgramCacheKey()).toBe(palette.wall.customProgramCacheKey());
    expect(copy.onBeforeCompile).not.toBe(THREE.Material.prototype.onBeforeCompile);
    expect(copy.onBeforeCompile).not.toBe(palette.wall.onBeforeCompile);
    expect(copy.userData.detailUniforms).toBeUndefined();
    expect(copy.userData.detailFamily).toEqual(palette.wall.userData.detailFamily);
    disposeMaterialPalette(palette);
  });

  it('gives a plain clone its own compile hook rather than the source closure', () => {
    const palette = createMaterialPalette();
    const copy = cloneWithProceduralDetail(palette.wall);
    const shader = {
      uniforms: {},
      vertexShader: 'void main() {\n#include <project_vertex>',
      fragmentShader:
        'void main() {\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
    };
    copy.onBeforeCompile(shader);
    expect(copy.userData.detailUniforms).toBe(shader.uniforms);
    expect(palette.wall.userData.detailUniforms).not.toBe(shader.uniforms);
    disposeMaterialPalette(palette);
  });

  it('never caches a material built for one object', () => {
    const palette = createMaterialPalette();
    const lens = new THREE.MeshStandardMaterial({ color: 0xffeecc });
    lens.userData.ownedByPreviewObject = true;
    const first = selectionMaterialFor(palette, lens, 'plan', tint);
    const second = selectionMaterialFor(palette, lens, 'plan', tint);
    expect(first).not.toBe(second);
    expect(first.userData.ownedByPreviewObject).toBe(true);
    expect(selectionMaterialsOf(palette)).toEqual([]);
    disposeMaterialPalette(palette);
  });

  it('rebuilds the copy when the source colour changes, and follows a relief change', () => {
    const palette = createMaterialPalette();
    const before = selectionMaterialFor(palette, palette.wall, 'plan', tint);
    palette.wall.color.setHex(0x123456);
    const after = selectionMaterialFor(palette, palette.wall, 'plan', tint);
    expect(after).not.toBe(before);
    expect(selectionMaterialsOf(palette)).toEqual([after]);

    applyRenderStyleToPalette(palette, { detailStrength: 0, outlines: true });
    expect(after.userData.detailScale).toBe(0);
    applyRenderStyleToPalette(palette, { detailStrength: 1, outlines: true });
    expect(after.userData.detailScale).toBe(1);
    disposeMaterialPalette(palette);
  });

  it('is disposed with the palette, and not before', () => {
    const palette = createMaterialPalette();
    const copy = selectionMaterialFor(palette, palette.door, 'plan', tint);
    const dispose = vi.spyOn(copy, 'dispose');
    selectionMaterialFor(palette, palette.door, 'plan', tint);
    expect(dispose).not.toHaveBeenCalled();
    disposeSelectionMaterials(palette);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(selectionMaterialsOf(palette)).toEqual([]);
    disposeMaterialPalette(palette);
  });
});
