import { createContext, useContext, useMemo } from 'react';
import { useFloorplanContext } from './FloorplanContext';
import { useWindStudy as useWindStudyWorker } from '../hooks/useWindStudy';
import { useSiteWindClimate } from '../hooks/useSiteWindClimate';

const WindStudyContext = createContext(null);

export function WindStudyProvider({ children }) {
  const { state, selectors, dispatch } = useFloorplanContext();
  const project = selectors.filteredProject;
  const windStudy = state.editor.windStudy;
  const climate = useSiteWindClimate({ site: project?.building?.site, windStudy, dispatch });
  const projectRevision = `${state.changeVersion}|${state.editor.activePhaseId || ''}|${state.editor.phaseViewMode || ''}`;
  // What the filtered project was filtered BY, travelling with it. Memoised on
  // its own two fields so an unrelated re-render cannot hand the hook a fresh
  // payload identity and restart a run that nothing has invalidated.
  const activePhaseId = state.editor.activePhaseId;
  const phaseViewMode = state.editor.phaseViewMode;
  const phaseScope = useMemo(() => ({ activePhaseId, phaseViewMode }), [activePhaseId, phaseViewMode]);
  // Avoid solving the illustrative rose while its location-backed replacement
  // is still loading. A failed request releases the labelled fallback.
  const blockForClimate = climate.autoRequired && climate.status !== 'error';
  const workerSettings = blockForClimate ? { ...windStudy, enabled: false } : windStudy;
  const worker = useWindStudyWorker({ project, windStudy: workerSettings, projectRevision, phaseScope });
  const value = useMemo(
    () => ({
      settings: windStudy,
      study: worker.study,
      status: worker.status,
      progress: worker.progress,
      error: worker.error,
      stale: worker.stale,
      climate,
    }),
    [climate, windStudy, worker.error, worker.progress, worker.stale, worker.status, worker.study],
  );
  return <WindStudyContext.Provider value={value}>{children}</WindStudyContext.Provider>;
}

export function useWindStudy() {
  return (
    useContext(WindStudyContext) || {
      settings: null,
      study: null,
      status: 'idle',
      progress: null,
      error: null,
      stale: false,
      climate: null,
    }
  );
}
