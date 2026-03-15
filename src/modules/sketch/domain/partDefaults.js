export const PART_DEFAULTS = {
  panel: { width: 600, depth: 400, thickness: 18 },
  leg: { width: 40, depth: 40, height: 720 },
  frame: { width: 40, height: 60, length: 500 },
  cutout: { width: 100, height: 50, depth: 18 },
  hole: { diameter: 35, depth: 18 },
  dimension: { offset: 200 },
};

export const MATERIAL_OPTIONS = [
  { value: 'plywood', label: 'Plywood' },
  { value: 'mdf', label: 'MDF' },
  { value: 'particleboard', label: 'Particleboard' },
  { value: 'hardwood', label: 'Hardwood' },
  { value: 'softwood', label: 'Softwood' },
  { value: 'metal', label: 'Metal' },
];

export const LEG_PROFILE_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'round', label: 'Round' },
  { value: 'tapered', label: 'Tapered' },
];

export const FRAME_AXIS_OPTIONS = [
  { value: 'x', label: 'X (left-right)' },
  { value: 'y', label: 'Y (front-back)' },
];
