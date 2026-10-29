import { chromium, _electron as electron } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { furnitureExample } from '../src/features/sketchstudio/cad/examples.js';
const workspace = {
  kind: 'sketchstudio-workspace',
  version: 2,
  document: {
    id: 'offline-test',
    name: 'Offline welded table',
    version: 4,
    units: 'mm',
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
    entities: [],
    model: furnitureExample(),
  },
  ui: { workspaceMode: 'model' },
  viewport: { zoom: 1, panX: 0, panY: 0 },
};
await mkdir('artifacts/sketch-cad', { recursive: true });
const results = [];
async function verifyOfflinePreview(page) {
  await page.getByRole('button', { name: /desktop/i }).first().click();
  await page.getByRole('button', { name: 'Solid', exact: true }).click();
  await page.getByRole('button', { name: 'Extrude', exact: true }).click();
  await page.getByText('Preview ready', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Cancel operation', exact: true }).click();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
}
if (!process.argv.includes('--electron-only')) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } }),
      page = await context.newPage();
    await page.goto('http://127.0.0.1:5181/');
    await page.evaluate(
      (workspace) => localStorage.setItem('apartment-planner-sketch-recovery', JSON.stringify(workspace)),
      workspace,
    );
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.goto('http://127.0.0.1:5181/sketch');
    await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
    const wasmCached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const requests = (await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()))).flat();
      return requests.filter((r) => r.url.endsWith('.wasm')).map((r) => r.url);
    });
    if (wasmCached.length < 2) throw new Error('CAD WASM modules were not precached.');
    await context.setOffline(true);
    await page.reload();
    await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Drawings', exact: true }).click();
    await page.getByRole('button', { name: 'Generate views', exact: true }).click();
    await page.locator('.cad-sheet-preview svg').waitFor({ timeout: 60000 });
    await page.screenshot({ path: 'artifacts/sketch-cad/browser-offline.png' });
    await verifyOfflinePreview(page);
    results.push({ browserOffline: true, cachedWasm: wasmCached.length, operationPreviewOffline: true });
  } finally {
    await browser.close();
  }
}
const app = await electron.launch({ args: ['scripts/electron-cad-harness.cjs'] });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(
    (workspace) => localStorage.setItem('apartment-planner-sketch-recovery', JSON.stringify(workspace)),
    workspace,
  );
  await page.evaluate(() => {
    location.hash = '/sketch';
  });
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: 'artifacts/sketch-cad/electron-1366.png' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Drawings', exact: true }).click();
  await page.getByRole('button', { name: 'Generate views', exact: true }).click();
  await page.locator('.cad-sheet-preview svg').waitFor({ timeout: 60000 });
  await page.screenshot({ path: 'artifacts/sketch-cad/electron-1920.png' });
  await verifyOfflinePreview(page);
  // Cause a real worker exception, confirm last geometry stays, then undo and recover.
  await page.getByRole('button', { name: /Named parameters/ }).click();
  await page.getByLabel('wall', { exact: true }).fill('100');
  await page.getByLabel('wall', { exact: true }).press('Enter');
  await page.getByText('Rebuild failed', { exact: true }).waitFor({ timeout: 30000 });
  if ((await page.locator('.cad-viewport canvas').count()) !== 1) throw new Error('Last valid viewport was lost.');
  await page.getByRole('button', { name: 'Manufacture', exact: true }).click();
  if (await page.getByRole('button', { name: 'Workshop ZIP', exact: true }).isEnabled())
    throw new Error('Stale export was allowed.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await page.reload();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  if (errors.length) throw new Error(errors.join('\n'));
  results.push({
    electronFileOffline: true,
    sizes: ['1366x768', '1920x1080'],
    failureRecovery: true,
    staleExportBlocked: true,
    reopen: true,
    operationPreviewOffline: true,
  });
} catch (error) {
  const page = await app.firstWindow();
  await page.screenshot({ path: 'artifacts/sketch-cad/electron-failure.png' });
  console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await app.close();
}
await writeFile('artifacts/sketch-cad/offline-verification.json', JSON.stringify(results, null, 2));
console.log('Offline browser and Electron CAD verification passed.');
