import { buildProjectSectionScene } from './scene';

/*
 * One section scene per (project, floor, cut).
 *
 * `buildProjectSectionScene` is pure, and a project is never mutated in place,
 * so the scene for a given project object is the same scene every time it is
 * asked for. Sharing it is what makes the expensive part free on the second
 * ask: the visibility pass caches its result on the scene object
 * (`sections/visibility.js`), so a scene that is rebuilt is a scene whose
 * hidden-line work is thrown away. Before this the plan canvas built the same
 * scene twice in one commit (its diagnostics and the renderer), and leaving the
 * section view and coming back paid the whole visibility pass again.
 *
 * Weakly keyed on the project, so a superseded project and every scene built
 * from it are collected together.
 */
const scenesByProject = new WeakMap();

export function getProjectSectionScene(project, sourceFloorId, sectionCutId = null) {
  if (!project || typeof project !== 'object') return buildProjectSectionScene(project, sourceFloorId, sectionCutId);
  let scenes = scenesByProject.get(project);
  if (!scenes) {
    scenes = new Map();
    scenesByProject.set(project, scenes);
  }
  const key = `${sourceFloorId ?? ''}\u0000${sectionCutId ?? ''}`;
  if (!scenes.has(key)) scenes.set(key, buildProjectSectionScene(project, sourceFloorId, sectionCutId));
  return scenes.get(key);
}
