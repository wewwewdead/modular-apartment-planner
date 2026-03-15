import { materializeTemplateDefinition } from './templateHelpers';

const FRONT_PLANE_DEF = {
  normal: { x: 0, y: 1, z: 0 },
  uAxis: { x: 1, y: 0, z: 0 },
  vAxis: { x: 0, y: 0, z: 1 },
  up: { x: 0, y: 0, z: 1 },
};

function buildWheelProfile(diameter) {
  const radius = diameter / 2;
  const center = radius;
  const points = [];
  const segments = 10;

  for (let index = 0; index < segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    points.push({
      u: center + Math.cos(angle) * radius,
      v: center + Math.sin(angle) * radius,
    });
  }

  return points;
}

const carTemplate = {
  type: 'car',
  label: 'Car Chassis',
  description: 'Starter vehicle block with wheels, chassis rails, axles, and a profile body.',
  parameters: [
    { key: 'length', label: 'Length', type: 'number', default: 4200, min: 2200, max: 9000, step: 10, suffix: 'mm' },
    { key: 'width', label: 'Width', type: 'number', default: 1850, min: 1100, max: 3200, step: 10, suffix: 'mm' },
    { key: 'height', label: 'Height', type: 'number', default: 1600, min: 900, max: 3000, step: 10, suffix: 'mm' },
    { key: 'wheelDiameter', label: 'Wheel Diameter', type: 'number', default: 700, min: 300, max: 1400, step: 10, suffix: 'mm' },
    { key: 'wheelThickness', label: 'Wheel Thickness', type: 'number', default: 220, min: 80, max: 500, step: 10, suffix: 'mm' },
    { key: 'wheelbase', label: 'Wheelbase', type: 'number', default: 2600, min: 1200, max: 6000, step: 10, suffix: 'mm' },
    { key: 'bodyInset', label: 'Body Inset', type: 'number', default: 180, min: 0, max: 500, step: 5, suffix: 'mm' },
    { key: 'cabinHeight', label: 'Cabin Height', type: 'number', default: 900, min: 300, max: 1800, step: 10, suffix: 'mm' },
  ],
  buildDefinition(params) {
    const {
      length,
      width,
      height,
      wheelDiameter,
      wheelThickness,
      wheelbase,
      bodyInset,
      cabinHeight,
    } = params;
    const frontAxleX = (length - wheelbase) / 2;
    const rearAxleX = frontAxleX + wheelbase;
    const railYInset = width * 0.22;
    const railLength = length - bodyInset * 2;
    const bodyWidth = Math.max(width - bodyInset * 2, width * 0.6);
    const bodyZ = wheelDiameter * 0.55;
    const wheelProfile = buildWheelProfile(wheelDiameter);
    const wheelParts = [
      { role: 'front_left_wheel', name: 'Front Left Wheel', x: frontAxleX, y: 0 },
      { role: 'front_right_wheel', name: 'Front Right Wheel', x: frontAxleX, y: width - wheelThickness },
      { role: 'rear_left_wheel', name: 'Rear Left Wheel', x: rearAxleX, y: 0 },
      { role: 'rear_right_wheel', name: 'Rear Right Wheel', x: rearAxleX, y: width - wheelThickness },
    ].map((wheel) => ({
      type: 'solid',
      role: wheel.role,
      name: wheel.name,
      props: {
        material: 'metal',
        plane: FRONT_PLANE_DEF,
        extrusionDepth: wheelThickness,
        profilePoints: wheelProfile,
        position: {
          x: wheel.x - wheelDiameter / 2,
          y: wheel.y,
          z: 0,
        },
        fill: 'rgba(90, 90, 90, 0.14)',
      },
    }));

    return {
      name: `Car ${length}×${width}`,
      summary: 'Starter car block with modular wheels, axles, rails, and a profile body.',
      description: 'Use this as a hard-surface vehicle starter, then swap wheels, rails, and body modules for your own components.',
      dimensions: { width: length, depth: width, height },
      assemblies: [
        {
          key: 'chassis',
          name: 'Chassis',
          sortIndex: 0,
          parts: [
            {
              type: 'frame',
              role: 'left_rail',
              name: 'Left Rail',
              props: {
                length: railLength,
                width: 90,
                height: 150,
                axis: 'x',
                material: 'metal',
                position: { x: bodyInset, y: railYInset, z: wheelDiameter * 0.35 },
              },
            },
            {
              type: 'frame',
              role: 'right_rail',
              name: 'Right Rail',
              props: {
                length: railLength,
                width: 90,
                height: 150,
                axis: 'x',
                material: 'metal',
                position: { x: bodyInset, y: width - railYInset - 90, z: wheelDiameter * 0.35 },
              },
            },
          ],
        },
        {
          key: 'axles',
          name: 'Axles',
          sortIndex: 1,
          parts: [
            {
              type: 'frame',
              role: 'front_axle',
              name: 'Front Axle',
              props: {
                length: width - bodyInset * 2,
                width: 70,
                height: 70,
                axis: 'y',
                material: 'metal',
                position: { x: frontAxleX, y: bodyInset, z: wheelDiameter * 0.32 },
              },
            },
            {
              type: 'frame',
              role: 'rear_axle',
              name: 'Rear Axle',
              props: {
                length: width - bodyInset * 2,
                width: 70,
                height: 70,
                axis: 'y',
                material: 'metal',
                position: { x: rearAxleX, y: bodyInset, z: wheelDiameter * 0.32 },
              },
            },
          ],
        },
        {
          key: 'wheels',
          name: 'Wheels',
          sortIndex: 2,
          parts: wheelParts,
        },
        {
          key: 'body',
          name: 'Body',
          sortIndex: 3,
          parts: [
            {
              type: 'solid',
              role: 'body_shell',
              name: 'Body Shell',
              props: {
                material: 'plywood',
                plane: FRONT_PLANE_DEF,
                extrusionDepth: bodyWidth,
                position: { x: 0, y: bodyInset, z: bodyZ },
                profilePoints: [
                  { u: 0, v: 0 },
                  { u: length * 0.12, v: 0 },
                  { u: length * 0.24, v: height * 0.26 },
                  { u: length * 0.44, v: height * 0.55 },
                  { u: length * 0.62, v: Math.min(cabinHeight, height * 0.72) },
                  { u: length * 0.8, v: height * 0.54 },
                  { u: length * 0.92, v: height * 0.18 },
                  { u: length, v: 0 },
                  { u: length * 0.84, v: 0 },
                  { u: length * 0.18, v: 0 },
                ],
                fill: 'rgba(184, 70, 70, 0.08)',
              },
            },
          ],
        },
      ],
    };
  },
  generate(params) {
    return materializeTemplateDefinition(this.buildDefinition(params));
  },
};

export default carTemplate;
