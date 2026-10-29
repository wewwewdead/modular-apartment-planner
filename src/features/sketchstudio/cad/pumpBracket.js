import { emptyModel } from './model.js';

// A configurable interpretation of the supplied photograph, not a recovered DWG.
// Unreadable manufacturing details are explicitly called out on the sheets.
export function pumpBracketExample() {
  const model = emptyModel();
  model.parameters = Object.entries({
    bracketLength: 166,
    bracketHeight: 52.5,
    sheetThickness: 1.5,
    holePitch: 30,
    firstHole: 23,
    holeHeight: 26.5,
    openingDiameter: 25,
    flangeDepth: 8,
    standoffLength: 31.1,
    standoffDiameter: 6,
  }).map(([name, value]) => ({ id: `pump-${name}`, name, value }));
  model.sketches = [
    {
      id: 'pump-section',
      name: 'Folded channel section (square bends)',
      plane: 'YZ',
      profile: {
        type: 'polygon',
        points: [
          [0, 0],
          ['=flangeDepth', 0],
          ['=flangeDepth', '=sheetThickness'],
          ['=sheetThickness', '=sheetThickness'],
          ['=sheetThickness', '=bracketHeight-sheetThickness'],
          ['=flangeDepth', '=bracketHeight-sheetThickness'],
          ['=flangeDepth', '=bracketHeight'],
          [0, '=bracketHeight'],
        ],
      },
      primitives: [],
      constrained: false,
    },
  ];
  const openingIds = Array.from({ length: 5 }, (_, i) => `pump-opening-${i + 1}`);
  const holes = openingIds.map((id, i) => ({
    id,
    type: 'hole',
    diameter: '=openingDiameter',
    depth: '=sheetThickness',
    throughAll: true,
    position: [`=firstHole+holePitch*${i}`, 0, '=holeHeight'],
    direction: [0, 1, 0],
  }));
  const mounting = [
    [38, 8.5],
    [128, 8.5],
    [38, 38.5],
    [128, 38.5],
    [6, 8.5],
    ['=bracketLength-6', 8.5],
  ];
  model.parts = [
    {
      id: 'pump-bracket',
      name: 'Pump bracket — reference study',
      material: 'Aluminium (grade to confirm)',
      features: [
        { id: 'pump-folded-body', type: 'extrude', sketchId: 'pump-section', length: '=bracketLength' },
        ...holes,
        ...mounting.map(([x, z], i) => ({
          id: `pump-mount-${i}`,
          type: 'hole',
          diameter: 4,
          depth: '=sheetThickness',
          throughAll: true,
          position: [x, 0, z],
          direction: [0, 1, 0],
        })),
      ],
    },
    {
      id: 'pump-standoff',
      name: 'M4 standoff — simplified envelope',
      material: 'Hardware (specification to confirm)',
      features: [
        { id: 'pump-standoff-body', type: 'cylinder', radius: '=standoffDiameter/2', length: '=standoffLength' },
        {
          id: 'pump-standoff-bore',
          type: 'hole',
          diameter: 4,
          depth: '=standoffLength',
          throughAll: true,
          position: [0, 0, 0],
        },
      ],
    },
  ];
  model.instances = [
    {
      id: 'pump-body-instance',
      partId: 'pump-bracket',
      name: 'Pump bracket',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      visible: true,
    },
    ...mounting.slice(0, 4).map(([x, z], i) => ({
      id: `pump-standoff-instance-${i}`,
      partId: 'pump-standoff',
      name: `M4 × 31.1 standoff ${i + 1}`,
      position: [x, 0, z],
      rotation: [90, 0, 0],
      visible: true,
    })),
  ];
  const base = {
    layout: 'engineering',
    size: 'A3',
    scale: 1,
    units: 'mm',
    revision: 'DRAFT',
    tolerance: 'To confirm',
    material: 'Aluminium / t=1.5',
    drawingNumber: 'PUMP-BRKT-STUDY',
    drawnBy: '',
    date: '',
    centerlines: true,
    hiddenLines: true,
    views: ['top', { name: 'Isometric', view: 'isometric', scale: 0.5 }, 'front', 'right'],
  };
  model.sheets = [
    {
      ...base,
      id: 'pump-assembly-sheet',
      instanceIds: model.instances.map((i) => i.id),
      title: 'Pump bracket assembly — reference study',
      notes:
        'REFERENCE STUDY — verify against original drawing before manufacture.\n166 length; 52.5 height; t=1.5; 30 hole pitch; 4 × M4 × 31.1 standoffs.\nAssumed: Ø25 openings, 8 flange depth, Ø6 standoff body, mount locations.\nSquare bends and plain bores are simplified. Tabs, PEM nuts and threads omitted.',
      annotations: [],
    },
    {
      ...base,
      id: 'pump-detail-sheet',
      title: 'Pump bracket — dimensioned part',
      partId: 'pump-bracket',
      notes:
        'REFERENCE STUDY — dimensions require confirmation from the source DWG.\nOpening diameter Ø25 and flange depth 8 are assumptions.\nMounting holes Ø4 are placeholders; confirm PEM installation hole sizes.\nDeburr edges. Confirm bend radii, tabs, finish and tolerances before manufacture.',
      annotations: [
        {
          id: 'pump-opening-chain',
          type: 'hole-chain',
          view: 'front',
          partId: 'pump-bracket',
          featureIds: openingIds,
          axis: 'X',
          fromEdge: true,
          offset: 10,
        },
        {
          id: 'pump-opening-callout',
          type: 'hole-callout',
          view: 'front',
          partId: 'pump-bracket',
          featureIds: openingIds,
          dx: 7,
          dy: -23,
        },
      ],
    },
  ];
  return model;
}
