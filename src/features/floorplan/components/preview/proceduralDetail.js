/**
 * Surface micro-relief for the preview's PBR materials.
 *
 * A flat colour with a constant roughness is the single biggest reason an
 * untextured 3D model reads as a diagram: real plaster, concrete and sawn
 * timber all scatter light unevenly at a scale of a few millimetres, and the
 * eye reads that unevenness as "material" long before it reads the hue.
 *
 * ## Why procedural, and why no UVs
 *
 * The scene is built from `BoxGeometry` and `ExtrudeGeometry` at runtime, in
 * millimetres, at whatever size the user drew. Box UVs are 0..1 per face, so a
 * bitmap would stretch a 3 m wall and a 90 mm stud by a factor of thirty
 * relative to each other, and the extruded prisms have world-scaled UVs on
 * their sides and planar ones on their caps — there is no single repeat that is
 * right. Rather than author UVs for geometry that changes every keystroke, the
 * detail is a function of **world position**: identical scale everywhere,
 * seamless across two walls that meet, and zero texture memory.
 *
 * ## Why the normal is perturbed with derivatives
 *
 * Bumping normally needs the height sampled several times to get its gradient.
 * Here the gradient comes from `dFdx`/`dFdy` of a *single* sample, converted
 * into a surface gradient with Mikkelsen's formulation, so the whole effect
 * costs one noise evaluation per pixel. It also gets antialiasing for free:
 * when the noise gets finer than a pixel, `fwidth` grows and the strength is
 * faded out, instead of boiling into sparkle.
 *
 * The differential frame is view space (`vViewPosition`, `normal`) while the
 * *pattern* is world space. That combination is deliberate: it keeps the
 * perturbation correct for back faces of the many `DoubleSide` materials here,
 * because `normal` has already been flipped by the time we see it.
 */

const DETAIL_COMMON = /* glsl */ `
uniform float uDetailStrength;
uniform float uDetailFrequency;
uniform float uDetailGrain;
uniform float uDetailRoughness;
uniform float uDetailAlbedo;
uniform float uDetailMottle;
varying vec3 vDetailWorldPos;
varying vec3 vDetailWorldNormal;

/**
 * How much coarser the mottle is than the tooth.
 *
 * At the concrete frequency this puts a patch every ~700 mm, which is the scale
 * of a pour and a formwork panel — the thing that actually makes one bay of
 * concrete a different shade from the next.
 */
#define DT_MOTTLE_RATIO 0.07

float dtHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float dtNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dtHash(i + vec3(0.0, 0.0, 0.0)), dtHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(dtHash(i + vec3(0.0, 1.0, 0.0)), dtHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(dtHash(i + vec3(0.0, 0.0, 1.0)), dtHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(dtHash(i + vec3(0.0, 1.0, 1.0)), dtHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float dtFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * dtNoise(p);
    p *= 2.17;
    amp *= 0.5;
  }
  return sum * 1.142857; // three octaves of 0.5/0.25/0.125 sum to 0.875
}

/**
 * Height in 0..1 at a world point.
 *
 * Grain: when uDetailGrain < 1 the noise is stretched along one horizontal
 * axis, which is what sawn timber looks like. The axis is picked from the
 * surface normal — a member running east-west presents faces whose normals
 * point north-south, so the low-frequency axis is the one the normal is *least*
 * aligned with, and the grain ends up running along the member.
 */
float dtHeight(vec3 worldPos, vec3 worldNormal) {
  vec3 axis = abs(worldNormal);
  vec3 stretch = axis.x > axis.z ? vec3(1.0, 1.0, uDetailGrain) : vec3(uDetailGrain, 1.0, 1.0);
  return dtFbm(worldPos * uDetailFrequency * stretch);
}
`;

const DETAIL_VERTEX_HEAD = /* glsl */ `
varying vec3 vDetailWorldPos;
varying vec3 vDetailWorldNormal;
`;

const DETAIL_VERTEX_BODY = /* glsl */ `
  vDetailWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vDetailWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

/** Sampled once, reused by the albedo, roughness and normal injections below. */
const DETAIL_SAMPLE = /* glsl */ `
  float dtH = 0.5;
  float dtFade = 0.0;
  if (uDetailStrength > 0.0) {
    dtH = dtHeight(vDetailWorldPos, vDetailWorldNormal);
    // Fade the whole effect out once one noise period is smaller than a pixel;
    // past that point it is aliasing, not detail.
    dtFade = 1.0 - smoothstep(0.18, 0.65, fwidth(dtH));
  }
  float dtSigned = (dtH - 0.5) * dtFade;

  // The coarse patchiness that separates a cast material from a milled one.
  // Deliberately NOT faded with distance: the tooth is what aliases, and it is
  // the mottle that has to survive to keep a slab reading as concrete rather
  // than as flat grey paint once you pull the camera back.
  float dtMottled = 0.0;
  if (uDetailMottle > 0.0) {
    dtMottled = dtFbm(vDetailWorldPos * (uDetailFrequency * DT_MOTTLE_RATIO)) - 0.5;
  }
`;

const DETAIL_ALBEDO = /* glsl */ `
  diffuseColor.rgb *= 1.0 + dtSigned * uDetailAlbedo + dtMottled * uDetailMottle;
`;

const DETAIL_ROUGHNESS = /* glsl */ `
  roughnessFactor = clamp(
    roughnessFactor * (1.0 + dtSigned * uDetailRoughness + dtMottled * uDetailMottle * 0.5),
    0.02,
    1.0
  );
`;

// Every derivative here sits inside a branch on a *uniform* only. Putting a
// dFdx behind `dtFade > 0.0` — which varies pixel to pixel — would be
// non-uniform control flow, where the spec leaves derivatives undefined and
// real drivers return garbage along the boundary.
const DETAIL_NORMAL = /* glsl */ `
  if (uDetailStrength > 0.0) {
    vec3 dtPosView = -vViewPosition;
    vec3 dtDpdx = dFdx(dtPosView);
    vec3 dtDpdy = dFdy(dtPosView);
    float dtDhdx = dFdx(dtH);
    float dtDhdy = dFdy(dtH);
    vec3 dtR1 = cross(dtDpdy, normal);
    vec3 dtR2 = cross(normal, dtDpdx);
    float dtDet = dot(dtDpdx, dtR1);
    // Dividing by the determinant is what makes uDetailStrength read as
    // millimetres of relief rather than an arbitrary slider: the surface
    // gradient comes out per-millimetre, so multiplying by a height in
    // millimetres gives the unitless tilt normalize() wants.
    float dtInvDet = abs(dtDet) > 1e-9 ? 1.0 / dtDet : 0.0;
    vec3 dtSurfGrad = (dtR1 * dtDhdx + dtR2 * dtDhdy) * dtInvDet;
    normal = normalize(normal - (uDetailStrength * dtFade) * dtSurfGrad);
  }
`;

/**
 * Detail parameters per material family.
 *
 * `frequency` is in cycles per millimetre, so 0.02 means a feature roughly
 * every 50 mm. `strength` is the relief height **in millimetres** — the slope
 * it produces is strength/period, and anything past about a tenth of the period
 * stops looking like a surface and starts looking like stucco. `mottle` is the
 * coarse patchiness, expressed as the fraction the albedo swings by.
 *
 * The families exist to separate materials that are close in colour, so the
 * spread between them matters more than any single value. The pair that has to
 * stay obviously different is `concrete` and `fibreCement`: one is cast on site
 * and blotchy, the other comes off a production line uniform, and if they read
 * the same the model has stopped telling you what it is built from.
 */
export const DETAIL_FAMILIES = {
  plaster: { frequency: 0.014, strength: 1.5, grain: 1, roughness: 0.16, albedo: 0.05, mottle: 0.05 },
  concrete: { frequency: 0.02, strength: 1.5, grain: 1, roughness: 0.26, albedo: 0.1, mottle: 0.17 },
  // A pressed and sanded sheet: almost no relief, almost no variation. Its
  // whole character is *lack* of character, which is what reads as factory-made
  // next to something poured.
  fibreCement: { frequency: 0.05, strength: 0.22, grain: 1, roughness: 0.07, albedo: 0.02, mottle: 0 },
  board: { frequency: 0.028, strength: 0.45, grain: 1, roughness: 0.14, albedo: 0.04, mottle: 0.04 },
  timber: { frequency: 0.055, strength: 0.7, grain: 0.08, roughness: 0.24, albedo: 0.16, mottle: 0.08 },
  metal: { frequency: 0.1, strength: 0.12, grain: 0.06, roughness: 0.3, albedo: 0.02, mottle: 0 },
  fabric: { frequency: 0.08, strength: 0.5, grain: 1, roughness: 0.1, albedo: 0.07, mottle: 0.06 },
  smooth: { frequency: 0.04, strength: 0.15, grain: 1, roughness: 0.08, albedo: 0.02, mottle: 0 },
};

const ZERO_DETAIL = { frequency: 0.02, strength: 0, grain: 1, roughness: 0, albedo: 0, mottle: 0 };

/**
 * Give a standard/physical material the world-space detail shader.
 *
 * Safe to call on a material that is already patched — the second call just
 * re-points it at a different family.
 */
export function applyProceduralDetail(material, familyName) {
  const family = DETAIL_FAMILIES[familyName] || ZERO_DETAIL;
  material.userData.detailFamily = { ...family };
  // Live strength multiplier: the render style scales this to 0 rather than
  // recompiling, so switching Shaded/Realistic never stalls on a shader build.
  material.userData.detailScale = material.userData.detailScale ?? 1;

  if (material.userData.detailUniforms) {
    syncDetailUniforms(material);
    return material;
  }

  material.onBeforeCompile = (shader) => {
    const params = material.userData.detailFamily;
    const scale = material.userData.detailScale ?? 1;

    shader.uniforms.uDetailStrength = { value: params.strength * scale };
    shader.uniforms.uDetailFrequency = { value: params.frequency };
    shader.uniforms.uDetailGrain = { value: params.grain };
    shader.uniforms.uDetailRoughness = { value: params.roughness * scale };
    shader.uniforms.uDetailAlbedo = { value: params.albedo * scale };
    shader.uniforms.uDetailMottle = { value: params.mottle * scale };

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${DETAIL_VERTEX_HEAD}\nvoid main() {`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${DETAIL_VERTEX_BODY}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${DETAIL_COMMON}\nvoid main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${DETAIL_SAMPLE}\n${DETAIL_ALBEDO}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${DETAIL_ROUGHNESS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${DETAIL_NORMAL}`);

    material.userData.detailUniforms = shader.uniforms;
  };

  // Every patched material compiles the same source, so they can share one
  // program; the per-material uniform values are what differ.
  material.customProgramCacheKey = () => 'preview-procedural-detail-v1';
  material.needsUpdate = true;
  return material;
}

function syncDetailUniforms(material) {
  const uniforms = material.userData.detailUniforms;
  if (!uniforms) return;
  const params = material.userData.detailFamily || ZERO_DETAIL;
  const scale = material.userData.detailScale ?? 1;
  uniforms.uDetailStrength.value = params.strength * scale;
  uniforms.uDetailFrequency.value = params.frequency;
  uniforms.uDetailGrain.value = params.grain;
  uniforms.uDetailRoughness.value = params.roughness * scale;
  uniforms.uDetailAlbedo.value = params.albedo * scale;
  uniforms.uDetailMottle.value = (params.mottle ?? 0) * scale;
}

/**
 * Dial the whole palette's micro-relief up or down (0 switches it off).
 *
 * Uniform-only, so it takes effect on the next frame with no recompilation.
 */
export function setDetailScale(materialPalette, scale) {
  Object.values(materialPalette || {}).forEach((material) => {
    if (!material?.userData?.detailFamily) return;
    material.userData.detailScale = scale;
    syncDetailUniforms(material);
  });
}
