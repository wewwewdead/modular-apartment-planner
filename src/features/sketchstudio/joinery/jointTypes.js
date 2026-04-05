function createNumberField(key, label, options = {}) {
  return {
    key,
    label,
    kind: 'number',
    min: options.min ?? 0,
    step: options.step ?? 0.1,
  };
}

function createIntegerField(key, label, options = {}) {
  return {
    key,
    label,
    kind: 'integer',
    min: options.min ?? 1,
    step: 1,
  };
}

export const JOINT_TYPES = Object.freeze({
  BUTT: 'butt',
  DADO: 'dado',
  RABBET: 'rabbet',
  MORTISE_TENON: 'mortise_tenon',
  DOWEL: 'dowel',
  POCKET_SCREW: 'pocket_screw',
  TAB_SLOT: 'tab_slot',
});

export const LEGACY_JOINT_TYPE_ALIASES = Object.freeze({
  'mortise-tenon': JOINT_TYPES.MORTISE_TENON,
  mortiseTenon: JOINT_TYPES.MORTISE_TENON,
  'pocket-hole': JOINT_TYPES.POCKET_SCREW,
  pocketHole: JOINT_TYPES.POCKET_SCREW,
  pocket_hole: JOINT_TYPES.POCKET_SCREW,
  'tab-slot': JOINT_TYPES.TAB_SLOT,
  tabSlot: JOINT_TYPES.TAB_SLOT,
  tab_and_slot: JOINT_TYPES.TAB_SLOT,
  finger: JOINT_TYPES.TAB_SLOT,
});

const JOINT_TYPE_DEFINITIONS = [
  {
    id: JOINT_TYPES.BUTT,
    label: 'Butt Joint',
    description: 'Face-to-edge or edge-to-edge assembly metadata with no additional cut geometry.',
    parameterFields: [
      createNumberField('offset', 'Offset (mm)', { min: -1000 }),
    ],
  },
  {
    id: JOINT_TYPES.DADO,
    label: 'Dado',
    description: 'A receiving slot cut into the target part for a mating source panel.',
    parameterFields: [
      createNumberField('width', 'Width (mm)', { min: 1 }),
      createNumberField('depth', 'Depth (mm)', { min: 0.1 }),
      createNumberField('inset', 'Inset (mm)', { min: 0 }),
      createNumberField('offset', 'Width Offset (mm)', { min: -1000 }),
    ],
  },
  {
    id: JOINT_TYPES.RABBET,
    label: 'Rabbet',
    description: 'A stepped edge cut in the target part that receives the source part.',
    parameterFields: [
      createNumberField('width', 'Width (mm)', { min: 1 }),
      createNumberField('depth', 'Depth (mm)', { min: 0.1 }),
      createNumberField('inset', 'Inset (mm)', { min: 0 }),
      createNumberField('offset', 'Width Offset (mm)', { min: -1000 }),
    ],
  },
  {
    id: JOINT_TYPES.MORTISE_TENON,
    label: 'Mortise and Tenon',
    description: 'A male tenon on the source edge and a matching female mortise in the target edge.',
    parameterFields: [
      createNumberField('width', 'Tenon Width (mm)', { min: 1 }),
      createNumberField('depth', 'Tenon Depth (mm)', { min: 0.1 }),
      createNumberField('inset', 'Inset (mm)', { min: 0 }),
      createNumberField('offset', 'Width Offset (mm)', { min: -1000 }),
    ],
  },
  {
    id: JOINT_TYPES.DOWEL,
    label: 'Dowel Joint',
    description: 'Matched drilling operations across the source and target parts.',
    parameterFields: [
      createNumberField('dowelDiameter', 'Dowel Diameter (mm)', { min: 0.1 }),
      createIntegerField('count', 'Dowel Count', { min: 1 }),
      createNumberField('spacing', 'Spacing (mm)', { min: 0 }),
      createNumberField('edgeOffset', 'Edge Offset (mm)', { min: 0 }),
      createNumberField('depth', 'Drill Depth (mm)', { min: 0.1 }),
    ],
  },
  {
    id: JOINT_TYPES.POCKET_SCREW,
    label: 'Pocket Screw Joint',
    description: 'Pocket bores in the source part with matching pilot drilling in the target part.',
    parameterFields: [
      createNumberField('pocketDiameter', 'Pocket Diameter (mm)', { min: 0.1 }),
      createNumberField('pilotDiameter', 'Pilot Diameter (mm)', { min: 0.1 }),
      createIntegerField('count', 'Pocket Count', { min: 1 }),
      createNumberField('spacing', 'Spacing (mm)', { min: 0 }),
      createNumberField('edgeOffset', 'Edge Offset (mm)', { min: 0 }),
      createNumberField('pocketOffset', 'Pocket Offset (mm)', { min: 0 }),
      createNumberField('depth', 'Pocket Depth (mm)', { min: 0.1 }),
    ],
  },
  {
    id: JOINT_TYPES.TAB_SLOT,
    label: 'Tab-and-Slot',
    description: 'Repeated male tabs on the source edge and matching slots on the target edge.',
    parameterFields: [
      createIntegerField('count', 'Tab Count', { min: 1 }),
      createNumberField('tabWidth', 'Tab Width (mm)', { min: 0.1 }),
      createNumberField('spacing', 'Spacing (mm)', { min: 0 }),
      createNumberField('edgeOffset', 'Edge Offset (mm)', { min: 0 }),
      createNumberField('depth', 'Tab Depth (mm)', { min: 0.1 }),
    ],
  },
];

const JOINT_TYPE_MAP = new Map(JOINT_TYPE_DEFINITIONS.map((definition) => [definition.id, definition]));

export function resolveJointType(type) {
  const normalized = typeof type === 'string' ? type.trim() : '';
  return JOINT_TYPE_MAP.has(normalized)
    ? normalized
    : (LEGACY_JOINT_TYPE_ALIASES[normalized] || JOINT_TYPES.BUTT);
}

export function isSupportedJointType(type) {
  return JOINT_TYPE_MAP.has(resolveJointType(type));
}

export function getJointTypeDefinition(type) {
  return JOINT_TYPE_MAP.get(resolveJointType(type)) || JOINT_TYPE_MAP.get(JOINT_TYPES.BUTT);
}

export function getJointTypeLabel(type) {
  return getJointTypeDefinition(type).label;
}

export function getJointTypeOptions() {
  return JOINT_TYPE_DEFINITIONS.map((definition) => ({
    value: definition.id,
    label: definition.label,
  }));
}

export function listJointTypeParameterFields(type) {
  return getJointTypeDefinition(type).parameterFields || [];
}
