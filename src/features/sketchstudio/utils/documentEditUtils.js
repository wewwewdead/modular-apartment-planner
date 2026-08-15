import { pruneDocumentJointsByEntityIds } from '../joinery/jointReducerHelpers';
import { normalizeEntityGroupMemberships } from './groupUtils';

/**
 * Referential clean-up for edits that REPLACE entities (trim, and anything else
 * that deletes an id and hands back new ones).
 *
 * - Joints that referenced a removed entity are dropped: a joint between two
 *   parts is meaningless once a part no longer exists.
 * - Group membership is re-normalised, so a group left with a single survivor
 *   loses its group id instead of lingering as a group of one.
 *
 * DIMENSION SOURCE REFS are deliberately left alone. A dimension's
 * `meta.sourceRefs` are POSITIONAL SLOTS: a slot whose entity is gone resolves
 * to null at read time and the dimension falls back to its stored points. Never
 * filter, reorder, or compact those slots.
 */
export function pruneDocumentAfterEntityRemoval(document, nextEntities, removedEntityIds = []) {
  return pruneDocumentJointsByEntityIds(
    {
      ...document,
      entities: normalizeEntityGroupMemberships(nextEntities),
    },
    removedEntityIds,
  );
}
