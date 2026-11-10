/* global process, console, document, window, Image, Event, setTimeout */
// The wall-finish guard (docs/wall-cladding-finishes.md §5.8, CL-1). On the
// playground project, in the drafting plan style: select the long south wall,
// make it a framed fibre-cement wall, set its outside finish to Paint and pick
// Signal Orange; the plan's outside skin must carry the colour as its fill and
// data-finish-kind="paint", and the 3D preview must change. A colour-picker
// drag is then driven as a burst of `input` events closed by `change`, and one
// Undo must take the whole drag back. Undoing the swatch and then the kind puts
// the face back to stock. 3D screenshots before and after for the audit.
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-wall-cladding.mjs
//   CLADDING_VERIFY_DIR=<folder for screenshots>   (default artifacts/floorplan/wall-cladding)
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = process.env.CLADDING_VERIFY_DIR || 'artifacts/floorplan/wall-cladding';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const CANVAS = 'svg[class*="_svg"]';
const PREVIEW = 'section[data-roof-colour]';
// The ground floor's south wall, drawn west → east: with the inside on the left
// of start → end (the default), its outside faces +y, out of the building and
// towards the camera of the Iso NW preset.
const WALL_ID = 'wall_mmh5i4w4_3';
const SKIN = `polygon[data-type="wall-board-skin"][data-wall-id="${WALL_ID}"][data-assembly-side="exterior"]`;
const COLOUR_FIELD = '[data-colour-field="wall-finish-exterior-colour"]';
const STOCK_FIBRE_CEMENT_FILL = '#d8d6cf';

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
  // The skins are drafting-style markup; the canvas defaults to presentation.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('floorplan.plan.style', 'drafting');
    } catch {
      /* the check below reports a missing skin */
    }
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForSelector(PREVIEW, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.selectOption('select[aria-label="Preview view preset"]', 'iso_northwest');
  await page.waitForTimeout(800);

  const previewShot = async (name) => {
    // Let the progressive refine settle so the picture is the real one.
    await page.waitForTimeout(3500);
    const path = `${directory}/${name}.png`;
    await page.locator(`${PREVIEW} canvas`).first().screenshot({ path });
    screenshots.push(path);
    return path;
  };
  const skin = () =>
    page.evaluate((selector) => {
      const node = document.querySelector(selector);
      return node ? { fill: node.getAttribute('fill'), kind: node.getAttribute('data-finish-kind') } : null;
    }, SKIN);
  const fieldSelect = (label) => page.locator(`label:has(> span:text-is("${label}")) select`).first();
  const undo = async () => {
    await page.click('button[aria-label="Undo"]');
    await page.waitForTimeout(700);
  };

  // Select the wall in the 3D preview. On the plan it cannot be clicked: a
  // 250 mm beam runs over its whole length between the columns, and the plan's
  // hit test gives a beam priority over the wall under it. In the Iso NW
  // preset this wall is the right-hand face of the model (probed on the
  // playground); try points on its ground storey until the panel names it.
  const previewBox = await page.locator(`${PREVIEW} canvas`).first().boundingBox();
  assert(previewBox, 'the 3D preview canvas has a box');
  const selectedWall = () => page.evaluate((id) => document.body.innerText.includes(id), WALL_ID);
  const pickWall = async () => {
    for (const [fx, fy] of [
      [0.6, 0.66],
      [0.75, 0.66],
      [0.6, 0.72],
      [0.75, 0.6],
      [0.68, 0.69],
    ]) {
      await page.mouse.click(previewBox.x + previewBox.width * fx, previewBox.y + previewBox.height * fy);
      await page.waitForTimeout(800);
      if (await selectedWall()) return true;
    }
    return false;
  };
  // The selection tint would wash the finish out of the pictures: click the
  // sky to drop it before each one, then pick the wall again.
  const deselect = async () => {
    await page.mouse.click(previewBox.x + previewBox.width * 0.5, previewBox.y + previewBox.height * 0.06);
    await page.waitForTimeout(600);
  };
  check(`picking the south wall in 3D selects ${WALL_ID}`, await pickWall());
  const assembly = fieldSelect('Assembly');
  check('the wall properties are open (Assembly field present)', (await assembly.count()) === 1);

  // Make it framed: fibre cement both faces.
  await assembly.selectOption('fiber_cement');
  await page.waitForTimeout(900);
  const framed = await skin();
  check(
    `the wall is framed and its outside skin is stock (fill ${framed?.fill}, data-finish-kind="${framed?.kind}")`,
    framed?.kind === 'stock' && framed?.fill === STOCK_FIBRE_CEMENT_FILL,
  );
  const finishesOpen = await page.evaluate(
    () =>
      [...document.querySelectorAll('button[aria-expanded]')]
        .find((node) => node.textContent.trim().startsWith('Finishes'))
        ?.getAttribute('aria-expanded') === 'true',
  );
  check('the Finishes section renders open', finishesOpen);
  await deselect();
  const before = await previewShot('wall-stock');
  check('the wall is picked again after the picture', await pickWall());

  await fieldSelect('Outside finish').selectOption('paint');
  await page.waitForTimeout(700);
  const warmWhite = await skin();
  check(
    `choosing Paint starts on Warm White (fill ${warmWhite?.fill}, kind "${warmWhite?.kind}")`,
    warmWhite?.kind === 'paint' && warmWhite?.fill === '#F2EEE4',
  );

  await page.locator(`${COLOUR_FIELD} [data-swatch="Signal Orange"]`).click();
  await page.waitForTimeout(900);
  const orange = await skin();
  check(
    `the plan skin carries Signal Orange (fill ${orange?.fill}, data-finish-kind="${orange?.kind}")`,
    orange?.kind === 'paint' && orange?.fill === '#E0701F',
  );
  await deselect();
  const after = await previewShot('wall-signal-orange');
  check('the wall is picked again after the picture', await pickWall());

  // The two pictures must differ where the wall is: the finish reached 3D.
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
      let differing = 0;
      for (let index = 0; index < first.length; index += 4) {
        const delta =
          Math.abs(first[index] - second[index]) +
          Math.abs(first[index + 1] - second[index + 1]) +
          Math.abs(first[index + 2] - second[index + 2]);
        if (delta > 30) differing += 1;
        // Red well above blue, the signature of an orange face under any light.
        if (second[index] - second[index + 2] > 70 && first[index] - first[index + 2] < 40) orangeish += 1;
      }
      return { differing, orangeish };
    },
    [(await readFile(before)).toString('base64'), (await readFile(after)).toString('base64')],
  );
  check(
    `the 3D preview turned orange where the wall is (${changed.orangeish} newly orange px, ${changed.differing} changed px)`,
    changed.orangeish > 2000,
  );

  // A picker drag: a burst of `input` events, closed by `change`, is one edit.
  const dragged = await page.evaluate(async (field) => {
    const picker = document.querySelector(`${field} input[type="color"]`);
    if (!picker) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const value of ['#c05010', '#a04020', '#803030', '#603040', '#2f6f9f']) {
      setter.call(picker, value);
      picker.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, COLOUR_FIELD);
  await page.waitForTimeout(900);
  const pickedSkin = await skin();
  check(
    `a five-step picker drag lands on its last colour (fill ${pickedSkin?.fill})`,
    dragged && pickedSkin?.fill === '#2F6F9F',
  );
  await undo();
  const afterDragUndo = await skin();
  check(
    `one Undo takes the whole picker drag back to Signal Orange (fill ${afterDragUndo?.fill})`,
    afterDragUndo?.fill === '#E0701F',
  );

  // Kind and colour were two edits (Paint, then the swatch): two Undos to stock.
  await undo();
  const backToWhite = await skin();
  check(`Undo takes the swatch back to Warm White (fill ${backToWhite?.fill})`, backToWhite?.fill === '#F2EEE4');
  await undo();
  const stock = await skin();
  check(
    `Undo once more and the face is stock again (fill ${stock?.fill}, data-finish-kind="${stock?.kind}")`,
    stock?.kind === 'stock' && stock?.fill === STOCK_FIBRE_CEMENT_FILL,
  );
  await deselect();
  await previewShot('wall-stock-after-undo');

  check(`no page errors (${errors.length})`, errors.length === 0, `Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Wall cladding failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, screenshots }, null, 2),
  );
  console.log(
    'Wall cladding verification passed:\n- ' + checks.join('\n- ') + '\nScreenshots:\n- ' + screenshots.join('\n- '),
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
