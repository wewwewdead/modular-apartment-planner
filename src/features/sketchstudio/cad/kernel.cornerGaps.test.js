// The set part in the real kernel (docs/sketch-studio-corner-gaps.md §4.4
// item 6): the user's tray with every corner set to 0.2 mm, and with its rear
// wall running past the right wall (the covering ear, bend 5's line clipped
// to its own tabs), build as one fused solid with no `not-fused` warning, its
// volume the blank's.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { iterTopo, setOC } from 'replicad';
import { emptyModel } from './model.js';
import { createKernelSession } from './kernel.js';
import { flangeGaps, gapLabel, setGaps } from './cornerGaps.js';
import { foldSheet } from './sheetMetal.js';
import { USER_TRAY_FEATURE, USER_TRAY_PROFILE } from './cornerGaps.fixtures.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

const trayModel = (profile, bends) => ({
  ...emptyModel(),
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
  parts: [
    {
      id: 'p',
      name: 'Tray',
      material: 'SPCC cold-rolled steel',
      features: [{ ...USER_TRAY_FEATURE, id: 'sm', sketchId: 's', bends }],
    },
  ],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// Builds the part: its sheet warnings, its solids and its volume against the flat blank × t.
const build = (model) => {
  const session = createKernelSession(model);
  try {
    const snapshot = session.snapshot();
    const fold = foldSheet(model.parts[0].features[0], model.sketches[0].profile);
    return {
      warnings: snapshot.parts[0].features.sm.sheet.warnings.map((w) => w.code),
      solids: [...iterTopo(session.shapes.get('p').wrapped, 'solid')].length,
      volume: snapshot.parts[0].volume / (fold.flat.area * fold.thickness),
    };
  } finally {
    session.dispose();
  }
};

describe('the set tray in the kernel', () => {
  const rows = flangeGaps(foldSheet(USER_TRAY_FEATURE, USER_TRAY_PROFILE), USER_TRAY_PROFILE).rows;
  const key = (label) => rows.find((r) => gapLabel(r) === label).key;

  it('builds the tray with every corner at 0.2 as one fused solid', () => {
    const set = setGaps({ feature: USER_TRAY_FEATURE, profile: USER_TRAY_PROFILE, target: 0.2 });
    const built = build(trayModel(set.profile, set.bends));
    expect(built.warnings).not.toContain('not-fused');
    expect(built.solids).toBe(1);
    expect(Math.abs(built.volume - 1)).toBeLessThan(0.02);
  }, 60000);

  it('builds the covering corner (the ear, bend 5 clipped) as one fused solid', () => {
    const rear = key('Bend 8 flange, end → bend 5 flange, inside face'),
      right = key('Bend 5 flange, end → bend 8 flange, inside face');
    const set = setGaps({
      feature: USER_TRAY_FEATURE,
      profile: USER_TRAY_PROFILE,
      target: 0.2,
      keys: [rear, right],
      styles: { [rear]: 'cover' },
    });
    expect(set.bends[4]).not.toBe(USER_TRAY_FEATURE.bends[4]);
    const built = build(trayModel(set.profile, set.bends));
    expect(built.warnings).not.toContain('not-fused');
    expect(built.solids).toBe(1);
    expect(Math.abs(built.volume - 1)).toBeLessThan(0.02);
  }, 60000);
});
