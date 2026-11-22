import { createRequire } from 'node:module';
const require = createRequire('C:/Users/johnm/modular apartment planner/package.json');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto('http://localhost:5181/__nothing', { waitUntil: 'domcontentloaded' });
const out = await page.evaluate(async () => {
  const cam = await import('/src/features/floorplan/components/preview/previewCameraMath.js');
  const gp = await import('/src/features/floorplan/components/preview/createGroundPlane.js');
  const bounds = { minX: -4000, maxX: 12000, minY: -2000, maxY: 14000, minElevation: 0, maxElevation: 9000 };
  const box = cam.descriptorBoundsToWorldBox(bounds);
  let materials = null;
  const groundMaterial = gp.createGroundMaterial();
  const N = 400;
  let t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const g = cam.createGrid(bounds, 0, materials);
    materials = g.userData.materials;
    g.geometry.dispose();
    for (const c of g.children) c.geometry.dispose();
  }
  const gridMs = (performance.now() - t0) / N;
  t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const ground = gp.createGroundPlane(box, 0, { material: groundMaterial });
    ground.dispose();
  }
  const groundMs = (performance.now() - t0) / N;
  return { gridMs, groundMs };
});
console.log(JSON.stringify(out));
await browser.close();
