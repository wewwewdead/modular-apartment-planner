// Are the differing pixels on edges? For each differing pixel, the 3×3
// neighbourhood's green-channel range in the original converged image.
import { readFile } from 'node:fs/promises';
const base = 'C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/pixels/';
const [a, b] = process.argv.slice(2);
const W = 480, H = 320;
for (const f of ['ao-sampleZero', 'ao-converged', 'noao-converged', 'ao-transparent-converged']) {
  const A = await readFile(`${base}${a}/${f}.rgba`);
  const B = await readFile(`${base}${b}/${f}.rgba`);
  const ref = await readFile(`${base}${a}/ao-converged.rgba`.replace('ao-converged', f.replace('sampleZero', 'converged')));
  let diff = 0, onEdge = 0, offMax = 0, offLo = 255;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = (y * W + x) * 4;
    let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(A[i + c] - B[i + c]));
    if (!d) continue;
    diff++;
    let lo = 255, hi = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = ref[((y + dy) * W + x + dx) * 4 + 1]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (hi - lo >= 12) onEdge++; else { offMax = Math.max(offMax, d); offLo = Math.min(offLo, hi - lo); }
  }
  console.log(f.padEnd(26), 'differing', diff, 'with a >=12-level neighbourhood step', onEdge, (100 * onEdge / Math.max(1, diff)).toFixed(1) + "%", "off-edge max delta", offMax, "min step", offLo);
}
