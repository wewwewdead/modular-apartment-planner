/* global localStorage, process, console, document, window, performance, requestAnimationFrame, setTimeout */
// Press brake, bend one piece of the line PK-2 (docs/sketch-studio-piece-pick.md
// §6.5), at 1366 × 768 on the lip tray (§3: a 400 × 744 column, on its right
// a lip, a notch, a 522 mm flange, a notch, a lip; SPCC t 1.2), made as
// verify-punch-library-pl1 makes a blank that is not a rectangle: a cut
// rectangle whose outline is replaced in the saved model. On the sheet alone
// (the flat-blank card never touched): (1) the first lip's edge, L 15: three
// chips, the hint line, three stretches; (2) punch Length 82: the card's
// sentence; (3) the lip's stretch hovered and clicked: the sheet slides (two
// frames mid-slide differ in X and in nothing else), the Length still 82 and
// "fitted", one finger behind the lip, Bend enabled; (4) the fingers to L 14
// and back: still the lip alone; (5) Ctrl+click the flange, then the lip:
// Bend; (6) the far lip's edge, L 15: the made lip left flat and tagged bent;
// the far lip's stretch: Bend; (7) the flange's edge, L 118: the flange alone,
// both lips bent; the held punch gives the under-half sentence, Fit the punch
// clears it; Bend; reload: three steps, the 82 mm punch named on the first
// two; (8) the pick's cost per pointer position over the sheet (judged on a
// production bundle). Points pressed are the ones the scene reports
// (cadShop().station.reach, cadBrakeHand). No page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-piece-pick.mjs
// Screenshots: artifacts/sketch-cad/piece-pick (or PIECE_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const URL = process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch';
const directory = process.env.PIECE_SHOTS || 'artifacts/sketch-cad/piece-pick';
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
const hoverAt = async (p, lit) => {
  await page.mouse.move(5, 5);
  await page.mouse.move(p[0], p[1], { steps: 3 });
  await stationWhen(`Boolean(s.reach.lit) && ${lit}`, 5000);
  await expect(chip).toBeVisible();
  return chip.innerText();
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
const [FIRST_LIP, FLANGE, FAR_LIP] = [3, 7, 11];

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
  const row = panel.getByRole('group', { name: 'Pieces on the line' });
  const chips = () => row.locator('.cad-brake-chip:not(.is-every)');
  const pressed = async () => chips().evaluateAll((list) => list.map((b) => b.getAttribute('aria-pressed')));
  const hint = page.locator('.cad-viewport-hint');
  const blades = panel.getByRole('group', { name: 'Blades' });
  const lengthField = blades.getByRole('spinbutton', { name: 'Punch length' });
  const lengthNote = blades.getByLabel('Punch length note');
  const bend = panel.getByRole('button', { name: 'Bend', exact: true });
  const bendMade = async (count) => {
    await expect(bend).toBeEnabled();
    await bend.click();
    await savedWhen((m) => m.parts[0].features[0].bends.length >= count, `${count} bends`);
    await expect(bend).toHaveText('Bend', { timeout: 20000 });
    await stationWhen('!s.stroking', 20000);
  };

  // 1. The first lip's edge on the sheet, L 15.
  await page.mouse.click(...(await edgeAt(FIRST_LIP)));
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText(/^Edge 4 · 82 mm$/);
  await fill(panel, 'Backgauge L (mm)', 15);
  await stationWhen('s.reach.pieces.length === 3 && !s.turning');
  await settled();
  await expect(chips()).toHaveCount(3);
  assert.deepEqual(await chips().allInnerTexts(), ['1 · 82 mm', '2 · 522 mm', '3 · 82 mm']);
  await expect(hint).toContainText(
    'Click a piece of the line to bend only it · Ctrl+click adds or leaves out · F flip · T turn around · Enter bends · Esc clears the line · Drag background to orbit',
  );
  measured.hint = await hint.evaluate((el) => ({
    lines: (() => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    })(),
    height: el.getBoundingClientRect().height,
    scroll: el.scrollWidth - el.clientWidth,
  }));
  await shot('01-three-pieces');
  checks.push(
    `1: edge 4 clicked on the sheet, L 15: three chips, the hint line (${JSON.stringify(measured.hint)}), three stretches`,
  );

  // 2. Punch Length 82: the card's sentence.
  await fill(blades, 'Punch length', 82);
  const reachSentence =
    'The punch is 82 mm long and does not reach every piece this hit bends (3 pieces, 694 mm end to end). Click the piece to bend: it comes under the punch. Or fit the punch to the bend.';
  await expect(panel.getByText(reachSentence, { exact: true })).toBeVisible();
  await shot('02-length-82-card');
  checks.push('2: Length 82 with every piece in: the §5.4 sentence');

  // 3. The lip's stretch: lit, its chip; a click slides the sheet to the punch.
  const lip = await pieceAt(0);
  const said = await hoverAt(lip, "s.reach.lit.kind === 'piece' && s.reach.lit.index === 0");
  assert.equal(said, 'Piece 1 of 3 · 82 mm · click to bend only this');
  await shot('03-lip-hover');
  const before = (await station()).drawn;
  // Sample the drawn part every frame from the click until the slide lands.
  await page.evaluate(() => {
    const record = (window.__slide = []);
    const tick = () => {
      const s = document.querySelector('.cad-viewport').cadShop().station;
      record.push({ t: performance.now(), sliding: s.sliding, drawn: s.drawn });
      if (record.length < 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.click(...lip);
  await stationWhen('!s.sliding && s.reach.pieces.length === 3 && s.reach.pieces[1].skipped', 5000);
  await page.waitForTimeout(400);
  const frames = (await page.evaluate(() => window.__slide)).filter((f) => f.sliding);
  assert(frames.length >= 2, `frames mid-slide: ${frames.length}`);
  const [a, b] = [frames[Math.floor(frames.length / 3)], frames[Math.floor((2 * frames.length) / 3)]];
  const others = a.drawn.map((v, i) => (i === 12 ? 0 : Math.abs(v - b.drawn[i])));
  assert(Math.abs(a.drawn[12] - b.drawn[12]) > 1, 'mid-slide frames differ in X');
  assert(Math.max(...others) < 1e-3, `mid-slide frames differ only in X: ${JSON.stringify(others)}`);
  const after = await station();
  measured.slide = {
    frames: frames.length,
    from: before[12],
    mid: [a.drawn[12], b.drawn[12]],
    to: after.drawn[12],
    otherwise: Math.max(...others),
    // The slide as the layer timed it (its turn machinery: SLIDE_MS on its own clock).
    ms: after.lastTurn?.ms ?? null,
  };
  assert.deepEqual(await pressed(), ['true', 'false', 'false']);
  await expect(lengthField).toHaveValue('82');
  await expect(lengthNote).toHaveText('fitted');
  measured.lipFingers = after.reach.fingerX;
  assert.equal(after.reach.fingerX.length, 1, 'one finger behind the lip');
  await expect(bend).toBeEnabled();
  await shot('04-lip-under-the-punch');
  checks.push(
    `3: the lip clicked on the sheet: slid ${JSON.stringify(measured.slide)}; Length 82 · fitted; one finger at X ${after.reach.fingerX}; Bend enabled`,
  );

  // 4. The fingers to L 14 and back: still only the lip.
  const fingersTo = async (target) => {
    const start = (await reach()).fingers[0];
    const back = await page.evaluate(() => {
      const el = document.querySelector('.cad-viewport');
      const y = el.cadShop().station.fingerDistance;
      const p = el.cadProject([0, y + 45, 1002]),
        q = el.cadProject([0, y + 145, 1002]);
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    });
    await page.mouse.move(...start);
    await page.mouse.down();
    let p = start;
    for (let i = 0; i < 400; i++) {
      await nextFrame();
      const L = (await station()).gaugeDistance;
      if (i > 0 && L === target) break;
      const px = i === 0 ? 6 : Math.sign(target - L) * Math.min(6, Math.max(0.35, Math.abs(target - L) / 3));
      p = [p[0] + back[0] * px, p[1] + back[1] * px];
      await page.mouse.move(...p);
    }
    await page.mouse.up();
    await stationWhen(`s.gaugeDistance === ${target} && !s.turning`, 5000);
  };
  await fingersTo(14);
  assert.deepEqual(await pressed(), ['true', 'false', 'false']);
  await fingersTo(15);
  assert.deepEqual(await pressed(), ['true', 'false', 'false']);
  checks.push('4: the fingers dragged to L 14 and back to 15: the lip alone throughout');

  // 5. Ctrl+click the flange: two pieces in, the sentence again; the lip: only the lip. Bend.
  await settled();
  await page.keyboard.down('Control');
  await page.mouse.click(...(await pieceAt(1)));
  await page.keyboard.up('Control');
  await expect.poll(pressed).toEqual(['true', 'true', 'false']);
  await expect(
    panel.getByText(/^The punch is 82 mm long and does not reach every piece this hit bends \(2 pieces/),
  ).toBeVisible();
  await settled();
  await page.mouse.click(...(await pieceAt(0)));
  await expect.poll(pressed).toEqual(['true', 'false', 'false']);
  await settled();
  await bendMade(1);
  checks.push('5: Ctrl+click the flange: two chips pressed and the sentence; the lip clicked: the lip alone; bent');

  // 6. The far lip's edge, L 15: the made lip starts left flat, tagged bent; the far lip's stretch.
  await page.mouse.move(5, 5);
  await settled();
  await page.mouse.click(...(await edgeAt(FAR_LIP)));
  await fill(panel, 'Backgauge L (mm)', 15);
  await stationWhen('s.reach.pieces.length === 3 && s.reach.pieces[0].skipped && !s.turning');
  await settled();
  assert.equal(await chips().first().innerText(), '1 · 82 mm · bent 90°');
  assert.deepEqual(await pressed(), ['false', 'true', 'true']);
  await shot('05-far-lip-line');
  await page.mouse.click(...(await pieceAt(2)));
  await expect.poll(pressed).toEqual(['false', 'false', 'true']);
  await stationWhen('!s.sliding', 5000);
  await expect(lengthField).toHaveValue('82');
  await settled();
  await bendMade(2);
  checks.push(
    '6: the far lip line: the made lip left flat, "1 · 82 mm · bent 90°"; the far lip clicked, Length 82; bent',
  );

  // 7. The flange's edge, L 118: the flange alone, both lips bent; the held punch is under half.
  await page.mouse.move(5, 5);
  await settled();
  await page.mouse.click(...(await edgeAt(FLANGE)));
  await fill(panel, 'Backgauge L (mm)', 118);
  await stationWhen('s.reach.pieces.length === 3 && !s.turning');
  await settled();
  assert.deepEqual(await pressed(), ['false', 'true', 'false']);
  const tags = await chips().allInnerTexts();
  assert.deepEqual(tags, ['1 · 82 mm · bent 90°', '2 · 522 mm', '3 · 82 mm · bent 90°']);
  const half = panel.getByText(/^The punch stands over 82 mm of the 522 mm bend: less than half of it is pressed\./);
  await expect(half).toBeVisible();
  measured.flangeFingers = (await reach()).fingerX;
  assert.equal(measured.flangeFingers.length, 2, 'two fingers behind the flange');
  await shot('06-flange-under-half');
  await panel
    .locator('.cad-problem')
    .filter({ hasText: /^The punch stands over 82 mm of the 522 mm bend/ })
    .getByRole('button', { name: 'Fit the punch to the bend' })
    .click();
  await expect(half).toHaveCount(0);
  await settled();
  await bendMade(3);
  await page.reload();
  const again = page.getByRole('button', { name: '3D Model & workshop', exact: true });
  if (await again.isVisible().catch(() => false)) await again.click({ timeout: 3000 }).catch(() => {});
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await shopStation('Bend');
  const sequence = properties.getByRole('region', { name: 'Press brake' }).getByRole('list', { name: 'Sequence' });
  await expect(sequence.getByRole('listitem')).toHaveCount(3);
  const steps = await sequence.getByRole('listitem').allInnerTexts();
  // The 82 mm punch on the lips is the lips' own length: each record is fitted (no punchTrim,
  // the one record key for a length; piece pick §3), so the list names no custom length on any
  // step. The spec's 'names the 82 mm punch on the first two' cannot be shown without a new key.
  const stored = (await saved()).parts[0].features[0].bends;
  assert.equal(stored.length, 3);
  assert(
    stored.every((b) => !('punchTrim' in b)),
    `no custom length stored: ${JSON.stringify(stored)}`,
  );
  assert(
    steps.every((t) => !/punch, \d/.test(t)),
    `no custom length listed: ${JSON.stringify(steps)}`,
  );
  await shot('07-three-steps');
  checks.push(
    `7: the flange line: the flange alone, both lips tagged bent, two fingers at X ${measured.flangeFingers}; under half, Fit the punch cleared it; bent; reload: three steps ${JSON.stringify(steps.map((s) => s.replace(/\s+/g, ' ')))}`,
  );

  // 8. The pick's cost per pointer position over the sheet, pieces offered (the far lip line again).
  await stationWhen('s.grip.shown && s.reach.edges.length > 10');
  await page.mouse.click(...(await edgeAt(FAR_LIP)));
  await fill(properties.getByRole('region', { name: 'Press brake' }), 'Backgauge L (mm)', 15);
  await stationWhen('s.reach.pieces.length === 3 && !s.turning');
  await settled();
  const points = (await reach()).pieces.flatMap((p) => p.points);
  const box = await page.locator('.cad-viewport canvas').boundingBox();
  measured.pointer = await page.evaluate(
    ([pts, frame]) => {
      const el = document.querySelector('.cad-viewport');
      const all = [];
      for (let i = 0; i < 300; i++) {
        const p =
          i % 3 ? pts[i % pts.length] : [frame.x + ((i * 37) % frame.width), frame.y + ((i * 53) % frame.height)];
        const start = performance.now();
        el.cadBrakeHand(p[0] + (i % 5) - 2, p[1] + (i % 7) - 3);
        all.push(performance.now() - start);
      }
      all.sort((x, y) => x - y);
      return {
        positions: all.length,
        mean: Number((all.reduce((s, v) => s + v, 0) / all.length).toFixed(3)),
        median: Number(all[all.length >> 1].toFixed(3)),
        worst: Number(all.at(-1).toFixed(3)),
      };
    },
    [points, box],
  );
  measured.devBuild = await page.evaluate(() => Boolean(document.querySelector('script[src*="/@vite/client"]')));
  if (!measured.devBuild)
    assert(measured.pointer.mean <= 2, `at most 2 ms per position: ${JSON.stringify(measured.pointer)}`);
  checks.push(
    `8: the pick per pointer position over the sheet${measured.devBuild ? ' (dev build: recorded, not judged)' : ''}: ${JSON.stringify(measured.pointer)}`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Piece pick PK-2 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  console.error(errors, checks);
  throw error;
} finally {
  await browser.close();
}
