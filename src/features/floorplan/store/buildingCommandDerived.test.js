import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumn, createProject } from '@/domain/models';
import { deriveSiteFeasibility } from '@/domain/siteModels';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

// `deriveSiteFeasibility` is read only by the reducer's coordination pass, so
// its call count is the number of passes a dispatch ran.
vi.mock('@/domain/siteModels', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, deriveSiteFeasibility: vi.fn(actual.deriveSiteFeasibility) };
});

function planWithColumn() {
  let state = initializeFloorplanState(createProject());
  const floorId = state.project.floors[0].id;
  const column = createColumn(2000, 2000, 300, 300, { height: 3000 });
  state = floorplanReducer(state, { type: 'COLUMN_ADD', floorId, column });
  return { state, floorId, columnId: column.id };
}

function moveColumn(state, floorId, columnId, x) {
  return floorplanReducer(state, { type: 'COLUMN_UPDATE', floorId, column: { id: columnId, x, y: 2000 } });
}

const MODEL_KEYS = (derived) => Object.keys(derived).filter((key) => key !== 'lastCommand');

describe('building commands and the coordination pass', () => {
  beforeEach(() => {
    vi.mocked(deriveSiteFeasibility).mockClear();
  });

  it('runs the pass once for a settled command, against the synced project', () => {
    const { state, floorId, columnId } = planWithColumn();
    vi.mocked(deriveSiteFeasibility).mockClear();

    const moved = moveColumn(state, floorId, columnId, 2500);

    expect(moved.derived.lastCommand).toMatchObject({ ok: true, commandType: 'MoveColumn' });
    expect(moved.project.floors[0].columns[0].x).toBe(2500);
    expect(deriveSiteFeasibility).toHaveBeenCalledTimes(1);
    expect(deriveSiteFeasibility).toHaveBeenCalledWith(moved.project);
  });

  it('holds every coordination model still across a column drag and settles once on release', () => {
    const { state, floorId, columnId } = planWithColumn();
    const derivedBefore = state.derived;

    let dragged = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    vi.mocked(deriveSiteFeasibility).mockClear();
    for (let x = 2100; x <= 3000; x += 100) {
      dragged = moveColumn(dragged, floorId, columnId, x);
      for (const key of MODEL_KEYS(derivedBefore)) {
        expect(dragged.derived[key]).toBe(derivedBefore[key]);
      }
      expect(dragged.derived.lastCommand).toMatchObject({ ok: true, commandType: 'MoveColumn' });
    }
    expect(deriveSiteFeasibility).not.toHaveBeenCalled();
    expect(dragged.gesture.derivedStale).toBe(true);
    expect(dragged.project.floors[0].columns[0].x).toBe(3000);

    const released = floorplanReducer(dragged, { type: 'END_DRAG_GESTURE' });
    expect(deriveSiteFeasibility).toHaveBeenCalledTimes(1);
    expect(released.gesture.derivedStale).toBe(false);
    expect(released.derived.validationIssues).not.toBe(derivedBefore.validationIssues);
    expect(released.derived.lastCommand).toBe(dragged.derived.lastCommand);
  });
});
