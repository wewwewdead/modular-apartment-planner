import { materializeTemplateDefinition } from './templateHelpers';

const tableTemplate = {
  type: 'table',
  label: 'Table',
  description: 'Tabletop with four legs at corners',
  parameters: [
    { key: 'width', label: 'Width', type: 'number', default: 1200, min: 200, max: 5000, step: 10, suffix: 'mm' },
    { key: 'depth', label: 'Depth', type: 'number', default: 600, min: 200, max: 3000, step: 10, suffix: 'mm' },
    { key: 'height', label: 'Height', type: 'number', default: 750, min: 200, max: 2000, step: 10, suffix: 'mm' },
    { key: 'topThickness', label: 'Top Thickness', type: 'number', default: 18, min: 6, max: 80, step: 1, suffix: 'mm' },
    { key: 'legWidth', label: 'Leg Width', type: 'number', default: 40, min: 10, max: 200, step: 5, suffix: 'mm' },
    { key: 'legDepth', label: 'Leg Depth', type: 'number', default: 40, min: 10, max: 200, step: 5, suffix: 'mm' },
    { key: 'legInset', label: 'Leg Inset', type: 'number', default: 30, min: 0, max: 200, step: 5, suffix: 'mm' },
  ],
  buildDefinition(params) {
    const { width, depth, height, topThickness, legWidth, legDepth, legInset } = params;
    const legHeight = height - topThickness;

    return {
      name: `Table ${width}×${depth}`,
      summary: 'Parametric table assembly',
      description: 'Tabletop and leg assemblies driven by overall dimensions and inset spacing.',
      dimensions: { width, depth, height },
      assemblies: [
        {
          key: 'top',
          name: 'Top',
          sortIndex: 0,
          parts: [
            {
              type: 'panel',
              role: 'tabletop',
              name: 'Tabletop',
              props: {
                width,
                depth,
                thickness: topThickness,
                material: 'plywood',
                position: { x: 0, y: 0, z: legHeight },
              },
            },
          ],
        },
        {
          key: 'legs',
          name: 'Legs',
          sortIndex: 1,
          parts: [
            {
              type: 'leg',
              role: 'front_left_leg',
              name: 'Front Left Leg',
              props: {
                width: legWidth,
                depth: legDepth,
                height: legHeight,
                position: { x: legInset, y: legInset, z: 0 },
              },
            },
            {
              type: 'leg',
              role: 'front_right_leg',
              name: 'Front Right Leg',
              props: {
                width: legWidth,
                depth: legDepth,
                height: legHeight,
                position: { x: width - legInset - legWidth, y: legInset, z: 0 },
              },
            },
            {
              type: 'leg',
              role: 'rear_left_leg',
              name: 'Rear Left Leg',
              props: {
                width: legWidth,
                depth: legDepth,
                height: legHeight,
                position: { x: legInset, y: depth - legInset - legDepth, z: 0 },
              },
            },
            {
              type: 'leg',
              role: 'rear_right_leg',
              name: 'Rear Right Leg',
              props: {
                width: legWidth,
                depth: legDepth,
                height: legHeight,
                position: { x: width - legInset - legWidth, y: depth - legInset - legDepth, z: 0 },
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

export default tableTemplate;
