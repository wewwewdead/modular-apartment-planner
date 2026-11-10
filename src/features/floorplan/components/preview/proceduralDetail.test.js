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
import {
  DETAIL_FAMILIES,
  applyCoursePattern,
  applyProceduralDetail,
  cloneWithProceduralDetail,
  setDetailScale,
} from './proceduralDetail';

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

describe('instanced boxes (docs/wall-cladding-finishes.md §2.3, §5.6)', () => {
  /**
   * A batched box is the shared unit box under an `instanceMatrix`, and three
   * applies that matrix to its own positions only — never to `transformed`.
   * Without the block pinned here every batched wall, stud and board sampled
   * its relief inside a one-unit cube: no relief, and a grain picked from the
   * un-rotated normal.
   */
  it('applies the instance matrix to the sampled position and normal before the model matrix', () => {
    const { vertexShader } = compile(applyProceduralDetail(new THREE.MeshStandardMaterial(), 'plaster'));
    const body = vertexShader.slice(vertexShader.indexOf('#include <project_vertex>'));

    expect(body).toContain('#ifdef USE_INSTANCING');
    expect(body).toContain('dtLocalPos = instanceMatrix * dtLocalPos;');
    // The normal the way three's defaultnormal_vertex treats a scaled instance.
    expect(body).toContain(
      'dtLocalNormal /= vec3(dot(dtIm[0], dtIm[0]), dot(dtIm[1], dtIm[1]), dot(dtIm[2], dtIm[2]));',
    );
    expect(body).toContain('dtLocalNormal = dtIm * dtLocalNormal;');
    expect(body.indexOf('instanceMatrix * dtLocalPos')).toBeLessThan(
      body.indexOf('vDetailWorldPos = (modelMatrix * dtLocalPos)'),
    );
    expect(body).toContain('vDetailWorldNormal = normalize(mat3(modelMatrix) * dtLocalNormal);');
    // Inside the instancing branch only, and balanced.
    expect(body.match(/#ifdef USE_INSTANCING/g)).toHaveLength(1);
    expect(body.indexOf('#endif')).toBeGreaterThan(body.indexOf('dtLocalNormal = dtIm * dtLocalNormal;'));
  });

  it('names the new program, so no cached older program is reused for it', () => {
    const material = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'timber');
    // v2 was the instancing fix (CL-1); v3 adds the plank courses (CL-2).
    expect(material.customProgramCacheKey()).toBe('preview-procedural-detail-v3');
  });

  it('mirrors three’s own instancing chunks, which it has to stay in step with', () => {
    expect(THREE.ShaderChunk.project_vertex).toContain('mvPosition = instanceMatrix * mvPosition;');
    expect(THREE.ShaderChunk.defaultnormal_vertex).toContain('mat3 im = mat3( instanceMatrix );');
  });
});

describe('plank courses (docs/wall-cladding-finishes.md §6.1)', () => {
  /** The branches a position sits inside, by their opening condition. */
  function enclosingConditions(source, position) {
    const stack = [];
    const opener = /if\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*\{/g;
    let match;
    const opens = [];
    while ((match = opener.exec(source))) opens.push({ index: match.index + match[0].length - 1, condition: match[1] });
    for (let index = 0; index < position; index += 1) {
      if (source[index] === '{') {
        const open = opens.find((entry) => entry.index === index);
        stack.push(open ? open.condition : '');
      } else if (source[index] === '}') {
        stack.pop();
      }
    }
    return stack;
  }

  it('draws the courses outside every uDetailStrength branch, behind a branch on the course uniform only', () => {
    const { fragmentShader } = compile(applyProceduralDetail(new THREE.MeshStandardMaterial(), 'timber'));
    const main = fragmentShader.slice(fragmentShader.indexOf('void main() {'));
    const courseAt = main.indexOf('float dtC = dtAcross / uCoursePitch;');
    expect(courseAt).toBeGreaterThan(0);
    const around = enclosingConditions(main, courseAt);
    expect(around.some((condition) => condition.includes('uDetailStrength'))).toBe(false);
    expect(around.at(-1)).toBe('uCoursePitch > 0.0');
    // Its albedo is applied inside the same branch: still not a strength branch.
    const shadeAt = main.indexOf('diffuseColor.rgb *= mix(1.0, dtShade, dtSideFace);');
    expect(enclosingConditions(main, shadeAt).some((condition) => condition.includes('uDetailStrength'))).toBe(false);
    // The bevel is the one part that follows the render style.
    const bevelAt = main.indexOf('float dtChx = dFdx(dtCourseHeight);');
    expect(enclosingConditions(main, bevelAt).at(-1)).toBe('uCoursePitch > 0.0 && uCourseRelief > 0.0');
  });

  it('runs every course derivative under uniform-only conditions', () => {
    const { fragmentShader } = compile(applyProceduralDetail(new THREE.MeshStandardMaterial(), 'timber'));
    const main = fragmentShader.slice(fragmentShader.indexOf('void main() {'));
    for (const call of ['fwidth(dtC)', 'fwidth(dtLengthwise)', 'dFdx(dtCourseHeight)', 'dFdy(dtCourseHeight)']) {
      const conditions = enclosingConditions(main, main.indexOf(call)).filter(Boolean);
      expect(conditions.length, call).toBeGreaterThan(0);
      for (const condition of conditions) expect(condition, call).toMatch(/^[\s\w.>&|]*$/);
      for (const condition of conditions) expect(condition, call).toMatch(/^(\s*u\w+\s*>\s*0\.0\s*(&&)?)+$/);
    }
  });

  it('zeroes the course uniforms of every other material, and keeps the pattern in Shaded while the bevel goes', () => {
    const plain = applyProceduralDetail(new THREE.MeshStandardMaterial(), 'timber');
    const plainShader = compile(plain);
    for (const name of [
      'uCoursePitch',
      'uCourseJoint',
      'uCourseAxis',
      'uCourseTone',
      'uCourseLength',
      'uCourseRelief',
    ]) {
      expect(plainShader.uniforms[name].value, name).toBe(0);
    }

    const siding = applyCoursePattern(applyProceduralDetail(new THREE.MeshStandardMaterial(), 'timber'), {
      pitch: 146,
      joint: 6,
      axis: 0,
      tone: 0.22,
      length: 3600,
      relief: 0.5,
    });
    const { uniforms } = compile(siding);
    expect(uniforms.uCoursePitch.value).toBe(146);
    expect(uniforms.uCourseRelief.value).toBe(0.5);
    setDetailScale({ siding }, 0);
    expect(uniforms.uDetailStrength.value).toBe(0);
    expect(uniforms.uCoursePitch.value).toBe(146);
    expect(uniforms.uCourseTone.value).toBe(0.22);
    expect(uniforms.uCourseRelief.value).toBe(0);
    // A clone (a ghost twin, a selection tint) carries the same boards.
    expect(compile(cloneWithProceduralDetail(siding)).uniforms.uCoursePitch.value).toBe(146);
  });
});
