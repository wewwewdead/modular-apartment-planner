/**
 * Assembly instructions generator.
 * Analyzes entities with materials and generates numbered build steps.
 * Sorts by dependency order: base/frame first, then panels, then details.
 */

import { getMaterialById } from '../data/materials';
import { recommendJoint } from '../data/joints';

const ROLE_PRIORITY = {
  base: 1,
  frame: 2,
  side: 3,
  shelf: 4,
  back: 5,
  top: 6,
  door: 7,
  trim: 8,
  hardware: 9,
};

function inferPartRole(entity) {
  const label = (entity.meta?.label || '').toLowerCase();
  const type = entity.type;

  if (label.includes('base') || label.includes('bottom')) return 'base';
  if (label.includes('frame') || label.includes('rail')) return 'frame';
  if (label.includes('side')) return 'side';
  if (label.includes('shelf') || label.includes('divider')) return 'shelf';
  if (label.includes('back')) return 'back';
  if (label.includes('top') || label.includes('lid')) return 'top';
  if (label.includes('door') || label.includes('drawer')) return 'door';
  if (label.includes('trim') || label.includes('edge')) return 'trim';

  // Infer from geometry
  if (type === 'rect') {
    const w = Math.abs(entity.width ?? 0);
    const h = Math.abs(entity.height ?? 0);
    const ratio = Math.max(w, h) / (Math.min(w, h) || 1);
    if (ratio > 5) return 'frame'; // long narrow = frame piece
    if (w > 500 && h > 500) return 'side'; // large panel = side/top
  }

  return 'shelf'; // default: middle-priority
}

function getPartDimensions(entity) {
  if (entity.type === 'rect') {
    return {
      width: Math.round(Math.abs(entity.width ?? (entity.x2 - entity.x1) ?? 0)),
      height: Math.round(Math.abs(entity.height ?? (entity.y2 - entity.y1) ?? 0)),
    };
  }
  if (entity.type === 'line') {
    const dx = (entity.x2 ?? 0) - (entity.x1 ?? 0);
    const dy = (entity.y2 ?? 0) - (entity.y1 ?? 0);
    return { width: Math.round(Math.hypot(dx, dy)), height: 0 };
  }
  return { width: 0, height: 0 };
}

export function generateAssemblySteps(entities) {
  // Filter to material-assigned entities only
  const parts = entities
    .filter((e) => e.materialId && ['rect', 'line', 'polyline', 'circle'].includes(e.type))
    .map((e) => {
      const material = getMaterialById(e.materialId);
      const role = inferPartRole(e);
      const dims = getPartDimensions(e);
      const thickness = e.thickness ?? material?.thickness ?? 0;
      const category = material?.category ?? 'lumber';
      const joint = recommendJoint(thickness, category);

      return {
        entityId: e.id,
        partName: e.meta?.label || `${role.charAt(0).toUpperCase() + role.slice(1)} ${e.type}`,
        materialName: material?.name ?? e.materialId,
        role,
        priority: ROLE_PRIORITY[role] ?? 5,
        dimensions: dims,
        thickness,
        category,
        recommendedJoint: joint,
      };
    });

  // Sort by assembly priority
  parts.sort((a, b) => a.priority - b.priority);

  // Generate steps
  const steps = [];
  let stepNum = 1;

  // Step 1: Preparation
  if (parts.length > 0) {
    steps.push({
      number: stepNum++,
      title: 'Prepare Materials',
      description: `Cut all ${parts.length} parts to size according to the cutting list.`,
      type: 'preparation',
      parts: [],
    });
  }

  // Group by role for assembly order
  const byRole = new Map();
  for (const part of parts) {
    if (!byRole.has(part.role)) byRole.set(part.role, []);
    byRole.get(part.role).push(part);
  }

  for (const [role, roleParts] of byRole) {
    const jointName = roleParts[0]?.recommendedJoint?.name ?? 'butt joint';

    steps.push({
      number: stepNum++,
      title: `Attach ${role} piece${roleParts.length > 1 ? 's' : ''}`,
      description: `Attach ${roleParts.length} ${role} part${roleParts.length > 1 ? 's' : ''} using ${jointName}. ${roleParts.map((p) => `${p.partName} (${p.dimensions.width}x${p.dimensions.height}mm, ${p.materialName})`).join('; ')}.`,
      type: 'assembly',
      parts: roleParts.map((p) => p.entityId),
      joint: roleParts[0]?.recommendedJoint?.id,
    });
  }

  // Final step
  if (parts.length > 0) {
    steps.push({
      number: stepNum++,
      title: 'Finish',
      description: 'Sand all surfaces (120 → 220 grit). Apply finish as desired. Allow to dry before use.',
      type: 'finishing',
      parts: [],
    });
  }

  return {
    steps,
    totalParts: parts.length,
    estimatedTime: `${Math.max(1, Math.ceil(parts.length * 0.5))} hours`,
  };
}

export function exportAssemblyToText(assembly) {
  const lines = [
    'ASSEMBLY INSTRUCTIONS',
    `Total parts: ${assembly.totalParts}`,
    `Estimated time: ${assembly.estimatedTime}`,
    '',
    ...assembly.steps.map((step) =>
      `Step ${step.number}: ${step.title}\n  ${step.description}`
    ),
  ];
  return lines.join('\n');
}
