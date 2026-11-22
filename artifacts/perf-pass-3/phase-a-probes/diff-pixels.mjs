/* global process, console */
// node diff-pixels.mjs <dirA> <dirB> : per file max channel delta, count of
// differing pixels, and the edge-residual of the tilted slab silhouette.
import { readFile, readdir } from 'node:fs/promises';
const [a, b] = process.argv.slice(2);
const base = 'C:/Users/johnm/AppData/Local/Temp/claude/C--Users-johnm-modular-apartment-planner/2dc0ba0d-1201-453e-8699-67d6aa73231e/scratchpad/pixels/';
const files = (await readdir(base + a)).filter((f) => f.endsWith('.rgba'));
for (const file of files) {
  const A = await readFile(base + a + '/' + file);
  const B = await readFile(base + b + '/' + file);
  let max = 0;
  let differing = 0;
  let sum = 0;
  for (let i = 0; i < A.length; i += 4) {
    let pixelMax = 0;
    for (let c = 0; c < 4; c += 1) pixelMax = Math.max(pixelMax, Math.abs(A[i + c] - B[i + c]));
    if (pixelMax > 0) differing += 1;
    max = Math.max(max, pixelMax);
    sum += pixelMax;
  }
  console.log(file.padEnd(28), 'max', String(max).padStart(3), 'differing px', String(differing).padStart(6), 'of', A.length / 4, 'mean', (sum / (A.length / 4)).toFixed(4));
}
