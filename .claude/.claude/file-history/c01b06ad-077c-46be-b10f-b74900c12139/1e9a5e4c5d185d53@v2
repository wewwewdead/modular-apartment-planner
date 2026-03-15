/**
 * Backend contract — any storage backend must implement these four async methods:
 *
 *   save(projectId: string, name: string, serialized: object) => Promise<void>
 *   load(projectId: string) => Promise<object | null>
 *   list() => Promise<Array<{ id, name, savedAt }>>
 *   delete(projectId: string) => Promise<void>
 */

const REQUIRED_METHODS = ['save', 'load', 'list', 'delete'];

export function validateBackend(backend) {
  if (!backend || typeof backend !== 'object') {
    throw new Error('Backend must be a non-null object');
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof backend[method] !== 'function') {
      throw new Error(`Backend is missing required method: ${method}`);
    }
  }
  return backend;
}
