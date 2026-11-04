/* global process, console, document */
// The roof covering guard (docs/roof-truss-industrial.md §5.6, RT-1). On the
// playground project: Roof mode, set the covering colour to Colorbond Manor
// Red, and the 3D preview root must carry data-roof-colour="#5E1D0E" (the
// palette mutation is driven from the same appearance object); screenshots of
// the preview before and after for the audit; select the roof, switch the
// fascia off in "Edges & trims", and the roof's inspect card Trims row must
// drop it.
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-roof-covering.mjs
//   ROOF_VERIFY_DIR=<folder for screenshots>   (default artifacts/floorplan/roof-covering)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = process.env.ROOF_VERIFY_DIR || 'artifacts/floorplan/roof-covering';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const CANVAS = 'svg[class*="_svg"]';
const PREVIEW = 'section[data-roof-colour]';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [],
  checks = [],
  failures = [],
  screenshots = [];
let page = null;

const check = (line, ok, failure = line) => {
  checks.push(`${ok ? 'ok' : 'FAIL'} — ${line}`);
  if (!ok) failures.push(failure);
};

try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForSelector(PREVIEW, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const clickButtonText = async (text) => {
    const found = await page.evaluate((t) => {
      const node = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
      node?.click();
      return Boolean(node);
    }, text);
    assert(found, `button "${text}" exists`);
    await page.waitForTimeout(500);
  };
  const roofColour = () =>
    page.evaluate((selector) => document.querySelector(selector)?.getAttribute('data-roof-colour'), PREVIEW);
  const previewShot = async (name) => {
    // Let the progressive refine settle so the picture is the real one.
    await page.waitForTimeout(2500);
    const canvas = page.locator(`${PREVIEW} canvas`).first();
    const path = `${directory}/${name}.png`;
    await canvas.screenshot({ path });
    screenshots.push(path);
  };
  const trimsRow = () =>
    page.evaluate(() => {
      const row = [...document.querySelectorAll('[class*="inspectRow"]')].find(
        (node) => node.firstElementChild?.textContent.trim() === 'Trims',
      );
      return row ? row.lastElementChild.textContent.trim() : null;
    });

  // A corner view shows the eaves, the gutters and the hips at once.
  await page.selectOption('select[aria-label="Preview view preset"]', 'iso_southeast');
  await page.waitForTimeout(800);

  await clickButtonText('Roof');
  const initial = await roofColour();
  check(
    `preview root starts on the legacy-backfilled Shale Grey (data-roof-colour="${initial}")`,
    initial === '#BDBFBA',
  );
  await previewShot('roof-shale-grey');

  const coveringOpen = await page.evaluate(
    () =>
      [...document.querySelectorAll('button[aria-expanded]')]
        .find((node) => node.textContent.trim().startsWith('Covering'))
        ?.getAttribute('aria-expanded') === 'true',
  );
  check('Covering section renders open in Roof mode', coveringOpen);

  const picked = await page.evaluate(() => {
    const swatch = document.querySelector('[data-colour-field="roof-covering-colour"] [data-swatch="Manor Red"]');
    swatch?.click();
    return Boolean(swatch);
  });
  check('the Manor Red swatch exists in the Colorbond strip', picked);
  await page.waitForTimeout(600);
  const after = await roofColour();
  check(`preview root carries data-roof-colour="${after}" after picking Manor Red`, after === '#5E1D0E');
  await previewShot('roof-manor-red');

  // Select the roof by clicking it in the 3D preview (a plan click in Roof
  // mode picks a roof plane, not the roof). The Iso SE view puts the roof's
  // hips at the middle of the pane; try a few points down its slope.
  const canvasBox = await page.locator(`${PREVIEW} canvas`).first().boundingBox();
  assert(canvasBox, 'the 3D preview canvas has a box');
  for (const [fx, fy] of [
    [0.5, 0.42],
    [0.45, 0.45],
    [0.55, 0.4],
    [0.5, 0.36],
  ]) {
    await page.mouse.click(canvasBox.x + canvasBox.width * fx, canvasBox.y + canvasBox.height * fy);
    await page.waitForTimeout(700);
    if (await trimsRow()) break;
  }
  const trimsBefore = await trimsRow();
  check(`roof inspect card Trims row reads "${trimsBefore}"`, Boolean(trimsBefore) && trimsBefore.startsWith('Fascia'));

  // Edges & trims is folded by default; open it and switch the fascia off.
  await page.evaluate(() => {
    const head = [...document.querySelectorAll('button[aria-expanded]')].find((node) =>
      node.textContent.trim().startsWith('Edges & trims'),
    );
    if (head?.getAttribute('aria-expanded') === 'false') head.click();
  });
  await page.waitForTimeout(400);
  const toggled = await page.evaluate(() => {
    const box = document.querySelector('input[type="checkbox"][aria-label="Fascia"]');
    if (!box || !box.checked) return false;
    box.click();
    return true;
  });
  check('the Fascia switch was on and is clicked off', toggled);
  await page.waitForTimeout(700);
  const trimsAfter = await trimsRow();
  check(
    `Trims row after fascia off reads "${trimsAfter}"`,
    Boolean(trimsAfter) && trimsAfter !== trimsBefore && !trimsAfter.includes('Fascia'),
  );
  const colourKept = await roofColour();
  check(`the roof colour survives the trim edit (${colourKept})`, colourKept === '#5E1D0E');
  // Click the sky to drop the selection tint, so the picture shows the colours.
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.06);
  await page.waitForTimeout(500);
  await previewShot('roof-manor-red-no-fascia');

  // Fascia back on, and a close look at the eave corner for the audit.
  const restored = await page.evaluate(() => {
    const box = document.querySelector('input[type="checkbox"][aria-label="Fascia"]');
    if (!box || box.checked) return false;
    box.click();
    return true;
  });
  check('the Fascia switch turns back on', restored);
  await page.waitForTimeout(600);
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.46, canvasBox.y + canvasBox.height * 0.61);
  for (let step = 0; step < 6; step += 1) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);
  }
  await previewShot('roof-eave-closeup');

  check(`no page errors (${errors.length})`, errors.length === 0, `Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Roof covering failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, screenshots }, null, 2),
  );
  console.log(
    'Roof covering verification passed:\n- ' + checks.join('\n- ') + '\nScreenshots:\n- ' + screenshots.join('\n- '),
  );
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/failure.png` });
  console.error('Checks so far:\n- ' + checks.join('\n- '));
  console.error(errors);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
