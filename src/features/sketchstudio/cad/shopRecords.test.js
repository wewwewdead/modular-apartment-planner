// The shop's records in the reports (docs/sketch-studio-fab-shop.md §9 SM-3):
// rows for each finish and print, trailing the cut list CSV only when
// there are any, so a model without them writes exactly what it always did.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { cutListCsv } from './fabrication.js';
import { shopRecordRows } from './shopRecords.js';

const boxMesh = ([x0, y0, z0], [x1, y1, z1]) => ({
  vertices: [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ].flat(),
  triangles: [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7,
  ],
});
const model = (extra = {}) => ({
  ...emptyModel(),
  parts: [{ id: 'p', name: 'Plate', features: [{ id: 'f', type: 'box', width: 100, depth: 60, height: 2 }] }],
  instances: [
    { id: 'a', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'b', partId: 'p', name: 'Lid', position: [0, 0, 2], rotation: [0, 0, 0] },
  ],
  ...extra,
});
const snapshot = {
  parameters: {},
  parts: [
    {
      id: 'p',
      bounds: [
        [0, 0, 0],
        [100, 60, 2],
      ],
    },
  ],
  instances: [
    { id: 'a', partId: 'p', placement: [], mesh: boxMesh([0, 0, 0], [100, 60, 2]) },
    { id: 'b', partId: 'p', placement: [{ translation: [0, 0, 2] }], mesh: boxMesh([0, 0, 2], [100, 60, 4]) },
  ],
};
const rows = [
  {
    partId: 'p',
    name: 'Plate',
    material: 'Steel',
    quantity: 2,
    section: '',
    member: null,
    blankLength: null,
    dimensions: [100, 60, 2],
    grain: null,
    note: '',
  },
];

describe('shopRecordRows', () => {
  it('has no rows for a model without finishes or prints', () => {
    expect(shopRecordRows(model(), snapshot)).toBeNull();
  });
  it('a finish: area and powder; a print', () => {
    const shop = shopRecordRows(
      model({
        finishes: [
          {
            id: 'f',
            instanceId: 'a',
            kind: 'powder',
            name: 'RAL 9005 Jet black',
            colour: '#0e0e10',
            gloss: 'satin',
            thickness: 70,
          },
        ],
        prints: [
          {
            id: 't',
            instanceId: 'a',
            origin: [50, 30, 2],
            x: [1, 0, 0],
            normal: [0, 0, 1],
            width: 30,
            height: 10,
            rotation: 0,
            method: 'silk',
            kind: 'text',
            text: 'ACME',
            font: 'sans-serif',
            colour: '#ffffff',
          },
        ],
      }),
      snapshot,
    );
    expect(shop).not.toHaveProperty('welds');
    const area = (2 * 6000 + 2 * 200 + 2 * 120) / 1e6;
    expect(shop.finishes[0]).toMatchObject({ parts: 'Plate', name: 'RAL 9005 Jet black', gloss: 'Satin' });
    // Rounded to 0.0001 m² in the rows.
    expect(shop.finishes[0].area).toBeCloseTo(area, 4);
    expect(shop.finishes[0].mass).toBeCloseTo(area / ((1000 / (1.5 * 70)) * 0.6), 4);
    expect(shop.prints).toEqual([
      {
        id: 't',
        parts: 'Plate',
        method: 'Silk-screen',
        kind: 'text',
        artwork: 'ACME',
        colour: '#ffffff',
        width: 30,
        height: 10,
      },
    ]);

    // The CSV: the parts as always, then a blank line and the records.
    const plain = cutListCsv(rows);
    const csv = cutListCsv(rows, shop);
    expect(csv.startsWith(`${plain}\r\n""\r\n"Shop record","ID","Parts"`)).toBe(true);
    const lines = csv.split('\r\n');
    // No weld rows and no weld-only columns (seam length, weld time, …).
    expect(lines.at(-3)).toBe(
      '"Shop record","ID","Parts","Kind","Process / method","Finish","Colour","Gloss","Film µm","Painted area m2","Powder kg","Artwork","Artwork width mm","Artwork height mm"',
    );
    expect(lines.at(-2)).toMatch(/^"Finish","f","Plate","powder","","RAL 9005 Jet black","#0e0e10","Satin","70",/);
    expect(lines.at(-1)).toMatch(/^"Print","t","Plate","text","Silk-screen",.*"ACME","30","10"$/);
  });
  it('writes the cut list byte for byte as before when there are no records', () => {
    expect(cutListCsv(rows, null)).toBe(cutListCsv(rows));
    expect(cutListCsv(rows, { finishes: [], prints: [] })).toBe(cutListCsv(rows));
    expect(cutListCsv(rows, shopRecordRows(model(), snapshot))).toBe(cutListCsv(rows));
  });
});
