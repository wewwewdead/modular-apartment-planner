import { generateId } from './ids';

export const PHASE_COLORS = [
  '#4A90D9', '#E07B39', '#5BAE5B', '#C75D8E',
  '#8B6EC1', '#D4A843', '#44B4B4', '#D05555',
];

function getPhaseColor(entry, index) {
  if (entry?.color) return entry.color;
  const colorIndex = entry?.colorIndex ?? index;
  return PHASE_COLORS[colorIndex % PHASE_COLORS.length];
}

export function createPhase(name, order, color = PHASE_COLORS[0]) {
  return {
    id: generateId('phase'),
    name,
    order,
    color,
    visible: true,
  };
}

export function sortPhases(phases) {
  return [...phases].sort((a, b) => a.order - b.order);
}

export function getOrderedPhases(project) {
  return sortPhases(project.phases || []);
}

export function getNextPhaseOrder(phases) {
  if (!phases || phases.length === 0) return 0;
  return Math.max(...phases.map(p => p.order)) + 1;
}

export function reorderPhases(phases, movedId, newOrder) {
  const sorted = sortPhases(phases);
  const moved = sorted.find(p => p.id === movedId);
  if (!moved) return sorted;

  const others = sorted.filter(p => p.id !== movedId);
  const clamped = Math.max(0, Math.min(newOrder, others.length));
  others.splice(clamped, 0, moved);

  return others.map((p, i) => ({ ...p, order: i }));
}

export function normalizePhases(phases = []) {
  const normalized = (Array.isArray(phases) ? phases : []).map((phase, index) => ({
    id: phase?.id || generateId('phase'),
    name: phase?.name || `Phase ${index + 1}`,
    order: typeof phase?.order === 'number' ? phase.order : index,
    color: getPhaseColor(phase, index),
    visible: phase?.visible !== false,
  }));

  return sortPhases(normalized).map((phase, index) => ({ ...phase, order: index }));
}
