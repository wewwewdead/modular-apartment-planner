import {
  FIXTURE_KITCHEN_TOP_WIDTH, FIXTURE_KITCHEN_TOP_DEPTH,
  FIXTURE_TOILET_WIDTH, FIXTURE_TOILET_DEPTH,
  FIXTURE_LAVATORY_WIDTH, FIXTURE_LAVATORY_DEPTH,
  FIXTURE_TABLE_WIDTH, FIXTURE_TABLE_DEPTH,
  FIXTURE_TV_WIDTH, FIXTURE_TV_DEPTH,
  FIXTURE_SOFA_WIDTH, FIXTURE_SOFA_DEPTH,
  FIXTURE_BED_WIDTH, FIXTURE_BED_DEPTH,
} from '@/domain/defaults';

export const TOOLS = {
  SELECT: 'select',
  DIMENSION: 'dimension',
  WALL: 'wall',
  BEAM: 'beam',
  STAIR: 'stair',
  SECTION: 'section',
  SLAB: 'slab',
  ROOM: 'room',
  DOOR: 'door',
  WINDOW: 'window',
  COLUMN: 'column',
  LANDING: 'landing',
  FIXTURE: 'fixture',
  RAILING: 'railing',
  TRUSS_DRAW: 'truss_draw',
  ROOF_PARAPET: 'roof_parapet',
  ROOF_DRAIN: 'roof_drain',
  ROOF_OPENING: 'roof_opening',
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
