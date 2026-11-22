/* global process, console, document, getComputedStyle, window */
// The many-roofs guard (docs/multi-roof.md §5.6, MR-2). The user's report:
// with several trusses, adding a roof for a second truss removed the first.
// On the playground project:
//   1. a second truss system on screen, drawn through the UI: the sidebar's
//      Trusses "+" (which always starts a NEW system) and two presses on the
//      top floor's y = 4000 and y = 9100 beams, then moved clear of the first
//      system with the truss panel's Offset X so the two roofs do not overlap;
//   2. the demo's roof deleted, then a roof added to EACH system from its truss
//      panel ("Add roof"), and the first roof still on its system afterwards;
//   3. two roof cards in the sidebar, two roof layers in the 3D scene
//      (`data-roof-layers` on the preview), and the preview still counting
//      storeys only;
//   4. in the roof plan the other roof is drawn as context, and a click on it
//      makes it the active roof.
// MR-3 (docs/multi-roof.md §6): the two roofs get two covering colours from
// the roof panel, read back off the preview root and off the meshes the
// viewport draws (Solid, X-ray, Night), with screenshots in Realistic, Shaded,
// X-ray and Night.
// Screenshots of the 3D preview and the roof plan with both roofs.
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-multi-roof.mjs
//   ROOF_VERIFY_DIR=<folder for screenshots>   (default artifacts/floorplan/multi-roof)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = process.env.ROOF_VERIFY_DIR || 'artifacts/floorplan/multi-roof';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const CANVAS = 'svg[class*="_svg"]';
const PREVIEW = 'section[data-roof-layers]';
// The playground's top floor and the two parallel beams the new system spans
// (src/pages/playground-demo.json: beam_mmpufxi3_6zx at y = 4000 and
// beam_mmpufxi3_6zt at y = 9100, both from x = -4000 to 8000).
const TOP_FLOOR = 'Floor 2';
const BEAM_PRESSES = [
  { x: 2000, y: 4000 },
  { x: 2000, y: 9100 },
];
// Far enough along x that the moved system's roof clears the demo's hip roof.
const OFFSET_X_MM = 14000;
// MR-3: the two roofs' covering colours, picked from the roof panel's
// Colorbond strip (src/domain/roofCoveringCatalog.js ROOF_COLOUR_CATALOG).
const ROOF_COLOURS = [
  { swatch: 'Manor Red', hex: '#5E1D0E' },
  { swatch: 'Cottage Green', hex: '#304C3C' },
];

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
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(CANVAS, { timeout: 30000 });
  await page.waitForSelector(PREVIEW, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // A sidebar section by its title, and the parts of it this script reads.
  const section = (title) =>
    page.locator('div[class*="_section_"]').filter({
      has: page.locator(':scope > div > button span[class*="_sectionTitle_"]', { hasText: new RegExp(`^${title}$`) }),
    });
  const sectionCount = (title) => section(title).locator('span[class*="_count_"]').first().textContent();
  const cards = (title) => section(title).locator('div[class*="_floorCard_"]');
  const cardNames = (title) => cards(title).locator('span[class*="_floorName_"]').allTextContents();
  const activeCardNames = (title) =>
    section(title).locator('div[class*="_floorCardActive_"] span[class*="_floorName_"]').allTextContents();
  const button = (text) => page.getByRole('button', { name: text, exact: true });
  const statusText = () => page.evaluate(() => document.body.innerText);
  const settle = (ms = 500) => page.waitForTimeout(ms);

  // Model millimetres → screen pixels, through the canvas's own transform.
  const toScreen = (point) =>
    page.evaluate(({ x, y }) => {
      const group = [...document.querySelectorAll('svg[class*="_svg"] g[transform]')].find((node) =>
        node.getAttribute('transform').includes('scale('),
      );
      const m = group.getScreenCTM();
      return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
    }, point);
  const canvasRect = () =>
    page.evaluate((selector) => {
      const rect = document.querySelector(selector).parentElement.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }, CANVAS);
  const onCanvas = async (point) => {
    const [screen, rect] = await Promise.all([toScreen(point), canvasRect()]);
    return screen.x > rect.left + 20 &&
      screen.x < rect.right - 20 &&
      screen.y > rect.top + 40 &&
      screen.y < rect.bottom - 40
      ? screen
      : null;
  };
  // Zoom out about the middle of the canvas until every point is on screen.
  const bringOnScreen = async (points) => {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const screens = await Promise.all(points.map(onCanvas));
      if (screens.every(Boolean)) return screens;
      const rect = await canvasRect();
      await page.mouse.move((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      await page.mouse.wheel(0, 240); // out
      await settle(300);
    }
    throw new Error(`model points ${JSON.stringify(points)} never came on screen`);
  };
  // Both side panels away, so a pane on its own fills the window with nothing
  // drawn over it.
  const setPanels = async (shown) => {
    for (const name of ['Sidebar', 'Properties']) {
      const toggle = page.getByRole('button', { name: `${shown ? 'Show' : 'Hide'} ${name}`, exact: true });
      if (await toggle.count()) await toggle.click();
    }
    await settle(600);
  };
  const previewShot = async (name) => {
    await page.waitForTimeout(2500);
    const canvas = page.locator(`${PREVIEW} canvas`).first();
    const path = `${directory}/${name}.png`;
    await canvas.screenshot({ path });
    screenshots.push(path);
  };
  const planShot = async (name) => {
    await settle(400);
    const path = `${directory}/${name}.png`;
    await page.locator(CANVAS).first().screenshot({ path });
    screenshots.push(path);
  };
  const roofLayers = () =>
    page.evaluate((selector) => {
      const value = document.querySelector(selector)?.getAttribute('data-roof-layers') || '';
      return value.split(' ').filter(Boolean);
    }, PREVIEW);
  const fieldInput = (label) => page.getByLabel(label, { exact: true });

  // 0. The playground as shipped: one truss system, one roof.
  check(
    `the playground starts with one roof card (${await sectionCount('Roof')})`,
    (await sectionCount('Roof')) === '1',
  );
  check(`and one truss system (${await sectionCount('Trusses')})`, (await sectionCount('Trusses')) === '1');
  const [firstSystemName] = await cardNames('Trusses');

  // 1. A second truss system through the UI. The top floor holds the beams.
  await cards('Floors').filter({ hasText: TOP_FLOOR }).locator('button').first().click();
  await settle();
  await section('Trusses').locator('button[title="Draw a new truss system"]').click();
  await settle();
  const presses = await bringOnScreen(BEAM_PRESSES);
  for (const point of presses) {
    await page.mouse.move(point.x, point.y);
    await settle(150);
    await page.mouse.click(point.x, point.y);
    await settle(300);
  }
  const afterDraw = await statusText();
  check(
    'the draw reports a NEW system ("New truss system created above the selected beams.")',
    afterDraw.includes('New truss system created above the selected beams.'),
  );
  await settle(300);
  check(`two truss systems now (${await sectionCount('Trusses')})`, (await sectionCount('Trusses')) === '2');
  const systemNames = await cardNames('Trusses');
  const secondSystemName = systemNames.find((name) => name !== firstSystemName) || systemNames[1];

  // Move it clear of the first system, from its truss panel.
  await cards('Trusses').filter({ hasText: secondSystemName }).locator('button').first().click();
  await settle();
  const suffix = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((node) => node.textContent.trim() === 'Offset X');
    return label?.parentElement?.querySelector('[class*="_suffix_"]')?.textContent?.trim() || 'mm';
  });
  const offsetValue = suffix === 'm' ? String(OFFSET_X_MM / 1000) : String(OFFSET_X_MM);
  await fieldInput('Offset X').fill(offsetValue);
  await fieldInput('Offset X').press('Enter');
  await settle();
  check(
    `the new system moved along x (Offset X ${offsetValue} ${suffix})`,
    (await fieldInput('Offset X').inputValue()) === offsetValue,
  );

  // 2. Roofs from the truss panel. First the demo's roof goes, so that both
  // roofs are made the way the user makes them.
  await cards('Roof').first().locator('button').first().click();
  await settle();
  await page.locator('button[class*="_deleteBtn_"]').click();
  await settle();
  check(`the demo roof is deleted (${await sectionCount('Roof')} roofs)`, (await sectionCount('Roof')) === '0');

  const addRoofFromPanel = async (systemName) => {
    await cards('Trusses').filter({ hasText: systemName }).locator('button').first().click();
    await settle();
    const roofLink = await fieldInput('Roof Link').inputValue();
    check(`${systemName}: Roof Link reads "No roof" before (${roofLink})`, roofLink === 'No roof');
    await button('Add roof').click();
    await settle(200);
    const status = await statusText();
    check(`${systemName}: status "Roof added to ${systemName}."`, status.includes(`Roof added to ${systemName}.`));
    await settle(400);
    // The panel stays on the truss, now with the roof it carries.
    const linked = await fieldInput('Roof Link').inputValue();
    check(
      `${systemName}: Roof Link reads "${linked}" and the button is Open roof`,
      linked !== 'No roof' && (await button('Open roof').count()) === 1,
    );
    return linked;
  };
  const firstRoofName = await addRoofFromPanel(firstSystemName);
  check(`one roof card after the first (${await sectionCount('Roof')})`, (await sectionCount('Roof')) === '1');
  const secondRoofName = await addRoofFromPanel(secondSystemName);

  // 3. Both roofs, and the first one still on its system.
  check(
    `two roof cards (${await sectionCount('Roof')}: ${(await cardNames('Roof')).join(', ')})`,
    (await cardNames('Roof')).length === 2,
  );
  check(
    `the roofs are "${firstRoofName}" and "${secondRoofName}"`,
    JSON.stringify(await cardNames('Roof')) === JSON.stringify([firstRoofName, secondRoofName]),
  );
  await cards('Trusses').filter({ hasText: firstSystemName }).locator('button').first().click();
  await settle();
  const firstStill = await fieldInput('Roof Link').inputValue();
  check(
    `the first system still carries "${firstRoofName}" after the second roof was added (${firstStill})`,
    firstStill === firstRoofName,
  );
  check('no "Set as roof source" anywhere', (await button('Set as roof source').count()) === 0);

  await page.waitForTimeout(800);
  const layers = await roofLayers();
  check(`two roof layers in the 3D scene (${layers.join(', ')})`, layers.length === 2);
  const title = await page.locator(`${PREVIEW} span[class*="_title_"]`).first().textContent();
  check(`the preview counts storeys only, not roofs ("${title}")`, /^3 floors · /.test(title || ''));

  // 3b. MR-3 (docs/multi-roof.md §6): each roof in its own colour. Set from
  // the roof panel, then read back twice: off the preview root (what the
  // project says) and off the meshes the viewport draws (the dev server's
  // `window.__previewPerf.centers`, which reports each mesh's own material and
  // colour) — the proof that the second roof is not painted the first's colour.
  const [firstLayerId, secondLayerId] = layers;
  const pickRoofColour = async (roofName, swatch) => {
    await cards('Roof').filter({ hasText: roofName }).locator('button').first().click();
    await settle();
    const picked = await page.evaluate((name) => {
      const node = document.querySelector(`[data-colour-field="roof-covering-colour"] [data-swatch="${name}"]`);
      node?.click();
      return Boolean(node);
    }, swatch);
    check(`${roofName}: the ${swatch} swatch is in its roof panel and is picked`, picked);
    await settle(600);
  };
  await pickRoofColour(firstRoofName, ROOF_COLOURS[0].swatch);
  await pickRoofColour(secondRoofName, ROOF_COLOURS[1].swatch);
  const rootAttribute = (name) =>
    page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n), [PREVIEW, name]);
  const listed = await rootAttribute('data-roof-colours');
  check(
    `the preview root lists each roof's own colour (data-roof-colours="${listed}")`,
    listed === `${firstLayerId}=${ROOF_COLOURS[0].hex} ${secondLayerId}=${ROOF_COLOURS[1].hex}`,
  );
  const activeColour = await rootAttribute('data-roof-colour');
  check(
    `data-roof-colour is the active roof's, ${secondRoofName} (${activeColour})`,
    activeColour === ROOF_COLOURS[1].hex,
  );
  // What each roof's covering meshes are drawn with, by roof id.
  const drawnCoverings = () =>
    page.evaluate(() => {
      const perf = window.__previewPerf;
      const meshes = perf?.centers ? perf.centers('roofSystem') : null;
      if (!meshes) return null;
      const byRoof = {};
      for (const { paletteKey, sourceId, colour } of meshes) {
        if (!/^roof_(metal|tile|membrane|slab)@/.test(paletteKey || '')) continue;
        byRoof[sourceId] = byRoof[sourceId] || { keys: [], colours: [] };
        if (!byRoof[sourceId].keys.includes(paletteKey)) byRoof[sourceId].keys.push(paletteKey);
        if (!byRoof[sourceId].colours.includes(colour)) byRoof[sourceId].colours.push(colour);
      }
      return byRoof;
    });
  const checkDrawnColours = async (when) => {
    await page.waitForTimeout(800);
    const drawn = await drawnCoverings();
    check(`${when}: the viewport's debug handle answers (dev server)`, drawn !== null);
    [firstLayerId, secondLayerId].forEach((roofId, index) => {
      const seen = drawn?.[roofId];
      check(
        `${when}: roof ${index + 1}'s covering is drawn in ${ROOF_COLOURS[index].hex} on its own material (${JSON.stringify(seen)})`,
        Boolean(seen) &&
          seen.keys.length === 1 &&
          seen.keys[0].endsWith(`@${roofId}`) &&
          JSON.stringify(seen.colours) === JSON.stringify([ROOF_COLOURS[index].hex]),
      );
    });
  };
  await checkDrawnColours('Solid');

  // The preview fills the window for the pictures; a click on the sky drops
  // the selection so its card and tint are out of the way.
  await setPanels(false);
  await page.getByRole('button', { name: 'Focus preview' }).click();
  await settle(800);
  for (const preset of ['iso_southeast', 'iso_northwest']) {
    await page.selectOption('select[aria-label="Preview view preset"]', preset);
    await settle(800);
    const box = await page.locator(`${PREVIEW} canvas`).first().boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.04);
    await settle(400);
    await previewShot(`two-roofs-${preset.replace('_', '-')}`);
  }
  // Both colours in every look a roof is drawn in: Realistic, Shaded (the
  // white model as a flat drawing), X-ray and Night, from the same corner.
  await page.selectOption('select[aria-label="Preview view preset"]', 'iso_southeast');
  await settle(800);
  const previewButton = (name) => page.locator(PREVIEW).getByRole('button', { name, exact: true });
  const styleSelect = 'select[aria-label="Preview render style"]';
  await page.selectOption(styleSelect, 'realistic');
  await previewShot('two-colours-realistic');
  await page.selectOption(styleSelect, 'shaded');
  await previewShot('two-colours-shaded-white-model');
  await page.selectOption(styleSelect, 'realistic');
  await previewButton('X-ray').click();
  await previewShot('two-colours-xray');
  await checkDrawnColours('X-ray');
  await previewButton('Solid').click();
  await previewButton('Night').click();
  await previewShot('two-colours-night');
  await checkDrawnColours('Night');
  await previewButton('Night').click();
  await page.getByRole('button', { name: 'Exit focus mode' }).click();
  await settle(800);
  await setPanels(true);

  // 4. The roof plan: the active roof drawn in full, the other as context.
  await cards('Roof').filter({ hasText: firstRoofName }).locator('button').first().click();
  await settle();
  const [firstRoofId, secondRoofId] = layers;
  const contextIds = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-context-roof-id]')].map((n) => n.getAttribute('data-context-roof-id')),
    );
  check(
    `with ${firstRoofName} active the plan draws ${secondRoofName} as context (${(await contextIds()).join(', ')})`,
    JSON.stringify(await contextIds()) === JSON.stringify([secondRoofId]),
  );
  check(
    `${firstRoofName}'s card is the highlighted one`,
    JSON.stringify(await activeCardNames('Roof')) === JSON.stringify([firstRoofName]),
  );
  // The plan fills the window, so both roofs fit on screen for the picture
  // and for the click below.
  await setPanels(false);
  await page.getByRole('button', { name: 'Focus canvas' }).click();
  await settle(800);
  const label = await page.evaluate((id) => {
    const text = document.querySelector(`[data-context-roof-id="${id}"] text`);
    return { x: Number(text.getAttribute('x')), y: Number(text.getAttribute('y')) };
  }, secondRoofId);
  // Every corner of both roofs, in model millimetres (both drawings sit in the
  // canvas's model group, so their boxes are in its units).
  const roofCorners = await page.evaluate((id) => {
    const boxes = [
      document.querySelector(`[data-context-roof-id="${id}"] path`).getBBox(),
      document.querySelector('svg[class*="_svg"] g.roof-system').getBBox(),
    ];
    return boxes.flatMap((box) => [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
    ]);
  }, secondRoofId);
  const [labelOnScreen] = await bringOnScreen([label, ...roofCorners]);
  const contextStroke = await page.evaluate((id) => {
    const path = document.querySelector(`[data-context-roof-id="${id}"] path`);
    return { fill: path.getAttribute('fill'), events: getComputedStyle(path).pointerEvents };
  }, secondRoofId);
  check(
    `the context roof is an unfilled outline nobody can hit (${JSON.stringify(contextStroke)})`,
    contextStroke.fill === 'none' && contextStroke.events === 'none',
  );
  await planShot('roof-plan-first-active');

  // A click inside the other roof makes it the active roof.
  await page.mouse.click(labelOnScreen.x, labelOnScreen.y + 30);
  await settle();
  check(
    `a click inside ${secondRoofName} makes it the active roof: ${firstRoofName} is now the context (${(await contextIds()).join(', ')})`,
    JSON.stringify(await contextIds()) === JSON.stringify([firstRoofId]),
  );
  await planShot('roof-plan-second-active');
  await page.getByRole('button', { name: 'Exit focus mode' }).click();
  await settle(800);
  await setPanels(true);
  check(
    `the sidebar highlights ${secondRoofName}'s card now (${(await activeCardNames('Roof')).join(', ')})`,
    JSON.stringify(await activeCardNames('Roof')) === JSON.stringify([secondRoofName]),
  );

  check(`no page errors (${errors.length})`, errors.length === 0, `Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Multi-roof failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, screenshots }, null, 2),
  );
  console.log(
    'Multi-roof verification passed:\n- ' + checks.join('\n- ') + '\nScreenshots:\n- ' + screenshots.join('\n- '),
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
