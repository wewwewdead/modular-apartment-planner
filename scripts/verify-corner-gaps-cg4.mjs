/* global localStorage, process, console, window, URL */
// Corner gaps CG-4 (docs/sketch-studio-corner-gaps.md §6.2): what the real
// shop holds, on the user's own tray, driven the way the user would:
//  1. Open the user's file through the app's Open button (the copy under
//     scripts/fixtures); its gaps as saved (0.72 mm and up) may not touch;
//  2. "Set all" at 0.2: the line reads "… · 12 may touch on the bench", the
//     rear wall's row "0.20 mm · passes 0.20 mm beside it · ± 0.37 on the
//     bench: may touch";
//  3. "What the shop holds": flange ± 0.05, cut ± 0.05, angle ± 0.25 (each
//     settled with Enter, one commit each): no row may touch any more, the
//     wall reads ± 0.10; the saved model holds fabrication.shop.tolerance;
//  4. Shop → Bend: the press brake's card shows the same band, read only (no
//     fields there);
//  5. Undo three times: the tolerance gone from the saved model, "12 may
//     touch" again;
//  6. no page error.
// Screenshots at 1600 × 1000 and 1366 × 768.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-corner-gaps-cg4.mjs
// Screenshots: artifacts/sketch-cad/corner-gaps-cg4 (or CG4_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cadSteps } from './sketch-cad-steps.mjs';

const SAMPLE = fileURLToPath(new URL('./fixtures/corner-gaps-sample-bending.json', import.meta.url));
const directory = process.env.CG4_SHOTS || 'artifacts/sketch-cad/corner-gaps-cg4';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// The Open button falls back to the file input without the File System Access
// picker (headless Chrome's picker refuses a call that follows the confirm).
await page.addInitScript(() => {
  delete window.showOpenFilePicker;
});
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, shopStation, savedWhen, showTree } = cadSteps(page);
const summaryOf = (scope) => scope.getByLabel('Flange gaps summary', { exact: true });
const rowsOf = (scope) => scope.getByRole('list', { name: 'Flange gaps, nearest first' }).getByRole('listitem');
const REAR = 'Bend 8 flange, end → bend 5 flange, inside face';
const SAVED = 'Flange gaps: least 0.72 mm · 12 within 3 mm';
const TOUCH = 'Flange gaps: least 0.20 mm · 12 within 3 mm · 12 may touch on the bench';
const CLEAR = 'Flange gaps: least 0.20 mm · 12 within 3 mm';
const shot = async (name, { focus = null } = {}) => {
  const ready = async () => {
    if (focus) await focus.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
  };
  await ready();
  await page.screenshot({ path: `${directory}/${name}-1600.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(400);
  await ready();
  await page.screenshot({ path: `${directory}/${name}-1366.png` });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
};
const undo = () => page.locator('.cad-file-actions').getByRole('button', { name: 'Undo', exact: true }).click();
const shopOf = (model) => model.fabrication.shop;
const rearText = (scope) => rowsOf(scope).filter({ hasText: REAR }).first().locator('strong');

try {
  // 1. The user's file through Open.
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(SAMPLE);
  await page.getByText('Unsaved sketch changes will be lost. Continue?').waitFor();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await current();
  const openPart = async () => {
    await showTree();
    await page.locator('.cad-tree-item', { hasText: 'Sheet-metal part' }).first().click();
    return properties.getByLabel('Sheet metal', { exact: true });
  };
  let form = await openPart();
  await expect(summaryOf(form)).toHaveText(SAVED);
  measured.savedRear = await rearText(form).textContent();
  assert.equal(measured.savedRear, '0.73 mm · passes 1.22 mm beside it · ± 0.37 on the bench');
  const original = await savedWhen((m) => Boolean(m?.fabrication), 'the file');
  assert.equal('tolerance' in shopOf(original), false, 'the file has no tolerance');
  checks.push(`Open → "${SAVED}" (nothing may touch), the rear wall "${measured.savedRear}"`);

  // 2. Set all at 0.2: every corner may touch with the shop's usual figures.
  await form.getByRole('button', { name: 'Set all', exact: true }).click();
  await expect(summaryOf(form)).toHaveText(TOUCH);
  await expect(rearText(form)).toHaveText('0.20 mm · passes 0.20 mm beside it · ± 0.37 on the bench: may touch');
  measured.touching = [];
  for (const row of await rowsOf(form).all()) {
    const text = await row.locator('strong').textContent();
    assert.match(text, /: may touch$/, text);
    measured.touching.push(text.replace(/^.* ± /, '± '));
  }
  await current();
  await shot('01-set-all-may-touch', { focus: summaryOf(form) });
  checks.push(`Set all at 0.2 → "${TOUCH}", every row "… : may touch" (${[...new Set(measured.touching)].join(', ')})`);

  // 3. What the shop holds: a good CNC brake's figures, one settled field (one commit) each.
  const holds = form.locator('details', { has: page.getByText('What the shop holds', { exact: true }) });
  await holds.locator('summary').click();
  await expect(holds).toHaveJSProperty('open', true);
  for (const [label, from] of [
    ['Flange ± (mm)', '0.2'],
    ['Cut ± (mm)', '0.1'],
    ['Angle ± (°)', '1'],
  ])
    await expect(holds.getByLabel(label, { exact: true })).toHaveValue(from);
  for (const [label, value] of [
    ['Flange ± (mm)', '0.05'],
    ['Cut ± (mm)', '0.05'],
    ['Angle ± (°)', '0.25'],
  ]) {
    const field = holds.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  await expect(summaryOf(form)).toHaveText(CLEAR);
  await expect(rearText(form)).toHaveText('0.20 mm · passes 0.20 mm beside it · ± 0.10 on the bench');
  for (const row of await rowsOf(form).all())
    assert.doesNotMatch(await row.locator('strong').textContent(), /may touch/);
  const held = await savedWhen((m) => shopOf(m).tolerance?.angle === 0.25, 'the tolerance');
  measured.tolerance = shopOf(held).tolerance;
  assert.deepEqual(measured.tolerance, { flange: 0.05, cut: 0.05, angle: 0.25 });
  await shot('02-what-the-shop-holds', { focus: holds });
  checks.push(
    `What the shop holds: flange 0.05, cut 0.05, angle 0.25 → "${CLEAR}" (no row may touch), the rear wall ± 0.10; saved fabrication.shop.tolerance ${JSON.stringify(measured.tolerance)}`,
  );

  // 4. The press brake: the same band, read only.
  await shopStation('Bend');
  const brake = properties.getByRole('region', { name: 'Press brake' });
  await expect(brake).toBeVisible({ timeout: 20000 });
  const card = brake.getByRole('region', { name: 'Flange gaps' });
  await expect(summaryOf(card)).toHaveText(CLEAR);
  if (!(await rowsOf(card).first().isVisible()))
    await card.getByText('The gaps, nearest first', { exact: true }).click();
  await expect(rearText(card)).toHaveText('0.20 mm · passes 0.20 mm beside it · ± 0.10 on the bench');
  assert.equal(await card.getByText('What the shop holds', { exact: true }).count(), 0, 'no fields at the brake');
  await shot('03-brake-band', { focus: card });
  checks.push('brake: the same line and band, read only (no "What the shop holds" there)');

  // 5. Undo the three fields: the file's shop settings, "may touch" again.
  await brake.getByRole('button', { name: 'Leave press brake', exact: true }).click();
  form = await openPart();
  for (let i = 0; i < 3; i++) await undo();
  await expect(summaryOf(form)).toHaveText(TOUCH);
  const undone = await savedWhen((m) => !('tolerance' in shopOf(m)), 'the tolerance gone');
  assert.deepEqual(shopOf(undone), shopOf(original), 'the shop settings as the file had them');
  await shot('04-undone', { focus: summaryOf(form) });
  checks.push(`three Undos → "${TOUCH}", fabrication.shop as the file had it`);

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Corner gaps CG-4 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
