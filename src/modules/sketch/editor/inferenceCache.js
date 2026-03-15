/**
 * Simple memoization cache for inference points.
 * Recomputes only when the parts array reference changes (React immutability).
 */

import { collectInferencePoints } from './inferenceEngine';

/**
 * @returns {{ getPoints: (parts: Array, excludePartId?: string) => InferencePoint[], invalidate: () => void }}
 */
export function createInferenceCache() {
  let cachedParts = null;
  let cachedAnnotations = null;
  let cachedExcludeId = null;
  let cachedPoints = null;

  return {
    /**
     * Get inference points, recomputing only if parts ref or excludePartId changed.
     */
    getPoints(parts, annotations = [], excludePartId = null) {
      if (
        parts === cachedParts
        && annotations === cachedAnnotations
        && excludePartId === cachedExcludeId
        && cachedPoints
      ) {
        return cachedPoints;
      }
      cachedParts = parts;
      cachedAnnotations = annotations;
      cachedExcludeId = excludePartId;
      cachedPoints = collectInferencePoints(parts, { excludePartId, annotations });
      return cachedPoints;
    },

    /**
     * Force recomputation on next call.
     */
    invalidate() {
      cachedParts = null;
      cachedAnnotations = null;
      cachedExcludeId = null;
      cachedPoints = null;
    },
  };
}
