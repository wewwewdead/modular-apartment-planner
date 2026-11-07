import { buildProjectElevationScene } from './scene';

/*
 * One elevation scene per (project, floor, view) — the elevation twin of
 * `sections/sectionSceneCache.js`, for the same reason: the visibility pass
 * caches its result on the scene object, so handing every reader the same
 * scene is what lets the renderer, a re-entry into the view and every click of
 * the elevation select handler share one hidden-line pass instead of each
 * paying for their own.
 */
const scenesByProject = new WeakMap();

export function getProjectElevationScene(project, sourceFloorId, viewMode) {
  if (!project || typeof project !== 'object') return buildProjectElevationScene(project, sourceFloorId, viewMode);
  let scenes = scenesByProject.get(project);
  if (!scenes) {
    scenes = new Map();
    scenesByProject.set(project, scenes);
  }
  const key = `${sourceFloorId ?? ''}\u0000${viewMode ?? ''}`;
  if (!scenes.has(key)) scenes.set(key, buildProjectElevationScene(project, sourceFloorId, viewMode));
  return scenes.get(key);
}
