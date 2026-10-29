import { emptyModel } from './model.js';

const param = (name, value) => ({ id: `parameter-${name}`, name, value });
const instance = (id, partId, position = [0, 0, 0], rotation = [0, 0, 0]) => ({
  id,
  partId,
  name: id,
  position,
  rotation,
  visible: true,
});
const board = (id, name, width, depth, height) => ({
  id,
  name,
  material: 'Plywood',
  grain: 'X',
  features: [{ id: `${id}-base`, type: 'box', width, depth, height }],
});

// Which example each parameter preset's starter model reuses, and how its
// names map in (the Table preset drives the desk's leg size by `legSize`).
export const PRESET_EXAMPLES = {
  table: { kind: 'desk', options: { legSize: '=legSize' } },
  'steel-frame': { kind: 'table', options: {} },
};

// `options.legSize`: the desk's square leg size and hole inset, 60 mm by
// default or an expression such as '=legSize'.
export function furnitureExample(kind = 'table', options = {}) {
  const leg = options.legSize ?? 60;
  const less = (base, amount) => `=${base}-${typeof amount === 'number' ? amount : amount.replace(/^=/, '')}`;
  const model = emptyModel();
  model.parameters = [
    param('width', 1200),
    param('depth', 650),
    param('height', 750),
    param('thickness', 24),
    param('section', 40),
    param('wall', 2),
    param('weldGap', 1),
  ];
  const top = board('top', 'Desktop', '=width', '=depth', '=thickness');
  top.features.push(
    ...[leg, less('width', leg)].flatMap((x, a) =>
      [leg, less('depth', leg)].map((y, b) => ({
        id: `top-hole-${a}-${b}`,
        type: 'hole',
        diameter: 6,
        depth: '=thickness',
        position: [x, y, 0],
      })),
    ),
  );
  model.parts = [top];
  model.instances = [instance('desktop', 'top', [0, 0, '=height-thickness'])];
  if (kind === 'desk') {
    if (typeof leg === 'string') model.parameters.push(param(leg.replace(/^=/, ''), 60));
    model.parts.push(
      board('leg', 'Wood leg', leg, leg, '=height-thickness'),
      board(
        'apron',
        'Long apron',
        typeof leg === 'number' ? `=width-${2 * leg}` : `=width-2*${leg.replace(/^=/, '')}`,
        18,
        100,
      ),
    );
    for (const [a, x] of [0, less('width', leg)].entries())
      for (const [b, y] of [0, less('depth', leg)].entries())
        model.instances.push(instance(`leg-${a}-${b}`, 'leg', [x, y, 0]));
    model.instances.push(
      instance('apron-front', 'apron', [leg, 20, '=height-thickness-100']),
      instance('apron-rear', 'apron', [leg, '=depth-38', '=height-thickness-100']),
    );
  } else if (kind === 'bookshelf') {
    model.parameters.find((p) => p.name === 'height').value = 1800;
    model.parameters.find((p) => p.name === 'depth').value = 350;
    model.parameters.push(param('shelfSpacing', '= (height - thickness) / 4'));
    model.parts = [
      board('side', 'Side panel', '=thickness', '=depth', '=height'),
      board('shelf', 'Shelf', '=width-thickness*2', '=depth', '=thickness'),
    ];
    model.instances = [instance('left-side', 'side'), instance('right-side', 'side', ['=width-thickness', 0, 0])];
    for (let i = 0; i < 5; i++)
      model.instances.push(instance(`shelf-${i}`, 'shelf', ['=thickness', 0, `=shelfSpacing*${i}`]));
    model.parts[0].features.push(
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `shelf-pin-${i}`,
        type: 'hole',
        diameter: 5,
        depth: '=thickness',
        position: [0, 40, `=shelfSpacing*${i + 1}-8`],
        direction: [1, 0, 0],
      })),
    );
  } else {
    const section =
      kind === 'pipe'
        ? { type: 'pipe', diameter: '=section', wall: '=wall' }
        : { type: 'tube', width: '=section', height: '=section', wall: '=wall' };
    const member = (id, name, end) => ({
      id,
      name,
      material: 'Mild steel',
      features: [
        {
          id: `${id}-member`,
          type: 'member',
          section,
          start: [0, 0, 0],
          end,
          gapStart: '=weldGap',
          gapEnd: '=weldGap',
          angleStart: 0,
          angleEnd: 0,
        },
      ],
    });
    model.parts.push(
      member('leg', 'Frame leg', [0, 0, '=height-thickness']),
      member('rail-x', 'Long rail', ['=width-section*2', 0, 0]),
      member('rail-y', 'End rail', [0, '=depth-section*2', 0]),
    );
    for (const [a, x] of ['=section/2', '=width-section/2'].entries())
      for (const [b, y] of ['=section/2', '=depth-section/2'].entries())
        model.instances.push(instance(`leg-${a}-${b}`, 'leg', [x, y, 0]));
    model.instances.push(
      instance('rail-front', 'rail-x', ['=section', '=section/2', '=height-thickness-section/2']),
      instance('rail-rear', 'rail-x', ['=section', '=depth-section/2', '=height-thickness-section/2']),
      instance('rail-left', 'rail-y', ['=section/2', '=section', '=height-thickness-section/2']),
      instance('rail-right', 'rail-y', ['=width-section/2', '=section', '=height-thickness-section/2']),
    );
    model.connections.push({
      id: 'weld-1',
      type: 'weld',
      from: 'rail-front',
      to: 'leg-0-0',
      location: ['=section', '=section/2', '=height-thickness-section/2'],
      note: 'Fillet weld at rail-to-leg joint; weld size and procedure to shop specification.',
    });
    if (kind === 'pipe') {
      model.sketches.push(
        {
          id: 'brace-path',
          name: 'Bent brace centerline',
          plane: 'XZ',
          profile: {
            type: 'path',
            start: [0, 0],
            closed: false,
            segments: [
              { type: 'line', end: [0, 100] },
              { type: 'arc', mid: [14.64466094, 135.35533906], end: [50, 150] },
              { type: 'line', end: [350, 150] },
              { type: 'arc', mid: [385.35533906, 135.35533906], end: [400, 100] },
              { type: 'line', end: [400, 0] },
            ],
          },
        },
        {
          id: 'brace-section',
          name: 'Hollow round section',
          profile: { type: 'circle', radius: 12.5, holes: [{ type: 'circle', radius: 10.5 }] },
        },
      );
      model.parts.push({
        id: 'bent-brace',
        name: 'Bent tube brace — see solid detail',
        material: 'Mild steel tube OD25 wall2',
        features: [{ id: 'brace-sweep', type: 'sweep', sketchId: 'brace-path', profileId: 'brace-section' }],
      });
      model.instances.push(instance('brace-instance', 'bent-brace', [400, 325, 100]));
    }
  }
  model.sheets[0].title =
    kind === 'bookshelf'
      ? 'Bookshelf assembly'
      : kind === 'desk'
        ? 'Wooden desk'
        : kind === 'pipe'
          ? 'Round tube table'
          : 'Welded square tube table';
  return model;
}

export function bracketExample() {
  const model = emptyModel();
  model.sketches = [
    {
      id: 'bracket-profile',
      name: 'L profile',
      plane: 'XZ',
      profile: {
        type: 'polygon',
        points: [
          [0, 0],
          [80, 0],
          [80, 8],
          [8, 8],
          [8, 70],
          [0, 70],
        ],
      },
      constrained: false,
      primitives: [],
    },
  ];
  model.parts = [
    {
      id: 'bracket',
      name: 'Mechanical bracket',
      material: 'Steel',
      features: [
        { id: 'extrusion', type: 'extrude', sketchId: 'bracket-profile', length: 50 },
        { id: 'mount-hole', type: 'hole', diameter: 10, depth: 8, position: [55, -25, 0] },
        { id: 'upright-hole', type: 'hole', diameter: 10, depth: 8, position: [0, -25, 45], direction: [1, 0, 0] },
        { id: 'edge-break', type: 'fillet', radius: 1, reference: { plane: 'XZ', offset: 0, expectedCount: 6 } },
      ],
    },
  ];
  model.instances = [instance('bracket-1', 'bracket')];
  model.sheets[0].title = 'Bracket machining details';
  model.sheets[0].scale = 0.5;
  return model;
}
