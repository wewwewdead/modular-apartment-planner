import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createKernelSession } from './kernel.js';
import { pumpBracketExample } from './pumpBracket.js';
import { annotationText, sheetSvg } from './drawings.js';
import { sheetHoleFeatures } from './engineeringSheet.js';
import { emptyModel, validateReferences } from './model.js';
import { buildCutList } from './fabrication.js';
const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

describe('engineering drawing output', () => {
  it('builds the reference bracket and produces full-size, dimensioned multi-view sheets', () => {
    const model = pumpBracketExample(),
      session = createKernelSession(model);
    try {
      const snapshot = session.snapshot(),
        sheets = session.drawings();
      const body = snapshot.parts.find((p) => p.id === 'pump-bracket');
      expect(body.bounds[1][0] - body.bounds[0][0]).toBeCloseTo(166, 5);
      expect(body.bounds[1][2] - body.bounds[0][2]).toBeCloseTo(52.5, 5);
      for (const feature of model.parts[0].features.filter((f) => f.type === 'hole'))
        expect(body.features[feature.id].removedVolume).toBeGreaterThan(0);
      for (const sheet of sheets) {
        const svg = sheetSvg(sheet, model, snapshot);
        expect(svg).toContain('width="420mm"');
        expect(svg).toContain('DRAWING NO.');
        expect(svg).toContain('REFERENCE STUDY');
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      }
      const detail = sheets[1],
        front = detail.views.find((v) => v.view === 'front');
      const holes = sheetHoleFeatures(detail, model, snapshot, front).filter((h) => h.id.startsWith('pump-opening'));
      expect(holes).toHaveLength(5);
      expect(holes.map((h) => h.point[0])).toEqual([23, 53, 83, 113, 143]);
      expect(holes[0].point[1]).toBeCloseTo(-26.5);
      const svg = sheetSvg(detail, model, snapshot);
      expect(svg).toContain('5 × Ø25 THRU');
      expect(svg).toContain('>23</text>');
      expect(svg.match(/>30<\/text>/g)).toHaveLength(4);
      expect(svg).toContain('>166</text>');
    } finally {
      session.dispose();
    }
  });

  it('regenerates chain values, diameters and centers from parameters', () => {
    const model = pumpBracketExample();
    model.parameters.find((p) => p.name === 'holePitch').value = 28;
    model.parameters.find((p) => p.name === 'openingDiameter').value = 22;
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot(),
        detail = session.drawings()[1];
      const svg = sheetSvg(detail, model, snapshot);
      expect(svg).toContain('5 × Ø22 THRU');
      expect(svg.match(/>28<\/text>/g)).toHaveLength(4);
      expect(svg).not.toContain('5 × Ø25');
      const front = detail.views.find((v) => v.view === 'front');
      expect(sheetHoleFeatures(detail, model, snapshot, front).find((h) => h.id === 'pump-opening-5').point[0]).toBe(
        135,
      );
    } finally {
      session.dispose();
    }
  });

  it('rejects broken references and oversized sheets instead of silently losing dimensions or changing scale', () => {
    const model = pumpBracketExample(),
      session = createKernelSession(model);
    try {
      const snapshot = session.snapshot(),
        detail = session.drawings()[1];
      expect(() => sheetSvg({ ...detail, scale: 2 }, model, snapshot)).toThrow(/does not fit/);
      expect(() =>
        sheetSvg({ ...detail, views: detail.views.filter((v) => v.view !== 'front') }, model, snapshot),
      ).toThrow(/not on this sheet/);
      expect(() =>
        sheetSvg({ ...detail, annotations: [{ ...detail.annotations[0], view: 'top' }] }, model, snapshot),
      ).toThrow(/not visible face-on/);
      expect(() => sheetSvg({ ...detail, notes: Array(15).fill('A note').join('\n') }, model, snapshot)).toThrow(
        /notes exceed/,
      );
      model.sheets[1].annotations[0].featureIds.push('missing-hole');
      expect(validateReferences(model).some((d) => d.message.includes('Broken hole annotation'))).toBe(true);
    } finally {
      session.dispose();
    }
  });

  it('produces a hatched cross-section through the bracket and keeps assembly subsets isolated', () => {
    const model = pumpBracketExample();
    model.sheets.push({
      ...model.sheets[1],
      id: 'section',
      title: 'Section A-A',
      views: [{ name: 'Section A-A', view: 'right', scale: 1 }],
      annotations: [],
      section: { origin: [3, 0, 0], normal: [1, 0, 0], side: 'negative' },
    });
    model.instances.push({ id: 'distant-copy', partId: 'pump-bracket', position: [1000, 0, 0], rotation: [0, 0, 0] });
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot(),
        sheets = session.drawings();
      expect(sheets[0].bounds[1][0]).toBeCloseTo(166, 5);
      expect(sheets[2].views[0].hatch.length).toBeGreaterThan(0);
      expect(sheetSvg(sheets[2], model, snapshot)).toContain('SECTION A-A');
    } finally {
      session.dispose();
    }
  });
});

// Phase K (docs/sketch-studio-hole-row.md §9): a hole row on the drawings —
// one entry per centre with the feature's id, so callouts and chains keyed
// by feature id read the row with no annotation schema change.
describe('hole rows on drawings', () => {
  // The bracket's five openings as ONE hole feature with a row.
  const asRow = () => {
    const model = pumpBracketExample();
    const part = model.parts.find((p) => p.id === 'pump-bracket');
    const first = part.features.find((f) => f.id === 'pump-opening-1');
    part.features = part.features
      .filter((f) => !/^pump-opening-[2-5]$/.test(f.id))
      .map((f) => (f === first ? { ...f, row: { count: 5, pitch: '=holePitch', direction: [1, 0, 0] } } : f));
    for (const sheet of model.sheets)
      for (const a of sheet.annotations || []) if (a.featureIds) a.featureIds = ['pump-opening-1'];
    return model;
  };
  it('a callout over a row reads "5 × Ø25 THRU"; a chain across it gives the pitch dimensions', () => {
    const model = asRow();
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot(),
        detail = session.drawings()[1];
      const front = detail.views.find((v) => v.view === 'front');
      const holes = sheetHoleFeatures(detail, model, snapshot, front).filter((h) => h.id === 'pump-opening-1');
      expect(holes.map((h) => h.point[0])).toEqual([23, 53, 83, 113, 143]);
      const svg = sheetSvg(detail, model, snapshot);
      expect(svg).toContain('5 × Ø25 THRU');
      expect(svg).toContain('>23</text>');
      expect(svg.match(/>30<\/text>/g)).toHaveLength(4);
      expect(svg).toContain('>166</text>');
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    } finally {
      session.dispose();
    }
    // The spacing is the parameter: 28 moves holes 2–5 and the chain follows.
    model.parameters.find((p) => p.name === 'holePitch').value = 28;
    const again = createKernelSession(model);
    try {
      const svg = sheetSvg(again.drawings()[1], model, again.snapshot());
      expect(svg.match(/>28<\/text>/g)).toHaveLength(4);
    } finally {
      again.dispose();
    }
  });
  it('the auto detail sheet keeps one hole note per feature: "4 × …; 4 holes, pitch 20.00"', () => {
    const model = {
      ...emptyModel(),
      parts: [
        {
          id: 'p',
          name: 'Plate',
          features: [
            { id: 'base', type: 'box', width: 100, depth: 80, height: 10 },
            {
              id: 'row',
              type: 'hole',
              diameter: 6,
              depth: 5,
              throughAll: true,
              position: [20, 40, 10],
              direction: [0, 0, -1],
              row: { count: 4, pitch: 20, direction: [1, 0, 0] },
            },
          ],
        },
      ],
      instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot();
      const sheet = session.drawings({ includeParts: true }).find((s) => s.id === 'detail-p');
      const notes = sheet.annotations.filter((a) => a.type === 'hole');
      expect(notes).toHaveLength(1);
      const text = annotationText(notes[0], model, snapshot);
      expect(text).toBe('4 × Ø6.00 through all; XYZ 20.00, 40.00, 10.00; 4 holes, pitch 20.00');
      expect(sheetSvg(sheet, model, snapshot)).toContain('4 ×');
    } finally {
      session.dispose();
    }
  });
  it('a tapped row counts its holes in the drilling note', () => {
    const model = {
      ...emptyModel(),
      parts: [
        {
          id: 'p',
          name: 'Plate',
          features: [
            { id: 'base', type: 'box', width: 100, depth: 80, height: 10 },
            {
              id: 'row',
              type: 'hole',
              diameter: 5,
              depth: 5,
              throughAll: true,
              holeSpec: { mode: 'tap', size: 'M6', pitch: 1 },
              position: [20, 40, 10],
              direction: [0, 0, -1],
              row: { count: 3, pitch: 25, direction: [1, 0, 0] },
            },
          ],
        },
      ],
      instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
    const session = createKernelSession(model);
    try {
      const [row] = buildCutList(model, session.snapshot());
      expect(row.note).toMatch(/^3 × /);
      expect(row.note).toContain('drill Ø5 mm');
    } finally {
      session.dispose();
    }
  });
});
