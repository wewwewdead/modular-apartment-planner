/* global process, console, window */
// Renders the harness scene through the live progressive renderer and saves raw
// RGBA for interactive / sample-zero / converged, AO on and off, opaque and
// transparent backdrop.   node pixels-a3.mjs <label> [gpu|swiftshader]
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');

const LABEL = process.argv[2] || "run";
const VARIANT = process.argv[4] || "live";
const GL = process.argv[3] || 'gpu';
const DIR = `C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/pixels/${LABEL}-${GL}`;
await mkdir(DIR, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args:
    GL === 'swiftshader'
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) modular-apartment-planner/1.0.0 Chrome/140.0.0.0 Electron/43.0.0 Safari/537.36';
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: Number(process.env.DSF || 1), userAgent: ua });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
await page.goto('http://localhost:5181/__nothing', { waitUntil: 'domcontentloaded' });
const cases = [
  { name: "ao", ambientOcclusion: true, variant: VARIANT },
  { name: "noao", ambientOcclusion: false, variant: VARIANT },
  { name: "ao-transparent", ambientOcclusion: true, transparent: true, variant: VARIANT },
  { name: "ao-toggled", ambientOcclusion: true, toggle: true, variant: VARIANT },
  { name: "noao-toggled", ambientOcclusion: false, toggle: true, variant: VARIANT },
  { name: "edge", ambientOcclusion: false, edge: true, variant: VARIANT },
  { name: "edge-ao", ambientOcclusion: true, edge: true, variant: VARIANT },
];
const summary = {};
for (const c of cases) {
  const result = await page.evaluate(async (options) => {
    const harness = await import('/src/features/floorplan/components/preview/__perfHarness.js');
    return harness.renderFixedScene(options);
  }, c);
  for (const key of ['interactive', 'sampleZero', 'converged']) {
    await writeFile(`${DIR}/${c.name}-${key}.rgba`, Buffer.from(result[key], 'base64'));
  }
  summary[c.name] = { stats: result.stats, interactiveStats: result.interactiveStats, width: result.width, height: result.height };
}
summary.errors = errors;
await writeFile(`${DIR}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
