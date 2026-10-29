/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createFloor, createSectionCut, createWall, createWindow } from '@/domain/models';
import SectionRenderer from './SectionRenderer';

afterEach(cleanup);

function fixture() {
  const floor = createFloor('Ground', 0);
  const north = createWall({ x: 0, y: -1000 }, { x: 6000, y: -1000 }, 200);
  const south = createWall({ x: 0, y: 1000 }, { x: 6000, y: 1000 }, 200);
  const northWindow = createWindow(north.id, 1500, 1000);
  const southWindow = createWindow(south.id, 4500, 1000);
  floor.walls = [north, south];
  floor.windows = [northWindow, southWindow];
  floor.sectionCuts = [
    createSectionCut({ x: 0, y: 0 }, { x: 6000, y: 0 }, { label: 'Looking north', direction: -1, depth: 1500 }),
    createSectionCut({ x: 0, y: 0 }, { x: 6000, y: 0 }, { label: 'Looking south', direction: 1, depth: 1500 }),
  ];
  return { project: { floors: [floor] }, northWindow, southWindow };
}

function view(project, cutId = project.floors[0].sectionCuts[0]?.id) {
  return (
    <svg>
      <SectionRenderer project={project} floor={project.floors[0]} activeSectionCutId={cutId} />
    </svg>
  );
}

function source(container, id) {
  return container.querySelector(`[data-section-source="${id}"]`);
}

describe('section view updates', () => {
  it('switches to the chosen cut and reverses the visible side when its direction changes', () => {
    const { project, northWindow, southWindow } = fixture();
    const { container, rerender } = render(view(project));
    expect(source(container, northWindow.id)).not.toBeNull();
    expect(source(container, southWindow.id)).toBeNull();

    const southCut = project.floors[0].sectionCuts[1];
    rerender(view(project, southCut.id));
    expect(container.textContent).toContain('Looking south');
    expect(source(container, northWindow.id)).toBeNull();
    expect(source(container, southWindow.id)).not.toBeNull();

    const flipped = { ...project, floors: [{ ...project.floors[0], sectionCuts: [{ ...southCut, direction: -1 }] }] };
    rerender(view(flipped, southCut.id));
    expect(source(container, northWindow.id)).not.toBeNull();
    expect(source(container, southWindow.id)).toBeNull();
  });

  it('removes geometry outside a reduced depth and restores it when the depth increases', () => {
    const { project, northWindow } = fixture();
    const { container, rerender } = render(view(project));
    expect(source(container, northWindow.id)).not.toBeNull();

    const shallow = {
      ...project,
      floors: [{ ...project.floors[0], sectionCuts: [{ ...project.floors[0].sectionCuts[0], depth: 500 }] }],
    };
    rerender(view(shallow));
    expect(source(container, northWindow.id)).toBeNull();
    rerender(view(project));
    expect(source(container, northWindow.id)).not.toBeNull();
  });

  it('updates the drawing after a model edit and handles deleting the last cut', () => {
    const { project, northWindow } = fixture();
    const { container, rerender } = render(view(project));
    const oldFrameY = Number(source(container, northWindow.id).querySelector('rect').getAttribute('y'));
    const edited = {
      ...project,
      floors: [
        {
          ...project.floors[0],
          windows: project.floors[0].windows.map((window) =>
            window.id === northWindow.id ? { ...window, sillHeight: window.sillHeight + 300 } : window,
          ),
        },
      ],
    };
    rerender(view(edited));
    const newFrameY = Number(source(container, northWindow.id).querySelector('rect').getAttribute('y'));
    expect(newFrameY).toBeCloseTo(oldFrameY - 300);

    rerender(view({ ...project, floors: [{ ...project.floors[0], sectionCuts: [] }] }));
    expect(container.textContent).toContain('Draw a section cut in plan view.');
    expect(source(container, northWindow.id)).toBeNull();
  });
});
