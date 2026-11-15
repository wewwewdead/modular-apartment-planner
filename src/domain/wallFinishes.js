/**
 * What a wall face looks like, as opposed to what it is built from.
 *
 * A face has a MATERIAL — the board or block it is made of, which sets its
 * thickness and its line in the bill — and, optionally, a FINISH: paint,
 * render or a timber stain, in a colour and a sheen. The two are separate
 * because a facade is: the orange panel and the white panel beside it are the
 * same fibre-cement sheet with two coats of different paint on it.
 *
 * A face with no finish is STOCK and looks exactly as it always has. That is
 * what lets every existing project load unchanged — no migration, no schema
 * bump — and it is why a stock layer must not carry a `finish` key at all,
 * not even a null one: the normalised assembly of a stock wall has to stay
 * deep-equal to what it was before finishes existed (docs/wall-cladding-
 * finishes.md §4).
 *
 * Plain data and pure helpers, no THREE: the assembly normaliser, the plan,
 * the detail drawing, the 3D palette and the panel all read this one module.
 *
 * The swatch hexes below are APPROXIMATE sRGB renderings for the screen, the
 * same caveat the roof catalogue carries — a monitor cannot show a paint or a
 * stain exactly, and the manufacturers say so themselves. Order a sample.
 */
import { ROOF_COLOUR_CATALOG, normalizeHexColour } from './roofCoveringCatalog';
import { normalizeSidingCourse, parseSidingCourseKey, sidingCourseKey } from './wallSiding';

export const WALL_FINISH_KINDS = Object.freeze({
  PAINT: 'paint',
  RENDER: 'render',
  TIMBER: 'timber',
});

export const WALL_FINISH_KIND_LABELS = Object.freeze({
  paint: 'Paint',
  render: 'Render',
  timber: 'Timber stain',
});

export const WALL_FINISH_SHEENS = Object.freeze({
  MATTE: 'matte',
  SATIN: 'satin',
  GLOSS: 'gloss',
});

export const WALL_FINISH_SHEEN_LABELS = Object.freeze({
  matte: 'Matte',
  satin: 'Satin',
  gloss: 'Gloss',
});

const FINISH_KIND_VALUES = Object.values(WALL_FINISH_KINDS);
const FINISH_SHEEN_VALUES = Object.values(WALL_FINISH_SHEENS);

/**
 * How thick the finish coat on the INSIDE of a finished masonry wall is drawn
 * in 3D, in millimetres. A masonry wall is one box; once its two faces differ
 * the box is split into the body (in the outside colour, so its ends, jambs and
 * top read as the facade) and a skin this thick on the inside face. Ten
 * millimetres is a plaster coat — thin enough that nobody reads it as a layer,
 * thick enough that it never z-fights the body behind it.
 */
export const MASONRY_FINISH_COAT = 10;

function swatch(name, hex) {
  return Object.freeze({ name, hex });
}

/**
 * The colours a facade is painted in, and the timbers a stain imitates.
 *
 * `facade` is a working palette for an apartment block — whites and stones for
 * the field, blue-greys for a second volume, and the warm accents (Signal
 * Orange, Terracotta, Ochre) a reveal or a bay is picked out in. `timber` is
 * the species a plank or a plywood face is stained to look like. `ral` is the
 * roof catalogue's RAL list, shared rather than copied so a roof and a wall
 * named in the same RAL are one colour.
 */
export const WALL_COLOUR_CATALOG = Object.freeze({
  facade: Object.freeze([
    swatch('Warm White', '#F2EEE4'),
    swatch('Bone', '#E4DDCC'),
    swatch('Pale Stone', '#D6D2C4'),
    swatch('Stone Grey', '#A9A9A2'),
    swatch('Fog Blue', '#AEBBC4'),
    swatch('Slate Blue', '#6F8597'),
    swatch('Graphite', '#45494D'),
    swatch('Charcoal', '#2F3338'),
    swatch('Signal Orange', '#E0701F'),
    swatch('Terracotta', '#C4572E'),
    swatch('Ochre', '#C99A3B'),
    swatch('Sand', '#CDB991'),
    swatch('Olive', '#7C8356'),
    swatch('Moss', '#56684A'),
    swatch('Brick Red', '#8E3B2B'),
    swatch('Sky', '#8DB3CF'),
  ]),
  timber: Object.freeze([
    swatch('Ipe', '#6B4226'),
    swatch('Teak', '#A0703F'),
    swatch('Western Red Cedar', '#A8643C'),
    swatch('Merbau', '#7A3E24'),
    swatch('Mahogany', '#8A4B32'),
    swatch('Narra', '#B5763A'),
    swatch('Yakal', '#8C6A3F'),
    swatch('Thermo Ash', '#6E4B2F'),
    swatch('Charred', '#2B2623'),
    swatch('Weathered Grey', '#8C8A84'),
  ]),
  ral: ROOF_COLOUR_CATALOG.ral,
});

export const WALL_COLOUR_CATALOGUE_LABELS = Object.freeze({
  facade: 'Facade',
  timber: 'Timber',
  ral: 'RAL',
  custom: 'Custom',
});

const COLOUR_CATALOGUES = Object.freeze(['facade', 'timber', 'ral', 'custom']);

/**
 * A wall colour as stored: `{hex, name, catalogue}`. Unlike a roof colour it
 * carries no solar absorptance — nothing reads one off a wall.
 */
export function wallCatalogueColour(catalogue, name) {
  const entry = (WALL_COLOUR_CATALOG[catalogue] || []).find((candidate) => candidate.name === name);
  return entry ? { hex: entry.hex, name: entry.name, catalogue } : null;
}

export function customWallColour(hex) {
  const normalized = normalizeHexColour(hex) || '#F2EEE4';
  return { hex: normalized, name: normalized, catalogue: 'custom' };
}

/**
 * Which finishes a face can take (spec §4's table).
 *
 * The table is by what the face IS, so changing a board drops a finish the
 * new board cannot carry without the UI having to remember to: a render on a
 * plywood face is not a thing, and neither is any finish on a framed face with
 * no board. Every masonry face is plaster over block, so it takes paint or
 * render whatever its (always `none`) layer material says.
 */
export function wallFinishKindsFor(system, material) {
  if (system === 'masonry') return [WALL_FINISH_KINDS.PAINT, WALL_FINISH_KINDS.RENDER];
  if (material === 'fiber_cement') return [WALL_FINISH_KINDS.PAINT, WALL_FINISH_KINDS.RENDER];
  if (material === 'plywood') return [WALL_FINISH_KINDS.PAINT, WALL_FINISH_KINDS.TIMBER];
  // A painted rainscreen is one colour; the open joints stay.
  if (material === 'rainscreen') return [WALL_FINISH_KINDS.PAINT];
  // Timber boards first — they are what siding is — or painted fibre-cement
  // planks. Never stock: see `resolveLayerFinish`.
  if (material === 'siding') return [WALL_FINISH_KINDS.TIMBER, WALL_FINISH_KINDS.PAINT];
  return [];
}

/** What a freshly chosen kind starts as, before anyone picks a colour. */
export function defaultWallFinish(kind) {
  if (kind === WALL_FINISH_KINDS.TIMBER) {
    return { kind, colour: wallCatalogueColour('timber', 'Ipe'), sheen: WALL_FINISH_SHEENS.SATIN };
  }
  if (kind === WALL_FINISH_KINDS.RENDER) {
    return { kind, colour: wallCatalogueColour('facade', 'Bone'), sheen: WALL_FINISH_SHEENS.MATTE };
  }
  return {
    kind: WALL_FINISH_KINDS.PAINT,
    colour: wallCatalogueColour('facade', 'Warm White'),
    sheen: WALL_FINISH_SHEENS.MATTE,
  };
}

function normalizeWallColour(value, fallback) {
  const hex = normalizeHexColour(value?.hex);
  if (!hex) return { ...fallback };
  const catalogue = COLOUR_CATALOGUES.includes(value.catalogue) ? value.catalogue : 'custom';
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : hex;
  return { hex, name, catalogue };
}

/**
 * A finish the face can carry, filled in — or `null` when there is none to
 * keep: no value, a kind this face does not offer, or not a finish at all.
 *
 * A finish with a good kind but a missing colour or sheen is kept and given
 * the kind's own defaults, the way a roof colour is repaired rather than
 * dropped: losing someone's choice of "render" because the colour was mangled
 * would be the worse failure.
 */
export function normalizeWallFinish(value, system, material) {
  if (!value || typeof value !== 'object') return null;
  if (!FINISH_KIND_VALUES.includes(value.kind)) return null;
  if (!wallFinishKindsFor(system, material).includes(value.kind)) return null;
  const defaults = defaultWallFinish(value.kind);
  return {
    kind: value.kind,
    colour: normalizeWallColour(value.colour, defaults.colour),
    sheen: FINISH_SHEEN_VALUES.includes(value.sheen) ? value.sheen : defaults.sheen,
  };
}

/**
 * The finish a board layer carries once normalised: the stored one when the
 * face can take it, otherwise none — except on plank siding, which always has
 * a look (spec §6.1): a siding face with no stored finish, or one it cannot
 * carry, wears timber · Ipe · satin. There is no "stock" siding to fall back
 * to, because there is no siding material to be stock in.
 */
export function resolveLayerFinish(value, system, material) {
  const finish = normalizeWallFinish(value, system, material);
  if (finish) return finish;
  if (material === 'siding' && wallFinishKindsFor(system, material).includes(WALL_FINISH_KINDS.TIMBER)) {
    return defaultWallFinish(WALL_FINISH_KINDS.TIMBER);
  }
  return null;
}

/** Whether two (normalised) finishes describe the same look. */
export function sameWallFinish(a, b) {
  if (!a || !b) return !a && !b;
  return (
    a.kind === b.kind &&
    a.sheen === b.sheen &&
    a.colour?.hex === b.colour?.hex &&
    a.colour?.name === b.colour?.name &&
    a.colour?.catalogue === b.colour?.catalogue
  );
}

/**
 * Which stock material a finish is painted over, as the short code its 3D key
 * carries.
 */
function finishSubstrate(system, material) {
  if (system === 'masonry') return 'masonry';
  if (material === 'fiber_cement') return 'fc';
  if (material === 'plywood') return 'ply';
  if (material === 'rainscreen') return 'cassette';
  if (material === 'siding') return 'siding';
  return null;
}

// A siding key carries its courses as a sixth field (`h140j6`); no other
// substrate has one, so every pre-siding key is exactly what it was.
const FINISH_KEY_PATTERN =
  /^wallFinish:(paint|render|timber):(fc|ply|cassette|masonry|siding):([0-9A-F]{6}):(matte|satin|gloss)(?::([hv]\d+j\d+))?$/;

/**
 * The 3D palette key a face's finish is drawn with, or `null` for a stock face.
 *
 * A self-describing string — `wallFinish:<kind>:<substrate>:<HEX6>:<sheen>`,
 * plus `:<h|v><exposure>j<joint>` on a siding face, whose courses are part of
 * its look —
 * because the preview has no per-object colour: every mesh is
 * `palette[descriptor.materialKey]`, batching buckets on material identity, and
 * descriptor carry-over compares descriptors structurally. A key that names
 * the whole look lets the palette build the material on first sight
 * (`paletteMaterialFor`), makes every face with the same look share one
 * instance — one draw call per floor — and is the same string on every
 * rebuild, so a drag on another wall carries this one over untouched.
 *
 * `layer` is a board layer, raw or derived (anything with `material` and
 * `finish`); `system` is the assembly's.
 */
export function wallFinishMaterialKey(layer, system) {
  const finish = normalizeWallFinish(layer?.finish, system, layer?.material);
  if (!finish) return null;
  const substrate = finishSubstrate(system, layer.material);
  if (!substrate) return null;
  const base = `wallFinish:${finish.kind}:${substrate}:${finish.colour.hex.slice(1)}:${finish.sheen}`;
  return substrate === 'siding' ? `${base}:${sidingCourseKey(normalizeSidingCourse(layer.course))}` : base;
}

/** The inverse of `wallFinishMaterialKey`: `{kind, substrate, hex, sheen}`, or `null`. */
export function parseWallFinishMaterialKey(key) {
  if (typeof key !== 'string') return null;
  const match = FINISH_KEY_PATTERN.exec(key);
  if (!match) return null;
  const parsed = { kind: match[1], substrate: match[2], hex: `#${match[3]}`, sheen: match[4] };
  // Siding and only siding carries a course, and a siding key without one is
  // not a key anything here writes.
  if (parsed.substrate !== 'siding') return match[5] ? null : parsed;
  const course = parseSidingCourseKey(match[5]);
  return course ? { ...parsed, course } : null;
}

const TONAL_FASTENER_KEY_PREFIX = 'wallFastenerTonal:';

/**
 * The 3D palette key of a tonal ("panel-matched") screw head on a face drawn
 * in `faceKey` — the face's own key, stock or finish, behind a prefix.
 *
 * A tonal head used to BE the face's material, and a board-coloured disc 1 mm
 * proud of a board of the same material has no pixel that differs from it
 * (docs/wall-fastener-visibility.md §1 B). Its own key lets the palette build
 * it as a darker shade of whatever the face is (`paletteMaterialFor`), and
 * because the face key is inside it, a face that changes colour changes its
 * screws' key with it — there is nothing to recolour in place.
 */
export function wallFastenerTonalMaterialKey(faceKey) {
  return typeof faceKey === 'string' && faceKey ? `${TONAL_FASTENER_KEY_PREFIX}${faceKey}` : null;
}

/** The inverse of `wallFastenerTonalMaterialKey`: the face key inside it, or `null`. */
export function parseWallFastenerTonalMaterialKey(key) {
  if (typeof key !== 'string' || !key.startsWith(TONAL_FASTENER_KEY_PREFIX)) return null;
  return key.slice(TONAL_FASTENER_KEY_PREFIX.length) || null;
}

/** The colour a face is finished in, as `#RRGGBB`, or `null` for a stock face. */
export function wallFinishHex(layer) {
  return layer?.finish ? normalizeHexColour(layer.finish.colour?.hex) : null;
}

const DRAWING_PAPER = [0xf4, 0xf1, 0xea];
const DRAWING_TINT_MIX = 0.6;

/**
 * A finish colour knocked back for a drawing that puts set-out lines and
 * dimensions over its fill: the hex mixed 60 % of the way to the paper. A
 * Charcoal face drawn at full strength would bury every dimension on it.
 */
export function wallFinishDrawingTint(hex) {
  const normalized = normalizeHexColour(hex);
  if (!normalized) return null;
  const channels = [1, 3, 5].map((index) => parseInt(normalized.slice(index, index + 2), 16));
  return `#${channels
    .map((value, index) => Math.round(value + (DRAWING_PAPER[index] - value) * DRAWING_TINT_MIX))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** One line for a panel summary: `Paint · Signal Orange · matte`. */
export function describeWallFinish(finish) {
  if (!finish) return 'Stock';
  const kind = WALL_FINISH_KIND_LABELS[finish.kind] || finish.kind;
  const colour = finish.colour?.name || finish.colour?.hex || '';
  return [kind, colour, finish.sheen].filter(Boolean).join(' · ');
}
