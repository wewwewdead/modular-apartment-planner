/**
 * Normalising a sketch document twice gives what normalising it once gives.
 *
 * Perf pass 3 leans on this in two places: a drag frame reuses the fields an
 * earlier normalisation produced instead of normalising them again
 * (`reuseNormalized`), and the dirty check compares the snapshot it built once
 * instead of normalising that snapshot a second time. Both are only the same
 * document, and the same comparison string, while this holds -- for every
 * template, every CAD example and the shop fixtures.
 */

import { describe, expect, it } from 'vitest';
import { normalizeSketchDocument } from './sketchDocumentUtils';
import { resolveSketchDocument } from './sketchDocumentResolver';
import { normalizeParsedSketchWorkspace } from './workspaceSerializationUtils';
import sampleDocument from '../data/sampleDocument';
import { bracketExample, furnitureExample } from '../cad/examples';
import { sheetMetalControlBox, sheetMetalKiosk, sheetMetalPumpBracket } from '../cad/shopExamples';
import bookshelf from '../craftsman/templates/bookshelf.json';
import cncTestSheet from '../craftsman/templates/cncTestSheet.json';
import cuttingBoard from '../craftsman/templates/cuttingBoard.json';
import plantStand from '../craftsman/templates/plantStand.json';
import shelvingUnit from '../craftsman/templates/shelvingUnit.json';
import storageBox from '../craftsman/templates/storageBox.json';
import toolCart from '../craftsman/templates/toolCart.json';
import workbench from '../craftsman/templates/workbench.json';
import controlBoxFixture from '../cad/fixtures/control-box-before-shop-trim.json';
import kioskFixture from '../cad/fixtures/kiosk-before-shop-trim.json';

const TEMPLATES = { bookshelf, cncTestSheet, cuttingBoard, plantStand, shelvingUnit, storageBox, toolCart, workbench };

const MODELS = {
  table: () => furnitureExample('table'),
  desk: () => furnitureExample('desk'),
  bench: () => furnitureExample('bench'),
  shelf: () => furnitureExample('shelf'),
  cabinet: () => furnitureExample('cabinet'),
  bracket: () => bracketExample(),
  pump: () => sheetMetalPumpBracket(),
  controlBox: () => sheetMetalControlBox(),
  kiosk: () => sheetMetalKiosk(),
  controlBoxFixture: () => structuredClone(controlBoxFixture),
  kioskFixture: () => structuredClone(kioskFixture),
};

const json = (value) => JSON.stringify(value);

function documentsUnderTest() {
  const documents = Object.entries(TEMPLATES).map(([name, template]) => [
    name,
    normalizeParsedSketchWorkspace(structuredClone(template)).document,
  ]);
  for (const [name, build] of Object.entries(MODELS)) {
    documents.push([`model ${name}`, { ...sampleDocument, model: build() }]);
  }
  documents.push([
    'joints, variables and groups',
    {
      ...sampleDocument,
      variables: [{ name: ' w ', value: '120' }],
      joints: [{ id: 'j1', type: 'butt', sourcePartId: 'r1', targetPartId: 'r2' }],
      entities: [
        { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 50, thickness: 18, meta: { groupId: 'lonely' } },
        { id: 'r2', type: 'rect', x: 100, y: 0, width: 100, height: 50, thickness: 18, meta: {} },
      ],
    },
  ]);
  return documents;
}

// The fields `reuseNormalized` may hand back unchanged.
const REUSABLE_FIELDS = ['metadata', 'objectDefinition', 'variables', 'layers', 'model'];

describe('normalizeSketchDocument is idempotent', () => {
  it('on every reusable field of every template and CAD example, raw and resolved', () => {
    for (const [name, document] of documentsUnderTest()) {
      const once = normalizeSketchDocument(document);
      const twice = normalizeSketchDocument(once);
      const resolved = normalizeSketchDocument(resolveSketchDocument(document).document);
      const resolvedTwice = normalizeSketchDocument(resolved);
      for (const field of REUSABLE_FIELDS) {
        expect(json(twice[field]), `${name} ${field}`).toBe(json(once[field]));
        expect(json(resolvedTwice[field]), `${name} resolved ${field}`).toBe(json(resolved[field]));
      }
    }
  });

  it('settles a raw joint in two passes: it is never reused, always normalised', () => {
    // Pre-existing, kept as it is: a missing `tolerance.clearanceMm` reads null
    // after one pass and 0 after a second.
    const [, document] = documentsUnderTest().at(-1);
    const once = normalizeSketchDocument(document);
    const twice = normalizeSketchDocument(once);
    expect(once.joints[0].tolerance.clearanceMm).toBeNull();
    expect(twice.joints[0].tolerance.clearanceMm).toBe(0);
    expect(json(normalizeSketchDocument(twice).joints)).toBe(json(twice.joints));
    expect(normalizeSketchDocument(once, { reuseNormalized: true }).joints).toEqual(twice.joints);
  });
});

describe('reuseNormalized', () => {
  it('gives the document a full normalisation gives, reusing only fields a normalisation produced', () => {
    for (const [name, document] of documentsUnderTest()) {
      const resolved = resolveSketchDocument(document).document;
      const reused = normalizeSketchDocument(resolved, { reuseNormalized: true });
      expect(reused, name).toEqual(normalizeSketchDocument(resolved));
      // The resolved model and layers came out of a normalisation: reused as
      // they are. The resolved joints came out of the joinery: normalised.
      expect(reused.model).toBe(resolved.model);
      expect(reused.layers).toBe(resolved.layers);
      if (resolved.joints.length) expect(reused.joints).not.toBe(resolved.joints);

      // A raw document (the CAD examples: built in code, never normalised)
      // has nothing to reuse. (The templates came through
      // normalizeParsedSketchWorkspace, so theirs are normalisation outputs.)
      // (A raw multi-instance sheet-metal model is split into parts with fresh
      // random ids on every normalisation -- pre-existing; separated once, it
      // is stable -- so for those only the reuse decision is checked.)
      const raw = normalizeSketchDocument(document, { reuseNormalized: true });
      const deterministic = json(normalizeSketchDocument(document)) === json(normalizeSketchDocument(document));
      if (deterministic) expect(raw, `${name} raw`).toEqual(normalizeSketchDocument(document));
      if (name.startsWith('model ')) expect(raw.model).not.toBe(document.model);
    }
  });

  it('normalises a field that was replaced since, even beside reused ones', () => {
    const resolved = resolveSketchDocument({ ...sampleDocument, model: furnitureExample('desk') }).document;
    const edited = { ...resolved, layers: [{ id: 'default' }], variables: [{ name: 'x', value: '2' }] };
    const reused = normalizeSketchDocument(edited, { reuseNormalized: true });
    expect(reused).toEqual(normalizeSketchDocument(edited));
    expect(reused.model).toBe(resolved.model);
    expect(reused.layers).not.toBe(edited.layers);
    expect(reused.variables).toEqual([expect.objectContaining({ name: 'x', value: 2, unit: 'mm' })]);
  });
});
