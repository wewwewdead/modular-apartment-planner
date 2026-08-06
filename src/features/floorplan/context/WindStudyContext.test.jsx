import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWindApartmentProject } from '@/analysis/__fixtures__/windApartmentProject';
import { studyRequestKey } from '@/analysis/studyRequestIdentity';
import { windRunSettingsOf } from '@/analysis/windState';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import floorplanReducer, { initializeFloorplanState } from '../store/floorplanReducer';
import { useWindStudy } from './WindStudyContext';

/**
 * Characterization suite for the wind worker's re-run gate.
 *
 * The vitest environment is `node` and component tests render through
 * `renderToStaticMarkup`, so effects never run and real `worker.postMessage`
 * calls cannot be counted.
 *
 * deferred to T18 (jsdom harness): assert the worker is constructed once and
 * receives exactly N postMessage calls across a pan/zoom burst, and that the
 * SETTLE_MS debounce in useWindStudy collapses a drag into one run.
 *
 * What IS pinnable today is the request identity that gates those calls. The
 * derivation below mirrors the production chain exactly:
 *
 *   useFloorplan.js:230   filteredProject = useMemo(filterProjectByPhase(project,
 *                           activePhaseId, phaseViewMode), [activePhaseId, phaseViewMode, project])
 *   WindStudyContext.jsx:10  project = selectors.filteredProject
 *   WindStudyContext.jsx:13  projectRevision = `${changeVersion}|${activePhaseId||''}|${phaseViewMode||''}`
 *   useWindStudy.js:23       settings = windRunSettingsOf(windStudy)
 *   useWindStudy.js:24       requestKey = studyRequestKey({ project, projectRevision, settings })
 *
 * `studyRequestKey` identifies the project by object identity (a WeakMap), so
 * the useMemo has to be modelled too — recomputing `filterProjectByPhase` on
 * every render would mint a new identity every time and defeat the gate.
 */
function createWindRequestDerivation() {
  let deps = null;
  let filtered = null;
  return function derive(state) {
    const next = [state.editor.activePhaseId, state.editor.phaseViewMode, state.project];
    if (!deps || next.some((value, index) => value !== deps[index])) {
      deps = next;
      filtered = filterProjectByPhase(state.project, state.editor.activePhaseId, state.editor.phaseViewMode);
    }
    const projectRevision = `${state.changeVersion}|${state.editor.activePhaseId || ''}|${state.editor.phaseViewMode || ''}`;
    return studyRequestKey({
      project: filtered,
      projectRevision,
      settings: windRunSettingsOf(state.editor.windStudy),
    });
  };
}

function phasedApartmentState() {
  const project = createWindApartmentProject();
  project.phases = [
    { id: 'phase_existing', name: 'Existing', order: 0, color: '#888888', visible: true },
    { id: 'phase_new', name: 'New work', order: 1, color: '#4488cc', visible: true },
  ];
  const floor = project.floors[0];
  floor.walls = floor.walls.map((wall) => ({
    ...wall,
    phaseId: wall.id === 'wall_spine' || wall.id === 'wall_cross' ? 'phase_new' : 'phase_existing',
  }));
  let state = initializeFloorplanState(project);
  state = floorplanReducer(state, { type: 'TOGGLE_WIND_STUDY' });
  expect(state.editor.windStudy.enabled).toBe(true);
  return state;
}

function windowFloorId(state) {
  return state.project.floors[0].id;
}

describe('wind study request identity — viewport (characterization)', () => {
  it('does not change across pan, zoom or an explicit viewport set', () => {
    const derive = createWindRequestDerivation();
    let state = phasedApartmentState();
    const baseline = derive(state);
    const startViewport = state.editor.viewport;

    for (const action of [
      { type: 'PAN', dx: 137, dy: -84 },
      { type: 'ZOOM', zoom: 0.42, panX: 12, panY: -300 },
      { type: 'PAN', dx: -9, dy: 9 },
      { type: 'SET_VIEWPORT', viewport: { zoom: 0.08, panX: 2000, panY: 1500 } },
    ]) {
      state = floorplanReducer(state, action);
      expect(derive(state), action.type).toBe(baseline);
    }

    // Guard against a vacuous pass: the viewport really did move, and the
    // change counter was not touched while it did.
    expect(state.editor.viewport).not.toEqual(startViewport);
    expect(state.changeVersion).toBe(0);
  });

  it('keeps the project object and change counter untouched by viewport actions', () => {
    let state = phasedApartmentState();
    const project = state.project;
    const changeVersion = state.changeVersion;
    state = floorplanReducer(state, { type: 'PAN', dx: 40, dy: 40 });
    state = floorplanReducer(state, { type: 'ZOOM', zoom: 0.9, panX: 1, panY: 1 });
    expect(state.project).toBe(project);
    expect(state.changeVersion).toBe(changeVersion);
  });

  it('is stable across repeated no-op re-derivation', () => {
    const derive = createWindRequestDerivation();
    const state = phasedApartmentState();
    const keys = new Set([derive(state), derive(state), derive(state)]);
    expect(keys.size).toBe(1);
  });

  it('pins that neither the hook nor the provider mentions anything viewport-shaped', () => {
    const hook = readFileSync(fileURLToPath(new URL('../hooks/useWindStudy.js', import.meta.url)), 'utf8');
    const provider = readFileSync(fileURLToPath(new URL('./WindStudyContext.jsx', import.meta.url)), 'utf8');
    for (const [name, source] of [
      ['useWindStudy.js', hook],
      ['WindStudyContext.jsx', provider],
    ]) {
      expect(/viewport|zoom|panX|panY/i.test(source), name).toBe(false);
    }
  });
});

describe('wind study request identity — phase (characterization)', () => {
  it('changes when the active phase changes', () => {
    const derive = createWindRequestDerivation();
    let state = phasedApartmentState();
    const baseline = derive(state);
    state = floorplanReducer(state, { type: 'SET_ACTIVE_PHASE', phaseId: 'phase_new' });
    expect(derive(state)).not.toBe(baseline);
  });

  it('changes when the phase view mode changes', () => {
    const derive = createWindRequestDerivation();
    let state = phasedApartmentState();
    state = floorplanReducer(state, { type: 'SET_ACTIVE_PHASE', phaseId: 'phase_new' });
    const baseline = derive(state);
    state = floorplanReducer(state, { type: 'SET_PHASE_VIEW_MODE', mode: 'single' });
    expect(derive(state)).not.toBe(baseline);
    const single = derive(state);
    state = floorplanReducer(state, { type: 'SET_PHASE_VIEW_MODE', mode: 'cumulative' });
    expect(derive(state)).not.toBe(single);
  });

  it('feeds the phase-FILTERED project to the study, not the raw project', () => {
    let state = phasedApartmentState();
    state = floorplanReducer(state, { type: 'SET_ACTIVE_PHASE', phaseId: 'phase_new' });
    state = floorplanReducer(state, { type: 'SET_PHASE_VIEW_MODE', mode: 'single' });
    const filtered = filterProjectByPhase(state.project, state.editor.activePhaseId, state.editor.phaseViewMode);
    expect(filtered).not.toBe(state.project);
    expect(state.project.floors[0].walls).toHaveLength(6);
    // Only the two partitions carry `phase_new`, so a single-phase view hands
    // the wind solver a building with no exterior shell at all.
    expect(filtered.floors[0].walls.map((wall) => wall.id)).toEqual(['wall_spine', 'wall_cross']);
    // characterization: pins current behaviour; see T2. Strict phase views hide
    // UNPHASED objects too, and openings whose parent wall was filtered away go
    // with it — so a single-phase view hands the ventilation network a building
    // with no openings at all, and it will report zero airflow rather than
    // saying the geometry was filtered.
    expect(state.project.floors[0].windows).toHaveLength(6);
    expect(state.project.floors[0].doors).toHaveLength(2);
    expect(filtered.floors[0].windows).toHaveLength(0);
    expect(filtered.floors[0].doors).toHaveLength(0);
  });

  it('pins the three-part projectRevision string the provider builds', () => {
    let state = phasedApartmentState();
    const revisionOf = (value) =>
      `${value.changeVersion}|${value.editor.activePhaseId || ''}|${value.editor.phaseViewMode || ''}`;
    expect(revisionOf(state)).toBe('0||all');
    state = floorplanReducer(state, { type: 'SET_ACTIVE_PHASE', phaseId: 'phase_new' });
    state = floorplanReducer(state, { type: 'SET_PHASE_VIEW_MODE', mode: 'cumulative' });
    expect(revisionOf(state)).toBe('0|phase_new|cumulative');
    const source = readFileSync(fileURLToPath(new URL('./WindStudyContext.jsx', import.meta.url)), 'utf8');
    expect(source).toContain('const project = selectors.filteredProject;');
    expect(source).toContain(
      "`${state.changeVersion}|${state.editor.activePhaseId || ''}|${state.editor.phaseViewMode || ''}`",
    );
  });
});

describe('wind study request identity — settings and geometry (characterization)', () => {
  it('changes for each wind setting the panel can edit', () => {
    for (const patch of [
      { directionDeg: 90 },
      { resolution: 128 },
      { sliceHeight: 1800 },
      { iterations: 900 },
      { domainPadding: 45000 },
      { referenceSpeed: 8 },
      { mode: 'comfort' },
    ]) {
      const derive = createWindRequestDerivation();
      let state = phasedApartmentState();
      const baseline = derive(state);
      state = floorplanReducer(state, { type: 'SET_WIND_STUDY', patch });
      expect(derive(state), JSON.stringify(patch)).not.toBe(baseline);
    }
  });

  it('does not change when a wind-setting patch is a no-op', () => {
    const derive = createWindRequestDerivation();
    let state = phasedApartmentState();
    const baseline = derive(state);
    const editor = state.editor;
    state = floorplanReducer(state, {
      type: 'SET_WIND_STUDY',
      patch: { directionDeg: state.editor.windStudy.directionDeg },
    });
    expect(state.editor).toBe(editor);
    expect(derive(state)).toBe(baseline);
  });

  it('changes when a ventilation-relevant opening edit lands', () => {
    const derive = createWindRequestDerivation();
    let state = phasedApartmentState();
    const baseline = derive(state);
    state = floorplanReducer(state, {
      type: 'WINDOW_UPDATE',
      floorId: windowFloorId(state),
      window: { id: 'win_nw_north', ventilation: { operable: true, openFraction: 0.2, dischargeCoefficient: 0.62 } },
    });
    expect(state.changeVersion).toBe(1);
    expect(derive(state)).not.toBe(baseline);
  });

  it('changes when a fixed window is made operable', () => {
    const derive = createWindRequestDerivation();
    let state = phasedApartmentState();
    const baseline = derive(state);
    state = floorplanReducer(state, {
      type: 'WINDOW_UPDATE',
      floorId: windowFloorId(state),
      window: { id: 'win_se_fixed', type: 'standard' },
    });
    expect(derive(state)).not.toBe(baseline);
  });
});

/**
 * Reports the context value through data attributes rather than a captured
 * variable: `renderToStaticMarkup` escapes quotes in text nodes, and writing
 * to module scope during render is a lint error (and a real React rule).
 */
function WindStudyProbe() {
  const value = useWindStudy();
  return (
    <span
      data-probe="wind-study"
      data-keys={Object.keys(value).sort().join(',')}
      data-status={String(value.status)}
      data-stale={String(value.stale)}
      data-settings={String(value.settings)}
      data-study={String(value.study)}
      data-error={String(value.error)}
      data-progress={String(value.progress)}
      data-climate={String(value.climate)}
    />
  );
}

describe('useWindStudy consumer default (characterization)', () => {
  it('returns an inert, fully shaped value when no provider is mounted', () => {
    const markup = renderToStaticMarkup(<WindStudyProbe />);
    expect(markup).toContain('data-keys="climate,error,progress,settings,stale,status,study"');
    expect(markup).toContain('data-status="idle"');
    expect(markup).toContain('data-stale="false"');
    expect(markup).toContain('data-settings="null"');
    expect(markup).toContain('data-study="null"');
    expect(markup).toContain('data-error="null"');
    expect(markup).toContain('data-progress="null"');
    expect(markup).toContain('data-climate="null"');
  });
});
