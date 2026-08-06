import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';

const polygon = [
  { x: 0, y: 0 },
  { x: 10000, y: 0 },
  { x: 10000, y: 8000 },
  { x: 0, y: 8000 },
];

describe('solar-study target commands', () => {
  it('creates, updates and removes an explicit neighbor mask', () => {
    const project = createProject('Targets');
    const created = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET,
      id: 'neighbor_east',
      name: 'East neighbor garden',
      kind: 'neighbor',
      polygon,
    });
    expect(created.ok).toBe(true);
    expect(created.project.building.site.solarStudyTargets).toHaveLength(1);

    const updated = executeBuildingCommand(created.project, {
      type: BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET,
      id: 'neighbor_east',
      name: 'East neighbor lot',
      kind: 'neighbor',
      polygon,
    });
    expect(updated.project.building.site.solarStudyTargets[0].name).toBe('East neighbor lot');

    const removed = executeBuildingCommand(updated.project, {
      type: BUILDING_COMMANDS.REMOVE_SOLAR_STUDY_TARGET,
      id: 'neighbor_east',
    });
    expect(removed.ok).toBe(true);
    expect(removed.project.building.site.solarStudyTargets).toEqual([]);
  });

  it('rejects self-intersecting and unclassified targets', () => {
    const project = createProject('Targets');
    const bowTie = [polygon[0], polygon[2], polygon[1], polygon[3]];
    const invalidPolygon = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET,
      id: 'bad',
      name: 'Bad target',
      kind: 'neighbor',
      polygon: bowTie,
    });
    expect(invalidPolygon.ok).toBe(false);
    expect(invalidPolygon.error.code).toBe('invalid-solar-target-polygon');

    const invalidKind = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.UPSERT_SOLAR_STUDY_TARGET,
      id: 'bad',
      name: 'Bad target',
      kind: 'roof',
      polygon,
    });
    expect(invalidKind.ok).toBe(false);
    expect(invalidKind.error.code).toBe('invalid-solar-target-kind');
  });
});
