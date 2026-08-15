/**
 * Physical constants for wood-movement and shelf-sag prediction.
 *
 * EVERY number in this file is sourced. Nothing here is a guess, and anything
 * that is derived rather than quoted says so and shows the derivation. The
 * primary reference is:
 *
 *   [WH] Forest Products Laboratory. 2010. "Wood Handbook - Wood as an
 *        Engineering Material." General Technical Report FPL-GTR-190. Madison,
 *        WI: U.S. Department of Agriculture, Forest Service, Forest Products
 *        Laboratory.
 *
 * Two independent property families live here, because a shelf needs both:
 *
 *   movement  - dimensional change coefficients, tangential and radial, from
 *               [WH] Ch.13 Table 13-5 ("Dimensional change coefficient of wood
 *               ... at 6% to 14% moisture content"). The tabulated coefficient
 *               is a FRACTION of the dimension per 1 percentage point of
 *               moisture-content change, i.e. 0.00212 means 0.212 %/%MC. We
 *               store the fraction and convert for display, so the arithmetic
 *               never has to remember which unit it is in.
 *
 *   modulusGPa - modulus of elasticity in static bending at 12% MC, from [WH]
 *               Ch.5 Table 5-3b (metric). These are CLEAR, straight-grained
 *               small-specimen values; real boards with knots and slope of
 *               grain are less stiff, so a sag prediction from these numbers is
 *               the optimistic end of the range. That is called out in the
 *               shelf-sag readout rather than silently fudged here.
 *
 * Species selection
 * -----------------
 * The catalog sells generic "Pine", "Oak", "Walnut" stock. [WH] tabulates by
 * botanical species, so each catalog species is pinned to one named reference
 * species and the choice is recorded in `referenceSpecies`. Where a genus spans
 * a wide range (pine especially) the pinned species is stated so a user who
 * knows they bought something else can read the coefficient off [WH] directly.
 */

/** Movement coefficients are fractions per %MC; multiply by 100 to read as %/%MC. */
export const MOVEMENT_COEFFICIENT_TO_PERCENT = 100;

/**
 * Panel products cross-laminate, so in-plane movement is dominated by the plies
 * running the OTHER way and collapses to near-isotropic. [WH] Ch.12: "the
 * average coefficient of hygroscopic expansion or contraction in length and
 * width directions for plywood panels with about equal amounts of wood in
 * parallel and perpendicular plies is about 0.0002 mm/mm (0.02%) for each 1%
 * change in moisture content." That is roughly a tenth of the tangential
 * movement of the solid wood the plies are cut from - which is exactly why a
 * plywood carcass can be glued up rigid and a solid one cannot.
 */
export const PLYWOOD_MOVEMENT_PER_PERCENT_MC = 0.0002;

/**
 * MDF has no grain at all, but the fibre mat still takes on water. ANSI
 * A208.2-2016 caps linear expansion at 0.30% over the 50% -> 90% relative
 * humidity exposure. By the [WH] Ch.4 Table 4-2 EMC table that exposure spans
 * roughly 9.2% -> 20.5% MC at room temperature, i.e. ~11 points, so
 *
 *   0.30% / 11 %MC = 0.027 %/%MC  ->  0.00027 per %MC, rounded to 0.0003
 *
 * i.e. "similar to plywood but slightly worse", which matches shop experience:
 * an MDF panel left in a damp garage swells at its edges first.
 */
export const MDF_MOVEMENT_PER_PERCENT_MC = 0.0003;

/**
 * `kind` drives the rules, not the label:
 *   'solid-wood' - anisotropic, moves across the grain, needs a movement
 *                  allowance in a rigid joint.
 *   'panel'      - cross-laminated or fibre; isotropic and an order of
 *                  magnitude more stable.
 *   'plastic' / 'metal' - not hygroscopic. `movement` is null: these expand with
 *                  TEMPERATURE, not moisture, and quoting a moisture
 *                  coefficient for them would be a lie. Sag still works because
 *                  sag only needs `modulusGPa`.
 */
const MATERIAL_PHYSICS = Object.freeze({
  pine: {
    id: 'pine',
    label: 'Pine',
    kind: 'solid-wood',
    referenceSpecies: 'Eastern white pine (Pinus strobus)',
    // [WH] Table 13-5: eastern white pine C_T = 0.00212, C_R = 0.00071.
    movement: { tangential: 0.00212, radial: 0.00071 },
    // [WH] Table 5-3b: eastern white pine, 12% MC, MOE = 8.55 GPa.
    modulusGPa: 8.55,
    source: 'FPL Wood Handbook (GTR-190) Tables 13-5 and 5-3b, eastern white pine',
  },
  oak: {
    id: 'oak',
    label: 'Oak',
    kind: 'solid-wood',
    referenceSpecies: 'White oak (Quercus alba)',
    // [WH] Table 13-5: white oak C_T = 0.00365, C_R = 0.00180.
    movement: { tangential: 0.00365, radial: 0.0018 },
    // [WH] Table 5-3b: white oak, 12% MC, MOE = 12.27 GPa.
    modulusGPa: 12.27,
    source: 'FPL Wood Handbook (GTR-190) Tables 13-5 and 5-3b, white oak',
  },
  walnut: {
    id: 'walnut',
    label: 'Walnut',
    kind: 'solid-wood',
    referenceSpecies: 'Black walnut (Juglans nigra)',
    // [WH] Table 13-5: black walnut C_T = 0.00274, C_R = 0.00190.
    movement: { tangential: 0.00274, radial: 0.0019 },
    // [WH] Table 5-3b: black walnut, 12% MC, MOE = 11.59 GPa.
    modulusGPa: 11.59,
    source: 'FPL Wood Handbook (GTR-190) Tables 13-5 and 5-3b, black walnut',
  },
  birch: {
    id: 'birch',
    label: 'Birch',
    kind: 'solid-wood',
    referenceSpecies: 'Yellow birch (Betula alleghaniensis)',
    // [WH] Table 13-5: yellow birch C_T = 0.00338, C_R = 0.00256.
    movement: { tangential: 0.00338, radial: 0.00256 },
    // [WH] Table 5-3b: yellow birch, 12% MC, MOE = 13.86 GPa.
    modulusGPa: 13.86,
    source: 'FPL Wood Handbook (GTR-190) Tables 13-5 and 5-3b, yellow birch',
  },

  birchPlywood: {
    id: 'birchPlywood',
    label: 'Birch plywood',
    kind: 'panel',
    referenceSpecies: 'Yellow birch veneer, balanced cross-laminate',
    movement: { tangential: PLYWOOD_MOVEMENT_PER_PERCENT_MC, radial: PLYWOOD_MOVEMENT_PER_PERCENT_MC },
    // DERIVED, not quoted. In a balanced cross-laminate only the plies whose
    // grain runs along the span carry bending load; the cross plies contribute
    // little. [WH] Ch.12 puts that at roughly two-thirds of the solid-wood
    // value for bending parallel to the face grain, so
    //
    //   13.86 GPa (yellow birch, Table 5-3b) x 2/3 = 9.24 -> 9.2 GPa
    //
    // which lands inside the 8.5-10.5 GPa band published for Baltic/Finnish
    // birch plywood under EN 13986. Bending ACROSS the face grain is lower
    // still; we do not model panel orientation, so this is the along-face-grain
    // (stiffer, optimistic) case and the readout says so.
    modulusGPa: 9.2,
    modulusDerivation: '2/3 x 13.86 GPa (yellow birch, WH Table 5-3b) for a balanced cross-laminate',
    source: 'FPL Wood Handbook (GTR-190) Ch.12 (cross-lamination, 0.02%/%MC) + Table 5-3b yellow birch',
  },
  marinePlywood: {
    id: 'marinePlywood',
    label: 'Marine plywood',
    kind: 'panel',
    referenceSpecies: 'Douglas-fir core, BS 1088 style layup',
    movement: { tangential: PLYWOOD_MOVEMENT_PER_PERCENT_MC, radial: PLYWOOD_MOVEMENT_PER_PERCENT_MC },
    // Same two-thirds cross-lamination rule applied to Douglas-fir (Coast),
    // [WH] Table 5-3b MOE = 13.4 GPa:  13.4 x 2/3 = 8.93 -> 8.9 GPa.
    // Marine ply differs from ordinary ply in glue line and void tolerance, not
    // in stiffness, so the species and layup are what set the number.
    modulusGPa: 8.9,
    modulusDerivation: '2/3 x 13.4 GPa (Douglas-fir Coast, WH Table 5-3b) for a balanced cross-laminate',
    source: 'FPL Wood Handbook (GTR-190) Ch.12 + Table 5-3b Douglas-fir (Coast)',
  },
  mdf: {
    id: 'mdf',
    label: 'MDF',
    kind: 'panel',
    referenceSpecies: 'Medium-density fibreboard',
    movement: { tangential: MDF_MOVEMENT_PER_PERCENT_MC, radial: MDF_MOVEMENT_PER_PERCENT_MC },
    // ANSI A208.2-2016 grade 130 requires MOE >= 2,400 MPa; published bending
    // tests on 18mm MDF cluster at 3,000-3,600 MPa ([WH] Ch.12,
    // wood-based composite panel properties). We take the LOW end of the
    // measured band, 3.0 GPa, because for a sag WARNING the conservative
    // direction is the one that predicts more deflection.
    modulusGPa: 3.0,
    source: 'ANSI A208.2-2016 (MOE floor) + FPL Wood Handbook (GTR-190) Ch.12 measured MDF band',
  },
  acrylic: {
    id: 'acrylic',
    label: 'Acrylic (PMMA)',
    kind: 'plastic',
    referenceSpecies: 'Cast PMMA',
    // Not hygroscopic in the wood sense: PMMA takes up <2% water by mass and
    // moves with temperature, not moisture. No moisture coefficient is quoted
    // rather than inventing one.
    movement: null,
    // ISO 527 tensile modulus for cast PMMA sheet, 3,200 MPa (Roehm Plexiglas
    // GS/XT data sheet; ASTM D638 values for cast acrylic run 3.1-3.3 GPa).
    modulusGPa: 3.2,
    source: 'ISO 527 / ASTM D638 cast PMMA sheet data (3.1-3.3 GPa)',
  },
  aluminum: {
    id: 'aluminum',
    label: 'Aluminium',
    kind: 'metal',
    referenceSpecies: 'Wrought aluminium alloy (6061-T6 class)',
    movement: null,
    // ASM Metals Handbook: Young's modulus of wrought aluminium alloys is
    // 68.9 GPa (10 x 10^6 psi) and is essentially alloy-independent.
    modulusGPa: 69,
    source: 'ASM Metals Handbook, wrought aluminium alloys',
  },
  steel: {
    id: 'steel',
    label: 'Mild steel',
    kind: 'metal',
    referenceSpecies: 'Low-carbon structural steel',
    movement: null,
    // ASM Metals Handbook / EN 1993-1-1 clause 3.2.6: E = 210 GPa is the
    // Eurocode design value; ASM quotes 200 GPa (29 x 10^6 psi) for measured
    // low-carbon steel. We use the measured 200 GPa.
    modulusGPa: 200,
    source: 'ASM Metals Handbook, low-carbon steel (EN 1993-1-1 design value 210 GPa)',
  },
  stainless: {
    id: 'stainless',
    label: 'Stainless steel',
    kind: 'metal',
    referenceSpecies: 'Austenitic 304/1.4301',
    movement: null,
    // ASM Metals Handbook: austenitic 304 E = 193 GPa (28 x 10^6 psi).
    modulusGPa: 193,
    source: 'ASM Metals Handbook, austenitic stainless 304',
  },
});

export { MATERIAL_PHYSICS };

/**
 * Catalog id / name -> physics key.
 *
 * Ordered, and the order is load bearing: 'birch-plywood' must be tested before
 * 'birch', 'marine' before 'plywood', and 'stainless' before 'steel', or a
 * substring match would classify a plywood sheet as solid birch and hand it a
 * solid-wood movement coefficient it does not have.
 */
const PHYSICS_MATCHERS = [
  { pattern: /marine[-\s]?ply/i, key: 'marinePlywood' },
  { pattern: /birch[-\s]?ply/i, key: 'birchPlywood' },
  { pattern: /\bply(wood)?\b/i, key: 'birchPlywood' },
  { pattern: /\bmdf\b/i, key: 'mdf' },
  { pattern: /acrylic|pmma|perspex|plexiglas/i, key: 'acrylic' },
  { pattern: /stainless/i, key: 'stainless' },
  { pattern: /alumin/i, key: 'aluminum' },
  { pattern: /steel|mild[-\s]?steel/i, key: 'steel' },
  { pattern: /\bpine\b|\bfir\b|\bspruce\b/i, key: 'pine' },
  { pattern: /\boak\b/i, key: 'oak' },
  { pattern: /walnut/i, key: 'walnut' },
  { pattern: /birch/i, key: 'birch' },
];

/** Catalog category -> physics key, for materials whose name says nothing. */
const CATEGORY_FALLBACK = Object.freeze({
  plywood: 'birchPlywood',
  mdf: 'mdf',
  acrylic: 'acrylic',
  metal: 'steel',
});

export function getMaterialPhysicsById(physicsId) {
  return MATERIAL_PHYSICS[physicsId] ?? null;
}

/**
 * Physics for a catalog material (object) or a material id (string).
 *
 * Returns null when nothing matches, and null is a real answer: every consumer
 * treats "unknown material" as "no prediction", never as "assume pine". A
 * silently-defaulted species would put a fabricated movement number in front of
 * someone about to cut a joint.
 */
export function resolveMaterialPhysics(material) {
  if (!material) {
    return null;
  }

  const haystack = typeof material === 'string' ? material : `${material.id ?? ''} ${material.name ?? ''}`;

  for (const matcher of PHYSICS_MATCHERS) {
    if (matcher.pattern.test(haystack)) {
      return MATERIAL_PHYSICS[matcher.key];
    }
  }

  const category = typeof material === 'string' ? null : material.category;
  const fallbackKey = category ? CATEGORY_FALLBACK[category] : null;
  return fallbackKey ? MATERIAL_PHYSICS[fallbackKey] : null;
}

/** Bending stiffness input, or null when the material is not in the table. */
export function getMaterialModulusGPa(material) {
  return resolveMaterialPhysics(material)?.modulusGPa ?? null;
}

/**
 * Solid lumber: anisotropic stock that moves across its grain. Both halves must
 * agree - the catalog says `category: 'lumber'` AND the physics table resolves
 * to a solid-wood species. Metal sections are also sold by the linear metre and
 * also sit in `costBasis: 'perLinearMeter'`, so category alone is not enough.
 */
export function isSolidLumberMaterial(material) {
  if (!material || typeof material === 'string') {
    return false;
  }

  return material.category === 'lumber' && resolveMaterialPhysics(material)?.kind === 'solid-wood';
}

/** Movement coefficient in %/%MC for display ("0.365 %/%MC"). */
export function toMovementPercent(coefficient) {
  return (Number(coefficient) || 0) * MOVEMENT_COEFFICIENT_TO_PERCENT;
}
