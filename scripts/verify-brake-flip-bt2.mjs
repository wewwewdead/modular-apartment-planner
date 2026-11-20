/* global localStorage, process, console, document */
// Press brake flip, turn and the offset bend BT-2 (docs/sketch-studio-brake-
// flip-tooling.md §5.5), at 1366 × 768: a fresh model → Shop → Draw → Cut a
// 300 × 100 blank of 1.5 SPCC → Bend: Flip sheet (This side up · Flipped
// over) beside the angle and Turn sheet around in view, measured against the
// pane → the right end on the backgauge, L 200, 45° → Flip sheet: the sheet
// turns over on the die (screenshot mid-turn, frame times) and back → Bend
// shape Offset, 6.35 mm: spacing 8.8, web 7.03, hit 2 at L 191.2, both lines
// on the flat blank → Bend: hit one, the sheet turning over (screenshot), the
// second hit with the first bend hanging down (3D and side view), the
// finished step (two records, up 45° and down 45°, folded 7.85 high). Then a
// U channel (115 × 60) with the gooseneck reversed: the collision card's Turn
// the sheet around button clears it and the hit is made. No page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-brake-flip-bt2.mjs
// Screenshots: artifacts/sketch-cad/brake-flip-bt2 (or BT2_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.BT2_SHOTS || 'artifacts/sketch-cad/brake-flip-bt2';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [],
  checks = [],
  measured = {};
page.on('pageerror', (e) => errors.push(e.message));
const { properties, current, savedWhen, shopStation } = cadSteps(page);
const footer = page.locator('.cad-status');
const shot = (name) => page.screenshot({ path: `${directory}/${name}.png` });
const shop = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop());
// Wait (every frame) until the station's state passes `test`, a string of JS over `s` (cadShop().station).
const stationWhen = (test, timeout = 20000) =>
  page.waitForFunction(
    (body) => {
      const s = document.querySelector('.cad-viewport')?.cadShop?.().station;
      return Boolean(s) && new Function('s', `return ${body};`)(s);
    },
    test,
    { polling: 'raf', timeout },
  );
const sideView = page.getByRole('figure', { name: 'Side view' });
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
// Where the panel's controls sit in the right pane, in CSS px.
const layout = () =>
  page.evaluate(() => {
    const pane = document.querySelector('.cad-properties');
    const region = pane.querySelector('[aria-label="Press brake"]');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
      };
    };
    const paneBox = pane.getBoundingClientRect();
    const right = paneBox.left + pane.clientWidth + 0.5;
    const flip = region.querySelector('.cad-flip');
    return {
      pane: { top: Math.round(paneBox.top), bottom: Math.round(paneBox.bottom), width: Math.round(paneBox.width) },
      angle: box(region.querySelector('[aria-label="Bend angle (°)"]')),
      flip: box(flip),
      turn: box(region.querySelector('.cad-brake-turn button')),
      shape: box(region.querySelector('[aria-label="Bend shape"]')),
      footer: box(region.querySelector('.cad-shell-foot')),
      // The flip control on the angle's row, and nothing of it past the pane's right edge.
      flipBesideAngle:
        flip?.parentElement === region.querySelector('[aria-label="Bend angle (°)"]').closest('.cad-inline'),
      overflow: [...region.querySelectorAll('.cad-flip, .cad-flip *, .cad-brake-turn, .cad-brake-turn *')].some(
        (el) => el.getBoundingClientRect().right > right,
      ),
    };
  });

// A fresh model, then Draw → Cut a W × H blank of 1.5 SPCC, then the route's Bend.
const blank = async (width, height) => {
  await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await current();
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const draw = properties.getByRole('region', { name: 'Draw' });
  await draw.getByRole('button', { name: /^Rectangle/ }).click();
  await fill(draw, 'Width W (mm)', width);
  await fill(draw, 'Height H (mm)', height);
  await draw.getByRole('button', { name: 'Cut this rectangle', exact: true }).click();
  const cut = properties.getByRole('region', { name: 'Cut from sheet' });
  await cut.getByLabel('Sheet stock', { exact: true }).selectOption('spcc');
  await fill(cut, 'Custom thickness (mm)', 1.5);
  await cut.getByRole('button', { name: 'Cut on the laser', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Laser bed' })).toHaveAttribute('data-state', 'cut', {
    timeout: 20000,
  });
  await expect(footer).toContainText('Model current', { timeout: 60000 });
  await savedWhen((m) => m.parts.some((p) => p.features[0]?.type === 'sheetmetal'), 'the blank');
  await shopStation('Bend');
  const panel = properties.getByRole('region', { name: 'Press brake' });
  const map = page.getByRole('figure', { name: 'Flat blank' });
  await expect(map).toBeVisible();
  return { panel, map };
};
const bendMade = async (panel, count, what) => {
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  const model = await savedWhen((m) => m.parts[0].features[0].bends.length === count, what);
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 20000 });
  return model.parts[0].features[0].bends[count - 1];
};

try {
  // 1. The 300 × 100 blank: Flip sheet beside the angle, Turn sheet around, three bend shapes.
  const { panel, map } = await blank(300, 100);
  const flip = panel.getByRole('switch', { name: 'Flip sheet' });
  await expect(flip).not.toBeChecked();
  await expect(panel.locator('.cad-flip .is-on')).toHaveText('This side up');
  await expect(panel.getByRole('button', { name: 'Turn sheet around', exact: true })).toBeDisabled();
  await expect(panel.getByRole('group', { name: 'Bend shape' }).getByRole('button')).toHaveText([
    'Sharp',
    'Round',
    'Offset',
  ]);
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', 200);
  await fill(panel, 'Bend angle (°)', 45);
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await panel.getByLabel('Bend angle (°)', { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  measured.layout = await layout();
  const at = measured.layout;
  assert(at.flipBesideAngle, 'Flip sheet sits on the angle row');
  assert(!at.overflow, `Flip sheet and Turn sheet around fit the pane: ${JSON.stringify(at)}`);
  assert(at.flip.bottom <= at.footer.top && at.turn.top >= at.pane.top - 400, JSON.stringify(at));
  await page.waitForTimeout(300);
  await shot('01-flip-and-turn-controls');
  checks.push(
    `1366 × 768: pane ${at.pane.width} px; angle ${at.angle.left}–${at.angle.right}, Flip sheet ${at.flip.left}–${at.flip.right} on the same row (${at.flip.top}–${at.flip.bottom}); Turn sheet around ${at.turn.top}–${at.turn.bottom}; Bend shape ${at.shape.top}–${at.shape.bottom}; footer from ${at.footer.top}`,
  );

  // 2. Flip sheet: the sheet turns over on the die (about half a second), the side view says so; and back.
  let state = await shop();
  assert.equal(state.station.flipped, false);
  await panel.locator('.cad-flip').getByText('Flipped over').click();
  await stationWhen('s.turning', 5000);
  await page.waitForTimeout(170);
  await shot('02-flip-mid-turn');
  await stationWhen('!s.turning && s.flipped', 5000);
  await expect(flip).toBeChecked();
  await expect(sideView.getByLabel('Side up')).toHaveText('Flipped over');
  state = await shop();
  measured.flipTurn = state.station.lastTurn;
  assert(
    measured.flipTurn && measured.flipTurn.ms >= 450 && measured.flipTurn.ms < 1500,
    JSON.stringify(state.station),
  );
  await page.waitForTimeout(200);
  await shot('03-flipped-over');
  await panel.locator('.cad-flip').getByText('This side up').click();
  await stationWhen('!s.turning && !s.flipped', 5000);
  await expect(sideView.getByLabel('Side up')).toHaveText('This side up');
  checks.push(
    `Flip sheet → the sheet turned over in ${measured.flipTurn.ms} ms (${measured.flipTurn.frames} frames, mean ${measured.flipTurn.meanMs} ms, worst ${measured.flipTurn.worstMs} ms of frame work); side view "Flipped over"; and back`,
  );

  // 3. Offset 6.35 at 45°: the spacing, the web, both hits and both lines before the pedal.
  await panel.getByRole('group', { name: 'Bend shape' }).getByRole('button', { name: 'Offset', exact: true }).click();
  await fill(panel, 'Offset (mm)', 6.35);
  const results = panel.getByLabel('Offset results', { exact: true });
  await expect(results.getByLabel('Spacing', { exact: true })).toHaveText('8.8 mm');
  await expect(results.getByLabel('Web', { exact: true })).toHaveText('7.03 mm');
  await expect(results.getByLabel('Hit 1', { exact: true })).toHaveText('Line A UP · L 200 · clear');
  await expect(results.getByLabel('Hit 2', { exact: true })).toHaveText('Line B DOWN · L 191.2 · clear');
  await expect(panel.getByRole('status', { name: 'Collision check' })).toHaveText(
    'Both hits clear: no part of the sheet meets the punch, ram, die, bed or itself.',
  );
  await expect(map.getByLabel('Second line')).toHaveCount(1);
  await page.waitForTimeout(300);
  await shot('04-offset-pending');
  await map.screenshot({ path: `${directory}/05-flat-blank-both-lines.png` });
  checks.push(
    'Offset 6.35 at 45°: Spacing 8.8 mm, Web 7.03 mm, Hit 1 Line A UP L 200, Hit 2 Line B DOWN L 191.2, both clear; both lines on the flat blank',
  );

  // 4. One press of Bend: hit one, the turn, hit two with the first bend hanging, the step made.
  await panel.getByRole('button', { name: 'Bend', exact: true }).click();
  await stationWhen("s.phase === 'turn' && s.part === 0", 15000);
  await page.waitForTimeout(150);
  await shot('06-offset-turning-over');
  await stationWhen("s.part === 1 && s.phase === 'bend' && s.angle > 20", 15000);
  await shot('07-second-hit-first-bend-hanging');
  await sideView.screenshot({ path: `${directory}/08-side-view-second-hit.png` });
  state = await shop();
  measured.secondHit = { flipped: state.station.flipped, angle: state.station.angle, phase: state.station.phase };
  assert.equal(state.station.flipped, true, 'the second hit is made with the sheet turned over');
  const model = await savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the offset');
  await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 20000 });
  const bends = model.parts[0].features[0].bends;
  assert.deepEqual(
    bends.map((b) => [b.direction, b.angle, b.stroke ?? null]),
    [
      ['up', 45, null],
      ['down', 45, null],
    ],
  );
  await expect(panel.getByLabel('Folded size').first()).toContainText('× 7.85 mm');
  const rows = panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('.cad-brake-check')).toHaveText(['ok', 'ok']);
  state = await shop();
  measured.offsetStroke = state.station.lastStroke;
  assert(measured.offsetStroke?.turn?.frames > 0, JSON.stringify(state.station.lastStroke));
  await page.waitForTimeout(300);
  await shot('09-offset-made');
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/10-offset-3d.png` });
  checks.push(
    `Bend → two records (up 45°, down 45°, no shared stroke), folded … × 7.85 mm, both steps ok; second hit posed flipped over; stroke ${measured.offsetStroke.frames} frames, mean ${measured.offsetStroke.meanMs} ms, worst ${measured.offsetStroke.worstMs} ms; its turn ${measured.offsetStroke.turn.frames} frames, mean ${measured.offsetStroke.turn.meanMs} ms, worst ${measured.offsetStroke.turn.worstMs} ms`,
  );

  // 5. The collision card's Turn the sheet around: a U channel with the gooseneck reversed.
  const again = await blank(115, 60);
  await again.map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  await fill(again.panel, 'Backgauge L (mm)', 45);
  await fill(again.panel, 'Bend angle (°)', 90);
  await bendMade(again.panel, 1, 'the 45 flange');
  await again.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(again.panel, 'Backgauge L (mm)', 20);
  await again.panel
    .getByRole('group', { name: 'Blades' })
    .getByRole('button', { name: /^Top: punch/ })
    .click();
  await again.panel
    .getByRole('region', { name: 'Punches' })
    .getByRole('button', { name: 'Gooseneck 88°', exact: true })
    .click();
  await again.panel.getByRole('checkbox', { name: 'Reverse punch' }).check();
  const collision = again.panel.getByRole('alert', { name: 'Collision' });
  await expect(collision).toContainText('the part hits the punch');
  const turnFix = again.panel.getByRole('button', { name: 'Turn the sheet around', exact: true });
  await expect(turnFix).toBeVisible();
  measured.collision = await collision.innerText();
  await collision.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await shot('11-collision-turn-button');
  await turnFix.click();
  await expect(collision).toHaveCount(0);
  await expect(again.panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 4 · 60 mm');
  // The same line, 95 from edge 4 on the flat blank. Since SG-1 (docs/sketch-studio-skin-gauge.md
  // §4.5) L is what the backgauge reads: past the 45 flange from edge 4, off that flange's skin
  // (it read 95, the flat distance, before).
  await expect(again.panel.locator('dd[aria-label="Line on the flat blank"]')).toHaveText('95 mm from edge 4');
  await expect(again.panel.locator('dd[aria-label="Backgauge L"]')).toHaveText(/ mm · off bend 1's flange$/);
  measured.turnedL = await again.panel.getByLabel('Backgauge L (mm)', { exact: true }).inputValue();
  const turnedReads = (await again.panel.locator('dd[aria-label="Backgauge L"]').textContent()).trim();
  assert.equal(turnedReads, `${Number(Number(measured.turnedL).toFixed(2))} mm · off bend 1's flange`, turnedReads);
  await expect(again.panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await page.waitForTimeout(300);
  await shot('12-turned-around-clear');
  const made = await bendMade(again.panel, 2, 'the channel hit turned around');
  assert.deepEqual([made.punch, made.direction], ['gooseneck-88', 'up'], JSON.stringify(made));
  await expect(
    again.panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem').locator('.cad-brake-check'),
  ).toHaveText(['ok', 'ok']);
  await page.waitForTimeout(300);
  await shot('13-channel-made');
  checks.push(
    `channel 115 × 60, gooseneck reversed: "${measured.collision.replace(/\s+/g, ' ')}" → Turn the sheet around → Edge 4, the line 95 from it, L ${measured.turnedL} off bend 1's flange, clear; made, both steps ok`,
  );

  // 6. Dragging line A of an offset (BT-2 follow-up): the station's facts on
  // every move, its searched advice once the line has been still 150 ms.
  // Measured per move: pointer move → the flat blank redrawn (the render: the
  // station worked out, the workspace re-rendered) and → the next frame.
  const drag = await blank(300, 100);
  await drag.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(drag.panel, 'Backgauge L (mm)', 250);
  await fill(drag.panel, 'Bend angle (°)', 90);
  await drag.panel
    .getByRole('group', { name: 'Bend shape' })
    .getByRole('button', { name: 'Offset', exact: true })
    .click();
  const dragCost = async (offset, angle, from, to, steps) => {
    await fill(drag.panel, 'Bend angle (°)', angle);
    await fill(drag.panel, 'Offset (mm)', offset);
    await fill(drag.panel, 'Backgauge L (mm)', from);
    await page.waitForTimeout(400);
    const screenAt = (x, y) =>
      page.evaluate(
        ([fx, fy]) => {
          const svg = document.querySelector('[aria-label="Flat pattern"]');
          const p = new DOMPoint(fx, -fy).matrixTransform(svg.getScreenCTM());
          return [p.x, p.y];
        },
        [x, y],
      );
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
    const [x0, y0] = await screenAt(300 - from, 50);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      const [x, y] = await screenAt(300 - (from + ((to - from) * i) / steps), 50);
      await page.mouse.move(x, y);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
    }
    await page.mouse.up();
    const moves = await page.evaluate(() => {
      window.removeEventListener('pointermove', window.__dragMove, { capture: true });
      window.__dragObserver.disconnect();
      return window.__drag.moves;
    });
    const stats = (key) => {
      const values = moves.map((m) => m[key]).sort((p, q) => p - q);
      return {
        mean: Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)),
        median: Number(values[Math.floor(values.length / 2)].toFixed(1)),
        worst: Number(values.at(-1).toFixed(1)),
      };
    };
    return { moves: moves.length, render: stats('dom'), frame: stats('frame') };
  };
  measured.dragRefused = await dragCost(20, 90, 250, 50, 100);
  measured.dragClearing = await dragCost(6.35, 45, 250, 50, 100);
  checks.push(
    `drag of line A, L 250 → 50 on 300 × 100, 100 moves: Offset 20 at 90° (mostly refused) render ${JSON.stringify(measured.dragRefused.render)} ms, to the next frame ${JSON.stringify(measured.dragRefused.frame)} ms (${measured.dragRefused.moves} redraws); Offset 6.35 at 45° (clearing) render ${JSON.stringify(measured.dragClearing.render)} ms, frame ${JSON.stringify(measured.dragClearing.frame)} ms`,
  );
  console.log(checks.at(-1));
  // After the line has been still: the §5.5 row 4 advice, as before the follow-up.
  await fill(drag.panel, 'Bend angle (°)', 90);
  await fill(drag.panel, 'Offset (mm)', 20);
  await fill(drag.panel, 'Backgauge L (mm)', 200);
  await expect(drag.panel.getByRole('alert', { name: 'Collision' })).toHaveText(
    'Bend 2: the 100 mm side hangs down beside the die and meets the bed (the V10 88° die stands 80 mm above it). Neither order clears: shorten the side that hangs to 79.9 mm or less, or make the step at least 30.6 mm so it hangs clear of the bed.',
  );
  assert(
    measured.dragRefused.render.mean <=
      Math.max(3 * measured.dragClearing.render.mean, measured.dragClearing.render.mean + 15),
    `a refused offset drags as smoothly as a clearing one: ${JSON.stringify(measured)}`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Brake flip BT-2 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
