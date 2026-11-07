import { GHOST_TINT, GHOST_TINT_AMOUNT, ghostMaterialFor, ghostMaterialsOf } from './materials';

/**
 * See-through viewing modes for the 3D preview: Solid, X-ray and Wireframe.
 *
 * ## Why tiers, and not "everything at half opacity"
 *
 * What anyone wants from an X-ray of a building is to see what the skin hides —
 * the frame, the stairs, the furniture, the studs inside a wall, the hangers
 * over a ceiling. Making everything equally translucent gives the opposite: four
 * nested layers of glass turn to mud, and the structure you came to see is as
 * faint as the plaster in front of it. So every palette material belongs to a
 * *tier*, and a mode is a policy over tiers: in X-ray the skin and the slabs
 * ghost while structure and contents stay exactly as built. Wireframe is the
 * drawing-office mode: everything ghosts to a faint fill and the outlines carry
 * the picture.
 *
 * ## Why ghosts are twin materials (docs/preview-xray-mode.md §2.3, §3.3)
 *
 * `material.transparent` is part of three's program identity — an opaque
 * material compiles with `#define OPAQUE`, which forces alpha to 1 — so a ghost
 * cannot be made by flipping a flag on the shared palette instance: every flip
 * would relink a program, in both directions, for every material. A ghost is a
 * twin instead (`ghostMaterialFor`), made once per source and kept for the
 * palette's life, and a mode change is a traversal that swaps which of the two
 * a mesh holds. Opacity, depth writes and shadow casting are uniforms and state,
 * so after the first toggle a mode change links nothing at all.
 *
 * ## What a mode never touches
 *
 * `visible`. The walk's collision index collects meshes by it and takes its
 * structural signature from it, and a ghosted wall must still be a wall you
 * cannot walk through; the picker raycasts regardless of materials. Lights and
 * the per-object lens materials are left alone too — a lamp is not skin.
 */

export const VIEW_MODES = Object.freeze({ SOLID: 'solid', XRAY: 'xray', WIREFRAME: 'wireframe' });
export const DEFAULT_VIEW_MODE = VIEW_MODES.SOLID;

export { GHOST_TINT, GHOST_TINT_AMOUNT };

/** How long entering or leaving a see-through mode takes to fade. */
export const CROSSFADE_MS = 220;

export const TIERS = Object.freeze({
  SKIN: 'skin',
  DECK: 'deck',
  CORE: 'core',
  STRUCTURE: 'structure',
  CONTENTS: 'contents',
  GLAZING: 'glazing',
  SYSTEMS: 'systems',
  GLOW: 'glow',
  OUTLINE: 'outline',
});

/**
 * Every palette key's tier (docs/preview-xray-mode.md §3.2).
 *
 * Complete on purpose, aliases included: `viewMode.test.js` enumerates
 * `createMaterialPalette()` and fails on a key that is missing here, so a new
 * material cannot quietly fall through to "never ghosts".
 */
export const MATERIAL_TIERS = Object.freeze({
  // The skin: what a building is wrapped in, and what an X-ray looks through.
  wall: 'skin',
  wallFiberCement: 'skin',
  wallPlywood: 'skin',
  wallMixedBoard: 'skin',
  wallRainscreen: 'skin',
  wallRainscreenWarm: 'skin',
  wallRainscreenDeep: 'skin',
  ceilingBoard: 'skin',
  ceilingBoardPlywood: 'skin',
  ceilingHatch: 'skin',
  roof_slab: 'skin',
  roof: 'skin',
  roof_metal: 'skin',
  roof_tile: 'skin',
  roof_membrane: 'skin',
  roofRidgeCap: 'skin',
  roofTrim: 'skin',
  roofGutter: 'skin',
  roofDownpipe: 'skin',
  roofSoffit: 'skin',
  gableInfill: 'skin',
  parapet: 'skin',
  door: 'skin',
  windowFrame: 'skin',

  // Floors: ghosted, but less than the walls, so the storeys still read as
  // storeys and the furniture has something to stand on.
  slab: 'deck',

  // The fallback core of a framed wall (HardieFlex, plywood, mixed board)
  // whose layout derives no members — an emptied custom frame: one box the
  // full depth of the frame that stands in for studs that are not there. It
  // wears the framing's look but is not studs, so it ghosts with the boards
  // either side of it — fainter than the skin, because a frame covers only a
  // fraction of the wall. Every other framed wall draws its real members
  // (§13), which keep the framing keys below and stay solid.
  wallCoreSteel: 'core',
  wallCoreTimber: 'core',

  // The frame and what holds it together: solid in X-ray, because it is what
  // an X-ray is for.
  column: 'structure',
  beam: 'structure',
  stair: 'structure',
  landing: 'structure',
  wallFramingSteel: 'structure',
  wallFramingTimber: 'structure',
  wallFastener: 'structure',
  wallFastenerContrast: 'structure',
  wallFastenerConstruction: 'structure',
  ceilingFraming: 'structure',
  ceilingFramingTimber: 'structure',
  ceilingHanger: 'structure',
  ceilingFastener: 'structure',
  ceilingOpeningTrim: 'structure',
  ceilingOpeningHousing: 'structure',
  ceilingLuminaire: 'structure',
  ceilingDiffuser: 'structure',
  trussChord: 'structure',
  trussChord_timber: 'structure',
  trussChord_metal: 'structure',
  trussWeb: 'structure',
  trussWeb_timber: 'structure',
  trussWeb_metal: 'structure',
  trussPurlin: 'structure',
  trussPurlin_timber: 'structure',
  trussPurlin_metal: 'structure',
  drain: 'structure',
  railing_handrail: 'structure',
  railing_guardrail: 'structure',

  // What is in the rooms.
  fixture_kitchenTop: 'contents',
  fixture_toilet: 'contents',
  fixture_lavatory: 'contents',
  fixture_table: 'contents',
  fixture_tv: 'contents',
  fixture_sofa: 'contents',
  fixture_bed: 'contents',
  fixtureAccentMetal: 'contents',
  fixtureAccentDark: 'contents',
  fixtureAccentCeramic: 'contents',
  fixtureAccentFabric: 'contents',
  fixtureAccentWood: 'contents',
  electricalPlate: 'contents',
  shower: 'contents',
  plantLeaf: 'contents',
  plantLeafDeep: 'contents',
  plantPot: 'contents',

  // Transparent by design: no twin, the opacity uniform is scaled in place.
  window: 'glazing',
  roofOpening: 'glazing',
  railing_glass: 'glazing',
  systemElectrical: 'systems',
  systemWater: 'systems',
  systemMechanical: 'systems',
  windowGlow: 'glow',
  outline: 'outline',
});

/** The tiers whose meshes swap to a twin when a mode ghosts them. */
const GHOSTABLE_TIERS = new Set([TIERS.SKIN, TIERS.DECK, TIERS.CORE, TIERS.STRUCTURE, TIERS.CONTENTS]);

/**
 * Ghost opacities, per face. Every surface is double-sided, so a ghost wall is
 * blended twice — its near face and its far one — and reads at about
 * `1 - (1 - α)²`. Tuned against the §7 screenshots inside the spec's bands
 * (skin 0.12–0.20, deck 0.25–0.35, wireframe fill 0.04–0.08); see §9.
 *
 * The fallback core of a framed wall with no derivable members (§12, §13)
 * sits below the skin, inside the band 0.06–0.08: a stud frame covers roughly
 * 12–15 % of a wall, and two faces at 0.07 read at `1 - 0.93² ≈ 0.135` —
 * about what real members would show — with four ghosted board faces already
 * in front of it and behind it. An ordinary framed wall never uses it: it
 * draws its studs, and they stay solid.
 */
export const GHOST_OPACITY = Object.freeze({
  [VIEW_MODES.XRAY]: Object.freeze({ skin: 0.14, deck: 0.26, core: 0.07 }),
  [VIEW_MODES.WIREFRAME]: Object.freeze({ skin: 0.05, deck: 0.05, core: 0.05, structure: 0.05, contents: 0.05 }),
});

const GLAZING_SCALE = Object.freeze({ solid: 1, xray: 0.4, wireframe: 0.15 });
// The service runs are the point of looking inside, so X-ray thickens them.
const SYSTEMS_SCALE = Object.freeze({ solid: 1, xray: 1.4, wireframe: 0.1 });
const SYSTEMS_OPACITY_CAP = 0.95;
const OUTLINE_OPACITY = Object.freeze({ solid: 0.7, xray: 0.5, wireframe: 0.9 });

export function resolveViewMode(mode) {
  return mode === VIEW_MODES.XRAY || mode === VIEW_MODES.WIREFRAME ? mode : VIEW_MODES.SOLID;
}

export function isSeeThrough(mode) {
  const resolved = resolveViewMode(mode);
  return resolved !== VIEW_MODES.SOLID;
}

/** The tier of a palette material (or of a palette material's twin), or null. */
export function tierOf(material) {
  const key = material?.userData?.paletteKey;
  return key ? MATERIAL_TIERS[key] || null : null;
}

/**
 * What `mode` does to a material of `tier`.
 *
 * `ghost`: the mesh holds the twin, at `opacity`. `opacityScale` (and
 * `opacityCap`): a transparent-by-design material's opacity relative to the one
 * it was built with. `hidden`: the material draws nothing. `castShadow`: false
 * means the mesh stops casting; true means it casts what it was built to cast.
 */
export function viewModePolicy(mode, tier) {
  const resolved = resolveViewMode(mode);
  const policy = { ghost: false, opacity: null, opacityScale: null, opacityCap: null, hidden: false, castShadow: true };
  if (!tier) return policy;

  if (GHOSTABLE_TIERS.has(tier)) {
    const opacity = GHOST_OPACITY[resolved]?.[tier];
    if (Number.isFinite(opacity)) {
      policy.ghost = true;
      policy.opacity = opacity;
      // Shadows ignore transparency entirely (WebGLShadowMap has no notion of
      // it), so a ghost that kept casting would still throw a solid wall's
      // shadow across the structure it is meant to reveal.
      policy.castShadow = false;
    }
    return policy;
  }

  if (tier === TIERS.GLAZING) {
    policy.opacityScale = GLAZING_SCALE[resolved];
  } else if (tier === TIERS.SYSTEMS) {
    policy.opacityScale = SYSTEMS_SCALE[resolved];
    policy.opacityCap = SYSTEMS_OPACITY_CAP;
  } else if (tier === TIERS.GLOW) {
    // The warm room behind the glass is a pane hung just inside every window:
    // seen through a ghosted wall it is a tan board floating in the room.
    policy.hidden = resolved !== VIEW_MODES.SOLID;
  } else if (tier === TIERS.OUTLINE) {
    policy.opacity = OUTLINE_OPACITY[resolved];
  }
  return policy;
}

export function outlineOpacityFor(mode) {
  return OUTLINE_OPACITY[resolveViewMode(mode)];
}

/**
 * The render style a mode actually draws with.
 *
 * Ambient occlusion goes off in a see-through mode because GTAO draws the
 * scene with a normal-material override (GTAOPass `_renderOverride`) that
 * knows nothing of opacity or depth writes: it would compute occlusion from
 * the ghosts and stain the structure behind them with the shadow of a wall
 * that is no longer there. Outlines go on because a ghost without edges is a
 * smear — and Wireframe *is* the outlines. Everything else (grid, ground, sky,
 * tone mapping) stays the style's own. Solid hands the style back untouched.
 */
export function effectiveRenderStyle(style, mode) {
  if (!style || !isSeeThrough(mode)) return style;
  return { ...style, ambientOcclusion: false, outlines: true };
}

/**
 * The keyboard rule (§3.9): `X` toggles Solid ↔ X-ray (from Wireframe it goes
 * back to Solid); `Shift+X` toggles Wireframe ↔ Solid.
 */
export function nextViewMode(mode, { wireframe = false } = {}) {
  const resolved = resolveViewMode(mode);
  if (wireframe) return resolved === VIEW_MODES.WIREFRAME ? VIEW_MODES.SOLID : VIEW_MODES.WIREFRAME;
  return resolved === VIEW_MODES.SOLID ? VIEW_MODES.XRAY : VIEW_MODES.SOLID;
}

export function imageFileSuffix(mode) {
  const resolved = resolveViewMode(mode);
  return resolved === VIEW_MODES.SOLID ? '' : `-${resolved}`;
}

/**
 * Which of a click's targets it meant (§3.6).
 *
 * `entries` are `{ target, hit }`, nearest first, one per target. Solid things
 * are preferred over ghosts — a click on a ghosted wall with a column behind it
 * is a click on the column, because the column is what is on screen there —
 * and within each, the active floor over the others, which is the rule picking
 * already followed. With nothing ghosted (Solid) or everything ghosted
 * (Wireframe) this is exactly the old rule.
 */
export function choosePickTarget(entries, { activeFloorId = null, isGhostHit = () => false } = {}) {
  if (!entries?.length) return null;
  const solid = [];
  const ghost = [];
  for (const entry of entries) (isGhostHit(entry) ? ghost : solid).push(entry);
  const onActive = (list) => (activeFloorId ? list.find((entry) => entry.target?.floorId === activeFloorId) : null);
  return onActive(solid) || solid[0] || onActive(ghost) || ghost[0] || null;
}

/**
 * Point every mesh in the two roots at the material `mode` gives it.
 *
 * For each mesh (or instanced batch) holding a ghostable palette material:
 * remember the material it was built with (`userData.baseMaterial`) and
 * whether it was built to cast (`userData.castShadowBuilt`), once; then hold
 * the twin or the base, and cast or not, as the policy says. Lines, lights,
 * per-object lens materials and anything without a palette key are passed by.
 *
 * `during` is the mode being left while a crossfade runs: a mesh that is a
 * ghost in either mode holds its twin for the length of the fade, and casts as
 * it did in `during` until the fade lands.
 *
 * Incremental. Each immediate child of a root — one floor group, one floor's
 * batch group — is stamped with what was applied to it, and a stamped group is
 * skipped: the scene cache hands back untouched floors (and refilled batch
 * groups) as the same objects, so a drag only walks the floor it rebuilt.
 * Idempotent: applying the same mode twice changes nothing.
 *
 * Returns whether any shadow caster changed, which is the caller's cue to
 * re-render the shadow map.
 */
export function applyViewModeToWorld(root, batchRoot, materialPalette, mode, { during = null } = {}) {
  const resolved = resolveViewMode(mode);
  const leaving = during ? resolveViewMode(during) : null;
  const stamp = leaving && leaving !== resolved ? `${leaving}>${resolved}` : resolved;
  let shadowsChanged = false;

  for (const container of [root, batchRoot]) {
    if (!container) continue;
    for (const group of container.children) {
      if (group.userData?.viewModeApplied === stamp) continue;
      group.traverse((node) => {
        if (applyToMesh(node, materialPalette, resolved, leaving)) shadowsChanged = true;
      });
      group.userData = group.userData || {};
      group.userData.viewModeApplied = stamp;
    }
  }
  return shadowsChanged;
}

function applyToMesh(node, materialPalette, mode, leaving) {
  if (!node.isMesh) return false;
  const base = node.userData.baseMaterial || node.material;
  if (!base || Array.isArray(base) || base.userData?.ghostTwin) return false;
  const tier = tierOf(base);
  if (!GHOSTABLE_TIERS.has(tier)) return false;

  if (!node.userData.baseMaterial) node.userData.baseMaterial = base;
  if (node.userData.castShadowBuilt === undefined) node.userData.castShadowBuilt = node.castShadow;

  const policy = viewModePolicy(mode, tier);
  const previous = leaving ? viewModePolicy(leaving, tier) : null;
  const ghosted = policy.ghost || Boolean(previous?.ghost);
  const material = ghosted ? ghostMaterialFor(materialPalette, base, { tier }) : base;
  if (node.material !== material) node.material = material;

  const casting = (previous || policy).ghost ? false : node.userData.castShadowBuilt;
  if (node.castShadow !== casting) {
    node.castShadow = casting;
    return true;
  }
  return false;
}

/**
 * The opacity `mode` gives each mode-driven material of the palette: every
 * twin, the glazing and systems families (scaled from the opacity they were
 * built with), and the outline. Materials that are not in use under `mode`
 * still get an answer — a twin the mode does not ghost sits at 1, which is
 * where a crossfade towards it has to start.
 *
 * `outlinesShown` false answers 0 for the outline: a style with no outlines
 * fades them in from nothing.
 */
export function paletteOpacities(materialPalette, mode, { outlinesShown = true } = {}) {
  const resolved = resolveViewMode(mode);
  const opacities = new Map();
  if (!materialPalette) return opacities;

  for (const twin of ghostMaterialsOf(materialPalette)) {
    const policy = viewModePolicy(resolved, tierOf(twin));
    opacities.set(twin, policy.ghost ? policy.opacity : 1);
  }

  const seen = new Set();
  for (const material of Object.values(materialPalette)) {
    if (!material?.isMaterial || seen.has(material)) continue;
    seen.add(material);
    const tier = tierOf(material);
    const policy = viewModePolicy(resolved, tier);
    if (tier === TIERS.OUTLINE) {
      opacities.set(material, outlinesShown ? policy.opacity : 0);
    } else if (policy.opacityScale !== null && Number.isFinite(material.userData.baseOpacity)) {
      const scaled = material.userData.baseOpacity * policy.opacityScale;
      // Never above what it was built with on the way down, never past the
      // cap on the way up: the systems are thickened, not made opaque.
      const cap = policy.opacityCap ?? 1;
      opacities.set(material, Math.min(Math.max(scaled, 0), Math.max(cap, material.userData.baseOpacity)));
    }
  }
  return opacities;
}

/** Write a `paletteOpacities` map onto its materials. */
export function writeOpacities(opacities) {
  for (const [material, opacity] of opacities) material.opacity = opacity;
}

/**
 * Twins hold depth writes on only while they fade: near-opaque surfaces have to
 * occlude each other or the first frames of the fade show the far face through
 * the near one. Settled ghosts write no depth, which is what lets the solid
 * structure and the other ghosts behind them be seen at all.
 */
export function setGhostDepthWrite(materialPalette, depthWrite) {
  for (const twin of ghostMaterialsOf(materialPalette)) twin.depthWrite = depthWrite;
}

/**
 * Every string the control, the title line and the footer use (§6).
 *
 * `label` is the button face and `name` the mode's full name (the accessible
 * name, the title line, the footer). They differ only for Wireframe, whose
 * button says "Wire": at the split view's pane widths (358–448 px) the full
 * word pushed the header onto one more line, and §4.6 says shorten it rather
 * than add another select. The title still spells it out.
 */
export const VIEW_MODE_COPY = Object.freeze({
  groupLabel: 'Preview see-through mode',
  [VIEW_MODES.SOLID]: Object.freeze({
    label: 'Solid',
    name: 'Solid',
    title: 'Everything as built',
    titleSuffix: '',
    footer: null,
  }),
  [VIEW_MODES.XRAY]: Object.freeze({
    label: 'X-ray',
    name: 'X-ray',
    title: 'See through walls, roof, ceilings and slabs; structure, stairs and furniture stay solid (X)',
    titleSuffix: ' · X-ray',
    footer:
      'X-ray: walls, roof, ceilings and slabs are see-through; structure, stairs and furniture stay solid. Clicks pick what you can see.',
  }),
  [VIEW_MODES.WIREFRAME]: Object.freeze({
    label: 'Wire',
    name: 'Wireframe',
    title: 'Wireframe: edges only, with a faint fill (Shift+X)',
    titleSuffix: ' · Wireframe',
    footer: 'Wireframe: edges only. Clicks pick the nearest object.',
  }),
});

export const VIEW_MODE_ORDER = Object.freeze([VIEW_MODES.SOLID, VIEW_MODES.XRAY, VIEW_MODES.WIREFRAME]);
