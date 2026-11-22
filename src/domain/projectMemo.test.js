import { beforeEach, describe, expect, it } from 'vitest';
import { memoizePerProject, projectMemoComputeCount, resetProjectMemoComputeCounts } from './projectMemo';

function sampleProject() {
  return {
    id: 'p',
    building: { id: 'b', site: { boundary: [] }, quantityProfile: { scenarios: [] } },
    floors: [
      { id: 'f1', walls: [{ id: 'w1' }, { id: 'w2' }], fixtures: [] },
      { id: 'f2', walls: [], fixtures: [{ id: 'x1' }] },
    ],
    roofSystems: [],
  };
}

describe('memoizePerProject', () => {
  let calls;
  let derive;

  beforeEach(() => {
    resetProjectMemoComputeCounts();
    calls = [];
    derive = memoizePerProject('test', (project, key) => {
      calls.push(key);
      return { key, wallCount: project.floors.flatMap((floor) => floor.walls).length };
    });
  });

  it('derives once per project object and hands every caller the same answer', () => {
    const project = sampleProject();
    const first = derive(project);
    expect(derive(project)).toBe(first);
    expect(derive(project, null)).toBe(first);
    expect(calls).toEqual([null]);
    expect(projectMemoComputeCount('test')).toBe(1);
  });

  it('keeps one answer per key within a project', () => {
    const project = sampleProject();
    const a = derive(project, 'scenario_a');
    const b = derive(project, 'scenario_b');
    expect(a).not.toBe(b);
    expect(derive(project, 'scenario_a')).toBe(a);
    expect(calls).toEqual(['scenario_a', 'scenario_b']);
  });

  it('derives afresh for another project object, even an equal one', () => {
    const project = sampleProject();
    const first = derive(project);
    const copy = { ...project };
    const second = derive(copy);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('sees a slice, a storey collection or a single entity swapped in place', () => {
    const project = sampleProject();
    const first = derive(project);

    project.building.site = { boundary: [{ x: 0, y: 0 }] };
    const afterSlice = derive(project);
    expect(afterSlice).not.toBe(first);

    project.floors[1].walls = [{ id: 'w3' }];
    const afterCollection = derive(project);
    expect(afterCollection).not.toBe(afterSlice);
    expect(afterCollection.wallCount).toBe(3);

    project.floors[0].walls[0] = { id: 'w1', thickness: 200 };
    const afterEntity = derive(project);
    expect(afterEntity).not.toBe(afterCollection);

    project.floors.push({ id: 'f3', walls: [{ id: 'w4' }] });
    expect(derive(project).wallCount).toBe(4);
    expect(projectMemoComputeCount('test')).toBe(5);
  });

  it('passes anything that is not a project object straight through', () => {
    const passthrough = memoizePerProject('passthrough', (project) => ({ project }));
    expect(passthrough(null)).toEqual({ project: null });
    expect(passthrough(null)).not.toBe(passthrough(null));
    expect(projectMemoComputeCount('passthrough')).toBe(0);
  });
});
