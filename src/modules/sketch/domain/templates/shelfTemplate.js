import { materializeTemplateDefinition } from './templateHelpers';

const shelfTemplate = {
  type: 'shelf',
  label: 'Shelf Unit',
  description: 'Tall shelving with adjustable shelf count',
  parameters: [
    { key: 'width', label: 'Width', type: 'number', default: 800, min: 200, max: 3000, step: 10, suffix: 'mm' },
    { key: 'depth', label: 'Depth', type: 'number', default: 300, min: 100, max: 1000, step: 10, suffix: 'mm' },
    { key: 'height', label: 'Height', type: 'number', default: 1800, min: 400, max: 3000, step: 10, suffix: 'mm' },
    { key: 'sideThickness', label: 'Side Thickness', type: 'number', default: 18, min: 6, max: 50, step: 1, suffix: 'mm' },
    { key: 'shelfThickness', label: 'Shelf Thickness', type: 'number', default: 18, min: 6, max: 50, step: 1, suffix: 'mm' },
    { key: 'shelfCount', label: 'Shelves', type: 'integer', default: 4, min: 1, max: 15, step: 1, suffix: '' },
    { key: 'hasBack', label: 'Back Panel', type: 'boolean', default: true },
  ],
  buildDefinition(params) {
    const { width, depth, height, sideThickness, shelfThickness, shelfCount, hasBack } = params;
    const innerWidth = width - 2 * sideThickness;
    const totalShelves = shelfCount + 2;
    const spacing = height / (totalShelves - 1);
    const shelfParts = [];

    for (let i = 0; i < totalShelves; i += 1) {
      const z = spacing * i;
      const isTopOrBottom = i === 0 || i === totalShelves - 1;
      shelfParts.push({
        type: 'panel',
        role: isTopOrBottom ? (i === 0 ? 'bottom' : 'top') : `shelf_${i}`,
        name: isTopOrBottom ? (i === 0 ? 'Bottom' : 'Top') : `Shelf ${i}`,
        props: {
          width: innerWidth,
          depth,
          thickness: shelfThickness,
          material: 'plywood',
          position: { x: sideThickness, y: 0, z },
        },
      });
    }

    return {
      name: `Shelf ${width}×${height}`,
      summary: 'Shelving unit with fixed side panels and evenly spaced shelf panels',
      description: 'Shelf unit driven by overall height, width, depth, thickness, and shelf count.',
      dimensions: { width, depth, height },
      assemblies: [
        {
          key: 'case',
          name: 'Case',
          sortIndex: 0,
          parts: [
            {
              type: 'panel',
              role: 'left_side',
              name: 'Left Side',
              props: {
                width: sideThickness,
                depth,
                thickness: height,
                material: 'plywood',
                position: { x: 0, y: 0, z: 0 },
              },
            },
            {
              type: 'panel',
              role: 'right_side',
              name: 'Right Side',
              props: {
                width: sideThickness,
                depth,
                thickness: height,
                material: 'plywood',
                position: { x: width - sideThickness, y: 0, z: 0 },
              },
            },
          ],
        },
        {
          key: 'shelves',
          name: 'Shelves',
          sortIndex: 1,
          parts: shelfParts,
        },
        {
          key: 'back',
          name: 'Back',
          sortIndex: 2,
          parts: hasBack ? [
            {
              type: 'panel',
              role: 'back',
              name: 'Back',
              props: {
                width,
                depth: Math.max(6, sideThickness / 2),
                thickness: height,
                material: 'plywood',
                position: { x: 0, y: depth - Math.max(6, sideThickness / 2), z: 0 },
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

export default shelfTemplate;
