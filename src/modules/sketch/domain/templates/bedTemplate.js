import { materializeTemplateDefinition } from './templateHelpers';

const bedTemplate = {
  type: 'bed',
  label: 'Bed Frame',
  description: 'Starter bed frame with rails, legs, slats, and a headboard.',
  parameters: [
    { key: 'length', label: 'Length', type: 'number', default: 2100, min: 1200, max: 3200, step: 10, suffix: 'mm' },
    { key: 'width', label: 'Width', type: 'number', default: 1600, min: 700, max: 2400, step: 10, suffix: 'mm' },
    { key: 'deckHeight', label: 'Deck Height', type: 'number', default: 360, min: 180, max: 700, step: 10, suffix: 'mm' },
    { key: 'railHeight', label: 'Rail Height', type: 'number', default: 180, min: 80, max: 320, step: 5, suffix: 'mm' },
    { key: 'railThickness', label: 'Rail Thickness', type: 'number', default: 32, min: 18, max: 90, step: 1, suffix: 'mm' },
    { key: 'legSize', label: 'Leg Size', type: 'number', default: 80, min: 30, max: 180, step: 5, suffix: 'mm' },
    { key: 'slatCount', label: 'Slats', type: 'integer', default: 8, min: 2, max: 24, step: 1, suffix: '' },
    { key: 'headboardHeight', label: 'Headboard Height', type: 'number', default: 950, min: 400, max: 1600, step: 10, suffix: 'mm' },
  ],
  buildDefinition(params) {
    const {
      length,
      width,
      deckHeight,
      railHeight,
      railThickness,
      legSize,
      slatCount,
      headboardHeight,
    } = params;
    const innerLength = Math.max(length - railThickness * 2, 400);
    const innerWidth = Math.max(width - railThickness * 2, 400);
    const railZ = Math.max(deckHeight - railHeight, 0);
    const slatThickness = 20;
    const slatWidth = Math.max(innerLength / Math.max(slatCount + 2, 4), 55);
    const slatGap = (innerLength - slatWidth * slatCount) / Math.max(slatCount + 1, 1);
    const slatParts = [];

    for (let index = 0; index < slatCount; index += 1) {
      const x = railThickness + slatGap * (index + 1) + slatWidth * index;
      slatParts.push({
        type: 'panel',
        role: `slat_${index + 1}`,
        name: `Slat ${index + 1}`,
        props: {
          width: slatWidth,
          depth: innerWidth,
          thickness: slatThickness,
          material: 'softwood',
          position: { x, y: railThickness, z: deckHeight - slatThickness },
        },
      });
    }

    return {
      name: `Bed ${width}×${length}`,
      summary: 'Starter bed frame with modular rails, legs, slats, and a headboard.',
      description: 'Use this as a modular starting point, then duplicate or replace rails, slats, and headboard parts with custom modules.',
      dimensions: { width: length, depth: width, height: headboardHeight },
      assemblies: [
        {
          key: 'legs',
          name: 'Legs',
          sortIndex: 0,
          parts: [
            {
              type: 'leg',
              role: 'front_left_leg',
              name: 'Front Left Leg',
              props: { width: legSize, depth: legSize, height: deckHeight, material: 'hardwood', position: { x: 0, y: 0, z: 0 } },
            },
            {
              type: 'leg',
              role: 'front_right_leg',
              name: 'Front Right Leg',
              props: { width: legSize, depth: legSize, height: deckHeight, material: 'hardwood', position: { x: 0, y: width - legSize, z: 0 } },
            },
            {
              type: 'leg',
              role: 'rear_left_leg',
              name: 'Rear Left Leg',
              props: { width: legSize, depth: legSize, height: deckHeight, material: 'hardwood', position: { x: length - legSize, y: 0, z: 0 } },
            },
            {
              type: 'leg',
              role: 'rear_right_leg',
              name: 'Rear Right Leg',
              props: { width: legSize, depth: legSize, height: deckHeight, material: 'hardwood', position: { x: length - legSize, y: width - legSize, z: 0 } },
            },
          ],
        },
        {
          key: 'rails',
          name: 'Rails',
          sortIndex: 1,
          parts: [
            {
              type: 'frame',
              role: 'left_rail',
              name: 'Left Rail',
              props: { length: innerLength, width: railThickness, height: railHeight, axis: 'x', material: 'hardwood', position: { x: railThickness, y: 0, z: railZ } },
            },
            {
              type: 'frame',
              role: 'right_rail',
              name: 'Right Rail',
              props: { length: innerLength, width: railThickness, height: railHeight, axis: 'x', material: 'hardwood', position: { x: railThickness, y: width - railThickness, z: railZ } },
            },
            {
              type: 'frame',
              role: 'head_rail',
              name: 'Head Rail',
              props: { length: innerWidth, width: railThickness, height: railHeight, axis: 'y', material: 'hardwood', position: { x: 0, y: railThickness, z: railZ } },
            },
            {
              type: 'frame',
              role: 'foot_rail',
              name: 'Foot Rail',
              props: { length: innerWidth, width: railThickness, height: railHeight, axis: 'y', material: 'hardwood', position: { x: length - railThickness, y: railThickness, z: railZ } },
            },
          ],
        },
        {
          key: 'deck',
          name: 'Deck Slats',
          sortIndex: 2,
          parts: slatParts,
        },
        {
          key: 'headboard',
          name: 'Headboard',
          sortIndex: 3,
          parts: [
            {
              type: 'panel',
              role: 'headboard',
              name: 'Headboard',
              props: {
                width: railThickness,
                depth: width,
                thickness: headboardHeight,
                material: 'plywood',
                position: { x: 0, y: 0, z: 0 },
                fill: 'rgba(184, 134, 11, 0.1)',
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

export default bedTemplate;
