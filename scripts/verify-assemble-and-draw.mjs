/* global localStorage, process, console, document, window, DOMPoint */
// Phase B: build the desk from an empty model (Phase A sketch → extrude/cut),
// name the parts, place four legs with Mate faces + drag snapping, dimension
// the front view by hand, check the parts list and all three exports, then
// prove the work survives a reload and a Save → Open round trip.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-assemble-and-draw.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = 'artifacts/sketch-cad/assemble-and-draw';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
// No native file pickers in headless Chrome: Save downloads, Open uses <input type=file>.
await context.addInitScript(() => {
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
const steps = cadSteps(page);
const { properties, current, savedWhen, project, view, drag, setPosition } = steps;
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const treeItems = (name) => page.locator('.cad-tree-item', { hasText: name });
const corners = [
  [0, 0],
  [1140, 0],
  [0, 590],
  [1140, 590],
];

try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();

  // 1. Desktop, hole and leg with the Phase A sketcher. The desktop is named
  //    in the extrude panel; the leg keeps its default name for now.
  await steps.boardFromPlane({ width: 1200, height: 650, distance: 24, name: 'Desktop' });
  await steps.holeThroughFace({ viewName: 'bottom', u: 60, v: 60, radius: 3 });
  await view('isometric');
  await steps.boardFromPlane({ width: 60, height: 60, distance: 726 });
  let model = await savedWhen((m) => m.parts.length === 2, 'desktop and leg');
  assert.deepEqual(
    model.parts.map((p) => p.name),
    ['Desktop', 'Part 2'],
  );
  checks.push('desktop (named in the extrude panel), Ø6 underside cut and 726 leg built with the Phase A sketcher');

  // 2. Rename the leg inline in the tree (double-click), and F2 on the desktop.
  await treeItems('Part 2').first().dblclick();
  await page.getByLabel('Rename part', { exact: true }).fill('Leg');
  await page.keyboard.press('Enter');
  await current();
  await treeItems('Desktop').first().focus();
  await page.keyboard.press('F2');
  await expect(page.getByLabel('Rename part', { exact: true })).toHaveValue('Desktop');
  await page.keyboard.press('Escape');
  model = await savedWhen((m) => m.parts[1].name === 'Leg', 'leg renamed');
  checks.push('leg renamed by double-click in the tree; F2 opens the same editor');

  // 3. Desktop up to Z 726; leg off to the side and low, then three copies.
  await treeItems('Desktop').first().click();
  await setPosition(0, 0, 726);
  await treeItems('Leg').first().click();
  await setPosition(1400, 0, -200);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Assemble', exact: true }).click();
    await page.getByRole('button', { name: 'Duplicate instance', exact: true }).click();
    await current();
  }
  model = await savedWhen((m) => m.instances.length === 5, 'four legs');
  const legIds = model.instances.filter((i) => i.partId === model.parts[1].id).map((i) => i.id);
  assert.deepEqual(
    model.instances.filter((i) => legIds.includes(i.id)).map((i) => i.position),
    [
      [1400, 0, -200],
      [1500, 0, -200],
      [1600, 0, -200],
      [1700, 0, -200],
    ],
    'Duplicates keep numeric positions.',
  );
  await shot('01-parts-built');

  // 4. Each leg: Mate its top face to the desktop underside, then drag it to
  //    a corner in the top view and let it snap.
  for (const [index, id] of legIds.entries()) {
    const x = 1400 + index * 100;
    await treeItems('Leg').nth(index).click();
    await page.getByRole('button', { name: 'Assemble', exact: true }).click();
    await page.getByRole('button', { name: 'Mate faces', exact: true }).click();
    await view('top');
    await page.mouse.click(...(await project([x + 30, 30, 526])));
    await expect(properties.locator('.cad-mate-steps li.is-current')).toContainText('Click the face it should sit');
    await view('bottom');
    await page.mouse.click(...(await project([600, 325, 726])));
    await expect(properties.getByLabel('Offset (mm)', { exact: true })).toBeVisible();
    await current();
    if (index === 0) {
      // The offset re-applies from the pre-mate pose; back to 0 to sit flush.
      await properties.getByLabel('Offset (mm)', { exact: true }).fill('5');
      await properties.getByLabel('Offset (mm)', { exact: true }).press('Enter');
      await savedWhen((m) => m.instances.find((i) => i.id === id).position[2] === -5, 'offset 5 below the underside');
      await properties.getByLabel('Offset (mm)', { exact: true }).fill('0');
      await properties.getByLabel('Offset (mm)', { exact: true }).press('Enter');
      await shot('02-leg-mated');
    }
    model = await savedWhen((m) => m.instances.find((i) => i.id === id).position[2] === 0, `leg ${index} mated`);
    assert.deepEqual(model.instances.find((i) => i.id === id).position, [x, 0, 0]);
    await properties.getByRole('button', { name: 'Done', exact: true }).click();
    await current();
    // Drag the gizmo centre to a few mm off the corner; snapping finishes it.
    await view('top');
    const [cx, cy] = corners[index];
    const from = await project([x + 30, 30, 363]);
    const to = await project([cx + 30 + 4, cy + 30 - 3, 363]);
    await drag(from, to);
    model = await savedWhen((m) => {
      const p = m.instances.find((i) => i.id === id).position.map(Number);
      return Math.abs(p[0] - cx) < 1e-6 && Math.abs(p[1] - cy) < 1e-6;
    }, `leg ${index} snapped to corner ${cx}, ${cy}`);
    await current();
    if (index === 0) await shot('03-leg-snapped');
  }
  model = await savedWhen((m) => m.instances.length === 5, 'final placement');
  const legPositions = model.instances.filter((i) => legIds.includes(i.id)).map((i) => i.position);
  legPositions.forEach((p, i) => {
    [...corners[i], 0].forEach((value, axis) =>
      assert(Math.abs(Number(p[axis]) - value) <= 1e-6, `Leg ${i} axis ${axis}: ${p[axis]} ≠ ${value}`),
    );
  });
  assert.deepEqual(model.instances.find((i) => i.partId === model.parts[0].id).position, [0, 0, 726]);
  await view('isometric');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await shot('04-desk-assembled');
  checks.push(
    `legs mated (top → desktop underside, offset re-applied 5 → 0) and drag-snapped to ${JSON.stringify(legPositions)}`,
  );

  // 5. Drawings: generate, then dimension the front view by hand.
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await page.getByRole('button', { name: 'Generate views', exact: true }).click();
  const sheetSvg = page.locator('.cad-sheet-preview svg');
  await sheetSvg.waitFor({ timeout: 60000 });
  const parts = sheetSvg.locator('[data-part-row]');
  await expect(sheetSvg.locator('[data-part-row="Desktop"][data-quantity="1"]')).toHaveCount(1);
  await expect(sheetSvg.locator('[data-part-row="Leg"][data-quantity="4"]')).toHaveCount(1);
  await expect(parts.nth(0)).toContainText('Desktop');
  await expect(parts.nth(1)).toContainText('Leg');
  await expect(sheetSvg.locator('[data-balloon]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  // Screen position of a world point in the drawn front view.
  const onSheet = (world, nudge = [0, 0]) =>
    page.evaluate(
      ({ world, nudge }) => {
        const group = document.querySelector('.cad-sheet-preview g[data-view="front"]');
        const basis = group
          .getAttribute('data-basis')
          .split(';')
          .map((axis) => axis.split(',').map(Number));
        const p = basis.map((axis) => axis.reduce((sum, v, i) => sum + v * world[i], 0));
        const s = new DOMPoint(p[0] + nudge[0], p[1] + nudge[1]).matrixTransform(group.getScreenCTM());
        return [s.x, s.y];
      },
      { world, nudge },
    );
  // View-model direction "down the page" and "left", from the projection.
  const [floorLeft, floorRight, topLeft] = await Promise.all([
    onSheet([0, 0, 0]),
    onSheet([1200, 0, 0]),
    onSheet([0, 0, 750]),
  ]);
  assert(floorLeft[1] > topLeft[1] && floorRight[0] > floorLeft[0], 'Front view is upright.');
  const clickSheet = async (point) => {
    await page.mouse.move(point[0], point[1], { steps: 3 });
    await page.waitForTimeout(100);
    await page.mouse.click(point[0], point[1]);
  };
  // 1200: outer faces of the two front legs at the floor; line 25 px below.
  await clickSheet([floorLeft[0] + 1, floorLeft[1] - 1]);
  await clickSheet([floorRight[0] - 1, floorRight[1] - 1]);
  await clickSheet([(floorLeft[0] + floorRight[0]) / 2, floorLeft[1] + 25]);
  await expect(sheetSvg.locator('[data-dimension][data-value="1200"]')).toHaveCount(1);
  // 750: floor to the desktop's top edge; line 25 px to the left.
  await clickSheet([floorLeft[0] + 1, floorLeft[1] - 1]);
  await clickSheet([topLeft[0] + 1, topLeft[1] + 1]);
  await clickSheet([floorLeft[0] - 25, (floorLeft[1] + topLeft[1]) / 2]);
  await expect(sheetSvg.locator('[data-dimension][data-value="750"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await shot('05-dimensioned-sheet');
  await page.locator('.cad-sheet-preview svg').screenshot({ path: `${directory}/sheet.png` });
  model = await savedWhen((m) => m.sheets[0].annotations?.filter((a) => a.type === 'linear').length === 2, 'dims');
  const dims = model.sheets[0].annotations.filter((a) => a.type === 'linear');
  assert.deepEqual(
    dims.map((a) => [a.view, a.orientation]),
    [
      ['front', 'horizontal'],
      ['front', 'vertical'],
    ],
  );
  checks.push(
    'parts list rows Desktop 1 / Leg 4 with 2 balloons; manual 1200 (horizontal) and 750 (vertical) on front',
  );

  // 6. Exports carry the manual dimensions and the parts list.
  await current();
  const download = async (button, name) => {
    const pending = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: button, exact: true }).click();
    await (await pending).saveAs(`${directory}/${name}`);
    return readFile(`${directory}/${name}`);
  };
  const svg = String(await download('SVG sheet', 'assembly.svg'));
  assert(svg.includes('data-value="1200"') && svg.includes('data-value="750"'), 'SVG keeps the dimensions.');
  assert(
    svg.includes('data-part-row="Desktop" data-quantity="1"') && svg.includes('data-part-row="Leg" data-quantity="4"'),
  );
  const dxf = String(await download('DXF sheet', 'assembly.dxf')).split('\n');
  const count = (lines, value) => lines.filter((l) => l === value).length;
  // Automatic overall dims give 1200.00 twice (front, top) and 750.00 twice
  // (front, right); the manual ones add one each.
  assert.equal(count(dxf, '1200.00'), 3, 'DXF 1200.00 labels');
  assert.equal(count(dxf, '750.00'), 3, 'DXF 750.00 labels');
  assert(count(dxf, 'Desktop') === 1 && count(dxf, 'Leg') === 1, 'DXF parts list');
  const pdf = (await download('Vector PDF', 'assembly.pdf')).toString('latin1');
  assert(pdf.startsWith('%PDF-'));
  const pdfCount = (value) => pdf.split(`(${value})`).length - 1;
  // The PDF also holds the automatic part detail sheets: the Desktop sheet
  // adds two more 1200.00 labels (front, top); no part sheet shows 750.
  assert.equal(pdfCount('1200.00'), 5, 'PDF 1200.00 labels');
  assert.equal(pdfCount('750.00'), 3, 'PDF 750.00 labels');
  // Each part name appears in the parts list and as its detail sheet's title.
  assert(pdfCount('Desktop') === 2 && pdfCount('Leg') === 2, 'PDF parts list');
  checks.push(
    'SVG and DXF contain both manual dimensions (3 × 1200.00, 3 × 750.00 with the automatic ones) and the parts list; PDF 5 × 1200.00 (incl. Desktop detail sheet), 3 × 750.00, parts list',
  );

  // 7. Persistence: reload (recovery copy), then Save → fresh page → Open.
  const expectModel = async (label) => {
    const m = await savedWhen((m) => m.instances.length === 5, label);
    assert.deepEqual(
      m.parts.map((p) => p.name),
      ['Desktop', 'Leg'],
    );
    assert.equal(m.sketches.length, 3);
    assert(
      m.sketches.every((s) => s.entities?.length && s.support?.type),
      `${label}: sketch entities/support`,
    );
    assert.deepEqual(m.sketches[1].support.type, 'face');
    assert.deepEqual(
      m.sheets[0].annotations.filter((a) => a.type === 'linear'),
      dims,
    );
    assert.deepEqual(
      m.instances.filter((i) => legIds.includes(i.id)).map((i) => i.position.map(Number)),
      corners.map(([x, y]) => [x, y, 0]),
    );
    await current();
    await page.getByRole('button', { name: 'Drawings', exact: true }).click();
    await page.getByRole('button', { name: 'Generate views', exact: true }).click();
    await sheetSvg.waitFor({ timeout: 60000 });
    await expect(sheetSvg.locator('[data-dimension][data-value="1200"]')).toHaveCount(1);
    await expect(sheetSvg.locator('[data-dimension][data-value="750"]')).toHaveCount(1);
    await expect(sheetSvg.locator('[data-part-row="Leg"][data-quantity="4"]')).toHaveCount(1);
  };
  await page.waitForTimeout(800);
  await page.reload();
  await expectModel('after reload');
  checks.push('reload: model, named parts, sketches (entities + support) and dimensions restored');
  const savedFile = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await (await savedFile).saveAs(`${directory}/desk.sketch.json`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  assert.equal((await steps.saved())?.parts.length ?? 0, 0, 'The fresh page starts empty.');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(`${directory}/desk.sketch.json`);
  // Switching to the 3D workspace marks the blank document as changed, so
  // opening a file asks before replacing it.
  await page.getByText('Unsaved sketch changes will be lost. Continue?').waitFor();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expectModel('after Save → Open');
  await shot('06-reopened');
  checks.push('Save → new page → Open: the same model, sketches and dimensions');

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${directory}/verification.json`, JSON.stringify({ status: 'passed', errors, checks }, null, 2));
  console.log('Assemble-and-draw verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
