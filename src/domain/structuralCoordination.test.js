import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createFloor, createProject, createSlab, createWall, createWindow } from './models';
import {
  deriveConceptualLoadPath,
  inferSlabSupportRefs,
  validateStructuralCoordination,
} from './structuralCoordination';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

describe('Gamma structural coordination', () => {
  it('measures beam and slab planning spans against traceable assumptions', () => {
    const project = createProject();
    const floor = project.floors[0];
    const first = { ...createColumn(0, 0), id: 'column_a' };
    const second = { ...createColumn(7000, 0), id: 'column_b' };
    floor.columns = [first, second];
    floor.beams = [
      {
        ...createBeam({ kind: 'column', id: first.id }, { kind: 'column', id: second.id }),
        id: 'beam_long',
      },
    ];
    floor.slabs = [
      {
        ...createSlab(floor.id, rectangle(0, -2000, 7000, 5000), 150, 0, {
          supportRefs: [
            { kind: 'beam', id: 'beam_long' },
            { kind: 'wall', id: 'wall_support' },
          ],
        }),
        id: 'slab_long',
      },
    ];
    floor.walls = [
      {
        ...createWall({ x: 0, y: 3000 }, { x: 7000, y: 3000 }),
        id: 'wall_support',
        structuralRole: 'loadbearing',
        supportRef: { kind: 'foundation', id: 'future_foundation' },
      },
    ];

    const issues = validateStructuralCoordination(project);
    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'STRUCT.BEAM_SPAN_EXCEEDS_ASSUMPTION',
        evidence: expect.objectContaining({ inputs: expect.objectContaining({ configuredMaximum: 6000 }) }),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'STRUCT.SLAB_SPAN_EXCEEDS_ASSUMPTION',
        evidence: expect.objectContaining({ inputs: expect.objectContaining({ configuredMaximum: 4500 }) }),
      }),
    );
  });

  it('persists inferred slab support candidates and detects a slab-opening/beam conflict', () => {
    const project = createProject();
    const floor = project.floors[0];
    const first = { ...createColumn(0, 2000), id: 'column_a' };
    const second = { ...createColumn(4000, 2000), id: 'column_b' };
    floor.columns = [first, second];
    floor.beams = [
      {
        ...createBeam({ kind: 'column', id: first.id }, { kind: 'column', id: second.id }, 300, 500),
        id: 'beam_middle',
      },
    ];
    const slab = {
      ...createSlab(floor.id, rectangle(0, 0, 4000, 4000), 150, 0, {
        openings: [{ id: 'opening_1', purpose: 'shaft', boundaryPoints: rectangle(1800, 1700, 400, 600) }],
      }),
      id: 'slab_1',
    };
    floor.slabs = [slab];
    expect(inferSlabSupportRefs(floor, slab)).toEqual([
      expect.objectContaining({ kind: 'beam', id: 'beam_middle', inference: 'axis_intersects_slab' }),
    ]);
    slab.supportRefs = [
      { kind: 'beam', id: 'beam_middle' },
      { kind: 'column', id: 'column_a' },
    ];

    const conflict = validateStructuralCoordination(project).find(
      (entry) => entry.ruleId === 'STRUCT.SLAB_OPENING_INTERSECTS_BEAM',
    );
    expect(conflict).toMatchObject({
      severity: 'error',
      entityRefs: [
        { type: 'slab', id: 'slab_1' },
        { type: 'slabOpening', id: 'opening_1' },
        { type: 'beam', id: 'beam_middle' },
      ],
      evidence: { resultKind: 'verified_geometry', confidence: 'checked' },
      professionalReviewRequired: true,
    });
  });

  it('distinguishes an opening-column collision from a near-column warning', () => {
    const project = createProject();
    const floor = project.floors[0];
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }), id: 'wall_opening' };
    floor.walls = [wall];
    floor.windows = [{ ...createWindow(wall.id, 1000, 1000), id: 'window_collision' }];
    floor.columns = [{ ...createColumn(1000, 0, 300, 300), id: 'column_collision' }];
    expect(validateStructuralCoordination(project)).toContainEqual(
      expect.objectContaining({
        ruleId: 'STRUCT.OPENING_INTERSECTS_COLUMN',
        severity: 'error',
        evidence: expect.objectContaining({ resultKind: 'verified_geometry' }),
      }),
    );
  });

  it('derives a relationship-only load-path graph without inventing loads or capacity', () => {
    const project = createProject();
    const floor = project.floors[0];
    const first = { ...createColumn(0, 0), id: 'column_a' };
    const second = { ...createColumn(4000, 0), id: 'column_b' };
    floor.columns = [first, second];
    floor.beams = [
      {
        ...createBeam({ kind: 'column', id: first.id }, { kind: 'column', id: second.id }),
        id: 'beam_1',
      },
    ];
    floor.slabs = [
      {
        ...createSlab(floor.id, rectangle(0, -2000, 4000, 4000), 150, 0, {
          supportRefs: [{ kind: 'beam', id: 'beam_1' }],
        }),
        id: 'slab_1',
      },
    ];

    const graph = deriveConceptualLoadPath(project);
    expect(graph).toMatchObject({
      resultKind: 'conceptual_relationship_diagram',
      confidence: 'checked',
      professionalReviewRequired: true,
      summary: { nodeCount: 4, relationshipCount: 3, unsupportedNodeCount: 0 },
    });
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'slab:slab_1', to: 'beam:beam_1', kind: 'slab_to_beam' }),
        expect.objectContaining({ from: 'beam:beam_1', to: 'column:column_a', kind: 'beam_to_column' }),
      ]),
    );
    expect(graph).not.toHaveProperty('loads');
    expect(graph).not.toHaveProperty('capacity');
  });
});

function cantileverProject(innerColumn) {
  const project = createProject();
  const floor = project.floors[0];
  const edge = { ...createColumn(0, 0, 400, 400), id: 'column_edge' };
  floor.columns = [edge];
  floor.beams = [
    {
      ...createBeam({ kind: 'column', id: edge.id }, { kind: 'point', x: -2000, y: 0 }, 300, 500, 0, {
        coordination: { condition: 'cantilever' },
      }),
      id: 'beam_cantilever',
    },
  ];
  if (innerColumn) {
    const inner = { ...createColumn(innerColumn.x, innerColumn.y, 400, 400), id: 'column_inner' };
    floor.columns.push(inner);
    floor.beams.push({
      ...createBeam({ kind: 'column', id: edge.id }, { kind: 'column', id: inner.id }, 300, 500, 0),
      id: 'beam_backspan',
    });
  }
  return project;
}

describe('cantilever back-span coordination', () => {
  it('warns when the back-span is shorter than the configured ratio of the cantilever', () => {
    // 1800 mm cantilever off a 3600 mm back-span: 2x, against an assumption of 3x.
    const issues = validateStructuralCoordination(cantileverProject({ x: 4000, y: 0 }));
    const warning = issues.find((entry) => entry.ruleId === 'STRUCT.CANTILEVER_BACKSPAN_INSUFFICIENT');

    expect(warning).toMatchObject({
      severity: 'warning',
      professionalReviewRequired: true,
      entityRefs: [
        { type: 'beam', id: 'beam_cantilever' },
        { type: 'beam', id: 'beam_backspan' },
      ],
    });
    expect(warning.evidence.inputs).toMatchObject({ configuredMinimumRatio: 3, backSpanLength: 3600 });
    expect(warning.evidence.inputs.measuredRatio).toBeCloseTo(2, 5);
    expect(issues.some((entry) => entry.ruleId === 'STRUCT.CANTILEVER_NO_BACKSPAN')).toBe(false);
  });

  it('stays quiet when the back-span is long enough', () => {
    const issues = validateStructuralCoordination(cantileverProject({ x: 8000, y: 0 }));

    expect(issues.some((entry) => entry.ruleId.startsWith('STRUCT.CANTILEVER_BACKSPAN'))).toBe(false);
    expect(issues.some((entry) => entry.ruleId === 'STRUCT.CANTILEVER_NO_BACKSPAN')).toBe(false);
  });

  it('reports no back-span at all when nothing continues past the support', () => {
    const issues = validateStructuralCoordination(cantileverProject(null));

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'STRUCT.CANTILEVER_NO_BACKSPAN',
        severity: 'warning',
        professionalReviewRequired: true,
      }),
    );
  });

  it('does not accept a beam that leaves the support in another direction', () => {
    // Sharing the column is not enough — a perpendicular beam takes nothing
    // back from the cantilever's tail.
    const issues = validateStructuralCoordination(cantileverProject({ x: 0, y: 4000 }));

    expect(issues.some((entry) => entry.ruleId === 'STRUCT.CANTILEVER_NO_BACKSPAN')).toBe(true);
    expect(issues.some((entry) => entry.ruleId === 'STRUCT.CANTILEVER_BACKSPAN_INSUFFICIENT')).toBe(false);
  });
});

function stackedProject({ upperDepth = 8000, beams = [], upperSupportRefs = [] } = {}) {
  return {
    floors: [
      {
        ...createFloor('Ground', 0, { elevation: 0, floorToFloorHeight: 3000 }),
        id: 'ground',
        slabs: [{ ...createSlab('ground', rectangle(0, 0, 6000, 6000), 200, 0), id: 'slab_ground' }],
        beams,
      },
      {
        ...createFloor('First', 1, { elevation: 3000, floorToFloorHeight: 3000 }),
        id: 'first',
        slabs: [
          {
            ...createSlab('first', rectangle(0, 0, 6000, upperDepth), 200, 3000, {
              supportRefs: upperSupportRefs,
            }),
            id: 'slab_upper',
          },
        ],
      },
    ],
  };
}

/** A beam under the projecting edge, spanning between two free points. */
function edgeBeam(id, y, floorLevel) {
  return {
    ...createBeam({ kind: 'point', x: 0, y }, { kind: 'point', x: 6000, y }, 300, 500, floorLevel),
    id,
  };
}

describe('slab overhang coordination', () => {
  it('measures a slab reaching past the floor below and flags the planning assumption', () => {
    const issues = validateStructuralCoordination(stackedProject());
    const exceeded = issues.find((entry) => entry.ruleId === 'STRUCT.SLAB_OVERHANG_EXCEEDS_ASSUMPTION');

    expect(exceeded).toMatchObject({
      severity: 'warning',
      professionalReviewRequired: true,
      entityRefs: [{ type: 'slab', id: 'slab_upper' }],
    });
    expect(exceeded.evidence.inputs).toMatchObject({ configuredMaximum: 1500, belowFloorId: 'ground' });
    expect(exceeded.evidence.inputs.measuredOverhang).toBeCloseTo(2000, 5);
  });

  it('leaves a slab that stays within the floor below alone', () => {
    const issues = validateStructuralCoordination(stackedProject({ upperDepth: 6000 }));

    expect(issues.some((entry) => entry.ruleId.startsWith('STRUCT.SLAB_OVERHANG'))).toBe(false);
  });

  it('reports an unsupported overhang when no beam sits under the projecting edge', () => {
    const issues = validateStructuralCoordination(stackedProject());

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'STRUCT.SLAB_OVERHANG_UNSUPPORTED',
        severity: 'warning',
        professionalReviewRequired: true,
      }),
    );
  });

  it('accepts a beam on the floor below as the overhang support', () => {
    // Slab top 3000, 200 thick, so the soffit is 2800 — where a beam filed on
    // the storey below sits. Levels are absolute, which is why the search
    // cannot be restricted to the slab's own floor.
    const issues = validateStructuralCoordination(stackedProject({ beams: [edgeBeam('beam_edge', 7950, 2800)] }));

    expect(issues.some((entry) => entry.ruleId === 'STRUCT.SLAB_OVERHANG_UNSUPPORTED')).toBe(false);
    expect(issues.some((entry) => entry.ruleId === 'STRUCT.SLAB_OVERHANG_EXCEEDS_ASSUMPTION')).toBe(true);
  });

  it('rejects a beam that is in plan but at the wrong level', () => {
    const issues = validateStructuralCoordination(stackedProject({ beams: [edgeBeam('beam_low', 7950, 0)] }));

    expect(issues.some((entry) => entry.ruleId === 'STRUCT.SLAB_OVERHANG_UNSUPPORTED')).toBe(true);
  });

  it('rejects a beam at the right level that runs nowhere near the overhang', () => {
    const issues = validateStructuralCoordination(stackedProject({ beams: [edgeBeam('beam_inboard', 3000, 2800)] }));

    expect(issues.some((entry) => entry.ruleId === 'STRUCT.SLAB_OVERHANG_UNSUPPORTED')).toBe(true);
  });
});

/* ── Walls on and off the plate ───────────────────────────────────────── */

function wallFloorProject({ walls = [], slabs = [] } = {}) {
  return {
    floors: [
      {
        ...createFloor('Ground', 0, { elevation: 0, floorToFloorHeight: 3000 }),
        id: 'ground',
        slabs,
        walls,
      },
    ],
  };
}

/** The plate every wall case below is measured against: 6 m square at the origin. */
function groundPlate() {
  return { ...createSlab('ground', rectangle(0, 0, 6000, 6000), 200, 0), id: 'slab_ground' };
}

function ruleIds(issues, ruleId) {
  return issues.filter((entry) => entry.ruleId === ruleId);
}

describe('bypass walls with nothing underneath', () => {
  it('reports a bypass wall standing clear of every slab and beam on its floor', () => {
    const wall = {
      ...createWall({ x: 0, y: 10000 }, { x: 6000, y: 10000 }, 200, { framingMode: 'bypass' }),
      id: 'wall_hanging',
    };
    const [reported] = ruleIds(
      validateStructuralCoordination(wallFloorProject({ walls: [wall], slabs: [groundPlate()] })),
      'STRUCT.BYPASS_WALL_UNSUPPORTED',
    );

    expect(reported).toMatchObject({
      severity: 'warning',
      professionalReviewRequired: true,
      entityRefs: [{ type: 'wall', id: 'wall_hanging' }],
    });
    expect(reported.evidence.inputs).toMatchObject({ floorId: 'ground', unsupportedRatio: 1 });
    expect(reported.evidence.inputs.unsupportedRun).toBeCloseTo(6000, 6);
  });

  it('stays quiet about a bypass wall standing on the plate, edge included', () => {
    // Drawn ON the plate boundary, which is where the bay macro puts one: half
    // the body is over the plate and that is bearing, not a wall in the air.
    const walls = [
      { ...createWall({ x: 1000, y: 3000 }, { x: 5000, y: 3000 }, 200, { framingMode: 'bypass' }), id: 'wall_inside' },
      { ...createWall({ x: 0, y: 6000 }, { x: 6000, y: 6000 }, 200, { framingMode: 'bypass' }), id: 'wall_on_edge' },
    ];

    expect(
      ruleIds(
        validateStructuralCoordination(wallFloorProject({ walls, slabs: [groundPlate()] })),
        'STRUCT.BYPASS_WALL_UNSUPPORTED',
      ),
    ).toEqual([]);
  });

  it('says nothing about a platform wall in mid-air — that is a different question', () => {
    const wall = { ...createWall({ x: 0, y: 10000 }, { x: 6000, y: 10000 }, 200), id: 'wall_platform' };

    expect(
      ruleIds(
        validateStructuralCoordination(wallFloorProject({ walls: [wall], slabs: [groundPlate()] })),
        'STRUCT.BYPASS_WALL_UNSUPPORTED',
      ),
    ).toEqual([]);
  });
});

describe('walls that slide off the plate they bear on', () => {
  it('measures how far the built body reaches past the slab edge', () => {
    // Drawn 1050 inboard of the plate edge and built past it: the body's centre
    // sits 50 beyond y = 6000, so the bearing line itself has left the slab and
    // the outer face reaches 150 past — more than the half-thickness-plus-
    // tolerance allowance of 125.
    const wall = {
      ...createWall({ x: 0, y: 5000 }, { x: 6000, y: 5000 }, 200, { outboardOffset: 1050 }),
      id: 'wall_slid',
    };
    const [reported] = ruleIds(
      validateStructuralCoordination(wallFloorProject({ walls: [wall], slabs: [groundPlate()] })),
      'STRUCT.WALL_OFF_SLAB_EDGE',
    );

    expect(reported).toMatchObject({
      severity: 'warning',
      entityRefs: [{ type: 'wall', id: 'wall_slid' }],
      evidence: { resultKind: 'verified_geometry' },
    });
    expect(reported.evidence.inputs).toMatchObject({ tolerance: 25, allowance: 125, outboardOffset: 1050 });
    expect(reported.evidence.inputs.overrun).toBeCloseTo(150, 6);
  });

  it('tolerates the half body that hangs past a slab traced to the centreline', () => {
    // The test-fit generator (and plenty of hand drawing) puts the slab edge on
    // the wall axis, so half the thickness legitimately oversails on every
    // perimeter wall. The bearing line is still on the plate — no warning.
    const wall = { ...createWall({ x: 0, y: 6000 }, { x: 6000, y: 6000 }, 200), id: 'wall_centreline' };

    expect(
      ruleIds(
        validateStructuralCoordination(wallFloorProject({ walls: [wall], slabs: [groundPlate()] })),
        'STRUCT.WALL_OFF_SLAB_EDGE',
      ),
    ).toEqual([]);
  });

  it('leaves a wall sitting squarely on its plate alone', () => {
    const wall = { ...createWall({ x: 0, y: 5000 }, { x: 6000, y: 5000 }, 200), id: 'wall_on_plate' };

    expect(
      ruleIds(
        validateStructuralCoordination(wallFloorProject({ walls: [wall], slabs: [groundPlate()] })),
        'STRUCT.WALL_OFF_SLAB_EDGE',
      ),
    ).toEqual([]);
  });

  it('says nothing about a wall that never reached a plate in the first place', () => {
    // Nothing of it is on the slab, so it did not slide off one. Silence here is
    // what keeps a garden wall out of the structural report.
    const wall = { ...createWall({ x: 0, y: 12000 }, { x: 6000, y: 12000 }, 200), id: 'wall_elsewhere' };

    expect(
      ruleIds(
        validateStructuralCoordination(wallFloorProject({ walls: [wall], slabs: [groundPlate()] })),
        'STRUCT.WALL_OFF_SLAB_EDGE',
      ),
    ).toEqual([]);
  });
});

describe('a cantilever carrying a wall', () => {
  function bayProject(walls) {
    const project = stackedProject();
    project.floors[1].walls = walls;
    return project;
  }

  it('reports the load condition when a wall stands on the projecting edge', () => {
    const wall = { ...createWall({ x: 0, y: 8000 }, { x: 6000, y: 8000 }, 200), id: 'wall_face' };
    const [reported] = ruleIds(validateStructuralCoordination(bayProject([wall])), 'STRUCT.CANTILEVER_CARRIES_WALL');

    expect(reported).toMatchObject({
      // Informational: a bay is MEANT to carry its own facade. It still has to
      // appear, because the load case it implies is not the bare-plate one.
      severity: 'info',
      professionalReviewRequired: true,
      entityRefs: [
        { type: 'slab', id: 'slab_upper' },
        { type: 'wall', id: 'wall_face' },
      ],
    });
    expect(reported.evidence.inputs).toMatchObject({ wallIds: ['wall_face'], floorId: 'first' });
  });

  it('does not report a wall standing on the back-span', () => {
    const wall = { ...createWall({ x: 0, y: 3000 }, { x: 6000, y: 3000 }, 200), id: 'wall_inboard' };

    expect(ruleIds(validateStructuralCoordination(bayProject([wall])), 'STRUCT.CANTILEVER_CARRIES_WALL')).toEqual([]);
    expect(ruleIds(validateStructuralCoordination(stackedProject()), 'STRUCT.CANTILEVER_CARRIES_WALL')).toEqual([]);
  });
});

/* ── Bays across storeys ──────────────────────────────────────────────── */

function bayWall(id, start, end, overrides = {}) {
  return { ...createWall(start, end, 200, { stackId: 'bay_1', ...overrides }), id };
}

function stackedBayProject(wallsByFloor) {
  return {
    floors: wallsByFloor.map((walls, index) => ({
      ...createFloor(`Level ${index}`, index, { elevation: index * 3000, floorToFloorHeight: 3000 }),
      id: `level_${index}`,
      walls,
    })),
  };
}

describe('bay stacks across storeys', () => {
  const face = (id, overrides) => bayWall(id, { x: 0, y: 6000 }, { x: 3000, y: 6000 }, overrides);

  it('says nothing about bays that line up storey to storey', () => {
    const issues = validateStructuralCoordination(stackedBayProject([[face('wall_lower')], [face('wall_upper')]]));

    expect(ruleIds(issues, 'STRUCT.BAY_STACK_MISALIGNED')).toEqual([]);
    expect(ruleIds(issues, 'STRUCT.BAY_STACK_DISCONTINUITY')).toEqual([]);
  });

  it('accepts a bay traced the other way round on the storey above', () => {
    const reversed = bayWall('wall_upper', { x: 3000, y: 6000 }, { x: 0, y: 6000 });
    const issues = validateStructuralCoordination(stackedBayProject([[face('wall_lower')], [reversed]]));

    expect(ruleIds(issues, 'STRUCT.BAY_STACK_MISALIGNED')).toEqual([]);
  });

  it('reports a bay whose axis has drifted off the one below it', () => {
    const drifted = bayWall('wall_upper', { x: 0, y: 6200 }, { x: 3000, y: 6200 });
    const [reported] = ruleIds(
      validateStructuralCoordination(stackedBayProject([[face('wall_lower')], [drifted]])),
      'STRUCT.BAY_STACK_MISALIGNED',
    );

    expect(reported).toMatchObject({
      severity: 'warning',
      entityRefs: [
        { type: 'wallStack', id: 'bay_1' },
        { type: 'wall', id: 'wall_upper' },
      ],
    });
    expect(reported.message).toBe('Wall is 200 mm from the bay stack axis below it.');
    expect(reported.evidence.inputs).toMatchObject({
      tolerance: 25,
      referenceWallId: 'wall_lower',
      referenceFloorId: 'level_0',
    });
    expect(reported.evidence.inputs.axisOffset).toBeCloseTo(200, 6);
  });

  it('reports a bay built the same distance out on one storey and further on the next', () => {
    // Same drawn axis, different built body: a facade 300 further out is as out
    // of line as one drawn 300 further out, and only the offset says so.
    const pushed = face('wall_upper', { outboardOffset: 300 });
    const [reported] = ruleIds(
      validateStructuralCoordination(stackedBayProject([[face('wall_lower')], [pushed]])),
      'STRUCT.BAY_STACK_MISALIGNED',
    );

    expect(reported.evidence.inputs).toMatchObject({ axisOffset: 0, outboardOffsetDelta: 300, offset: 300 });
  });

  it('reports a stack that skips a storey', () => {
    const [reported] = ruleIds(
      validateStructuralCoordination(stackedBayProject([[face('wall_lower')], [], [face('wall_top')]])),
      'STRUCT.BAY_STACK_DISCONTINUITY',
    );

    expect(reported).toMatchObject({
      severity: 'warning',
      entityRefs: [
        { type: 'wallStack', id: 'bay_1' },
        { type: 'floor', id: 'level_1' },
      ],
    });
    expect(reported.evidence.inputs).toMatchObject({ missingFloorId: 'level_1' });
  });

  it('never calls a single-storey bay a discontinuity', () => {
    // Bays are legitimately one storey tall, and deleting the floor above one
    // must not turn the survivor into a finding.
    const oneStorey = validateStructuralCoordination(stackedBayProject([[face('wall_only')], [], []]));

    expect(ruleIds(oneStorey, 'STRUCT.BAY_STACK_DISCONTINUITY')).toEqual([]);
    expect(ruleIds(oneStorey, 'STRUCT.BAY_STACK_MISALIGNED')).toEqual([]);
  });

  it('pairs up the three walls of a bay rather than comparing a face to a return', () => {
    // The macro gives a face and two returns one stackId, so a storey brings
    // three walls to the stack, not one.
    const storey = (suffix) => [
      bayWall(`face_${suffix}`, { x: 0, y: 6000 }, { x: 3000, y: 6000 }),
      bayWall(`left_${suffix}`, { x: 0, y: 5000 }, { x: 0, y: 6000 }),
      bayWall(`right_${suffix}`, { x: 3000, y: 5000 }, { x: 3000, y: 6000 }),
    ];
    const issues = validateStructuralCoordination(stackedBayProject([storey('a'), storey('b')]));

    expect(ruleIds(issues, 'STRUCT.BAY_STACK_MISALIGNED')).toEqual([]);
  });

  it('ignores walls that belong to no stack at all', () => {
    const loose = { ...createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 200), id: 'wall_loose' };
    const issues = validateStructuralCoordination(stackedBayProject([[loose], [loose]]));

    expect(ruleIds(issues, 'STRUCT.BAY_STACK_MISALIGNED')).toEqual([]);
    expect(ruleIds(issues, 'STRUCT.BAY_STACK_DISCONTINUITY')).toEqual([]);
  });
});

describe('the structural role a wall can now be given', () => {
  it('asks a load-bearing wall what it stands on, and asks nothing of a partition', () => {
    const project = createProject();
    const floor = project.floors[0];
    floor.walls = [
      { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }), id: 'wall_bearing', structuralRole: 'loadbearing' },
      { ...createWall({ x: 0, y: 2000 }, { x: 4000, y: 2000 }), id: 'wall_partition' },
    ];

    const reported = ruleIds(validateStructuralCoordination(project), 'STRUCT.LOADBEARING_WALL_SUPPORT_MISSING');

    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({
      severity: 'warning',
      entityRefs: [{ type: 'wall', id: 'wall_bearing' }],
      evidence: { inputs: { structuralRole: 'loadbearing' } },
    });
  });

  it('stops asking once the wall names what carries it', () => {
    const project = createProject();
    project.floors[0].walls = [
      {
        ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
        id: 'wall_bearing',
        structuralRole: 'loadbearing',
        supportRef: { kind: 'foundation', id: 'future_foundation' },
      },
    ];

    expect(ruleIds(validateStructuralCoordination(project), 'STRUCT.LOADBEARING_WALL_SUPPORT_MISSING')).toEqual([]);
  });

  it('offers a load-bearing wall to a slab as one of the members carrying it', () => {
    const project = createProject();
    const floor = project.floors[0];
    const bearing = { ...createWall({ x: 0, y: 2000 }, { x: 4000, y: 2000 }), id: 'wall_bearing' };
    const partition = { ...createWall({ x: 0, y: 1000 }, { x: 4000, y: 1000 }), id: 'wall_partition' };
    floor.walls = [bearing, partition];
    const slab = { ...createSlab(floor.id, rectangle(0, 0, 4000, 4000), 150, 0), id: 'slab_1' };

    // A wall created today is non-structural, so neither is a candidate.
    expect(inferSlabSupportRefs(floor, slab)).toEqual([]);

    bearing.structuralRole = 'loadbearing';
    expect(inferSlabSupportRefs(floor, slab)).toEqual([
      expect.objectContaining({ kind: 'wall', id: 'wall_bearing', role: 'loadbearing' }),
    ]);
  });
});

describe('cross-floor slab support', () => {
  const project = stackedProject({
    beams: [edgeBeam('beam_edge', 7950, 2800)],
    upperSupportRefs: [
      { kind: 'beam', id: 'beam_edge' },
      { kind: 'slab', id: 'slab_ground' },
    ],
  });

  it('resolves a support filed on the floor below', () => {
    const broken = validateStructuralCoordination(project).filter(
      (entry) => entry.ruleId === 'STRUCT.SLAB_SUPPORT_REFERENCE_BROKEN',
    );

    // The beam one storey down resolves; the bogus slab ref still does not.
    expect(broken).toHaveLength(1);
    expect(broken[0].entityRefs).toContainEqual({ type: 'slab', id: 'slab_ground' });
  });

  it('keeps a cantilevered slab out of the unsupported set in the load path', () => {
    const graph = deriveConceptualLoadPath(project);

    expect(graph.unsupportedNodeIds).not.toContain('slab:slab_upper');
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ from: 'slab:slab_upper', to: 'beam:beam_edge', supportFloorId: 'ground' }),
    );
  });

  it('infers candidates from the floor below as well as the slab own level', () => {
    const [ground, first] = project.floors;
    const refs = inferSlabSupportRefs(first, first.slabs[0], ground);

    expect(refs).toContainEqual(
      expect.objectContaining({ kind: 'beam', id: 'beam_edge', inference: 'axis_intersects_slab_from_floor_below' }),
    );
    expect(inferSlabSupportRefs(first, first.slabs[0])).toEqual([]);
  });
});
