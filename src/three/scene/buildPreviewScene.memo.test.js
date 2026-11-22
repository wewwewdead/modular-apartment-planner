import { describe, expect, it } from 'vitest';
import { deserializeProject } from '@/persistence/deserialize';
import { createCeilingForProject } from '@/domain/ceilingModels';
import demoData from '@/pages/playground-demo.json';
import { buildPreviewScene } from './buildPreviewScene';

/*
 * The descriptor memo (`options.memo`) against the fresh build as the oracle.
 *
 * The contract: whatever sequence of edits the pane sees, a memoised build is
 * deep-equal to a fresh one of the same project with the same options — and a
 * floor, truss or roof none of whose inputs changed comes back as the very same
 * objects, which is the whole point. The playground demo is the fixture: three
 * storeys, two of them built on, stairs, a truss system and a roof on it.
 */

function demoProject() {
  return deserializeProject(demoData).project;
}

const mapFloor = (project, index, update) => ({
  ...project,
  floors: project.floors.map((floor, floorIndex) => (floorIndex === index ? update(floor) : floor)),
});

/** One edit of each kind the pane can see, applied in turn. */
const EDITS = [
  [
    'move a fixture on the ground floor',
    (project) =>
      mapFloor(project, 0, (floor) => ({
        ...floor,
        fixtures: floor.fixtures.map((fixture, index) => (index === 0 ? { ...fixture, x: fixture.x + 250 } : fixture)),
      })),
  ],
  [
    'move a wall on the upper floor',
    (project) =>
      mapFloor(project, 1, (floor) => ({
        ...floor,
        walls: floor.walls.map((wall, index) =>
          index === 0
            ? { ...wall, start: { ...wall.start, y: wall.start.y + 100 }, end: { ...wall.end, y: wall.end.y + 100 } }
            : wall,
        ),
      })),
  ],
  [
    'raise the ground floor (the stair contexts read every elevation)',
    (project) => mapFloor(project, 0, (floor) => ({ ...floor, elevation: (floor.elevation || 0) + 150 })),
  ],
  [
    'move a stair',
    (project) =>
      mapFloor(project, 0, (floor) => ({
        ...floor,
        stairs: floor.stairs.map((stair, index) =>
          index === 0 ? { ...stair, startPoint: { ...stair.startPoint, x: stair.startPoint.x + 200 } } : stair,
        ),
      })),
  ],
  [
    'edit the truss system',
    (project) => ({
      ...project,
      trussSystems: project.trussSystems.map((system, index) =>
        index === 0 ? { ...system, baseElevation: (system.baseElevation || 0) + 100 } : system,
      ),
    }),
  ],
  [
    'edit the roof',
    (project) => ({
      ...project,
      roofSystems: project.roofSystems.map((roof, index) =>
        index === 0 ? { ...roof, slabThickness: (roof.slabThickness || 150) + 20 } : roof,
      ),
    }),
  ],
  [
    'add a ceiling to the ground floor',
    (project) => {
      const ceiling = createCeilingForProject(project, { floorId: project.floors[0].id });
      return { ...project, ceilings: [...(project.ceilings || []), ceiling] };
    },
  ],
  [
    'move a fixture under the ceiling',
    (project) =>
      mapFloor(project, 0, (floor) => ({
        ...floor,
        fixtures: floor.fixtures.map((fixture, index) => (index === 1 ? { ...fixture, y: fixture.y - 120 } : fixture)),
      })),
  ],
  ['change nothing', (project) => project],
];

const OPTION_SETS = [
  {},
  { assemblyDetail: true },
  ({ project }) => ({ visibleFloorIds: [project.floors[1].id] }),
  ({ project }) => ({
    activeFloorId: project.floors[1].id,
    hiddenWallBoards: { [project.floors[1].walls[1].id]: ['interior'] },
  }),
];

describe('buildPreviewScene descriptor memo', () => {
  it('builds exactly what a fresh build does, through every kind of edit and option', () => {
    let project = demoProject();
    expect(project.floors.length).toBeGreaterThan(1);
    expect(project.trussSystems.length).toBeGreaterThan(0);
    expect(project.roofSystems.length).toBeGreaterThan(0);

    const memo = {};
    let checked = 0;
    for (const [, edit] of EDITS) {
      project = edit(project);
      // The option sets in turn against one memo, as a pane whose scope and
      // switches change between edits would see them.
      for (const optionSet of OPTION_SETS) {
        const options = typeof optionSet === 'function' ? optionSet({ project }) : optionSet;
        expect(buildPreviewScene(project, { ...options, memo })).toEqual(buildPreviewScene(project, options));
        checked += 1;
      }
    }
    expect(checked).toBe(EDITS.length * OPTION_SETS.length);
  });

  it('hands an untouched floor, truss and roof back as the same objects', () => {
    const memo = {};
    const project = demoProject();
    const first = buildPreviewScene(project, { memo });
    const byId = (scene) => new Map(scene.floors.map((floor) => [floor.floorId, floor]));

    // A fixture moved on the ground floor.
    const moved = EDITS[0][1](project);
    const second = buildPreviewScene(moved, { memo });
    const before = byId(first);
    const after = byId(second);
    const [ground, upper] = moved.floors;
    expect(after.get(ground.id).objects).not.toBe(before.get(ground.id).objects);
    expect(after.get(upper.id).objects).toBe(before.get(upper.id).objects);
    expect(after.get(upper.id).sourceKey).toBe(before.get(upper.id).sourceKey);
    expect(after.get(upper.id).bounds).toBe(before.get(upper.id).bounds);
    const roofId = moved.roofSystems[0].id;
    expect(after.get(roofId).objects).toBe(before.get(roofId).objects);

    // The floor carrying the truss is rebuilt when it is edited, but the truss's
    // own objects come back untouched inside it.
    const trussSystemId = moved.trussSystems[0].id;
    const trussFloorIndex = moved.floors.findIndex((floor) => floor.id === moved.trussSystems[0].floorId);
    const trussObjects = memo.trusses.get(trussSystemId).objects;
    expect(trussObjects.length).toBeGreaterThan(0);
    const edited = mapFloor(moved, trussFloorIndex, (floor) => ({
      ...floor,
      walls: floor.walls.map((wall, index) => (index === 0 ? { ...wall, height: wall.height + 10 } : wall)),
    }));
    const third = byId(buildPreviewScene(edited, { memo }));
    const rebuilt = third.get(edited.floors[trussFloorIndex].id);
    expect(rebuilt.objects).not.toBe(after.get(edited.floors[trussFloorIndex].id).objects);
    expect(memo.trusses.get(trussSystemId).objects).toBe(trussObjects);
    // Every one of the truss's descriptors is in the rebuilt floor, as itself.
    const inFloor = new Set(rebuilt.objects);
    expect(trussObjects.every((object) => inFloor.has(object))).toBe(true);
  });

  it('builds nothing again when nothing changed', () => {
    const memo = {};
    const project = demoProject();
    const first = buildPreviewScene(project, { memo });
    const second = buildPreviewScene(project, { memo });
    for (let index = 0; index < first.floors.length; index += 1) {
      expect(second.floors[index].objects).toBe(first.floors[index].objects);
    }
  });

  it('forgets a floor that has gone', () => {
    const memo = {};
    const project = demoProject();
    buildPreviewScene(project, { memo });
    const removed = { ...project, floors: project.floors.slice(0, -1) };
    buildPreviewScene(removed, { memo });
    expect(memo.floors.has(project.floors.at(-1).id)).toBe(false);
  });

  it('changes nothing for a caller that passes no memo', () => {
    const project = demoProject();
    const first = buildPreviewScene(project);
    const second = buildPreviewScene(project);
    expect(second.floors[0].objects).not.toBe(first.floors[0].objects);
    expect(second).toEqual(first);
  });
});
