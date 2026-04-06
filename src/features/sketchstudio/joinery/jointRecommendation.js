import { getAllJointTypes } from './jointRegistry';

const STRENGTH_ORDER = {
  'very-high': 4,
  high: 3,
  'medium-high': 2.5,
  medium: 2,
  low: 1,
};

/**
 * Filter registry entries to those compatible with the given thickness and material category.
 */
export function getJointsForConnection(thickness, materialCategory) {
  return getAllJointTypes()
    .filter((entry) => {
      if (thickness < (entry.minThickness || 0)) return false;
      if (entry.materials && entry.materials.length && !entry.materials.includes(materialCategory)) return false;
      return true;
    })
    .sort((a, b) => (STRENGTH_ORDER[b.strength] || 0) - (STRENGTH_ORDER[a.strength] || 0));
}

/**
 * Recommend a single joint type for a given connection.
 * Returns a registry entry with `type` (id) and `label` (display name), or null.
 */
export function recommendJoint(thickness, materialCategory, connectionType = 'edge-to-face') {
  const candidates = getJointsForConnection(thickness, materialCategory);
  if (!candidates.length) return null;

  if (connectionType === 'edge-to-edge') return candidates.find((j) => j.type === 'tab_slot') ?? candidates[0];
  if (connectionType === 'shelf') return candidates.find((j) => j.type === 'dado') ?? candidates[0];
  if (connectionType === 'back-panel') return candidates.find((j) => j.type === 'rabbet') ?? candidates[0];

  return candidates[0];
}
