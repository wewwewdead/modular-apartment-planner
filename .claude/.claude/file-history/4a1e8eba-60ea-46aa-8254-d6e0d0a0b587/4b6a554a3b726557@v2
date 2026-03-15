import { materializeTemplateDefinition } from './templateHelpers';

const cabinetTemplate = {
  type: 'cabinet',
  label: 'Cabinet',
  description: 'Box with sides, shelves, optional doors and back',
  parameters: [
    { key: 'width', label: 'Width', type: 'number', default: 600, min: 200, max: 3000, step: 10, suffix: 'mm' },
    { key: 'depth', label: 'Depth', type: 'number', default: 400, min: 150, max: 1500, step: 10, suffix: 'mm' },
    { key: 'height', label: 'Height', type: 'number', default: 800, min: 200, max: 3000, step: 10, suffix: 'mm' },
    { key: 'panelThickness', label: 'Panel Thickness', type: 'number', default: 18, min: 6, max: 50, step: 1, suffix: 'mm' },
    { key: 'shelfCount', label: 'Shelves', type: 'integer', default: 2, min: 0, max: 10, step: 1, suffix: '' },
    { key: 'doorCount', label: 'Door Count', type: 'integer', default: 2, min: 0, max: 4, step: 1, suffix: '' },
    { key: 'toeKick', label: 'Toe Kick', type: 'number', default: 75, min: 0, max: 200, step: 5, suffix: 'mm' },
    { key: 'hasBack', label: 'Back Panel', type: 'boolean', default: true },
    { key: 'backPanelThickness', label: 'Back Thickness', type: 'number', default: 6, min: 3, max: 25, step: 1, suffix: 'mm' },
  ],
  buildDefinition(params) {
    const { width, depth, height, panelThickness, shelfCount, doorCount, toeKick, hasBack, backPanelThickness } = params;
    const innerWidth = width - 2 * panelThickness;
    const innerHeight = height - panelThickness - Math.max(toeKick, panelThickness);
    const bottomZ = Math.max(toeKick, panelThickness);
    const caseParts = [
      {
        type: 'panel',
        role: 'left_side',
        name: 'Left Side',
        props: {
          width: panelThickness,
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
          width: panelThickness,
          depth,
          thickness: height,
          material: 'plywood',
          position: { x: width - panelThickness, y: 0, z: 0 },
        },
      },
      {
        type: 'panel',
        role: 'bottom',
        name: 'Bottom',
        props: {
          width: innerWidth,
          depth,
          thickness: panelThickness,
          material: 'plywood',
          position: { x: panelThickness, y: 0, z: bottomZ },
        },
      },
      {
        type: 'panel',
        role: 'top',
        name: 'Top',
        props: {
          width: innerWidth,
          depth,
          thickness: panelThickness,
          material: 'plywood',
          position: { x: panelThickness, y: 0, z: height - panelThickness },
        },
      },
    ];

    const shelfParts = [];
    if (shelfCount > 0) {
      const spacing = innerHeight / (shelfCount + 1);
      for (let i = 1; i <= shelfCount; i += 1) {
        const z = bottomZ + panelThickness + spacing * i - panelThickness / 2;
        shelfParts.push({
          type: 'panel',
          role: `shelf_${i}`,
          name: `Shelf ${i}`,
          props: {
            width: innerWidth,
            depth,
            thickness: panelThickness,
            material: 'plywood',
            position: { x: panelThickness, y: 0, z },
          },
        });
      }
    }

    const doorParts = [];
    if (doorCount > 0) {
      const doorWidth = innerWidth / doorCount;
      const doorNames = ['Left Door', 'Right Door', 'Door 3', 'Door 4'];
      const doorRoles = ['left_door', 'right_door', 'door_3', 'door_4'];
      for (let i = 0; i < doorCount; i += 1) {
        doorParts.push({
          type: 'panel',
          role: doorRoles[i],
          name: doorCount === 1 ? 'Door' : doorNames[i],
          props: {
            width: doorWidth,
            depth: panelThickness,
            thickness: innerHeight,
            material: 'plywood',
            position: { x: panelThickness + i * doorWidth, y: 0, z: bottomZ + panelThickness },
            fill: 'rgba(184, 134, 11, 0.1)',
          },
        });
      }
    }

    const bpThick = hasBack ? backPanelThickness : 0;
    const backParts = hasBack ? [
      {
        type: 'panel',
        role: 'back',
        name: 'Back',
        props: {
          width,
          depth: bpThick,
          thickness: height,
          material: 'plywood',
          position: { x: 0, y: depth - bpThick, z: 0 },
          fill: 'rgba(120, 120, 120, 0.06)',
        },
      },
    ] : [];

    return {
      name: `Cabinet ${width}×${depth}×${height}`,
      summary: 'Casework cabinet with configurable shelves and enclosure options',
      description: 'Side panels, horizontal case parts, optional shelves, doors, and back panel.',
      dimensions: { width, depth, height },
      assemblies: [
        { key: 'case', name: 'Case', sortIndex: 0, parts: caseParts },
        { key: 'shelves', name: 'Shelves', sortIndex: 1, parts: shelfParts },
        { key: 'front', name: 'Front', sortIndex: 2, parts: doorParts },
        { key: 'back', name: 'Back', sortIndex: 3, parts: backParts },
      ],
    };
  },
  generate(params) {
    return materializeTemplateDefinition(this.buildDefinition(params));
  },
};

export default cabinetTemplate;
