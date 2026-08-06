import { createContext, useContext, useDeferredValue, useMemo } from 'react';
import { computeDaylightStudy } from '@/analysis/daylightRunner';
import { useFloorplanContext } from './FloorplanContext';
import { useDaylightGrid } from '../hooks/useDaylightGrid';
import { useSolarAccess } from '../hooks/useSolarAccess';
import { computeDayStudy, computeInstantShadow } from '@/analysis/sunStudyRunner';

/**
 * The environmental studies that cost enough to be worth computing once:
 * daylight, and solar access. Shared by the panels that read them and the
 * overlays that draw them.
 *
 * Without this both would compute their own, which is merely wasteful for the
 * analytic study and unacceptable for the grid: two workers would run the same
 * few hundred thousand rays and race each other to finish.
 *
 * Sits inside `FloorplanProvider` so it can read the phase-filtered project —
 * a wall hidden by a phase filter must stop obstructing windows at exactly the
 * moment it stops drawing, or the study describes a building nobody is looking
 * at.
 */

const DaylightStudyContext = createContext(null);

export function DaylightStudyProvider({ children }) {
  const { state, selectors } = useFloorplanContext();
  const daylight = state.editor.daylight;
  const floorId = state.editor.activeFloorId;
  const project = selectors.filteredProject;
  const projectRevision = `${state.changeVersion}|${state.editor.activePhaseId || ''}|${state.editor.phaseViewMode || ''}`;
  const sunStudy = state.editor.sunStudy;
  const {
    enabled: sunEnabled,
    mode: sunMode,
    date: sunDate,
    stepMinutes: sunStepMinutes,
    gridCellSize: sunGridCellSize,
    thresholdHours: sunThresholdHours,
    targetId: sunTargetId,
  } = sunStudy || {};

  const sunDayInput = useMemo(
    () =>
      sunEnabled
        ? {
            project,
            sunStudy: {
              enabled: sunEnabled,
              mode: sunMode,
              date: sunDate,
              stepMinutes: sunStepMinutes,
              gridCellSize: sunGridCellSize,
              thresholdHours: sunThresholdHours,
              targetId: sunTargetId,
            },
          }
        : null,
    [project, sunDate, sunEnabled, sunGridCellSize, sunMode, sunStepMinutes, sunTargetId, sunThresholdHours],
  );
  const deferredSunDayInput = useDeferredValue(sunDayInput);
  const sunDay = useMemo(
    () => (deferredSunDayInput ? computeDayStudy(deferredSunDayInput) : null),
    [deferredSunDayInput],
  );
  const computedSunStudy = useMemo(
    () => (sunDay ? { ...sunDay, ...computeInstantShadow({ day: sunDay, sunStudy }) } : null),
    [sunDay, sunStudy],
  );

  const input = useMemo(
    () => (daylight?.enabled ? { project, daylight, floorId } : null),
    [daylight, floorId, project],
  );

  /*
   * Deferring the *input* rather than the settings is the same shape the sun
   * study settled on. Wrapping the dispatch in a transition instead would defer
   * the setting itself, and since the mode button's pressed state is derived
   * from that setting the button would wait for the canvas — which is the lag
   * this is meant to remove.
   */
  const deferredInput = useDeferredValue(input);
  const averageStudy = useMemo(() => (deferredInput ? computeDaylightStudy(deferredInput) : null), [deferredInput]);

  const grid = useDaylightGrid({ project, daylight, floorId, projectRevision });

  /*
   * The solar access study lives here too. It is a different question — direct
   * sun on the building's own skin, rather than diffuse light inside it — but
   * it has the same two consumers, the sidebar panel and the canvas overlay,
   * and the same reason for not being computed twice: its worker run costs
   * seconds, and two of them would race.
   */
  const solar = useSolarAccess({ project, solarAccess: state.editor.solarAccess, projectRevision });

  const value = useMemo(() => {
    const inGridMode = daylight?.enabled && daylight.mode === 'grid';
    return {
      daylight,
      // Until the grid lands, the analytic study stands in. Showing room tints
      // that are about to gain detail beats showing an empty plan for a second.
      study: inGridMode && grid.study ? grid.study : averageStudy,
      averageStudy,
      gridStatus: inGridMode ? grid.status : 'idle',
      gridProgress: grid.progress,
      gridError: grid.error,
      gridStale: grid.stale,
      recomputing: deferredInput !== input,

      solarAccess: state.editor.solarAccess,
      solarStudy: solar.study,
      solarStatus: solar.status,
      solarProgress: solar.progress,
      solarError: solar.error,
      solarStale: solar.stale,
      sunStudy: computedSunStudy,
      sunRecomputing: deferredSunDayInput !== sunDayInput,
    };
  }, [
    averageStudy,
    daylight,
    computedSunStudy,
    deferredSunDayInput,
    deferredInput,
    grid.error,
    grid.progress,
    grid.stale,
    grid.status,
    grid.study,
    input,
    sunDayInput,
    solar.error,
    solar.progress,
    solar.stale,
    solar.status,
    solar.study,
    state.editor.solarAccess,
  ]);

  return <DaylightStudyContext.Provider value={value}>{children}</DaylightStudyContext.Provider>;
}

/**
 * @returns {{study: object|null, averageStudy: object|null, gridStatus: string,
 *   gridProgress: object|null, gridError: string|null, gridStale: boolean,
 *   recomputing: boolean}} An inert result outside the provider, so a component
 *   rendered in isolation — a test, a storybook — does not throw.
 */
export function useDaylightStudy() {
  return (
    useContext(DaylightStudyContext) || {
      daylight: null,
      study: null,
      averageStudy: null,
      gridStatus: 'idle',
      gridProgress: null,
      gridError: null,
      gridStale: false,
      recomputing: false,
      solarAccess: null,
      solarStudy: null,
      solarStatus: 'idle',
      solarProgress: null,
      solarError: null,
      solarStale: false,
      sunStudy: null,
      sunRecomputing: false,
    }
  );
}
