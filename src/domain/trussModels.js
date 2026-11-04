import { generateId } from './ids';
import { CURRENT_PROJECT_VERSION } from './projectVersion';
import { getDefaultActiveFloorId, getFloorTopElevation, getProjectFloor } from './floorModels';
import { deriveBeamSupportedInstanceGeometry } from '@/truss/beamSupports';
import { normalizePlanLengthScale, normalizePlanOffset, normalizeRotationDegrees } from '@/truss/systemTransform';
import { normalizeRoofColour } from './roofCoveringCatalog';

const TRUSS_FAMILIES = new Set(['shed', 'gable', 'flat']);
const TRUSS_SHAPES = new Set([
  'shed',
  'gable',
  'flat',
  'hip',
  'box_gable',
  'pyramid_hipped',
  'domed',
  'dropped_eaves',
  'scissor',
]);
const TRUSS_ATTACHED_ROOF_TYPES = new Set([
  'flat',
  'shed',
  'gable',
  'hip',
  'box_gable',
  'pyramid_hipped',
  'domed',
  'dropped_eaves',
]);
// A scissor truss attaches a plain GABLE roof (its type's attachedRoofType):
// this set holds ROOF types, and 'scissor' is not one.
const DEFAULT_SUPPORT_LENGTH = 12000;
const DEFAULT_SPACING = 1200;
const DEFAULT_COUNT = 5;
const DEFAULT_SPAN = 6000;
const DEFAULT_RISE = 1200;
const DEFAULT_PITCH = 20;
const DEFAULT_PURLIN_SPACING = 900;
const DEFAULT_PURLIN_START_OFFSET = 300;
const DEFAULT_PURLIN_END_OFFSET = 300;
const DEFAULT_PURLIN_OVERHANG_START = 0;
const DEFAULT_PURLIN_OVERHANG_END = 0;
const DEFAULT_PURLIN_WIDTH = 75;
const DEFAULT_PURLIN_DEPTH = 50;
const DEFAULT_PURLIN_MATERIAL = 'timber';
const DEFAULT_TRUSS_MATERIAL = 'timber';
export const TRUSS_MATERIALS = ['timber', 'metal'];
export const TRUSS_SUPPORT_MODES = {
  BEAM_PAIR: 'beam_pair',
};

// --- End closures (RT-2) ---------------------------------------------------
// What closes the ends of a truss system: the gable triangle at the first and
// last copy along the layout axis (`start` / `end`), and the tall side strips
// along the bearing lines where a profile stands up there (`spanStart` /
// `spanEnd`: a shed's high side, a flat truss's depth). Every side defaults to
// INFILL, old saves included (spec §4.3, §9.2): nobody wants an open gable by
// default; 'open' is for exposed-truss designs. The cladding colour is one per
// system (`endClosures.colour`), because the preview paints every infill with
// the one `gableInfill` palette material (spec §4.3 amendment).
export const TRUSS_END_CLOSURE_SIDES = Object.freeze(['start', 'end', 'spanStart', 'spanEnd']);
export const TRUSS_END_CLOSURE_MODES = Object.freeze(['infill', 'open']);
export const TRUSS_END_CLOSURE_PRESETS = Object.freeze(['fiber_cement', 'plywood', 'mixed_board', 'chb']);
export const TRUSS_END_CLOSURE_PRESET_LABELS = Object.freeze({
  fiber_cement: 'fibre cement',
  plywood: 'plywood',
  mixed_board: 'mixed board',
  chb: 'CHB',
});
export const TRUSS_END_CLOSURE_VENT_SHAPES = Object.freeze(['rect', 'round', 'triangle']);
export const DEFAULT_END_CLOSURE_COLOUR = Object.freeze({
  hex: '#E9E5DD',
  name: 'Wall',
  catalogue: 'custom',
  solarAbsorptance: null,
});
const DEFAULT_END_CLOSURE_VENT = Object.freeze({
  enabled: false,
  shape: 'rect',
  width: 600,
  height: 300,
  sillOffset: 300,
});

function finiteAtLeast(value, fallback, min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, number) : fallback;
}

function normalizeEndClosureVent(vent = {}) {
  const source = vent && typeof vent === 'object' ? vent : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_END_CLOSURE_VENT.enabled,
    shape: TRUSS_END_CLOSURE_VENT_SHAPES.includes(source.shape) ? source.shape : DEFAULT_END_CLOSURE_VENT.shape,
    width: finiteAtLeast(source.width, DEFAULT_END_CLOSURE_VENT.width, 50),
    height: finiteAtLeast(source.height, DEFAULT_END_CLOSURE_VENT.height, 50),
    sillOffset: finiteAtLeast(source.sillOffset, DEFAULT_END_CLOSURE_VENT.sillOffset, 0),
  };
}

export function normalizeTrussEndClosure(closure = {}) {
  const source = closure && typeof closure === 'object' ? closure : {};
  return {
    mode: TRUSS_END_CLOSURE_MODES.includes(source.mode) ? source.mode : 'infill',
    assemblyPreset: TRUSS_END_CLOSURE_PRESETS.includes(source.assemblyPreset) ? source.assemblyPreset : 'fiber_cement',
    vent: normalizeEndClosureVent(source.vent),
  };
}

export function normalizeTrussEndClosures(endClosures = {}) {
  const source = endClosures && typeof endClosures === 'object' ? endClosures : {};
  return {
    ...Object.fromEntries(TRUSS_END_CLOSURE_SIDES.map((side) => [side, normalizeTrussEndClosure(source[side])])),
    colour: normalizeRoofColour(source.colour, DEFAULT_END_CLOSURE_COLOUR),
  };
}

// --- Member sizes, heel, labels (RT-3) --------------------------------------
// A truss is a profile with real members (spec §4.4, §7.1). Sizes are per
// SYSTEM: every instance in a system shares one set. `width` is the member's
// thickness ACROSS the truss plane (along the layout axis), `depth` its size IN
// the plane. A preset sets all three members; webs go one size down where the
// family has one (90 → 70, 2x6 → 2x4). Metal presets only set sizes: the
// instance `material` ('timber' | 'metal') keeps its own meaning.
function memberSet(chordWidth, chordDepth, webWidth, webDepth) {
  return Object.freeze({
    topChord: Object.freeze({ width: chordWidth, depth: chordDepth }),
    bottomChord: Object.freeze({ width: chordWidth, depth: chordDepth }),
    web: Object.freeze({ width: webWidth, depth: webDepth }),
  });
}

export const TRUSS_MEMBER_PRESETS = Object.freeze({
  au_70x35: Object.freeze({ label: '70 × 35 MGP', family: 'timber', ...memberSet(35, 70, 35, 70) }),
  au_90x35: Object.freeze({ label: '90 × 35 MGP', family: 'timber', ...memberSet(35, 90, 35, 70) }),
  au_90x45: Object.freeze({ label: '90 × 45 MGP', family: 'timber', ...memberSet(45, 90, 45, 70) }),
  au_120x45: Object.freeze({ label: '120 × 45 MGP', family: 'timber', ...memberSet(45, 120, 45, 90) }),
  au_140x45: Object.freeze({ label: '140 × 45 MGP', family: 'timber', ...memberSet(45, 140, 45, 120) }),
  na_2x4: Object.freeze({ label: '2x4 (38 × 89)', family: 'timber', ...memberSet(38, 89, 38, 89) }),
  na_2x6: Object.freeze({ label: '2x6 (38 × 140)', family: 'timber', ...memberSet(38, 140, 38, 89) }),
  na_2x8: Object.freeze({ label: '2x8 (38 × 184)', family: 'timber', ...memberSet(38, 184, 38, 140) }),
  metal_c75: Object.freeze({ label: 'C75 × 40 × 1.0', family: 'metal', ...memberSet(40, 75, 40, 75) }),
  metal_c100: Object.freeze({ label: 'C100 × 50 × 1.2', family: 'metal', ...memberSet(50, 100, 40, 75) }),
});
export const TRUSS_MEMBER_PRESET_KEYS = Object.freeze([...Object.keys(TRUSS_MEMBER_PRESETS), 'custom']);
export const DEFAULT_TRUSS_MEMBER_PRESET = 'au_90x35';
export const TRUSS_MEMBER_KEYS = Object.freeze(['topChord', 'bottomChord', 'web']);
export const TRUSS_MEMBER_LABELS = Object.freeze({ topChord: 'TC', bottomChord: 'BC', web: 'W' });
const MIN_MEMBER_SIZE = 10;
const MAX_MEMBER_SIZE = 600;
const MAX_RAISED_HEEL = 1200;
export const DEFAULT_TRUSS_LABEL_PREFIX = 'T';
export const TRUSS_PURLIN_ROLES = Object.freeze(['purlin', 'batten']);

function clampMemberSize(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_MEMBER_SIZE, Math.max(MIN_MEMBER_SIZE, number));
}

/** The member sizes a preset sets (`custom` and unknown keys fall back to the default preset). */
export function getTrussMemberPresetSizes(presetKey = DEFAULT_TRUSS_MEMBER_PRESET) {
  const preset = TRUSS_MEMBER_PRESETS[presetKey] || TRUSS_MEMBER_PRESETS[DEFAULT_TRUSS_MEMBER_PRESET];
  return Object.fromEntries(TRUSS_MEMBER_KEYS.map((key) => [key, { ...preset[key] }]));
}

/** `memberSizes` with every member filled: stored numbers win, the preset fills the gaps. */
export function normalizeTrussMemberSizes(memberSizes = null) {
  const source = memberSizes && typeof memberSizes === 'object' ? memberSizes : {};
  const preset = TRUSS_MEMBER_PRESET_KEYS.includes(source.preset) ? source.preset : DEFAULT_TRUSS_MEMBER_PRESET;
  const fallback = getTrussMemberPresetSizes(preset);
  return {
    ...Object.fromEntries(
      TRUSS_MEMBER_KEYS.map((key) => [
        key,
        {
          width: clampMemberSize(source[key]?.width, fallback[key].width),
          depth: clampMemberSize(source[key]?.depth, fallback[key].depth),
        },
      ]),
    ),
    preset,
  };
}

/** `heel.raised` = the raised ("energy") heel height; 0 is a standard heel. */
export function normalizeTrussHeel(heel = null) {
  const raised = Number(heel?.raised);
  return { raised: Number.isFinite(raised) ? Math.min(MAX_RAISED_HEEL, Math.max(0, raised)) : 0 };
}

export function normalizeTrussLabelPrefix(prefix = DEFAULT_TRUSS_LABEL_PREFIX) {
  if (typeof prefix !== 'string') return DEFAULT_TRUSS_LABEL_PREFIX;
  const trimmed = prefix.trim().slice(0, 6);
  return trimmed || DEFAULT_TRUSS_LABEL_PREFIX;
}

/**
 * The profile options a system hands every `buildTrussProfile` call: its
 * member sizes and heel. Callers without a system get the same defaults.
 */
export function getTrussProfileOptions(trussSystem = null) {
  return {
    memberSizes: normalizeTrussMemberSizes(trussSystem?.memberSizes),
    heel: normalizeTrussHeel(trussSystem?.heel),
  };
}

const TILE_COVERING_KINDS = new Set(['concrete_tile', 'clay_tile', 'slate', 'shingle']);

/** Purlins under sheet, battens under tiles (a label only; spec §7.4). */
export function defaultPurlinRoleForCovering(coveringKind = null) {
  return TILE_COVERING_KINDS.has(coveringKind) ? 'batten' : 'purlin';
}

function normalizePhaseId(phaseId = null) {
  return typeof phaseId === 'string' && phaseId ? phaseId : null;
}

// --- Rise/pitch coupling -------------------------------------------------
// RISE is the single geometric source of truth: every profile builder in
// truss/profile.js draws geometry from `rise`. `pitch` (percent) is a derived,
// alternative INPUT. These helpers keep the two consistent everywhere they are
// set (factory, UI, migrations) using the SAME `run` definition that
// resolveTrussMetrics uses so a round-trip rise -> pitch -> rise is stable.
//
// run = horizontal distance the rise is measured over:
//   - gable-family (gable/hip/box_gable/etc. all resolve to family 'gable')
//     is symmetric, so run = span / 2
//   - shed rises across the whole span, so run = span
//   - flat has no slope, so pitch is always 0
export function getTrussRun(span = 0, family = 'gable') {
  const safeSpan = Math.max(Number(span) || 0, 1);
  return family === 'gable' ? safeSpan / 2 : safeSpan;
}

export function deriveTrussRiseFromPitch(pitch, span, family = 'gable') {
  if (family === 'flat') return 0;
  const run = getTrussRun(span, family);
  return Math.max(0, (Number(pitch) || 0) / 100) * run;
}

export function deriveTrussPitchFromRise(rise, span, family = 'gable') {
  if (family === 'flat') return 0;
  const run = getTrussRun(span, family);
  return (Math.max(0, Number(rise) || 0) / Math.max(run, 1)) * 100;
}

const DEFAULT_TRUSS_TYPE_DEFS = [
  {
    id: 'truss_type_shed',
    name: 'Mono / Shed Truss',
    family: 'shed',
    shape: 'shed',
    material: 'timber',
    defaultSpan: 6000,
    defaultRise: 1200,
    defaultPitch: 20,
    attachedRoofType: 'shed',
    webPattern: {
      key: 'mono_fan',
      label: 'Mono Fan',
      panelCount: 4,
      diagonalMode: 'fan',
    },
  },
  {
    id: 'truss_type_gable',
    name: 'Gable Truss',
    family: 'gable',
    shape: 'gable',
    material: 'timber',
    defaultSpan: 7200,
    defaultRise: 1800,
    defaultPitch: 25,
    attachedRoofType: 'gable',
    webPattern: {
      key: 'fink',
      label: 'Fink',
      panelCount: 6,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_flat',
    name: 'Flat Truss',
    family: 'flat',
    shape: 'flat',
    material: 'timber',
    defaultSpan: 7200,
    defaultRise: 900,
    defaultPitch: 0,
    attachedRoofType: 'flat',
    // 'warren' is the alternating layout flat trusses always had (spec §7.3).
    webPattern: {
      key: 'warren',
      label: 'Warren',
      panelCount: 6,
      diagonalMode: 'alternating',
    },
  },
  {
    id: 'truss_type_box_gable',
    name: 'Box Gable Truss',
    family: 'gable',
    shape: 'box_gable',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1800,
    defaultPitch: 25,
    attachedRoofType: 'box_gable',
    webPattern: {
      key: 'box_gable',
      label: 'Box Gable',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_hip',
    name: 'Hip Truss',
    family: 'gable',
    shape: 'hip',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1600,
    defaultPitch: 22,
    attachedRoofType: 'hip',
    webPattern: {
      key: 'hip',
      label: 'Hip',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_pyramid_hipped',
    name: 'Pyramid Hipped Truss',
    family: 'gable',
    shape: 'pyramid_hipped',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1500,
    defaultPitch: 20,
    attachedRoofType: 'pyramid_hipped',
    webPattern: {
      key: 'pyramid_hipped',
      label: 'Pyramid Hipped',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_domed',
    name: 'Domed Truss',
    family: 'gable',
    shape: 'domed',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1800,
    defaultPitch: 20,
    attachedRoofType: 'domed',
    webPattern: {
      key: 'domed',
      label: 'Domed',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_dropped_eaves',
    name: 'Dropped Eaves Truss',
    family: 'gable',
    shape: 'dropped_eaves',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1800,
    defaultPitch: 25,
    attachedRoofType: 'dropped_eaves',
    webPattern: {
      key: 'dropped_eaves',
      label: 'Dropped Eaves',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    // Scissor (RT-3, spec §7.3): the bottom chord rises to
    // `rise × scissorBottomPitchRatio` at mid-span; its roof is a plain gable.
    id: 'truss_type_scissor',
    name: 'Scissor Truss',
    family: 'gable',
    shape: 'scissor',
    material: 'timber',
    defaultSpan: 7200,
    defaultRise: 1800,
    defaultPitch: 50,
    attachedRoofType: 'gable',
    webPattern: {
      key: 'fink',
      label: 'Fink',
      panelCount: 6,
      diagonalMode: 'fink',
    },
  },
];

function clonePoint(point) {
  return point ? { x: point.x, y: point.y } : point;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function cloneWebPattern(webPattern = {}) {
  return {
    key: webPattern.key ?? 'generic',
    label: webPattern.label ?? 'Generic',
    panelCount: Math.max(2, Math.round(webPattern.panelCount ?? 4)),
    diagonalMode: webPattern.diagonalMode ?? 'generic',
  };
}

function normalizeFamily(family = 'gable') {
  if (family === 'mono') return 'shed';
  return TRUSS_FAMILIES.has(family) ? family : 'gable';
}

function normalizeShape(shape = null, family = 'gable') {
  if (shape === 'mono') return 'shed';
  if (TRUSS_SHAPES.has(shape)) return shape;
  return normalizeFamily(family);
}

function normalizeAttachedRoofType(attachedRoofType = null) {
  if (attachedRoofType == null || attachedRoofType === '') return null;
  return TRUSS_ATTACHED_ROOF_TYPES.has(attachedRoofType) ? attachedRoofType : null;
}

function normalizeSupportMode(supportMode = null) {
  return supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR ? supportMode : null;
}

function normalizeSupportBeamIds(supportBeamIds = {}) {
  return {
    start: typeof supportBeamIds?.start === 'string' && supportBeamIds.start ? supportBeamIds.start : null,
    end: typeof supportBeamIds?.end === 'string' && supportBeamIds.end ? supportBeamIds.end : null,
  };
}

function normalizeSupportOffsetAlongAxis(value = 0) {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

function clonePlanOffset(offset = null) {
  return normalizePlanOffset(offset);
}

export function normalizeTrussMaterial(material = DEFAULT_TRUSS_MATERIAL) {
  const normalized = typeof material === 'string' ? material.trim().toLowerCase() : DEFAULT_TRUSS_MATERIAL;
  if (normalized === 'wood') return 'timber';
  if (normalized === 'steel' || normalized === 'meta') return 'metal';
  return TRUSS_MATERIALS.includes(normalized) ? normalized : DEFAULT_TRUSS_MATERIAL;
}

export function createPurlinSystem(options = {}, defaultRole = 'purlin') {
  return {
    enabled: Boolean(options.enabled),
    // Label only: 'purlin' under sheet, 'batten' under tiles (spec §7.4). A
    // stored role wins; a missing one takes the covering's default.
    role: TRUSS_PURLIN_ROLES.includes(options.role)
      ? options.role
      : TRUSS_PURLIN_ROLES.includes(defaultRole)
        ? defaultRole
        : 'purlin',
    spacing: isFiniteNumber(options.spacing) ? Math.max(100, options.spacing) : DEFAULT_PURLIN_SPACING,
    startOffset: isFiniteNumber(options.startOffset) ? Math.max(0, options.startOffset) : DEFAULT_PURLIN_START_OFFSET,
    endOffset: isFiniteNumber(options.endOffset) ? Math.max(0, options.endOffset) : DEFAULT_PURLIN_END_OFFSET,
    overhangStart: isFiniteNumber(options.overhangStart)
      ? Math.max(0, options.overhangStart)
      : DEFAULT_PURLIN_OVERHANG_START,
    overhangEnd: isFiniteNumber(options.overhangEnd) ? Math.max(0, options.overhangEnd) : DEFAULT_PURLIN_OVERHANG_END,
    width: isFiniteNumber(options.width) ? Math.max(25, options.width) : DEFAULT_PURLIN_WIDTH,
    depth: isFiniteNumber(options.depth) ? Math.max(25, options.depth) : DEFAULT_PURLIN_DEPTH,
    material: normalizeTrussMaterial(options.material ?? DEFAULT_PURLIN_MATERIAL),
  };
}

function normalizePurlinSystem(purlinSystem = {}, project = null) {
  const coveringKind = project?.roofSystem?.covering?.kind || null;
  return createPurlinSystem(purlinSystem || {}, defaultPurlinRoleForCovering(coveringKind));
}

const DEFAULT_SCISSOR_BOTTOM_PITCH_RATIO = 0.5;

function normalizeWebPatternKey(key = null) {
  return typeof key === 'string' && key ? key : null;
}

function normalizeScissorRatio(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(0.9, Math.max(0, number)) : DEFAULT_SCISSOR_BOTTOM_PITCH_RATIO;
}

export function createTrussNode(x = 0, z = 0, options = {}) {
  return {
    id: options.id || generateId('truss_node'),
    x,
    z,
    kind: options.kind ?? 'panel_point',
  };
}

export function createTrussMember(startNodeId = null, endNodeId = null, options = {}) {
  return {
    id: options.id || generateId('truss_member'),
    startNodeId,
    endNodeId,
    memberType: options.memberType ?? 'web',
  };
}

export function createTrussType(options = {}) {
  const family = normalizeFamily(options.family);
  return {
    id: options.id || generateId('truss_type'),
    name: options.name ?? 'Truss Type',
    family,
    shape: normalizeShape(options.shape, family),
    material: normalizeTrussMaterial(options.material),
    defaultSpan: isFiniteNumber(options.defaultSpan) ? Math.max(1000, options.defaultSpan) : DEFAULT_SPAN,
    defaultRise: isFiniteNumber(options.defaultRise) ? Math.max(0, options.defaultRise) : DEFAULT_RISE,
    defaultPitch: isFiniteNumber(options.defaultPitch) ? Math.max(0, options.defaultPitch) : DEFAULT_PITCH,
    attachedRoofType: normalizeAttachedRoofType(options.attachedRoofType),
    webPattern: cloneWebPattern(options.webPattern),
  };
}

export function getDefaultTrussTypes() {
  return DEFAULT_TRUSS_TYPE_DEFS.map((entry) => createTrussType(entry));
}

export function getTrussTypeById(trussTypeId, catalog = getDefaultTrussTypes()) {
  return catalog.find((entry) => entry.id === trussTypeId) || null;
}

export function resolveTrussType(trussTypeId, catalog = getDefaultTrussTypes()) {
  return getTrussTypeById(trussTypeId, catalog) || catalog[0] || createTrussType();
}

export function getTrussTypeAttachedRoofType(trussTypeOrId, catalog = getDefaultTrussTypes()) {
  const trussType =
    typeof trussTypeOrId === 'string' ? resolveTrussType(trussTypeOrId, catalog) : createTrussType(trussTypeOrId || {});
  return normalizeAttachedRoofType(trussType?.attachedRoofType);
}

// Resolve a mutually consistent { rise, pitch } pair from whatever the caller
// supplied. RISE is authoritative: an explicit rise always wins and pitch is
// refreshed from it. Pitch is only used to derive rise when no explicit rise
// was given. When neither is given we fall back to the truss-type default rise
// and derive pitch from it (the stored default pitch is NOT trusted because
// legacy defaults were not internally consistent with the default rise/span).
function resolveInstanceRisePitch(options, trussType, span) {
  const family = trussType.family;
  if (family === 'flat') {
    const rise = isFiniteNumber(options.rise) ? Math.max(0, options.rise) : trussType.defaultRise;
    return { rise, pitch: 0 };
  }

  if (isFiniteNumber(options.rise)) {
    const rise = Math.max(0, options.rise);
    return { rise, pitch: deriveTrussPitchFromRise(rise, span, family) };
  }

  if (isFiniteNumber(options.pitch)) {
    const pitch = Math.max(0, options.pitch);
    return { rise: deriveTrussRiseFromPitch(pitch, span, family), pitch };
  }

  const rise = trussType.defaultRise;
  return { rise, pitch: deriveTrussPitchFromRise(rise, span, family) };
}

export function createTrussInstance(options = {}) {
  const catalog = options.catalog || getDefaultTrussTypes();
  const trussType = resolveTrussType(options.trussTypeId, catalog);
  const span = isFiniteNumber(options.span) ? Math.max(1000, options.span) : trussType.defaultSpan;
  const { rise, pitch } = resolveInstanceRisePitch(options, trussType, span);

  return {
    id: options.id || generateId('truss_instance'),
    trussTypeId: trussType.id,
    material: normalizeTrussMaterial(options.material ?? trussType.material),
    floorId: options.floorId ?? null,
    startPoint: clonePoint(options.startPoint) || { x: -DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    endPoint: clonePoint(options.endPoint) || { x: DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    span,
    rise,
    pitch,
    spacing: isFiniteNumber(options.spacing) ? Math.max(300, options.spacing) : DEFAULT_SPACING,
    count: isFiniteNumber(options.count) ? Math.max(1, Math.round(options.count)) : DEFAULT_COUNT,
    bearingOffsets: {
      start: isFiniteNumber(options.bearingOffsets?.start) ? options.bearingOffsets.start : 0,
      end: isFiniteNumber(options.bearingOffsets?.end) ? options.bearingOffsets.end : 0,
    },
    overhangs: {
      start: isFiniteNumber(options.overhangs?.start) ? Math.max(0, options.overhangs.start) : 300,
      end: isFiniteNumber(options.overhangs?.end) ? Math.max(0, options.overhangs.end) : 300,
    },
    supportMode: normalizeSupportMode(options.supportMode),
    supportBeamIds: normalizeSupportBeamIds(options.supportBeamIds),
    supportOffsetAlongAxis: normalizeSupportOffsetAlongAxis(options.supportOffsetAlongAxis),
    roofAttachmentId:
      typeof options.roofAttachmentId === 'string' && options.roofAttachmentId ? options.roofAttachmentId : null,
    // RT-3: null = the truss type's default web pattern (src/truss/webPatterns.js).
    webPatternKey: normalizeWebPatternKey(options.webPatternKey),
    scissorBottomPitchRatio: normalizeScissorRatio(options.scissorBottomPitchRatio),
  };
}

export function normalizeTrussInstance(instance = {}, floorId = null, catalog = getDefaultTrussTypes()) {
  const trussType = resolveTrussType(instance?.trussTypeId, catalog);
  const span = isFiniteNumber(instance?.span) ? Math.max(1000, instance.span) : trussType.defaultSpan;
  // RISE is the source of truth. A stored rise is trusted verbatim and pitch is
  // refreshed from it so legacy saves with an inconsistent pair resolve
  // deterministically (rise wins) instead of rendering geometry from rise while
  // reporting a stale pitch.
  const { rise, pitch } = resolveInstanceRisePitch(instance, trussType, span);

  return {
    ...createTrussInstance({ floorId, catalog }),
    ...instance,
    id: instance?.id || generateId('truss_instance'),
    floorId: instance?.floorId || floorId || null,
    material: normalizeTrussMaterial(instance?.material ?? trussType.material),
    startPoint: clonePoint(instance?.startPoint) || { x: -DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    endPoint: clonePoint(instance?.endPoint) || { x: DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    span,
    rise,
    pitch,
    spacing: isFiniteNumber(instance?.spacing) ? Math.max(300, instance.spacing) : DEFAULT_SPACING,
    count: isFiniteNumber(instance?.count) ? Math.max(1, Math.round(instance.count)) : DEFAULT_COUNT,
    bearingOffsets: {
      start: isFiniteNumber(instance?.bearingOffsets?.start) ? instance.bearingOffsets.start : 0,
      end: isFiniteNumber(instance?.bearingOffsets?.end) ? instance.bearingOffsets.end : 0,
    },
    overhangs: {
      start: isFiniteNumber(instance?.overhangs?.start) ? Math.max(0, instance.overhangs.start) : 300,
      end: isFiniteNumber(instance?.overhangs?.end) ? Math.max(0, instance.overhangs.end) : 300,
    },
    supportMode: normalizeSupportMode(instance?.supportMode),
    supportBeamIds: normalizeSupportBeamIds(instance?.supportBeamIds),
    supportOffsetAlongAxis: normalizeSupportOffsetAlongAxis(instance?.supportOffsetAlongAxis),
    roofAttachmentId:
      typeof instance?.roofAttachmentId === 'string' && instance.roofAttachmentId ? instance.roofAttachmentId : null,
    webPatternKey: normalizeWebPatternKey(instance?.webPatternKey),
    scissorBottomPitchRatio: normalizeScissorRatio(instance?.scissorBottomPitchRatio),
  };
}

export function createTrussSystem(name = 'Truss System', options = {}) {
  const catalog = options.catalog || getDefaultTrussTypes();
  const trussInstances = (options.trussInstances || []).map((instance) =>
    normalizeTrussInstance(instance, options.floorId, catalog),
  );

  return {
    id: options.id || generateId('truss_system'),
    name,
    floorId: options.floorId ?? null,
    phaseId: normalizePhaseId(options.phaseId),
    baseElevation: isFiniteNumber(options.baseElevation) ? options.baseElevation : 0,
    planRotationOffsetDegrees: normalizeRotationDegrees(options.planRotationOffsetDegrees),
    planOffset: clonePlanOffset(options.planOffset),
    planLengthScale: normalizePlanLengthScale(options.planLengthScale),
    purlinSystem: normalizePurlinSystem(options.purlinSystem),
    endClosures: normalizeTrussEndClosures(options.endClosures),
    memberSizes: normalizeTrussMemberSizes(options.memberSizes),
    heel: normalizeTrussHeel(options.heel),
    labelPrefix: normalizeTrussLabelPrefix(options.labelPrefix),
    trussInstances,
  };
}

export function createTrussSystemForProject(project, floorId = null, options = {}) {
  const resolvedFloorId = floorId || getDefaultActiveFloorId(project, floorId);
  const floor = getProjectFloor(project, resolvedFloorId);
  const catalog = options.catalog || getDefaultTrussTypes();
  const trussInstances = options.trussInstances?.length
    ? options.trussInstances.map((instance) => normalizeTrussInstance(instance, resolvedFloorId, catalog))
    : [];

  return createTrussSystem(options.name ?? 'Truss System', {
    ...options,
    floorId: resolvedFloorId,
    phaseId: normalizePhaseId(options.phaseId),
    baseElevation: isFiniteNumber(options.baseElevation)
      ? options.baseElevation
      : floor
        ? getFloorTopElevation(floor)
        : 0,
    trussInstances,
    catalog,
  });
}

export function normalizeTrussSystem(trussSystem = {}, project = null, catalog = getDefaultTrussTypes()) {
  const floorId = trussSystem?.floorId || getDefaultActiveFloorId(project, trussSystem?.floorId);
  const floor = project ? getProjectFloor(project, floorId) : null;
  const roofAttachmentId = project?.roofSystem?.trussAttachmentId === trussSystem?.id ? project.roofSystem.id : null;

  const trussInstances = (trussSystem?.trussInstances || []).map((instance) => ({
    ...normalizeTrussInstance(instance, floorId, catalog),
    roofAttachmentId,
  }));

  return {
    ...createTrussSystem(trussSystem?.name || 'Truss System', { floorId, catalog }),
    ...trussSystem,
    id: trussSystem?.id || generateId('truss_system'),
    name: trussSystem?.name || 'Truss System',
    floorId,
    phaseId: normalizePhaseId(trussSystem?.phaseId),
    baseElevation: isFiniteNumber(trussSystem?.baseElevation)
      ? trussSystem.baseElevation
      : floor
        ? getFloorTopElevation(floor)
        : 0,
    planRotationOffsetDegrees: normalizeRotationDegrees(trussSystem?.planRotationOffsetDegrees),
    planOffset: clonePlanOffset(trussSystem?.planOffset),
    planLengthScale: normalizePlanLengthScale(trussSystem?.planLengthScale),
    purlinSystem: normalizePurlinSystem(trussSystem?.purlinSystem, project),
    endClosures: normalizeTrussEndClosures(trussSystem?.endClosures),
    memberSizes: normalizeTrussMemberSizes(trussSystem?.memberSizes),
    heel: normalizeTrussHeel(trussSystem?.heel),
    labelPrefix: normalizeTrussLabelPrefix(trussSystem?.labelPrefix),
    trussInstances,
  };
}

export function getProjectTrussSystems(project, floorId = null) {
  const trussSystems = project?.trussSystems || [];
  if (!floorId) return trussSystems;
  return trussSystems.filter((entry) => entry.floorId === floorId);
}

export function getProjectTrussSystem(project, trussSystemId) {
  return (project?.trussSystems || []).find((entry) => entry.id === trussSystemId) || null;
}

export function findTrussInstance(project, trussInstanceId) {
  for (const trussSystem of project?.trussSystems || []) {
    const trussInstance = (trussSystem.trussInstances || []).find((entry) => entry.id === trussInstanceId) || null;
    if (trussInstance) {
      return { trussSystem, trussInstance };
    }
  }
  return { trussSystem: null, trussInstance: null };
}

export function hasBeamSupportedTrussInstances(trussSystem) {
  return (trussSystem?.trussInstances || []).some((instance) => instance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR);
}

export function detachBeamSupportedTrussInstances(trussInstances = []) {
  return trussInstances.map((instance) =>
    instance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
      ? {
          ...instance,
          supportMode: null,
          supportBeamIds: { start: null, end: null },
          supportOffsetAlongAxis: 0,
        }
      : instance,
  );
}

function syncBeamSupportedInstance(instance, floor, catalog, roofAttachmentId) {
  const normalized = normalizeTrussInstance(instance, floor?.id || instance?.floorId || null, catalog);
  if (normalized.supportMode !== TRUSS_SUPPORT_MODES.BEAM_PAIR) {
    return {
      ...normalized,
      roofAttachmentId,
    };
  }

  const derived = deriveBeamSupportedInstanceGeometry(normalized, floor);
  if (!derived.valid) {
    return null;
  }

  return {
    ...normalized,
    floorId: floor?.id || normalized.floorId || null,
    startPoint: derived.startPoint,
    endPoint: derived.endPoint,
    count: derived.count,
    supportOffsetAlongAxis: derived.effectiveOffset,
    supportBeamIds: derived.supportBeamIds,
    roofAttachmentId,
  };
}

function syncTrussSystemGeometry(trussSystem, project, catalog) {
  const normalizedSystem = normalizeTrussSystem(trussSystem, project, catalog);
  const floor = getProjectFloor(project, normalizedSystem.floorId);
  if (!floor) return null;

  const roofAttachmentId =
    project?.roofSystem?.trussAttachmentId === normalizedSystem.id ? project.roofSystem.id : null;
  const syncedInstances = (normalizedSystem.trussInstances || [])
    .map((instance) => syncBeamSupportedInstance(instance, floor, catalog, roofAttachmentId))
    .filter(Boolean);

  if (!syncedInstances.length) {
    return null;
  }

  const beamSupportedInstance =
    syncedInstances.find((instance) => instance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR) || null;
  const derivedBaseElevation = beamSupportedInstance
    ? deriveBeamSupportedInstanceGeometry(beamSupportedInstance, floor)
    : null;

  return {
    ...normalizedSystem,
    baseElevation: derivedBaseElevation?.valid ? derivedBaseElevation.baseElevation : normalizedSystem.baseElevation,
    trussInstances: syncedInstances,
  };
}

export function syncProjectTrussSystems(project) {
  if (!project) return project;

  const catalog = getDefaultTrussTypes();
  const normalizedTrussSystems = (project.trussSystems || [])
    .map((trussSystem) => syncTrussSystemGeometry(trussSystem, project, catalog))
    .filter(Boolean);

  const validTrussIds = new Set(normalizedTrussSystems.map((entry) => entry.id));
  const roofSystem =
    project.roofSystem &&
    project.roofSystem.trussAttachmentId &&
    !validTrussIds.has(project.roofSystem.trussAttachmentId)
      ? {
          ...project.roofSystem,
          trussAttachmentId: null,
        }
      : project.roofSystem;

  return {
    ...project,
    version: Math.max(CURRENT_PROJECT_VERSION, Number(project.version || 0)),
    roofSystem,
    trussSystems: normalizedTrussSystems,
  };
}

export function getAllTrussInstances(project, floorId = null) {
  return getProjectTrussSystems(project, floorId).flatMap((trussSystem) =>
    (trussSystem.trussInstances || []).map((trussInstance) => ({ trussSystem, trussInstance })),
  );
}
