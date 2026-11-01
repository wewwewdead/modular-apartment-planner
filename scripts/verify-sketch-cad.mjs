import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts/sketch-cad', { recursive: true });
try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://127.0.0.1:5180/sketch');
  await page.getByRole('button', { name: '3D Model & workshop' }).click();
  await page.getByRole('button', { name: 'Welded table example', exact: true }).click();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: 'artifacts/sketch-cad/model-1366.png' });
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await page.getByRole('button', { name: 'Generate views', exact: true }).click();
  await page.locator('.cad-sheet-preview svg').waitFor({ timeout: 60000 });
  await page.screenshot({ path: 'artifacts/sketch-cad/drawing-1366.png' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'artifacts/sketch-cad/drawing-1920.png' });
  await page.getByRole('button', { name: /Named parameters/ }).click();
  const width = page.getByLabel('width', { exact: true });
  await width.fill('1400');
  await width.press('Enter');
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Manufacture', exact: true }).click();
  await page.getByRole('button', { name: 'Cutting list', exact: true }).click();
  await page.screenshot({ path: 'artifacts/sketch-cad/cuts-1920.png' });
  const downloaded = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Workshop ZIP', exact: true }).click();
  const file = await downloaded;
  await file.saveAs('artifacts/sketch-cad/workshop.zip');
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await page.getByRole('button', { name: 'Sketch from fields', exact: true }).click();
  await page.getByLabel('Profile', { exact: true }).selectOption('circle');
  await page.getByRole('button', { name: 'Create sketch', exact: true }).click();
  await page.getByRole('button', { name: 'Enable PlaneGCS constraints', exact: true }).click();
  await page.getByLabel('Constraint', { exact: true }).selectOption('radius');
  await page.getByLabel('c_id', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('radius (mm)', { exact: true }).last().fill('20');
  await page.getByLabel('radius (mm)', { exact: true }).last().press('Enter');
  await page.getByRole('button', { name: 'Add constraint', exact: true }).click();
  await page.getByRole('button', { name: 'Extrude as new part', exact: true }).click();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: 'artifacts/sketch-cad/constrained-part.png' });
  await writeFile(
    'artifacts/sketch-cad/browser-verification.json',
    JSON.stringify(
      {
        errors,
        status: 'passed',
        checks: [
          '1366x768',
          '1920x1080',
          'model',
          'linked drawings',
          'parameter edit',
          'undo',
          'redo',
          'workshop ZIP',
          'recovery reopen',
          'PlaneGCS constrained circle extruded as part',
        ],
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Browser CAD verification passed.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/sketch-cad/failure.png' });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
