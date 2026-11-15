/* global localStorage, process, console, document */
// Press brake blades BT-1 (docs/sketch-studio-brake-flip-tooling.md §4.4 item
// 5), at 1366 × 768: a fresh model → Shop → Draw → Cut a 300 × 100 blank of
// 1.5 SPCC → Bend: the Blades row (Top: punch, Bottom: die) in view, measured
// against the pane, the angle and Bend shape above it, the pedal in the pinned
// footer → the right end on the backgauge, L 150, 90° → open the punch picker
// (screenshot): the straight and the gooseneck both clear this hit → choose the
// gooseneck: the selects, the side view and the 3D scene follow → Reverse punch
// (drawn mirrored) and back → Bend: the 90° hit made with the gooseneck. Then a
// U channel (115 × 60): the 45 flange, then the line 20 in from the right end:
// the standing flange hits the straight punch, the card offers "Use the
// gooseneck punch", one click clears it and the hit is made. The die picker
// too. No page errors.
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-brake-blades-bt1.mjs
// Screenshots: artifacts/sketch-cad/brake-blades-bt1 (or BT1_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.BT1_SHOTS || 'artifacts/sketch-cad/brake-blades-bt1';
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
const sideView = page.getByRole('figure', { name: 'Side view' });
const fill = async (scope, label, value) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
};
// Where the panel's parts sit in the right pane, in CSS px: each one's top and
// bottom against the pane's visible box (scrolled as it is now).
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
        width: Math.round(r.width),
      };
    };
    const paneBox = pane.getBoundingClientRect();
    return {
      pane: { top: Math.round(paneBox.top), bottom: Math.round(paneBox.bottom), width: Math.round(paneBox.width) },
      scrollTop: Math.round(pane.scrollTop),
      angle: box(region.querySelector('[aria-label="Bend angle (°)"]')),
      shape: box(region.querySelector('[aria-label="Bend shape"]')),
      blades: box(region.querySelector('[aria-label="Blades"]')),
      bladeButtons: [...region.querySelectorAll('.cad-blade')].map(box),
      picker: box(region.querySelector('.cad-blade-picker')),
      firstCard: box(region.querySelector('.cad-blade-card')),
      tooling: box(region.querySelector('details.cad-shop-tooling')),
      pedal: box(region.querySelector('.cad-shell-foot .cad-shop-primary')),
      footer: box(region.querySelector('.cad-shell-foot')),
      // The Blades row and the picker stay inside the pane's width (the shell
      // footer's own -10 px side margins make the pane scroll 22 px sideways
      // already, before BT-1: measured, not ours).
      bladesOverflow: [...region.querySelectorAll('.cad-blades, .cad-blades *')].some(
        (el) => el.getBoundingClientRect().right > paneBox.left + pane.clientWidth + 0.5,
      ),
      paneScroll: [pane.clientWidth, pane.scrollWidth],
    };
  });
const visible = (part, view) => part && part.top >= view.pane.top && part.bottom <= view.footer.top;

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
  // 1. The 300 × 100 blank on the brake: the Blades row in view at 1366 × 768.
  const { panel, map } = await blank(300, 100);
  const blades = panel.getByRole('group', { name: 'Blades' });
  const top = blades.getByRole('button', { name: /^Top: punch/ });
  const bottom = blades.getByRole('button', { name: /^Bottom: die/ });
  await expect(top).toHaveText('Top: punchStraight 88°tip R0.8');
  await expect(bottom).toHaveText('Bottom: dieV10 88°V 10 mm (automatic)');
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(panel, 'Backgauge L (mm)', 150);
  await fill(panel, 'Bend angle (°)', 90);
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  // The angle at the top of the pane: the angle, Bend shape and the Blades row all above the pinned footer.
  const angleToTop = () =>
    panel.getByLabel('Bend angle (°)', { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await angleToTop();
  measured.closed = await layout();
  const closed = measured.closed;
  assert(!closed.bladesOverflow, 'the Blades row fits the pane');
  assert(
    visible(closed.angle, closed) && visible(closed.shape, closed) && visible(closed.blades, closed),
    `angle, Bend shape and Blades in view: ${JSON.stringify(closed)}`,
  );
  assert(closed.pedal.bottom <= 768, 'the pedal in the pinned footer, on screen');
  await page.waitForTimeout(300);
  await shot('01-blades-row');
  checks.push(
    `1366 × 768: pane ${closed.pane.width} px wide, ${closed.pane.top}–${closed.pane.bottom}; angle ${closed.angle.top}–${closed.angle.bottom}, Bend shape ${closed.shape.top}–${closed.shape.bottom}, Blades ${closed.blades.top}–${closed.blades.bottom} (${closed.blades.bottom - closed.blades.top} px, buttons ${closed.bladeButtons.map((b) => b.width).join(' + ')} px), footer from ${closed.footer.top}, pedal ${closed.pedal.top}–${closed.pedal.bottom}; scrolled ${closed.scrollTop} px`,
  );

  // 2. The punch picker: every punch, this hit's verdict on each.
  await top.click();
  const picker = panel.getByRole('region', { name: 'Punches' });
  await expect(picker).toBeVisible();
  const card = (name) => picker.getByRole('button', { name, exact: true });
  await expect(card('Straight 88°')).toHaveAttribute('aria-pressed', 'true');
  await expect(card('Straight 88°').locator('.cad-blade-verdict')).toHaveText('Clears this hit');
  await expect(card('Gooseneck 88°').locator('.cad-blade-verdict')).toHaveText('Clears this hit', { timeout: 10000 });
  await expect(card('Gooseneck 88°')).toContainText('88° · tip R0.8 · H 104.5 · 500 kN/m');
  measured.cards = await picker.locator('.cad-blade-card').count();
  await angleToTop();
  measured.open = await layout();
  const open = measured.open;
  assert(!open.bladesOverflow, 'the picker fits the pane');
  assert(
    open.angle.top === closed.angle.top && open.shape.top === closed.shape.top && open.blades.top === closed.blades.top,
    'the picker opens below: the angle and Bend shape do not move',
  );
  await page.waitForTimeout(200);
  await shot('02-punch-picker');
  // Every card at once: the window made tall for this one picture, then back to 1366 × 768.
  const allCards = async (scope, name) => {
    await page.setViewportSize({ width: 1366, height: 2400 });
    await page.waitForTimeout(300);
    await scope.screenshot({ path: `${directory}/${name}.png` });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(200);
  };
  await allCards(picker, '03-punch-picker-cards');
  checks.push(
    `punch picker: ${measured.cards} cards, card ${open.firstCard.bottom - open.firstCard.top} px tall, picker ${open.picker.top}–${open.picker.bottom} (the angle ${open.angle.top}–${open.angle.bottom} and Bend shape stay where they were); straight and gooseneck: "Clears this hit"`,
  );

  // 3. Choose the gooseneck: the select, the 3D scene and the side view follow.
  await card('Gooseneck 88°').click();
  await expect(picker).toHaveCount(0);
  await expect(top).toHaveText('Top: punchGooseneck 88°tip R0.8');
  await expect(panel.getByLabel('Punch', { exact: true })).toHaveValue('gooseneck-88');
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await expect(sideView.locator('figcaption small')).toHaveText('Gooseneck 88° punch · V10 88° die');
  let state = await shop();
  assert.equal(state.station.punch, 'gooseneck-88');
  assert.equal(state.station.punchDrawn, 'gooseneck-88', JSON.stringify(state.station));
  await page.waitForTimeout(300);
  await shot('04-gooseneck-chosen');
  await sideView.screenshot({ path: `${directory}/05-side-view-gooseneck.png` });
  // Reverse punch: the throat to the backgauge, drawn so; then back.
  const reverse = panel.getByRole('checkbox', { name: 'Reverse punch' });
  await reverse.check();
  await expect(sideView.locator('figcaption small')).toHaveText('Gooseneck 88° punch (reversed) · V10 88° die');
  state = await shop();
  assert.equal(state.station.reverse, true);
  assert.equal(state.station.punchDrawn, 'gooseneck-88:reversed');
  await expect(panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await page.waitForTimeout(200);
  await sideView.screenshot({ path: `${directory}/06-side-view-reversed.png` });
  await reverse.uncheck();
  await expect(sideView.locator('figcaption small')).toHaveText('Gooseneck 88° punch · V10 88° die');
  checks.push(
    'gooseneck chosen from the picker → Punch select gooseneck-88, side view "Gooseneck 88° punch · V10 88° die", 3D tooling gooseneck-88; Reverse punch → drawn gooseneck-88:reversed, still clear; back',
  );

  // 4. The 90° hit with the gooseneck.
  const made = await bendMade(panel, 1, 'the gooseneck hit');
  assert.deepEqual(
    [made.angle, made.direction, made.punch, made.die],
    [90, 'up', 'gooseneck-88', 'v10-88'],
    JSON.stringify(made),
  );
  const rows = panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).locator('.cad-brake-check')).toHaveText('ok');
  await page.waitForTimeout(300);
  await shot('07-gooseneck-bend-made');
  checks.push(
    `300 × 100, L 150, 90° with the gooseneck → made ${JSON.stringify({ punch: made.punch, die: made.die })}, step ok`,
  );

  // 5. The die picker: Automatic first; V12 chosen and the select follows; back to automatic.
  await bottom.click();
  const dies = panel.getByRole('region', { name: 'Dies' });
  await expect(dies.getByRole('button', { name: 'Automatic (V10 88°)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(200);
  await allCards(dies, '08-die-picker-cards');
  await dies.getByRole('button', { name: 'V12 88°', exact: true }).click();
  await expect(panel.getByLabel('Die', { exact: true })).toHaveValue('v12-88');
  await expect(bottom).toHaveText('Bottom: dieV12 88°V 12 mm');
  await bottom.click();
  await panel
    .getByRole('region', { name: 'Dies' })
    .getByRole('button', { name: 'Automatic (V10 88°)', exact: true })
    .click();
  await expect(panel.getByLabel('Die', { exact: true })).toHaveValue('');
  checks.push('die picker: Automatic (V10 88°) first and in use; V12 88° chosen → Die select v12-88; Automatic again');

  // 6. The U channel: the standing flange hits the straight punch; the card's fix clears it.
  const again = await blank(115, 60);
  await again.map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  await fill(again.panel, 'Backgauge L (mm)', 45);
  await fill(again.panel, 'Bend angle (°)', 90);
  await expect(again.panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  const flange = await bendMade(again.panel, 1, 'the 45 flange');
  assert.equal(flange.punch, 'straight-88');
  await again.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await fill(again.panel, 'Backgauge L (mm)', 20);
  const collision = again.panel.getByRole('alert', { name: 'Collision' });
  await expect(collision).toContainText('the part hits the punch at');
  await expect(collision).toContainText('use the gooseneck punch');
  const fix = again.panel.getByRole('button', { name: 'Use the gooseneck punch', exact: true });
  await expect(fix).toBeVisible();
  await expect(again.panel.getByRole('button', { name: 'Bend', exact: true })).toBeDisabled();
  measured.collision = await collision.innerText();
  await page.waitForTimeout(300);
  await shot('09-channel-collision-fix');
  await fix.click();
  await expect(collision).toHaveCount(0);
  await expect(again.panel.getByLabel('Punch', { exact: true })).toHaveValue('gooseneck-88');
  await expect(again.panel.getByRole('status', { name: 'Collision check' })).toContainText('Clear through the stroke');
  await page.waitForTimeout(300);
  await shot('10-channel-fixed');
  const second = await bendMade(again.panel, 2, 'the channel hit with the gooseneck');
  assert.deepEqual([second.punch, second.die], ['gooseneck-88', 'v10-88'], JSON.stringify(second));
  const steps = again.panel.getByRole('list', { name: 'Sequence' }).getByRole('listitem');
  await expect(steps.nth(1).locator('.cad-brake-check')).toHaveText('ok');
  await page.waitForTimeout(300);
  await shot('11-channel-made');
  await page.locator('.cad-viewport').screenshot({ path: `${directory}/12-channel-3d.png` });
  checks.push(
    `channel 115 × 60: "${measured.collision}" → Use the gooseneck punch → clear; made ${JSON.stringify({ punch: second.punch, die: second.die })}, both steps ok`,
  );

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Brake blades BT-1 verification passed:\n- ' + checks.join('\n- '));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
