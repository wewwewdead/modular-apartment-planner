import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel, profileToPart } from './model.js';
import { createKernelSession } from './kernel.js';
import { collectDraftingProfiles } from './draftingProfiles.js';
import { applyFillet, computeSketchFillet, findFilletableCorner } from '../utils/filletUtils.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

function extrude(candidate, depth) {
  const created = profileToPart(candidate.entity, { depth, sourceIds: candidate.sourceIds });
  const model = { ...emptyModel(), parts: [created.part], sketches: [created.sketch], instances: [created.instance] };
  const session = createKernelSession(model);
  try {
    return session.snapshot();
  } finally {
    session.dispose();
  }
}

describe('drafting import through the exact kernel', () => {
  it('extrudes a plate with one R10 fillet to the exact filleted volume, in drawing coordinates', () => {
    const rect = { id: 'r', type: 'rect', x: 0, y: 0, width: 200, height: 100, layerId: 'default' };
    const corner = findFilletableCorner([rect], { x: 0, y: 0 }, 5);
    const entities = applyFillet([rect], corner, computeSketchFillet(corner, 10), 'default');
    const { candidates } = collectDraftingProfiles(entities);
    expect(candidates[0].profile.type).toBe('path');
    const result = extrude(candidates[0], 3);
    // 200×100 minus the corner square left outside a quarter circle of R10.
    const area = 200 * 100 - (100 - (Math.PI * 100) / 4);
    expect(result.parts[0].volume).toBeCloseTo(area * 3, 3);
    expect(result.instances[0].bounds[0][0]).toBeCloseTo(0, 4);
    expect(result.instances[0].bounds[0][1]).toBeCloseTo(0, 4);
    expect(result.instances[0].bounds[1][0]).toBeCloseTo(200, 4);
    expect(result.instances[0].bounds[1][1]).toBeCloseTo(100, 4);
  });

  it('extrudes the healed ortho-gap rectangle', () => {
    const lines = [
      { id: 'l1', type: 'line', x1: 100, y1: 100, x2: 400.37, y2: 100 },
      { id: 'l2', type: 'line', x1: 400.37, y1: 100, x2: 400.37, y2: 300.84 },
      { id: 'l3', type: 'line', x1: 400.37, y1: 300.84, x2: 100.62, y2: 300.84 },
      { id: 'l4', type: 'line', x1: 100.62, y1: 300.84, x2: 100.62, y2: 100 },
    ];
    const { candidates } = collectDraftingProfiles(lines, { healGapMm: 1 });
    const result = extrude(candidates[0], 2);
    expect(result.parts[0].volume).toBeGreaterThan(0);
    expect(result.instances[0].bounds[0][0]).toBeCloseTo(100, 4);
  });
});
