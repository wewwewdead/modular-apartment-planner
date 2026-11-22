// Fixtures for bending one piece of a punch line (docs/sketch-studio-piece-pick.md
// §3, §5.7): the lip tray, shared by the unit and DOM tests.
import { emptyModel } from './model.js';

// The lip tray (flat mm, SPCC t 1.2): a column 400 × 744; on its right side a
// lip 25 × 82 (y 25 – 107), a notch 4 wide cut 3 mm into the column, a flange
// 128 × 522 (y 111 – 633), a notch, a lip (y 637 – 719).
export const LIP_TRAY = [
  [0, 0],
  [400, 0],
  [400, 25],
  [425, 25],
  [425, 107],
  [397, 107],
  [397, 111],
  [528, 111],
  [528, 633],
  [397, 633],
  [397, 637],
  [425, 637],
  [425, 719],
  [400, 719],
  [400, 744],
  [0, 744],
];
// The same tray with notches that stop 3 mm short of the line x = 410 (x = 413): one piece.
export const ONE_PIECE_TRAY = LIP_TRAY.map(([x, y]) => [x === 397 ? 413 : x, y]);

// Its gauge edges (pressBrake.js gaugeEdges, by index): the first lip's own
// edge, the flange's and the far lip's. L 15 off a lip and L 118 off the
// flange put the line on x = 410.
export const FIRST_LIP_EDGE = 3;
export const FLANGE_EDGE = 7;
export const FAR_LIP_EDGE = 11;

/** The model: the tray (or `points`) as a sheet-metal part with `bends`, one instance `i`. */
export const lipTrayModel = (bends = [], points = LIP_TRAY) => ({
  ...emptyModel(),
  sketches: [
    { id: 's', name: 'Blank', plane: 'XY', profile: { type: 'polygon', points }, primitives: [], constrained: false },
  ],
  parts: [
    {
      id: 'p',
      name: 'Lip tray',
      material: 'SPCC cold-rolled steel',
      features: [
        {
          id: 'sm',
          type: 'sheetmetal',
          sketchId: 's',
          thickness: 1.2,
          stock: 'spcc',
          kFactor: null,
          base: null,
          marks: [],
          bends,
        },
      ],
    },
  ],
  instances: [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
});
