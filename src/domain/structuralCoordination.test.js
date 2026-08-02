import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createProject, createSlab, createWall, createWindow } from './models';
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
