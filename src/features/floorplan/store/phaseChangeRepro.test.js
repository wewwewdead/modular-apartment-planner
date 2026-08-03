import { describe, expect, it } from 'vitest';
import { createProject } from '@/domain/models';
import { filterFloorByPhase } from '@/domain/phaseFilter';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

/**
 * Repro for the reported bug: beam moved from phase 1 to phase 3 via the
 * properties panel, then phase 1 hidden — beam must stay visible.
 */
function loadPhasedBeamState() {
  let state = initializeFloorplanState(createProject());
  const floorId = state.project.floors[0].id;
  const phase1 = { id: 'p1', name: 'Phase 1', order: 0, color: '#111111', visible: true };
  const phase3 = { id: 'p3', name: 'Phase 3', order: 2, color: '#333333', visible: true };
  const project = {
    ...state.project,
    phases: [phase1, phase3],
    floors: state.project.floors.map((floor) =>
      floor.id === floorId
        ? {
            ...floor,
            columns: [
              { id: 'col_a', x: 0, y: 0, width: 300, depth: 300, phaseId: 'p1' },
              { id: 'col_b', x: 4000, y: 0, width: 300, depth: 300, phaseId: 'p1' },
            ],
            beams: [
              {
                id: 'beam_1',
                startRef: { kind: 'column', id: 'col_a' },
                endRef: { kind: 'column', id: 'col_b' },
                width: 200,
                depth: 400,
                floorLevel: 0,
                placementRole: 'floor',
                phaseId: 'p1',
              },
            ],
          }
        : floor,
    ),
  };
  state = floorplanReducer(state, { type: 'PROJECT_LOAD', project });
  return { state, floorId };
}

describe('phase reassignment then hiding the old phase', () => {
  it('keeps a beam visible after moving it from a phase that is later hidden', () => {
    let { state, floorId } = loadPhasedBeamState();

    // Properties panel: PhaseSelector dispatches BEAM_UPDATE with the new phase.
    state = floorplanReducer(state, { type: 'BEAM_UPDATE', floorId, beam: { id: 'beam_1', phaseId: 'p3' } });
    const beam = state.project.floors.find((f) => f.id === floorId).beams[0];
    expect(beam.phaseId).toBe('p3');

    // Sidebar: eye toggle hides phase 1.
    state = floorplanReducer(state, { type: 'PHASE_UPDATE', phase: { id: 'p1', visible: false } });

    // The canvas renders filterFloorByPhase(floor, phases, activePhaseId, phaseViewMode).
    const floor = state.project.floors.find((f) => f.id === floorId);
    const filtered = filterFloorByPhase(floor, state.project.phases, null, 'all');
    expect(filtered.beams.map((b) => b.id)).toContain('beam_1');

    // The actual reported symptom: BeamRenderer resolves the beam's endpoints
    // against the FILTERED columns. The beam's supports are still phase 1, so
    // they were filtered out — the beam must still produce render geometry.
    const filteredBeam = filtered.beams.find((b) => b.id === 'beam_1');
    const renderData = getBeamRenderData(filteredBeam, filtered.columns || []);
    expect(renderData).not.toBeNull();
    expect(renderData.length).toBeGreaterThan(0);
  });

  it('renders the beam in single-phase view of its new phase even though its supports belong to another phase', () => {
    let { state, floorId } = loadPhasedBeamState();
    state = floorplanReducer(state, { type: 'BEAM_UPDATE', floorId, beam: { id: 'beam_1', phaseId: 'p3' } });

    const floor = state.project.floors.find((f) => f.id === floorId);
    const filtered = filterFloorByPhase(floor, state.project.phases, 'p3', 'single');

    // Phase-1 columns are not part of the phase-3 view...
    expect(filtered.columns).toHaveLength(0);
    // ...but the phase-3 beam still resolves its endpoint geometry.
    const beam = filtered.beams.find((b) => b.id === 'beam_1');
    expect(beam).toBeDefined();
    expect(getBeamRenderData(beam, filtered.columns)).not.toBeNull();
  });

  it('does not attach hidden-support fallbacks when the supporting columns are visible', () => {
    let { state, floorId } = loadPhasedBeamState();
    state = floorplanReducer(state, { type: 'BEAM_UPDATE', floorId, beam: { id: 'beam_1', phaseId: 'p3' } });
    // Hide phase 3 itself: the beam disappears, columns stay.
    state = floorplanReducer(state, { type: 'PHASE_UPDATE', phase: { id: 'p3', visible: false } });

    const floor = state.project.floors.find((f) => f.id === floorId);
    const filtered = filterFloorByPhase(floor, state.project.phases, null, 'all');

    expect(filtered.beams).toHaveLength(0);
    expect(filtered.columns).toHaveLength(2);
    // And with nothing hidden that matters, beams carry no fallback baggage.
    const allVisible = filterFloorByPhase(
      floor,
      state.project.phases.map((p) => ({ ...p, visible: true })),
      null,
      'all',
    );
    expect(allVisible.beams.every((b) => b.phaseHiddenSupportColumns === undefined)).toBe(true);
  });
});
