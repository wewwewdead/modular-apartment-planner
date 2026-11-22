// Perf pass 3, B2.5 (docs/perf-pass-3.md §6): the snapshot's timing probes
// add into the object they are handed and change nothing in the snapshot.
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createKernelSession } from './kernel.js';
import { furnitureExample } from './examples.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

it('times the meshing, the edge meshing and the copies, with the same snapshot as without', () => {
  const model = furnitureExample();
  const plain = createKernelSession(model);
  const probed = createKernelSession(model);
  try {
    const timing = { meshMs: 0, edgesMs: 0, copyMs: 0 };
    const timed = probed.snapshot({ timing });
    expect(timed).toEqual(plain.snapshot());
    expect(timed.instances.length).toBeGreaterThan(1);
    expect(Object.keys(timing)).toEqual(['meshMs', 'edgesMs', 'copyMs']);
    expect(timing.meshMs).toBeGreaterThan(0);
    expect(timing.edgesMs).toBeGreaterThan(0);
    expect(timing.copyMs).toBeGreaterThanOrEqual(0);
  } finally {
    plain.dispose();
    probed.dispose();
  }
});
