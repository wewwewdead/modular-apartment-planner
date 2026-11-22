/* global process, console */
// Edge-residual crispness (preview3d-realistic-renderer memory): per scanline,
// recover the sub-pixel edge position by integrating the coverage deficit
// across the silhouette (white backdrop → black card), fit a straight line,
// report the RMS residual in pixels. No AA = 0.29 (1/sqrt 12); lower is crisper.
//   node edge-residual.mjs <dir> [width height]
import { readFile } from 'node:fs/promises';
const dir = process.argv[2];
const W = Number(process.argv[3] || 480);
const H = Number(process.argv[4] || 320);
const base = 'C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/pixels/';
const toLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
for (const name of ['edge', 'edge-ao']) {
  const out = [];
  for (const key of ['interactive', 'sampleZero', 'converged']) {
    const px = await readFile(`${base}${dir}/${name}-${key}.rgba`);
    const rows = [];
    // Middle band of rows, away from the card's corners.
    for (let y = Math.floor(H * 0.2); y < Math.floor(H * 0.8); y += 1) {
      const lum = (x) => toLinear(px[(y * W + x) * 4 + 1]);
      // Find the first dark pixel scanning from the left.
      let xe = -1;
      for (let x = 0; x < W; x += 1) if (lum(x) < 0.5) { xe = x; break; }
      if (xe < 6 || xe > W - 6) continue;
      const xa = xe - 5;
      const xb = xe + 5;
      let white = 0;
      for (let x = xa; x < xb; x += 1) white += Math.min(1, Math.max(0, lum(x)));
      rows.push([y, xa + white]);
    }
    const n = rows.length;
    const my = rows.reduce((a, r) => a + r[0], 0) / n;
    const mx = rows.reduce((a, r) => a + r[1], 0) / n;
    let sxy = 0;
    let syy = 0;
    for (const [y, x] of rows) {
      sxy += (y - my) * (x - mx);
      syy += (y - my) ** 2;
    }
    const slope = sxy / syy;
    let ss = 0;
    for (const [y, x] of rows) ss += (x - (mx + slope * (y - my))) ** 2;
    out.push(`${key} rms ${Math.sqrt(ss / n).toFixed(4)} px (rows ${n}, slope ${slope.toFixed(4)})`);
  }
  console.log(dir, name, '\n  ' + out.join('\n  '));
}
