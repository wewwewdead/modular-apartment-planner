import { useMemo } from 'react';
import { filterFloorByPhase } from '@/domain/phaseFilter';

export function usePhaseFilteredFloor(floor, project, activePhaseId, phaseViewMode) {
  return useMemo(
    () => filterFloorByPhase(floor, project?.phases || [], activePhaseId, phaseViewMode),
    [floor, project?.phases, activePhaseId, phaseViewMode]
  );
}
