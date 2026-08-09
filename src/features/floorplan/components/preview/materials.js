import * as THREE from 'three';
import { applyProceduralDetail, setDetailScale } from './proceduralDetail';

/**
 * The preview's material library.
 *
 * ## Metalness is 0 or 1
 *
 * Every real surface is either a metal or it is not, and the values in between
 * describe nothing that exists — they were a convenience from before there was
 * an environment map to reflect. A steel stud at `metalness: 0.62` has 38% of a
 * diffuse colour it should not have and 62% of a reflection it cannot see,
 * which is why the old preview's steelwork looked like grey plastic. With image
 * based lighting in place, `metalness: 1` and a plausible roughness is both
 * simpler and correct: the metal's colour tints what it reflects, and what it
 * reflects is the sky the model is actually standing under.
 *
 * ## Roughness is the thing that carries material identity
 *
 * Hue barely survives tone mapping; roughness does. Sawn timber (0.75) and a
 * painted board (0.88) and a galvanised track (0.42) read as three different
 * substances even in a greyscale render, and that separation is what stops a
 * model from looking like coloured clay.
 *
 * ## Detail families
 *
 * Each material names a family in `proceduralDetail`, which gives it
 * world-space micro-relief and a matching roughness break-up. The strength is
 * scaled to zero in the Shaded style rather than removed, so switching styles
 * never triggers a shader recompile.
 */

/** Which detail family each palette entry belongs to. Absent = perfectly smooth. */
const DETAIL_ASSIGNMENTS = {
  wall: 'plaster',
  wallFiberCement: 'fibreCement',
  wallPlywood: 'timber',
  wallMixedBoard: 'board',
  wallFramingSteel: 'metal',
  wallFramingTimber: 'timber',
  wallFastener: 'metal',
  wallFastenerContrast: 'metal',
  wallFastenerConstruction: 'smooth',
  ceilingBoard: 'plaster',
  ceilingFraming: 'metal',
  ceilingHanger: 'metal',
  slab: 'concrete',
  roof: 'concrete',
  parapet: 'plaster',
  drain: 'metal',
  trussChord: 'timber',
  trussChord_timber: 'timber',
  trussChord_metal: 'metal',
  trussWeb: 'timber',
  trussWeb_timber: 'timber',
  trussWeb_metal: 'metal',
  trussPurlin: 'timber',
  trussPurlin_timber: 'timber',
  trussPurlin_metal: 'metal',
  column: 'concrete',
  beam: 'concrete',
  stair: 'concrete',
  landing: 'concrete',
  door: 'timber',
  windowFrame: 'smooth',
  electricalPlate: 'smooth',
  fixture_kitchenTop: 'smooth',
  fixture_toilet: 'smooth',
  fixture_lavatory: 'smooth',
  fixture_table: 'timber',
  fixture_tv: 'smooth',
  fixture_sofa: 'fabric',
  fixture_bed: 'fabric',
  fixtureAccentMetal: 'metal',
  fixtureAccentDark: 'smooth',
  fixtureAccentCeramic: 'smooth',
  fixtureAccentFabric: 'fabric',
  fixtureAccentWood: 'timber',
  railing_handrail: 'metal',
  railing_guardrail: 'metal',
};

/** Dielectric: paint, plaster, timber, ceramic, fabric, concrete. */
function surface(parameters) {
  return new THREE.MeshStandardMaterial({
    metalness: 0,
    side: THREE.DoubleSide,
    ...parameters,
  });
}

/** Conductor: steel, aluminium, brass. Colour tints the reflection, nothing else. */
function metal(parameters) {
  return new THREE.MeshStandardMaterial({
    metalness: 1,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
    ...parameters,
  });
}

/**
 * Glass.
 *
 * Deliberately *not* `transmission`. Refractive transmission needs a copy of
 * the framebuffer every frame and gives back a blurred view of an interior that
 * this model does not really have; a smooth, weakly tinted, strongly reflective
 * surface is both cheaper and closer to what glazing looks like from outside,
 * where it is mostly a mirror of the sky. `ior` and `specularIntensity` are what
 * make the reflection strengthen at grazing angles, which is the cue that reads
 * as glass rather than as a translucent panel.
 */
function glass(parameters) {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.04,
    ior: 1.52,
    specularIntensity: 1,
    envMapIntensity: 2.2,
    transparent: true,
    side: THREE.DoubleSide,
    ...parameters,
  });
}

export function createMaterialPalette() {
  const palette = {
    // Wall-mounted devices are real fittings, not a systems overlay — opaque
    // ivory plastic, unlike the translucent systemElectrical conduit material.
    electricalPlate: surface({ color: 0xf3efe4, roughness: 0.42 }),
    systemElectrical: surface({ color: 0xe5b92f, roughness: 0.52, transparent: true, opacity: 0.72 }),
    systemWater: surface({ color: 0x369bd7, roughness: 0.48, transparent: true, opacity: 0.68 }),
    systemMechanical: surface({ color: 0x68b783, roughness: 0.58, transparent: true, opacity: 0.62 }),

    // Painted render over blockwork: warm off-white, almost fully diffuse.
    wall: surface({ color: 0xcfc8ba, roughness: 0.9 }),
    // Fibre cement sheet. Pale, neutral, and noticeably smoother than anything
    // cast — it is pressed and sanded, so it keeps a faint satin sheen that a
    // poured surface never has. That sheen plus the flat, even tone is the
    // whole tell; drop it and the sheet becomes indistinguishable from the slab
    // it is standing on.
    wallFiberCement: surface({ color: 0xdee0dd, roughness: 0.72 }),
    wallPlywood: surface({ color: 0xc0883f, roughness: 0.7 }),
    wallMixedBoard: surface({ color: 0xc7b391, roughness: 0.8 }),
    wallFramingSteel: metal({ color: 0xb4bcc2, roughness: 0.42 }),
    wallFramingTimber: surface({ color: 0xb07740, roughness: 0.76 }),
    wallFastener: metal({ color: 0xa8adb1, roughness: 0.3 }),
    wallFastenerContrast: metal({ color: 0x3c4145, roughness: 0.36 }),
    wallFastenerConstruction: surface({ color: 0xd4523f, roughness: 0.44 }),

    ceilingBoard: surface({ color: 0xf0ece4, roughness: 0.93 }),
    ceilingFraming: metal({ color: 0xaab6c0, roughness: 0.38 }),
    ceilingHanger: metal({ color: 0x8a949c, roughness: 0.34 }),

    // Poured concrete and screed: matte, cool, and — the part that was wrong
    // before — genuinely mid-toned. Concrete reflects about a quarter of the
    // light that hits it; painting it near-white to match everything else is
    // what made a slab and a cladding sheet the same material on screen.
    slab: surface({ color: 0x8b8d8c, roughness: 0.96 }),
    roof: surface({ color: 0xa2a7ab, roughness: 0.9 }),
    parapet: surface({ color: 0xa0a5aa, roughness: 0.9 }),
    drain: metal({ color: 0x8d979f, roughness: 0.45 }),
    roofOpening: glass({ color: 0xbcd9ec, opacity: 0.24, roughness: 0.06 }),

    trussChord: surface({ color: 0x9c7550, roughness: 0.78 }),
    trussChord_timber: surface({ color: 0x9c7550, roughness: 0.78 }),
    trussChord_metal: metal({ color: 0xa6b2bc, roughness: 0.4 }),
    trussWeb: surface({ color: 0xb08a63, roughness: 0.76 }),
    trussWeb_timber: surface({ color: 0xb08a63, roughness: 0.76 }),
    trussWeb_metal: metal({ color: 0xb6c1cb, roughness: 0.36 }),
    trussPurlin: surface({ color: 0xa5835a, roughness: 0.78 }),
    trussPurlin_timber: surface({ color: 0xa5835a, roughness: 0.78 }),
    trussPurlin_metal: metal({ color: 0xaab5be, roughness: 0.34 }),

    // Fair-face precast: cleaner and lighter than an in-situ slab, still clearly
    // the same substance.
    column: surface({ color: 0x94989b, roughness: 0.93 }),
    beam: surface({ color: 0x898d91, roughness: 0.92 }),
    stair: surface({ color: 0x9a9d9f, roughness: 0.93 }),
    landing: surface({ color: 0x9d9fa2, roughness: 0.93 }),

    door: surface({ color: 0xb9854f, roughness: 0.7 }),
    // Powder-coated aluminium frame: a dielectric coat, not bare metal.
    windowFrame: surface({ color: 0xe8eaed, roughness: 0.38 }),
    window: glass({ color: 0xb6d4e8, opacity: 0.28 }),

    fixture_kitchenTop: surface({ color: 0xd8c5a4, roughness: 0.55 }),
    fixture_toilet: surface({ color: 0xe6f0f5, roughness: 0.2 }),
    fixture_lavatory: surface({ color: 0xe2edf4, roughness: 0.2 }),
    fixture_table: surface({ color: 0xc9bca6, roughness: 0.6 }),
    fixture_tv: surface({ color: 0x1e2124, roughness: 0.22 }),
    fixture_sofa: surface({ color: 0xc0b0a0, roughness: 0.95 }),
    fixture_bed: surface({ color: 0xc8d2e1, roughness: 0.96 }),
    fixtureAccentMetal: metal({ color: 0xb0b5b9, roughness: 0.28 }),
    fixtureAccentDark: surface({ color: 0x2a2a2a, roughness: 0.45 }),
    fixtureAccentCeramic: surface({ color: 0xe8eef2, roughness: 0.18 }),
    fixtureAccentFabric: surface({ color: 0xa89888, roughness: 0.97 }),
    fixtureAccentWood: surface({ color: 0x9c7a58, roughness: 0.72 }),

    railing_glass: glass({ color: 0xbcd9ec, opacity: 0.22 }),
    railing_handrail: metal({ color: 0x9ea4a9, roughness: 0.3 }),
    railing_guardrail: metal({ color: 0xa3abb2, roughness: 0.5 }),

    outline: new THREE.LineBasicMaterial({
      color: 0x25303d,
      transparent: true,
      opacity: 0.7,
    }),
  };

  Object.entries(DETAIL_ASSIGNMENTS).forEach(([key, family]) => {
    if (palette[key]) applyProceduralDetail(palette[key], family);
  });

  return palette;
}

/**
 * Point the whole palette at a render style.
 *
 * Uniform and property changes only — no material is rebuilt and no shader is
 * recompiled, so the Shaded/Realistic toggle is instant even on a large scene.
 */
export function applyRenderStyleToPalette(materialPalette, styleConfig) {
  setDetailScale(materialPalette, styleConfig.detailStrength);
}

export function disposeMaterialPalette(materialPalette) {
  Object.values(materialPalette || {}).forEach((material) => {
    material.dispose?.();
  });
}
