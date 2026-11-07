import { describe, expect, it } from 'vitest';
import envelope from '../../scripts/fixtures/bench-ceiling-project.json';
import { deserializeProject } from '@/persistence/deserialize';
import { buildProjectSectionScene } from '@/sections/scene';
import {
  createSectionVisibilityJob,
  getVisibleSectionDrawables,
  peekVisibleSectionDrawables,
} from '@/sections/visibility';
import { getProjectSectionScene } from '@/sections/sectionSceneCache';
import { buildProjectElevationScene } from './scene';
import { getProjectElevationScene } from './elevationSceneCache';
import {
  createElevationVisibilityJob,
  getVisibleElevationDrawables,
  peekVisibleElevationDrawables,
} from './visibility';

/**
 * The section and elevation views run their hidden-line pass as a job, in
 * slices between frames (docs/night-section-freezes.md §4.3.2). Two promises
 * are pinned here on the bench fixture — a real three-storey project whose
 * first section took over a second on the main thread:
 *
 *  1. Determinism. A job stopped after every single drawable produces exactly
 *     what the synchronous pass produces: same drawables, same order, same
 *     regions. The drawing on screen is the drawing on the sheet.
 *  2. Slices stay small. No single drawable costs anywhere near a frame
 *     budget's worth of blocking, so slicing between drawables is enough to
 *     keep the page drawing — and the whole pass stays well inside the 1.5 s
 *     the view allows.
 *
 * Thresholds follow analysis/sunStudyPerformance.test.js: about an order of
 * magnitude above what a developer machine measures (largest drawable 65 ms,
 * whole first-floor section 2.1 s under vitest, both about half that in
 * Chrome), so they catch a return to seconds rather than police milliseconds.
 */

const project = deserializeProject(envelope).project;
const floor = project.floors[0];
const cut = floor.sectionCuts[0];

/** Runs a job one drawable at a time, recording each step's cost. */
function runInSmallestSlices(job) {
  const steps = [];
  for (;;) {
    const startedAt = performance.now();
    const progress = job.step(0);
    steps.push(performance.now() - startedAt);
    if (progress.done) return steps;
  }
}

const plain = (value) => JSON.parse(JSON.stringify(value));

describe('visibility job', () => {
  it('slices the section pass without changing its result', () => {
    const sliced = createSectionVisibilityJob(buildProjectSectionScene(project, floor.id, cut.id));
    const steps = runInSmallestSlices(sliced);
    const synchronous = getVisibleSectionDrawables(buildProjectSectionScene(project, floor.id, cut.id));

    expect(steps.length).toBeGreaterThan(100);
    expect(sliced.result.length).toBe(synchronous.length);
    expect(plain(sliced.result)).toEqual(plain(synchronous));
  }, 60000);

  it('slices an elevation pass without changing its result', () => {
    const sliced = createElevationVisibilityJob(buildProjectElevationScene(project, floor.id, 'elevation_front'));
    runInSmallestSlices(sliced);
    const synchronous = getVisibleElevationDrawables(buildProjectElevationScene(project, floor.id, 'elevation_front'));

    expect(plain(sliced.result)).toEqual(plain(synchronous));
  }, 60000);

  it('keeps every drawable well under a frame-gap budget, and the whole section inside seconds', () => {
    const scene = buildProjectSectionScene(project, floor.id, cut.id);
    const startedAt = performance.now();
    const steps = runInSmallestSlices(createSectionVisibilityJob(scene));
    const total = performance.now() - startedAt;

    expect(Math.max(...steps)).toBeLessThan(600);
    expect(total).toBeLessThan(20000);
  }, 60000);

  it('honours its budget: each step does at least one drawable and stops soon after the budget', () => {
    const job = createElevationVisibilityJob(buildProjectElevationScene(project, floor.id, 'elevation_left'));
    const first = job.step(0);
    expect(first.done).toBe(false);
    expect(first.resolved).toBe(1);
    const second = job.step(5);
    expect(second.resolved).toBeGreaterThan(first.resolved);
    while (!job.step(5).done);
    expect(job.result.length).toBeGreaterThan(0);
  }, 60000);

  it('caches the finished result on the scene, where the synchronous readers find it', () => {
    const scene = buildProjectSectionScene(project, floor.id, cut.id);
    expect(peekVisibleSectionDrawables(scene)).toBeUndefined();
    const job = createSectionVisibilityJob(scene);
    job.step(Infinity);
    expect(peekVisibleSectionDrawables(scene)).toBe(job.result);
    expect(getVisibleSectionDrawables(scene)).toBe(job.result);

    const elevation = buildProjectElevationScene(project, floor.id, 'elevation_rear');
    expect(peekVisibleElevationDrawables(elevation)).toBeUndefined();
    expect(getVisibleElevationDrawables(elevation)).toBe(peekVisibleElevationDrawables(elevation));
  }, 60000);
});

describe('project-keyed scene caches', () => {
  it('hands every reader of one project the same section scene, and a new project a new one', () => {
    const scene = getProjectSectionScene(project, floor.id, cut.id);
    expect(getProjectSectionScene(project, floor.id, cut.id)).toBe(scene);
    expect(getProjectSectionScene(project, floor.id, floor.sectionCuts[1].id)).not.toBe(scene);
    const edited = { ...project };
    expect(getProjectSectionScene(edited, floor.id, cut.id)).not.toBe(scene);
  });

  it('does the same for elevation scenes, per view', () => {
    const front = getProjectElevationScene(project, floor.id, 'elevation_front');
    expect(getProjectElevationScene(project, floor.id, 'elevation_front')).toBe(front);
    expect(getProjectElevationScene(project, floor.id, 'elevation_left')).not.toBe(front);
  });
});
