import { describe, expect, it } from 'vitest';
import { createDoor, createProject, createRoom, createWall, createWindow } from '@/domain/models';
import { buildVentilationTopology, computeVentilationNetwork } from './ventilationNetwork';

function rectangularRoomProject() {
  const project = createProject('Ventilation');
  const floor = project.floors[0];
  const points = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 8000 },
    { x: 0, y: 8000 },
  ];
  floor.walls = points.map((point, index) => createWall(point, points[(index + 1) % points.length], 200));
  floor.rooms = [createRoom('Living', points)];
  floor.windows = [createWindow(floor.walls[0].id, 3000, 1600), createWindow(floor.walls[2].id, 3000, 1600)];
  return project;
}

function pressureGrid() {
  const columns = 20;
  const rows = 18;
  const cellSize = 1000;
  const pressureCoefficient = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      pressureCoefficient[row * columns + column] = row < 5 ? 0.6 : -0.3;
    }
  }
  return {
    columns,
    rows,
    cellSize,
    origin: { x: -5000, y: -5000 },
    obstacles: new Uint8Array(columns * rows),
    pressureCoefficient,
    velocityX: new Float32Array(columns * rows),
    velocityY: new Float32Array(columns * rows),
  };
}

describe('opening/room pressure network', () => {
  it('extracts legacy operable windows and treats doors as closed until configured', () => {
    const project = rectangularRoomProject();
    project.floors[0].doors = [createDoor(project.floors[0].walls[1].id, 2000)];
    const topology = buildVentilationTopology(project);
    expect(topology.rooms).toHaveLength(1);
    expect(topology.openings).toHaveLength(2);
    expect(topology.openings.every((opening) => opening.kind === 'window')).toBe(true);
    expect(topology.openings[0].openFraction).toBe(0.5);
  });

  it('balances opposing facade pressures and reports room ACH', () => {
    const result = computeVentilationNetwork({
      project: rectangularRoomProject(),
      grid: pressureGrid(),
      referenceSpeed: 5,
    });
    expect(result.summary.assessedRoomCount).toBe(1);
    expect(result.summary.openExteriorCount).toBe(2);
    expect(result.rooms[0].airChangesPerHour).toBeGreaterThan(0.1);
    expect(result.rooms[0].crossVentilated).toBe(true);
    expect(result.openings[0].flowM3s * result.openings[1].flowM3s).toBeLessThan(0);
    expect(result.solver.residualM3s).toBeLessThan(1e-5);
  });

  it('keeps a fixed window out of the airflow topology', () => {
    const project = rectangularRoomProject();
    project.floors[0].windows[0].type = 'fixed';
    project.floors[0].windows[1].ventilation = { operable: false, openFraction: 1 };
    expect(buildVentilationTopology(project).openings).toHaveLength(0);
  });

  it('moves air between rooms through an explicitly open internal door', () => {
    const project = createProject('Two rooms');
    const floor = project.floors[0];
    const outer = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 8000 },
      { x: 0, y: 8000 },
    ];
    floor.walls = outer.map((point, index) => createWall(point, outer[(index + 1) % outer.length], 200));
    const partition = createWall({ x: 5000, y: 0 }, { x: 5000, y: 8000 }, 150);
    floor.walls.push(partition);
    floor.rooms = [
      createRoom('West room', [outer[0], { x: 5000, y: 0 }, { x: 5000, y: 8000 }, outer[3]]),
      createRoom('East room', [{ x: 5000, y: 0 }, outer[1], outer[2], { x: 5000, y: 8000 }]),
    ];
    floor.windows = [createWindow(floor.walls[0].id, 2500, 1600), createWindow(floor.walls[2].id, 2500, 1600)];
    const door = createDoor(partition.id, 4000);
    door.ventilation = { operable: true, openFraction: 0.75, dischargeCoefficient: 0.62 };
    floor.doors = [door];

    const result = computeVentilationNetwork({ project, grid: pressureGrid(), referenceSpeed: 5 });
    expect(result.summary.assessedRoomCount).toBe(2);
    expect(result.summary.openInternalCount).toBe(1);
    expect(result.rooms.every((room) => room.airChangesPerHour > 0.1)).toBe(true);
    expect(result.openings.find((opening) => opening.id === door.id).flowM3s).not.toBeCloseTo(0, 5);
  });
});
