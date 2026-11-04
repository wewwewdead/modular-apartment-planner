import * as THREE from 'three';
import { applyProceduralDetail, setDetailScale } from './proceduralDetail';
import { disposeSelectionMaterials, selectionMaterialsOf } from './selectionMaterials';

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
  wallRainscreen: 'board',
  wallRainscreenWarm: 'board',
  wallRainscreenDeep: 'board',
  wallFramingSteel: 'metal',
  wallFramingTimber: 'timber',
  wallFastener: 'metal',
  wallFastenerContrast: 'metal',
  wallFastenerConstruction: 'smooth',
  ceilingBoard: 'plaster',
  ceilingBoardPlywood: 'timber',
  ceilingFraming: 'metal',
  ceilingFramingTimber: 'timber',
  ceilingHanger: 'metal',
  ceilingFastener: 'metal',
  ceilingOpeningTrim: 'metal',
  ceilingHatch: 'plaster',
  ceilingLuminaire: 'smooth',
  ceilingDiffuser: 'metal',
  ceilingOpeningHousing: 'metal',
  slab: 'concrete',
  // The roof family is keyed by what the roof is clad in; `roof` is kept as an
  // alias of `roof_slab` (same instance) so nothing that still names it breaks.
  roof: 'concrete',
  roof_metal: 'metal',
  roof_tile: 'concrete',
  roof_membrane: 'smooth',
  roof_slab: 'concrete',
  roofRidgeCap: 'metal',
  roofTrim: 'smooth',
  roofGutter: 'smooth',
  roofDownpipe: 'smooth',
  roofSoffit: 'plaster',
  gableInfill: 'fibreCement',
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
  shower: 'smooth',
  plantLeaf: 'fabric',
  plantLeafDeep: 'fabric',
  plantPot: 'smooth',
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

/**
 * Which look a palette is built in.
 *
 * `white_model` is the presentation look every model view uses. `classic` is
 * the palette as it was before it — kept, key for key, for the wall and
 * ceiling detail editors' panes, which are working drawings of one assembly
 * and are not to change appearance with the presentation work.
 */
export const PALETTE_LOOKS = Object.freeze({ WHITE_MODEL: 'white_model', CLASSIC: 'classic' });

/** The previous values of every key the white model changed. */
const CLASSIC_SURFACES = {
  wall: { color: 0xcfc8ba, roughness: 0.9 },
  roof: { color: 0xa2a7ab, roughness: 0.9 },
  // The covering family took over from `roof`; the detail editors' panes keep
  // the grey `roof` always had, whichever covering a project names.
  roof_metal: { color: 0xa2a7ab, roughness: 0.9 },
  roof_tile: { color: 0xa2a7ab, roughness: 0.9 },
  roof_membrane: { color: 0xa2a7ab, roughness: 0.9 },
  roof_slab: { color: 0xa2a7ab, roughness: 0.9 },
  roofRidgeCap: { color: 0xa2a7ab, roughness: 0.9 },
  parapet: { color: 0xa0a5aa, roughness: 0.9 },
  column: { color: 0x94989b, roughness: 0.93 },
  beam: { color: 0x898d91, roughness: 0.92 },
  stair: { color: 0x9a9d9f, roughness: 0.93 },
  landing: { color: 0x9d9fa2, roughness: 0.93 },
  door: { color: 0xb9854f, roughness: 0.7 },
  windowFrame: { color: 0xe8eaed, roughness: 0.38 },
  window: { color: 0xb6d4e8, opacity: 0.28, envMapIntensity: 2.2 },
  railing_handrail: { color: 0x9ea4a9, roughness: 0.3 },
  railing_guardrail: { color: 0xa3abb2, roughness: 0.5 },
};

function applyClassicLook(palette) {
  for (const [key, values] of Object.entries(CLASSIC_SURFACES)) {
    const material = palette[key];
    if (!material) continue;
    if (values.color !== undefined) material.color.setHex(values.color);
    if (values.roughness !== undefined) material.roughness = values.roughness;
    if (values.opacity !== undefined) material.opacity = values.opacity;
    if (values.envMapIntensity !== undefined) material.envMapIntensity = values.envMapIntensity;
  }
  // No warm room behind the glass: without the material, no glow pane is built.
  palette.windowGlow.dispose();
  delete palette.windowGlow;
}

export function createMaterialPalette({ look = PALETTE_LOOKS.WHITE_MODEL } = {}) {
  const palette = {
    // Wall-mounted devices are real fittings, not a systems overlay — opaque
    // ivory plastic, unlike the translucent systemElectrical conduit material.
    electricalPlate: surface({ color: 0xf3efe4, roughness: 0.42 }),
    systemElectrical: surface({ color: 0xe5b92f, roughness: 0.52, transparent: true, opacity: 0.72 }),
    systemWater: surface({ color: 0x369bd7, roughness: 0.48, transparent: true, opacity: 0.68 }),
    systemMechanical: surface({ color: 0x68b783, roughness: 0.58, transparent: true, opacity: 0.62 }),

    // Painted render over blockwork: a warm white plaster, almost fully
    // diffuse — the "white model" the presentation board is built in. Still a
    // shade below the ceiling board, which stays the lightest thing in a room.
    wall: surface({ color: 0xe9e5dd, roughness: 0.88 }),
    // Fibre cement sheet. Pale, neutral, and noticeably smoother than anything
    // cast — it is pressed and sanded, so it keeps a faint satin sheen that a
    // poured surface never has. That sheen plus the flat, even tone is the
    // whole tell; drop it and the sheet becomes indistinguishable from the slab
    // it is standing on.
    wallFiberCement: surface({ color: 0xdee0dd, roughness: 0.72 }),
    wallPlywood: surface({ color: 0xc0883f, roughness: 0.7 }),
    wallMixedBoard: surface({ color: 0xc7b391, roughness: 0.8 }),

    // Weathering steel rainscreen cassettes.
    //
    // Dielectric, despite being steel: what you see on a corten facade is the
    // stable oxide it grew to protect itself, and an oxide scatters light the
    // way a mineral does. Give it `metalness: 1` and it starts mirroring the
    // sky, which is exactly what weathering steel stops doing after its first
    // winter. Roughness is high for the same reason — the patina is a crust.
    //
    // Three tones, not one. Cassettes come off different coils and weather at
    // different rates by orientation, so a real corten facade is a quilt of
    // closely related browns; a single flat tone is the tell that a render was
    // made from a spreadsheet. They stay a FIXED set of three shared instances,
    // cycled across the module grid, because every distinct material is another
    // instanced draw call — see `previewBatching`.
    wallRainscreen: surface({ color: 0x8f5230, roughness: 0.82 }),
    wallRainscreenWarm: surface({ color: 0xa66239, roughness: 0.79 }),
    wallRainscreenDeep: surface({ color: 0x6d3d26, roughness: 0.85 }),
    wallFramingSteel: metal({ color: 0xb4bcc2, roughness: 0.42 }),
    wallFramingTimber: surface({ color: 0xb07740, roughness: 0.76 }),
    wallFastener: metal({ color: 0xa8adb1, roughness: 0.3 }),
    wallFastenerContrast: metal({ color: 0x3c4145, roughness: 0.36 }),
    wallFastenerConstruction: surface({ color: 0xd4523f, roughness: 0.44 }),

    ceilingBoard: surface({ color: 0xf0ece4, roughness: 0.93 }),
    // Sanded plywood overhead: warmer and slightly glossier than the painted
    // board, a shade lighter than wall plywood because a ceiling is lit almost
    // entirely by bounce and would otherwise read as walnut.
    ceilingBoardPlywood: surface({ color: 0xcf9c5c, roughness: 0.7 }),
    ceilingFraming: metal({ color: 0xaab6c0, roughness: 0.38 }),
    ceilingFramingTimber: surface({ color: 0xb07740, roughness: 0.76 }),
    ceilingHanger: metal({ color: 0x8a949c, roughness: 0.34 }),
    ceilingFastener: metal({ color: 0xa8adb1, roughness: 0.3 }),

    // Openings, from below. The trim ring is the one part every opening has, so
    // it stays neutral — a painted metal flange that reads as a finished edge
    // rather than as a fitting. What sits inside it is what tells them apart: a
    // hatch is a lid of the same board as the ceiling, a downlight is a bright
    // diffusing lens, a diffuser is a cooler machined grille. The housings above
    // are dark because they live in the plenum and are only ever glimpsed.
    ceilingOpeningTrim: metal({ color: 0xd9dbdc, roughness: 0.46 }),
    ceilingHatch: surface({ color: 0xe9e4da, roughness: 0.9 }),
    ceilingLuminaire: surface({ color: 0xfbf6e6, roughness: 0.24 }),
    ceilingDiffuser: metal({ color: 0xc6cdd2, roughness: 0.4 }),
    ceilingOpeningHousing: metal({ color: 0x5d666d, roughness: 0.55 }),

    // Poured concrete and screed: matte, cool, and — the part that was wrong
    // before — genuinely mid-toned. Concrete reflects about a quarter of the
    // light that hits it; painting it near-white to match everything else is
    // what made a slab and a cladding sheet the same material on screen.
    slab: surface({ color: 0x8b8d8c, roughness: 0.96 }),
    // The roof body, one material per covering family. `roof_slab` is the old
    // `roof`: a notch lighter than the slab, so a flat roof reads as a finished
    // surface. The others start in the default covering's Shale Grey; the real
    // colour and finish are the project's, applied at runtime by
    // `applyRoofAppearanceToPalette` (one roof per project, so mutating the
    // shared instances is enough and nothing recompiles).
    roof_slab: surface({ color: 0xb4b8bc, roughness: 0.9 }),
    // Painted steel is a paint film, not a mirror: dielectric, satin.
    roof_metal: surface({ color: 0xbdbfba, roughness: 0.5 }),
    roof_tile: surface({ color: 0xbdbfba, roughness: 0.85 }),
    roof_membrane: surface({ color: 0xbdbfba, roughness: 0.6 }),
    // Ridge and barge capping: the covering's own sheet folded over the ridge.
    roofRidgeCap: surface({ color: 0xbdbfba, roughness: 0.5 }),
    // Fascia, barge board, gutter and downpipe share one trim colour — and one
    // instance (`roofGutter` and `roofDownpipe` alias it below), so the whole
    // edge kit is a single instanced material.
    roofTrim: surface({ color: 0xbdbfba, roughness: 0.55 }),
    // Fibre cement eaves lining, painted.
    roofSoffit: surface({ color: 0xe4e2d5, roughness: 0.88 }),
    // Gable-end infill cladding (RT-2 draws it; the key is here so the palette
    // and its runtime appearance hook are complete).
    gableInfill: surface({ color: 0xe9e5dd, roughness: 0.8 }),
    parapet: surface({ color: 0xd9d6cf, roughness: 0.9 }),
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

    // The RC frame, plastered over: one step below the wall so it reads as a
    // frame line rather than a grey cage, and still darker than a fibre cement
    // sheet, which is a finish hung on it.
    column: surface({ color: 0xd5d2cb, roughness: 0.9 }),
    beam: surface({ color: 0xd1cec7, roughness: 0.9 }),
    stair: surface({ color: 0xd2cfc8, roughness: 0.9 }),
    landing: surface({ color: 0xd2cfc8, roughness: 0.9 }),

    // Dark stained timber — the one warm accent on a white model.
    door: surface({ color: 0x5a3f2b, roughness: 0.62 }),
    // Charcoal powder-coated aluminium: a dielectric coat, not bare metal.
    windowFrame: surface({ color: 0x2f3338, roughness: 0.5 }),
    // More sky in the glass: a deeper tint and a stronger reflection.
    window: glass({ color: 0x9fc3dc, opacity: 0.4, envMapIntensity: 2.8 }),
    /**
     * The warm, dim room behind the glass.
     *
     * There is no interior to see through a window from outside, and a
     * transmissive glass would only blur one that is not there. A pane just
     * behind the glazing that glows faintly warm is what a photograph of a lived
     * in building shows instead. Emissive, so its strength is one uniform —
     * `applyInteriorLighting` turns it up at night and down with the lights,
     * without a recompile — and transparent, so it is never batched and never
     * writes depth.
     */
    windowGlow: new THREE.MeshStandardMaterial({
      color: 0x2b2826,
      emissive: 0xffc98a,
      emissiveIntensity: 0.35,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      // Seen from outside only: the pane faces out, and from inside a room it
      // is culled rather than read as a tan board in the window.
      side: THREE.FrontSide,
    }),
    // A shower tray: glazed ceramic, smoother than any fixture body.
    shower: surface({ color: 0xe6eef3, roughness: 0.2 }),
    // Potted plants. A FIXED set of three shared materials — two leaf greens
    // and the pot — because every distinct material is another instanced draw
    // call (see `previewBatching`).
    plantLeaf: surface({ color: 0x5f9a4c, roughness: 0.8 }),
    plantLeafDeep: surface({ color: 0x3f7a3a, roughness: 0.85 }),
    plantPot: surface({ color: 0x4a4a4a, roughness: 0.7 }),

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
    // Thin dark rails, as the reference draws them.
    railing_handrail: metal({ color: 0x2f3338, roughness: 0.4 }),
    railing_guardrail: metal({ color: 0x3a3f45, roughness: 0.5 }),

    outline: new THREE.LineBasicMaterial({
      color: 0x25303d,
      transparent: true,
      opacity: 0.7,
    }),

    /**
     * Whether the edge overlay is worth building at all.
     *
     * Not a material, and it lives here because the palette is the only thing a
     * scene build is handed that knows anything about the style on screen. The
     * Realistic style draws no outlines, so building them is `EdgesGeometry` over
     * the whole model plus a second Object3D hung off every mesh, for a drawing
     * convention that is switched off — see `addOutline` and `ensureOutlines`.
     *
     * True by default, so a palette nobody has pointed at a style — a still, a
     * test, an assembly editor's own pane — builds exactly what it always did.
     */
    outlinesEnabled: true,
  };

  palette.roof = palette.roof_slab;
  palette.roofGutter = palette.roofTrim;
  palette.roofDownpipe = palette.roofTrim;

  Object.entries(DETAIL_ASSIGNMENTS).forEach(([key, family]) => {
    if (palette[key]) applyProceduralDetail(palette[key], family);
  });
  // Owned by the palette like every material here, and flagged so nothing
  // downstream mistakes it for a per-object material it may dispose or clone.
  palette.windowGlow.userData.ownedByPalette = true;

  if (look === PALETTE_LOOKS.CLASSIC) applyClassicLook(palette);
  palette.look = look;

  return palette;
}

/**
 * Point the whole palette at a render style.
 *
 * Uniform and property changes only — no material is rebuilt and no shader is
 * recompiled, so the Shaded/Realistic toggle is instant even on a large scene.
 */
export function applyRenderStyleToPalette(materialPalette, styleConfig) {
  // The selection overlay's tinted copies follow the palette's relief setting.
  setDetailScale(materialPalette, styleConfig.detailStrength, selectionMaterialsOf(materialPalette));
  // Read by the next scene build to decide whether to cut edge geometry at all.
  // Turning it back on does not retrofit the world that was built without it —
  // `ensureOutlines` does, from the viewport, once the palette says yes.
  materialPalette.outlinesEnabled = styleConfig.outlines !== false;
}

/** Roughness of a painted covering by finish (spec §5.1). */
export const ROOF_FINISH_ROUGHNESS = Object.freeze({ matte: 0.75, satin: 0.5, gloss: 0.3, unpainted: 0.4 });

const ROOF_COVERING_KEYS = ['roof_metal', 'roof_tile', 'roof_membrane', 'roof_slab', 'roofRidgeCap'];
const ROOF_TRIM_KEYS = ['roofTrim', 'roofGutter', 'roofDownpipe'];
/** The base roughness of the non-metal covering families, which a 'matte' finish keeps. */
const ROOF_MATTE_ROUGHNESS = { roof_tile: 0.85, roof_membrane: 0.6, roof_slab: 0.9 };

function hexNumber(hex) {
  if (typeof hex !== 'string') return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return match ? parseInt(match[1], 16) : null;
}

function setMaterialAppearance(material, hex, roughness, metal, result) {
  if (!material) return;
  let changed = false;
  if (hex !== null && material.color.getHex() !== hex) {
    material.color.setHex(hex);
    changed = true;
  }
  if (Number.isFinite(roughness) && material.roughness !== roughness) {
    material.roughness = roughness;
    changed = true;
  }
  if (typeof metal === 'boolean') {
    const metalness = metal ? 1 : 0;
    if (material.metalness !== metalness) {
      material.metalness = metalness;
      material.envMapIntensity = metal ? 1.15 : 1;
      // A metalness flip is the one change that needs a program update; colour
      // and roughness are plain uniforms.
      material.needsUpdate = true;
      result.recompile = true;
      changed = true;
    }
  }
  if (changed) result.changed = true;
}

/**
 * Put the project's roof covering, trim, soffit and gable-infill colours on the
 * palette. `appearance` is `{covering: {kind, hex, finish}, trims: {hex},
 * soffit: {hex}, closures: [{hex}]}` (see `resolveRoofAppearance`).
 *
 * A runtime mutation of shared instances, like the window glow and the ground
 * colour: nothing is rebuilt, nothing recompiles unless an 'unpainted' finish
 * flips a material to bare metal, and batching keeps working because the
 * instanced draws hold the same material objects. One roof per project is what
 * makes this enough — a second roof would need per-roof keys.
 *
 * Returns `{changed, recompile}` so the caller can skip a redraw, and warm
 * shaders only when a metalness flip asked for a new program.
 */
export function applyRoofAppearanceToPalette(materialPalette, appearance) {
  const result = { changed: false, recompile: false };
  if (!materialPalette || !appearance) return result;
  const finish = appearance.covering?.finish;
  const unpainted = finish === 'unpainted';
  const finishRoughness = ROOF_FINISH_ROUGHNESS[finish];
  const coveringHex = hexNumber(appearance.covering?.hex);

  // A project with trusses but no roof answers for its closures only
  // (`covering` null): the roof keys are left exactly as they are.
  if (appearance.covering) {
    for (const key of ROOF_COVERING_KEYS) {
      const metalFamily = key === 'roof_metal' || key === 'roofRidgeCap';
      const roughness = finish === 'matte' && !metalFamily ? ROOF_MATTE_ROUGHNESS[key] : finishRoughness;
      setMaterialAppearance(materialPalette[key], coveringHex, roughness, metalFamily ? unpainted : false, result);
    }

    // Trims are painted steel in the same finish as the sheet they edge.
    const trimHex = hexNumber(appearance.trims?.hex);
    for (const key of ROOF_TRIM_KEYS) {
      setMaterialAppearance(materialPalette[key], trimHex, finishRoughness, unpainted, result);
    }
  }

  // Lining and cladding are fibre cement: colour only, never metal.
  setMaterialAppearance(materialPalette.roofSoffit, hexNumber(appearance.soffit?.hex), undefined, undefined, result);
  const closureHex = hexNumber(appearance.closures?.[0]?.hex);
  setMaterialAppearance(materialPalette.gableInfill, closureHex, undefined, undefined, result);

  return result;
}

export function disposeMaterialPalette(materialPalette) {
  Object.values(materialPalette || {}).forEach((material) => {
    material?.dispose?.();
  });
  disposeSelectionMaterials(materialPalette);
}
