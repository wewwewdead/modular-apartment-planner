import { describe, expect, it } from 'vitest';
import { PHASE_VIEW, filterFloorByPhase, isObjectVisibleInPhase } from './phaseFilter';

const PHASES = [
  { id: 'p1', name: 'Phase 1', order: 0, visible: true },
  { id: 'p2', name: 'Phase 2', order: 1, visible: true },
  { id: 'p3', name: 'Phase 3', order: 2, visible: true },
];

function floorFixture() {
  return {
    id: 'floor-1',
    walls: [
      { id: 'wall_p1', phaseId: 'p1' },
      { id: 'wall_p3', phaseId: 'p3' },
      { id: 'wall_unphased', phaseId: null },
    ],
    doors: [],
    windows: [],
    annotations: [
      { id: 'dim_p1', phaseId: 'p1' },
      { id: 'dim_p3', phaseId: 'p3' },
      { id: 'dim_unphased', phaseId: null },
    ],
    sectionCuts: [
      { id: 'sec_p1', phaseId: 'p1' },
      { id: 'sec_unphased', phaseId: null },
    ],
  };
}

const ids = (arr) => (arr || []).map((entry) => entry.id);

describe('isObjectVisibleInPhase', () => {
  it('shows everything in the All view, phased or not', () => {
    expect(isObjectVisibleInPhase({ phaseId: 'p3' }, PHASES, 'p1', PHASE_VIEW.ALL)).toBe(true);
    expect(isObjectVisibleInPhase({ phaseId: null }, PHASES, 'p1', PHASE_VIEW.ALL)).toBe(true);
  });

  it('still honours the per-phase eye toggle in every view', () => {
    const withHidden = PHASES.map((p) => (p.id === 'p3' ? { ...p, visible: false } : p));
    expect(isObjectVisibleInPhase({ phaseId: 'p3' }, withHidden, null, PHASE_VIEW.ALL)).toBe(false);
  });

  it('hides unphased objects in Single and Cumulative views once a phase is active', () => {
    expect(isObjectVisibleInPhase({ phaseId: null }, PHASES, 'p1', PHASE_VIEW.SINGLE)).toBe(false);
    expect(isObjectVisibleInPhase({ phaseId: null }, PHASES, 'p1', PHASE_VIEW.CUMULATIVE)).toBe(false);
  });

  it('keeps unphased objects visible when no phase is active', () => {
    expect(isObjectVisibleInPhase({ phaseId: null }, PHASES, null, PHASE_VIEW.SINGLE)).toBe(true);
    expect(isObjectVisibleInPhase({ phaseId: null }, PHASES, null, PHASE_VIEW.CUMULATIVE)).toBe(true);
  });

  it('applies cumulative ordering to phased objects', () => {
    expect(isObjectVisibleInPhase({ phaseId: 'p1' }, PHASES, 'p1', PHASE_VIEW.CUMULATIVE)).toBe(true);
    expect(isObjectVisibleInPhase({ phaseId: 'p3' }, PHASES, 'p1', PHASE_VIEW.CUMULATIVE)).toBe(false);
    expect(isObjectVisibleInPhase({ phaseId: 'p1' }, PHASES, 'p3', PHASE_VIEW.CUMULATIVE)).toBe(true);
    expect(isObjectVisibleInPhase({ phaseId: 'p3' }, PHASES, 'p3', PHASE_VIEW.CUMULATIVE)).toBe(true);
  });
});

describe('filterFloorByPhase strict phase views', () => {
  it('cumulative to Phase 1 shows only phase-1 work — no unphased, no later phases', () => {
    const filtered = filterFloorByPhase(floorFixture(), PHASES, 'p1', PHASE_VIEW.CUMULATIVE);
    expect(ids(filtered.walls)).toEqual(['wall_p1']);
    expect(ids(filtered.annotations)).toEqual(['dim_p1']);
    expect(ids(filtered.sectionCuts)).toEqual(['sec_p1']);
  });

  it('cumulative to Phase 3 accumulates phase 1 and phase 3 but still hides unphased', () => {
    const filtered = filterFloorByPhase(floorFixture(), PHASES, 'p3', PHASE_VIEW.CUMULATIVE);
    expect(ids(filtered.walls)).toEqual(['wall_p1', 'wall_p3']);
    expect(ids(filtered.annotations)).toEqual(['dim_p1', 'dim_p3']);
  });

  it('single view shows exactly the active phase', () => {
    const filtered = filterFloorByPhase(floorFixture(), PHASES, 'p3', PHASE_VIEW.SINGLE);
    expect(ids(filtered.walls)).toEqual(['wall_p3']);
    expect(ids(filtered.annotations)).toEqual(['dim_p3']);
    expect(ids(filtered.sectionCuts)).toEqual([]);
  });

  it('the All view with nothing hidden returns the floor untouched', () => {
    const floor = floorFixture();
    expect(filterFloorByPhase(floor, PHASES, null, PHASE_VIEW.ALL)).toBe(floor);
  });

  it('markup follows the eye toggle too', () => {
    const withHidden = PHASES.map((p) => (p.id === 'p1' ? { ...p, visible: false } : p));
    const filtered = filterFloorByPhase(floorFixture(), withHidden, null, PHASE_VIEW.ALL);
    expect(ids(filtered.annotations)).toEqual(['dim_p3', 'dim_unphased']);
    expect(ids(filtered.sectionCuts)).toEqual(['sec_unphased']);
  });
});
