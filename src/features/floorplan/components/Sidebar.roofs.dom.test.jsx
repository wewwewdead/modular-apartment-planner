/* @vitest-environment jsdom */
/**
 * The sidebar's Roof and Trusses sections with several truss systems
 * (docs/multi-roof.md §5.3, §5.4), on the live store: one card per roof, one
 * "Add roof to …" row per roof-ready system that has none, and a Trusses "+"
 * that always starts a new system.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { createTrussSystemForProject } from '@/domain/trussModels';
import { getProjectRoofs, getRoofForTrussSystem } from '@/domain/projectRoofs';
import { TOOLS } from '@/editor/tools';
import { FloorplanProvider, useFloorplanContext } from '../context/FloorplanContext';
import { DaylightStudyProvider } from '../context/DaylightStudyContext';
import Sidebar from './Sidebar';

afterEach(cleanup);

const storeBox = { current: null };
const store = () => storeBox.current.state;

function StoreProbe() {
  const context = useFloorplanContext();
  useEffect(() => {
    storeBox.current = context;
  });
  return null;
}

function gableSystem(floorId, name, y) {
  return createTrussSystemForProject(null, floorId, {
    name,
    baseElevation: 2700,
    trussInstances: [
      {
        trussTypeId: 'truss_type_gable',
        startPoint: { x: 0, y },
        endPoint: { x: 8000, y },
        span: 6000,
        rise: 1500,
        spacing: 1200,
        count: 5,
      },
    ],
  });
}

function projectWith(systemNames) {
  const project = createProject('Roofs');
  const floorId = project.floors[0].id;
  return {
    ...project,
    trussSystems: systemNames.map((name, index) => gableSystem(floorId, name, index * 12000)),
  };
}

function renderSidebar(project) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ConfirmDialogProvider>
          <ClipboardProvider>
            <FloorplanProvider initialProject={project}>
              <DaylightStudyProvider>
                <StoreProbe />
                <Sidebar />
              </DaylightStudyProvider>
            </FloorplanProvider>
          </ClipboardProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);
  return render(<RouterProvider router={router} />);
}

// The Roof section's own box: header row, then its content.
function roofSection(container) {
  const title = [...container.querySelectorAll('span')].find((node) => node.textContent === 'Roof');
  return title.closest('button').parentElement.parentElement;
}

const roofCards = (section) =>
  [...section.querySelectorAll('button')].filter((node) => node.querySelector('span') && /mm/.test(node.textContent));
const addRows = (section) =>
  [...section.querySelectorAll('button')].filter((node) => node.textContent.startsWith('Add roof to '));

function click(node) {
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('sidebar Roof section with several truss systems', () => {
  beforeEach(() => {
    storeBox.current = null;
  });

  it('gives each system its own roof from its row, and keeps the first one', () => {
    const { container } = renderSidebar(projectWith(['Main trusses', 'Garage trusses']));
    const section = roofSection(container);
    expect(roofCards(section)).toHaveLength(0);
    expect(addRows(section).map((row) => row.textContent)).toEqual([
      'Add roof to Main trusses',
      'Add roof to Garage trusses',
    ]);
    // Every row carries its full text, for when the label is ellipsized.
    expect(addRows(section).map((row) => row.title)).toEqual([
      'Add roof to Main trusses',
      'Add roof to Garage trusses',
    ]);

    click(addRows(section)[1]);
    const [systemA, systemB] = store().project.trussSystems;
    const roofB = getRoofForTrussSystem(store().project, systemB.id);
    expect(roofB).not.toBeNull();
    // It opened in the roof workspace, active and selected.
    expect(store().editor.modelTarget).toBe('roof');
    expect(store().editor.activeRoofId).toBe(roofB.id);
    expect(store().editor.selectedId).toBe(roofB.id);
    expect(store().editor.statusMessage).toBe('Roof added to Garage trusses.');

    click(addRows(roofSection(container))[0]);
    const roofA = getRoofForTrussSystem(store().project, systemA.id);
    expect(roofA).not.toBeNull();
    // The first roof is still there, on its own system.
    expect(getRoofForTrussSystem(store().project, systemB.id).id).toBe(roofB.id);
    expect(getProjectRoofs(store().project)).toHaveLength(2);

    const done = roofSection(container);
    expect(roofCards(done).map((card) => card.querySelector('span').textContent)).toEqual(['Roof', 'Roof 2']);
    expect(addRows(done)).toEqual([]);
    // No roofless system left, so no header "+".
    expect(done.querySelector('button[title^="Add roof to"]')).toBeNull();
    expect(done.querySelector('[class*="_count_"]').textContent).toBe('2');
  });

  it('the header "+" adds a roof to the first roofless system', () => {
    const { container } = renderSidebar(projectWith(['Main trusses', 'Garage trusses']));
    const plus = roofSection(container).querySelector('button[title="Add roof to Main trusses"]');
    expect(plus.textContent.trim()).toBe('+');
    click(plus);
    expect(getRoofForTrussSystem(store().project, store().project.trussSystems[0].id)).not.toBeNull();
    expect(roofSection(container).querySelector('button[title="Add roof to Garage trusses"]')).not.toBeNull();
  });

  it('a card click opens that roof and highlights only its card', () => {
    const { container } = renderSidebar(projectWith(['Main trusses', 'Garage trusses']));
    click(addRows(roofSection(container))[0]);
    click(addRows(roofSection(container))[0]);
    const [firstCard, secondCard] = roofCards(roofSection(container));
    expect(secondCard.parentElement.className).toMatch(/floorCardActive/);
    expect(firstCard.parentElement.className).not.toMatch(/floorCardActive/);

    click(firstCard);
    const roofs = getProjectRoofs(store().project);
    expect(store().editor.activeRoofId).toBe(roofs[0].id);
    const [firstAfter, secondAfter] = roofCards(roofSection(container));
    expect(firstAfter.parentElement.className).toMatch(/floorCardActive/);
    expect(secondAfter.parentElement.className).not.toMatch(/floorCardActive/);
  });

  it('asks for a truss system while there is none and no roof', () => {
    const { container } = renderSidebar(createProject('Bare'));
    expect(roofSection(container).textContent).toContain('Add truss system before roof');
  });
});

describe('sidebar Trusses "+"', () => {
  it('starts a new system even with a system selected, borrowing its truss type', () => {
    const { container } = renderSidebar(projectWith(['Main trusses']));
    const system = store().project.trussSystems[0];
    act(() => storeBox.current.dispatch({ type: 'SELECT_OBJECT', id: system.id, objectType: 'trussSystem' }));

    click(container.querySelector('button[title="Draw a new truss system"]'));

    const { editor } = store();
    expect(editor.activeTool).toBe(TOOLS.TRUSS_DRAW);
    expect(editor.selectedId).toBeNull();
    expect(editor.toolState.targetTrussSystemId).toBeNull();
    expect(editor.toolState.trussTypeId).toBe(system.trussInstances[0].trussTypeId);
  });
});
