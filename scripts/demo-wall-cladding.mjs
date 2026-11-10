/* global process, console, document */
// The reference-look demonstration (docs/wall-cladding-finishes.md §7.1): drive
// the playground, in the browser only — nothing is saved into the demo project
// — to something like the reference photo: the ground-floor facade painted
// Warm White and the storey above Slate Blue, Signal Orange accents beside the
// windows of both, and plank siding on the west wall. Realistic pictures from
// two angles go to artifacts/floorplan/wall-cladding/reference-look-*.png.
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/demo-wall-cladding.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const directory = process.env.CLADDING_VERIFY_DIR || 'artifacts/floorplan/wall-cladding';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const PREVIEW = 'section[data-roof-colour]';
const EDITOR = '[role="dialog"][aria-label="Wall assembly detail editor"]';

// Where each wall can be clicked in the Iso NW preset (probed on the playground).
const WALLS = {
  groundSouth: {
    id: 'wall_mmh5i4w4_3',
    points: [
      [0.75, 0.6],
      [0.85, 0.6],
      [0.6, 0.66],
      [0.75, 0.66],
    ],
  },
  // The storey above: a grid over the upper half of the right-hand face —
  // a click through one of its windows lands on an inside wall instead.
  upperSouth: {
    id: 'wall_mmhoiwq0_h3',
    points: [0.44, 0.47, 0.5, 0.53, 0.56].flatMap((fy) =>
      [0.58, 0.63, 0.68, 0.73, 0.78, 0.83, 0.88].map((fx) => [fx, fy]),
    ),
  },
  groundWest: {
    id: 'wall_mmh5hyfe_2',
    points: [
      [0.1, 0.6],
      [0.2, 0.6],
      [0.15, 0.65],
    ],
  },
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [];
let page = null;
try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(PREVIEW, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.selectOption('select[aria-label="Preview render style"]', 'realistic');
  await page.selectOption('select[aria-label="Preview view preset"]', 'iso_northwest');
  await page.waitForTimeout(1500);

  const preview = () => page.locator(`${PREVIEW} canvas`).first();
  const fieldSelect = (label, scope = '') =>
    page.locator(`${scope} label:has(> span:text-is("${label}")) select`).first();
  const pick = async ({ id, points }) => {
    // Reset the camera each time: a pick point is only good for the preset.
    await page.selectOption('select[aria-label="Preview view preset"]', 'free');
    await page.selectOption('select[aria-label="Preview view preset"]', 'iso_northwest');
    await page.waitForTimeout(900);
    const box = await preview().boundingBox();
    for (const [fx, fy] of points) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(800);
      if (await page.evaluate((wallId) => document.body.innerText.includes(wallId), id)) return;
    }
    throw new Error(`could not pick ${id}`);
  };
  const deselect = async () => {
    const box = await preview().boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.06);
    await page.waitForTimeout(500);
  };
  const paintOutside = async (swatch) => {
    await fieldSelect('Outside finish').selectOption('paint');
    await page.waitForTimeout(500);
    await page.locator(`[data-colour-field="wall-finish-exterior-colour"] [data-swatch="${swatch}"]`).click();
    await page.waitForTimeout(700);
  };
  const accentsBesideWindows = async () => {
    await page.locator('[data-wall-finish-face="exterior"] button', { hasText: 'Edit accents' }).click();
    await page.waitForSelector(`${EDITOR} svg[data-tool]`, { timeout: 30000 });
    await page.waitForTimeout(1000);
    const header = page.locator(`${EDITOR} button[aria-expanded]`, { hasText: 'Accent panels' }).first();
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
    const scope = `${EDITOR} [data-accent-at-opening]`;
    const windows = await fieldSelect('Opening', scope).evaluate((select) =>
      [...select.options].filter((option) => option.textContent.startsWith('Window')).map((option) => option.value),
    );
    for (const opening of windows) {
      await fieldSelect('Opening', scope).selectOption(opening);
      await fieldSelect('Placement', scope).selectOption('right');
      await page.locator(`${scope} button`, { hasText: 'Add accent at opening' }).click();
      await page.waitForTimeout(700);
    }
    await page.locator(`${EDITOR} header button`, { hasText: /^Close$/ }).click();
    await page.waitForTimeout(800);
    return windows.length;
  };

  // Ground floor: framed, Warm White, orange beside its windows.
  await pick(WALLS.groundSouth);
  await fieldSelect('Assembly').selectOption('fiber_cement');
  await page.waitForTimeout(800);
  await paintOutside('Warm White');
  const groundAccents = await accentsBesideWindows();
  await deselect();

  // The storey above: Slate Blue, orange beside its windows too.
  await pick(WALLS.upperSouth);
  await fieldSelect('Assembly').selectOption('fiber_cement');
  await page.waitForTimeout(800);
  await paintOutside('Slate Blue');
  const upperAccents = await accentsBesideWindows();
  await deselect();

  // Plank siding on the west wall.
  await pick(WALLS.groundWest);
  await fieldSelect('Assembly').selectOption('fiber_cement');
  await page.waitForTimeout(800);
  await fieldSelect('Outside board').selectOption('siding');
  await page.waitForTimeout(800);
  await deselect();

  await page.click('button[aria-label="Focus preview"]');
  await page.waitForTimeout(1500);
  const shots = [];
  for (const [name, preset] of [
    ['iso-northwest', 'iso_northwest'],
    ['front', 'elevation_front'],
  ]) {
    await page.selectOption('select[aria-label="Preview view preset"]', preset);
    await page.waitForTimeout(1200);
    if (preset === 'iso_northwest') {
      // The focused pane is wider than it is tall: step back so the whole
      // building, ground floor included, is in the picture.
      const box = await preview().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let step = 0; step < 3; step += 1) {
        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(160);
      }
    }
    await page.waitForTimeout(6000);
    const path = `${directory}/reference-look-${name}.png`;
    await preview().screenshot({ path });
    shots.push(path);
  }
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log(
    `Reference look: ${groundAccents} accents on the ground floor, ${upperAccents} above.\n- ${shots.join('\n- ')}`,
  );
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/reference-look-failure.png` });
  console.error(errors);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
