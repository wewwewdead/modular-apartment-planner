import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createSlab, createWall } from '@/domain/models';
import { createWallDetailing } from '@/domain/wallDetailing';
import { createWallDetailPreviewProject } from './wallDetailPreviewProject';

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
    project.roofSystem = { id: 'roof' };
    project.trussSystems = [{ id: 'truss', floorId: floor.id }];

    const preview = createWallDetailPreviewProject(project, floor.id, targetWall.id);

    expect(preview).not.toBe(project);
    expect(preview.floors).toHaveLength(1);
    expect(preview.floors[0].walls).toEqual([targetWall]);
    expect(preview.floors[0].doors.map((entry) => entry.id)).toEqual(['target-door']);
    expect(preview.floors[0].windows.map((entry) => entry.id)).toEqual(['target-window']);
    expect(preview.floors[0].slabs).toEqual([]);
    expect(preview.roofSystem).toBeNull();
    expect(preview.trussSystems).toEqual([]);
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
