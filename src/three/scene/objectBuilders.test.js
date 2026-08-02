import { describe, expect, it } from 'vitest';
import { createFloor, createSlab, createWall } from '@/domain/models';
import { buildFloorPreviewObjects } from './objectBuilders';
import { createWallDetailing } from '@/domain/wallDetailing';

describe('buildFloorPreviewObjects', () => {
  it('carries slab openings into the coordinated 3D prism descriptor', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.slabs = [
      createSlab(
        floor.id,
        [
          { x: 0, y: 0 },
          { x: 5000, y: 0 },
          { x: 5000, y: 4000 },
          { x: 0, y: 4000 },
        ],
        150,
        0,
        {
          openings: [
            {
              id: 'opening_1',
              purpose: 'stair',
              boundaryPoints: [
                { x: 1000, y: 1000 },
                { x: 2000, y: 1000 },
                { x: 2000, y: 2000 },
                { x: 1000, y: 2000 },
              ],
            },
          ],
        },
      ),
    ];

    const slabDescriptor = buildFloorPreviewObjects(floor).find((entry) => entry.kind === 'slab');

    expect(slabDescriptor.holes).toEqual([
      [
        { x: 1000, y: 1000 },
        { x: 2000, y: 1000 },
        { x: 2000, y: 2000 },
        { x: 1000, y: 2000 },
      ],
    ]);
  });

  it('carries the selected board-wall assembly into the 3D material and metadata', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, {
      assembly: { preset: 'plywood', framing: { material: 'timber', spacing: 400 } },
    });
    floor.walls = [wall];

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.kind === 'wall');
    const core = descriptors.find((entry) => entry.metadata.assemblySide === 'core');
    const interior = descriptors.find((entry) => entry.metadata.assemblySide === 'interior');
    const exterior = descriptors.find((entry) => entry.metadata.assemblySide === 'exterior');
    expect(core.materialKey).toBe('wallFramingTimber');
    expect(interior.materialKey).toBe('wallPlywood');
    expect(exterior.materialKey).toBe('wallPlywood');
    expect(core.metadata.wallAssembly).toMatchObject({
      preset: 'plywood',
      system: 'framed',
      framing: { material: 'timber', spacing: 400 },
    });
  });

  it('keeps mixed inside and outside board materials distinct in 3D', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, {
        assembly: {
          preset: 'mixed_board',
          interior: { material: 'plywood', thickness: 12, layerCount: 1 },
          exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
        },
      }),
    ];

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.kind === 'wall');
    const interior = descriptors.find((entry) => entry.metadata.assemblySide === 'interior');
    const exterior = descriptors.find((entry) => entry.metadata.assemblySide === 'exterior');
    expect(interior.materialKey).toBe('wallPlywood');
    expect(exterior.materialKey).toBe('wallFiberCement');
    expect(interior.center.y).toBeLessThan(0);
    expect(exterior.center.y).toBeGreaterThan(0);
  });

  it('renders detailed panels, framing members, gaps, and fasteners as real 3D descriptors', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
    });
    wall.assembly.detailing = createWallDetailing({
      enabled: true,
      sides: {
        interior: {
          enabled: true,
          layout: { boardWidth: 1000, boardHeight: 1500, horizontalGap: 10, verticalGap: 10 },
        },
      },
    });
    floor.walls = [wall];

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.metadata.wallId === wall.id);

    expect(descriptors.some((entry) => entry.metadata.wallDetailKind === 'panel')).toBe(true);
    expect(descriptors.some((entry) => entry.metadata.wallDetailKind === 'framing')).toBe(true);
    expect(descriptors.some((entry) => entry.metadata.wallDetailKind === 'fastener')).toBe(true);
    expect(descriptors.some((entry) => entry.geometry === 'wallFastener')).toBe(true);
    expect(descriptors.find((entry) => entry.geometry === 'wallFastener')).toMatchObject({
      radius: 4,
      depth: 1.5,
      materialKey: 'wallFiberCement',
    });
    expect(descriptors.filter((entry) => entry.metadata.wallDetailKind === 'panel').length).toBeGreaterThan(2);
  });

  it('places an outside-face panel on fiber cement at the same wall-local U position', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: {
        preset: 'mixed_board',
        interior: { material: 'plywood', thickness: 12, layerCount: 1 },
        exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
      },
    });
    wall.assembly.detailing = createWallDetailing({
      enabled: true,
      activeSide: 'exterior',
      sides: {
        exterior: {
          enabled: true,
          layout: {
            mode: 'custom',
            customPanels: [{ id: 'left-facade-panel', u: 100, v: 0, width: 900, height: 1200 }],
          },
        },
      },
    });
    floor.walls = [wall];

    const panel = buildFloorPreviewObjects(floor).find(
      (entry) => entry.metadata.wallDetailElementId === `${wall.id}:exterior:panel:left-facade-panel`,
    );

    expect(panel).toMatchObject({
      center: { x: 550 },
      materialKey: 'wallFiberCement',
      metadata: { assemblySide: 'exterior', boardMaterial: 'fiber_cement' },
    });
    expect(panel.center.y).toBeGreaterThan(0);
  });

  it('rebuilds detailed 3D descriptors from customized panels, framing, and screws', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
    });
    wall.assembly.detailing = createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true } },
    });
    floor.walls = [wall];

    const generated = buildFloorPreviewObjects(floor).filter((entry) => entry.metadata.wallId === wall.id);
    const nextWall = {
      ...wall,
      assembly: {
        ...wall.assembly,
        detailing: createWallDetailing({
          enabled: true,
          framing: {
            mode: 'custom',
            members: [
              {
                id: 'custom-stud',
                kind: 'stud',
                orientation: 'vertical',
                u0: 475,
                u1: 525,
                v0: 0,
                v1: 3000,
                depth: 75,
              },
            ],
          },
          sides: {
            interior: {
              enabled: true,
              layout: {
                mode: 'custom',
                customPanels: [{ id: 'custom-panel', u: 100, v: 200, width: 900, height: 1200 }],
              },
              fasteners: {
                mode: 'custom',
                manual: [{ id: 'custom-screw', u: 500, v: 600 }],
              },
            },
          },
        }),
      },
    };
    const nextFloor = { ...floor, walls: [nextWall] };
    const customized = buildFloorPreviewObjects(nextFloor).filter((entry) => entry.metadata.wallId === wall.id);
    const panels = customized.filter((entry) => entry.metadata.wallDetailKind === 'panel');
    const framing = customized.filter((entry) => entry.metadata.wallDetailKind === 'framing');
    const fasteners = customized.filter((entry) => entry.metadata.wallDetailKind === 'fastener');

    expect(customized).not.toEqual(generated);
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({
      size: { x: 900, y: 1200 },
      metadata: { wallDetailElementId: `${wall.id}:interior:panel:custom-panel` },
    });
    expect(framing).toHaveLength(1);
    expect(framing[0].metadata.wallDetailElementId).toBe('custom-stud');
    expect(fasteners).toHaveLength(1);
    expect(fasteners[0].metadata.wallDetailElementId).toBe('custom-screw');

    nextWall.assembly.detailing.sides.interior.layout.customPanels = [
      {
        id: 'traced-panel',
        outlinePoints: [
          { u: 100, v: 200 },
          { u: 1000, v: 200 },
          { u: 1000, v: 900 },
          { u: 500, v: 1400 },
          { u: 100, v: 900 },
        ],
      },
    ];
    const traced = buildFloorPreviewObjects(nextFloor).find(
      (entry) => entry.metadata.wallDetailElementId === `${wall.id}:interior:panel:traced-panel`,
    );
    expect(traced).toMatchObject({ geometry: 'wallPanel', depth: 6 });
    expect(traced.outline).toHaveLength(5);
  });
});
