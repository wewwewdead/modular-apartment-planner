import {
  FIXTURE_KITCHEN_TOP_WIDTH,
  FIXTURE_KITCHEN_TOP_DEPTH,
  FIXTURE_TOILET_WIDTH,
  FIXTURE_TOILET_DEPTH,
  FIXTURE_LAVATORY_WIDTH,
  FIXTURE_LAVATORY_DEPTH,
  FIXTURE_TABLE_WIDTH,
  FIXTURE_TABLE_DEPTH,
  FIXTURE_TV_WIDTH,
  FIXTURE_TV_DEPTH,
  FIXTURE_SOFA_WIDTH,
  FIXTURE_SOFA_DEPTH,
  FIXTURE_BED_WIDTH,
  FIXTURE_BED_DEPTH,
  OUTLET_MOUNT_HEIGHT,
  GFCI_MOUNT_HEIGHT,
  SWITCH_MOUNT_HEIGHT,
} from '@/domain/defaults';

export const TOOLS = {
  SELECT: 'select',
  DIMENSION: 'dimension',
  WALL: 'wall',
  BEAM: 'beam',
  STAIR: 'stair',
  SECTION: 'section',
  SLAB: 'slab',
  // Pushes one edge of an already-drawn slab out by a typed distance, instead
  // of dragging it and reading the number off the cursor. Entered from the slab
  // properties panel, never from the toolbar.
  CANTILEVER: 'cantilever',
  CEILING: 'ceiling',
  // Picks the beams a new ceiling hangs from, one click each, instead of taking
  // every beam on the floor.
  CEILING_BEAM_PICK: 'ceiling_beam_pick',
  ROOM: 'room',
  DOOR: 'door',
  WINDOW: 'window',
  COLUMN: 'column',
  LANDING: 'landing',
  FIXTURE: 'fixture',
  RAILING: 'railing',
  ELECTRICAL: 'electrical',
  TRUSS_DRAW: 'truss_draw',
  ROOF_PARAPET: 'roof_parapet',
  ROOF_DRAIN: 'roof_drain',
  ROOF_OPENING: 'roof_opening',
  FILLET: 'fillet',
};

export const RAILING_TYPES = {
  GLASS: 'glass',
  HANDRAIL: 'handrail',
  GUARDRAIL: 'guardrail',
};

export const FIXTURE_TYPES = {
  KITCHEN_TOP: 'kitchenTop',
  TOILET: 'toilet',
  LAVATORY: 'lavatory',
  TABLE: 'table',
  TV: 'tv',
  SOFA: 'sofa',
  BED: 'bed',
};

export const FIXTURE_DEFAULTS = {
  [FIXTURE_TYPES.KITCHEN_TOP]: { width: FIXTURE_KITCHEN_TOP_WIDTH, depth: FIXTURE_KITCHEN_TOP_DEPTH },
  [FIXTURE_TYPES.TOILET]: { width: FIXTURE_TOILET_WIDTH, depth: FIXTURE_TOILET_DEPTH },
  [FIXTURE_TYPES.LAVATORY]: { width: FIXTURE_LAVATORY_WIDTH, depth: FIXTURE_LAVATORY_DEPTH },
  [FIXTURE_TYPES.TABLE]: { width: FIXTURE_TABLE_WIDTH, depth: FIXTURE_TABLE_DEPTH },
  [FIXTURE_TYPES.TV]: { width: FIXTURE_TV_WIDTH, depth: FIXTURE_TV_DEPTH },
  [FIXTURE_TYPES.SOFA]: { width: FIXTURE_SOFA_WIDTH, depth: FIXTURE_SOFA_DEPTH },
  [FIXTURE_TYPES.BED]: { width: FIXTURE_BED_WIDTH, depth: FIXTURE_BED_DEPTH },
};

// Surface-mounted wall devices (outlets/switches). Distinct from the
// building-services electrical axis (risers, panel zones) — these are the
// per-wall symbols an occupant plans against.
export const ELECTRICAL_DEVICE_TYPES = {
  OUTLET: 'outlet',
  OUTLET_GFCI: 'outlet-gfci',
  OUTLET_220V: 'outlet-220v',
  SWITCH: 'switch',
  SWITCH_3WAY: 'switch-3way',
  SWITCH_DIMMER: 'switch-dimmer',
};

export const ELECTRICAL_DEVICE_DEFAULTS = {
  [ELECTRICAL_DEVICE_TYPES.OUTLET]: { label: 'Outlet', mountHeight: OUTLET_MOUNT_HEIGHT },
  [ELECTRICAL_DEVICE_TYPES.OUTLET_GFCI]: { label: 'GFCI Outlet', mountHeight: GFCI_MOUNT_HEIGHT },
  [ELECTRICAL_DEVICE_TYPES.OUTLET_220V]: { label: '220V Outlet', mountHeight: OUTLET_MOUNT_HEIGHT },
  [ELECTRICAL_DEVICE_TYPES.SWITCH]: { label: 'Switch', mountHeight: SWITCH_MOUNT_HEIGHT },
  [ELECTRICAL_DEVICE_TYPES.SWITCH_3WAY]: { label: '3-Way Switch', mountHeight: SWITCH_MOUNT_HEIGHT },
  [ELECTRICAL_DEVICE_TYPES.SWITCH_DIMMER]: { label: 'Dimmer Switch', mountHeight: SWITCH_MOUNT_HEIGHT },
};
