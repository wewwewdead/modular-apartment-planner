/* @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createFloor, createSectionCut, createStair } from '@/domain/models';
import { buildProjectSectionScene } from '@/sections/scene';
import SectionViewControls from './SectionViewControls';
import SectionRenderer from './SectionRenderer';

afterEach(cleanup);

it('restores distant stairs from the section controls, edits the limit, and flips the cut', () => {
  const ground = createFloor('Ground', 0);
  const upper = createFloor('Upper', 1);
  const stair = createStair({ x: 1000, y: 4000 }, 1000, 8);
  ground.stairs = [stair];
  upper.sectionCuts = [createSectionCut({ x: 0, y: 0 }, { x: 6000, y: 0 }, { depth: 2000 })];
  const actions = [];
  function Harness() {
    const [project, setProject] = useState({ floors: [ground, upper] });
    const scene = buildProjectSectionScene(project, upper.id);
    const dispatch = (action) => {
      actions.push(action);
      setProject((previous) => ({
        ...previous,
        floors: previous.floors.map((floor) =>
          floor.id === action.floorId
            ? {
                ...floor,
                sectionCuts: floor.sectionCuts.map((cut) =>
                  cut.id === action.sectionCut.id ? { ...cut, ...action.sectionCut } : cut,
                ),
              }
            : floor,
        ),
      }));
    };
    return (
      <>
        <SectionViewControls project={project} scene={scene} dispatch={dispatch} />
        <svg>
          <SectionRenderer project={project} floor={project.floors[1]} activeSectionCutId={upper.sectionCuts[0].id} />
        </svg>
      </>
    );
  }
  const { container } = render(<Harness />);
  const stairDrawing = () => container.querySelector(`[data-section-source="${stair.id}"]`);
  expect(stairDrawing()).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('1 stair flight extends');
  fireEvent.click(screen.getByRole('button', { name: 'Full building' }));
  expect(actions.at(-1).floorId).toBe(upper.id);
  expect(stairDrawing()).not.toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('button', { name: 'Full building' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Limited depth' }));
  expect(stairDrawing()).toBeNull();
  const input = screen.getByRole('spinbutton', { name: 'Section depth in millimetres' });
  fireEvent.keyDown(input, { key: '5' });
  fireEvent.change(input, { target: { value: '5000' } });
  expect(stairDrawing()).toBeNull();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(stairDrawing()).not.toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Flip direction' }));
  expect(stairDrawing()).toBeNull();
  expect(screen.getByText(/1 stair flight is behind the cut/)).toBeTruthy();
});
