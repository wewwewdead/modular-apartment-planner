/**
 * Roof coverings and the colours they come in.
 *
 * A covering is a product with rules: how wide one sheet covers, how tall its
 * ribs stand, how far it may span between supports, the lowest pitch it keeps
 * water out at, and what it weighs. The numbers below are the published
 * figures the spec (`docs/roof-truss-industrial.md` §2.4) collected from the
 * Lysaght, Monier/BMI and MRM guides. Where a number is an estimate rather
 * than a published figure the product carries `approx: true` and the panel
 * shows it with "≈". The single- and end-span figures of the metal sheets are
 * typical design-guide values, not copied from one table — the warnings only
 * ever read the INTERNAL span, which is the published one.
 *
 * Everything here is plain frozen data plus small pure helpers, so the domain
 * normalizers, the migration, the 3D palette and the panel can all read it.
 */

export const ROOF_COVERING_KINDS = Object.freeze([
  'metal_corrugated',
  'metal_trapezoidal',
  'metal_concealed',
  'metal_standing_seam',
  'concrete_tile',
  'clay_tile',
  'slate',
  'shingle',
  'membrane',
  'concrete_slab',
]);

export const ROOF_COVERING_KIND_LABELS = Object.freeze({
  metal_corrugated: 'Corrugated metal',
  metal_trapezoidal: 'Trapezoidal metal',
  metal_concealed: 'Concealed-fix metal',
  metal_standing_seam: 'Standing seam metal',
  concrete_tile: 'Concrete tile',
  clay_tile: 'Terracotta tile',
  slate: 'Slate',
  shingle: 'Asphalt shingle',
  membrane: 'Membrane',
  concrete_slab: 'Concrete slab',
});

export const ROOF_COVERING_FINISHES = Object.freeze(['matte', 'satin', 'gloss', 'unpainted']);

export const ROOF_COVERING_FINISH_LABELS = Object.freeze({
  matte: 'Matte',
  satin: 'Satin',
  gloss: 'Gloss',
  unpainted: 'Unpainted (bare metal)',
});

/**
 * What a covering is fixed to, which decides which spacing warnings apply:
 * sheets span between purlins, tiles and slates hang on battens, shingles and
 * membranes need a continuous deck, and a slab is the structure itself.
 */
export const ROOF_COVERING_SUPPORTS = Object.freeze({
  PURLINS: 'purlins',
  BATTENS: 'battens',
  DECK: 'deck',
  STRUCTURE: 'structure',
});

const DEG = 180 / Math.PI;

function product(entry) {
  return Object.freeze({
    approx: false,
    minPitchDegAlt: null,
    minPitchAltNote: '',
    maxOverhang: null,
    ...entry,
    maxSupportSpacing: Object.freeze({ ...entry.maxSupportSpacing }),
  });
}

/**
 * One entry per product. `coverWidth` is the sheet cover (or the tile gauge),
 * `ribHeight` the rib (or the tile thickness), `thickness` the covering layer
 * alone (sheet + rib, or tile + batten), `maxSupportSpacing` the purlin or
 * batten spacing in mm, `maxTrussSpacing` the frame spacing the product's
 * guide allows.
 */
export const ROOF_COVERING_CATALOG = Object.freeze({
  corrugated_042: product({
    id: 'corrugated_042',
    kind: 'metal_corrugated',
    label: 'Corrugated 762 · 0.42 BMT',
    coverWidth: 762,
    ribHeight: 16,
    thickness: 17,
    minPitchDeg: 5,
    maxSupportSpacing: { single: 700, end: 900, internal: 1200 },
    maxOverhang: 200,
    massKgM2: 4.3,
    maxTrussSpacing: 1200,
    support: ROOF_COVERING_SUPPORTS.PURLINS,
  }),
  corrugated_048: product({
    id: 'corrugated_048',
    kind: 'metal_corrugated',
    label: 'Corrugated 762 · 0.48 BMT',
    coverWidth: 762,
    ribHeight: 16,
    thickness: 17,
    minPitchDeg: 5,
    maxSupportSpacing: { single: 1000, end: 1300, internal: 1700 },
    maxOverhang: 250,
    massKgM2: 4.9,
    maxTrussSpacing: 1200,
    support: ROOF_COVERING_SUPPORTS.PURLINS,
  }),
  trapezoidal_042: product({
    id: 'trapezoidal_042',
    kind: 'metal_trapezoidal',
    label: 'Trapezoidal 762 / 29 · 0.42 BMT',
    coverWidth: 762,
    ribHeight: 29,
    thickness: 30,
    minPitchDeg: 2,
    maxSupportSpacing: { single: 1300, end: 1600, internal: 1900 },
    maxOverhang: 300,
    massKgM2: 4.3,
    maxTrussSpacing: 1200,
    support: ROOF_COVERING_SUPPORTS.PURLINS,
  }),
  trapezoidal_048: product({
    id: 'trapezoidal_048',
    kind: 'metal_trapezoidal',
    label: 'Trapezoidal 762 / 29 · 0.48 BMT',
    coverWidth: 762,
    ribHeight: 29,
    thickness: 30,
    minPitchDeg: 2,
    maxSupportSpacing: { single: 1700, end: 2100, internal: 2600 },
    maxOverhang: 400,
    massKgM2: 4.9,
    maxTrussSpacing: 1200,
    support: ROOF_COVERING_SUPPORTS.PURLINS,
  }),
  concealed_700_042: product({
    id: 'concealed_700_042',
    kind: 'metal_concealed',
    label: 'Concealed-fix 700 / 41 · 0.42 BMT',
    coverWidth: 700,
    ribHeight: 41,
    thickness: 42,
    minPitchDeg: 2,
    maxSupportSpacing: { single: 1500, end: 2000, internal: 2700 },
    maxOverhang: 300,
    massKgM2: 4.6,
    maxTrussSpacing: 1200,
    support: ROOF_COVERING_SUPPORTS.PURLINS,
  }),
  standing_seam_305: product({
    id: 'standing_seam_305',
    kind: 'metal_standing_seam',
    label: 'Standing seam 305 / 25',
    coverWidth: 305,
    ribHeight: 25,
    thickness: 26,
    minPitchDeg: 3,
    // The spacing is the one figure the research could not pin to a guide.
    maxSupportSpacing: { single: 900, end: 1200, internal: 1500 },
    massKgM2: 5.5,
    maxTrussSpacing: 1200,
    support: ROOF_COVERING_SUPPORTS.PURLINS,
    approx: true,
  }),
  concrete_tile_330: product({
    id: 'concrete_tile_330',
    kind: 'concrete_tile',
    label: 'Concrete tile · 330 gauge',
    coverWidth: 330,
    ribHeight: 50,
    thickness: 75,
    // 15° with sarking; an unsarked roof needs 20°.
    minPitchDeg: 15,
    minPitchDegAlt: 20,
    minPitchAltNote: 'unsarked',
    maxSupportSpacing: { single: 330, end: 330, internal: 330 },
    massKgM2: 45,
    maxTrussSpacing: 900,
    support: ROOF_COVERING_SUPPORTS.BATTENS,
  }),
  terracotta_320: product({
    id: 'terracotta_320',
    kind: 'clay_tile',
    label: 'Terracotta tile · 320 gauge',
    coverWidth: 320,
    ribHeight: 45,
    thickness: 70,
    minPitchDeg: 20,
    minPitchDegAlt: 25,
    minPitchAltNote: 'unsarked',
    maxSupportSpacing: { single: 320, end: 320, internal: 320 },
    massKgM2: 50,
    maxTrussSpacing: 900,
    support: ROOF_COVERING_SUPPORTS.BATTENS,
  }),
  slate_500: product({
    id: 'slate_500',
    kind: 'slate',
    label: 'Natural slate 500 × 250',
    // Gauge for a 500 slate at 75 headlap: (500 − 75) / 2.
    coverWidth: 212,
    ribHeight: 8,
    thickness: 33,
    minPitchDeg: 22.5,
    maxSupportSpacing: { single: 212, end: 212, internal: 212 },
    massKgM2: 30,
    maxTrussSpacing: 600,
    support: ROOF_COVERING_SUPPORTS.BATTENS,
    approx: true,
  }),
  shingle_standard: product({
    id: 'shingle_standard',
    kind: 'shingle',
    label: 'Asphalt shingle · standard',
    // Exposure of a laminated shingle.
    coverWidth: 143,
    ribHeight: 6,
    thickness: 18,
    minPitchDeg: 18.4,
    minPitchDegAlt: 9.5,
    minPitchAltNote: 'with double underlay',
    maxSupportSpacing: { single: 610, end: 610, internal: 610 },
    massKgM2: 11,
    maxTrussSpacing: 610,
    support: ROOF_COVERING_SUPPORTS.DECK,
    approx: true,
  }),
  membrane_standard: product({
    id: 'membrane_standard',
    kind: 'membrane',
    label: 'Waterproof membrane',
    coverWidth: 1000,
    ribHeight: 0,
    thickness: 2,
    // 2 % fall.
    minPitchDeg: Math.atan(0.02) * DEG,
    maxSupportSpacing: { single: 1200, end: 1200, internal: 1200 },
    massKgM2: 3,
    maxTrussSpacing: 1200,
    support: ROOF_COVERING_SUPPORTS.DECK,
    approx: true,
  }),
  concrete_slab_cast: product({
    id: 'concrete_slab_cast',
    kind: 'concrete_slab',
    label: 'Cast concrete slab',
    coverWidth: 0,
    ribHeight: 0,
    // The slab's own thickness — the roof body's `slabThickness` stands in.
    thickness: 180,
    minPitchDeg: 0,
    maxSupportSpacing: { single: 4000, end: 4500, internal: 5000 },
    massKgM2: 432,
    maxTrussSpacing: 6000,
    support: ROOF_COVERING_SUPPORTS.STRUCTURE,
    approx: true,
  }),
});

/** The product a kind's "Generic" entry borrows its numbers from. */
const GENERIC_PRODUCT_FOR_KIND = Object.freeze({
  metal_corrugated: 'corrugated_042',
  metal_trapezoidal: 'trapezoidal_042',
  metal_concealed: 'concealed_700_042',
  metal_standing_seam: 'standing_seam_305',
  concrete_tile: 'concrete_tile_330',
  clay_tile: 'terracotta_320',
  slate: 'slate_500',
  shingle: 'shingle_standard',
  membrane: 'membrane_standard',
  concrete_slab: 'concrete_slab_cast',
});

export function normalizeRoofCoveringKind(kind) {
  return ROOF_COVERING_KINDS.includes(kind) ? kind : 'metal_corrugated';
}

export function getRoofCoveringProducts(kind) {
  return Object.values(ROOF_COVERING_CATALOG).filter((entry) => entry.kind === kind);
}

/**
 * The product a covering stands for: its own catalogue entry, or — for the
 * kind's "Generic" ('' product id) or an unknown id — the kind's reference
 * product, flagged `generic`.
 */
export function resolveRoofCoveringProduct(covering) {
  const kind = normalizeRoofCoveringKind(covering?.kind);
  const stored = covering?.productId ? ROOF_COVERING_CATALOG[covering.productId] : null;
  if (stored && stored.kind === kind) return { ...stored, generic: false };
  const reference = ROOF_COVERING_CATALOG[GENERIC_PRODUCT_FOR_KIND[kind]];
  return { ...reference, id: '', label: `Generic ${ROOF_COVERING_KIND_LABELS[kind].toLowerCase()}`, generic: true };
}

// ── Colours ───────────────────────────────────────────────────────────────

function colour(name, hex, sa = null) {
  return Object.freeze({ name, hex, sa });
}

/**
 * COLORBOND® steel core range and RAL Classic.
 *
 * The hexes are APPROXIMATE sRGB renderings of the published swatches — a
 * screen cannot show a painted steel colour exactly, and the manufacturers say
 * so themselves; order a sample before committing. Solar absorptance (`sa`)
 * is the published figure where known and `null` where the research did not
 * find one. RAL has no single published SA, so every RAL entry is `null`.
 */
export const ROOF_COLOUR_CATALOG = Object.freeze({
  colorbond: Object.freeze([
    colour('Classic Cream', '#E9DCB8', 0.32),
    colour('Surfmist', '#E4E2D5', 0.33),
    colour('Southerly', '#D2D1CB', null),
    colour('Evening Haze', '#C5C2AA', 0.43),
    colour('Shale Grey', '#BDBFBA', 0.44),
    colour('Paperbark', '#CABFA4', null),
    colour('Dune', '#B1ADA3', 0.47),
    colour('Windspray', '#888B8A', 0.58),
    colour('Gully', '#857E73', 0.61),
    colour('Wallaby', '#7F7C78', 0.6),
    colour('Mangrove', '#737562', 0.62),
    colour('Pale Eucalypt', '#7C846A', 0.59),
    colour('Jasper', '#6C6153', 0.68),
    colour('Basalt', '#6D6C6E', 0.67),
    colour('Terrain', '#67432E', null),
    colour('Manor Red', '#5E1D0E', 0.69),
    colour('Cottage Green', '#304C3C', 0.68),
    colour('Ironstone', '#3E434C', 0.69),
    colour('Deep Ocean', '#364152', 0.71),
    colour('Woodland Grey', '#4B4C46', 0.71),
    colour('Monument', '#323233', 0.73),
    colour('Night Sky', '#000000', 0.95),
  ]),
  ral: Object.freeze([
    colour('RAL 1015 Light ivory', '#E6D2B5'),
    colour('RAL 3000 Flame red', '#A72920'),
    colour('RAL 3009 Oxide red', '#703731'),
    colour('RAL 3011 Brown red', '#7E292C'),
    colour('RAL 5010 Gentian blue', '#13447C'),
    colour('RAL 5014 Pigeon blue', '#637D96'),
    colour('RAL 6005 Moss green', '#0F4336'),
    colour('RAL 6020 Chrome green', '#37422F'),
    colour('RAL 7015 Slate grey', '#51565C'),
    colour('RAL 7016 Anthracite grey', '#373F43'),
    colour('RAL 7022 Umbra grey', '#4B4A44'),
    colour('RAL 7024 Graphite grey', '#474A50'),
    colour('RAL 7035 Light grey', '#CBD0CC'),
    colour('RAL 7037 Dusty grey', '#7A7B7A'),
    colour('RAL 8004 Copper brown', '#8F4E35'),
    colour('RAL 8017 Chocolate brown', '#45302B'),
    colour('RAL 9002 Grey white', '#E7EBDA'),
    colour('RAL 9005 Jet black', '#0A0A0D'),
    colour('RAL 9006 White aluminium', '#A5A8A6'),
    colour('RAL 9010 Pure white', '#F1ECE1'),
  ]),
});

export const ROOF_COLOUR_CATALOGUE_LABELS = Object.freeze({
  colorbond: 'Colorbond',
  ral: 'RAL',
  custom: 'Custom',
});

const HEX_PATTERN = /^#[0-9A-F]{6}$/;

/** `#bdbfba`, `bdbfba` → `#BDBFBA`; anything else → null. */
export function normalizeHexColour(value) {
  if (typeof value !== 'string') return null;
  let hex = value.trim().toUpperCase();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  return HEX_PATTERN.test(hex) ? hex : null;
}

export function findCatalogueColour(catalogue, name) {
  return (ROOF_COLOUR_CATALOG[catalogue] || []).find((entry) => entry.name === name) || null;
}

/** A swatch, as stored on a roof: `{hex, name, catalogue, solarAbsorptance}`. */
export function catalogueColour(catalogue, name) {
  const entry = findCatalogueColour(catalogue, name);
  if (!entry) return null;
  return { hex: entry.hex, name: entry.name, catalogue, solarAbsorptance: entry.sa };
}

export function customColour(hex) {
  const normalized = normalizeHexColour(hex) || '#BDBFBA';
  return { hex: normalized, name: normalized, catalogue: 'custom', solarAbsorptance: null };
}

/**
 * Fill a stored colour. A colour that names a catalogue swatch keeps the
 * swatch's own SA; a custom one keeps whatever SA was stored (null when none).
 */
export function normalizeRoofColour(value, fallback) {
  const base = fallback || customColour('#BDBFBA');
  if (!value || typeof value !== 'object') return { ...base };
  const hex = normalizeHexColour(value.hex);
  if (!hex) return { ...base };
  const catalogue = ['colorbond', 'ral', 'custom'].includes(value.catalogue) ? value.catalogue : 'custom';
  const sa = Number(value.solarAbsorptance);
  return {
    hex,
    name: typeof value.name === 'string' && value.name ? value.name : hex,
    catalogue,
    solarAbsorptance: Number.isFinite(sa) ? Math.min(1, Math.max(0, sa)) : null,
  };
}

/** NCC classes: light SA < 0.40, medium < 0.60, dark ≥ 0.60. */
export function solarAbsorptanceClass(sa) {
  if (!Number.isFinite(sa)) return null;
  if (sa < 0.4) return 'light';
  if (sa < 0.6) return 'medium';
  return 'dark';
}

// ── Pitch ────────────────────────────────────────────────────────────────

export function slopePercentToDegrees(percent) {
  return Math.atan(Math.max(0, Number(percent) || 0) / 100) * DEG;
}

/** `25` → `25 % · 14.0°`, the one way the panels write a slope. */
export function formatSlopeReadout(percent) {
  const value = Math.max(0, Number(percent) || 0);
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${shown} % · ${slopePercentToDegrees(value).toFixed(1)}°`;
}

// ── Defaults ─────────────────────────────────────────────────────────────

export const ROOF_PREVIEW_GREY = Object.freeze({
  hex: '#B4B8BC',
  name: 'Preview grey',
  catalogue: 'custom',
  solarAbsorptance: null,
});

const SHALE_GREY = Object.freeze({
  hex: '#BDBFBA',
  name: 'Shale Grey',
  catalogue: 'colorbond',
  solarAbsorptance: 0.44,
});
const SURFMIST = Object.freeze({ hex: '#E4E2D5', name: 'Surfmist', catalogue: 'colorbond', solarAbsorptance: 0.33 });

function isUntrimmedRoofType(roofType) {
  return roofType === 'flat' || roofType === 'custom';
}

/** Flat roofs are a grey slab; everything pitched is corrugated Shale Grey. */
export function createDefaultRoofCovering(roofType = 'flat', slabThickness = 180) {
  if (roofType === 'flat') {
    return {
      kind: 'concrete_slab',
      productId: '',
      coverWidth: 0,
      ribHeight: 0,
      thickness: Number.isFinite(slabThickness) ? slabThickness : 180,
      finish: 'matte',
      colour: { ...ROOF_PREVIEW_GREY },
    };
  }
  const corrugated = ROOF_COVERING_CATALOG.corrugated_042;
  return {
    kind: 'metal_corrugated',
    productId: corrugated.id,
    coverWidth: corrugated.coverWidth,
    ribHeight: corrugated.ribHeight,
    thickness: corrugated.thickness,
    finish: 'satin',
    colour: { ...SHALE_GREY },
  };
}

export const ROOF_GUTTER_PROFILES = Object.freeze({
  quad_115: Object.freeze({ label: 'Quad 115', width: 115, depth: 90 }),
  quad_150: Object.freeze({ label: 'Quad 150', width: 150, depth: 100 }),
  half_round_150: Object.freeze({ label: 'Half round 150', width: 150, depth: 75 }),
  box_200: Object.freeze({ label: 'Box 200', width: 200, depth: 150 }),
  none: Object.freeze({ label: 'None', width: 0, depth: 0 }),
});

export const ROOF_SOFFIT_MODES = Object.freeze(['boxed', 'raked', 'open']);

/** Pitched roofs come finished; flat and custom roofs start with every trim off. */
export function createDefaultRoofTrims(roofType = 'flat') {
  const on = !isUntrimmedRoofType(roofType);
  return {
    colour: { ...SHALE_GREY },
    fascia: { enabled: on, depth: 200, thickness: 25, drop: 0 },
    barge: { enabled: on, depth: 200, thickness: 25 },
    gutter: { enabled: on, profile: 'quad_115', width: 115, depth: 90 },
    downpipes: { enabled: on, diameter: 90, maxSpacing: 12000 },
    ridgeCap: { enabled: on, girth: 350 },
    bargeCap: { enabled: false, girth: 250 },
    soffit: { mode: on ? 'boxed' : 'open', thickness: 6, colour: { ...SURFMIST } },
  };
}

function positive(value, fallback, min = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min ? number : fallback;
}

function flag(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/** Deep-fill a stored covering; every stored value that is valid is kept. */
export function normalizeRoofCovering(covering, roofType = 'flat', slabThickness = 180) {
  const defaults = createDefaultRoofCovering(roofType, slabThickness);
  if (!covering || typeof covering !== 'object') return defaults;
  const kind = ROOF_COVERING_KINDS.includes(covering.kind) ? covering.kind : defaults.kind;
  const kindDefaults =
    kind === defaults.kind ? defaults : coveringFromProduct(resolveRoofCoveringProduct({ kind }), defaults);
  const productId =
    typeof covering.productId === 'string' && ROOF_COVERING_CATALOG[covering.productId]?.kind === kind
      ? covering.productId
      : covering.productId === ''
        ? ''
        : kindDefaults.productId;
  return {
    kind,
    productId,
    coverWidth: positive(covering.coverWidth, kindDefaults.coverWidth),
    ribHeight: positive(covering.ribHeight, kindDefaults.ribHeight),
    thickness: positive(covering.thickness, kindDefaults.thickness),
    finish: ROOF_COVERING_FINISHES.includes(covering.finish) ? covering.finish : kindDefaults.finish,
    colour: normalizeRoofColour(covering.colour, defaults.colour),
  };
}

function coveringFromProduct(productEntry, base) {
  return {
    ...base,
    kind: productEntry.kind,
    productId: productEntry.generic ? '' : productEntry.id,
    coverWidth: productEntry.coverWidth,
    ribHeight: productEntry.ribHeight,
    thickness: productEntry.thickness,
    finish: defaultFinishForKind(productEntry.kind),
  };
}

export function defaultFinishForKind(kind) {
  return String(kind).startsWith('metal_') ? 'satin' : 'matte';
}

/**
 * The covering after the Kind select changed: the kind's Generic product with
 * its catalogue sizes. The colour is the user's and is kept.
 */
export function coveringForKind(covering, kind) {
  const nextKind = normalizeRoofCoveringKind(kind);
  return coveringFromProduct(resolveRoofCoveringProduct({ kind: nextKind }), { ...covering, kind: nextKind });
}

/** The covering after the Product select changed ('' = Generic). */
export function coveringForProduct(covering, productId) {
  const resolved = resolveRoofCoveringProduct({ kind: covering?.kind, productId });
  return {
    ...covering,
    productId: resolved.generic ? '' : resolved.id,
    coverWidth: resolved.coverWidth,
    ribHeight: resolved.ribHeight,
    thickness: resolved.thickness,
  };
}

/**
 * The roof-body thickness a covering suggests. Advice for a "Use suggested"
 * button — never applied on its own, so a stored thickness is never changed
 * behind the user's back.
 */
export function suggestRoofBuildUp(covering, slabThickness = 180) {
  const kind = normalizeRoofCoveringKind(covering?.kind);
  const ribHeight = positive(covering?.ribHeight, 0);
  if (kind === 'concrete_slab') return slabThickness;
  if (kind === 'membrane') return 2 + 150;
  if (kind.startsWith('metal_')) return Math.round(ribHeight + 50);
  // Tiles, slate, shingles: the tile on its batten (or deck).
  return Math.round(ribHeight + 25);
}

export function normalizeRoofTrims(trims, roofType = 'flat') {
  const defaults = createDefaultRoofTrims(roofType);
  if (!trims || typeof trims !== 'object') return defaults;
  const gutterProfile = Object.prototype.hasOwnProperty.call(ROOF_GUTTER_PROFILES, trims.gutter?.profile)
    ? trims.gutter.profile
    : defaults.gutter.profile;
  return {
    colour: normalizeRoofColour(trims.colour, defaults.colour),
    fascia: {
      enabled: flag(trims.fascia?.enabled, defaults.fascia.enabled),
      depth: positive(trims.fascia?.depth, defaults.fascia.depth, 1),
      thickness: positive(trims.fascia?.thickness, defaults.fascia.thickness, 1),
      drop: positive(trims.fascia?.drop, defaults.fascia.drop),
    },
    barge: {
      enabled: flag(trims.barge?.enabled, defaults.barge.enabled),
      depth: positive(trims.barge?.depth, defaults.barge.depth, 1),
      thickness: positive(trims.barge?.thickness, defaults.barge.thickness, 1),
    },
    gutter: {
      enabled: flag(trims.gutter?.enabled, defaults.gutter.enabled),
      profile: gutterProfile,
      width: positive(trims.gutter?.width, defaults.gutter.width, 1),
      depth: positive(trims.gutter?.depth, defaults.gutter.depth, 1),
    },
    downpipes: {
      enabled: flag(trims.downpipes?.enabled, defaults.downpipes.enabled),
      diameter: positive(trims.downpipes?.diameter, defaults.downpipes.diameter, 1),
      maxSpacing: positive(trims.downpipes?.maxSpacing, defaults.downpipes.maxSpacing, 1000),
    },
    ridgeCap: {
      enabled: flag(trims.ridgeCap?.enabled, defaults.ridgeCap.enabled),
      girth: positive(trims.ridgeCap?.girth, defaults.ridgeCap.girth, 1),
    },
    bargeCap: {
      enabled: flag(trims.bargeCap?.enabled, defaults.bargeCap.enabled),
      girth: positive(trims.bargeCap?.girth, defaults.bargeCap.girth, 1),
    },
    soffit: {
      mode: ROOF_SOFFIT_MODES.includes(trims.soffit?.mode) ? trims.soffit.mode : defaults.soffit.mode,
      thickness: positive(trims.soffit?.thickness, defaults.soffit.thickness, 1),
      colour: normalizeRoofColour(trims.soffit?.colour, defaults.soffit.colour),
    },
  };
}

/** Which palette key draws a covering kind's roof body. */
export function roofMaterialKeyForCovering(kind) {
  const normalized = normalizeRoofCoveringKind(kind);
  if (normalized.startsWith('metal_')) return 'roof_metal';
  if (normalized === 'membrane') return 'roof_membrane';
  if (normalized === 'concrete_slab') return 'roof_slab';
  return 'roof_tile';
}

// Mirrors `DEFAULT_END_CLOSURE_COLOUR` in trussModels.js (which imports this
// module, so the default is restated here rather than imported back).
const DEFAULT_CLOSURE_COLOUR = Object.freeze({
  hex: '#E9E5DD',
  name: 'Wall',
  catalogue: 'custom',
  solarAbsorptance: null,
});

/**
 * What the 3D preview paints the roof with, read through the normalizers so
 * an old save without a covering still answers. `closures` carries the
 * gable-end infill colour (RT-2): the preview has one `gableInfill` material,
 * so the colour is per truss system and the FIRST system's wins
 * (docs/roof-truss-industrial.md §4.3 amendment). A project with trusses but no
 * roof still answers for its closures; covering, trims and soffit are null
 * then, and the palette keeps their colours.
 */
export function resolveRoofAppearance(roofSystem, trussSystems = []) {
  const closureSource = (trussSystems || []).find((entry) => entry && typeof entry === 'object') || null;
  const closures = closureSource
    ? [{ hex: normalizeRoofColour(closureSource.endClosures?.colour, DEFAULT_CLOSURE_COLOUR).hex }]
    : [];
  if (!roofSystem) {
    return closures.length ? { covering: null, trims: null, soffit: null, closures } : null;
  }
  const roofType = roofSystem.roofType || 'flat';
  const covering = normalizeRoofCovering(roofSystem.covering, roofType, roofSystem.slabThickness);
  const trims = normalizeRoofTrims(roofSystem.trims, roofType);
  return {
    covering: { kind: covering.kind, hex: covering.colour.hex, finish: covering.finish },
    trims: { hex: trims.colour.hex },
    soffit: { hex: trims.soffit.colour.hex },
    closures,
  };
}
