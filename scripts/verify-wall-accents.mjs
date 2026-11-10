/* global process, console, document, window, Image */
// The accent-panel guard (docs/wall-cladding-finishes.md §7.1, CL-3). On the
// playground, in the drafting plan style: make the long south wall framed,
// open the wall detail editor on its outside face from the Finishes section's
// "Edit accents", and add an accent to the right of its big window through
// "Add accent at opening" — its rectangle in the drawing must sit against the
// window's right jamb, the window's height, 600 wide. Move the window 300 mm
// along the wall in its own properties and the accent must have moved 300 mm
// with it. Draw a second accent with the Accent tool. The 3D preview must have
// turned Signal Orange beside the window. Undo back to no accents.
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-wall-accents.mjs
//   CLADDING_VERIFY_DIR=<folder for screenshots>   (default artifacts/floorplan/wall-cladding)
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = process.env.CLADDING_VERIFY_DIR || 'artifacts/floorplan/wall-cladding';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const CANVAS = 'svg[class*="_svg"]';
const PREVIEW = 'section[data-roof-colour]';
const EDITOR = '[role="dialog"][aria-label="Wall assembly detail editor"]';
const WALL_ID = 'wall_mmh5i4w4_3';
const WINDOW_ID = 'win_mmh61b76_13';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [],
  consoleErrors = [],
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
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() !== 'error' || /Failed to load resource/.test(text)) return;
    // The editor's check list has a known duplicate-key warning when both faces
    // raise the same product-profile check (seen in the CL-1 audit, not CL-3's).
    if (/Encountered two children with the same key/.test(text)) return;
    consoleErrors.push(text);
  });
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('floorplan.plan.style', 'drafting');
    } catch {
      /* not needed for the checks below */
    }
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForSelector(PREVIEW, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.selectOption('select[aria-label="Preview view preset"]', 'iso_northwest');
  await page.waitForTimeout(1200);

  const preview = () => page.locator(`${PREVIEW} canvas`).first();
  const fieldSelect = (label, scope = '') =>
    page.locator(`${scope} label:has(> span:text-is("${label}")) select`).first();
  const fieldInput = (label, scope = '') =>
    page.locator(`${scope} label:has(> span:text-is("${label}")) input`).first();
  const clickText = (scope, text) => page.locator(`${scope} button`, { hasText: text }).first().click();
  const readout = (label) =>
    page.evaluate((text) => {
      const row = [...document.querySelectorAll('div')].find(
        (node) => node.firstElementChild?.textContent?.trim() === text && node.children.length >= 3,
      );
      return row ? row.children[2].textContent.trim() : null;
    }, label);
  const shot = async (name) => {
    await page.waitForTimeout(3500);
    const path = `${directory}/${name}.png`;
    await preview().screenshot({ path });
    screenshots.push(path);
    return path;
  };
  const pickWall = async () => {
    const box = await preview().boundingBox();
    for (const [fx, fy] of [
      [0.6, 0.66],
      [0.75, 0.66],
      [0.6, 0.72],
      [0.75, 0.6],
    ]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(800);
      if (await page.evaluate((id) => document.body.innerText.includes(id), WALL_ID)) return true;
    }
    return false;
  };
  const deselect = async () => {
    const box = await preview().boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.06);
    await page.waitForTimeout(600);
  };
  const accentRects = () =>
    page.evaluate(
      (editor) =>
        [...document.querySelectorAll(`${editor} [data-accent-id]`)].map((node) => ({
          id: node.getAttribute('data-accent-id'),
          x: Number(node.getAttribute('x')),
          y: Number(node.getAttribute('y')),
          width: Number(node.getAttribute('width')),
          height: Number(node.getAttribute('height')),
        })),
      EDITOR,
    );
  // The big window's void on the drawing: 2700 wide in the playground.
  const windowVoid = () =>
    page.evaluate((editor) => {
      const voids = [...document.querySelectorAll(`${editor} rect[class*="openingVoid"]`)].map((node) => ({
        x: Number(node.getAttribute('x')),
        y: Number(node.getAttribute('y')),
        width: Number(node.getAttribute('width')),
        height: Number(node.getAttribute('height')),
      }));
      return voids.sort((a, b) => b.width - a.width)[0] || null;
    }, EDITOR);
  const openEditorOnOutside = async () => {
    await page.locator('[data-wall-finish-face="exterior"] button', { hasText: 'Edit accents' }).click();
    await page.waitForSelector(`${EDITOR} svg[data-tool]`, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const accentsOpen = await page
      .locator(`${EDITOR} button[aria-expanded]`, { hasText: 'Accent panels' })
      .first()
      .getAttribute('aria-expanded');
    if (accentsOpen !== 'true') await clickText(EDITOR, 'Accent panels');
    await page.waitForTimeout(300);
  };
  const closeEditor = async () => {
    await page.locator(`${EDITOR} header button`, { hasText: /^Close$/ }).click();
    await page.waitForTimeout(800);
  };

  check(`picking the south wall in 3D selects ${WALL_ID}`, await pickWall());
  await fieldSelect('Assembly').selectOption('fiber_cement');
  await page.waitForTimeout(900);
  check(
    `the wall is framed and its outside face has no accents (${await readout('Outside accents')})`,
    (await readout('Outside accents')) === '0',
  );
  await deselect();
  const before = await shot('accents-before');
  check('the wall is picked again', await pickWall());

  // 1. An accent to the right of the big window, from "Add accent at opening".
  await openEditorOnOutside();
  await fieldSelect('Opening', `${EDITOR} [data-accent-at-opening]`).selectOption(WINDOW_ID);
  await fieldSelect('Placement', `${EDITOR} [data-accent-at-opening]`).selectOption('right');
  await clickText(`${EDITOR} [data-accent-at-opening]`, 'Add accent at opening');
  await page.waitForTimeout(1200);
  const [placed] = await accentRects();
  const jamb = await windowVoid();
  check(
    `the accent sits against the window's right jamb, its height, 600 wide (accent x ${placed?.x} w ${placed?.width} y ${placed?.y} h ${placed?.height}; window x ${jamb?.x} w ${jamb?.width} y ${jamb?.y} h ${jamb?.height})`,
    Boolean(placed && jamb) &&
      Math.abs(placed.x - (jamb.x + jamb.width)) < 0.5 &&
      placed.width === 600 &&
      Math.abs(placed.y - jamb.y) < 0.5 &&
      Math.abs(placed.height - jamb.height) < 0.5,
  );
  await page.screenshot({ path: `${directory}/accents-editor.png` });
  screenshots.push(`${directory}/accents-editor.png`);
  await closeEditor();

  // 2. Move the window 300 mm along the wall, in the window's own properties.
  // On the plan a window outranks the beam over its wall, so it can be clicked.
  const canvasBox = await page.locator(CANVAS).first().boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  // The window group also holds its swing and tag; its own outline is the
  // polygon on the wall line, which is what the plan hit-tests.
  const windowShape = page.locator(`${CANVAS} [data-id="${WINDOW_ID}"] > polygon`).first();
  const onCanvas = (box) =>
    box &&
    box.x > canvasBox.x &&
    box.y > canvasBox.y &&
    box.x + box.width < canvasBox.x + canvasBox.width &&
    box.y + box.height < canvasBox.y + canvasBox.height - 40;
  for (let step = 0; step < 12 && !onCanvas(await windowShape.boundingBox()); step += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);
  const windowBox = await windowShape.boundingBox();
  check('the window is on the plan canvas', onCanvas(windowBox));
  await page.mouse.click(windowBox.x + windowBox.width / 2, windowBox.y + windowBox.height / 2);
  await page.waitForTimeout(800);
  const placementOpen = await page
    .locator('button[aria-expanded]', { hasText: 'Placement' })
    .first()
    .getAttribute('aria-expanded')
    .catch(() => null);
  if (placementOpen === 'false') await page.locator('button[aria-expanded]', { hasText: 'Placement' }).first().click();
  const along = fieldInput('Along wall');
  const offset = Number(await along.inputValue());
  await along.fill(String(offset + 300));
  await along.press('Enter');
  await page.waitForTimeout(1200);
  check(
    `the window moved 300 mm along the wall (${offset.toFixed(1)} → ${await along.inputValue()})`,
    Math.abs(Number(await along.inputValue()) - (offset + 300)) < 0.5,
  );

  // Back to the wall, back into the editor: the accent followed the window.
  await deselect();
  check('the wall is picked again after the window move', await pickWall());
  await openEditorOnOutside();
  const [followed] = await accentRects();
  const movedJamb = await windowVoid();
  const delta = Math.abs((followed?.x ?? 0) - (placed?.x ?? 0));
  check(
    `the accent moved with the window (Δx ${delta.toFixed(1)} mm on a face drawn ${followed?.x < placed?.x ? 'mirrored' : 'straight'}) and still meets its jamb`,
    Boolean(followed) &&
      Math.abs(delta - 300) < 0.5 &&
      Math.abs(
        Math.min(
          Math.abs(followed.x - (movedJamb.x + movedJamb.width)),
          Math.abs(followed.x + followed.width - movedJamb.x),
        ),
      ) < 0.5,
  );

  // 3. A second accent, drawn with the tool.
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  const svg = page.locator(`${EDITOR} svg[data-tool]`).first();
  check(
    `the A key arms the Accent tool (${await svg.getAttribute('data-tool')})`,
    (await svg.getAttribute('data-tool')) === 'draw_accent',
  );
  const svgBox = await svg.boundingBox();
  const from = { x: svgBox.x + svgBox.width * 0.08, y: svgBox.y + svgBox.height * 0.5 };
  const to = { x: svgBox.x + svgBox.width * 0.14, y: svgBox.y + svgBox.height * 0.8 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / 10, from.y + ((to.y - from.y) * step) / 10);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const drawn = await accentRects();
  check(`the Accent tool drew a second accent (${drawn.length} on the face)`, drawn.length === 2);
  await closeEditor();

  // 4. The 3D preview: orange beside the window.
  await deselect();
  const after = await shot('accents-after');
  const changed = await page.evaluate(
    async ([a, b]) => {
      const load = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [first, second] = await Promise.all([load(a), load(b)]);
      let orangeish = 0;
      for (let index = 0; index < first.length; index += 4) {
        if (second[index] - second[index + 2] > 70 && first[index] - first[index + 2] < 40) orangeish += 1;
      }
      return { orangeish };
    },
    [(await readFile(before)).toString('base64'), (await readFile(after)).toString('base64')],
  );
  check(
    `the 3D preview turned Signal Orange beside the window (${changed.orangeish} newly orange px)`,
    changed.orangeish > 300,
  );

  // 5. Undo back to no accents. Opening the editor from "Edit accents" is an
  // edit of its own (it switches the face's detailing on), so the history
  // holds more than the three accent edits; undo one step at a time, reading
  // the face after each, until it has none.
  check('the wall is picked again before the undos', await pickWall());
  const counts = [];
  for (let step = 0; step < 8; step += 1) {
    const current = await readout('Outside accents');
    if (current === '0' || current === null) break;
    await page.click('button[aria-label="Undo"]');
    await page.waitForTimeout(700);
    // Undo drops the selection, so the wall is picked again to read it.
    await pickWall();
    counts.push(await readout('Outside accents'));
  }
  check(
    `Undo walks the face back to no accents (${counts.join(' → ')}, ${counts.length} undos)`,
    counts.at(-1) === '0',
  );
  await deselect();
  await shot('accents-after-undo');

  check(`no page errors (${errors.length})`, errors.length === 0, `Page errors:\n${errors.join('\n')}`);
  check(
    `no console errors (${consoleErrors.length})`,
    consoleErrors.length === 0,
    `Console errors:\n${consoleErrors.join('\n').slice(0, 3000)}`,
  );
  if (failures.length) throw new Error(`Wall accent failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/accents-verification.json`,
    JSON.stringify({ status: 'passed', errors, consoleErrors, checks, screenshots }, null, 2),
  );
  console.log(
    'Wall accent verification passed:\n- ' + checks.join('\n- ') + '\nScreenshots:\n- ' + screenshots.join('\n- '),
  );
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/accents-failure.png` });
  console.error('Checks so far:\n- ' + checks.join('\n- '));
  console.error(errors, consoleErrors.slice(0, 5));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
