/**
 * Joint type catalog for Craftsman Studio.
 * Each joint type defines geometry parameters and recommendations.
 */

const joints = [
  {
    id: 'finger',
    name: 'Finger Joint (Box Joint)',
    description: 'Interlocking rectangular fingers. Strong, CNC-friendly.',
    minThickness: 6,
    maxThickness: 50,
    defaultFingerWidth: null, // auto-calculated from thickness
    fingerWidthFactor: 0.5, // fingerWidth = thickness * factor
    strength: 'high',
    difficulty: 'medium',
    cncFriendly: true,
    materials: ['plywood', 'mdf', 'lumber'],
    icon: '┤├',
  },
  {
    id: 'dovetail',
    name: 'Dovetail Joint',
    description: 'Tapered interlocking pins. Very strong, traditional.',
    minThickness: 12,
    maxThickness: 50,
    tailAngle: 14, // degrees (1:4 ratio for softwood)
    pinRatio: 0.5,
    strength: 'very-high',
    difficulty: 'hard',
    cncFriendly: true,
    materials: ['lumber'],
    icon: '◁▷',
  },
  {
    id: 'pocket-hole',
    name: 'Pocket Hole',
    description: 'Angled screw joint. Fast assembly, hidden hardware.',
    minThickness: 12,
    maxThickness: 38,
    screwAngle: 15, // degrees
    holeDepth: null, // calculated from thickness
    strength: 'medium',
    difficulty: 'easy',
    cncFriendly: false,
    materials: ['plywood', 'mdf', 'lumber'],
    icon: '⟋⟍',
  },
  {
    id: 'biscuit',
    name: 'Biscuit Joint',
    description: 'Compressed wood biscuit in matching slots. Good alignment.',
    minThickness: 12,
    maxThickness: 50,
    biscuitSizes: { '0': { width: 47, height: 15 }, '10': { width: 53, height: 19 }, '20': { width: 56, height: 23 } },
    slotDepth: 12,
    strength: 'medium',
    difficulty: 'easy',
    cncFriendly: true,
    materials: ['plywood', 'mdf', 'lumber'],
    icon: '( )',
  },
  {
    id: 'rabbet',
    name: 'Rabbet (Rebate)',
    description: 'L-shaped step cut along edge. Simple, good for backs/bottoms.',
    minThickness: 6,
    maxThickness: 50,
    depthFactor: 0.5, // rabbet depth = joining piece thickness * factor
    widthFactor: 0.67, // rabbet width = material thickness * factor
    strength: 'medium',
    difficulty: 'easy',
    cncFriendly: true,
    materials: ['plywood', 'mdf', 'lumber'],
    icon: '└─',
  },
  {
    id: 'dado',
    name: 'Dado (Housing)',
    description: 'Channel cut across the grain. Great for shelves.',
    minThickness: 6,
    maxThickness: 50,
    depthFactor: 0.33, // dado depth = material thickness * factor
    strength: 'medium-high',
    difficulty: 'easy',
    cncFriendly: true,
    materials: ['plywood', 'mdf', 'lumber'],
    icon: '═╪═',
  },
  {
    id: 'butt',
    name: 'Butt Joint',
    description: 'Simple end-to-end or edge-to-face. Weakest but simplest.',
    minThickness: 3,
    maxThickness: 100,
    strength: 'low',
    difficulty: 'easy',
    cncFriendly: false,
    materials: ['plywood', 'mdf', 'lumber', 'metal', 'acrylic'],
    icon: '│─',
  },
];

export function getJointById(id) {
  return joints.find((j) => j.id === id) ?? null;
}

export function getJointsForConnection(thickness, materialCategory) {
  return joints.filter((j) => {
    if (thickness < j.minThickness || thickness > j.maxThickness) return false;
    if (j.materials && !j.materials.includes(materialCategory)) return false;
    return true;
  }).sort((a, b) => {
    const strengthOrder = { 'very-high': 4, 'high': 3, 'medium-high': 2.5, 'medium': 2, 'low': 1 };
    return (strengthOrder[b.strength] || 0) - (strengthOrder[a.strength] || 0);
  });
}

export function recommendJoint(thickness, materialCategory, connectionType = 'edge-to-face') {
  const candidates = getJointsForConnection(thickness, materialCategory);
  if (!candidates.length) return null;

  // Prefer finger for edge-to-edge, dado for shelf-in-side, rabbet for back panels
  if (connectionType === 'edge-to-edge') return candidates.find((j) => j.id === 'finger') ?? candidates[0];
  if (connectionType === 'shelf') return candidates.find((j) => j.id === 'dado') ?? candidates[0];
  if (connectionType === 'back-panel') return candidates.find((j) => j.id === 'rabbet') ?? candidates[0];

  return candidates[0];
}

export function computeFingerJointParams(thickness, boardLength) {
  const fingerWidth = Math.round(thickness * 0.5);
  const fingerCount = Math.floor(boardLength / fingerWidth);
  const adjustedCount = fingerCount % 2 === 0 ? fingerCount - 1 : fingerCount; // odd count for proper interlock
  const adjustedWidth = boardLength / adjustedCount;

  return {
    fingerWidth: Math.round(adjustedWidth * 100) / 100,
    fingerCount: adjustedCount,
    fingerDepth: thickness,
    totalLength: boardLength,
  };
}

export default joints;
