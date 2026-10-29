import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const directory = 'artifacts/sketch-cad/engineering';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const current = () => page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
const generate = async () => {
  await current();
  await page.getByRole('button', { name: 'Generate views', exact: true }).click();
  await page.locator('.cad-sheet-preview svg').waitFor({ timeout: 60000 });
};
const download = async (button, name) => {
  const pending = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: button, exact: true }).click();
  const result = await pending;
  await result.saveAs(`${directory}/${name}`);
  await expect(page.getByRole('button', { name: button, exact: true })).toBeEnabled();
};
try {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://127.0.0.1:5180/sketch');
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await page.locator('.cad-empty').getByRole('button', { name: 'Pump bracket drawing study', exact: true }).click();
  await generate();
  await page.getByLabel('Drawing sheet', { exact: true }).selectOption({ label: 'Pump bracket — dimensioned part' });
  await expect(page.locator('.cad-sheet-preview svg')).toContainText('5 × Ø25 THRU');
  await page.screenshot({ path: `${directory}/workspace.png` });
  await page.locator('.cad-sheet-preview svg').screenshot({ path: `${directory}/part-sheet.png` });
  await download('SVG sheet', 'pump-bracket.svg');
  await download('DXF sheet', 'pump-bracket.dxf');
  await download('Vector PDF', 'pump-bracket.pdf');
  const svg = await readFile(`${directory}/pump-bracket.svg`, 'utf8');
  const dxf = await readFile(`${directory}/pump-bracket.dxf`, 'utf8');
  if (!svg.includes('5 × Ø25 THRU') || !dxf.includes('5 × Ø25 THRU')) throw new Error('Export lost the hole callout.');
  if (!(await readFile(`${directory}/pump-bracket.pdf`)).subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new Error('Invalid PDF.');
  await page.getByRole('button', { name: 'Named parameters', exact: false }).click();
  const pitch = page.getByLabel('holePitch', { exact: true });
  await pitch.fill('28');
  await pitch.press('Enter');
  await generate();
  await expect(page.locator('.cad-sheet-preview svg text').filter({ hasText: /^28$/ })).toHaveCount(4);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await generate();
  await expect(page.locator('.cad-sheet-preview svg text').filter({ hasText: /^30$/ })).toHaveCount(4);
  await page.getByRole('button', { name: 'Sheet properties', exact: true }).click();
  const number = page.getByLabel('Drawing number', { exact: true });
  await number.fill('COMPANY-001');
  await number.press('Enter');
  await generate();
  await expect(page.locator('.cad-sheet-preview svg')).toContainText('COMPANY-001');
  await page.waitForTimeout(800);
  await page.reload();
  await current();
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await generate();
  await page.getByLabel('Drawing sheet', { exact: true }).selectOption({ label: 'Pump bracket — dimensioned part' });
  await expect(page.locator('.cad-sheet-preview svg')).toContainText('COMPANY-001');
  await expect(page.locator('.cad-sheet-preview svg')).toContainText('5 × Ø25 THRU');
  // Add the example again: remapped feature/instance IDs must stay valid.
  await page.getByRole('button', { name: 'Pump bracket example', exact: true }).click();
  await generate();
  await expect(page.locator('.cad-sheet-preview svg')).toContainText('REFERENCE STUDY');
  const options = await page.getByLabel('Drawing sheet', { exact: true }).locator('option').allTextContents();
  if (options.length !== 4) throw new Error('Appending an example replaced existing drawing sheets.');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: `${directory}/workspace-1366.png` });
  await page.getByLabel('Drawing sheet', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Section sheet', exact: true }).click();
  const cutPosition = page.getByLabel('Cut position X', { exact: true });
  await cutPosition.fill('3');
  await cutPosition.press('Enter');
  await generate();
  await expect(page.locator('.cad-sheet-preview svg')).toContainText('SECTION A-A');
  await expect(page.locator('.cad-sheet-preview svg path[fill-rule="evenodd"]')).not.toHaveCount(0);
  await page.locator('.cad-sheet-preview svg').screenshot({ path: `${directory}/section-sheet.png` });
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify(
      {
        status: 'passed',
        errors,
        checks: [
          'real kernel bracket',
          'dimensioned sheet',
          'SVG/DXF/PDF',
          'parameter-linked dimensions',
          'undo',
          'title block editing',
          'recovery reopen',
          'append preserves sheets and remaps references',
          '1366px layout',
          'section plane controls and cut-face hatching',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Engineering drawing browser checks passed.');
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
