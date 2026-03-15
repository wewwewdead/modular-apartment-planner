import { materializeTemplateDefinition } from './templateHelpers';

const SIDE_PLANE_DEF = {
  normal: { x: 1, y: 0, z: 0 },
  uAxis: { x: 0, y: 1, z: 0 },
  vAxis: { x: 0, y: 0, z: 1 },
  up: { x: 0, y: 0, z: 1 },
};

function buildRibProfile(beam, hullHeight) {
  return [
    { u: 0, v: 0 },
    { u: beam * 0.1, v: hullHeight * 0.16 },
    { u: beam * 0.28, v: hullHeight * 0.52 },
    { u: beam * 0.5, v: hullHeight },
    { u: beam * 0.72, v: hullHeight * 0.52 },
    { u: beam * 0.9, v: hullHeight * 0.16 },
    { u: beam, v: 0 },
    { u: beam * 0.74, v: hullHeight * 0.06 },
    { u: beam * 0.5, v: hullHeight * 0.18 },
    { u: beam * 0.26, v: hullHeight * 0.06 },
  ];
}

const boatTemplate = {
  type: 'boat',
  label: 'Boat Frame',
  description: 'Starter hull frame with keel, ribs, shell sides, and benches.',
  parameters: [
    { key: 'length', label: 'Length', type: 'number', default: 3000, min: 1600, max: 8000, step: 10, suffix: 'mm' },
    { key: 'beam', label: 'Beam', type: 'number', default: 1100, min: 500, max: 3000, step: 10, suffix: 'mm' },
    { key: 'hullHeight', label: 'Hull Height', type: 'number', default: 650, min: 250, max: 1600, step: 10, suffix: 'mm' },
    { key: 'ribCount', label: 'Ribs', type: 'integer', default: 5, min: 2, max: 18, step: 1, suffix: '' },
    { key: 'ribThickness', label: 'Rib Thickness', type: 'number', default: 40, min: 10, max: 120, step: 1, suffix: 'mm' },
    { key: 'hullThickness', label: 'Hull Thickness', type: 'number', default: 24, min: 6, max: 60, step: 1, suffix: 'mm' },
    { key: 'seatCount', label: 'Bench Seats', type: 'integer', default: 2, min: 0, max: 6, step: 1, suffix: '' },
  ],
  buildDefinition(params) {
    const {
      length,
      beam,
      hullHeight,
      ribCount,
      ribThickness,
      hullThickness,
      seatCount,
    } = params;
    const ribSpacing = length / (ribCount + 1);
    const benchSpacing = seatCount > 0 ? length / (seatCount + 1) : 0;
    const benchParts = [];
    const ribParts = [];

    for (let index = 0; index < ribCount; index += 1) {
      ribParts.push({
        type: 'solid',
        role: `rib_${index + 1}`,
        name: `Rib ${index + 1}`,
        props: {
          material: 'hardwood',
          plane: SIDE_PLANE_DEF,
          extrusionDepth: ribThickness,
          profilePoints: buildRibProfile(beam, hullHeight),
          position: {
            x: ribSpacing * (index + 1),
            y: 0,
            z: 0,
          },
          fill: 'rgba(139, 105, 20, 0.08)',
        },
      });
    }

    for (let index = 0; index < seatCount; index += 1) {
      benchParts.push({
        type: 'panel',
        role: `bench_${index + 1}`,
        name: `Bench ${index + 1}`,
        props: {
          width: 260,
          depth: beam * 0.62,
          thickness: 35,
          material: 'hardwood',
          position: {
            x: benchSpacing * (index + 1) - 130,
            y: beam * 0.19,
            z: hullHeight * 0.44,
          },
        },
      });
    }

    return {
      name: `Boat ${length}×${beam}`,
      summary: 'Starter small-boat assembly with modular ribs, keel, shell sides, and benches.',
      description: 'Use this as a hull frame starter, then duplicate, resize, or replace ribs and shell modules with custom geometry.',
      dimensions: { width: length, depth: beam, height: hullHeight },
      assemblies: [
        {
          key: 'keel',
          name: 'Keel',
          sortIndex: 0,
          parts: [
            {
              type: 'frame',
              role: 'keel_beam',
              name: 'Keel Beam',
              props: {
                length: length - 80,
                width: 60,
                height: 120,
                axis: 'x',
                material: 'hardwood',
                position: {
                  x: 40,
                  y: beam / 2 - 30,
                  z: 0,
                },
              },
            },
          ],
        },
        {
          key: 'ribs',
          name: 'Ribs',
          sortIndex: 1,
          parts: ribParts,
        },
        {
          key: 'shell',
          name: 'Shell',
          sortIndex: 2,
          parts: [
            {
              type: 'panel',
              role: 'port_side',
              name: 'Port Side',
              props: {
                width: length,
                depth: hullThickness,
                thickness: hullHeight * 0.72,
                material: 'plywood',
                position: { x: 0, y: 0, z: 0 },
                fill: 'rgba(70, 120, 160, 0.08)',
              },
            },
            {
              type: 'panel',
              role: 'starboard_side',
              name: 'Starboard Side',
              props: {
                width: length,
                depth: hullThickness,
                thickness: hullHeight * 0.72,
                material: 'plywood',
                position: { x: 0, y: beam - hullThickness, z: 0 },
                fill: 'rgba(70, 120, 160, 0.08)',
              },
            },
            {
              type: 'panel',
              role: 'transom',
              name: 'Transom',
              props: {
                width: hullThickness,
                depth: beam,
                thickness: hullHeight * 0.55,
                material: 'plywood',
                position: { x: length - hullThickness, y: 0, z: 0 },
              },
            },
          ],
        },
        {
          key: 'benches',
          name: 'Benches',
          sortIndex: 3,
          parts: benchParts,
        },
      ],
    };
  },
  generate(params) {
    return materializeTemplateDefinition(this.buildDefinition(params));
  },
};

export default boatTemplate;
