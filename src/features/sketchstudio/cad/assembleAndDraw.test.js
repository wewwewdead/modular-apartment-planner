import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { emptyModel, validateReferences } from './model.js';
import { instanceMatrix } from './movement.js';
import { furnitureExample } from './examples.js';
import { mateInstance, mateTransform } from './mate.js';
import { gizmoAxes, snapBoxDelta, snapThreshold } from './boxSnap.js';
import {
  arcCenter,
  chooseOrientation,
  createLinearDimension,
  createRadialDimension,
  linearDimensionSvg,
  linearValue,
  nearestCircle,
  pathFeatures,
  snapViewPoint,
  viewSnapData,
} from './sheetAnnotations.js';
import { partsListRows, sheetHasPartsList } from './partsList.js';
import { annotationText, sheetSvg } from './drawings.js';
import { engineeringSheetSvg, sheetHoleFeatures } from './engineeringSheet.js';
import { circularCut } from './circularCuts.js';
import {
  buildSketchWorkspaceSnapshot,
  deserializeSketchWorkspace,
  serializeSketchWorkspace,
} from '../utils/workspaceSerializationUtils.js';
import { createBlankSketchDocument } from '../utils/sketchDocumentUtils.js';

const close = (actual, expected, digits = 6) =>
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pose = (instance) => instanceMatrix(instance);
const mapPoint = (instance, p) => new Vector3(...p).applyMatrix4(pose(instance)).toArray();
const mapDirection = (instance, d) => new Vector3(...d).transformDirection(pose(instance)).toArray();

describe('face-to-face mate', () => {
  const fixture = (position, rotation) => ({
    ...emptyModel(),
    parts: [{ id: 'p', name: 'Leg', features: [] }],
    instances: [
      { id: 'leg', partId: 'p', position, rotation },
      { id: 'top', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] },
    ],
  });
  // The leg's top face in part coordinates: point (30, 30, 726), normal +Z.
  const localPoint = [30, 30, 726],
    localNormal = [0, 0, 1];
  const cases = [
    {
      name: 'already opposed',
      position: [1400, 0, -200],
      rotation: [0, 0, 0],
      target: [
        [500, 300, 726],
        [0, 0, -1],
      ],
    },
    {
      name: 'tilted part, tilted target',
      position: [100, 50, 20],
      rotation: [30, -20, 45],
      target: [
        [0, 0, 500],
        [0.6, 0, -0.8],
      ],
    },
    {
      name: 'same-direction normals (half turn)',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      target: [
        [10, 10, 900],
        [0, 0, 1],
      ],
    },
  ];
  for (const c of cases)
    it(`opposes normals, makes faces coincident and honours the offset: ${c.name}`, () => {
      const model = fixture(c.position, c.rotation);
      const leg = model.instances[0];
      const moving = { point: mapPoint(leg, localPoint), normal: mapDirection(leg, localNormal) };
      const [targetPoint, targetNormal] = c.target;
      const center = mapPoint(leg, [30, 30, 363]);
      for (const offset of [0, 5]) {
        const next = mateInstance(
          model,
          {
            instanceId: 'leg',
            base: leg,
            moving,
            target: { point: targetPoint, normal: targetNormal },
            center,
            offset,
          },
          {},
        );
        const mated = next.instances[0];
        const normal = mapDirection(mated, localNormal);
        const n = new Vector3(...targetNormal).normalize().toArray();
        expect(dot(normal, n)).toBeCloseTo(-1, 9);
        const face = mapPoint(mated, localPoint);
        expect(dot(face, n) - dot(targetPoint, n)).toBeCloseTo(offset, 6);
        // The other instance is untouched.
        expect(next.instances[1]).toEqual(model.instances[1]);
      }
    });

  it('turns by the minimal angle and never spins about the normal', () => {
    const nA = [0, 0, 1],
      nB = new Vector3(0.6, 0, -0.8).toArray();
    const result = mateTransform({
      movingPoint: [0, 0, 0],
      movingNormal: nA,
      targetPoint: [0, 0, 10],
      targetNormal: nB,
      center: [0, 0, 0],
    });
    // Minimal turn: the angle between nA and −nB.
    expect(result.angle).toBeCloseTo((Math.acos(-dot(nA, nB)) * 180) / Math.PI, 9);
    // The turn axis (perpendicular to both normals) stays put; a pure turn
    // about it carries nA onto −nB with no twist.
    const q = new Quaternion(...result.quaternion);
    const axis = new Vector3(...nA).cross(new Vector3(...nB)).normalize();
    close(axis.clone().applyQuaternion(q).toArray(), axis.toArray(), 9);
    const opposed = mateTransform({
      movingPoint: [5, 5, 726],
      movingNormal: [0, 0, 1],
      targetPoint: [0, 0, 726],
      targetNormal: [0, 0, -1],
      center: [30, 30, 363],
    });
    expect(opposed.angle).toBe(0);
    expect(opposed.translation).toEqual([0, 0, 0]);
    // The leg's top already at the desktop underside: nothing moves.
    const model = fixture([0, 0, 0], [0, 0, 0]);
    const unchanged = mateInstance(
      model,
      {
        instanceId: 'leg',
        base: model.instances[0],
        moving: { point: [30, 30, 726], normal: [0, 0, 1] },
        target: { point: [600, 300, 726], normal: [0, 0, -1] },
        center: [30, 30, 363],
      },
      {},
    );
    expect(unchanged.instances[0].position).toEqual([0, 0, 0]);
    expect(unchanged.instances[0].rotation).toEqual([0, 0, 0]);
  });
});

describe('drag snapping to bounding-box faces', () => {
  const desktop = { min: [0, 0, 726], max: [1200, 650, 750] };
  const leg = { min: [1400, 0, 0], max: [1460, 60, 726] };
  it('snaps flush and edge-aligned within the threshold', () => {
    // Dragged near the front-left corner, slightly off in X and Y.
    const { delta, snaps } = snapBoxDelta(leg, [-1404.5, 3.2, 0], [desktop], { threshold: 8 });
    expect(delta).toEqual([-1400, 0, 0]);
    expect(snaps.map((s) => [s.axis, s.kind])).toEqual([
      [0, 'aligned'],
      [1, 'aligned'],
      [2, 'flush'],
    ]);
    // Near the far corner the leg's max faces align with the desktop's.
    expect(snapBoxDelta(leg, [-264, 586, 0], [desktop], { threshold: 8 }).delta).toEqual([-260, 590, 0]);
  });
  it('ignores far faces, parts not alongside, and axes the handle does not move', () => {
    expect(snapBoxDelta(leg, [-1300, 100, 0], [desktop], { threshold: 8 }).delta).toEqual([-1300, 100, 0]);
    // A part far away in Y never pulls the X position.
    const far = { min: [0, 5000, 0], max: [60, 5060, 726] };
    expect(snapBoxDelta(leg, [-1397, 0, 0], [far], { threshold: 8 }).snaps).toEqual([]);
    expect(snapBoxDelta(leg, [-1404, 3, 0], [desktop], { threshold: 8, axes: gizmoAxes('X') }).delta).toEqual([
      -1400, 3, 0,
    ]);
    expect(gizmoAxes('XY')).toEqual([0, 1]);
    expect(gizmoAxes(undefined)).toEqual([0, 1, 2]);
    expect(snapThreshold(500)).toBe(8);
    expect(snapThreshold(2500)).toBe(25);
  });
});

// A front view of a 1200 × 750 frame with a Ø20 hole, as Replicad writes paths.
const frontView = {
  name: 'front',
  view: 'front',
  viewBox: [0, -750, 1200, 750],
  basis: [
    [1, 0, 0],
    [0, 0, -1],
  ],
  visible: [
    'M 0 0 L 60 0 L 60 -726 L 1140 -726 L 1140 0 L 1200 0 L 1200 -750 L 0 -750 Z',
    'M 590 -375 A 10 10 0 0 1 610 -375 A 10 10 0 0 1 590 -375 Z',
  ],
  hidden: [],
};

describe('manual drawing dimensions', () => {
  it('reads vertices, midpoints and arc centres from projected paths', () => {
    const features = pathFeatures('M 0 0 L 10 0 l 0 10 H 0 Z');
    expect(features.vertices).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(features.midpoints).toContainEqual([5, 0]);
    expect(features.midpoints).toContainEqual([0, 5]);
    const arc = arcCenter([590, -375], 10, 10, 0, 0, 1, [610, -375]);
    close(arc.center, [600, -375]);
    const data = viewSnapData(frontView);
    expect(data.points).toContainEqual({ point: [600, -375], kind: 'centre' });
    expect(data.circles).toEqual([{ center: [600, -375], radius: 10 }]);
    expect(snapViewPoint([1197, 3], data, 8)).toEqual({ point: [1200, 0], kind: 'vertex' });
    expect(snapViewPoint([601, -376], data, 8).kind).toBe('centre');
    expect(snapViewPoint([300, -300], data, 8)).toEqual({ point: [300, -300], kind: 'free' });
    expect(nearestCircle([611, -375], data, 2)).toEqual({ center: [600, -375], radius: 10 });
  });

  it('chooses horizontal, vertical or aligned from where the line is placed', () => {
    expect(chooseOrientation([0, 0], [1200, 0], [600, 40])).toBe('horizontal');
    expect(chooseOrientation([0, 0], [0, -750], [-40, -300])).toBe('vertical');
    expect(chooseOrientation([0, 0], [100, -100], [50, 20])).toBe('horizontal');
    expect(chooseOrientation([0, 0], [100, -100], [-20, -50])).toBe('vertical');
    expect(chooseOrientation([0, 0], [100, -100], [150, 30])).toBe('aligned');
    const width = createLinearDimension({ id: 'w', view: 'front', from: [0, 0], to: [1200, 0], at: [600, 60] });
    expect(width).toEqual({
      id: 'w',
      type: 'linear',
      view: 'front',
      from: [0, 0],
      to: [1200, 0],
      orientation: 'horizontal',
      offset: 60,
    });
    expect(linearValue(width)).toBe(1200);
    const aligned = createLinearDimension({ id: 'a', view: 'front', from: [0, 0], to: [30, -40], at: [100, 0] });
    expect(aligned.orientation).toBe('aligned');
    expect(linearValue(aligned)).toBe(50);
    expect(() => createLinearDimension({ id: 'x', view: 'front', from: [1, 1], to: [1, 1], at: [0, 0] })).toThrow(
      /two different points/,
    );
  });

  it('renders with the sheet, scales with it, and is not listed as a note', () => {
    const model = furnitureExample('desk');
    const width = createLinearDimension({ id: 'dim-w', view: 'front', from: [0, 0], to: [1200, 0], at: [600, 60] });
    const height = createLinearDimension({ id: 'dim-h', view: 'front', from: [0, 0], to: [0, -750], at: [-60, -375] });
    const radial = createRadialDimension({
      id: 'dim-d',
      view: 'front',
      circle: { center: [600, -375], radius: 10 },
      at: [700, -450],
    });
    const sheet = {
      ...model.sheets[0],
      scale: 0.05,
      partsList: false,
      views: [frontView],
      annotations: [width, height, radial],
    };
    const svg = sheetSvg(sheet, model, { parts: [], instances: [] });
    expect(svg).toContain('data-dimension="dim-w" data-value="1200"');
    expect(svg).toContain('data-dimension="dim-h" data-value="750"');
    expect(svg).toContain('>Ø20.00<');
    expect(svg.match(/>1200\.00</g)).toHaveLength(2); // automatic overall + manual
    expect(svg).toContain('data-view="front" data-basis="1,0,0;0,0,-1" data-viewbox="0 -750 1200 750"');
    // Same model-mm annotation at another scale: the label stays, the line scales.
    const line = (s) =>
      linearDimensionSvg(width, (p) => [p[0] * s, p[1] * s], { units: 'mm' }).match(/M([\d.-]+) [\d.-]+L([\d.-]+)/g);
    expect(linearDimensionSvg(width, (p) => p, { units: 'mm' })).toContain('>1200.00<');
    expect(line(0.1)).not.toEqual(line(0.05));
    // Engineering layout uses its own number style.
    const engineering = engineeringSheetSvg(
      { ...sheet, layout: 'engineering', views: [frontView] },
      model,
      deskSnapshot(model),
      1,
      1,
    );
    expect(engineering).toContain('>1200<');
    expect(engineering).toContain('>750<');
  });
});

// Snapshot shaped like the kernel's for the example desk.
function deskSnapshot(model) {
  const size = { top: [1200, 650, 24], leg: [60, 60, 726], apron: [1080, 18, 100] };
  return {
    parameters: {},
    parts: model.parts.map((p) => ({ id: p.id, bounds: [[0, 0, 0], size[p.id]], volume: 1, features: {} })),
    instances: model.instances.map((i, index) => ({
      id: i.id,
      partId: i.partId,
      bounds: [
        [index * 10, 0, 0],
        [index * 10 + 60, 60, 726],
      ],
      placement: [{ translation: [0, 0, 0] }],
    })),
  };
}

describe('parts list and balloons', () => {
  it('lists each part once with quantity, material and L × W × T', () => {
    const model = furnitureExample('desk');
    const snapshot = deskSnapshot(model);
    const rows = partsListRows(model, snapshot, model.sheets[0]);
    expect(rows.map((r) => [r.item, r.name, r.quantity, r.material, r.size])).toEqual([
      [1, 'Desktop', 1, 'Plywood', [1200, 650, 24]],
      [2, 'Wood leg', 4, 'Plywood', [726, 60, 60]],
      [3, 'Long apron', 2, 'Plywood', [1080, 100, 18]],
    ]);
    expect(partsListRows(model, snapshot, { instanceIds: ['leg-0-0', 'leg-1-1'] })).toEqual([
      expect.objectContaining({ item: 1, name: 'Wood leg', quantity: 2 }),
    ]);
    expect(sheetHasPartsList({})).toBe(true);
    expect(sheetHasPartsList({ partId: 'leg' })).toBe(false);
    expect(sheetHasPartsList({ partsList: false })).toBe(false);
  });

  it('draws the table near the title and numbered balloons on the isometric view', () => {
    const model = furnitureExample('desk');
    const snapshot = deskSnapshot(model);
    const iso = {
      ...frontView,
      name: 'isometric',
      view: 'isometric',
      basis: [
        [0.707, 0.707, 0],
        [0.408, -0.408, -0.816],
      ],
    };
    const svg = sheetSvg({ ...model.sheets[0], views: [frontView, iso] }, model, snapshot);
    expect(svg).toContain('data-part-row="Desktop" data-quantity="1"');
    expect(svg).toContain('data-part-row="Wood leg" data-quantity="4"');
    expect(svg).toContain('>1200 × 650 × 24<');
    expect(svg.match(/data-balloon="/g)).toHaveLength(3);
    const engineering = engineeringSheetSvg(
      { ...model.sheets[0], layout: 'engineering', views: [frontView, iso] },
      model,
      snapshot,
      1,
      1,
    );
    expect(engineering).toContain('data-part-row="Long apron" data-quantity="2"');
    expect(engineering.match(/data-balloon="/g)).toHaveLength(3);
    expect(sheetSvg({ ...model.sheets[0], partsList: false, views: [frontView] }, model, snapshot)).not.toContain(
      'data-parts-list',
    );
  });
});

describe('circular cut callouts', () => {
  // The Phase A desktop: a 1200 × 650 board with a Ø6 through cut sketched on its underside.
  const model = {
    ...emptyModel(),
    sketches: [
      {
        id: 's-top',
        name: 'Top',
        plane: 'XY',
        origin: [0, 0, 0],
        profile: { type: 'rectangle', width: 1200, height: 650, origin: [0, 0] },
      },
      {
        id: 's-hole',
        name: 'Hole',
        plane: 'custom',
        origin: [1200, 0, 0],
        normal: [0, 0, -1],
        xDirection: [-1, 0, 0],
        profile: { type: 'circle', radius: 3, center: [60, 60] },
      },
    ],
    parts: [
      {
        id: 'top',
        name: 'Desktop',
        features: [
          { id: 'body', type: 'extrude', operation: 'add', sketchId: 's-top', length: 24 },
          {
            id: 'cut',
            type: 'extrude',
            operation: 'cut',
            sketchId: 's-hole',
            length: 10,
            reverse: true,
            throughAll: true,
          },
        ],
      },
    ],
    instances: [{ id: 'desktop', partId: 'top', position: [0, 0, 726], rotation: [0, 0, 0] }],
  };
  const snapshot = {
    parts: [
      {
        id: 'top',
        bounds: [
          [0, 0, 0],
          [1200, 650, 24],
        ],
        features: {},
      },
    ],
    instances: [
      {
        id: 'desktop',
        partId: 'top',
        bounds: [
          [0, 0, 726],
          [1200, 650, 750],
        ],
        placement: [{ translation: [0, 0, 726] }],
      },
    ],
  };
  const top = {
    name: 'top',
    view: 'top',
    viewBox: [0, -650, 1200, 650],
    basis: [
      [1, 0, 0],
      [0, -1, 0],
    ],
    visible: ['M 0 0 L 1200 0 L 1200 -650 L 0 -650 Z'],
    hidden: [],
  };
  it('resolves the cut as a hole: centre, direction, diameter', () => {
    const cut = circularCut(model.parts[0].features[1], model, {});
    close(cut.position, [1140, 60, 0]);
    close(cut.direction, [0, 0, 1]);
    expect(cut).toMatchObject({ diameter: 6, throughAll: true, depth: null });
    const [hole] = sheetHoleFeatures({ views: [top], annotations: [] }, model, snapshot, top);
    close(hole.point, [1140, -60]);
    expect(annotationText({ type: 'hole', partId: 'top', featureId: 'cut' }, model, snapshot)).toMatch(
      /^Ø6\.00 through all; XYZ 1140\.00, 60\.00, 0\.00$/,
    );
  });
  it('gets the same "n × Ød THRU" callout as a hole feature', () => {
    const sheet = {
      ...model.sheets[0],
      layout: 'engineering',
      partsList: false,
      scale: 0.2,
      views: [top],
      annotations: [
        { id: 'a', type: 'hole-callout', view: 'top', partId: 'top', instanceId: 'desktop', featureIds: ['cut'] },
      ],
    };
    expect(validateReferences({ ...model, sheets: [sheet] })).toEqual([]);
    expect(engineeringSheetSvg(sheet, model, snapshot, 1, 1)).toContain('>Ø6 THRU<');
    const twice = {
      ...model,
      parts: [
        {
          ...model.parts[0],
          features: [...model.parts[0].features, { ...model.parts[0].features[1], id: 'cut-2', sketchId: 's-hole-2' }],
        },
      ],
      sketches: [
        ...model.sketches,
        { ...model.sketches[1], id: 's-hole-2', profile: { type: 'circle', radius: 3, center: [60, 590] } },
      ],
    };
    expect(
      engineeringSheetSvg(
        { ...sheet, annotations: [{ ...sheet.annotations[0], featureIds: ['cut', 'cut-2'] }] },
        twice,
        snapshot,
        1,
        1,
      ),
    ).toContain('>2 × Ø6 THRU<');
    // A rectangle cut is not a hole.
    const rect = {
      ...model,
      sketches: [model.sketches[0], { ...model.sketches[1], profile: { type: 'rectangle', width: 6, height: 6 } }],
    };
    expect(validateReferences({ ...rect, sheets: [sheet] })[0].message).toMatch(/Broken hole annotation/);
  });
});

describe('document persistence', () => {
  it('keeps sketch entities, support and sheet annotations through save and open', () => {
    const document = createBlankSketchDocument({ name: 'Desk' });
    const model = {
      ...emptyModel(),
      sketches: [
        {
          id: 'sketch-1',
          name: 'Sketch 1',
          plane: 'custom',
          origin: [1200, 0, 0],
          normal: [0, 0, -1],
          xDirection: [-1, 0, 0],
          profile: { type: 'circle', radius: 3, center: [60, 60] },
          entities: [{ id: 'e1', type: 'circle', c: [60, 60], r: 3 }],
          support: { type: 'face', instanceId: 'desktop', partId: 'top' },
          primitives: [],
          constrained: false,
        },
      ],
    };
    model.sheets[0].annotations = [
      { id: 'd1', type: 'linear', view: 'front', from: [0, 0], to: [1200, 0], orientation: 'horizontal', offset: 60 },
      { id: 'd2', type: 'radial', view: 'top', mode: 'diameter', center: [1140, -60], radius: 3, at: [1100, -120] },
    ];
    model.sheets[0].partsList = true;
    const text = serializeSketchWorkspace(
      buildSketchWorkspaceSnapshot({ document: { ...document, model }, viewport: {}, ui: { workspaceMode: 'model' } }),
    );
    const reopened = deserializeSketchWorkspace(text).document.model;
    expect(reopened.sketches).toEqual(model.sketches);
    expect(reopened.sheets[0].annotations).toEqual(model.sheets[0].annotations);
    expect(reopened.sheets[0].partsList).toBe(true);
  });
});
