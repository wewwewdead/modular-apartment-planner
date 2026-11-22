import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createSlab, createWall } from '@/domain/models';
import { createWallDetailing } from '@/domain/wallDetailing';
import { resolveWallVerticalSpan } from '@/domain/wallFit';
import { deriveWallAssemblyLayers, resolveWallAssembly } from '@/domain/wallAssemblies';
import { createWallDetailPreviewProject, wallFacePreviewFacing } from './wallDetailPreviewProject';

describe('createWallDetailPreviewProject', () => {
  it('isolates the edited wall and its hosted openings for a camera-fitted live preview', () => {
    const project = createProject();
    const floor = project.floors[0];
    const targetWall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 });
    const otherWall = createWall({ x: 3000, y: 0 }, { x: 3000, y: 3000 });
    floor.walls = [targetWall, otherWall];
    floor.doors = [
      { id: 'target-door', wallId: targetWall.id },
      { id: 'other-door', wallId: otherWall.id },
    ];
    floor.windows = [{ id: 'target-window', wallId: targetWall.id }];
    floor.slabs = [createSlab(floor.id, [])];
    project.roofSystems = [{ id: 'roof' }];
    project.trussSystems = [{ id: 'truss', floorId: floor.id }];
    project.ceilings = [{ id: 'ceiling', floorId: floor.id }];

    const preview = createWallDetailPreviewProject(project, floor.id, targetWall.id);

    expect(preview).not.toBe(project);
    expect(preview.floors).toHaveLength(1);
    expect(preview.floors[0].walls).toEqual([targetWall]);
    expect(preview.floors[0].doors.map((entry) => entry.id)).toEqual(['target-door']);
    expect(preview.floors[0].windows.map((entry) => entry.id)).toEqual(['target-window']);
    expect(preview.floors[0].slabs).toEqual([]);
    expect(preview.roofSystems).toEqual([]);
    expect(preview.trussSystems).toEqual([]);
    expect(preview.ceilings).toEqual([]);
  });

  // Emptying the floor takes away the deck the drop is derived from, which would
  // stand the preview wall back up on the storey line while the elevation beside
  // it still shows the wall running past.
  it('pins a bypass wall’s drop so the stripped preview keeps the same span', () => {
    const floor = createFloor('First', 1);
    floor.elevation = 3000;
    floor.floorToFloorHeight = 3000;
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100), framingMode: 'bypass' };
    floor.walls = [wall];
    floor.slabs = [
      createSlab(
        floor.id,
        [
          { x: -500, y: -500 },
          { x: 3500, y: -500 },
          { x: 3500, y: 500 },
          { x: -500, y: 500 },
        ],
        250,
        3000,
      ),
    ];
    const project = { id: 'project', floors: [floor] };

    const preview = createWallDetailPreviewProject(project, floor.id, wall.id);
    const previewWall = preview.floors[0].walls[0];

    expect(preview.floors[0].slabs).toEqual([]);
    expect(previewWall.bypassDrop).toBe(250);
    expect(resolveWallVerticalSpan(previewWall, preview.floors[0])).toMatchObject(resolveWallVerticalSpan(wall, floor));
  });

  it('carries an immutable detailing edit into a fresh preview floor', () => {
    const floor = createFloor('Ground', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement' },
    });
    floor.walls = [wall];
    const project = { id: 'project', floors: [floor] };
    const first = createWallDetailPreviewProject(project, floor.id, wall.id);

    const nextDetailing = createWallDetailing({
      enabled: true,
      sides: {
        interior: {
          enabled: true,
          layout: {
            mode: 'custom',
            customPanels: [{ id: 'panel-a', u: 100, v: 200, width: 900, height: 1200 }],
          },
        },
      },
    });
    const nextWall = { ...wall, assembly: { ...wall.assembly, detailing: nextDetailing } };
    const nextFloor = { ...floor, walls: [nextWall] };
    const nextProject = { ...project, floors: [nextFloor] };
    const second = createWallDetailPreviewProject(nextProject, nextFloor.id, nextWall.id);

    expect(second.floors[0]).not.toBe(first.floors[0]);
    expect(second.floors[0].walls[0].assembly.detailing.sides.interior.layout.customPanels).toEqual([
      expect.objectContaining({ id: 'panel-a', u: 100, v: 200 }),
    ]);
  });
});

describe('wallFacePreviewFacing (docs/wall-fastener-visibility.md §2.1)', () => {
  const layersOf = (wall) => deriveWallAssemblyLayers(resolveWallAssembly(wall));

  it('points each face out along the normal its boards are built on, in world x/z', () => {
    const wall = createWall({ x: 0, y: 1000 }, { x: 4000, y: 1000 }, 150, { assembly: { preset: 'fiber_cement' } });
    const layers = layersOf(wall);
    const inside = wallFacePreviewFacing(
      wall,
      layers.find((layer) => layer.side === 'interior'),
    );
    const outside = wallFacePreviewFacing(
      wall,
      layers.find((layer) => layer.side === 'exterior'),
    );
    // perpendicular((1, 0)) is (0, 1): plan +y, which is world +z.
    const insideSign = layers.find((layer) => layer.side === 'interior').sign;
    expect(inside.normalX).toBeCloseTo(0, 9);
    expect(inside.normalZ).toBe(insideSign);
    expect(outside.normalZ).toBe(-insideSign);
    // The plane runs through the middle of the wall.
    expect(inside).toMatchObject({ pointX: 2000, pointZ: 1000 });
    expect(outside).toMatchObject({ pointX: 2000, pointZ: 1000 });
  });

  it('puts the plane through the body of an outboard wall, not its drawn line', () => {
    const wall = {
      ...createWall({ x: 0, y: 0 }, { x: 0, y: 3000 }, 150, { assembly: { preset: 'fiber_cement' } }),
      outboardOffset: 200,
    };
    const facing = wallFacePreviewFacing(wall, layersOf(wall)[0]);
    // perpendicular((0, 1)) is (-1, 0).
    expect(facing.pointX).toBeCloseTo(-200, 9);
    expect(facing.pointZ).toBeCloseTo(1500, 9);
  });

  it('answers null without a wall or a face', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, 150, { assembly: { preset: 'fiber_cement' } });
    expect(wallFacePreviewFacing(null, layersOf(wall)[0])).toBeNull();
    expect(wallFacePreviewFacing(wall, null)).toBeNull();
    expect(wallFacePreviewFacing({ ...wall, end: { ...wall.start } }, layersOf(wall)[0])).toBeNull();
  });
});
