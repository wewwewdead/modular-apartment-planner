import { emptyModel } from './model.js';

export function rearCoverExample() {
  const model = emptyModel();
  model.parameters = Object.entries({
    coverWidth: 350,
    coverHeight: 376,
    openingWidth: 245,
    openingHeight: 337,
    sheetThickness: 1.2,
    returnDepth: 16.2,
    mountingDiameter: 6.6,
  }).map(([name, value]) => ({ id: `cover-${name}`, name, value }));
  const opening = {
    type: 'rectangle',
    width: '=openingWidth',
    height: '=openingHeight',
    origin: ['=(coverWidth-openingWidth)/2', '=(coverHeight-openingHeight)/2'],
  };
  model.sketches = [
    {
      id: 'cover-outline',
      name: 'Rear cover frame',
      plane: 'XY',
      profile: { type: 'rectangle', width: '=coverWidth', height: '=coverHeight', holes: [opening] },
    },
    {
      id: 'cover-return',
      name: 'Opening return — square bend approximation',
      plane: 'XY',
      origin: [0, 0, '=sheetThickness'],
      profile: {
        type: 'rectangle',
        width: '=openingWidth+2*sheetThickness',
        height: '=openingHeight+2*sheetThickness',
        origin: ['=(coverWidth-openingWidth)/2-sheetThickness', '=(coverHeight-openingHeight)/2-sheetThickness'],
        holes: [opening],
      },
    },
  ];
  const centers = [
    ...[20, '=coverWidth/2', '=coverWidth-20'].flatMap((x) => [
      [x, 8],
      [x, '=coverHeight-8'],
    ]),
    ...[40, 138.7, 237.3, '=coverHeight-40'].flatMap((y) => [
      [20, y],
      ['=coverWidth-20', y],
    ]),
  ];
  model.parts = [
    {
      id: 'rear-cover',
      name: 'Rear cover — reference study',
      material: 'SPCC, 1.2 mm (reference)',
      features: [
        { id: 'cover-plate', type: 'extrude', sketchId: 'cover-outline', length: '=sheetThickness' },
        { id: 'cover-lip', type: 'extrude', sketchId: 'cover-return', length: '=returnDepth-sheetThickness' },
        ...centers.map(([x, y], i) => ({
          id: `cover-hole-${i}`,
          type: 'hole',
          diameter: '=mountingDiameter',
          throughAll: true,
          depth: '=sheetThickness',
          position: [x, y, '=sheetThickness'],
          direction: [0, 0, -1],
        })),
      ],
    },
  ];
  model.instances = [{ id: 'rear-cover-instance', partId: 'rear-cover', position: [0, 0, 0], rotation: [0, 0, 0] }];
  model.sheets = [
    {
      id: 'rear-cover-sheet',
      partId: 'rear-cover',
      title: 'Rear cover — reference study',
      layout: 'engineering',
      size: 'A3',
      units: 'mm',
      scale: 0.1,
      revision: 'STUDY',
      tolerance: 'Not specified',
      material: 'SPCC 1.2 mm',
      views: ['top', 'isometric', 'front', 'right'],
      annotations: [],
      notes:
        'Photo interpretation only. 350 × 376, opening 245 × 337, depth 16.2, thickness 1.2 and Ø6.6 read from reference. Opening centered; 53.70 and 20.70 offsets need clarification (vertical dimensions conflict). Hole centers are assumed. Corner radii and formed bend radii omitted; square return is schematic. Confirm source DWG before fabrication.',
    },
  ];
  return model;
}
