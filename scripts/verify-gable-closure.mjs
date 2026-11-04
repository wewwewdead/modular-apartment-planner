/* global process, console, document */
// The gable-end closure guard (docs/roof-truss-industrial.md §6.5, RT-2). On
// the playground project: the playground truss is a hip, so switch its
// instance to the Gable type first (spec §10) and press the Roof panel's
// "Reset slope" (the playground roof stores a manual slope; RT-3.1 makes a
// manual slope pivot on the bearings, so the pictures would show the roof
// below the trusses near the ridge); then, in Truss mode, set End A
// to Open and back to Infill in the system panel's "Gable ends" section,
// photographing the 3D preview from the Front preset each time, and click the
// closure panel in 3D: the truss system's inspect card must read
// "End A: Infill · fibre cement".
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-gable-closure.mjs
//   GABLE_VERIFY_DIR=<folder for screenshots>   (default artifacts/floorplan/gable-closure)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = process.env.GABLE_VERIFY_DIR || 'artifacts/floorplan/gable-closure';
await mkdir(directory, { recursive: true });
const url = process.env.FLOORPLAN_VERIFY_URL || 'http://localhost:5199/playground';
const CANVAS = 'svg[class*="_svg"]';
const PREVIEW = 'section[data-roof-colour]';
const PRESET = 'select[aria-label="Preview view preset"]';

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

  const clickButtonText = async (text) => {
    const found = await page.evaluate((t) => {
      const node = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
      node?.click();
      return Boolean(node);
    }, text);
    assert(found, `button "${text}" exists`);
    await page.waitForTimeout(500);
  };
  // The sidebar's truss system card: "<name><floor> · N instance(s)".
  const selectSystemCard = async () => {
    const text = await page.evaluate(() => {
      const node = [...document.querySelectorAll('button')].find((b) => / instances?$/.test(b.textContent.trim()));
      node?.click();
      return node ? node.textContent.trim() : null;
    });
    assert(text, 'the truss system card exists');
    await page.waitForTimeout(600);
    return text;
  };
  const endAMode = () =>
    page.evaluate(() => document.querySelector('[data-closure-side="start"] select')?.value || null);
  const setEndAMode = async (mode) => {
    await page.locator('[data-closure-side="start"] select').first().selectOption(mode);
    await page.waitForTimeout(800);
  };
  const canvasBox = async () => {
    const box = await page.locator(`${PREVIEW} canvas`).first().boundingBox();
    assert(box, 'the 3D preview canvas has a box');
    return box;
  };
  const clickSky = async () => {
    const box = await canvasBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.04);
    await page.waitForTimeout(500);
  };
  const setPreset = async (value) => {
    await page.selectOption(PRESET, value);
    await page.waitForTimeout(900);
  };
  const previewShot = async (name) => {
    // Let the progressive refine settle so the picture is the real one.
    await page.waitForTimeout(2500);
    const path = `${directory}/${name}.png`;
    await page.locator(`${PREVIEW} canvas`).first().screenshot({ path });
    screenshots.push(path);
  };
  const inspectRow = (label) =>
    page.evaluate((wanted) => {
      const row = [...document.querySelectorAll('[class*="inspectRow"]')].find(
        (node) => node.firstElementChild?.textContent.trim() === wanted,
      );
      return row ? row.lastElementChild.textContent.trim() : null;
    }, label);

  const presets = await page.$$eval(`${PRESET} option`, (options) =>
    options.map((option) => ({ value: option.value, label: option.textContent.trim() })),
  );
  const presetValue = (word) => presets.find((entry) => entry.label.toLowerCase().includes(word))?.value || null;
  const frontPreset = presetValue('front');
  check(`the preview offers a Front preset (${frontPreset})`, Boolean(frontPreset));

  // 1. The playground truss is a hip: switch its instance to Gable (spec §10).
  await clickButtonText('Truss');
  await selectSystemCard();
  await page.getByText('Instance 1', { exact: true }).first().click();
  await page.waitForTimeout(600);
  const typeHandle = await page.evaluateHandle(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'Type');
    return label?.nextElementSibling?.tagName === 'SELECT' ? label.nextElementSibling : null;
  });
  const typeSelect = typeHandle.asElement();
  assert(typeSelect, 'the instance panel has a Type select');
  await typeSelect.selectOption('truss_type_gable');
  await page.waitForTimeout(900);
  check(
    'the instance is now a Gable truss',
    (await typeSelect.evaluate((select) => select.value)) === 'truss_type_gable',
  );

  // RT-3.1: hand the slope back to the truss, so the pictures show the
  // designed state (the roof seated on the purlins), not the stored manual slope.
  await clickButtonText('Roof');
  await clickButtonText('Reset slope');
  const slopeSource = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'Slope Source');
    return label?.nextElementSibling?.tagName === 'SELECT' ? label.nextElementSibling.value : null;
  });
  check(`"Reset slope" hands the roof slope to the truss (Slope Source "${slopeSource}")`, slopeSource === 'truss');
  await clickButtonText('Truss');

  // 2. The system panel's Gable ends section, End A infilled by default.
  await selectSystemCard();
  const sectionOpen = await page.evaluate(
    () =>
      [...document.querySelectorAll('button[aria-expanded]')]
        .find((node) => node.textContent.trim().startsWith('Gable ends'))
        ?.getAttribute('aria-expanded') === 'true',
  );
  check('the system panel shows the Gable ends section, open', sectionOpen);
  const initialMode = await endAMode();
  check(`End A starts as infill (mode "${initialMode}")`, initialMode === 'infill');
  const closureColour = await page.evaluate(
    (selector) => document.querySelector(selector)?.getAttribute('data-closure-colour'),
    PREVIEW,
  );
  check(
    `the preview root carries the infill colour (data-closure-colour="${closureColour}")`,
    closureColour === '#E9E5DD',
  );

  // 3. Find the elevation that looks at a gable. Front may face an eave on this
  // project, so click across each elevation until a click lands on the truss
  // system — the only thing in the scene whose card has an End closures row.
  const elevationPresets = [
    frontPreset,
    presetValue('back') || presetValue('rear'),
    presetValue('left'),
    presetValue('right'),
  ].filter(Boolean);
  const findClosure = async (presetList) => {
    for (const preset of presetList) {
      await setPreset(preset);
      await clickSky();
      const box = await canvasBox();
      for (let fy = 0.3; fy <= 0.7; fy += 0.05) {
        for (let fx = 0.3; fx <= 0.7; fx += 0.05) {
          await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
          await page.waitForTimeout(250);
          const row = await inspectRow('End closures');
          if (row) return { preset, fx, fy, row, area: await inspectRow('Gable infill') };
        }
      }
    }
    return null;
  };
  const found = await findClosure(elevationPresets);
  check(`a gable closure is found in 3D (${found?.preset})`, Boolean(found));
  const gablePreset = found.preset;
  const otherGablePreset =
    { [presetValue('left')]: presetValue('right'), [presetValue('right')]: presetValue('left') }[gablePreset] || null;
  const shootViews = async (state) => {
    for (const [name, preset] of [
      ['front', frontPreset],
      [gablePreset === frontPreset ? null : 'gable', gablePreset],
      [otherGablePreset ? 'gable-opposite' : null, otherGablePreset],
    ]) {
      if (!name || !preset) continue;
      await setPreset(preset);
      await clickSky();
      await previewShot(`${state}-${name}`);
    }
  };
  await shootViews('infill');

  // 4. End A open: one triangle opens up.
  await selectSystemCard();
  await setEndAMode('open');
  check(`End A switched to open (mode "${await endAMode()}")`, (await endAMode()) === 'open');
  await shootViews('end-a-open');

  // 5. And back to infill; then click the closure in 3D for its card.
  await selectSystemCard();
  await setEndAMode('infill');
  check(`End A switched back to infill (mode "${await endAMode()}")`, (await endAMode()) === 'infill');
  await shootViews('infill-again');
  const closureCard = await findClosure([gablePreset]);
  check(
    `clicking the closure in 3D (${closureCard?.preset} at ${closureCard ? `${closureCard.fx.toFixed(2)}, ${closureCard.fy.toFixed(2)}` : '—'}) opens the truss card reading "${closureCard?.row}"`,
    Boolean(closureCard?.row?.startsWith('End A: Infill · fibre cement')),
  );
  check(
    `the card reports the infill area (${closureCard?.area})`,
    Boolean(closureCard?.area) && parseFloat(closureCard.area) > 0,
  );

  // A close look at the gable for the audit: the panel against the roof underside.
  await setPreset(gablePreset);
  await clickSky();
  const box = await canvasBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.36);
  for (let step = 0; step < 5; step += 1) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);
  }
  await previewShot('infill-gable-closeup');
  const iso = presets.find((entry) => entry.value.startsWith('iso'))?.value;
  if (iso) {
    await setPreset(iso);
    await clickSky();
    await previewShot('infill-iso');
  }

  check(`no page errors (${errors.length})`, errors.length === 0, `Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Gable closure failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, screenshots }, null, 2),
  );
  console.log(
    'Gable closure verification passed:\n- ' + checks.join('\n- ') + '\nScreenshots:\n- ' + screenshots.join('\n- '),
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
