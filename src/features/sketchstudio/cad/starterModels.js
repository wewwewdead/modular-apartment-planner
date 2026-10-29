import { PRESET_EXAMPLES, furnitureExample } from './examples.js';

// Starter models for the Design parameters presets: parts and instances whose
// every size and position is an expression over the preset's parameter
// names, so editing a parameter afterwards re-sizes the whole model.

const instance = (id, partId, position, rotation = [0, 0, 0]) => ({
  id,
  partId,
  name: '',
  position,
  rotation,
  visible: true,
});
const panel = (id, name, width, depth, height, grain, features = []) => ({
  id,
  name,
  material: 'Birch plywood',
  grain,
  features: [{ id: `${id}-base`, type: 'box', width, depth, height }, ...features],
});

// Joint Y positions as fractions of the depth: 50, 180, 320, 450 at 500 deep,
// symmetric front-to-back so the turned right side matches.
export const PILOT_FRACTIONS = [0.1, 0.36, 0.64, 0.9];
// One 32 mm shelf-pin column per adjustable shelf: five pin heights centred
// 5 mm below the shelf's default height, in rows 37 mm from front and back.
export const PIN_ZONES = [500, 1300];
export const PIN_STEPS = [-2, -1, 0, 1, 2];

// The industrial shop cabinet of docs/industrial-cabinet-guide.md, section 1.
// Both sides are one definition (parts list: Side 2). The right side is the
// same panel turned 180° about Z — position (=width, =depth, 0) — so its
// shelf-pin holes face the inside, like the left side's; it occupies
// X =width-t … =width.
export function cabinetStarter() {
  const pilots = [
    ['bottom', '=toe+t/2'],
    ['top', '=height-t/2'],
    ['shelf', '=height/2+t/2'],
  ].flatMap(([joint, z]) =>
    PILOT_FRACTIONS.map((fraction, index) => ({
      id: `side-pilot-${joint}-${index}`,
      type: 'hole',
      diameter: 4,
      depth: '=t',
      throughAll: true,
      position: [0, `=depth*${fraction}`, z],
      direction: [1, 0, 0],
    })),
  );
  const pins = PIN_ZONES.flatMap((zone, z) =>
    PIN_STEPS.flatMap((step) =>
      [37, '=depth-37'].map((y, row) => ({
        id: `side-pin-${z}-${step + 2}-${row}`,
        type: 'hole',
        diameter: 5,
        depth: 10,
        position: ['=t', y, zone - 5 + step * 32],
        direction: [-1, 0, 0],
      })),
    ),
  );
  const parts = [
    panel('side', 'Side', '=t', '=depth', '=height', 'Z', [...pilots, ...pins]),
    panel('bottom', 'Bottom', '=width-2*t', '=depth', '=t', 'X'),
    panel('top', 'Top', '=width-2*t', '=depth', '=t', 'X'),
    panel('fixed-shelf', 'Fixed shelf', '=width-2*t', '=depth', '=t', 'X'),
    panel('stiffener', 'Stiffener', '=width-2*t', 60, '=t', 'X'),
    panel('plinth', 'Plinth', '=width-2*t', '=t', '=toe', 'X'),
    panel('back', 'Back', '=width', '=backT', '=height-toe', 'Z'),
    panel('adjustable-shelf', 'Adjustable shelf', '=width-2*t-2', '=depth-20', '=t', 'X'),
  ];
  const instances = [
    instance('side-left', 'side', [0, 0, 0]),
    instance('side-right', 'side', ['=width', '=depth', 0], [0, 0, 180]),
    instance('bottom', 'bottom', ['=t', 0, '=toe']),
    instance('top', 'top', ['=t', 0, '=height-t']),
    instance('fixed-shelf', 'fixed-shelf', ['=t', 0, '=height/2']),
    // Under the fixed shelf's front edge.
    instance('stiffener', 'stiffener', ['=t', 0, '=height/2-t']),
    // Set back 50 mm from the front.
    instance('plinth', 'plinth', ['=t', 50, 0]),
    // On the rear face, from the toe kick up.
    instance('back', 'back', [0, '=depth', '=toe']),
    instance('adjustable-shelf-1', 'adjustable-shelf', ['=t+1', 10, PIN_ZONES[0]]),
    instance('adjustable-shelf-2', 'adjustable-shelf', ['=t+1', 10, PIN_ZONES[1]]),
  ];
  return { parts, instances, connections: [], sheet: { title: 'Shop cabinet', scale: 0.04 } };
}

function exampleStarter(presetId) {
  const { kind, options } = PRESET_EXAMPLES[presetId];
  const example = furnitureExample(kind, options);
  return {
    parts: example.parts,
    instances: example.instances,
    connections: example.connections,
    sketches: example.sketches,
    sheet: { title: example.sheets[0].title, scale: example.sheets[0].scale },
  };
}

export const STARTER_PRESETS = ['cabinet', 'table', 'steel-frame'];
export const hasStarterModel = (presetId) => STARTER_PRESETS.includes(presetId);

export function starterModel(presetId) {
  if (presetId === 'cabinet') return cabinetStarter();
  if (PRESET_EXAMPLES[presetId]) return exampleStarter(presetId);
  throw new Error(`No starter model for ${presetId}.`);
}

// Every parameter name the starter's expressions use.
export function starterParameterNames(starter) {
  const names = new Set();
  const walk = (value) => {
    if (typeof value === 'string' && value.startsWith('='))
      for (const name of value.slice(1).match(/[A-Za-z_][A-Za-z_0-9]*/g) || []) names.add(name);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk([starter.parts, starter.instances, starter.connections]);
  return [...names].sort();
}

// The model with the preset's parameters (already merged) and its starter
// parts, in one value for one commit. Only an empty model is built into.
export function buildStarterModel(model, presetId, parameters) {
  if (model.parts.length || model.instances.length)
    throw new Error('Model already has parts. The starter model is only built into an empty model.');
  const starter = starterModel(presetId);
  const missing = starterParameterNames(starter).filter((name) => !parameters.some((p) => p.name === name));
  if (missing.length)
    throw new Error(`The starter model needs ${missing.join(', ')}. Restore those rows or untick Build.`);
  return {
    ...model,
    parameters,
    parts: starter.parts,
    instances: starter.instances,
    connections: [...model.connections, ...starter.connections],
    sketches: [...model.sketches, ...(starter.sketches || [])],
    sheets: model.sheets.map((sheet, index) => (index === 0 ? { ...sheet, ...starter.sheet } : sheet)),
  };
}
