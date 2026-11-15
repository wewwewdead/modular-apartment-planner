// Sheet metal in the cut list, the CSV and the flat-pattern files
// (docs/sketch-studio-fab-shop.md §9 SM-1 item 7). A list without a
// sheet-metal row keeps exactly the columns and files it always had.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { buildCutList, cutListCsv } from './fabrication.js';
import { drawingDxf } from './exports.js';
import { profileSvg } from './drawings.js';

const OLD_HEADER =
  '"Part ID","Part","Material","Quantity","Stock section (mm)","Centerline mm","Long point mm","Short point mm","Start angle from square deg","End angle from square deg","Start gap mm","End gap mm","Blank length incl allowance mm","Width mm","Depth mm","Height mm","Grain","Notes"';

const model = (withSheet) => ({
  ...emptyModel(),
  sketches: [
    {
      id: 's',
      name: 'Blank',
      plane: 'XY',
      profile: {
        type: 'rectangle',
        width: 100,
        height: 60,
        origin: [0, 0],
        holes: [{ type: 'circle', radius: 4, center: [50, 30] }],
      },
    },
  ],
  parts: [
    {
      id: 'plate',
      name: 'Plate',
      material: 'Plywood',
      features: [{ id: 'b', type: 'box', width: 10, depth: 10, height: 2 }],
    },
    ...(withSheet
      ? [
          {
            id: 'tray',
            name: 'Tray',
            material: 'SPCC cold-rolled steel',
            features: [
              {
                id: 'sm',
                type: 'sheetmetal',
                sketchId: 's',
                thickness: 1.5,
                stock: 'spcc',
                bends: [
                  { id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' },
                  { id: 'b2', a: [80, 0], b: [80, 60], angle: 90, direction: 'up' },
                ],
              },
            ],
          },
        ]
      : []),
  ],
  instances: [
    { id: 'p1', partId: 'plate', position: [0, 0, 0], rotation: [0, 0, 0] },
    ...(withSheet ? [{ id: 't1', partId: 'tray', position: [0, 0, 0], rotation: [0, 0, 0] }] : []),
  ],
});
const snapshot = {
  parts: [
    {
      id: 'plate',
      bounds: [
        [0, 0, 0],
        [10, 10, 2],
      ],
      volume: 200,
    },
    {
      id: 'tray',
      bounds: [
        [18, 0, 0],
        [82, 60, 20],
      ],
      volume: 8000,
    },
  ],
};

describe('sheet metal in the cut list', () => {
  it('lists the blank, thickness, stock, bends and cut length; the CSV gains trailing columns', () => {
    const rows = buildCutList(model(true), snapshot);
    const tray = rows.find((r) => r.partId === 'tray');
    expect(tray.sheet).toMatchObject({ width: 100, height: 60, thickness: 1.5, stock: 'spcc', bends: 2, pierces: 2 });
    expect(tray.sheet.cutLength).toBeCloseTo(320 + 8 * Math.PI, 9);
    expect(tray.sheet.stockName).toBe('SPCC cold-rolled steel');
    expect(rows.find((r) => r.partId === 'plate').sheet).toBeUndefined();
    const lines = cutListCsv(rows).split('\r\n');
    expect(lines[0]).toBe(
      `${OLD_HEADER},"Blank width mm","Blank height mm","Sheet thickness mm","Sheet stock","Bend count","Cut length mm"`,
    );
    expect(lines[2].endsWith(`"100","60","1.5","SPCC cold-rolled steel","2","${320 + 8 * Math.PI}"`)).toBe(true);
    // The plain plate's row has empty sheet cells.
    expect(lines[1].endsWith(',"","","","","",""')).toBe(true);
  });
  it('keeps the old columns exactly when no part is sheet metal', () => {
    const lines = cutListCsv(buildCutList(model(false), snapshot)).split('\r\n');
    expect(lines[0]).toBe(OLD_HEADER);
    expect(lines).toHaveLength(2);
  });
});

describe('the flat pattern files', () => {
  const paths = ['M 0 0 L 100 0 L 100 60 L 0 60 L 0 0 Z'];
  const bendLines = [{ a: [20, 0], b: [20, 60], angle: 90, direction: 'up', radius: 1.6 }];
  it('writes one BEND LINE per zone in the polylines’ frame, and nothing more without bends', () => {
    const plain = drawingDxf(paths);
    expect(plain).not.toContain('BEND');
    expect(drawingDxf(paths, {})).toBe(plain);
    const bent = drawingDxf(paths, { bendLines });
    expect(
      bent.replace(
        '\n0\nLINE\n100\nAcDbEntity\n8\nBEND\n100\nAcDbLine\n10\n20\n20\n0\n30\n0\n11\n20\n21\n-60\n31\n0',
        '',
      ),
    ).toBe(plain);
  });
  it('dashes the bend lines in the cutting SVG and leaves a plain profile unchanged', () => {
    const profile = { viewBox: [0, 0, 100, 60], visible: paths };
    expect(profileSvg(profile)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60"><g fill="none" stroke="black" stroke-width="0.1"><path d="M 0 0 L 100 0 L 100 60 L 0 60 L 0 0 Z"/></g></svg>',
    );
    const svg = profileSvg({ ...profile, bendLines });
    expect(svg).toContain('stroke-dasharray="2 1"');
    expect(svg).toContain('<line x1="20" y1="0" x2="20" y2="60"><title>UP 90° R1.6</title></line>');
  });
});
