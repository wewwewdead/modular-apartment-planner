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
// Plank courses (docs/wall-cladding-finishes.md §6.1). All zero on every
// material that is not siding, which is what switches the whole block off.
uniform float uCoursePitch;
uniform float uCourseJoint;
uniform float uCourseAxis;
uniform float uCourseTone;
uniform float uCourseLength;
uniform float uCourseRelief;
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

// How much a siding joint and a butt joint darken the board face: the shadow
// in a 6 mm gap reads close to black in daylight, a tight butt much less so.
#define DT_GROOVE_DARK 0.55
#define DT_BUTT_DARK 0.35

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
 *
 * Vertical siding boards run the other way, so their grain runs up the wall.
 */
float dtHeight(vec3 worldPos, vec3 worldNormal) {
  vec3 axis = abs(worldNormal);
  vec3 stretch = axis.x > axis.z ? vec3(1.0, 1.0, uDetailGrain) : vec3(uDetailGrain, 1.0, 1.0);
  if (uCoursePitch > 0.0 && uCourseAxis > 0.5) stretch = vec3(1.0, uDetailGrain, 1.0);
  return dtFbm(worldPos * uDetailFrequency * stretch);
}
`;

const DETAIL_VERTEX_HEAD = /* glsl */ `
varying vec3 vDetailWorldPos;
varying vec3 vDetailWorldNormal;
`;

/**
 * Where the pattern is sampled, and which way the surface faces there.
 *
 * `transformed` and `objectNormal` are the vertex in its *geometry's* space.
 * For a plain mesh that is the whole story, and the model matrix takes it to
 * world. A batched box (`previewBatching`) is an `InstancedMesh` of the shared
 * unit box: its vertices span ±0.5 and every real wall, stud and board is only
 * a row of `instanceMatrix`. three applies that row to its own `mvPosition`
 * and `worldPosition` (`project_vertex`, `worldpos_vertex`), never to
 * `transformed` — so without the block below every batched box sampled the
 * relief inside a 1 mm cube (one constant value: no relief at all) and picked
 * its grain axis from the un-rotated normal.
 *
 * The normal is treated the way `defaultnormal_vertex` treats it: divided by
 * the squared column lengths before the instance's own rotation, which is
 * the inverse-transpose for a matrix with no shear — and an instance matrix
 * here is always a translation, a rotation and a non-uniform scale.
 */
const DETAIL_VERTEX_BODY = /* glsl */ `
  vec4 dtLocalPos = vec4(transformed, 1.0);
  vec3 dtLocalNormal = objectNormal;
  #ifdef USE_INSTANCING
    dtLocalPos = instanceMatrix * dtLocalPos;
    mat3 dtIm = mat3(instanceMatrix);
    dtLocalNormal /= vec3(dot(dtIm[0], dtIm[0]), dot(dtIm[1], dtIm[1]), dot(dtIm[2], dtIm[2]));
    dtLocalNormal = dtIm * dtLocalNormal;
  #endif
  vDetailWorldPos = (modelMatrix * dtLocalPos).xyz;
  vDetailWorldNormal = normalize(mat3(modelMatrix) * dtLocalNormal);
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

/**
 * Plank courses (docs/wall-cladding-finishes.md §6.1): the joint grooves, the
 * staggered butt joints and a tone per board, drawn on whatever skin box the
 * siding material is on — there is no geometry per board.
 *
 * The set-out is the domain's (`wallSiding.js`), computed here from the
 * fragment's world position, which is plan space at elevation y: horizontal
 * joints at every world `y = k × pitch`, vertical ones wherever the plan
 * point's distance along the wall's direction is `k × pitch`. The direction is
 * the face normal turned a quarter in the horizontal plane; its sign does not
 * move a line, because the joints sit at every whole multiple either way.
 *
 * Pattern, not relief: grooves and tone must still read in the Shaded style,
 * where `uDetailStrength` is 0, so none of this is inside those branches. Only
 * the groove's normal tilt (`uCourseRelief`, below) follows the render style.
 * Every derivative is behind `uCoursePitch > 0.0`, a branch on a uniform; the
 * per-fragment choices (a top face, a faded course) are blends, never branches.
 *
 * Once a course is a few pixels across the grooves and the tones fade to their
 * mean instead of aliasing: a wall seen across the site turns the average
 * colour of its boards and joints, not a shimmering moiré.
 */
const DETAIL_COURSE = /* glsl */ `
  float dtCourseHeight = 0.0;
  if (uCoursePitch > 0.0) {
    vec3 dtCn = normalize(vDetailWorldNormal);
    vec2 dtCt = vec2(-dtCn.z, dtCn.x);
    dtCt /= max(length(dtCt), 1e-4);
    float dtAlong = dot(vDetailWorldPos.xz, dtCt);
    float dtAcross = uCourseAxis > 0.5 ? dtAlong : vDetailWorldPos.y;
    float dtLengthwise = uCourseAxis > 0.5 ? vDetailWorldPos.y : dtAlong;
    // Course coordinate: every whole number is a joint centre-line.
    float dtC = dtAcross / uCoursePitch;
    float dtFwC = max(fwidth(dtC), 1e-5);
    float dtFwMm = max(fwidth(dtLengthwise), 1e-4);
    // Fully faded by about two pixels a course.
    float dtCourseFade = smoothstep(0.2, 0.55, dtFwC);

    float dtHalf = 0.5 * uCourseJoint / uCoursePitch;
    float dtD = abs(fract(dtC + 0.5) - 0.5);
    float dtGroove = 1.0 - smoothstep(dtHalf - 0.5 * dtFwC, dtHalf + 0.5 * dtFwC, dtD);

    // Butt joints: a thin groove every board length, staggered course by course.
    float dtRow = floor(dtC);
    float dtB = dtLengthwise / uCourseLength + dtHash(vec3(dtRow + 0.5, 17.0, 3.0));
    float dtFwB = dtFwMm / uCourseLength;
    float dtButtHalf = 0.5 * max(1.5, 0.5 * uCourseJoint) / uCourseLength;
    float dtDb = abs(fract(dtB + 0.5) - 0.5);
    float dtButt = 1.0 - smoothstep(dtButtHalf - 0.5 * dtFwB, dtButtHalf + 0.5 * dtFwB, dtDb);
    float dtButtFade = max(dtCourseFade, smoothstep(0.75, 2.5, dtFwMm));

    // One tone per physical board: its course, its length along the course, and
    // the plane it is on, so two walls do not ring the same tones at one height.
    float dtPlane = floor(dot(vDetailWorldPos, dtCn) / 25.0 + 0.5)
      + 31.0 * floor(dtCn.x * 2.0 + 0.5) + 57.0 * floor(dtCn.z * 2.0 + 0.5);
    float dtBoard = dtHash(vec3(dtRow + 0.5, floor(dtB) + 0.5, dtPlane + 0.5));
    float dtTone = mix(1.0 + (dtBoard * 2.0 - 1.0) * uCourseTone, 1.0, dtCourseFade);

    float dtGrooveShown = mix(dtGroove, 2.0 * dtHalf, dtCourseFade);
    float dtButtShown = mix(dtButt, 2.0 * dtButtHalf, dtButtFade);
    float dtShade = dtTone * (1.0 - DT_GROOVE_DARK * dtGrooveShown) * (1.0 - DT_BUTT_DARK * dtButtShown);
    // A top or bottom face has no direction to set out along, and a course line
    // landing on one would darken all of it.
    float dtSideFace = 1.0 - step(0.5, abs(dtCn.y));
    diffuseColor.rgb *= mix(1.0, dtShade, dtSideFace);
    // The bevel the normal tilts on is a physical chamfer — half the joint,
    // never under 2 mm — not the one-pixel antialiased edge of the band above.
    // Tilting on that edge made a slope of millimetres per pixel: every groove
    // caught the sky as a bright line brighter than its own shadow.
    float dtBevel = max(0.5 * uCourseJoint, 2.0) / uCoursePitch;
    float dtChamfer = 1.0 - smoothstep(dtHalf, dtHalf + dtBevel + 0.5 * dtFwC, dtD);
    dtCourseHeight = -dtChamfer * (1.0 - dtCourseFade) * dtSideFace;
  }
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
  // The siding groove's bevel: the one part of the course pattern that is
  // relief, so the one part the render style scales (\`uCourseRelief\` is 0 in
  // Shaded). Same surface-gradient construction as above, on the groove height.
  if (uCoursePitch > 0.0 && uCourseRelief > 0.0) {
    vec3 dtCPos = -vViewPosition;
    vec3 dtCdx = dFdx(dtCPos);
    vec3 dtCdy = dFdy(dtCPos);
    float dtChx = dFdx(dtCourseHeight);
    float dtChy = dFdy(dtCourseHeight);
    vec3 dtCR1 = cross(dtCdy, normal);
    vec3 dtCR2 = cross(normal, dtCdx);
    float dtCDet = dot(dtCdx, dtCR1);
    float dtCInv = abs(dtCDet) > 1e-9 ? 1.0 / dtCDet : 0.0;
    normal = normalize(normal - uCourseRelief * (dtCR1 * dtChx + dtCR2 * dtChy) * dtCInv);
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
  // A float-finished render: a finer, sandier tooth than plaster (a grain of
  // aggregate every 30 mm or so rather than a trowel mark every 70), a little
  // less relief per feature, and a faint patchiness where it dried unevenly.
  // Only ever on a wall-finish material (`paletteMaterialFor`).
  render: { frequency: 0.03, strength: 1.1, grain: 1, roughness: 0.2, albedo: 0.06, mottle: 0.04 },
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
 * The plank-course uniforms a detail family drives. Every one is zero unless
 * the family carries a course (`applyCoursePattern`), and `uCoursePitch` 0 is
 * what switches the whole course block off — so a material that is not siding
 * runs the shader exactly as it ran before siding existed.
 *
 * Only the relief follows the render style's scale. The grooves and the board
 * tones are the pattern the boards are read by, and they stay in Shaded.
 */
function courseUniformValues(params, scale) {
  const pitch = params?.coursePitch > 0 ? params.coursePitch : 0;
  return {
    uCoursePitch: pitch,
    uCourseJoint: pitch ? params.courseJoint || 0 : 0,
    uCourseAxis: pitch ? params.courseAxis || 0 : 0,
    uCourseTone: pitch ? params.courseTone || 0 : 0,
    uCourseLength: pitch ? params.courseLength || 0 : 0,
    uCourseRelief: pitch ? (params.courseRelief || 0) * scale : 0,
  };
}

/**
 * Put a plank course on a detailed material: `{pitch, joint, axis, tone,
 * length, relief}` in millimetres (axis 0 horizontal, 1 vertical; relief is the
 * groove bevel's depth). Kept on `userData.detailFamily`, so a ghost twin or a
 * selection tint cloned from the material carries the same boards.
 */
export function applyCoursePattern(material, { pitch, joint, axis, tone, length, relief }) {
  material.userData.detailFamily = {
    ...(material.userData.detailFamily || ZERO_DETAIL),
    coursePitch: pitch,
    courseJoint: joint,
    courseAxis: axis,
    courseTone: tone,
    courseLength: length,
    courseRelief: relief,
  };
  syncDetailUniforms(material);
  return material;
}

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

  installDetailHook(material);
  return material;
}

/**
 * A clone of a detailed material that keeps the detail shader, and so keeps
 * sharing the one program every detailed material compiles.
 *
 * `Material.clone` copies neither the compile hook nor the cache key (both live
 * on the instance), so a plain clone compiled a program of its own — and its
 * JSON copy of `userData` carried the source's live uniforms object as dead
 * data, which made `applyProceduralDetail` think it was already patched.
 */
export function cloneWithProceduralDetail(material) {
  const clone = material.clone();
  const family = material.userData?.detailFamily;
  if (!family) return clone;
  delete clone.userData.detailUniforms;
  clone.userData.detailFamily = { ...family };
  clone.userData.detailScale = material.userData.detailScale ?? 1;
  installDetailHook(clone);
  return clone;
}

function installDetailHook(material) {
  material.onBeforeCompile = (shader) => {
    const params = material.userData.detailFamily;
    const scale = material.userData.detailScale ?? 1;

    shader.uniforms.uDetailStrength = { value: params.strength * scale };
    shader.uniforms.uDetailFrequency = { value: params.frequency };
    shader.uniforms.uDetailGrain = { value: params.grain };
    shader.uniforms.uDetailRoughness = { value: params.roughness * scale };
    shader.uniforms.uDetailAlbedo = { value: params.albedo * scale };
    shader.uniforms.uDetailMottle = { value: params.mottle * scale };
    for (const [name, value] of Object.entries(courseUniformValues(params, scale))) {
      shader.uniforms[name] = { value };
    }

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${DETAIL_VERTEX_HEAD}\nvoid main() {`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${DETAIL_VERTEX_BODY}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${DETAIL_COMMON}\nvoid main() {`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n${DETAIL_SAMPLE}\n${DETAIL_ALBEDO}\n${DETAIL_COURSE}`,
      )
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${DETAIL_ROUGHNESS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${DETAIL_NORMAL}`);

    material.userData.detailUniforms = shader.uniforms;
  };

  // Every patched material compiles the same source, so they can share one
  // program; the per-material uniform values are what differ.
  // v2: the vertex body learned `instanceMatrix` (see DETAIL_VERTEX_BODY).
  // v3: plank courses (DETAIL_COURSE) and their uniforms.
  material.customProgramCacheKey = () => 'preview-procedural-detail-v3';
  material.needsUpdate = true;
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
  for (const [name, value] of Object.entries(courseUniformValues(params, scale))) {
    if (uniforms[name]) uniforms[name].value = value;
  }
}

/**
 * Dial the whole palette's micro-relief up or down (0 switches it off).
 *
 * Uniform-only, so it takes effect on the next frame with no recompilation.
 */
export function setDetailScale(materialPalette, scale, extraMaterials = []) {
  [...Object.values(materialPalette || {}), ...extraMaterials].forEach((material) => {
    if (!material?.userData?.detailFamily) return;
    material.userData.detailScale = scale;
    syncDetailUniforms(material);
  });
}
