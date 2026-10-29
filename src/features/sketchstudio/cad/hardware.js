import { positive, uid } from './model.js';

// Conventional coarse cutting-tap drills. These are editable process choices,
// not form-tap drills or a promise of a particular thread engagement.
export const METRIC_THREADS = {
  M2: { diameter: 2, pitch: 0.4, drill: 1.6 },
  'M2.5': { diameter: 2.5, pitch: 0.45, drill: 2.05 },
  M3: { diameter: 3, pitch: 0.5, drill: 2.5 },
  M4: { diameter: 4, pitch: 0.7, drill: 3.3 },
  M5: { diameter: 5, pitch: 0.8, drill: 4.2 },
  M6: { diameter: 6, pitch: 1, drill: 5 },
  M8: { diameter: 8, pitch: 1.25, drill: 6.8 },
  M10: { diameter: 10, pitch: 1.5, drill: 8.5 },
  M12: { diameter: 12, pitch: 1.75, drill: 10.2 },
};
export const HARDWARE_TYPES = {
  bolt: 'Hex bolt',
  nut: 'Hex nut',
  washer: 'Washer',
  standoff: 'Threaded standoff',
  'clinch-nut': 'Self-clinching nut (PEM style)',
  'clinch-standoff': 'Self-clinching standoff (PEM style)',
  stud: 'Self-clinching stud (PEM style)',
  'rivet-nut': 'Rivet nut',
  insert: 'Threaded insert',
};
export function holePreset(feature, mode, size = 'M3') {
  if (mode === 'plain') return { ...feature, holeSpec: undefined };
  const thread = METRIC_THREADS[size];
  if (!thread) throw new Error('Choose a metric thread size.');
  return {
    ...feature,
    diameter:
      mode === 'tap'
        ? thread.drill
        : +(thread.diameter + (thread.diameter <= 4 ? 0.4 : thread.diameter <= 8 ? 0.6 : 1)).toFixed(2),
    holeSpec: { mode, size, pitch: thread.pitch },
  };
}
export function threadNote(feature) {
  const spec = feature.holeSpec;
  return spec
    ? `${spec.mode === 'tap' ? 'TAP' : 'CLEARANCE FOR'} ${spec.size} × ${spec.pitch}${spec.mode === 'tap' ? ' — schematic bore; threads not modeled' : ''}`
    : '';
}
export function hardwareDefaults(kind = 'bolt', size = 'M3') {
  const { diameter, pitch } = METRIC_THREADS[size];
  return {
    id: uid('hardware'),
    type: 'hardware',
    kind,
    size,
    pitch,
    diameter,
    length: kind === 'washer' ? 1 : kind.includes('nut') ? diameter : 12,
    bodyDiameter: diameter * 2,
    headDiameter: diameter * 2.3,
    headHeight: diameter * 0.6,
    boreDiameter: kind === 'washer' ? diameter + 0.4 : diameter,
    material: 'Steel',
    supplierCode: '',
    installationHole: '',
    minimumSheet: '',
    notes: '',
  };
}
export function hardwareDimensions(feature, parameters = {}) {
  if (!HARDWARE_TYPES[feature.kind]) throw new Error('Choose a hardware type.');
  const values = Object.fromEntries(
    ['diameter', 'pitch', 'length', 'bodyDiameter', 'headDiameter', 'headHeight', 'boreDiameter'].map((key) => [
      key,
      positive(feature[key], parameters, key),
    ]),
  );
  if (!['bolt', 'stud'].includes(feature.kind) && values.boreDiameter >= values.bodyDiameter)
    throw new Error('The bore must be smaller than the hardware body.');
  if (['bolt', 'stud'].includes(feature.kind) && values.headDiameter <= values.diameter)
    throw new Error('The head must be wider than the shank.');
  if (
    ['clinch-nut', 'clinch-standoff', 'rivet-nut'].includes(feature.kind) &&
    values.headDiameter < values.bodyDiameter
  )
    throw new Error('The flange must be at least as wide as the body.');
  return values;
}
export function hardwareNote(f) {
  return `${HARDWARE_TYPES[f.kind]}; ${f.kind === 'washer' ? `${f.size} clearance` : `${f.size} × ${f.pitch}`}; simplified envelope, no helical threads or clinching teeth${f.supplierCode ? `; Supplier: ${f.supplierCode}` : ''}${f.installationHole ? `; Installation hole Ø${f.installationHole} mm` : ''}${f.minimumSheet ? `; Minimum sheet ${f.minimumSheet} mm` : ''}${f.notes ? `; ${f.notes}` : ''}`;
}
export function createHardware(feature) {
  hardwareDimensions(feature);
  const part = {
    id: uid('part'),
    name: `${HARDWARE_TYPES[feature.kind]} ${feature.size}`,
    material: feature.material,
    features: [feature],
  };
  return {
    part,
    instance: { id: uid('instance'), partId: part.id, position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
  };
}
