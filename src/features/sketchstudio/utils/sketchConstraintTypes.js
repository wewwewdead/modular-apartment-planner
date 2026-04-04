export const SKETCH_CONSTRAINT_TYPES = [
  'equal_length',
  'equal_width',
  'equal_height',
  'horizontal',
  'vertical',
  'coincident_point',
  'midpoint_lock',
  'centered_between',
  'offset_distance',
  'thickness_offset',
];

export const SKETCH_CONSTRAINT_LABELS = {
  equal_length: 'Equal Length',
  equal_width: 'Equal Width',
  equal_height: 'Equal Height',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  coincident_point: 'Coincident Point',
  midpoint_lock: 'Midpoint Lock',
  centered_between: 'Centered Between',
  offset_distance: 'Offset Distance',
  thickness_offset: 'Thickness Offset',
};

export const SKETCH_CONSTRAINT_STATUS_LABELS = {
  applied: 'Applied',
  disabled: 'Disabled',
  invalid_ref: 'Invalid Ref',
  unsupported: 'Unsupported',
  expression_error: 'Expression Error',
  cycle_blocked: 'Cycle Blocked',
};

export const SKETCH_CONSTRAINT_PRIORITIES = {
  horizontal: 10,
  vertical: 20,
  equal_length: 30,
  equal_width: 40,
  equal_height: 50,
  offset_distance: 60,
  thickness_offset: 70,
  midpoint_lock: 80,
  centered_between: 90,
  coincident_point: 100,
};

export function isSketchConstraintType(value) {
  return SKETCH_CONSTRAINT_TYPES.includes(value);
}

export function getSketchConstraintLabel(type) {
  return SKETCH_CONSTRAINT_LABELS[type] || 'Constraint';
}

export function getSketchConstraintStatusLabel(status) {
  return SKETCH_CONSTRAINT_STATUS_LABELS[status] || 'Unknown';
}

export function getSketchConstraintPriority(type) {
  return SKETCH_CONSTRAINT_PRIORITIES[type] ?? Number.MAX_SAFE_INTEGER;
}
