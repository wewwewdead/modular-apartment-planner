import { materializeTemplateDefinition } from './templateHelpers';

const deskTemplate = {
  type: 'desk',
  label: 'Desk',
  description: 'Desktop with two side panels and optional back',
  parameters: [
    { key: 'width', label: 'Width', type: 'number', default: 1400, min: 400, max: 5000, step: 10, suffix: 'mm' },
    { key: 'depth', label: 'Depth', type: 'number', default: 600, min: 300, max: 2000, step: 10, suffix: 'mm' },
    { key: 'height', label: 'Height', type: 'number', default: 750, min: 400, max: 1200, step: 10, suffix: 'mm' },
    { key: 'topThickness', label: 'Top Thickness', type: 'number', default: 25, min: 10, max: 80, step: 1, suffix: 'mm' },
    { key: 'sideThickness', label: 'Side Thickness', type: 'number', default: 18, min: 6, max: 50, step: 1, suffix: 'mm' },
    { key: 'hasBackPanel', label: 'Back Panel', type: 'boolean', default: false },
  ],
  buildDefinition(params) {
    const { width, depth, height, topThickness, sideThickness, hasBackPanel } = params;
    const sideHeight = height - topThickness;

    return {
      name: `Desk ${width}×${depth}`,
      summary: 'Desk assembly with top, side supports, and optional modesty panel',
      description: 'Top, support panels, and optional back panel driven by desk dimensions.',
      dimensions: { width, depth, height },
      assemblies: [
        {
          key: 'top',
          name: 'Top',
          sortIndex: 0,
          parts: [
            {
              type: 'panel',
              role: 'desktop',
              name: 'Desktop',
              props: {
                width,
                depth,
                thickness: topThickness,
                material: 'plywood',
                position: { x: 0, y: 0, z: sideHeight },
              },
            },
          ],
        },
        {
          key: 'supports',
          name: 'Supports',
          sortIndex: 1,
          parts: [
            {
              type: 'panel',
              role: 'left_support',
              name: 'Left Side',
              props: {
                width: sideThickness,
                depth,
                thickness: sideHeight,
                material: 'plywood',
                position: { x: 0, y: 0, z: 0 },
              },
            },
            {
              type: 'panel',
              role: 'right_support',
              name: 'Right Side',
              props: {
                width: sideThickness,
                depth,
                thickness: sideHeight,
                material: 'plywood',
                position: { x: width - sideThickness, y: 0, z: 0 },
              },
            },
          ],
        },
        {
          key: 'back',
          name: 'Back Panel',
          sortIndex: 2,
          parts: hasBackPanel ? [
            {
              type: 'panel',
              role: 'modesty_panel',
              name: 'Back Panel',
              props: {
                width: width - 2 * sideThickness,
                depth: sideThickness,
                thickness: sideHeight * 0.6,
                material: 'plywood',
                position: { x: sideThickness, y: depth - sideThickness, z: 0 },
                fill: 'rgba(120, 120, 120, 0.06)',
              },
            },
          ] : [],
        },
      ],
    };
  },
  generate(params) {
    return materializeTemplateDefinition(this.buildDefinition(params));
  },
};

export default deskTemplate;
