/**
 * The procedural detail shader is patched into three's own material source by
 * string replacement, which is a technique with exactly one failure mode: three
 * renames a chunk, every `.replace()` quietly matches nothing, and the preview
 * goes back to looking like flat plastic with no error anywhere. So the anchors
 * are checked against the real shader source rather than a fixture — if an
 * upgrade moves them, this fails instead of the render.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DETAIL_FAMILIES, applyProceduralDetail, setDetailScale } from './proceduralDetail';

const ANCHORS = ['#include <map_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>'];

/** Runs the material's onBeforeCompile against three's unmodified source. */
function compile(material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader);
  return shader;
}

describe('shader anchors', () => {
  it('still exist in three’s standard material', () => {
    for (const anchor of ANCHORS) {
      expect(THREE.ShaderLib.physical.fragmentShader).toContain(anchor);
    }
    // The vertex injection needs `transformed` and `objectNormal` to already be
    // in scope, which is only true because both begin_vertex and
    // beginnormal_vertex run before project_vertex.
    const vertex = THREE.ShaderLib.physical.vertexShader;
    expect(vertex.indexOf('#include <begin_vertex>')).toBeLessThan(vertex.indexOf('#include <project_vertex>'));
    expect(vertex.indexOf('#include <beginnormal_vertex>')).toBeLessThan(vertex.indexOf('#include <project_vertex>'));
  });

  it('gives vViewPosition, which the bump uses as its differential frame', () => {
    expect(THREE.ShaderLib.physical.fragmentShader).toContain('varying vec3 vViewPosition;');
  });
});

describe('applyProceduralDetail', () => {
  it('injects after every anchor, never replacing it', () => {
    const material = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'plaster');
    const shader = compile(material);

    for (const anchor of ANCHORS) {
      expect(shader.fragmentShader).toContain(anchor);
    }
    expect(shader.fragmentShader).toContain('float dtHeight(');
    expect(shader.vertexShader).toContain('vDetailWorldPos = (modelMatrix');
  });

  it('samples the height before the roughness and normal chunks that read it', () => {
    const material = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'concrete');
    const { fragmentShader } = compile(material);

    const declaration = fragmentShader.indexOf('float dtH = 0.5;');
    expect(declaration).toBeGreaterThan(-1);
    expect(declaration).toBeLessThan(fragmentShader.indexOf('roughnessFactor * (1.0 + dtSigned'));
    expect(declaration).toBeLessThan(fragmentShader.indexOf('vec3 dtSurfGrad'));
  });

  it('carries the family’s values through to uniforms', () => {
    const material = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'timber');
    const shader = compile(material);

    expect(shader.uniforms.uDetailStrength.value).toBe(DETAIL_FAMILIES.timber.strength);
    expect(shader.uniforms.uDetailFrequency.value).toBe(DETAIL_FAMILIES.timber.frequency);
    // Timber is the anisotropic one: grain below 1 stretches the noise along
    // the member, which is what makes it read as sawn wood rather than stone.
    expect(shader.uniforms.uDetailGrain.value).toBeLessThan(1);
  });

  it('treats an unknown family as no detail at all, rather than throwing', () => {
    const material = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'unobtainium');
    expect(compile(material).uniforms.uDetailStrength.value).toBe(0);
  });

  it('shares one program across the palette', () => {
    const first = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'plaster');
    const second = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'timber');
    expect(first.customProgramCacheKey()).toBe(second.customProgramCacheKey());
  });
});

describe('setDetailScale', () => {
  it('switches detail off through uniforms, without a recompile', () => {
    const palette = {
      wall: applyProceduralDetail(new THREE.MeshStandardMaterial(), 'plaster'),
      outline: new THREE.LineBasicMaterial(),
    };
    const shader = compile(palette.wall);
    const compiledAt = palette.wall.version;

    setDetailScale(palette, 0);

    expect(shader.uniforms.uDetailStrength.value).toBe(0);
    expect(shader.uniforms.uDetailRoughness.value).toBe(0);
    // Frequency is not scaled: it describes the pattern, not its amount, and
    // zeroing it would divide the world into one enormous flat cell.
    expect(shader.uniforms.uDetailFrequency.value).toBe(DETAIL_FAMILIES.plaster.frequency);
    expect(palette.wall.version).toBe(compiledAt);
  });

  it('restores the family’s own strength on the way back', () => {
    const palette = { wall: applyProceduralDetail(new THREE.MeshStandardMaterial(), 'plaster') };
    const shader = compile(palette.wall);

    setDetailScale(palette, 0);
    setDetailScale(palette, 1);

    expect(shader.uniforms.uDetailStrength.value).toBe(DETAIL_FAMILIES.plaster.strength);
  });

  it('leaves materials that have no detail alone', () => {
    const outline = new THREE.LineBasicMaterial();
    expect(() => setDetailScale({ outline }, 0)).not.toThrow();
    expect(outline.userData.detailScale).toBeUndefined();
  });
});

describe('detail families', () => {
  it('keeps relief shallow enough to stay a surface', () => {
    // Slope is roughly strength / period. Past about a tenth the surface stops
    // reading as a material and starts reading as stucco.
    for (const [name, family] of Object.entries(DETAIL_FAMILIES)) {
      const period = 1 / family.frequency;
      expect(family.strength / period, `${name} relief`).toBeLessThan(0.12);
    }
  });
});
