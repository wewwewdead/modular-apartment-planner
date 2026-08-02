/**
 * Assembly instructions generator.
 * Analyzes entities with materials and generates numbered build steps.
 * Sorts by dependency order: base/frame first, then panels, then details.
 */

import { getMaterialById } from '../data/materials';
import { recommendJoint } from '../../joinery/jointRecommendation';
import { entitiesToBomRows, isHardwareBomRow } from './entityBomAdapter';
import { groupBomRows } from '../../utils/bomUtils';

// Roles `inferPartRole` can return. Hardware is not one of them: fasteners are
// not cut parts, so they get their own steps rather than a place in this order.
const ROLE_PRIORITY = {
  base: 1,
  frame: 2,
  side: 3,
  shelf: 4,
  back: 5,
  top: 6,
  door: 7,
  trim: 8,
};

const TIMES_SIGN = '×';

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
      width: Math.round(Math.abs(entity.width ?? (entity.x2 ?? 0) - (entity.x1 ?? 0))),
      height: Math.round(Math.abs(entity.height ?? (entity.y2 ?? 0) - (entity.y1 ?? 0))),
    };
  }
  if (entity.type === 'line') {
    const dx = (entity.x2 ?? 0) - (entity.x1 ?? 0);
    const dy = (entity.y2 ?? 0) - (entity.y1 ?? 0);
    return { width: Math.round(Math.hypot(dx, dy)), height: 0 };
  }
  return { width: 0, height: 0 };
}

/**
 * One row per physical fastener, counted by the BOM adapter so a joinery screw
 * drilled from both sides bills once - exactly the numbers the cutting list
 * shows. Rows stay ungrouped here because each one still points back (via
 * `partId`) at the feature that placed it, which is what per-step attribution
 * needs. Passing no catalog lets the adapter fall back to the hardware catalog.
 */
function collectHardwareRows(entities) {
  return entitiesToBomRows(entities, null).filter(isHardwareBomRow);
}

function summarizeHardware(rows) {
  return groupBomRows(rows).map((row) => ({
    hardwareId: row.hardwareId ?? row.material ?? null,
    name: row.materialName ?? row.material ?? 'Hardware',
    kind: row.fastenerKind ?? null,
    quantity: row.quantity || 1,
  }));
}

function formatHardwareList(items) {
  return items.map((item) => `${item.quantity}${TIMES_SIGN} ${item.name}`).join(', ');
}

/**
 * Splits fastener rows into the parts they fasten and the ones that float. Both
 * user-placed fasteners and joinery-generated holes carry `targetPartId` (the
 * part the hole is cut into), so joinery hardware lands on its part's step too.
 * Anything targeting a part with no assembly step falls through to the general
 * hardware step rather than disappearing.
 */
function attributeHardwareToParts(entities, hardwareRows, partIds) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const byPartId = new Map();
  const unattached = [];

  for (const row of hardwareRows) {
    const targetPartId = entityById.get(row.partId)?.targetPartId ?? null;

    if (targetPartId && partIds.has(targetPartId)) {
      const rows = byPartId.get(targetPartId) ?? [];
      rows.push(row);
      byPartId.set(targetPartId, rows);
      continue;
    }

    unattached.push(row);
  }

  return { byPartId, unattached };
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

  const hardwareRows = collectHardwareRows(entities);
  const hardware = summarizeHardware(hardwareRows);
  const hardwareByPart = attributeHardwareToParts(entities, hardwareRows, new Set(parts.map((part) => part.entityId)));

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

  if (hardware.length > 0) {
    steps.push({
      number: stepNum++,
      title: 'Hardware needed',
      description: `Gather the fasteners before assembly: ${formatHardwareList(hardware)}.`,
      type: 'hardware',
      parts: [],
      hardware,
    });
  }

  // Group by role for assembly order
  const byRole = new Map();
  for (const part of parts) {
    if (!byRole.has(part.role)) byRole.set(part.role, []);
    byRole.get(part.role).push(part);
  }

  for (const [role, roleParts] of byRole) {
    const jointName = roleParts[0]?.recommendedJoint?.label ?? 'butt joint';
    const stepHardware = summarizeHardware(
      roleParts.flatMap((part) => hardwareByPart.byPartId.get(part.entityId) ?? []),
    );
    const fastenerSentence = stepHardware.length ? ` Attach with ${formatHardwareList(stepHardware)}.` : '';

    steps.push({
      number: stepNum++,
      title: `Attach ${role} piece${roleParts.length > 1 ? 's' : ''}`,
      description: `Attach ${roleParts.length} ${role} part${roleParts.length > 1 ? 's' : ''} using ${jointName}. ${roleParts.map((p) => `${p.partName} (${p.dimensions.width}x${p.dimensions.height}mm, ${p.materialName})`).join('; ')}.${fastenerSentence}`,
      type: 'assembly',
      parts: roleParts.map((p) => p.entityId),
      joint: roleParts[0]?.recommendedJoint?.type,
      ...(stepHardware.length ? { hardware: stepHardware } : {}),
    });
  }

  // Fasteners that were never placed on a part (or whose part has no step of its
  // own) still have to be installed, so they get one collecting step.
  if (hardwareByPart.unattached.length > 0) {
    const unattachedHardware = summarizeHardware(hardwareByPart.unattached);

    steps.push({
      number: stepNum++,
      title: 'Install remaining hardware',
      description: `Install the fasteners that are not tied to a single part: ${formatHardwareList(unattachedHardware)}.`,
      type: 'hardware',
      parts: [],
      hardware: unattachedHardware,
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
    hardware,
    totalParts: parts.length,
    totalHardware: hardware.reduce((sum, item) => sum + item.quantity, 0),
    estimatedTime: `${Math.max(1, Math.ceil(parts.length * 0.5))} hours`,
  };
}

export function exportAssemblyToText(assembly) {
  const hardware = assembly.hardware ?? [];
  const lines = [
    'ASSEMBLY INSTRUCTIONS',
    `Total parts: ${assembly.totalParts}`,
    `Estimated time: ${assembly.estimatedTime}`,
    '',
    ...(hardware.length
      ? ['HARDWARE NEEDED', ...hardware.map((item) => `  ${item.quantity}${TIMES_SIGN} ${item.name}`), '']
      : []),
    ...assembly.steps.map((step) => `Step ${step.number}: ${step.title}\n  ${step.description}`),
  ];
  return lines.join('\n');
}
