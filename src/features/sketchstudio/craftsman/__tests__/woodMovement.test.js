import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INDOOR_MC_SWING,
  MOVEMENT_WARNING_WIDTH_MM,
  RIGID_JOINT_TYPES,
  buildRigidJointEdgeMap,
  buildWoodMovementDiagnostics,
  estimateSeasonalMovement,
  getCrossGrainDimension,
} from '../physics/woodMovement';
import {
  MATERIAL_PHYSICS,
  isSolidLumberMaterial,
  getMaterialModulusGPa,
  resolveMaterialPhysics,
} from '../physics/woodProperties';
import { getMaterialById } from '../data/materials';
import { resolveSketchJoinery } from '../../utils/sketchJoineryUtils';

const OAK = getMaterialById('oak-20x95');
const PINE = getMaterialById('pine-20x95');
const PLY = getMaterialById('birch-plywood-18');

function panel(overrides = {}) {
  return {
    id: 'panel',
    type: 'rect',
    x: 0,
    y: 0,
    width: 600,
    height: 300,
    materialId: 'oak-20x95',
    thickness: 20,
    grainAngle: 0,
    layerId: 'default',
    ...overrides,
  };
}

function rigidJoint(overrides = {}) {
  return {
    id: 'j1',
    type: 'dado',
    sourcePartId: 'panel',
    targetPartId: 'rail',
    resolvedContact: { sourceEdgeKey: 'top', targetEdgeKey: 'bottom' },
    validationState: { status: 'valid' },
    ...overrides,
  };
}

/** Both ends of the panel's cross-grain span captured by rigid joinery. */
function capturedTopAndBottom() {
  return [
    rigidJoint({ id: 'j-top', resolvedContact: { sourceEdgeKey: 'top', targetEdgeKey: 'bottom' } }),
    rigidJoint({ id: 'j-bottom', resolvedContact: { sourceEdgeKey: 'bottom', targetEdgeKey: 'top' } }),
  ];
}

describe('material physics table', () => {
  it('classifies catalog materials onto the right physics entry', () => {
    expect(resolveMaterialPhysics(PINE)).toBe(MATERIAL_PHYSICS.pine);
    expect(resolveMaterialPhysics(OAK)).toBe(MATERIAL_PHYSICS.oak);
    expect(resolveMaterialPhysics(getMaterialById('walnut-20x95'))).toBe(MATERIAL_PHYSICS.walnut);
    expect(resolveMaterialPhysics(PLY)).toBe(MATERIAL_PHYSICS.birchPlywood);
    expect(resolveMaterialPhysics(getMaterialById('marine-plywood-18'))).toBe(MATERIAL_PHYSICS.marinePlywood);
    expect(resolveMaterialPhysics(getMaterialById('mdf-18'))).toBe(MATERIAL_PHYSICS.mdf);
    expect(resolveMaterialPhysics(getMaterialById('acrylic-5'))).toBe(MATERIAL_PHYSICS.acrylic);
    expect(resolveMaterialPhysics(getMaterialById('aluminum-3'))).toBe(MATERIAL_PHYSICS.aluminum);
    expect(resolveMaterialPhysics(getMaterialById('steel-3'))).toBe(MATERIAL_PHYSICS.steel);
    expect(resolveMaterialPhysics(getMaterialById('stainless-2'))).toBe(MATERIAL_PHYSICS.stainless);
  });

  it('never lets a substring match turn a panel into solid wood', () => {
    // "18mm Birch Plywood" contains "birch"; the ordered matcher list must reach
    // the plywood pattern first or the panel would get solid birch movement.
    expect(resolveMaterialPhysics(PLY).kind).toBe('panel');
    // "Stainless Steel Sheet" contains "steel".
    expect(resolveMaterialPhysics(getMaterialById('stainless-3')).id).toBe('stainless');
  });

  it('reports no prediction for a material it does not know', () => {
    expect(resolveMaterialPhysics({ id: 'unobtanium-5', name: 'Unobtanium' })).toBeNull();
    expect(getMaterialModulusGPa({ id: 'unobtanium-5', name: 'Unobtanium' })).toBeNull();
  });

  it('treats only lumber-category solid wood as solid lumber', () => {
    expect(isSolidLumberMaterial(OAK)).toBe(true);
    expect(isSolidLumberMaterial(PLY)).toBe(false);
    // Steel sections are sold by the linear metre and sit in the same
    // `perLinearMeter` cost basis as lumber, but are not lumber.
    expect(isSolidLumberMaterial(getMaterialById('steel-sq-25'))).toBe(false);
    expect(isSolidLumberMaterial('oak-20x95')).toBe(false);
  });

  it('gives every non-hygroscopic material a null movement rather than a made-up one', () => {
    expect(MATERIAL_PHYSICS.acrylic.movement).toBeNull();
    expect(MATERIAL_PHYSICS.steel.movement).toBeNull();
    expect(MATERIAL_PHYSICS.aluminum.movement).toBeNull();
    expect(MATERIAL_PHYSICS.stainless.movement).toBeNull();
  });
});

describe('estimateSeasonalMovement', () => {
  it('multiplies dimension x tangential coefficient x MC swing', () => {
    // White oak C_T = 0.00365 (WH Table 13-5):
    //   300mm x 0.00365 x 6 %MC = 6.57mm
    const oak = estimateSeasonalMovement({ material: OAK, crossGrainDimensionMm: 300 });
    expect(oak.movementMm).toBe(6.57);
    expect(oak.coefficient).toBe(0.00365);
    expect(oak.coefficientPercent).toBe(0.365);
    expect(oak.mcSwing).toBe(DEFAULT_INDOOR_MC_SWING);

    // Eastern white pine C_T = 0.00212:
    //   300 x 0.00212 x 6 = 3.816 -> 3.82mm at two decimals
    expect(estimateSeasonalMovement({ material: PINE, crossGrainDimensionMm: 300 }).movementMm).toBe(3.82);
  });

  it('uses the tangential (flatsawn, worst-case) coefficient, not the radial one', () => {
    const oak = estimateSeasonalMovement({ material: OAK, crossGrainDimensionMm: 1000, mcSwing: 1 });
    expect(oak.movementMm).toBe(MATERIAL_PHYSICS.oak.movement.tangential * 1000);
    expect(oak.movementMm).toBeGreaterThan(MATERIAL_PHYSICS.oak.movement.radial * 1000);
  });

  it('scales linearly with the moisture swing', () => {
    const six = estimateSeasonalMovement({ material: OAK, crossGrainDimensionMm: 300, mcSwing: 6 });
    const twelve = estimateSeasonalMovement({ material: OAK, crossGrainDimensionMm: 300, mcSwing: 12 });
    expect(twelve.movementMm).toBeCloseTo(six.movementMm * 2, 6);
  });

  it('gives plywood roughly a tenth of the solid movement', () => {
    // 300 x 0.0002 x 6 = 0.36mm, against oak's 6.57mm over the same width.
    const ply = estimateSeasonalMovement({ material: PLY, crossGrainDimensionMm: 300 });
    expect(ply.movementMm).toBe(0.36);
    expect(ply.kind).toBe('panel');
  });

  it('declines for materials with no moisture behaviour or no data', () => {
    expect(estimateSeasonalMovement({ material: getMaterialById('acrylic-5'), crossGrainDimensionMm: 300 })).toBeNull();
    expect(estimateSeasonalMovement({ material: getMaterialById('steel-3'), crossGrainDimensionMm: 300 })).toBeNull();
    expect(estimateSeasonalMovement({ material: OAK, crossGrainDimensionMm: 0 })).toBeNull();
    expect(estimateSeasonalMovement({ material: OAK, crossGrainDimensionMm: 300, mcSwing: 0 })).toBeNull();
    expect(estimateSeasonalMovement()).toBeNull();
  });
});

describe('getCrossGrainDimension', () => {
  it('reads the height when the grain runs along the rect width', () => {
    expect(getCrossGrainDimension(panel({ grainAngle: 0 }))).toMatchObject({
      dimensionMm: 300,
      alongGrainMm: 600,
      axis: 'height',
      edgeKeys: ['top', 'bottom'],
    });
  });

  it('reads the width when the grain runs across the rect width', () => {
    expect(getCrossGrainDimension(panel({ grainAngle: 90 }))).toMatchObject({
      dimensionMm: 600,
      alongGrainMm: 300,
      axis: 'width',
      edgeKeys: ['left', 'right'],
    });
  });

  it('measures grain in the rect own frame, so a rotated part is not misread', () => {
    // Rect turned 90deg with its grain turned with it: the grain is still along
    // the local X, so the cross-grain span is still the height.
    expect(getCrossGrainDimension(panel({ rotation: 90, grainAngle: 90 }))).toMatchObject({
      dimensionMm: 300,
      axis: 'height',
    });
  });

  it('declines for a diagonal grain angle, which has no bounding edge pair', () => {
    expect(getCrossGrainDimension(panel({ grainAngle: 45 }))).toBeNull();
  });

  it('declines when the part carries no grain angle at all', () => {
    expect(getCrossGrainDimension(panel({ grainAngle: null }))).toBeNull();
    expect(getCrossGrainDimension(panel({ grainAngle: undefined }))).toBeNull();
  });
});

describe('buildRigidJointEdgeMap', () => {
  it('records both ends of every rigid joint', () => {
    const map = buildRigidJointEdgeMap([rigidJoint()]);
    expect([...map.get('panel')]).toEqual(['top']);
    expect([...map.get('rail')]).toEqual(['bottom']);
  });

  it('lists exactly the four edge-capturing joint types', () => {
    expect(RIGID_JOINT_TYPES).toEqual(['dado', 'rabbet', 'mortise_tenon', 'tab_slot']);
  });

  it('ignores point fixings and unresolved joints', () => {
    expect(buildRigidJointEdgeMap([rigidJoint({ type: 'butt' })]).size).toBe(0);
    expect(buildRigidJointEdgeMap([rigidJoint({ type: 'dowel' })]).size).toBe(0);
    expect(buildRigidJointEdgeMap([rigidJoint({ type: 'pocket_screw' })]).size).toBe(0);
    expect(buildRigidJointEdgeMap([rigidJoint({ enabled: false })]).size).toBe(0);
    expect(buildRigidJointEdgeMap([rigidJoint({ validationState: { status: 'invalid' } })]).size).toBe(0);
    expect(buildRigidJointEdgeMap([rigidJoint({ validationState: { status: 'disabled' } })]).size).toBe(0);
  });

  it('falls back to the stored edge reference when there is no resolved contact', () => {
    const map = buildRigidJointEdgeMap([
      rigidJoint({
        resolvedContact: null,
        sourceEdgeRef: { entityId: 'panel', sourceKey: 'left' },
        targetEdgeRef: { entityId: 'rail', sourceKey: 'right' },
      }),
    ]);
    expect([...map.get('panel')]).toEqual(['left']);
  });
});

describe('buildWoodMovementDiagnostics', () => {
  it('warns about a wide solid panel captured at both ends of its cross-grain span', () => {
    const entities = [panel()];
    const diagnostics = buildWoodMovementDiagnostics(entities, capturedTopAndBottom());

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      partId: 'panel',
      status: 'warning',
      statusLabel: 'Movement',
      axis: 'height',
      edgeKeys: ['top', 'bottom'],
      crossGrainDimensionMm: 300,
      movementMm: 6.57,
      species: 'Oak',
    });
    expect(diagnostics[0].message).toContain('6.57mm');
    expect(diagnostics[0].message).toContain('allow for movement');
    expect(diagnostics[0].message).toContain('elongated holes / panel groove');
  });

  it('stays quiet when only one end is captured', () => {
    const oneEnd = [rigidJoint({ id: 'j-top', resolvedContact: { sourceEdgeKey: 'top', targetEdgeKey: 'bottom' } })];
    expect(buildWoodMovementDiagnostics([panel()], oneEnd)).toEqual([]);
  });

  it('stays quiet when the captured edges bound the ALONG-grain dimension', () => {
    // Grain along the width means left/right bound the along-grain span, which
    // barely moves; capturing both of those is correct practice.
    const leftRight = [
      rigidJoint({ id: 'a', resolvedContact: { sourceEdgeKey: 'left', targetEdgeKey: 'right' } }),
      rigidJoint({ id: 'b', resolvedContact: { sourceEdgeKey: 'right', targetEdgeKey: 'left' } }),
    ];
    expect(buildWoodMovementDiagnostics([panel({ grainAngle: 0 })], leftRight)).toEqual([]);
    // Turn the grain 90deg and the same two joints now trap the cross-grain span.
    expect(buildWoodMovementDiagnostics([panel({ grainAngle: 90 })], leftRight)).toHaveLength(1);
  });

  it('stays quiet below the reporting width', () => {
    expect(buildWoodMovementDiagnostics([panel({ height: 150 })], capturedTopAndBottom())).toEqual([]);
    expect(
      buildWoodMovementDiagnostics([panel({ height: MOVEMENT_WARNING_WIDTH_MM + 1 })], capturedTopAndBottom()),
    ).toHaveLength(1);
  });

  it('stays quiet for panel goods and for parts with no grain angle', () => {
    expect(buildWoodMovementDiagnostics([panel({ materialId: 'birch-plywood-18' })], capturedTopAndBottom())).toEqual(
      [],
    );
    expect(buildWoodMovementDiagnostics([panel({ materialId: 'mdf-18' })], capturedTopAndBottom())).toEqual([]);
    expect(buildWoodMovementDiagnostics([panel({ grainAngle: null })], capturedTopAndBottom())).toEqual([]);
    expect(buildWoodMovementDiagnostics([panel({ materialId: null })], capturedTopAndBottom())).toEqual([]);
  });

  it('stays quiet with no joints at all', () => {
    expect(buildWoodMovementDiagnostics([panel()], [])).toEqual([]);
  });

  it('honours a custom moisture swing', () => {
    const humid = buildWoodMovementDiagnostics([panel()], capturedTopAndBottom(), { mcSwing: 12 });
    expect(humid[0].movementMm).toBe(13.14);
    expect(humid[0].mcSwing).toBe(12);
  });

  it('warns per part, in entity order', () => {
    const entities = [
      panel({ id: 'shelf-a' }),
      panel({ id: 'shelf-b', materialId: 'walnut-20x95' }),
      panel({ id: 'shelf-c', materialId: 'birch-plywood-18' }),
    ];
    const joints = [
      rigidJoint({ id: 'a1', sourcePartId: 'shelf-a', resolvedContact: { sourceEdgeKey: 'top', targetEdgeKey: 'x' } }),
      rigidJoint({
        id: 'a2',
        sourcePartId: 'shelf-a',
        resolvedContact: { sourceEdgeKey: 'bottom', targetEdgeKey: 'x' },
      }),
      rigidJoint({
        id: 'b1',
        type: 'mortise_tenon',
        sourcePartId: 'shelf-b',
        resolvedContact: { sourceEdgeKey: 'top', targetEdgeKey: 'x' },
      }),
      rigidJoint({
        id: 'b2',
        type: 'tab_slot',
        sourcePartId: 'shelf-b',
        resolvedContact: { sourceEdgeKey: 'bottom', targetEdgeKey: 'x' },
      }),
      rigidJoint({ id: 'c1', sourcePartId: 'shelf-c', resolvedContact: { sourceEdgeKey: 'top', targetEdgeKey: 'x' } }),
      rigidJoint({
        id: 'c2',
        sourcePartId: 'shelf-c',
        resolvedContact: { sourceEdgeKey: 'bottom', targetEdgeKey: 'x' },
      }),
    ];

    const diagnostics = buildWoodMovementDiagnostics(entities, joints);
    expect(diagnostics.map((entry) => entry.partId)).toEqual(['shelf-a', 'shelf-b']);
    // Walnut C_T = 0.00274: 300 x 0.00274 x 6 = 4.932 -> 4.93mm
    expect(diagnostics[1].movementMm).toBe(4.93);
  });

  it('warns end to end on joints the real joinery kernel resolved', () => {
    // Integration guard: the diagnostic reads `resolvedContact.*EdgeKey`, so it
    // has to agree with the edge vocabulary the kernel actually emits rather
    // than an invented one. A 600 x 300 oak panel with horizontal grain, dadoed
    // into a rail along its top edge AND another along its bottom edge.
    const oakPanel = panel({ id: 'panel', x: 0, y: 0, width: 600, height: 300 });
    const rail = (id, y) => ({
      id,
      type: 'rect',
      x: 100,
      y,
      width: 400,
      height: 18,
      rotation: 0,
      thickness: 18,
      layerId: 'default',
      meta: {},
    });
    const entities = [oakPanel, rail('rail-top', -13), rail('rail-bottom', 295)];
    const resolution = resolveSketchJoinery(entities, [
      { id: 'j-top', type: 'dado', sourcePartId: 'rail-top', targetPartId: 'panel' },
      { id: 'j-bottom', type: 'dado', sourcePartId: 'rail-bottom', targetPartId: 'panel' },
    ]);

    const capturedEdges = buildRigidJointEdgeMap(resolution.joints).get('panel');
    expect([...capturedEdges].sort()).toEqual(['bottom', 'top']);

    const diagnostics = buildWoodMovementDiagnostics(entities, resolution.joints);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ partId: 'panel', movementMm: 6.57, edgeKeys: ['top', 'bottom'] });
  });
});
