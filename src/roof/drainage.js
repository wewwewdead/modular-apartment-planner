import { midpoint } from '@/geometry/point';
import { buildRoofBoundaryEdges } from '@/geometry/roofPlanGeometry';

function gutterRoleMatches(roofType, role) {
  switch (roofType) {
    case 'shed':
      return role === 'low_eave';
    case 'gable':
      return role === 'eave';
    case 'custom':
      return role === 'eave';
    case 'flat':
    default:
      return false;
  }
}

export function buildDerivedRoofDrainage(roofSystem) {
  const roofType = roofSystem?.roofType || 'flat';
  const gutters = buildRoofBoundaryEdges(roofSystem)
    .filter((edge) => gutterRoleMatches(roofType, edge.parapetPlacement?.role))
    .map((edge) => ({
      id: `derived-gutter-${edge.index}`,
      label: edge.parapetPlacement?.label || `Roof Edge ${edge.index + 1}`,
      role: edge.parapetPlacement?.role || 'edge',
      length: edge.length,
      start: edge.start,
      end: edge.end,
      center: midpoint(edge.start, edge.end),
      derived: true,
    }));

  const downspouts = gutters.map((gutter) => ({
    id: `${gutter.id}-downspout`,
    gutterId: gutter.id,
    label: `DP ${gutters.findIndex((entry) => entry.id === gutter.id) + 1}`,
    position: gutter.center,
    derived: true,
  }));

  return {
    gutters,
    downspouts,
  };
}
