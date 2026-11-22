/* @vitest-environment jsdom */
/**
 * One phase filter per edit (perf pass 3, D2.2). The plan canvas and the
 * properties panel read the workspace's phase-filtered project instead of each
 * filtering the whole project again: same arguments, same result, one call.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createFixture, createProject, createWall } from '@/domain/models';
import { createPhase } from '@/domain/phaseModels';
import * as phaseFilter from '@/domain/phaseFilter';
import {
  FloorplanProvider,
  useEditorState,
  useFloorplanContext,
  useFloorplanSelectors,
  useProject,
} from '../context/FloorplanContext';
import { DaylightStudyProvider } from '../context/DaylightStudyContext';
import SvgCanvas from './renderers/SvgCanvas';
import PropertiesPanel from './PropertiesPanel';

vi.mock('@/domain/phaseFilter', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, filterProjectByPhase: vi.fn(actual.filterProjectByPhase) };
});

afterEach(cleanup);

const storeBox = { current: null };
const store = () => storeBox.current;
const seen = { current: [] };

function StoreProbe() {
  const context = useFloorplanContext();
  useEffect(() => {
    storeBox.current = context;
  });
  return null;
}

/** What the canvas and the panel used to compute for themselves, beside what they now read. */
function FilterProbe() {
  const { project } = useProject();
  const { activePhaseId, phaseViewMode } = useEditorState();
  const { filteredProject } = useFloorplanSelectors();
  const own = phaseFilter.filterProjectByPhase.getMockImplementation()(project, activePhaseId, phaseViewMode);
  seen.current.push({ own, shared: filteredProject });
  return null;
}

function phasedProject() {
  const project = createProject('Phases');
  const existing = { ...createPhase('Existing', 0), id: 'ph_existing' };
  const proposed = { ...createPhase('Proposed', 1), id: 'ph_new' };
  const floor = project.floors[0];
  const walls = [
    { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200), id: 'w1', phaseId: 'ph_existing' },
    { ...createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 200), id: 'w2', phaseId: 'ph_new' },
    { ...createWall({ x: 0, y: 0 }, { x: 0, y: 3000 }, 200), id: 'w3' },
  ];
  const fixtures = [
    { ...createFixture('bed', 1500, 1500), id: 'f1', phaseId: 'ph_new' },
    { ...createFixture('sofa', 2500, 1500), id: 'f2', phaseId: 'ph_existing' },
  ];
  return {
    ...project,
    phases: [existing, proposed],
    floors: project.floors.map((entry) => (entry.id === floor.id ? { ...entry, walls, fixtures } : entry)),
  };
}

function renderWorkspace() {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ConfirmDialogProvider>
          <ClipboardProvider>
            <FloorplanProvider initialProject={phasedProject()}>
              <DaylightStudyProvider>
                <StoreProbe />
                <FilterProbe />
                <SvgCanvas />
                <PropertiesPanel />
              </DaylightStudyProvider>
            </FloorplanProvider>
          </ClipboardProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);
  return render(<RouterProvider router={router} />);
}

const filterCalls = () => phaseFilter.filterProjectByPhase.mock.calls.length;

describe('the phase-filtered project is computed once and shared', () => {
  const views = [
    ['all', null],
    ['single', 'ph_new'],
    ['cumulative', 'ph_new'],
    ['single', 'ph_existing'],
  ];

  it('is what each reader would have filtered for itself, in every phase view', () => {
    renderWorkspace();
    for (const [mode, phaseId] of views) {
      act(() => {
        store().dispatch({ type: 'SET_PHASE_VIEW_MODE', mode });
        store().dispatch({ type: 'SET_ACTIVE_PHASE', phaseId });
      });
      seen.current = [];
      const floorId = store().state.project.floors[0].id;
      act(() =>
        store().dispatch({ type: 'FIXTURE_UPDATE', floorId, fixture: { id: 'f1', x: 1500 + seen.current.length } }),
      );
      expect(seen.current.length).toBeGreaterThan(0);
      for (const { own, shared } of seen.current) expect(shared).toEqual(own);
    }
  });

  it('filters the whole project once per edit under a phase view', () => {
    renderWorkspace();
    act(() => {
      store().dispatch({ type: 'SET_PHASE_VIEW_MODE', mode: 'single' });
      store().dispatch({ type: 'SET_ACTIVE_PHASE', phaseId: 'ph_new' });
    });
    const floorId = store().state.project.floors[0].id;
    phaseFilter.filterProjectByPhase.mockClear();
    act(() => store().dispatch({ type: 'FIXTURE_UPDATE', floorId, fixture: { id: 'f1', x: 1700 } }));
    // The workspace's own selector, and nobody else.
    expect(filterCalls()).toBe(1);
  });
});
