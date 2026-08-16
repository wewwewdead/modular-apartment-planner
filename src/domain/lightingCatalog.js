/**
 * The lamps and luminaires a ceiling can carry, kept apart the way the trade
 * keeps them: BULB_TYPES are ANSI lamp designations — what someone screws in —
 * and FIXTURE_TYPES are what gets fixed to the ceiling. The same PAR30 lamp
 * therefore serves a 6" can and a surface cylinder without either of them
 * owning it, and swapping a fixture only has to re-pick the lamp.
 *
 * Lumen and wattage figures are current LED-retrofit equivalents rather than
 * the incandescent originals they replace. Nothing here is a manufacturer
 * commitment: a real lighting schedule still comes off the specified product's
 * data sheet.
 */

// null beamAngleDeg means the lamp throws in every direction — an A19 in a bare
// socket — which is what decides whether a fixture gets a point light or a spot.
// `flat` marks the panel modules, whose two dimensions are a face rather than
// the diameter and length of a bulb envelope.
export const BULB_TYPES = Object.freeze([
  Object.freeze({
    id: 'a19',
    label: 'A19 (60 W eq)',
    lumens: 800,
    watts: 9,
    defaultCct: 2700,
    beamAngleDeg: null,
    base: 'E26',
    bulbDiameterMm: 60,
    bulbLengthMm: 110,
    flat: false,
  }),
  Object.freeze({
    id: 'a21',
    label: 'A21 (100 W eq)',
    lumens: 1600,
    watts: 16,
    defaultCct: 2700,
    beamAngleDeg: null,
    base: 'E26',
    bulbDiameterMm: 67,
    bulbLengthMm: 125,
    flat: false,
  }),
  Object.freeze({
    id: 'b11',
    label: 'B11 candelabra',
    lumens: 300,
    watts: 4,
    defaultCct: 2700,
    beamAngleDeg: null,
    base: 'E12',
    bulbDiameterMm: 35,
    bulbLengthMm: 110,
    flat: false,
  }),
  Object.freeze({
    id: 'g25',
    label: 'G25 globe',
    lumens: 500,
    watts: 6.5,
    defaultCct: 2700,
    beamAngleDeg: null,
    base: 'E26',
    bulbDiameterMm: 79,
    bulbLengthMm: 120,
    flat: false,
  }),
  Object.freeze({
    id: 'st19',
    label: 'ST19 Edison filament',
    lumens: 300,
    watts: 5.5,
    defaultCct: 2200,
    beamAngleDeg: null,
    base: 'E26',
    bulbDiameterMm: 60,
    bulbLengthMm: 140,
    flat: false,
  }),
  Object.freeze({
    id: 'br30',
    label: 'BR30 flood (65 W eq)',
    lumens: 650,
    watts: 9,
    defaultCct: 2700,
    beamAngleDeg: 110,
    base: 'E26',
    bulbDiameterMm: 95,
    bulbLengthMm: 136,
    flat: false,
  }),
  Object.freeze({
    id: 'br40',
    label: 'BR40 flood',
    lumens: 1100,
    watts: 13,
    defaultCct: 2700,
    beamAngleDeg: 110,
    base: 'E26',
    bulbDiameterMm: 127,
    bulbLengthMm: 165,
    flat: false,
  }),
  Object.freeze({
    id: 'par20',
    label: 'PAR20 (50 W eq)',
    lumens: 500,
    watts: 6,
    defaultCct: 3000,
    beamAngleDeg: 40,
    base: 'E26',
    bulbDiameterMm: 64,
    bulbLengthMm: 91,
    flat: false,
  }),
  Object.freeze({
    id: 'par30',
    label: 'PAR30 (75 W eq)',
    lumens: 850,
    watts: 10,
    defaultCct: 3000,
    beamAngleDeg: 40,
    base: 'E26',
    bulbDiameterMm: 95,
    bulbLengthMm: 112,
    flat: false,
  }),
  Object.freeze({
    id: 'par38',
    label: 'PAR38 (120 W eq)',
    lumens: 1200,
    watts: 14,
    defaultCct: 3000,
    beamAngleDeg: 40,
    base: 'E26',
    bulbDiameterMm: 121,
    bulbLengthMm: 134,
    flat: false,
  }),
  Object.freeze({
    id: 'mr16',
    label: 'MR16 (50 W eq)',
    lumens: 500,
    watts: 7,
    defaultCct: 3000,
    beamAngleDeg: 36,
    base: 'GU5.3',
    bulbDiameterMm: 50,
    bulbLengthMm: 48,
    flat: false,
  }),
  Object.freeze({
    id: 'gu10',
    label: 'GU10 (50 W eq)',
    lumens: 450,
    watts: 6,
    defaultCct: 3000,
    beamAngleDeg: 36,
    base: 'GU10',
    bulbDiameterMm: 50,
    bulbLengthMm: 55,
    flat: false,
  }),
  Object.freeze({
    id: 'led_disk',
    label: 'LED disk module',
    lumens: 900,
    watts: 11,
    defaultCct: 3000,
    beamAngleDeg: 110,
    base: 'integrated',
    bulbDiameterMm: 178,
    bulbLengthMm: 25,
    flat: false,
  }),
  Object.freeze({
    id: 'led_panel_2x2',
    label: 'LED panel 2×2',
    lumens: 3300,
    watts: 33,
    defaultCct: 4000,
    beamAngleDeg: 120,
    base: 'integrated',
    bulbDiameterMm: 603,
    bulbLengthMm: 603,
    flat: true,
  }),
  Object.freeze({
    id: 'led_panel_2x4',
    label: 'LED panel 2×4',
    lumens: 4000,
    watts: 40,
    defaultCct: 4000,
    beamAngleDeg: 120,
    base: 'integrated',
    bulbDiameterMm: 603,
    bulbLengthMm: 1213,
    flat: true,
  }),
]);

/**
 * `apertureMm` is the fixture's plan footprint across the drawing — the trim
 * ring's outside diameter, not the hole in the board — because that is what an
 * RCP symbol has to draw at true size. `apertureLengthMm` is null for anything
 * round; only the troffers are rectangular, and one number cannot describe a
 * 2×4.
 *
 * `defaultDropMm` above zero is what makes a fixture hang: a semi-flush is
 * mounted to the surface but still stands off it, so the drop decides where the
 * lamp sits, not the mount word.
 */
export const FIXTURE_TYPES = Object.freeze([
  Object.freeze({
    id: 'recessed_can_4',
    label: '4" recessed downlight',
    mount: 'recessed',
    allowedBulbs: Object.freeze(['par20', 'gu10', 'a19']),
    defaultBulb: 'par20',
    bulbCount: 1,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 0,
    apertureMm: 140,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'recessed_can_6',
    label: '6" recessed downlight',
    mount: 'recessed',
    allowedBulbs: Object.freeze(['br30', 'br40', 'par30', 'par38', 'a19']),
    defaultBulb: 'br30',
    bulbCount: 1,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 0,
    apertureMm: 190,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'gimbal_recessed',
    label: 'Gimbal recessed (eyeball)',
    mount: 'recessed',
    allowedBulbs: Object.freeze(['par20', 'par30', 'mr16', 'gu10']),
    defaultBulb: 'gu10',
    bulbCount: 1,
    aimable: true,
    maxTiltDeg: 40,
    defaultDropMm: 0,
    apertureMm: 140,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'wafer_led',
    label: 'Ultra-thin wafer LED',
    mount: 'recessed',
    allowedBulbs: Object.freeze(['led_disk']),
    defaultBulb: 'led_disk',
    bulbCount: 1,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 0,
    apertureMm: 178,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'surface_flush',
    label: 'Flush-mount dome',
    mount: 'surface',
    allowedBulbs: Object.freeze(['a19', 'a21', 'led_disk']),
    defaultBulb: 'a19',
    bulbCount: 2,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 0,
    apertureMm: 330,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'semi_flush',
    label: 'Semi-flush mount',
    mount: 'surface',
    allowedBulbs: Object.freeze(['a19', 'a21']),
    defaultBulb: 'a19',
    bulbCount: 2,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 300,
    apertureMm: 355,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'cylinder_downlight',
    label: 'Surface cylinder downlight',
    mount: 'surface',
    allowedBulbs: Object.freeze(['par30', 'par38', 'br30']),
    defaultBulb: 'par30',
    bulbCount: 1,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 0,
    apertureMm: 120,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'pendant',
    label: 'Pendant',
    mount: 'pendant',
    allowedBulbs: Object.freeze(['a19', 'a21', 'st19', 'g25']),
    defaultBulb: 'a19',
    bulbCount: 1,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 900,
    apertureMm: 200,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'chandelier_5',
    label: 'Chandelier (5-arm)',
    mount: 'pendant',
    allowedBulbs: Object.freeze(['b11', 'g25']),
    defaultBulb: 'b11',
    bulbCount: 5,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 600,
    apertureMm: 550,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'track_head',
    label: 'Track spot head',
    mount: 'track',
    allowedBulbs: Object.freeze(['par20', 'par30', 'gu10', 'mr16']),
    defaultBulb: 'gu10',
    bulbCount: 1,
    aimable: true,
    maxTiltDeg: 90,
    defaultDropMm: 0,
    apertureMm: 75,
    apertureLengthMm: null,
  }),
  Object.freeze({
    id: 'troffer_2x2',
    label: 'Troffer 2×2',
    mount: 'recessed',
    allowedBulbs: Object.freeze(['led_panel_2x2']),
    defaultBulb: 'led_panel_2x2',
    bulbCount: 1,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 0,
    apertureMm: 603,
    apertureLengthMm: 603,
  }),
  Object.freeze({
    id: 'troffer_2x4',
    label: 'Troffer 2×4',
    mount: 'recessed',
    allowedBulbs: Object.freeze(['led_panel_2x4']),
    defaultBulb: 'led_panel_2x4',
    bulbCount: 1,
    aimable: false,
    maxTiltDeg: 0,
    defaultDropMm: 0,
    apertureMm: 603,
    apertureLengthMm: 1213,
  }),
]);

// The CCTs lamps are actually sold at. A fixture may only name one of these, so
// a stored colour temperature can never drift to a value no product exists for.
export const COLOR_TEMPERATURES = Object.freeze([
  Object.freeze({ kelvin: 2200, label: 'Vintage' }),
  Object.freeze({ kelvin: 2700, label: 'Warm white' }),
  Object.freeze({ kelvin: 3000, label: 'Soft white' }),
  Object.freeze({ kelvin: 3500, label: 'Neutral' }),
  Object.freeze({ kelvin: 4000, label: 'Cool white' }),
  Object.freeze({ kelvin: 5000, label: 'Daylight' }),
  Object.freeze({ kelvin: 6500, label: 'Cool daylight' }),
]);

// A beam narrower than 10° is a laser and one wider than 160° has stopped being
// a beam; both ends are outside what a reflector or lens is built to do.
export const BEAM_ANGLE_RANGE_DEG = Object.freeze({ min: 10, max: 160 });

export const DEFAULT_FIXTURE_TYPE_ID = 'recessed_can_6';

export function getBulbType(bulbId) {
  return BULB_TYPES.find((bulb) => bulb.id === bulbId) || BULB_TYPES[0];
}

export function getFixtureType(fixtureTypeId) {
  return (
    FIXTURE_TYPES.find((fixture) => fixture.id === fixtureTypeId) ||
    FIXTURE_TYPES.find((fixture) => fixture.id === DEFAULT_FIXTURE_TYPE_ID)
  );
}

/**
 * The lamp a fixture will actually take. A luminaire is built around a lamp
 * shape — a wafer has no socket for an A19 — so a bulb the fixture does not
 * accept is not a preference to honour, it is a spec that cannot be built, and
 * the fixture's own default answers instead.
 */
export function resolveFixtureBulbId(fixtureTypeId, bulbId) {
  const fixture = getFixtureType(fixtureTypeId);
  return fixture.allowedBulbs.includes(bulbId) ? bulbId : fixture.defaultBulb;
}

export function isKnownColorTemperature(kelvin) {
  return COLOR_TEMPERATURES.some((entry) => entry.kelvin === kelvin);
}

/** Whether the lamp hangs below the ceiling plane rather than sitting in it. */
export function isPendantFixture(fixtureTypeId) {
  return getFixtureType(fixtureTypeId).defaultDropMm > 0;
}

/**
 * What the fixture emits, once the lamp, the lamp count and the fixture's own
 * overrides have been reconciled. Multi-lamp fixtures report the whole
 * luminaire: a five-arm chandelier is one thing hanging in one place, and the
 * takeoff and the renderer both want its total, not one arm's share.
 */
export function resolveFixturePhotometrics(fixture) {
  const type = getFixtureType(fixture?.fixtureType);
  const bulb = getBulbType(resolveFixtureBulbId(type.id, fixture?.bulbType));
  // A stored null is the fixture deferring to its lamp, and null coerces to
  // zero — a beam of 0° would be a lamp that emits nothing at all.
  const override = fixture?.lumensOverride == null ? Number.NaN : Number(fixture.lumensOverride);
  const beamOverride = fixture?.beamAngleDeg == null ? Number.NaN : Number(fixture.beamAngleDeg);
  return {
    lumens: Number.isFinite(override) && override > 0 ? override : bulb.lumens * type.bulbCount,
    watts: bulb.watts * type.bulbCount,
    beamAngleDeg: Number.isFinite(beamOverride) ? beamOverride : bulb.beamAngleDeg,
    colorTempK: isKnownColorTemperature(fixture?.colorTempK) ? fixture.colorTempK : bulb.defaultCct,
  };
}
