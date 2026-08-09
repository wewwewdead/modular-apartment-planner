let nextProjectIdentity = 1;
const projectIdentities = new WeakMap();

function identityOf(project) {
  if (!project || (typeof project !== 'object' && typeof project !== 'function')) return 'none';
  let identity = projectIdentities.get(project);
  if (!identity) {
    identity = nextProjectIdentity;
    nextProjectIdentity += 1;
    projectIdentities.set(project, identity);
  }
  return identity;
}

/**
 * Identity of one worker run, including the exact phase-filtered project
 * object. Settings alone are insufficient: an edit can change the geometry
 * while leaving every analysis control untouched.
 *
 * This is the MAIN-THREAD gate, and it stays identity-based on purpose. The
 * hook needs an answer on every render, and the reducer already gives it a free
 * one: it replaces the project object exactly when the model changes. Hashing
 * the model here instead would pay a full traversal per render to learn what an
 * object comparison already knows.
 */
export function studyRequestKey({ project, projectRevision = null, settings = null, scope = null }) {
  return JSON.stringify({
    projectIdentity: identityOf(project),
    projectRevision,
    settings,
    scope,
  });
}
