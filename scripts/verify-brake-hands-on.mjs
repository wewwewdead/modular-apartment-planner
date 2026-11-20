/* global localStorage, process, console, document */
// Press brake, hands on the sheet HO-1 (docs/sketch-studio-brake-hands-on.md
// §5.6), at 1366 × 768 then 1600 × 900: a fresh model → Shop → Draw → Cut a
// 300 × 100 blank of 1.5 SPCC → Bend. (1) No line: the view toolbar reads
// Flip over / Turn around (disabled, with its reason), no Flip Horizontal;
// the flip hoop shows; a click on it turns the sheet over (the side view
// says Flipped over, the panel's switch agrees). (2) Gauge edge 2, L 200:
// both handles, each hovered (its chip and outcome); the turn ring dragged
// past half (the sheet follows, mid-drag screenshot, lands turned: the
// panel's L is the opposite edge's); the flip hoop dragged a quarter and let
// go (back where it was, the session unchanged). (3) The BT-2 channel (115 ×
// 60, the gooseneck reversed): the turn ring's chip says it clears turned
// around, and a click on it does. (4) F, T; typing 45 in Bend angle types
// "45" and flips nothing. (5) The grip's own work per drag frame, and the
// two outcomes' cost on the kiosk face frame. Every screen point pressed is
// one the scene reports (cadShop().station.grip). No page errors.
// HO-2 (§6.4), appended: on the sheet alone (the flat-blank card never
// touched) an edge clicked, the fingers dragged to 187 and 150 typed + Enter
// mid-drag, the die clicked and another chosen, Enter, the hoop flips the
// sheet, a second hit; the stored bends equal the same hits made through the
// card and the panel. The fingers' drag cost per position against the card's
// punch-line drag on the same part (judged on a production bundle). Points
// pressed are the ones the scene reports (cadShop().station.reach,
// cadBrakeHand, cadBrakeSpots).
//   CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-brake-hands-on.mjs
// Screenshots: artifacts/sketch-cad/brake-hands-on (or HANDS_SHOTS).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cadSteps } from './sketch-cad-steps.mjs';

const directory = process.env.HANDS_SHOTS || 'artifacts/sketch-cad/brake-hands-on';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  checks = [],
  measured = {};

async function session(width, height) {
  // Device scale 2: the close-ups of the handles stay sharp; the full shots are taken at CSS size.
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(`${width} × ${height}: ${e.message}`));
  const steps = cadSteps(page);
  const { properties, current, savedWhen, shopStation, shopMore } = steps;
  const footer = page.locator('.cad-status');
  const size = `${width}x${height}`;
  const station = () => page.evaluate(() => document.querySelector('.cad-viewport').cadShop().station);
  const grip = async () => (await station())?.grip;
  // Every frame until the station's state passes `test` (JS over `s`, cadShop().station).
  const stationWhen = (test, timeout = 20000) =>
    page.waitForFunction(
      (body) => {
        const s = document.querySelector('.cad-viewport')?.cadShop?.().station;
        return Boolean(s) && new Function('s', `return ${body};`)(s);
      },
      test,
      { polling: 'raf', timeout },
    );
  // A full shot, and a close-up round the grip when it shows.
  const shot = async (name, centre = null) => {
    await page.screenshot({ path: `${directory}/${size}-${name}.png`, scale: 'css' });
    const g = await grip();
    const c = centre || g?.handles?.flip?.centre || g?.handles?.turn?.centre;
    if (c)
      await page.screenshot({
        path: `${directory}/${size}-${name}-close.png`,
        clip: { x: Math.max(0, c[0] - 150), y: Math.max(0, c[1] - 100), width: 300, height: 200 },
      });
  };
  const fill = async (scope, label, value) => {
    const field = scope.getByLabel(label, { exact: true });
    await field.fill(String(value));
    await field.press('Enter');
  };
  const sheetGroup = page.getByRole('group', { name: 'Sheet', exact: true });
  const chip = page.locator('.cad-grip-chip');
  const mode = (label) => page.getByRole('group', { name: 'See-through mode' }).getByRole('button', { name: label });
  // A fresh model, then Draw → Cut a W × H blank of 1.5 SPCC, then the route's Bend.
  const blank = async (w, h) => {
    await page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
    await current();
    await page.getByRole('button', { name: 'Shop', exact: true }).click();
    const draw = properties.getByRole('region', { name: 'Draw' });
    await draw.getByRole('button', { name: /^Rectangle/ }).click();
    await fill(draw, 'Width W (mm)', w);
    await fill(draw, 'Height H (mm)', h);
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
    await stationWhen('s.grip.shown && s.grip.handles.flip && !s.turning');
    return { panel, map };
  };
  const bendMade = async (panel, count, what) => {
    await panel.getByRole('button', { name: 'Bend', exact: true }).click();
    const model = await savedWhen((m) => m.parts[0].features[0].bends.length === count, what);
    await expect(panel.getByRole('button', { name: 'Bend', exact: true })).toHaveText('Bend', { timeout: 20000 });
    return model.parts[0].features[0].bends[count - 1];
  };
  // Hover a handle by the point the scene reports; wait for it lit and its chip.
  const hover = async (kind) => {
    await page.mouse.move(5, 5);
    const g = await grip();
    const at = g.handles[kind].press;
    await page.mouse.move(at[0], at[1], { steps: 3 });
    await stationWhen(`s.grip.hot === '${kind}'`, 5000);
    await expect(chip).toBeVisible();
    return chip.innerText();
  };
  // A drag along a handle's arc as drawn (client points the scene reports),
  // from sample `from` through `to`, a frame between moves; `at`: a callback
  // on the way (sample index → promise), `release` false keeps the button down.
  const dragArc = async (kind, from, to, { at = null, release = true } = {}) => {
    const arc = (await grip()).handles[kind].arc;
    await page.mouse.move(...arc[from]);
    await page.mouse.down();
    const step = to > from ? 1 : -1;
    for (let i = from + step; step > 0 ? i <= to : i >= to; i += step) {
      await page.mouse.move(...arc[i]);
      await page.waitForTimeout(16);
      if (at) await at(i);
    }
    if (release) await page.mouse.up();
  };
  // ---------------------------------------------- HO-2 (§6.4): the rest of the set-up on the sheet
  const reach = async () => (await station())?.reach;
  const viewportCall = (name, args = []) =>
    page.evaluate(([n, a]) => document.querySelector('.cad-viewport')[n](...a), [name, args]);
  const handAt = (p) => viewportCall('cadBrakeHand', p);
  const spots = () => viewportCall('cadBrakeSpots');
  // A point on edge `index` (0-based) the scene's own pick gives to that edge.
  const edgeAt = async (index) => {
    const edge = (await reach()).edges.find((e) => e.index === index);
    for (const p of edge?.points || []) {
      const found = await handAt(p);
      if (found?.kind === 'edge' && found.index === index) return p;
    }
    throw new Error(`no point to press on edge ${index + 1}: ${JSON.stringify(edge)}`);
  };
  // Hover a client point until `lit` (JS over s, the station) holds and the chip shows.
  const hoverAt = async (p, lit) => {
    await page.mouse.move(5, 5);
    await page.mouse.move(p[0], p[1], { steps: 3 });
    await stationWhen(`Boolean(s.reach.lit) && ${lit}`, 5000);
    await expect(chip).toBeVisible();
    return chip.innerText();
  };
  // The machine's +Y (toward the backgauge) on screen at the fingers: a unit client vector.
  const backOnScreen = () =>
    page.evaluate(() => {
      const el = document.querySelector('.cad-viewport');
      const y = el.cadShop().station.fingerDistance;
      const a = el.cadProject([0, y + 45, 1002]),
        b = el.cadProject([0, y + 145, 1002]);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
    });
  const nextFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  // Press the fingers at their middle and drag them until the station reads L `target`, the button kept down.
  const fingersTo = async (target) => {
    const start = (await reach()).fingers[0];
    const back = await backOnScreen();
    await page.mouse.move(...start);
    await page.mouse.down();
    let p = start;
    for (let i = 0; i < 600; i++) {
      await nextFrame();
      const L = (await station()).gaugeDistance;
      if (i > 0 && L === target) return p;
      const px = i === 0 ? 6 : Math.sign(target - L) * Math.min(10, Math.max(0.35, Math.abs(target - L) / 3));
      p = [p[0] + back[0] * px, p[1] + back[1] * px];
      await page.mouse.move(...p);
    }
    throw new Error(`the fingers never read L ${target}`);
  };
  // Per move: pointer move → the flat blank redrawn (the station worked out,
  // the workspace re-rendered) and → the next frame, as verify-brake-flip-bt2
  // measures the card's drag. `moves(i)`: the i-th point to move to.
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
    const stats = (key) => {
      const values = list.map((m) => m[key]).sort((a, b) => a - b);
      return {
        mean: Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2)),
        median: Number(values[Math.floor(values.length / 2)].toFixed(2)),
        worst: Number(values.at(-1).toFixed(2)),
      };
    };
    return {
      positions: list.length,
      render: stats('dom'),
      frame: stats('frame'),
      values: { dom: list.map((m) => m.dom), frame: list.map((m) => m.frame) },
    };
  };
  return {
    reach,
    handAt,
    spots,
    edgeAt,
    hoverAt,
    fingersTo,
    nextFrame,
    backOnScreen,
    moveCost,
    page,
    station,
    grip,
    stationWhen,
    shot,
    fill,
    sheetGroup,
    chip,
    mode,
    blank,
    bendMade,
    hover,
    dragArc,
    properties,
    savedWhen,
    shopMore,
    shopStation,
    footer,
  };
}

try {
  // ------------------------------------------------ 1366 × 768: the whole of §5.6
  const s = await session(1366, 768);
  const { page } = s;
  // 1. The 300 × 100 blank on the brake, no line.
  const { panel, map } = await s.blank(300, 100);
  await expect(s.sheetGroup.getByRole('button', { name: 'Flip over', exact: true })).toBeEnabled();
  const turnButton = s.sheetGroup.getByRole('button', { name: 'Turn around', exact: true });
  await expect(turnButton).toBeDisabled();
  await expect(turnButton).toHaveAttribute('title', 'Pick the punch line first');
  for (const gone of ['Flip Horizontal', 'Flip Vertical', 'Move part', 'Rotate part', 'Measure', 'Unfold'])
    assert.equal(
      await page.locator('.cad-view-toolbar').getByRole('button', { name: gone, exact: true }).count(),
      0,
      `${gone} is not in the view toolbar at the brake`,
    );
  let g = await s.grip();
  assert(g.handles.flip && !g.handles.turn, `no line: the flip hoop only ${JSON.stringify(Object.keys(g.handles))}`);
  // HO-2 (§6.1) changed the no-line hint: the edge is clicked on the sheet.
  await expect(page.locator('.cad-viewport-hint')).toContainText(
    'Click an edge of the sheet: it goes to the backgauge · F flips the sheet · Drag background to orbit',
  );
  await page.waitForTimeout(300);
  await s.shot('01-no-line-flip-hoop');
  // Click it: the sheet turns over, the side view and the panel agree.
  await page.mouse.move(5, 5);
  await page.mouse.click(...g.handles.flip.press);
  await s.stationWhen('s.turning', 3000);
  await s.stationWhen('!s.turning && s.flipped', 5000);
  await expect(page.getByRole('figure', { name: 'Side view' }).locator('.cad-side-up')).toHaveText('Flipped over');
  await expect(panel.getByRole('switch', { name: 'Flip sheet' })).toBeChecked();
  await expect(s.sheetGroup.getByRole('button', { name: 'Flip over', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  measured.clickTurn = (await s.station()).lastTurn;
  checks.push(
    `no line: toolbar Flip over / Turn around (disabled: "Pick the punch line first"), no Flip Horizontal; the flip hoop click → turned over in ${measured.clickTurn.ms} ms, side view "Flipped over", the panel's switch on`,
  );
  console.log(checks.at(-1));
  // Back the right way up with the toolbar's button (the panel's switch agrees).
  await s.sheetGroup.getByRole('button', { name: 'Flip over', exact: true }).click();
  await s.stationWhen('!s.turning && !s.flipped', 5000);
  await expect(panel.getByRole('switch', { name: 'Flip sheet' })).not.toBeChecked();

  // 2. Gauge edge 2, L 200: both handles, each hovered, the turn ring dragged past half.
  await map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  // A newly picked gauge edge swings that edge to the fingers (§5.3).
  await s.stationWhen('s.turning', 3000);
  await s.stationWhen('!s.turning', 5000);
  await s.fill(panel, 'Backgauge L (mm)', 200);
  await s.stationWhen('s.grip.handles.turn && s.grip.outcomes.flip && s.grip.outcomes.turn', 5000);
  await expect(page.locator('.cad-viewport-hint')).toContainText(
    'Drag a ring on the sheet to flip or turn it · F flip · T turn around · Enter bends · Esc clears the line',
  );
  g = await s.grip();
  measured.outcomes300 = { ms: g.outcomesMs, flip: g.outcomes.flip, turn: g.outcomes.turn };
  const turnChip = await s.hover('turn');
  assert.match(turnChip, /Turn sheet around · T\s+Turned around it clears/, turnChip);
  await s.shot('02-turn-ring-hover');
  const flipChip = await s.hover('flip');
  assert.match(flipChip, /Flip sheet · F\s+Flipped over it clears/, flipChip);
  await s.shot('03-flip-hoop-hover');
  checks.push(`edge 2, L 200: chips "${turnChip.replace(/\s+/g, ' ')}" and "${flipChip.replace(/\s+/g, ' ')}"`);
  console.log(checks.at(-1));
  // The turn ring past half: from its back round its left side, 150° (7.5° a sample).
  g = await s.grip();
  const arcLength = g.handles.turn.arc.length;
  const middle = Math.floor(arcLength / 2);
  let midShot = false;
  await s.dragArc('turn', middle, Math.min(arcLength - 1, middle + 20), {
    at: async (i) => {
      if (midShot || i < middle + 16) return;
      midShot = true;
      const state = await s.station();
      measured.midDrag = { fraction: state.grip.fraction, phase: state.phase, chip: await s.chip.innerText() };
      await s.shot('04-turn-ring-mid-drag');
    },
  });
  assert(measured.midDrag?.fraction > 0.5, `the sheet follows past half: ${JSON.stringify(measured.midDrag)}`);
  assert.match(measured.midDrag.chip, /Turn sheet around · \d+° · release to turn it around/);
  measured.turnDrag = (await s.grip()).lastDrag;
  await s.stationWhen('!s.turning && !s.grip.handover', 5000);
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 4 · 100 mm');
  await expect(panel.getByLabel('Backgauge L (mm)', { exact: true })).toHaveValue('100');
  await s.shot('05-turned-around');
  checks.push(
    `turn ring dragged 150°: mid-drag ${JSON.stringify(measured.midDrag)}; landed on Edge 4, L 100; drag frames ${JSON.stringify(measured.turnDrag)}`,
  );
  console.log(checks.at(-1));
  // The flip hoop a quarter and let go: back where it was, nothing changed.
  const before = await s.station();
  g = await s.grip();
  const hoopMiddle = Math.floor(g.handles.flip.arc.length / 2);
  await s.dragArc('flip', hoopMiddle, hoopMiddle + 7);
  measured.quarterDrag = (await s.grip()).lastDrag;
  await s.stationWhen('!s.turning && !s.grip.dragging', 5000);
  const after = await s.station();
  assert.equal(after.flipped, before.flipped, 'a quarter turn leaves the sheet as it was');
  assert.equal(after.gaugeDistance, before.gaugeDistance);
  await expect(panel.getByRole('switch', { name: 'Flip sheet' })).not.toBeChecked();
  await expect(panel.getByLabel('Backgauge L (mm)', { exact: true })).toHaveValue('100');
  checks.push(`flip hoop dragged 45° and let go: back, not flipped, L 100 (${JSON.stringify(measured.quarterDrag)})`);
  console.log(checks.at(-1));
  // Esc mid-drag: back, the line still picked.
  await s.dragArc('flip', hoopMiddle, hoopMiddle + 16, { release: false });
  await s.stationWhen('s.grip.dragging === "flip" && s.grip.fraction > 0.4', 3000);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await s.stationWhen('!s.turning && !s.grip.dragging', 5000);
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 4 · 100 mm');
  assert.equal((await s.station()).flipped, false);
  checks.push('Esc mid-drag (the hoop at 100°+): back, still Edge 4, not flipped');
  console.log(checks.at(-1));
  // The see-through modes: the handles read against the sheet, the die and the background.
  for (const [label, name] of [
    ['X-ray', '06-xray'],
    ['Wireframe', '07-wire'],
  ]) {
    await s.mode(label).click();
    await page.waitForTimeout(400);
    await s.hover('turn');
    await s.shot(name);
  }
  await s.mode('Solid').click();

  // 4. F and T; typing 45 in Bend angle types "45" and flips nothing.
  await page.mouse.move(5, 5);
  await page.locator('.cad-view-toolbar').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('f');
  await s.stationWhen('!s.turning && s.flipped', 5000);
  await expect(panel.getByRole('switch', { name: 'Flip sheet' })).toBeChecked();
  await page.keyboard.press('t');
  await s.stationWhen('!s.turning && s.gaugeDistance === 200', 5000);
  await expect(panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 2 · 100 mm');
  const angle = panel.getByLabel('Bend angle (°)', { exact: true });
  await angle.click();
  await angle.fill('');
  await page.keyboard.type('45');
  await expect(angle).toHaveValue('45');
  await expect(panel.getByRole('switch', { name: 'Flip sheet' })).toBeChecked();
  assert.equal((await s.station()).turning, false, 'typing T or F in a field turns nothing');
  await angle.press('Enter');
  checks.push('F flips, T turns around (Edge 2, L 200); typing 45 in Bend angle types "45", nothing flips');
  console.log(checks.at(-1));

  // 3. The BT-2 channel: the turn ring's chip says it clears turned around, and it does.
  const again = await s.blank(115, 60);
  await again.map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  await s.fill(again.panel, 'Backgauge L (mm)', 45);
  await s.fill(again.panel, 'Bend angle (°)', 90);
  await s.bendMade(again.panel, 1, 'the 45 flange');
  await again.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await s.fill(again.panel, 'Backgauge L (mm)', 20);
  await again.panel
    .getByRole('group', { name: 'Blades' })
    .getByRole('button', { name: /^Top: punch/ })
    .click();
  await again.panel
    .getByRole('region', { name: 'Punches' })
    .getByRole('button', { name: 'Gooseneck 88°', exact: true })
    .click();
  await again.panel.getByRole('checkbox', { name: 'Reverse punch' }).check();
  await expect(again.panel.getByRole('alert', { name: 'Collision' })).toContainText('the part hits the punch');
  await s.stationWhen('s.grip.outcomes.turn && s.grip.outcomes.flip && !s.turning', 5000);
  g = await s.grip();
  measured.channel = g.outcomes;
  assert.equal(g.outcomes.turn.ok, true, `turned around it clears: ${JSON.stringify(g.outcomes)}`);
  const channelChip = await s.hover('turn');
  assert.match(channelChip, /Turned around it clears/, channelChip);
  const flipped = await s.hover('flip');
  await s.hover('turn');
  await s.shot('08-channel-turn-clears');
  await page.mouse.click(...(await s.grip()).handles.turn.press);
  await expect(again.panel.getByRole('alert', { name: 'Collision' })).toHaveCount(0);
  await expect(again.panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 4 · 60 mm');
  // The same line, 95 from edge 4 on the flat blank. Since SG-1 (docs/sketch-studio-skin-gauge.md
  // §4.5) L is what the backgauge reads: past the 45 flange from edge 4, off that flange's skin
  // (the field read 95, the flat distance, before).
  await expect(again.panel.locator('dd[aria-label="Line on the flat blank"]')).toHaveText('95 mm from edge 4');
  const turnedL = await again.panel.getByLabel('Backgauge L (mm)', { exact: true }).inputValue();
  await expect(again.panel.locator('dd[aria-label="Backgauge L"]')).toHaveText(
    `${Number(Number(turnedL).toFixed(2))} mm · off bend 1's flange`,
  );
  await s.stationWhen('!s.turning', 5000);
  await s.shot('09-channel-turned');
  checks.push(
    `channel 115 × 60, gooseneck reversed: turn chip "${channelChip.replace(/\s+/g, ' ')}", flip chip "${flipped.replace(/\s+/g, ' ')}"; the ring's click → Edge 4, the line 95 from it, L ${turnedL} off bend 1's flange, no collision`,
  );
  console.log(checks.at(-1));

  // 5. The two outcomes on the kiosk face frame (the heaviest part), and the grip's drag there.
  await s.page.goto(process.env.CAD_VERIFY_URL || 'http://localhost:5180/sketch');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '3D Model & workshop', exact: true }).click();
  await page.getByText('Model current', { exact: true }).waitFor({ timeout: 60000 });
  await s.shopMore('Example: kiosk');
  await s.savedWhen((m) => m.instances.length === 37, 'the kiosk');
  await expect(s.footer).toContainText('Model current', { timeout: 120000 });
  await s.shopStation('Bend');
  const pick = s.properties.getByRole('button', { name: /^Front face frame/ });
  if (await pick.count()) await pick.first().click();
  await s.properties.getByRole('button', { name: /^Remove .* and bend$/ }).click();
  const kiosk = s.properties.getByRole('region', { name: 'Press brake' });
  await expect(kiosk).toBeVisible();
  // Its last hit, the 15° crease, taken off and set up again as two points: the face frame about to be creased.
  // The front face frame's part, by its instance's name (the example's ids are its own).
  const faceBends = (m) => {
    const instance = m.instances.find((i) => i.name === 'Front face frame');
    return m.parts.find((p) => p.id === instance.partId).features.find((f) => f.type === 'sheetmetal').bends;
  };
  const faceModel = await s.savedWhen(
    (m) => !(m.finishes || []).some((f) => f.instanceId === m.instances.find((i) => i.name === 'Front face frame').id),
    'paint off',
  );
  const crease = faceBends(faceModel).at(-1);
  const sequence = kiosk.getByRole('list', { name: 'Sequence' });
  const steps = await sequence.getByRole('listitem').count();
  await sequence
    .getByRole('listitem', { name: `Step ${steps}` })
    .getByRole('button', { name: 'Remove' })
    .click();
  await s.savedWhen((m) => faceBends(m).length === faceBends(faceModel).length - 1, 'the crease taken off');
  await kiosk.getByRole('group', { name: 'Punch line' }).getByRole('button', { name: 'Two points' }).click();
  for (const [label, value] of [
    ['A X (mm)', crease.a[0]],
    ['A Y (mm)', crease.a[1]],
    ['B X (mm)', crease.b[0]],
    ['B Y (mm)', crease.b[1]],
    ['Bend angle (°)', crease.angle],
  ])
    await s.fill(kiosk, label, value);
  // A bend down: the sheet flipped over, with the toolbar's Flip over.
  await s.sheetGroup.getByRole('button', { name: 'Flip over', exact: true }).click();
  await expect(kiosk.getByRole('switch', { name: 'Flip sheet' })).toBeChecked();
  await s.stationWhen('s.grip.handles.turn && !s.turning', 10000);
  await page.waitForTimeout(400);
  g = await s.grip();
  measured.kioskLazy = g.lazy;
  measured.kioskBeforeApproach = { flip: g.outcomes.flip, turn: g.outcomes.turn };
  await s.hover('turn');
  await s.stationWhen('s.grip.outcomes.turn', 5000);
  await s.hover('flip');
  await s.stationWhen('s.grip.outcomes.flip', 5000);
  g = await s.grip();
  measured.kioskOutcomesMs = g.outcomesMs;
  measured.kioskOutcomes = g.outcomes;
  await s.shot('10-kiosk-face-frame-crease');
  const kioskMiddle = Math.floor(g.handles.turn.arc.length / 2);
  await s.dragArc('turn', kioskMiddle, kioskMiddle - 8);
  measured.kioskDrag = (await s.grip()).lastDrag;
  await s.stationWhen('!s.turning && !s.grip.dragging', 5000);
  assert(measured.kioskDrag?.frames > 3, `the kiosk's turn ring drags: ${JSON.stringify(measured.kioskDrag)}`);
  checks.push(
    `kiosk face frame, the crease pending: worked out on approach (lazy ${measured.kioskLazy}, before approach ${JSON.stringify(measured.kioskBeforeApproach)}); both outcomes ${measured.kioskOutcomesMs} ms; a 60° drag of the turn ring ${JSON.stringify(measured.kioskDrag)}`,
  );
  console.log(checks.at(-1));

  // ------------------------------------------------ HO-2 (§6.4): the whole hit set up on the sheet alone
  // The flat-blank card is never touched: an edge clicked on the sheet, the
  // fingers dragged to 187 and 150 typed mid-drag, the die clicked and another
  // chosen, Enter, the hoop flips the sheet, a second hit the same way.
  const stored = (m) =>
    m.parts[0].features[0].bends.map(({ id: _id, stroke: _stroke, ...bend }) => ({
      ...bend,
      a: bend.a.map((v) => Number(Number(v).toFixed(6))),
      b: bend.b.map((v) => Number(Number(v).toFixed(6))),
    }));
  const blurAll = () => page.evaluate(() => document.activeElement?.blur?.());
  const sheetAlone = await s.blank(300, 100);
  await expect(page.locator('.cad-viewport-hint')).toContainText(
    'Click an edge of the sheet: it goes to the backgauge · F flips the sheet',
  );
  await expect(sheetAlone.map).toContainText('Click an edge, here or on the sheet');
  // 1. Edge 2 (the right end) clicked on the sheet.
  const edge2 = await s.edgeAt(1);
  const edgeChip = await s.hoverAt(edge2, "s.reach.lit.kind === 'edge' && s.reach.lit.index === 1");
  assert.equal(edgeChip.replace(/\s+/g, ' ').trim(), 'Edge 2 · 100 mm · click: to the backgauge');
  assert.equal(await page.locator('.cad-viewport canvas').evaluate((c) => c.style.cursor), 'pointer');
  await s.shot('11-edge-hover', edge2);
  await page.mouse.click(...edge2);
  await expect(sheetAlone.panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 2 · 100 mm');
  await s.stationWhen('!s.turning && s.reach.fingersOffered && s.reach.fingers.length === 2', 5000);
  // 2. The fingers: hovered, dragged to 187 (the readout by the cursor), 150 typed + Enter mid-drag.
  const fingers = (await s.reach()).fingers;
  const fingerChip = await s.hoverAt(fingers[0], "s.reach.lit.kind === 'fingers'");
  assert.equal(fingerChip.replace(/\s+/g, ' ').trim(), 'Backgauge · L 20 · drag, or click to type');
  await s.shot('12-fingers-hover', fingers[0]);
  const at187 = await s.fingersTo(187);
  await expect(s.chip).toContainText('L 187 mm · flange');
  measured.readout187 = (await s.chip.innerText()).replace(/\s+/g, ' ').trim();
  assert.equal((await s.reach()).held, true);
  await s.shot('13-fingers-drag-187', at187);
  await page.keyboard.type('150');
  await expect(s.chip).toContainText('150 mm · Enter applies');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(sheetAlone.panel.getByLabel('Backgauge L (mm)', { exact: true })).toHaveValue('150');
  await s.stationWhen('s.gaugeDistance === 150 && !s.reach.held', 5000);
  checks.push(
    `sheet alone: edge chip "${edgeChip.replace(/\s+/g, ' ').trim()}" → Edge 2; fingers chip "${fingerChip.replace(/\s+/g, ' ').trim()}", dragged to 187 ("${measured.readout187}"), 150 typed + Enter → L 150`,
  );
  console.log(checks.at(-1));
  // 3. The die: named on hover, a click opens its picker (focused); another die chosen.
  let blades = await s.spots();
  const dieChip = await s.hoverAt(blades.die, "s.reach.lit.kind === 'blade' && s.reach.lit.blade === 'die'");
  assert.match(dieChip.replace(/\s+/g, ' ').trim(), /^V\d+ 88° die · click to change$/);
  await s.shot('14-die-hover', blades.die);
  await page.mouse.click(...blades.die);
  const dies = sheetAlone.panel.getByRole('region', { name: 'Dies' });
  await expect(dies).toBeVisible();
  assert.equal(await sheetAlone.panel.getByRole('region', { name: 'Punches' }).count(), 0, 'the die picker only');
  assert(
    await dies.evaluate((el) => el.contains(document.activeElement)),
    'the die picker has the focus',
  );
  await s.shot('15-die-picker');
  const automatic = dieChip.match(/^(V\d+ 88°)/)[1];
  const otherDie = automatic === 'V12 88°' ? 'V16 88°' : 'V12 88°';
  await dies.getByRole('button', { name: otherDie, exact: true }).click();
  await expect(dies).toHaveCount(0);
  // The punch names itself too, and leads to its own picker.
  blades = await s.spots();
  const punchChip = await s.hoverAt(blades.punch, "s.reach.lit.kind === 'blade' && s.reach.lit.blade === 'punch'");
  assert.equal(punchChip.replace(/\s+/g, ' ').trim(), 'Straight 88° punch · click to change');
  await s.shot('16-punch-hover', blades.punch);
  // 4. Enter is the pedal.
  await page.mouse.move(5, 5);
  await blurAll();
  await page.keyboard.press('Enter');
  const aloneOne = await s.savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first hit, on the sheet');
  await s.stationWhen('!s.stroking && !s.turning && s.grip.shown && s.grip.handles.flip', 20000);
  // 5. Flip with the hoop.
  // (With no line the station shows the hit just made, as it stands: the
  // sheet lies flipped once the next line is picked.)
  await page.mouse.click(...(await s.grip()).handles.flip.press);
  await expect(sheetAlone.panel.getByRole('switch', { name: 'Flip sheet' })).toBeChecked();
  // 6. The second hit: edge 4 (the left end) on the sheet. L 150 from there lies on the first bend
  // (no line, no fingers): L 60 is typed, then the fingers bring it to 45.
  await s.stationWhen('s.reach.edges.length === 4', 5000);
  const edge4 = await s.edgeAt(3);
  await s.hoverAt(edge4, "s.reach.lit.kind === 'edge' && s.reach.lit.index === 3");
  await s.shot('17-edge-4-after-a-hit', edge4);
  await page.mouse.click(...edge4);
  await expect(sheetAlone.panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 4 · 100 mm');
  await s.fill(sheetAlone.panel, 'Backgauge L (mm)', 60);
  await s.stationWhen('!s.turning && s.reach.fingersOffered && s.reach.fingers.length === 2', 5000);
  await s.fingersTo(45);
  await page.mouse.up();
  await s.stationWhen('s.gaugeDistance === 45 && !s.reach.held && !s.turning', 5000);
  await s.shot('18-second-hit-set');
  await page.mouse.move(5, 5);
  await blurAll();
  await page.keyboard.press('Enter');
  const alone = stored(
    await s.savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the second hit, on the sheet'),
  );
  assert.equal(stored(aloneOne).length, 1);
  await s.stationWhen('!s.stroking', 20000);
  await s.shot('19-two-hits-on-the-sheet');

  // The same two hits through the card and the panel.
  const byCard = await s.blank(300, 100);
  await byCard.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await s.fill(byCard.panel, 'Backgauge L (mm)', 150);
  await byCard.panel
    .getByRole('group', { name: 'Blades' })
    .getByRole('button', { name: /^Bottom: die/ })
    .click();
  await byCard.panel.getByRole('region', { name: 'Dies' }).getByRole('button', { name: otherDie, exact: true }).click();
  await blurAll();
  await page.keyboard.press('Enter');
  await s.savedWhen((m) => m.parts[0].features[0].bends.length === 1, 'the first hit, by the card');
  await s.stationWhen('!s.stroking && !s.turning', 20000);
  // The panel's switch (below the fold: clicked as the keyboard would).
  await byCard.panel.getByRole('switch', { name: 'Flip sheet' }).evaluate((el) => el.click());
  await expect(byCard.panel.getByRole('switch', { name: 'Flip sheet' })).toBeChecked();
  await byCard.map.getByRole('button', { name: 'Gauge edge 4', exact: true }).click();
  await s.fill(byCard.panel, 'Backgauge L (mm)', 45);
  await s.stationWhen('!s.turning', 5000);
  await blurAll();
  await page.keyboard.press('Enter');
  const card = stored(await s.savedWhen((m) => m.parts[0].features[0].bends.length === 2, 'the second hit, by the card'));
  assert.deepEqual(alone, card, `on the sheet alone ${JSON.stringify(alone)} vs the card ${JSON.stringify(card)}`);
  measured.sheetAloneBends = alone;
  measured.cardBends = card;
  checks.push(
    `die chip "${dieChip.replace(/\s+/g, ' ').trim()}" → its picker focused, ${otherDie} chosen; punch chip "${punchChip.replace(/\s+/g, ' ').trim()}"; Enter; the hoop flips; edge 4 on the sheet, L 60 typed, fingers to 45, Enter: the stored bends equal the same hits by the card and the panel ${JSON.stringify(alone)}`,
  );
  console.log(checks.at(-1));

  // Drag cost (§6.4): the card's punch-line drag and the fingers' drag on the same part, per position.
  const costPart = await s.blank(300, 100);
  await costPart.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await s.fill(costPart.panel, 'Backgauge L (mm)', 200);
  await s.stationWhen('!s.turning && s.reach.fingersOffered', 5000);
  await page.waitForTimeout(400);
  const flatAt = (x, y) =>
    page.evaluate(
      ([fx, fy]) => {
        const svg = document.querySelector('[aria-label="Flat pattern"]');
        const p = new DOMPoint(fx, -fy).matrixTransform(svg.getScreenCTM());
        return [p.x, p.y];
      },
      [x, y],
    );
  // Each move waits a frame, so a move's time falls into one of two modes (the
  // next task, about 9 ms, or a frame later, about 30 ms) by its phase against
  // the frame: three rounds, each the card's drag then the fingers' over the
  // same 30 mm, the moves of all three taken together.
  const rounds = [];
  for (let round = 0; round < 3; round++) {
    // The card: the punch line (x = 300 − L) from L 200 to 170, 30 moves.
    await page.mouse.move(...(await flatAt(100, 50)));
    await page.mouse.down();
    const card = await s.moveCost(30, (i) => flatAt(100 + i, 50));
    await page.mouse.up();
    await s.stationWhen('s.gaugeDistance === 170 && s.reach.fingers.length === 2', 5000);
    await page.waitForTimeout(400);
    // The fingers: from L 170 back toward 200, about a millimetre a move.
    const fingerStart = (await s.reach()).fingers[0];
    const back = await s.backOnScreen();
    const mmPerPx = await page.evaluate(() => {
      const el = document.querySelector('.cad-viewport');
      const L = el.cadShop().station.fingerDistance;
      const a = el.cadProject([0, L + 45, 1002]),
        b = el.cadProject([0, L + 145, 1002]);
      return 100 / Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
    await page.mouse.move(...fingerStart);
    await page.mouse.down();
    await page.mouse.move(fingerStart[0] + back[0] * 5, fingerStart[1] + back[1] * 5);
    await s.nextFrame();
    const fingers = await s.moveCost(30, (i) => [
      fingerStart[0] + back[0] * (5 + i / mmPerPx),
      fingerStart[1] + back[1] * (5 + i / mmPerPx),
    ]);
    await page.mouse.up();
    rounds.push({ card, fingers, fingersTo: (await s.station()).gaugeDistance });
    await s.fill(costPart.panel, 'Backgauge L (mm)', 200);
    await s.stationWhen('s.gaugeDistance === 200', 5000);
    await page.waitForTimeout(400);
  }
  const pooled = (kind, key) => {
    const values = rounds.flatMap((r) => r[kind].values[key]).sort((a, b) => a - b);
    return {
      positions: values.length,
      mean: Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2)),
      median: Number(values[Math.floor(values.length / 2)].toFixed(2)),
      worst: Number(values.at(-1).toFixed(2)),
    };
  };
  measured.dragRounds = rounds.map((r) => ({
    card: { render: r.card.render, frame: r.card.frame },
    fingers: { render: r.fingers.render, frame: r.fingers.frame, to: r.fingersTo },
  }));
  measured.cardDrag = { render: pooled('card', 'dom'), frame: pooled('card', 'frame') };
  measured.fingerDrag = { render: pooled('fingers', 'dom'), frame: pooled('fingers', 'frame') };
  // Judged on a production bundle (CAD_VERIFY_URL at `vite preview`). On the
  // dev server React's development build gives the first 10,000 elements
  // rendered each second a console task each (react-dom's
  // recentlyCreatedOwnerStacks), so a move costs about 9 ms or about 30 ms by
  // where it falls in that second, not by its own work: the numbers are
  // recorded there, not judged.
  measured.devBuild = await page.evaluate(() => Boolean(document.querySelector('script[src*="/@vite/client"]')));
  if (!measured.devBuild)
    assert(
      measured.fingerDrag.render.mean <= measured.cardDrag.render.mean + 2,
      `the fingers drag within 2 ms of the card per position: ${JSON.stringify({ card: measured.cardDrag, fingers: measured.fingerDrag, rounds: measured.dragRounds })}`,
    );
  checks.push(
    `drag cost on 300 × 100${measured.devBuild ? ' (dev build: recorded, not judged)' : ''}, per position (3 rounds of 30): the card's punch line ${JSON.stringify(measured.cardDrag)}; the fingers ${JSON.stringify(measured.fingerDrag)}; rounds ${JSON.stringify(measured.dragRounds)}`,
  );
  console.log(checks.at(-1));
  // The look in X-ray and Wire: an edge lit, the fingers lit.
  const lookEdge = await s.edgeAt(0);
  for (const [label, name] of [
    ['X-ray', '20-xray-edge'],
    ['Wireframe', '21-wire-edge'],
  ]) {
    await s.mode(label).click();
    await page.waitForTimeout(400);
    await s.hoverAt(lookEdge, "s.reach.lit.kind === 'edge' && s.reach.lit.index === 0");
    await s.shot(name, lookEdge);
  }
  await s.mode('Solid').click();
  await page.close();

  // ------------------------------------------------ 1600 × 900: the same look
  const t = await session(1600, 900);
  const big = await t.blank(300, 100);
  await t.page.waitForTimeout(300);
  await t.shot('01-no-line-flip-hoop');
  await big.map.getByRole('button', { name: 'Gauge edge 2', exact: true }).click();
  await t.fill(big.panel, 'Backgauge L (mm)', 200);
  await t.stationWhen('s.grip.handles.turn && s.grip.outcomes.turn && !s.turning', 5000);
  await t.hover('turn');
  await t.shot('02-turn-ring-hover');
  await t.hover('flip');
  await t.shot('03-flip-hoop-hover');
  for (const [label, name] of [
    ['X-ray', '06-xray'],
    ['Wireframe', '07-wire'],
  ]) {
    await t.mode(label).click();
    await t.page.waitForTimeout(400);
    await t.hover('flip');
    await t.shot(name);
  }
  checks.push('1600 × 900: the hoop, the ring, both chips, X-ray and Wire shot');
  // HO-2 at 1600 × 900: an edge, the fingers and the die on approach, the fingers in the hand.
  await t.mode('Solid').click();
  const wide = await t.blank(300, 100);
  const wideEdge = await t.edgeAt(1);
  await t.hoverAt(wideEdge, "s.reach.lit.kind === 'edge'");
  await t.shot('11-edge-hover', wideEdge);
  await t.page.mouse.click(...wideEdge);
  await expect(wide.panel.getByLabel('Gauge edge', { exact: true })).toHaveText('Edge 2 · 100 mm');
  await t.stationWhen('!s.turning && s.reach.fingersOffered && s.reach.fingers.length === 2', 5000);
  const wideFingers = (await t.reach()).fingers[0];
  await t.hoverAt(wideFingers, "s.reach.lit.kind === 'fingers'");
  await t.shot('12-fingers-hover', wideFingers);
  const wideAt = await t.fingersTo(120);
  await t.shot('13-fingers-drag', wideAt);
  await t.page.keyboard.press('Escape');
  await t.page.mouse.up();
  await expect(wide.panel.getByLabel('Backgauge L (mm)', { exact: true })).toHaveValue('20');
  const wideBlades = await t.spots();
  await t.hoverAt(wideBlades.die, "s.reach.lit.kind === 'blade'");
  await t.shot('14-die-hover', wideBlades.die);
  checks.push('1600 × 900: an edge, the fingers (dragged to 120, Esc put L back to 20) and the die shot');
  await t.page.close();

  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, measured }, null, 2),
  );
  console.log('Brake hands on HO-1 / HO-2 verification passed:\n- ' + checks.join('\n- '));
  console.log(JSON.stringify(measured, null, 2));
} catch (error) {
  for (const page of browser.contexts().flatMap((c) => c.pages()))
    await page.screenshot({ path: `${directory}/failure-${page.viewportSize().width}.png` }).catch(() => {});
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
