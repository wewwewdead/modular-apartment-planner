import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel, memberMetrics, resolveParameters, profileToPart, createPart } from './model.js';
import { translateInstance } from './movement.js';
import { createCutFeature } from './cutPlacement.js';
import { annotationText } from './drawings.js';
import { createKernelSession } from './kernel.js';
import { furnitureExample, bracketExample } from './examples.js';
import { buildCutList, planLinearStock } from './fabrication.js';
const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);
const fixture = (features) => ({
  ...emptyModel(),
  parts: [{ id: 'p', name: 'Test part', features }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
describe('exact modeling kernel', () => {
  for (const section of ['tube', 'pipe'])
    for (const type of ['hole', 'pocket'])
      it(`creates a usable default ${type} on a ${section}, on every side`, () => {
        for (const side of ['front', 'rear', 'left', 'right']) {
          const created = createPart('member');
          if (section === 'pipe') created.part.features[0].section = { type: 'pipe', diameter: 40, wall: 2 };
          const cut = createCutFeature(type, created.part);
          cut.placement.side = side;
          created.part.features.push(cut);
          const model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
          const session = createKernelSession(model);
          try {
            const snapshot = session.snapshot(),
              metrics = snapshot.parts[0].features[cut.id];
            expect(metrics.removedVolume).toBeGreaterThan(0);
            expect(metrics.cut.position[2]).toBeCloseTo(350, 5);
            if (section === 'tube')
              expect(metrics.removedVolume).toBeCloseTo(type === 'hole' ? Math.PI * 9 * 4 : 12 * 20, 3);
            if (type === 'hole') {
              const note = annotationText(
                { type: 'hole', partId: created.part.id, featureId: cut.id },
                model,
                snapshot,
              );
              expect(note).toContain('through all');
              expect(note).toContain('350.00');
            }
          } finally {
            session.dispose();
          }
        }
      });
  it('keeps tube cut references accurate through parameters, gaps, member orientation and instance placement', () => {
    const created = createPart('member');
    created.part.features[0] = {
      ...created.part.features[0],
      start: [100, 200, 300],
      end: ['=100+length', 200, 300],
      gapStart: 2,
      gapEnd: 4,
    };
    const parameters = [{ id: 'length', name: 'length', value: 200 }];
    const cut = createCutFeature('hole', created.part, resolveParameters(parameters));
    created.part.features.push(cut);
    created.instance.position = [500, 600, 700];
    created.instance.rotation = [45, 0, 90];
    const model = { ...emptyModel(), parameters, parts: [created.part], instances: [created.instance] };
    for (const length of [200, 400]) {
      model.parameters[0].value = length;
      const session = createKernelSession(model);
      try {
        const result = session.snapshot().parts[0].features[cut.id];
        expect(result.cut.position[0]).toBeCloseTo(100 + length / 2 - 1, 5);
        expect(result.cut.position[1]).toBeCloseTo(180, 5);
        expect(result.cut.position[2]).toBeCloseTo(300, 5);
        expect(result.removedVolume).toBeCloseTo(Math.PI * 9 * 4, 3);
      } finally {
        session.dispose();
      }
    }
  });
  it('distinguishes a blind recess from a through pocket and rejects cuts that remove nothing', () => {
    const created = createPart('member'),
      cut = createCutFeature('pocket', created.part);
    created.part.features.push(cut);
    const model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
    for (const throughAll of [false, true]) {
      cut.throughAll = throughAll;
      const session = createKernelSession(model);
      try {
        expect(session.snapshot().parts[0].features[cut.id].removedVolume).toBeCloseTo(
          12 * 20 * (throughAll ? 4 : 1),
          3,
        );
      } finally {
        session.dispose();
      }
    }
    cut.placement.offset = 100;
    expect(() => createKernelSession(model)).toThrow(/removes no material/);
    cut.placement.offset = 0;
    created.part.features.push({ ...cut, id: 'duplicate-cut' });
    expect(() => createKernelSession(model)).toThrow(/existing cut/);
    created.part.features.pop();
    cut.placement.featureId = 'missing';
    expect(() => createKernelSession(model)).toThrow(/Broken cut reference/);
  });
  it('supports downward through holes and flat cutting profiles on boards', () => {
    const created = createPart('board'),
      cut = createCutFeature('hole', created.part);
    // A hidden blind-depth value must not affect an explicit through-all cut.
    cut.depth = -1;
    created.part.features.push(cut);
    const session = createKernelSession({ ...emptyModel(), parts: [created.part], instances: [created.instance] });
    try {
      expect(session.snapshot().parts[0].features[cut.id].removedVolume).toBeCloseTo(Math.PI * 9 * 18, 3);
      expect(session.planarProfiles()).toHaveLength(1);
    } finally {
      session.dispose();
    }
  });
  it('extrudes a rotated drafting profile and moves its solid by the exact placement distance', () => {
    const created = profileToPart(
      { id: 'drawing-rect', type: 'rect', x: 10, y: 20, width: 100, height: 40, rotation: 90 },
      { depth: 12 },
    );
    const model = { ...emptyModel(), parts: [created.part], sketches: [created.sketch], instances: [created.instance] };
    const session = createKernelSession(translateInstance(model, created.instance.id, [50, 0, 25]));
    try {
      const result = session.snapshot();
      expect(result.parts[0].volume).toBeCloseTo(48000, 3);
      expect(result.instances[0].bounds[0][0]).toBeCloseTo(90, 4);
      expect(result.instances[0].bounds[0][1]).toBeCloseTo(-10, 4);
      expect(result.instances[0].bounds[0][2]).toBeCloseTo(25, 4);
      expect(result.instances[0].bounds[1][2]).toBeCloseTo(37, 4);
    } finally {
      session.dispose();
    }
  });
  it('composes nested fixed attachments and concentric axes without reparenting definitions', () => {
    const model = fixture([{ id: 'axis', type: 'cylinder', radius: 10, length: 50 }]);
    model.instances[0].position = [100, 200, 300];
    model.instances[0].rotation = [0, 0, 90];
    model.instances.push(
      { id: 'middle', partId: 'p', position: [20, 0, 0] },
      { id: 'child', partId: 'p', position: [10, 0, 0] },
      { id: 'pin', partId: 'p', position: [0, 0, 0], rotation: [90, 0, 0] },
    );
    model.connections = [
      { id: 'm', type: 'fixed', from: 'middle', to: 'i', offset: [0, 0, 0] },
      { id: 'c', type: 'fixed', from: 'child', to: 'middle', offset: [0, 0, 0] },
      { id: 'p', type: 'concentric', from: 'pin', to: 'child', fromFeatureId: 'axis', toFeatureId: 'axis', offset: 5 },
    ];
    const session = createKernelSession(model);
    try {
      const child = session.snapshot().instances.find((i) => i.id === 'child'),
        pin = session.snapshot().instances.find((i) => i.id === 'pin');
      expect(child.bounds[0][0]).toBeCloseTo(90, 4);
      expect(child.bounds[0][1]).toBeCloseTo(220, 4);
      expect(pin.bounds[0][1]).toBeCloseTo(220, 4);
      expect(pin.bounds[0][2]).toBeCloseTo(305, 4);
    } finally {
      session.dispose();
    }
  });
  for (const [type, volume] of [
    ['union', 600000],
    ['subtract', 200000],
    ['intersect', 200000],
  ])
    it('computes accurate ' + type + ' Booleans from reusable definitions', () => {
      const model = fixture([
        { id: 'base', type: 'box', width: 100, depth: 80, height: 50 },
        { id: 'boolean', type, toolPartId: 'tool', position: [50, 0, 0] },
      ]);
      model.parts.push({
        id: 'tool',
        name: 'Boolean tool',
        features: [{ id: 'tool-box', type: 'box', width: 100, depth: 80, height: 50 }],
      });
      const session = createKernelSession(model);
      try {
        expect(session.snapshot().parts[0].volume).toBeCloseTo(volume, 3);
      } finally {
        session.dispose();
      }
    });
  it('mirrors, patterns, chamfers and trims with exact lengths and volumes', () => {
    const base = { id: 'base', type: 'box', width: 100, depth: 80, height: 50 };
    const cases = [
      [{ id: 'mirror', type: 'mirror', plane: 'YZ' }, 400000, -100],
      [{ id: 'pattern', type: 'pattern', count: 3, step: [150, 0, 0] }, 1200000, 0],
      [{ id: 'trim', type: 'trim', origin: [0, 0, 25], normal: [0, 0, 1], side: 'negative' }, 200000, 0],
    ];
    for (const [feature, volume, minX] of cases) {
      const session = createKernelSession(fixture([base, feature]));
      try {
        const result = session.snapshot().parts[0];
        expect(result.volume).toBeCloseTo(volume, 3);
        expect(result.bounds[0][0]).toBeCloseTo(minX, 4);
      } finally {
        session.dispose();
      }
    }
    const session = createKernelSession(
      fixture([
        base,
        { id: 'chamfer', type: 'chamfer', radius: 2, reference: { plane: 'XY', offset: 50, expectedCount: 4 } },
      ]),
    );
    try {
      expect(session.snapshot().parts[0].volume).toBeLessThan(400000);
    } finally {
      session.dispose();
    }
  });
  it('extrudes and projects Bézier and arc profiles including explicit holes', () => {
    const model = fixture([{ id: 'extrude', type: 'extrude', sketchId: 's', length: 10 }]);
    model.sketches = [
      {
        id: 's',
        profile: {
          type: 'path',
          start: [0, 0],
          segments: [
            { type: 'line', end: [100, 0] },
            { type: 'arc', mid: [120, 40], end: [100, 80] },
            { type: 'spline', end: [0, 80], control1: [70, 100], control2: [30, 100] },
          ],
          holes: [{ type: 'circle', center: [50, 40], radius: 10 }],
        },
      },
    ];
    const session = createKernelSession(model);
    try {
      expect(session.snapshot().parts[0].volume).toBeGreaterThan(75000);
      expect(session.planarProfiles()[0].visible.join(' ')).toMatch(/[AC]/);
      expect(session.drawings({ includeParts: true })).toHaveLength(2);
    } finally {
      session.dispose();
    }
  });
  it('builds hollow swept tubing, lofts and revolved solids', () => {
    const model = fixture([{ id: 'sweep', type: 'sweep', sketchId: 'path', profileId: 'ring' }]);
    model.sketches = [
      {
        id: 'path',
        plane: 'XZ',
        profile: {
          type: 'path',
          start: [0, 0],
          closed: false,
          segments: [
            { type: 'line', end: [0, 100] },
            { type: 'arc', mid: [14.64466094, 135.35533906], end: [50, 150] },
            { type: 'line', end: [150, 150] },
          ],
        },
      },
      { id: 'ring', profile: { type: 'circle', radius: 10, holes: [{ type: 'circle', radius: 8 }] } },
    ];
    const sweep = createKernelSession(model);
    try {
      expect(sweep.snapshot().parts[0].volume).toBeCloseTo(Math.PI * 36 * (200 + Math.PI * 25), 1);
      expect(sweep.planarProfiles()).toHaveLength(0);
    } finally {
      sweep.dispose();
    }
    const loftModel = fixture([{ id: 'loft', type: 'loft', sketchId: 'bottom', sections: ['upper'] }]);
    loftModel.sketches = [
      { id: 'bottom', profile: { type: 'circle', radius: 10 } },
      { id: 'upper', origin: [0, 0, 100], profile: { type: 'circle', radius: 20 } },
    ];
    const loft = createKernelSession(loftModel);
    try {
      expect(loft.snapshot().parts[0].volume).toBeCloseTo((Math.PI * 100 * 700) / 3, 1);
    } finally {
      loft.dispose();
    }
    const revolveModel = fixture([
      { id: 'revolve', type: 'revolve', sketchId: 'profile', axis: [0, 0, 1], angle: 360 },
    ]);
    revolveModel.sketches = [
      { id: 'profile', plane: 'XZ', profile: { type: 'rectangle', width: 10, height: 100, origin: [10, 0] } },
    ];
    const revolve = createKernelSession(revolveModel);
    try {
      expect(revolve.snapshot().parts[0].volume).toBeCloseTo(Math.PI * 300 * 100, 3);
    } finally {
      revolve.dispose();
    }
  });
  it('attaches cylindrical axes concentrically and inspects real solid overlap', () => {
    const model = fixture([{ id: 'axis', type: 'cylinder', radius: 10, length: 50 }]);
    model.instances.push({ id: 'other', partId: 'p', position: [100, 0, 0], rotation: [90, 0, 0] });
    model.connections.push({
      id: 'mate',
      type: 'concentric',
      from: 'other',
      to: 'i',
      fromFeatureId: 'axis',
      toFeatureId: 'axis',
      offset: 5,
    });
    const session = createKernelSession(model);
    try {
      expect(session.snapshot().instances[1].bounds[0][2]).toBeCloseTo(5, 4);
      expect(session.inspect()[0].volume).toBeCloseTo(Math.PI * 100 * 45, 2);
    } finally {
      session.dispose();
    }
  });
  it('projects section hatching, depth-limited views, details and exploded geometry', () => {
    const model = fixture([{ id: 'base', type: 'box', width: 100, depth: 80, height: 50 }]);
    model.instances.push({ id: 'second', partId: 'p', position: [120, 0, 0] });
    model.sheets = [
      {
        ...model.sheets[0],
        section: { origin: [0, 0, 25], normal: [0, 0, 1], side: 'negative', depth: 10 },
        views: ['top', { name: 'detail A', view: 'front', crop: [0, -25, 20, 20], scale: 1 }],
      },
      { ...model.sheets[0], id: 'exploded', views: ['exploded'] },
    ];
    const session = createKernelSession(model);
    try {
      const sheets = session.drawings();
      expect(sheets[0].bounds[0][2]).toBeCloseTo(15, 4);
      expect(sheets[0].views[0].hatch.length).toBeGreaterThan(0);
      expect(sheets[0].views[1].detail).toBe(true);
      expect(sheets[1].views[0].visible.length).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }
  });
  for (const kind of ['table', 'pipe', 'desk', 'bookshelf', 'bracket'])
    it(`builds and exports the ${kind} acceptance example`, async () => {
      const model = kind === 'bracket' ? bracketExample() : furnitureExample(kind);
      const session = createKernelSession(model);
      try {
        const result = session.snapshot();
        expect(result.instances.length).toBe(model.instances.length);
        const rows = buildCutList(model, result);
        expect(rows.reduce((sum, r) => sum + r.quantity, 0)).toBe(model.instances.length);
        expect(session.drawings()[0].views).toHaveLength(4);
        const step = await session.exportSolids().assembly.text();
        expect(step).toContain('SI_UNIT(.MILLI.,.METRE.)');
        if (kind === 'table') expect(planLinearStock(rows, model.fabrication).length).toBeGreaterThan(0);
      } finally {
        session.dispose();
      }
    });
  it('updates related boards, holes, assembly placements and cut lengths', () => {
    const model = furnitureExample('table');
    model.parameters.find((p) => p.name === 'width').value = 1500;
    const session = createKernelSession(model);
    try {
      const result = session.snapshot();
      expect(result.parts.find((p) => p.id === 'top').bounds[1][0]).toBeCloseTo(1500, 4);
      expect(result.instances.find((p) => p.id === 'leg-1-0').bounds[1][0]).toBeCloseTo(1500, 4);
      expect(buildCutList(model, result).find((p) => p.partId === 'rail-x').member.centerline).toBe(1418);
      expect(result.parts.find((p) => p.id === 'top').volume).toBeCloseTo(1500 * 650 * 24 - 4 * Math.PI * 9 * 24, 3);
    } finally {
      session.dispose();
    }
  });
  it('supports fillet, shell and exact section cuts', () => {
    const session = createKernelSession(
      fixture([
        { id: 'base', type: 'box', width: 100, depth: 80, height: 50 },
        { id: 'shell', type: 'shell', thickness: 2, reference: { plane: 'XY', offset: 50, expectedCount: 1 } },
      ]),
    );
    try {
      expect(session.snapshot().parts[0].volume).toBeCloseTo(400000 - 96 * 76 * 48, 3);
    } finally {
      session.dispose();
    }
    const fillet = createKernelSession(
      fixture([
        { id: 'base', type: 'box', width: 100, depth: 80, height: 50 },
        { id: 'fillet', type: 'fillet', radius: 2, reference: { plane: 'XY', offset: 50, expectedCount: 4 } },
      ]),
    );
    try {
      expect(fillet.snapshot().parts[0].volume).toBeLessThan(400000);
    } finally {
      fillet.dispose();
    }
  });
  it('models a hollow square member and projects its actual geometry', () => {
    const f = {
      id: 'f',
      type: 'member',
      start: [0, 0, 0],
      end: [0, 0, 500],
      section: { type: 'tube', width: 40, height: 40, wall: 2 },
    };
    const session = createKernelSession(fixture([f]));
    try {
      expect(session.snapshot().parts[0].volume).toBeCloseTo((1600 - 1296) * 500, 3);
      expect(session.drawings()[0].views[0].visible.length).toBeGreaterThan(0);
      expect(session.exportSolids().files[0].step.size).toBeGreaterThan(100);
      expect(session.planarProfiles()).toHaveLength(0);
    } finally {
      session.dispose();
    }
  });
  it('makes through holes and preserves nominal plate volume', () => {
    const session = createKernelSession(
      fixture([
        { id: 'base', type: 'box', width: 100, depth: 80, height: 5 },
        { id: 'hole', type: 'hole', diameter: 10, depth: 5, position: [20, 20, 0] },
      ]),
    );
    try {
      expect(session.snapshot().parts[0].volume).toBeCloseTo(40000 - Math.PI * 25 * 5, 3);
      expect(session.planarProfiles()).toHaveLength(1);
    } finally {
      session.dispose();
    }
  });
  it('keeps unrelated dimensions fixed and catches parameter cycles', () => {
    expect(
      resolveParameters([
        { id: 'a', name: 'width', value: 1200 },
        { id: 'b', name: 'half', value: '=width/2' },
      ]),
    ).toEqual({ width: 1200, half: 600 });
    expect(() =>
      resolveParameters([
        { name: 'a', value: '=b' },
        { name: 'b', value: '=a' },
      ]),
    ).toThrow(/Circular/);
  });
  it('distinguishes mitre centerline and long/short points', () => {
    const f = {
      id: 'f',
      type: 'member',
      start: [0, 0, 0],
      end: [500, 0, 0],
      section: { type: 'tube', width: 40, height: 40, wall: 2 },
      angleStart: 45,
      angleEnd: -45,
      gapStart: 2,
      gapEnd: 2,
    };
    const m = memberMetrics(f);
    expect(m.centerline).toBe(496);
    expect(m.longPoint).toBeCloseTo(536);
    expect(m.shortPoint).toBeCloseTo(456);
    const session = createKernelSession(fixture([f]));
    try {
      expect(session.snapshot().parts[0].volume).toBeCloseTo(304 * 496, 3);
    } finally {
      session.dispose();
    }
  });
  it('rejects lost topology references and names the failing feature', () => {
    expect(() =>
      createKernelSession(
        fixture([
          { id: 'base', type: 'box', width: 100, depth: 80, height: 5 },
          { id: 'round', type: 'fillet', radius: 2, reference: { plane: 'XY', offset: 50, expectedCount: 4 } },
        ]),
      ),
    ).toThrow(/ambiguous reference/);
  });
});
