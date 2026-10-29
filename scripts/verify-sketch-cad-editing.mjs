import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { emptyModel, createPart } from '../src/features/sketchstudio/cad/model.js';

await mkdir('artifacts/sketch-cad', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  checks = [];
const url = process.env.CAD_VERIFY_URL || 'http://127.0.0.1:5180/sketch';
const seed = async (page, model, entities, mode) => {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(
    ({ model, entities, mode }) => {
      localStorage.setItem(
        'apartment-planner-sketch-recovery',
        JSON.stringify({
          kind: 'sketchstudio-workspace',
          version: 2,
          document: {
            id: 'editing-test',
            name: 'Editing test',
            version: 4,
            units: 'mm',
            layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
            entities,
            model,
          },
          ui: { workspaceMode: mode },
          viewport: { zoom: 1, panX: 0, panY: 0 },
        }),
      );
    },
    { model, entities, mode },
  );
  await page.reload();
};
const current = (page) => page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
try {
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const tube = createPart('member');
    const model = { ...emptyModel(), parts: [tube.part], instances: [tube.instance] };
    await seed(page, model, [], 'model');
    await current(page);
    await page.getByRole('button', { name: 'Square tube', exact: false }).first().click();
    await page.getByLabel('Standard view').selectOption('front');
    const position = page.getByRole('group', { name: 'Position (mm)', exact: true });
    const x = position.getByLabel('X', { exact: true });
    const canvas = page.locator('.cad-viewport canvas');
    const box = await canvas.boundingBox();
    // In front view this single tube's center coincides with the viewport center.
    const start = { x: box.x + box.width / 2 + box.height * 0.085, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 70, start.y, { steps: 12 });
    await page.mouse.up();
    await current(page);
    const movedX = Number(await x.inputValue());
    assert(movedX > 0, 'Dragging the X handle must change the instance placement.');
    assert(Number.isInteger(movedX), 'Default movement must snap to 1 mm.');
    assert.equal(Number(await position.getByLabel('Y', { exact: true }).inputValue()), 0);
    assert.equal(Number(await position.getByLabel('Z', { exact: true }).inputValue()), 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await current(page);
    assert.equal(Number(await x.inputValue()), 0, 'One Undo must revert the whole drag.');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await current(page);
    assert.equal(Number(await x.inputValue()), movedX);
    // Fit to the moved part before checking Escape cancellation.
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 50, start.y, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(Number(await x.inputValue()), movedX, 'Escape must cancel the move.');
    await page.getByLabel('Move snap (mm)').fill('5');
    for (const [axis, view] of [
      ['Y', 'top'],
      ['Z', 'front'],
    ]) {
      await page.getByLabel('Standard view').selectOption(view);
      await page.getByRole('button', { name: 'Fit', exact: true }).click();
      const up = { x: box.x + box.width / 2, y: box.y + box.height / 2 - box.height * 0.085 };
      await page.mouse.move(up.x, up.y);
      await page.mouse.down();
      await page.mouse.move(up.x, up.y - 45, { steps: 8 });
      await page.mouse.up();
      await current(page);
      const value = Number(await position.getByLabel(axis, { exact: true }).inputValue());
      assert(value > 0 && value % 5 === 0, `${axis} handle must move in 5 mm increments.`);
    }
    await page.screenshot({ path: `artifacts/sketch-cad/move-${width}.png` });
    await page.waitForFunction(
      ({ id, movedX }) => {
        const saved = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery') || 'null');
        return saved?.document?.model?.instances.find((i) => i.id === id)?.position[0] === movedX;
      },
      { id: tube.instance.id, movedX },
    );
    await page.reload();
    await current(page);
    await page.getByRole('button', { name: 'Square tube', exact: false }).first().click();
    assert.equal(
      Number(
        await page
          .getByRole('group', { name: 'Position (mm)', exact: true })
          .getByLabel('X', { exact: true })
          .inputValue(),
      ),
      movedX,
    );
    checks.push(`${width}x${height}: X/Y/Z axis drags, 1 and 5 mm snap, undo/redo, Escape, reopen`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const entities = [
    { id: 'rect', name: 'Rotated panel', type: 'rect', x: 0, y: 0, width: 100, height: 60, rotation: 30 },
    { id: 'circle', name: 'Disk', type: 'circle', cx: 200, cy: 0, r: 30 },
    { id: 'l1', type: 'line', x1: 300, y1: 0, x2: 400, y2: 0 },
    { id: 'l2', type: 'line', x1: 400, y1: 60, x2: 400, y2: 0 },
    { id: 'l3', type: 'line', x1: 400, y1: 60, x2: 300, y2: 60 },
    { id: 'l4', type: 'line', x1: 300, y1: 0, x2: 300, y2: 60 },
    { id: 'open', type: 'line', x1: 500, y1: 0, x2: 550, y2: 0 },
  ].map((e) => ({ ...e, layerId: 'default' }));
  await seed(page, emptyModel(), entities, 'draft');
  await page.getByRole('button', { name: 'Import drawing into 3D', exact: true }).click();
  await page.getByLabel('Extrusion depth (mm)').fill('25');
  await page.getByText('Not imported · 1', { exact: true }).click();
  assert(await page.getByText(/Lines must form a closed loop/).isVisible());
  await page.screenshot({ path: 'artifacts/sketch-cad/import-profiles.png' });
  await page.getByRole('button', { name: 'Import 3 parts into 3D', exact: true }).click();
  await current(page);
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery') || 'null');
    return saved?.document?.model?.parts.length === 3;
  });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery')));
  assert(saved.document.model.parts.every((p) => p.features[0].length === 25));
  assert.equal(saved.document.entities.length, entities.length);
  await page.screenshot({ path: 'artifacts/sketch-cad/imported-solids.png' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Create tube member', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await current(page);
  checks.push(
    '2D rotated rectangle, exact circle and line loop import; unsupported-line feedback; explicit depth; drawing preserved; undo/redo',
  );
  await context.close();
  for (const kind of ['tube', 'pipe']) {
    const context = await browser.newContext({
      viewport: kind === 'tube' ? { width: 1366, height: 768 } : { width: 1920, height: 1080 },
    });
    const page = await context.newPage(),
      created = createPart('member');
    created.part.name = kind === 'tube' ? 'Square tube' : 'Round pipe';
    created.part.features[0].end = [0, 0, 200];
    if (kind === 'pipe') {
      created.part.features[0].section = { type: 'pipe', diameter: 40, wall: 2 };
      created.instance.position = [300, 200, 100];
      created.instance.rotation = [15, 30, 45];
    }
    await seed(page, { ...emptyModel(), parts: [created.part], instances: [created.instance] }, [], 'model');
    await current(page);
    await page.getByRole('button', { name: created.part.name, exact: false }).first().click();
    await page.getByRole('button', { name: 'Hole', exact: true }).click();
    await current(page);
    await page.getByText(/^Cut applied ·/).waitFor();
    assert.equal(await page.getByLabel('Cut extent', { exact: true }).inputValue(), 'through');
    await page.getByRole('button', { name: 'View cut close up', exact: true }).click();
    await page.screenshot({ path: `artifacts/sketch-cad/${kind}-hole.png` });
    if (kind === 'tube') {
      await page.getByLabel('Across side offset (mm)', { exact: true }).fill('100');
      await page.getByLabel('Across side offset (mm)', { exact: true }).press('Enter');
      await page.getByText('Rebuild failed', { exact: true }).waitFor();
      assert(await page.getByRole('alert').filter({ hasText: 'Cut removes no material' }).isVisible());
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await current(page);
    }
    await page.getByRole('button', { name: 'Pocket', exact: true }).click();
    await current(page);
    await page.getByLabel('Along member (%)', { exact: true }).fill('70');
    await page.getByLabel('Along member (%)', { exact: true }).press('Enter');
    await current(page);
    assert.equal(await page.getByLabel('Depth (mm)', { exact: true }).inputValue(), '1');
    await page.getByRole('button', { name: 'View cut close up', exact: true }).click();
    await page.screenshot({ path: `artifacts/sketch-cad/${kind}-pocket.png` });
    await page.getByLabel('Cut extent', { exact: true }).selectOption('through');
    await current(page);
    await page.getByText(/^Cut applied ·/).waitFor();
    await page.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery') || 'null');
      return saved?.document?.model?.parts[0]?.features.at(-1)?.throughAll === true;
    });
    await page.reload();
    await current(page);
    checks.push(
      `${kind}: default through hole, rectangular blind pocket without a sketch, position edits, through pocket, close-up view, reopen`,
    );
    await page.getByRole('button', { name: created.part.name, exact: false }).first().click();
    await page.getByRole('button', { name: 'Extrude', exact: true }).click();
    await page.getByText('Preview ready', { exact: true }).waitFor({ timeout: 60000 });
    await page.getByText(/preserving the hollow section/).waitFor();
    await page.getByRole('button', { name: 'Fit preview', exact: true }).click();
    await page.screenshot({ path: `artifacts/sketch-cad/${kind}-extrude-preview.png` });
    await page.getByRole('button', { name: 'Apply extrude', exact: true }).click();
    await current(page);
    checks.push(`${kind}: extrusion copies the hollow section and previews before applying`);
    await context.close();
  }
  for (const type of ['hole', 'pocket']) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage(),
      created = createPart('member');
    created.part.features.push(
      type === 'hole'
        ? { id: 'old-cut', type, diameter: 6, depth: 18, position: [30, 30, 0], direction: [0, 0, 1] }
        : { id: 'old-cut', type, sketchId: '', depth: 5 },
    );
    await seed(page, { ...emptyModel(), parts: [created.part], instances: [created.instance] }, [], 'model');
    await page.getByText('Rebuild failed', { exact: true }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Square tube', exact: false }).first().click();
    if (type === 'hole') await page.getByLabel('Cut placement', { exact: true }).selectOption('member');
    else await page.getByLabel('Pocket profile', { exact: true }).selectOption('rectangle');
    await current(page);
    await page.getByText(/^Cut applied ·/).waitFor();
    checks.push(`Saved legacy ${type}: repaired without deleting the part or feature`);
    await context.close();
  }
  for (const type of [
    'extrude',
    'revolve',
    'sweep',
    'loft',
    'union',
    'subtract',
    'intersect',
    'fillet',
    'chamfer',
    'shell',
    'mirror',
    'pattern',
    'trim',
  ]) {
    const context = await browser.newContext({
      viewport: type === 'extrude' ? { width: 1366, height: 768 } : { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    const model = emptyModel(),
      profiles = ['extrude', 'revolve', 'sweep', 'loft'].includes(type);
    if (!profiles) {
      const created = createPart('board');
      created.part.name = 'Operation target';
      created.part.features[0] = { ...created.part.features[0], width: 100, depth: 80, height: 50 };
      model.parts.push(created.part);
      model.instances.push(created.instance);
      if (['union', 'subtract', 'intersect'].includes(type)) {
        const tool = createPart('board');
        tool.part.name = 'Boolean tool';
        tool.part.features[0] = { ...tool.part.features[0], width: 100, depth: 80, height: 50 };
        model.parts.push(tool.part);
      }
    }
    await seed(page, model, [], 'model');
    await current(page);
    if (!profiles) await page.getByRole('button', { name: 'Operation target', exact: false }).first().click();
    const command = page.getByRole('button', { name: type[0].toUpperCase() + type.slice(1), exact: true });
    await command.click();
    if (['union', 'subtract', 'intersect'].includes(type)) {
      const x = page.getByRole('group', { name: 'Position (part mm)', exact: true }).getByLabel('X', { exact: true });
      await x.fill('50');
      await x.press('Enter');
    }
    await page.getByText('Preview ready', { exact: true }).waitFor({ timeout: 60000 });
    if (type === 'extrude') {
      const length = page.getByLabel('Length (mm)', { exact: true });
      await length.fill('0');
      await length.press('Enter');
      await page.getByText('Preview failed', { exact: true }).waitFor({ timeout: 60000 });
      assert(await page.getByRole('button', { name: 'Apply extrude', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Cancel operation', exact: true }).click();
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery')));
      assert.equal(stored.document.model.parts.length, 0, 'Failed/cancelled preview must not create a saved part.');
      await command.click();
      await page.getByText('Preview ready', { exact: true }).waitFor({ timeout: 60000 });
    }
    await page.getByRole('button', { name: 'Fit preview', exact: true }).click();
    await page.screenshot({ path: `artifacts/sketch-cad/operation-${type}.png` });
    await page.getByRole('button', { name: `Apply ${type}`, exact: true }).click();
    await current(page);
    await page.waitForFunction((type) => {
      const saved = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery') || 'null');
      return saved?.document?.model?.parts.some((p) => p.features.at(-1)?.type === type);
    }, type);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await current(page);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await current(page);
    if (type === 'extrude') {
      await page.getByRole('button', { name: 'Edit extrude with preview', exact: true }).click();
      const length = page.getByLabel('Length (mm)', { exact: true });
      await length.fill('30');
      await length.press('Enter');
      await page.getByText('Preview ready', { exact: true }).waitFor({ timeout: 60000 });
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.getByText('The saved model changed. Cancel and reopen this operation.', { exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Apply extrude', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Cancel operation', exact: true }).click();
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await current(page);
    }
    await page.reload();
    await current(page);
    checks.push(`${type}: configure, real solid preview, apply, undo/redo, reopen`);
    await context.close();
  }
  checks.push('Failed/cancelled previews do not change the saved model; stale preview application blocked');
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/sketch-cad/editing-verification.json',
    JSON.stringify({ status: 'passed', checks, errors }, null, 2),
  );
  console.log('Movement, import, cuts and guided solid operation verification passed.');
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({ path: 'artifacts/sketch-cad/editing-failure.png' });
      console.error((await page.locator('body').innerText()).slice(-5000));
    }
  throw error;
} finally {
  await browser.close();
}
