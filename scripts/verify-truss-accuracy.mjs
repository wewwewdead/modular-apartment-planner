/* global process, console, document */
// The truss-accuracy guard (docs/roof-truss-industrial.md §7.7, RT-3). On the
// playground project: the playground truss is a hip, so switch its instance to
// the Gable type first (spec §10); read the instance panel's Profile section
// (heel height, overall height), switch the Truss Detail view on and count the
// drawn members, switch the web pattern to Howe and assert the count changes;
// then press the Roof panel's "Reset slope" (the playground roof stores a
// manual slope; RT-3.1, spec §7.8.4) and check the roof slope equals the
// instance pitch, and photograph the 3D preview — the Front preset, the gable
// end square on (clean triangle, sloped tails), a closeup of an eave (chord
// tail meeting the fascia) and an iso view (no purlin through the covering).
//   npx vite --port 5199 --strictPort   (in another shell)
//   FLOORPLAN_VERIFY_URL=http://localhost:5199/playground node scripts/verify-truss-accuracy.mjs
//   TRUSS_VERIFY_DIR=<folder for screenshots>   (default artifacts/floorplan/truss-accuracy)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = process.env.TRUSS_VERIFY_DIR || 'artifacts/floorplan/truss-accuracy';
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
  screenshots = [],
  readings = {};
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
    await page.waitForTimeout(600);
  };
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
  const selectInstance = async () => {
    await selectSystemCard();
    await page.getByText('Instance 1', { exact: true }).first().click();
    await page.waitForTimeout(700);
  };
  const profileReadout = (label) =>
    page.evaluate((wanted) => {
      const scope = document.querySelector('[data-truss-profile]');
      if (!scope) return null;
      const row = [...scope.querySelectorAll('div')].find(
        (node) => node.firstElementChild?.textContent === wanted && node.children.length >= 3,
      );
      return row ? row.children[2].textContent.trim() : null;
    }, label);
  const detailMemberCount = () =>
    page.evaluate((selector) => document.querySelectorAll(`${selector} polygon[data-member-type]`).length, CANVAS);
  const detailWebCount = () =>
    page.evaluate(
      (selector) => document.querySelectorAll(`${selector} polygon[data-member-type="web"]`).length,
      CANVAS,
    );
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
  // In focus mode the canvas fills the window under the floating sidebars;
  // the pictures keep to the clear middle of it.
  let focused = false;
  const previewShot = async (name) => {
    await page.waitForTimeout(2500);
    const path = `${directory}/${name}.png`;
    if (focused) {
      const box = await canvasBox();
      await page.screenshot({
        path,
        clip: { x: box.x + box.width * 0.17, y: box.y, width: box.width * 0.64, height: box.height },
      });
    } else {
      await page.locator(`${PREVIEW} canvas`).first().screenshot({ path });
    }
    screenshots.push(path);
  };
  // OrbitControls zoom toward the target, so a closeup first pans the point
  // of interest to the middle (right-drag) and then wheels in.
  const closeupOn = async (fx, fy, steps) => {
    const box = await canvasBox();
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 14 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    for (let step = 0; step < steps; step += 1) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(150);
    }
  };
  const setEndAMode = async (mode) => {
    await selectSystemCard();
    await page.locator('[data-closure-side="start"] select').first().selectOption(mode);
    await page.waitForTimeout(800);
  };

  const presets = await page.$$eval(`${PRESET} option`, (options) =>
    options.map((option) => ({ value: option.value, label: option.textContent.trim() })),
  );
  const presetValue = (word) => presets.find((entry) => entry.label.toLowerCase().includes(word))?.value || null;
  const frontPreset = presetValue('front');
  const leftPreset = presetValue('left');
  const rightPreset = presetValue('right');
  check(
    `the preview offers Front / Left / Right presets (${frontPreset}, ${leftPreset}, ${rightPreset})`,
    Boolean(frontPreset && leftPreset && rightPreset),
  );

  // 1. Hip → Gable (spec §10).
  await clickButtonText('Truss');
  await selectInstance();
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

  // 2. The Profile section's readouts (heel = bc + tc / cos θ for 90 × 35).
  await selectInstance();
  const heel = await profileReadout('Heel height');
  const overall = await profileReadout('Overall height');
  const pitch = await profileReadout('Pitch');
  readings.heelHeight = heel;
  readings.overallHeight = overall;
  readings.pitch = pitch;
  const heelValue = parseFloat(heel);
  check(
    `the Profile section reads a heel height (${heel}) above the 90 bottom chord`,
    heelValue > 90 && heelValue < 400,
  );
  check(`…and an overall height (${overall}) above the heel`, parseFloat(overall) > heelValue);
  const labelledInput = (text) =>
    page
      .locator('label', { hasText: new RegExp(`^${text}$`) })
      .first()
      .locator('xpath=following-sibling::div//input');
  const instancePitch = Number(await labelledInput('Pitch').inputValue());
  readings.instancePitchPercent = instancePitch;
  check(`the instance panel reads a pitch (${instancePitch} %)`, instancePitch > 0);
  const patternBefore = await page.locator('[data-truss-profile] select').first().inputValue();
  check(`the gable's web pattern defaults to Fink (${patternBefore})`, patternBefore === 'fink');

  // 3. Truss Detail view: members drawn with their depth; Howe changes the count.
  await clickButtonText('Detail');
  await page.waitForTimeout(800);
  // The detail opens at the plan's pan and zoom; zoom out so the whole truss
  // is in the picture (the canvas commits a wheel zoom ~150 ms after it stops).
  {
    const box = await page.locator(CANVAS).first().boundingBox();
    await page.mouse.move(box.x + box.width * 0.03, box.y + box.height * 0.31);
    for (let step = 0; step < 10; step += 1) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);
  }
  const membersBefore = await detailMemberCount();
  const websBefore = await detailWebCount();
  check(
    `the detail view draws every member as an outline (${membersBefore} members, ${websBefore} webs)`,
    membersBefore > 0 && websBefore === 4,
  );
  const detailPath = `${directory}/detail-fink.png`;
  await page.locator(CANVAS).first().screenshot({ path: detailPath });
  screenshots.push(detailPath);
  await selectInstance();
  await page.locator('[data-truss-profile] select').first().selectOption('howe');
  await page.waitForTimeout(900);
  const membersAfter = await detailMemberCount();
  const websAfter = await detailWebCount();
  check(
    `switching to Howe changes the detail's member count (${membersBefore} → ${membersAfter}; webs ${websBefore} → ${websAfter})`,
    membersAfter !== membersBefore && websAfter === 5,
  );
  const howePath = `${directory}/detail-howe.png`;
  await page.locator(CANVAS).first().screenshot({ path: howePath });
  screenshots.push(howePath);
  // Back to Fink for the 3D pictures (the typical truss of the spec).
  await page.locator('[data-truss-profile] select').first().selectOption('fink');
  await page.waitForTimeout(700);
  await clickButtonText('Plan');
  await page.waitForTimeout(600);
  const planLabels = await page.evaluate(
    (selector) => [...document.querySelectorAll(`${selector} [data-truss-label]`)].map((node) => node.textContent),
    CANVAS,
  );
  check(
    `the layout plan tags the copies (${[...new Set(planLabels)].join(', ')})`,
    planLabels.includes('GE') && planLabels.some((label) => /^T\d+$/.test(label)),
  );
  const spacingNote = await page.evaluate(
    (selector) => document.querySelector(`${selector} [data-truss-spacing]`)?.textContent || null,
    CANVAS,
  );
  check(`…and notes the spacing ("${spacingNote}")`, /^\d+ @ \d+ = \d+$/.test(spacingNote || ''));

  // 4. RT-3.1 (spec §7.8.4): the playground roof stores a MANUAL slope; the
  // Roof panel's "Reset slope" (shown only while the source is manual) hands
  // the slope back to the truss, so the 3D pictures show the roof that follows
  // the truss — seated on the purlins.
  await clickButtonText('Roof');
  const slopeSource = () =>
    page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'Slope Source');
      return label?.nextElementSibling?.tagName === 'SELECT' ? label.nextElementSibling.value : null;
    });
  const sourceBefore = await slopeSource();
  const slopeBefore = Number(await labelledInput('Roof Slope').inputValue());
  check(
    `the playground roof's slope source starts manual (${sourceBefore}, ${slopeBefore} %)`,
    sourceBefore === 'manual',
  );
  await clickButtonText('Reset slope');
  const sourceAfter = await slopeSource();
  const slopeAfter = Number(await labelledInput('Roof Slope').inputValue());
  readings.roofSlopeBeforeReset = slopeBefore;
  readings.roofSlopeAfterReset = slopeAfter;
  check(
    `"Reset slope" follows the truss: source ${sourceAfter}, roof slope ${slopeAfter} % = instance pitch ${instancePitch} %`,
    sourceAfter === 'truss' && Math.abs(slopeAfter - instancePitch) < 0.05,
  );
  const resetGone = await page.evaluate(
    () => ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Reset slope'),
  );
  check('…and the "Reset slope" button is gone once the source follows the truss', resetGone);

  // 5. 3D, in focus mode: Front, both gable ends, a gable closeup and both
  // eaves close up (the sloped chord tail meeting the fascia).
  await page.locator('button[aria-label="Focus preview"]').first().click();
  await page.waitForTimeout(1200);
  focused = true;
  await setPreset(frontPreset);
  await clickSky();
  await previewShot('front');
  for (const [name, preset] of [
    ['left', leftPreset],
    ['right', rightPreset],
  ]) {
    await setPreset(preset);
    await clickSky();
    await previewShot(`${name}-elevation`);
  }
  await setPreset(leftPreset);
  await clickSky();
  await closeupOn(0.5, 0.3, 3);
  await previewShot('left-gable-closeup');
  await setPreset(leftPreset);
  await clickSky();
  await closeupOn(0.195, 0.27, 6);
  await previewShot('left-eave-closeup-a');
  await setPreset(leftPreset);
  await clickSky();
  await closeupOn(0.805, 0.27, 6);
  await previewShot('left-eave-closeup-b');
  // End A open: the end truss shows — a gable end frame drawn with studs.
  await setEndAMode('open');
  for (const [name, preset] of [
    ['left', leftPreset],
    ['right', rightPreset],
  ]) {
    await setPreset(preset);
    await clickSky();
    await previewShot(`end-a-open-${name}`);
  }
  // The barge board and the boxed soffit hide the chord tail (as they do on
  // a real house). With End A open, the barge off and the soffit open, the
  // end truss stands in the gable view: its sloped tail runs into the fascia
  // (seen end-on at the eave tip).
  await page.locator('button[aria-label="Exit focus mode"]').first().click();
  await page.waitForTimeout(900);
  focused = false;
  await clickButtonText('Roof');
  await page.evaluate(() => {
    const head = [...document.querySelectorAll('button[aria-expanded]')].find((node) =>
      node.textContent.trim().startsWith('Edges & trims'),
    );
    if (head?.getAttribute('aria-expanded') === 'false') head.click();
  });
  await page.waitForTimeout(400);
  const bargeOff = await page.evaluate(() => {
    const box = document.querySelector('input[type="checkbox"][aria-label="Barge"]');
    if (!box?.checked) return false;
    box.click();
    return true;
  });
  check('the barge board switches off for the eave picture', bargeOff);
  const soffitHandle = await page.evaluateHandle(() => {
    const label = [...document.querySelectorAll('label')].find(
      (node) => node.firstElementChild?.textContent.trim() === 'Soffit',
    );
    return label?.querySelector('select') || null;
  });
  const soffitSelect = soffitHandle.asElement();
  check('the soffit select exists', Boolean(soffitSelect));
  if (soffitSelect) {
    await soffitSelect.selectOption('open');
    await page.waitForTimeout(700);
  }
  // The playground roof stores an overhang of its own (510) PAST the truss
  // tails, so its fascia stands off the chords. Zero it: the eave is then the
  // truss tail itself, and the fascia sits on the tail's plumb cut.
  const overhangInput = page
    .locator('label', { hasText: /^Overhang$/ })
    .first()
    .locator('xpath=following-sibling::div//input');
  const roofOverhangBefore = await overhangInput.inputValue();
  await overhangInput.fill('0');
  await overhangInput.press('Enter');
  await page.waitForTimeout(800);
  const roofOverhangAfter = await overhangInput.inputValue();
  readings.playgroundRoofOverhang = roofOverhangBefore;
  check(
    `the roof's own overhang (${roofOverhangBefore}) is set to ${roofOverhangAfter} for the eave picture`,
    Number(roofOverhangAfter) === 0,
  );
  await page.locator('button[aria-label="Focus preview"]').first().click();
  await page.waitForTimeout(1200);
  focused = true;
  for (const [name, preset, fx] of [
    ['left', leftPreset, 0.195],
    ['right', rightPreset, 0.805],
  ]) {
    await setPreset(preset);
    await clickSky();
    await previewShot(`end-a-open-no-barge-${name}`);
    await setPreset(preset);
    await clickSky();
    await closeupOn(fx, 0.27, 9);
    await previewShot(`eave-tail-meets-fascia-${name}`);
  }
  await page.locator('button[aria-label="Exit focus mode"]').first().click();
  await page.waitForTimeout(900);
  focused = false;
  await clickButtonText('Truss');
  await setEndAMode('infill');
  await page.locator('button[aria-label="Focus preview"]').first().click();
  await page.waitForTimeout(1200);
  focused = true;
  // The iso picture: the roof follows the truss, so no purlin shows through
  // the covering (inspect iso.png; the numbers are in roofAttachment.test.js).
  const iso = presets.find((entry) => entry.value.startsWith('iso'))?.value;
  check(`the preview offers an iso preset (${iso})`, Boolean(iso));
  if (iso) {
    await setPreset(iso);
    await clickSky();
    await previewShot('iso');
  }

  check(`no page errors (${errors.length})`, errors.length === 0, `Page errors:\n${errors.join('\n')}`);
  if (failures.length) throw new Error(`Truss accuracy failures:\n${failures.join('\n')}`);
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ status: 'passed', errors, checks, readings, screenshots }, null, 2),
  );
  console.log(
    'Truss accuracy verification passed:\n- ' +
      checks.join('\n- ') +
      `\nReadings: ${JSON.stringify(readings)}` +
      '\nScreenshots:\n- ' +
      screenshots.join('\n- '),
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
