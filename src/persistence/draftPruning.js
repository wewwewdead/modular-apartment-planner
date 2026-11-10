import { createProject } from '@/domain/models';
import { syncProjectStructures } from '@/domain/projectStateHelpers';
import { deserializeProject } from './deserialize';

/*
 * Which browser drafts may go without asking.
 *
 * In the web app the drafts ARE the projects Open Project lists, often the
 * only copy, so nothing that holds work is ever removed here. Only a draft
 * that holds no user edit at all — the starter project as New Project makes
 * it, apart from its ids, name and timestamps — counts as disposable. That is
 * judged from content, never from age.
 */

// Top-level fields that differ between any two fresh starter projects.
const IGNORED_KEYS = new Set(['id', 'name', 'createdAt', 'updatedAt']);

/*
 * The project with everything that names it rather than describes it taken
 * out: the ignored fields, and its generated ids (the project's and its
 * floors') wherever they appear — the building and its systems derive theirs
 * from the project id.
 */
function canonicalContent(project) {
  const ids = [project.id, ...(project.floors || []).map((floor) => floor.id)].filter(
    (id) => typeof id === 'string' && id,
  );
  const scrub = (value) => {
    if (typeof value === 'string') {
      return ids.reduce((text, id, index) => text.split(id).join(`<id${index}>`), value);
    }
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, scrub(value[key])]),
      );
    }
    return value;
  };
  const top = Object.fromEntries(Object.entries(project).filter(([key]) => !IGNORED_KEYS.has(key)));
  return JSON.stringify(scrub(top));
}

let starterContent = null;
function starterProjectContent() {
  starterContent ??= canonicalContent(syncProjectStructures(createProject()));
  return starterContent;
}

/**
 * True when a stored draft holds nothing a user made: once loaded the way
 * Open Project loads it, it is the starter project. A draft that cannot be
 * read is not a starter — it is not this function's to judge.
 */
export function isStarterDraft(serialized) {
  // A starter has one empty floor; anything else is decided without a load.
  const floors = serialized?.data?.floors;
  if (Array.isArray(floors) && floors.length !== 1) return false;
  try {
    const { project } = deserializeProject(serialized);
    return canonicalContent(syncProjectStructures(project)) === starterProjectContent();
  } catch {
    return false;
  }
}
