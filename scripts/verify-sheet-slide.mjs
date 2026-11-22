/* global localStorage, process, console, document, window, performance, requestAnimationFrame, setTimeout, MutationObserver */
// Press brake, slide the sheet under the punch PK-3 (docs/sketch-studio-sheet-slide.md
// §7), at 1366 × 768 on the lip tray of piece pick §3 (made as
// verify-piece-pick makes it), the first lip alone: Length 100, the card's
// sentence and "Slide the sheet 5 mm …"; its click glides the sheet, the punch
// hangs off the free end, Bend enabled; the arrow dragged 10 mm (the sheet's
// edge moves on the canvas, the punch does not, the readout shows), Esc back;
// −3 typed in the hand; the panel field and Centre; slide 5 again, Bend;
// reload: the sequence list "100 mm, 5 mm off centre", the step re-checked
// clear, the replay poses the sheet off centre. The arrow's drag cost per
// position against the fingers' and the card's punch line (judged on a
// production bundle). No page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-sheet-slide.mjs
// Screenshots: artifacts/sketch-cad/sheet-slide (or SLIDE_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const URL = process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch';
const directory = process.env.SLIDE_SHOTS || 'artifacts/sketch-cad/sheet-slide';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, saved, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const chip = page.locator('.cad-grip-chip');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
const station = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop().station);
const reach = async () => (await station())?.reach;
const stationWhen = (test, timeout = 20000) =>
  page.waitForFunction(
    (body) => {
      const s = document.querySelector('.cad-viewport')?.cadShop?.().station;
      return Boolean(s) && new Function('s', `return ${body};`)(s);
    },
    test,
    { polling: 'raf', timeout },
  );
const handAt = (p) => page.evaluate(([x, y]) => document.querySelector('.cad-viewport').cadBrakeHand(x, y), p);
const nextFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
// A point the scene's own pick gives to edge `index` / piece `index`.
const edgeAt = async (index) => {
  const edge = (await reach()).edges.find((e) => e.index === index);
  for (const p of edge?.points || []) {
    const found = await handAt(p);
    if (found?.kind === 'edge' && found.index === index) return p;
  }
  throw new Error(`no point to press on edge ${index + 1}: ${JSON.stringify(edge)}`);
};
const pieceAt = async (index) => {
  const piece = (await reach()).pieces.find((p) => p.index === index);
  for (const p of piece?.points || []) {
    const found = await handAt(p);
    if (found?.kind === 'piece' && found.index === index) return p;
  }
  throw new Error(`no point to press on piece ${index + 1}: ${JSON.stringify(piece)}`);
};
const settled = () => stationWhen('!s.turning && !s.sliding && s.grip.shown', 10000);

const LIP_TRAY = [
  [0, 0],
  [400, 0],
  [400, 25],
  [425, 25],
  [425, 107],
  [397, 107],
  [397, 111],
  [528, 111],
  [528, 633],
  [397, 633],
  [397, 637],
  [425, 637],
  [425, 719],
  [400, 719],
  [400, 744],
  [0, 744],
];
const FIRST_LIP = 3;

try {
  // ------------------------------------------------ the lip tray at the brake
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', 528);
  await fill(draw, 'Height H (mm)', 744);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cut, 'Custom thickness (mm)', 1.2);
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
    timeout: 20000,
  });
  await expect(footer).toContainText('Model current', { timeout: 60000 });
  await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
  const model = await saved();
  const feature = model.parts[0].features[0];
  model.sketches.find((s) => s.id === feature.sketchId).profile = { type: 'polygon', points: LIP_TRAY };
  feature.bends = [];
  await page.evaluate((m) => {
    const workspace = JSON.parse(localStorage.getItem('apartment-planner-sketch-recovery'));
    workspace.document.model = m;
    localStorage.setItem('apartment-planner-sketch-recovery', JSON.stringify(workspace));
  }, model);
  await page.reload();
  const entry = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  // The recovered model may open straight in the workshop (the entry goes as it is clicked).
  if (await entry.isVisible().catch(() => false)) await entry.click({ timeout: 3000 }).catch(() => {});
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await shopStation('Bend');
  const panel = properties.getByRole('region', { name: 'Press brake' });
  await expect(page.getByRole('figure', { name: 'Flat blank' })).toBeVisible();
  await stationWhen('s.grip.shown && s.reach.edges.length > 10');
  const blades = panel.getByRole('group', { name: 'Blades' });
  const bend = panel.getByRole('button', { name: 'Bend', exact: true });
  const bendMade = async (count) => {
    await expect(bend).toBeEnabled();
    await bend.click();
    await savedWhen((m) => m.parts[0].features[0].bends.length >= count, `${count} bends`);
    await expect(bend).toHaveText('Bend', { timeout: 20000 });
    await stationWhen('!s.stroking', 20000);
  };

  const route = page.getByRole('navigation', { name: 'Shop route' });
  const slideField = blades.getByRole('spinbutton', { name: 'Sheet slide (mm)' });
  const view = () => page.evaluate(() => document.querySelector('.cad-viewport').getBoundingClientRect().toJSON());
  const arrowNow = async () => (await station()).grip.handles.slide;
  // The machine's +X along the bed at the arrow, a unit client vector.
  const bedAxis = async () => {
    const { arc } = await arrowNow();
    const [p, q] = [arc[0], arc.at(-1)];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [(q[0] - p[0]) / d, (q[1] - p[1]) / d, d];
  };
  // A point of the sheet on the canvas (the first lip's edge, as the scene reports it) and the punch's.
  const sheetPoint = async () => (await reach()).edges.find((e) => e.index === FIRST_LIP)?.points[0] || null;
  const punchPoint = () => page.evaluate(() => document.querySelector('.cad-viewport').cadBrakeSpots().punch);

  // 1. The first lip alone, on the sheet: its edge, L 15, its stretch.
  await page.mouse.click(...(await edgeAt(FIRST_LIP)));
  await fill(panel, 'Backgauge L (mm)', 15);
  await stationWhen('s.reach.pieces.length === 3 && !s.turning');
  await settled();
  await page.mouse.click(...(await pieceAt(0)));
  await stationWhen('!s.sliding && s.reach.pieces[1].skipped && s.reach.pieces[2].skipped', 5000);
  await settled();
  // +X along the bed is the operator's right: the station's view projects it rightwards.
  measured.rightOnScreen = await page.evaluate(() => {
    const el = document.querySelector('.cad-viewport');
    const a = el.cadProject([0, 0, 1000]),
      b = el.cadProject([100, 0, 1000]);
    return b[0] - a[0];
  });
  assert(measured.rightOnScreen > 0, 'machine +X runs to the right on the canvas');

  // 2. Length 100: the card's sentence and "Slide the sheet 5 mm …".
  await fill(blades, 'Punch length', 100);
  const overFlat =
    'The punch stands over 5 mm of a piece this hit leaves flat: it would bend that too. Make the punch shorter, or fit it to the bend.';
  await expect(
    panel.locator('.cad-problem', { hasText: /^The punch stands over 5 mm of a piece this hit leaves flat/ }),
  ).toBeVisible();
  const slideFix = panel.getByRole('button', { name: /^Slide the sheet 5 mm to the (left|right)$/ });
  await expect(slideFix).toBeVisible();
  measured.fix = await slideFix.innerText();
  await shot('01-length-100-slide-fix');
  checks.push(`1, 2: the lip alone, Length 100: "${overFlat}" with "${measured.fix}"`);

  // 3. The fix: the sheet glides, the punch hangs off the free end, Bend enabled.
  const before = await station();
  const glide = [];
  await page.evaluate(() => {
    const record = (window.__glide = []);
    const tick = () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      record.push({ sliding: s.sliding, x: s.drawn[12], ranges: s.ranges });
      if (record.length < 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await slideFix.click();
  await stationWhen('!s.sliding && Math.abs(s.shift) > 4.9', 5000);
  await page.waitForTimeout(400);
  glide.push(...(await page.evaluate(() => window.__glide)));
  const after = await station();
  measured.glide = {
    frames: glide.filter((g) => g.sliding).length,
    from: before.drawn[12],
    to: after.drawn[12],
    shift: after.shift,
    punchBefore: before.ranges,
    punchAfter: after.ranges,
    ms: after.lastTurn?.ms ?? null,
  };
  assert(measured.glide.frames >= 2, 'the sheet glides');
  assert.deepEqual(after.ranges, before.ranges, 'the punch stands where it stood');
  await expect(slideField).toHaveValue(/^-?5$/);
  await expect(bend).toBeEnabled();
  await expect(panel.getByText(overFlat)).toHaveCount(0);
  await shot('02-slid-punch-off-the-free-end');
  checks.push(`3: the fix: the sheet glided ${JSON.stringify(measured.glide)}; Bend enabled`);

  // 8. The arrow's drag cost per position, against the fingers' on the same part (judged on a production bundle).
  const moveCost = async (count, moves) => {
    await page.evaluate(() => {
      const record = (window.__drag = { moves: [], start: null });
      window.__dragMove = () => (record.start = performance.now());
      window.addEventListener('pointermove', window.__dragMove, { capture: true });
      window.__dragObserver = new MutationObserver(() => {
        if (record.start == null) return;
        const start = record.start;
        record.start = null;
        const dom = performance.now() - start;
        requestAnimationFrame(() => record.moves.push({ dom, frame: performance.now() - start }));
      });
      window.__dragObserver.observe(document.querySelector('[aria-label="Flat pattern"]'), {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
    for (let i = 1; i <= count; i++) {
      await page.mouse.move(...(await moves(i)));
      await nextFrame();
    }
    const list = await page.evaluate(() => {
      window.removeEventListener('pointermove', window.__dragMove, { capture: true });
      window.__dragObserver.disconnect();
      return window.__drag.moves;
    });
    const values = list.map((m) => m.dom).sort((a, b) => a - b);
    return {
      positions: values.length,
      mean: Number((values.reduce((s, v) => s + v, 0) / Math.max(1, values.length)).toFixed(2)),
      median: Number((values[values.length >> 1] ?? 0).toFixed(2)),
      worst: Number((values.at(-1) ?? 0).toFixed(2)),
    };
  };
  // The slide: about a millimetre a move along the bed.
  const sAt = (await arrowNow()).press;
  const [bx, by] = await bedAxis();
  // About a millimetre a move: the bed's X on the canvas, px per mm.
  const mmPx = await page.evaluate(() => {
    const el = document.querySelector('.cad-viewport');
    const a = el.cadProject([0, 0, 1000]),
      b = el.cadProject([10, 0, 1000]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
  });
  await page.mouse.move(...sAt);
  await page.mouse.down();
  await page.mouse.move(sAt[0] + bx * 6, sAt[1] + by * 6);
  await nextFrame();
  const slideCost = await moveCost(30, (i) => [sAt[0] + bx * (6 + i * mmPx), sAt[1] + by * (6 + i * mmPx)]);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settled();
  // The card's punch line dragged (the baseline the fingers are judged against, verify-brake-hands-on).
  const cardLine = page.getByRole('figure', { name: 'Flat blank' }).getByLabel('Punch line');
  const cb = await cardLine.boundingBox();
  const cAt = [cb.x + cb.width / 2, cb.y + cb.height / 2];
  await page.mouse.move(...cAt);
  await page.mouse.down();
  const cardCost = await moveCost(30, (i) => [cAt[0] - i, cAt[1]]);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settled();
  // The fingers last (the budget the spec names): the same, toward the backgauge.
  const fStart = (await reach()).fingers[0];
  const back = await page.evaluate(() => {
    const el = document.querySelector('.cad-viewport');
    const y = el.cadShop().station.fingerDistance;
    const p = el.cadProject([0, y + 45, 1002]),
      q = el.cadProject([0, y + 145, 1002]);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [(q[0] - p[0]) / d, (q[1] - p[1]) / d, d / 100];
  });
  await page.mouse.move(...fStart);
  await page.mouse.down();
  await page.mouse.move(fStart[0] + back[0] * 6, fStart[1] + back[1] * 6);
  await nextFrame();
  const fingerCost = await moveCost(20, (i) => [
    fStart[0] + back[0] * (6 + i * back[2]),
    fStart[1] + back[1] * (6 + i * back[2]),
  ]);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  measured.cost = { slide: slideCost, card: cardCost, fingers: fingerCost };
  measured.devBuild = await page.evaluate(() => Boolean(document.querySelector('script[src*="/@vite/client"]')));
  if (!measured.devBuild)
    assert(
      slideCost.mean <= fingerCost.mean + 2,
      `the arrow drags within 2 ms of the fingers: ${JSON.stringify(measured.cost)}`,
    );
  checks.push(
    `8: drag cost per position${measured.devBuild ? ' (dev build: recorded, not judged)' : ''}: ${JSON.stringify(measured.cost)}`,
  );

  await settled();
  // 4. Drag the arrow 10 mm: the sheet's edge moves on the canvas, the punch does not; the readout; Esc: back.
  await stationWhen('Boolean(s.grip.handles.slide) && s.grip.shown', 5000);
  const arrow = await arrowNow();
  const [ax, ay, arcPx] = await bedAxis();
  const box = await view();
  const pxPerMm = await page.evaluate(() => {
    const el = document.querySelector('.cad-viewport');
    const a = el.cadProject([0, 0, 1000]),
      b = el.cadProject([10, 0, 1000]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
  });
  const edgeBefore = await sheetPoint();
  const punchBefore = await punchPoint();
  const shiftBefore = (await station()).shift;
  const at = arrow.press;
  await page.mouse.move(...at);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(at[0] + ax * pxPerMm * 0.5 * i, at[1] + ay * pxPerMm * 0.5 * i);
    await nextFrame();
  }
  // About 10 mm along the bed (a detent may catch it within 6 px).
  await stationWhen(`s.grip.sliding != null && s.grip.sliding - (${shiftBefore}) > 5`, 5000);
  const held = await station();
  const edgeHeld = await sheetPoint();
  const punchHeld = await punchPoint();
  measured.drag = {
    pxPerMm,
    arcPx,
    sliding: held.grip.sliding,
    edgeMovedPx: edgeBefore && edgeHeld ? Math.hypot(edgeHeld[0] - edgeBefore[0], edgeHeld[1] - edgeBefore[1]) : null,
    punchMovedPx:
      punchBefore && punchHeld ? Math.hypot(punchHeld[0] - punchBefore[0], punchHeld[1] - punchBefore[1]) : null,
    readout: await chip.innerText(),
    canvas: [box.width, box.height],
  };
  assert(measured.drag.edgeMovedPx > 5, `the sheet's edge moved: ${JSON.stringify(measured.drag)}`);
  assert(measured.drag.punchMovedPx < 0.5, `the punch stayed: ${JSON.stringify(measured.drag)}`);
  assert(/^Slide \d+(\.\d)? mm (left|right) · punch /.test(measured.drag.readout), measured.drag.readout);
  await shot('03-arrow-in-the-hand');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await stationWhen(`!s.sliding && Math.abs(s.shift - ${shiftBefore}) < 1e-6 && s.grip.sliding == null`, 5000);
  checks.push(`4: the arrow dragged 10 mm: ${JSON.stringify(measured.drag)}; Esc put the sheet back`);

  // 5. Type −3 in the hand.
  await settled();
  const at2 = (await arrowNow()).press;
  await page.mouse.move(...at2);
  await page.mouse.down();
  await page.mouse.move(at2[0] + ax * 12, at2[1] + ay * 12, { steps: 3 });
  await stationWhen('s.grip.sliding != null', 5000);
  await page.keyboard.press('Minus');
  await page.keyboard.press('3');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(slideField).toHaveValue('-3');
  checks.push('5: −3 typed in the hand: the field reads −3 (3 mm to the left)');

  // 6. The panel's field and Centre.
  await settled();
  await fill(blades, 'Sheet slide (mm)', 4);
  await expect(blades.getByLabel('Sheet slide note')).toHaveText('to the right');
  await stationWhen('Math.abs(s.shift - 4) < 1e-6 && !s.sliding', 5000);
  await blades.getByRole('button', { name: 'Centre', exact: true }).click();
  await stationWhen('Math.abs(s.shift) < 1e-6 && !s.sliding', 5000);
  await expect(slideField).toHaveValue('0');
  checks.push('6: the panel field to 4 (the sheet 4 mm right), Centre back to 0');

  // 7. Slide 5 again (the card's fix), Bend; reload: the sequence list, the step re-checked, the replay.
  await settled();
  await panel.getByRole('button', { name: /^Slide the sheet 5 mm to the (left|right)$/ }).click();
  await stationWhen('Math.abs(Math.abs(s.shift) - 5) < 1e-6 && !s.sliding', 5000);
  await bendMade(1);
  const stored = (await saved()).parts[0].features[0].bends[0];
  measured.record = { punchTrim: stored.punchTrim, slide: stored.slide };
  assert.equal(Math.abs(stored.slide), 5);
  await page.reload();
  const again = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await again.isVisible().catch(() => false)) await again.click({ timeout: 3000 }).catch(() => {});
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await shopStation('Bend');
  const sequence = properties.getByRole('region', { name: 'Press brake' }).getByRole('list', { name: 'Sequence' });
  await expect(sequence.getByRole('listitem')).toHaveCount(1);
  const step = await sequence.getByRole('listitem').first().innerText();
  assert(/Straight 88° punch, 100 mm, 5 mm off centre/.test(step), step);
  assert(/\bok\b/.test(step), `the step re-checks clear: ${step}`);
  await shot('04-sequence-off-centre');
  await route.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(properties.getByRole('region', { name: 'Replay' })).toBeVisible();
  await stationWhen('s.bendId != null && Math.abs(Math.abs(s.shift) - 5) < 1e-6', 60000);
  measured.replay = { shift: (await station()).shift };
  await page.waitForTimeout(500);
  await shot('05-replay-off-centre');
  await route.getByRole('button', { name: 'End replay', exact: true }).click();
  checks.push(
    `7: record ${JSON.stringify(measured.record)}; the list "${step.split('\n').slice(0, 2).join(' · ')}"; the replay posed the sheet off centre (shift ${measured.replay.shift})`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Sheet slide PK-3 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  console.error(errors, checks);
  throw error;
} finally {
  await browser.close();
}
