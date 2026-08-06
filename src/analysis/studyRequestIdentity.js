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
 */
export function studyRequestKey({ project, projectRevision = null, settings = null, scope = null }) {
  return JSON.stringify({
    projectIdentity: identityOf(project),
    projectRevision,
    settings,
    scope,
  });
}
