import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createKernelSession } from './kernel.js';
import { pumpBracketExample } from './pumpBracket.js';
import { bracketExample, furnitureExample } from './examples.js';
import { sheetSvg } from './drawings.js';
const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

// Phase R (docs/sketch-studio-drawing-fit.md §4): a sheet without `scaleMode`
// is fixed, and its output must stay byte-for-byte what it was before the
// shared layout geometry (sheetLayout.js) replaced each renderer's own cell
// maths. These digests were recorded from the renderers before that refactor.
const digest = (svg) => `${svg.length}:${createHash('sha256').update(svg).digest('hex').slice(0, 24)}`;
const desk = () => {
  const model = furnitureExample('desk');
  const front = {
    name: 'front',
    view: 'front',
    viewBox: [0, -750, 1200, 750],
    basis: [
      [1, 0, 0],
      [0, 0, -1],
    ],
    visible: ['M 0 0 L 60 0 L 60 -726 L 1140 -726 L 1140 0 L 1200 0 L 1200 -750 L 0 -750 Z'],
    hidden: ['M 590 -375 L 610 -375'],
  };
  const iso = {
    ...front,
    name: 'isometric',
    view: 'isometric',
    basis: [
      [0.707, 0.707, 0],
      [0.408, -0.408, -0.816],
    ],
  };
  const size = { top: [1200, 650, 24], leg: [60, 60, 726], apron: [1080, 18, 100] };
  const snapshot = {
    parameters: {},
    parts: model.parts.map((p) => ({ id: p.id, bounds: [[0, 0, 0], size[p.id]], volume: 1, features: {} })),
    instances: model.instances.map((i, index) => ({
      id: i.id,
      partId: i.partId,
      bounds: [
        [index * 10, 0, 0],
        [index * 10 + 60, 60, 726],
      ],
      placement: [{ translation: [0, 0, 0] }],
    })),
  };
  return { model, snapshot, sheet: { ...model.sheets[0], views: [front, iso, { ...front, name: 'Side' }] } };
};

describe('fixed-scale sheets are byte-identical (Phase R)', () => {
  it('pump bracket sheets: engineering layout, a reshuffled slot, and the standard layout', () => {
    const model = pumpBracketExample(),
      session = createKernelSession(model);
    try {
      const snapshot = session.snapshot(),
        sheets = session.drawings();
      const [assembly, detail] = sheets;
      const out = {
        assembly: digest(sheetSvg(assembly, model, snapshot, 1, 2)),
        detail: digest(sheetSvg(detail, model, snapshot, 2, 2)),
        // 'rear' has no slot of its own: it takes the first free one.
        slots: digest(
          sheetSvg(
            {
              ...detail,
              views: detail.views.map((v) => (v.view === 'top' ? { ...v, view: 'rear', name: 'rear' } : v)),
            },
            model,
            snapshot,
          ),
        ),
        single: digest(sheetSvg({ ...detail, views: detail.views.filter((v) => v.view === 'front') }, model, snapshot)),
        standard: digest(
          sheetSvg(
            {
              ...detail,
              layout: 'standard',
              scale: 0.5,
              views: detail.views.map(({ scale: _scale, ...v }) => v),
            },
            model,
            snapshot,
          ),
        ),
      };
      expect(out).toEqual({
        assembly: '105262:effdc0b7020ce4679b590aae',
        detail: '69735:76169bbd9e29ca60309e400c',
        slots: '69737:87ed8e8ae53119247fe1388d',
        single: '13599:1e12d59596fa08043558c93c',
        standard: '46425:d7f08b64b43d35158e847df1',
      });
    } finally {
      session.dispose();
    }
  });
  it('bracket example and a desk overview with parts list and balloons', () => {
    const model = bracketExample(),
      session = createKernelSession(model);
    let bracket;
    try {
      bracket = digest(sheetSvg(session.drawings()[0], model, session.snapshot()));
    } finally {
      session.dispose();
    }
    const d = desk();
    expect({
      bracket,
      desk: digest(sheetSvg(d.sheet, d.model, d.snapshot)),
      engineering: digest(
        sheetSvg({ ...d.sheet, layout: 'engineering', views: d.sheet.views.slice(0, 2) }, d.model, d.snapshot),
      ),
    }).toEqual({
      bracket: '22749:e45fe453f32345e3ee4995e4',
      desk: '7021:5137177ea7f5a1ce4ff51a93',
      engineering: '8400:f476972c565f13b353010fd0',
    });
  });
});
