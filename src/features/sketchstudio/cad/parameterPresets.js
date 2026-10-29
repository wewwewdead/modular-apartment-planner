// Starting parameter sets for common builds. Add a preset by appending an
// entry: { id, label, description, snap, parameters: [{ name, value, note }] }.
// Values may be numbers or "=expressions" over earlier names.
export const PARAMETER_PRESETS = [
  {
    id: 'cabinet',
    label: 'Cabinet',
    description: 'Plywood carcass: overall size, panel and back thickness, toe kick.',
    snap: 1,
    parameters: [
      { name: 'width', value: 800, note: 'Overall width (X)' },
      { name: 'depth', value: 500, note: 'Overall depth (Y)' },
      { name: 'height', value: 1800, note: 'Overall height (Z)' },
      { name: 't', value: 18, note: 'Panel thickness' },
      { name: 'backT', value: 12, note: 'Back panel thickness' },
      { name: 'toe', value: 100, note: 'Toe kick height' },
    ],
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Top size and thickness, overall height, square leg size.',
    snap: 1,
    parameters: [
      { name: 'width', value: 1200, note: 'Top length (X)' },
      { name: 'depth', value: 650, note: 'Top depth (Y)' },
      { name: 'height', value: 750, note: 'Overall height (Z)' },
      { name: 'thickness', value: 24, note: 'Top thickness' },
      { name: 'legSize', value: 60, note: 'Square leg section' },
    ],
  },
  {
    id: 'steel-frame',
    label: 'Steel frame',
    description: 'Welded tube frame: overall size, tube section and wall, weld gap, top thickness.',
    snap: 1,
    parameters: [
      { name: 'width', value: 1200, note: 'Overall length (X)' },
      { name: 'depth', value: 650, note: 'Overall depth (Y)' },
      { name: 'height', value: 750, note: 'Overall height (Z)' },
      { name: 'section', value: 40, note: 'Square tube size' },
      { name: 'wall', value: 2, note: 'Tube wall thickness' },
      { name: 'weldGap', value: 1, note: 'Gap left for each weld' },
      // The starter model's top board (the welded table example) needs it.
      { name: 'thickness', value: 24, note: 'Top board thickness' },
    ],
  },
  { id: 'custom', label: 'Custom', description: 'Start empty and add your own names.', snap: 1, parameters: [] },
];

export const SNAP_CHOICES = [0, 0.5, 1, 2, 5, 10];
export const presetById = (id) => PARAMETER_PRESETS.find((p) => p.id === id) || PARAMETER_PRESETS[0];
