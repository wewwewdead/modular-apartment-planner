/* global process, console, document, window, Image */
// The plank-siding guard (docs/wall-cladding-finishes.md §6.1, CL-2). On the
// playground, in the drafting plan style: make the south and west ground-floor
// walls framed, put plank siding on their outsides (the default timber · Ipe ·
// satin), and check the plan skin. Then, in a front-on view of the south wall
// with the preview in focus mode, count the dark course lines along vertical
// scans of a plain stretch of boards and require the count to be within one
// of height ÷ pitch — in Realistic and again in Shaded, where the grooves must
// survive with the relief switched off. Close-ups of the wall and of the
// corner where the two siding walls meet, and the whole building, in both
// styles, go to the screenshot folder.
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-wall-siding.mjs
//   CLADDING_VERIFY_DIR=<folder for screenshots>   (default artifacts/floorplan/wall-cladding)
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = process.env.CLADDING_VERIFY_DIR || 'artifacts/floorplan/wall-cladding';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const CANVAS = 'svg[class*="_svg"]';
const PREVIEW = 'section[data-roof-colour]';
// Ground floor, drawn west → east along the south edge (outside = +y) and
// north → south along the west edge (outside = −x); they meet at the SW corner.
const SOUTH_WALL = 'wall_mmh5i4w4_3';
const WEST_WALL = 'wall_mmh5hyfe_2';
const skinOf = (id) => `polygon[data-type="wall-board-skin"][data-wall-id="${id}"][data-assembly-side="exterior"]`;
const IPE = '#6B4226';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [],
  consoleErrors = [],
  checks = [],
  failures = [],
  screenshots = [],
  counts = {};
let page = null;

/**
 * Count the dark course lines on the siding in a screenshot.
 *
 * The boards are the only brown thing in the picture (Ipe under any light keeps
 * red well above blue). Every column whose longest vertical brown run is the
 * full height of the wall — no window, no column in front of it — is a
 * candidate; five of them, spread across the wall, are scanned. Along each, the
 * luminance (averaged over three pixels across) dips at every groove; a dip is
 * a pixel at least 12 % darker than the brightest pixel within half a course
 * either side, and dips closer than a third of a course merge. The two ends of
 * the run are left out: a joint on the wall's own base or top is an edge, not
 * a line on the face.
 */
async function countCourseLines(page, path) {
  const base64 = (await readFile(path)).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.width;
    surface.height = image.height;
    const context = surface.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data: px, width, height } = context.getImageData(0, 0, surface.width, surface.height);
    const at = (x, y) => (y * width + x) * 4;
    const brown = (x, y) => {
      const i = at(x, y);
      // A ratio rather than a difference, so the boards still count as brown in
      // the shadow and ambient occlusion under the beam at the top of the wall.
      return px[i] > px[i + 2] * 1.25 + 4 && px[i] >= px[i + 1] && px[i] > 20 && px[i] < 200;
    };
    const lum = (x, y) => {
      const i = at(x, y);
      return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    };
    // Longest brown run per column, tolerating a two-pixel break (a groove).
    const runs = [];
    for (let x = 0; x < width; x += 1) {
      let best = { y0: 0, y1: -1 };
      let start = -1;
      let gap = 0;
      for (let y = 0; y < height; y += 1) {
        if (brown(x, y)) {
          if (start < 0) start = y;
          gap = 0;
          if (y - start > best.y1 - best.y0) best = { y0: start, y1: y };
        } else if (start >= 0 && (gap += 1) > 2) {
          start = -1;
          gap = 0;
        }
      }
      runs.push(best);
    }
    const longest = Math.max(...runs.map((run) => run.y1 - run.y0));
    const full = runs
      .map((run, x) => ({ x, ...run }))
      .filter((run) => run.y1 - run.y0 >= longest - 2 && run.x > 2 && run.x < width - 3);
    // Five scan bands spread over the candidates, each the mean of the
    // full-height columns in its fifth of them: the joints are at one height
    // right across a band, while a board's tone and a butt joint are not, so
    // the mean keeps the lines and loses the noise.
    const bands = [0, 1, 2, 3, 4]
      .map((fifth) => full.slice(Math.floor((fifth * full.length) / 5), Math.floor(((fifth + 1) * full.length) / 5)))
      .filter((band) => band.length);
    const picks = bands.map((band) => ({
      x: band[Math.floor(band.length / 2)].x,
      members: band,
      y0: Math.max(...band.map((column) => column.y0)),
      y1: Math.min(...band.map((column) => column.y1)),
    }));
    const counts = picks.map((column) => {
      const profile = [];
      for (let y = column.y0; y <= column.y1; y += 1) {
        let sum = 0;
        for (const member of column.members) sum += lum(member.x, y);
        profile.push(sum / column.members.length);
      }
      // A groove is darker than the board on BOTH sides of it; a step in tone
      // from one board to the next is darker on one side only, and is not a
      // line. The windows are fixed in pixels (a course is ~23 px here) rather
      // than derived from the pitch, which would make the count circular.
      const reach = 5;
      const ends = 8;
      const dips = [];
      const brightestIn = (from, to) => {
        let brightest = 0;
        for (let k = Math.max(0, from); k <= Math.min(profile.length - 1, to); k += 1) {
          brightest = Math.max(brightest, profile[k]);
        }
        return brightest;
      };
      for (let index = ends; index < profile.length - ends; index += 1) {
        const isMinimum = profile[index] <= profile[index - 1] && profile[index] <= profile[index + 1];
        if (!isMinimum) continue;
        // Against the mean of the two sides, so a groove still counts on the
        // brightness ramp the occlusion lays down under the beam.
        const sides = (brightestIn(index - reach, index - 1) + brightestIn(index + 1, index + reach)) / 2;
        if (profile[index] >= sides * 0.93) continue;
        // Two minima closer than a third of a course are one line: keep the
        // darker of them, which is the groove rather than its chamfer.
        if (dips.length && index - dips[dips.length - 1] < 8) {
          if (profile[index] < profile[dips[dips.length - 1]]) dips[dips.length - 1] = index;
          continue;
        }
        dips.push(index);
      }
      column.profile = profile.map((value) => Math.round(value));
      column.dips = dips;
      return dips.length;
    });
    return {
      longestRunPx: longest,
      columns: picks.map((column) => column.x),
      bandWidths: picks.map((column) => column.members.length),
      counts,
      debug: picks.map((column) => ({ y0: column.y0, profile: column.profile.join(','), dips: column.dips.join(',') })),
    };
  }, base64);
}

const check = (line, ok, failure = line) => {
  checks.push(`${ok ? 'ok' : 'FAIL'} — ${line}`);
  if (!ok) failures.push(failure);
};

try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  // three reports a shader that fails to compile or link on the console, not as
  // a page error — and a broken course block is exactly that.
  page.on('console', (message) => {
    const text = message.text();
    // A missing favicon is not this guard's business; a shader is.
    if (message.type() === 'error' && !/Failed to load resource/.test(text)) consoleErrors.push(text);
  });
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('floorplan.plan.style', 'drafting');
    } catch {
      /* the skin check reports it */
    }
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForSelector(PREVIEW, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.selectOption('select[aria-label="Preview render style"]', 'realistic');
  await page.selectOption('select[aria-label="Preview view preset"]', 'iso_northwest');
  await page.waitForTimeout(1200);

  const canvas = () => page.locator(`${PREVIEW} canvas`).first();
  const fieldSelect = (label) => page.locator(`label:has(> span:text-is("${label}")) select`).first();
  const readout = (label) =>
    page.evaluate((text) => {
      const row = [...document.querySelectorAll('div')].find(
        (node) => node.firstElementChild?.textContent?.trim() === text && node.children.length >= 3,
      );
      return row ? row.children[2].textContent.trim() : null;
    }, label);
  const skin = (id) =>
    page.evaluate((selector) => {
      const node = document.querySelector(selector);
      return node
        ? {
            fill: node.getAttribute('fill'),
            kind: node.getAttribute('data-finish-kind'),
            material: node.getAttribute('data-board-material'),
          }
        : null;
    }, skinOf(id));
  const shot = async (name, wait = 3500) => {
    await page.waitForTimeout(wait);
    const path = `${directory}/${name}.png`;
    await canvas().screenshot({ path });
    screenshots.push(path);
    return path;
  };

  // Walls are picked in 3D: on the plan a beam runs over each of them and wins
  // the hit test (see verify-wall-cladding.mjs).
  const pickWall = async (id, points) => {
    const box = await canvas().boundingBox();
    for (const [fx, fy] of points) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(800);
      if (await page.evaluate((wallId) => document.body.innerText.includes(wallId), id)) return true;
    }
    return false;
  };
  const deselect = async () => {
    const box = await canvas().boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.06);
    await page.waitForTimeout(600);
  };
  const cladWithSiding = async (id, points) => {
    check(`picking ${id} in 3D selects it`, await pickWall(id, points));
    await fieldSelect('Assembly').selectOption('fiber_cement');
    await page.waitForTimeout(900);
    await fieldSelect('Outside board').selectOption('siding');
    await page.waitForTimeout(900);
    const plan = await skin(id);
    check(
      `${id}: the plan skin is siding in Ipe (material ${plan?.material}, kind ${plan?.kind}, fill ${plan?.fill})`,
      plan?.material === 'siding' && plan?.kind === 'timber' && plan?.fill === IPE,
    );
  };

  await cladWithSiding(SOUTH_WALL, [
    [0.6, 0.66],
    [0.75, 0.66],
    [0.6, 0.72],
    [0.75, 0.6],
  ]);
  const finishOptions = await fieldSelect('Outside finish').evaluate((select) =>
    [...select.options].map((option) => option.value),
  );
  check(
    `a siding face offers timber and paint, and no Stock (${finishOptions.join(', ')})`,
    finishOptions.join() === 'timber,paint',
  );
  const pitch = Number(await readout('Outside pitch'));
  const coursesUp = Number(await readout('Outside courses up'));
  check(`the panel reads the pitch as 146 mm (${pitch})`, pitch === 146);
  const heightRow = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[class*="inspectRow"]')].find(
      (node) => node.firstElementChild?.textContent.trim() === 'Height',
    );
    return row ? row.lastElementChild.textContent.trim() : null;
  });
  const wallHeight = Number.parseFloat(String(heightRow || '').replace(/[^0-9.]/g, ''));
  check(
    `the wall's height reads off the inspect card (${heightRow})`,
    Number.isFinite(wallHeight) && wallHeight > 1000,
  );

  await deselect();
  await cladWithSiding(WEST_WALL, [
    [0.35, 0.72],
    [0.3, 0.7],
    [0.4, 0.74],
    [0.25, 0.68],
  ]);
  await deselect();

  // The whole building from across the site, in the ordinary pane: courses are
  // a few pixels or less here, which is where they must fade to their mean
  // rather than shimmer.
  const STYLES = ['realistic', 'shaded'];
  for (const style of STYLES) {
    await page.selectOption('select[aria-label="Preview render style"]', style);
    await page.selectOption('select[aria-label="Preview view preset"]', 'iso_northwest');
    await page.waitForTimeout(1500);
    await shot(`siding-building-${style}`);
  }

  // Focus mode: the preview fills the window, so a 146 mm course is ~23 px in
  // a front-on view of the whole facade — far from the distance fade.
  await page.click('button[aria-label="Focus preview"]');
  await page.waitForTimeout(1500);

  for (const style of STYLES) {
    await page.selectOption('select[aria-label="Preview render style"]', style);
    await page.selectOption('select[aria-label="Preview view preset"]', 'iso_northwest');
    await page.waitForTimeout(1500);

    // The corner where the two siding walls meet: courses must line up across it.
    // The view zooms on its own centre, so first drag the corner (low in the
    // middle of the Iso NW picture) up to it — a right-button pan, paced.
    const box = await canvas().boundingBox();
    const from = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.78 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    for (let step = 1; step <= 12; step += 1) {
      await page.mouse.move(from.x, from.y - (box.height * 0.28 * step) / 12);
      await page.waitForTimeout(30);
    }
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(400);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    for (let step = 0; step < 4; step += 1) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(160);
    }
    await shot(`siding-corner-${style}`, 6000);

    await page.selectOption('select[aria-label="Preview view preset"]', 'elevation_front');
    await page.waitForTimeout(1500);
    const front = await shot(`siding-closeup-${style}`, 5000);
    const scan = await countCourseLines(page, front);
    counts[style] = scan;
    const expected = wallHeight / pitch;
    check(
      `${style}: ${scan.columns.length} vertical scans of the boards count ${scan.counts.join(', ')} course lines; height ÷ pitch = ${expected.toFixed(2)}`,
      scan.columns.length >= 3 && scan.counts.every((count) => Math.abs(count - expected) <= 1),
    );
    // And where they are: each dark line, measured up from the wall's base
    // (this floor stands at elevation 0), lands on a k × pitch of the domain
    // set-out — the shader and wallSiding.js agree, not just in number.
    const mmPerPx = wallHeight / scan.longestRunPx;
    const misses = scan.debug.flatMap((band) => {
      const bottom = band.y0 + band.profile.split(',').length - 1;
      return band.dips
        .split(',')
        .filter(Boolean)
        .map((index) => {
          const v = (bottom - (band.y0 + Number(index))) * mmPerPx;
          return Math.abs(v - Math.round(v / pitch) * pitch);
        });
    });
    const worst = Math.max(...misses);
    check(
      `${style}: every counted line is within ${worst.toFixed(1)} mm of a k × ${pitch} mm set-out line (limit ${(pitch / 6).toFixed(1)})`,
      misses.length > 0 && worst <= pitch / 6,
    );
  }
  check(
    `the panel's course count agrees (${coursesUp} boards up = lines + 1)`,
    coursesUp === Math.floor(wallHeight / pitch) + 1,
  );

  check(`no page errors (${errors.length})`, errors.length === 0, `Page errors:\n${errors.join('\n')}`);
  check(
    `no console errors — the course shader compiled (${consoleErrors.length})`,
    consoleErrors.length === 0,
    `Console errors:\n${consoleErrors.join('\n').slice(0, 4000)}`,
  );
  if (failures.length) throw new Error(`Wall siding failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/siding-verification.json`,
    JSON.stringify({ status: 'passed', errors, consoleErrors, checks, counts, screenshots }, null, 2),
  );
  console.log(
    'Wall siding verification passed:\n- ' + checks.join('\n- ') + '\nScreenshots:\n- ' + screenshots.join('\n- '),
  );
} catch (error) {
  if (page) await page.screenshot({ path: `${directory}/siding-failure.png` });
  console.error('Checks so far:\n- ' + checks.join('\n- '));
  console.error(errors, consoleErrors.slice(0, 5));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
