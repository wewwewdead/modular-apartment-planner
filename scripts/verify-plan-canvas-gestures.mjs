/* global process, console, document */
// The plan canvas draws a pan or a wheel-zoom burst as a CSS transform on the
// <svg> and commits it to the store once the gesture settles (see
// src/features/floorplan/components/renderers/canvasGestures.js). This guards
// the two things that must hold for that to be invisible: the picture follows
// the pointer exactly while the gesture lasts, and nothing moves by a pixel
// when the commit lands. It also checks that a click during a burst selects
// what the picture shows, and that the status bar's zoom catches up — and that
// a pan stays under the pointer whatever else touches the viewport while it
// lasts (a wheel notch, a Reset center point, a Space auto-repeat, a release
// over the 3D pane), with nothing moving when it is released.
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-plan-canvas-gestures.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const directory = 'artifacts/floorplan/canvas-gestures';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const CANVAS = 'svg[class*="_svg"]';
const ZOOM_FACTOR = 1.1;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const failures = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const near = (a, b, tolerance = 0.75) => Math.abs(a - b) <= tolerance;
const clickLabel = async (label) => {
  const found = await page.evaluate((l) => {
    const node = document.querySelector(`[aria-label="${l}"]`);
    node?.click();
    return Boolean(node);
  }, label);
  if (!found) throw new Error(`control "${label}" exists`);
  await page.waitForTimeout(450);
};
const wallBox = (index = 0) =>
  page.evaluate((i) => {
    const b = document.querySelectorAll('[data-type="wall"]')[i].getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }, index);
const svgTransform = () => page.evaluate(() => document.querySelector('svg[class*="_svg"]').style.transform || '');
const zoomLabel = () => page.evaluate(() => Number((document.body.innerText.match(/Zoom:\s*(\d+)%/) || [])[1]));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForTimeout(800);
  await clickLabel('Auto-detect Rooms');
  await clickLabel('Hide Sidebar');
  await clickLabel('Hide Properties');
  await clickLabel('Focus canvas');
  await page.waitForTimeout(2600);

  // ── Pan ─────────────────────────────────────────────────────────────────
  const before = await wallBox();
  const zoomBefore = await zoomLabel();
  await page.mouse.move(800, 500);
  await page.mouse.down({ button: 'middle' });
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(800 + 15 * i, 500 + 7.5 * i);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(60);
  const during = await wallBox();
  check(
    'pan: the picture follows the pointer mid-gesture',
    near(during.x - before.x, 180, 1.5) && near(during.y - before.y, 90, 1.5),
    `moved ${(during.x - before.x).toFixed(1)}, ${(during.y - before.y).toFixed(1)} px for a 180, 90 px drag`,
  );
  check('pan: drawn as a CSS transform mid-gesture', /translate\(/.test(await svgTransform()));
  await page.screenshot({ path: `${directory}/pan-mid-gesture.png` });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(250);
  const after = await wallBox();
  check(
    'pan: nothing moves when the pan commits',
    near(after.x, during.x) && near(after.y, during.y),
    `commit moved it by ${(after.x - during.x).toFixed(2)}, ${(after.y - during.y).toFixed(2)} px`,
  );
  check('pan: the transform is gone after the commit', (await svgTransform()) === '');
  check('pan: zoom unchanged', (await zoomLabel()) === zoomBefore);

  // ── Wheel burst ─────────────────────────────────────────────────────────
  const anchor = { x: 700, y: 450 };
  const wallA = await wallBox(1);
  await page.mouse.move(anchor.x, anchor.y);
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(20);
  const midBurst = await wallBox(1);
  check('zoom: drawn as a CSS scale mid-burst', /scale\(/.test(await svgTransform()));
  const ratio = ZOOM_FACTOR ** 8;
  const expectedX = anchor.x + (wallA.x - anchor.x) * ratio;
  const expectedY = anchor.y + (wallA.y - anchor.y) * ratio;
  check(
    'zoom: the point under the cursor stays put mid-burst',
    near(midBurst.x, expectedX, 2) && near(midBurst.y, expectedY, 2),
    `wall at ${midBurst.x.toFixed(1)}, ${midBurst.y.toFixed(1)} vs expected ${expectedX.toFixed(1)}, ${expectedY.toFixed(1)}`,
  );
  await page.waitForTimeout(260);
  const committed = await wallBox(1);
  check(
    'zoom: nothing moves when the burst commits',
    near(committed.x, midBurst.x, 1) && near(committed.y, midBurst.y, 1) && near(committed.w, midBurst.w, 1),
    `commit moved it by ${(committed.x - midBurst.x).toFixed(2)}, ${(committed.y - midBurst.y).toFixed(2)} px`,
  );
  check('zoom: the transform is gone after the commit', (await svgTransform()) === '');
  const labelAfter = await zoomLabel();
  check(
    'zoom: the status bar zoom catches up',
    Math.abs(labelAfter - zoomBefore * ratio) <= 1,
    `${zoomBefore}% → ${labelAfter}% (expected ≈ ${(zoomBefore * ratio).toFixed(1)}%)`,
  );
  await page.screenshot({ path: `${directory}/after-zoom-burst.png` });

  // ── A click inside the burst's settle window ─────────────────────────────
  const target = await page.evaluate(() => {
    const canvas = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
    const walls = [...document.querySelectorAll('[data-type="wall"]')].map((n) => n.getBoundingClientRect());
    const clearance = (b) =>
      Math.min(
        ...walls.map((w) => Math.hypot(Math.max(w.left - b.x, 0, b.x - w.right), Math.max(w.top - b.y, 0, b.y - w.bottom))),
      );
    return [...document.querySelectorAll('[data-type="fixture"]')]
      .map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.getAttribute('data-id'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })
      .filter((f) => f.x > canvas.left + 10 && f.x < canvas.right - 10 && f.y > canvas.top + 60 && f.y < canvas.bottom - 60)
      .sort((a, b) => clearance(b) - clearance(a))[0];
  });
  if (target) {
    await page.mouse.move(target.x + 30, target.y + 20);
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(5);
    }
    const live = await page.evaluate((id) => {
      const b = document.querySelector(`[data-type="fixture"][data-id="${id}"]`).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, target.id);
    const transformAtClick = await svgTransform();
    await page.mouse.click(live.x, live.y);
    await page.waitForTimeout(300);
    await clickLabel('Show Properties');
    const shownId = await page.evaluate(() => (document.body.innerText.match(/fix_[a-z0-9_]+/) || [])[0] || null);
    check(
      'click mid-burst selects the fixture under the cursor',
      shownId === target.id,
      `clicked ${target.id} with transform "${transformAtClick || 'none'}", panel shows ${shownId}`,
    );
  } else {
    check('a fixture is in view for the click test', false);
  }

  // ── Pan robustness ──────────────────────────────────────────────────────
  // The pending view is absolute and shared by every gesture: a pan move
  // steps it, a wheel notch zooms it about the cursor, anything else that
  // moves the viewport mid-pan is overruled by it, and the release commits
  // it as it is. Each case tracks where the wall's top-left corner should be
  // through every step and prints expected against actual.
  const setup = async ({ focus }) => {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector(CANVAS, { timeout: 30000 });
    await page.waitForTimeout(800);
    await clickLabel('Auto-detect Rooms');
    await clickLabel('Hide Sidebar');
    await clickLabel('Hide Properties');
    if (focus) await clickLabel('Focus canvas');
    await page.waitForTimeout(2600);
  };
  const fmt = (p) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`;
  const at = (name, actual, expected, tolerance = 1.5) =>
    check(
      name,
      near(actual.x, expected.x, tolerance) && near(actual.y, expected.y, tolerance),
      `at ${fmt(actual)} expected ${fmt(expected)}`,
    );
  const moves = async (from, step, count, first = 1) => {
    for (let i = first; i < first + count; i += 1) {
      await page.mouse.move(from.x + step.x * i, from.y + step.y * i);
      await page.waitForTimeout(16);
    }
  };
  const settledAfterRelease = async (name, shown, tolerance = 1) => {
    await page.waitForTimeout(250);
    at(`${name}: nothing moves on release (the commit is what was shown)`, await wallBox(), shown, tolerance);
    const left = await svgTransform();
    check(`${name}: no transform left on the canvas`, left === '', `transform "${left || 'none'}"`);
  };

  await setup({ focus: true });

  // Five consecutive pans: each lands exactly, none builds on a stale base.
  for (let k = 1; k <= 5; k += 1) {
    const start = await wallBox();
    const from = { x: 700, y: 500 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'middle' });
    await moves(from, { x: 15, y: 7.5 }, 8);
    const shown = await wallBox();
    at(`consecutive pan #${k}: follows the pointer`, shown, { x: start.x + 120, y: start.y + 60 });
    await page.mouse.up({ button: 'middle' });
    await settledAfterRelease(`consecutive pan #${k}`, shown);
  }

  // A wheel notch while the wheel button is held: the notch zooms the picture
  // about the cursor, the pan carries on from there, and the zoom's settle
  // timer does not commit (and so double-count) the pan mid-gesture.
  {
    const zoomStart = await zoomLabel();
    const start = await wallBox();
    const from = { x: 700, y: 500 };
    const step = { x: 15, y: 7.5 };
    let expected = { x: start.x, y: start.y };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'middle' });
    await moves(from, step, 4);
    expected = { x: expected.x + 60, y: expected.y + 30 };
    const cursor = { x: from.x + 60, y: from.y + 30 };
    await page.mouse.wheel(0, -100);
    expected = {
      x: cursor.x + (expected.x - cursor.x) * ZOOM_FACTOR,
      y: cursor.y + (expected.y - cursor.y) * ZOOM_FACTOR,
    };
    await page.waitForTimeout(40);
    at('wheel notch mid-pan: the notch zooms about the cursor', await wallBox(), expected, 2);
    await moves(from, step, 4, 5);
    expected = { x: expected.x + 60, y: expected.y + 30 };
    await page.waitForTimeout(150); // longer than the zoom's settle delay
    at('wheel notch mid-pan: the zoom timer does not commit under the pan', await wallBox(), expected, 2);
    await moves(from, step, 4, 9);
    expected = { x: expected.x + 60, y: expected.y + 30 };
    const shown = await wallBox();
    at('wheel notch mid-pan: the rest of the pan follows the pointer', shown, expected, 2);
    await page.mouse.up({ button: 'middle' });
    await settledAfterRelease('wheel notch mid-pan', shown);
    const zoomEnd = await zoomLabel();
    check(
      'wheel notch mid-pan: the store zoom equals the picture',
      Math.abs(zoomEnd - zoomStart * ZOOM_FACTOR) <= 1,
      `${zoomStart}% → ${zoomEnd}% (expected ≈ ${(zoomStart * ZOOM_FACTOR).toFixed(1)}%)`,
    );
  }

  // Something else sets the viewport mid-pan (Reset center point, clicked
  // programmatically so no pointer event interrupts the pan): the pan wins —
  // the picture under the pointer does not move, and the release commits it.
  {
    const start = await wallBox();
    const from = { x: 700, y: 500 };
    const step = { x: 15, y: 7.5 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'middle' });
    await moves(from, step, 4);
    const beforeReset = await wallBox();
    const clicked = await page.evaluate(() => {
      const node = document.querySelector('[aria-label="Reset center point"]');
      node?.click();
      return Boolean(node);
    });
    check('external SET_VIEWPORT mid-pan: Reset center point exists', clicked);
    await page.waitForTimeout(60);
    at('external SET_VIEWPORT mid-pan: the picture under the pointer does not move', await wallBox(), beforeReset);
    await moves(from, step, 4, 5);
    const shown = await wallBox();
    at('external SET_VIEWPORT mid-pan: the pan carries on from the pointer', shown, {
      x: start.x + 120,
      y: start.y + 60,
    });
    await page.mouse.up({ button: 'middle' });
    await settledAfterRelease('external SET_VIEWPORT mid-pan', shown);
  }

  // A pan pressed inside a wheel burst's settle window starts from the zoomed
  // picture on screen.
  {
    const from = { x: 700, y: 500 };
    await page.mouse.move(from.x, from.y);
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(8);
    }
    const start = await wallBox();
    await page.mouse.down({ button: 'middle' });
    await moves(from, { x: -15, y: 10 }, 8);
    const shown = await wallBox();
    at('pan inside the zoom settle window: follows the pointer from the zoomed picture', shown, {
      x: start.x - 120,
      y: start.y + 80,
    });
    await page.mouse.up({ button: 'middle' });
    await settledAfterRelease('pan inside the zoom settle window', shown);
  }

  // Space + left-drag, with a key auto-repeat landing mid-pan (every keydown
  // settles a pending zoom, which must not commit the pan).
  {
    const start = await wallBox();
    const from = { x: 800, y: 450 };
    await page.keyboard.down('Space');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'left' });
    await moves(from, { x: -15, y: -7.5 }, 4);
    await page.keyboard.down('Space'); // an auto-repeat
    await moves(from, { x: -15, y: -7.5 }, 4, 5);
    const shown = await wallBox();
    at('space + left-drag pan: follows the pointer', shown, { x: start.x - 120, y: start.y - 60 });
    await page.mouse.up({ button: 'left' });
    await page.keyboard.up('Space');
    await settledAfterRelease('space + left-drag pan', shown);
  }

  // Split view: a pan dragged out of the canvas and released over the 3D
  // preview pane keeps following the pointer (it is captured) and commits.
  await setup({ focus: false });
  {
    const canvasRect = await page.evaluate(() => {
      const b = document.querySelector('svg[class*="_svg"]').parentElement.getBoundingClientRect();
      return { left: b.left, right: b.right };
    });
    const start = await wallBox();
    const from = { x: canvasRect.right - 250, y: 500 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'middle' });
    await moves(from, { x: 50, y: 5 }, 10);
    const release = { x: from.x + 500, y: from.y + 50 };
    const offCanvas = await page.evaluate(
      ({ x, y }) =>
        !document.querySelector('svg[class*="_svg"]').parentElement.contains(document.elementFromPoint(x, y)),
      release,
    );
    check(
      'release outside the canvas: the release point is off the canvas',
      offCanvas && release.x > canvasRect.right,
      `canvas ends at x ${canvasRect.right.toFixed(0)}, release at ${fmt(release)}`,
    );
    const shown = await wallBox();
    at('release outside the canvas: the pan follows the pointer off the canvas', shown, {
      x: start.x + 500,
      y: start.y + 50,
    });
    await page.mouse.up({ button: 'middle' });
    await settledAfterRelease('release outside the canvas', shown);
  }
} catch (error) {
  console.error(error);
  failures.push(`error: ${error.message}`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log(`page errors: ${[...new Set(errors)].join(' | ')}`);
  failures.push('page errors');
}
if (failures.length) {
  console.log(`Plan canvas gesture verification FAILED: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('Plan canvas gesture verification passed.');
