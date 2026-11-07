/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createFloor, createSectionCut, createWall, createWindow } from '@/domain/models';
import { DeferredDrawingContext } from './DeferredDrawing';
import SectionRenderer from './SectionRenderer';

/*
 * Inside the plan canvas (a DeferredDrawingContext provider) the section view
 * paints its placeholder in the commit that opened it and the drawing after
 * the hidden-line pass has run in slices (docs/night-section-freezes.md
 * §4.3.3). Outside it — SectionRenderer.dom.test.jsx — it stays synchronous.
 */

afterEach(cleanup);

function fixture() {
  const floor = createFloor('Ground', 0);
  const north = createWall({ x: 0, y: -1000 }, { x: 6000, y: -1000 }, 200);
  const northWindow = createWindow(north.id, 1500, 1000);
  floor.walls = [north];
  floor.windows = [northWindow];
  floor.sectionCuts = [
    createSectionCut({ x: 0, y: 0 }, { x: 6000, y: 0 }, { label: 'Section A-A', direction: -1, depth: 1500 }),
  ];
  return { project: { floors: [floor] }, northWindow };
}

function view(project) {
  return (
    <DeferredDrawingContext.Provider value={{ overlayHost: null }}>
      <svg>
        <SectionRenderer
          project={project}
          floor={project.floors[0]}
          activeSectionCutId={project.floors[0].sectionCuts[0].id}
        />
      </svg>
    </DeferredDrawingContext.Provider>
  );
}

const status = (container) => container.querySelector('[data-drawing-status]')?.getAttribute('data-drawing-status');
const source = (container, id) => container.querySelector(`[data-section-source="${id}"]`);

describe('deferred section drawing', () => {
  it('commits the placeholder first, then lands the drawing', async () => {
    const { project, northWindow } = fixture();
    const { container } = render(view(project));

    expect(status(container)).toBe('loading');
    const placeholder = container.querySelector('[data-section-placeholder]');
    expect(placeholder.getAttribute('data-loading-state')).toBe('loading');
    expect(placeholder.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.textContent).toContain('Cutting section A-A…');
    expect(source(container, northWindow.id)).toBeNull();

    await waitFor(() => expect(status(container)).toBe('ready'));
    expect(source(container, northWindow.id)).not.toBeNull();
    expect(container.querySelector('[data-loading-state="loading"]')).toBeNull();
  });

  it('keeps the previous drawing on screen, marked stale, while an edit is recomputed', async () => {
    const { project, northWindow } = fixture();
    const { container, rerender } = render(view(project));
    await waitFor(() => expect(status(container)).toBe('ready'));

    const edited = {
      ...project,
      floors: [
        {
          ...project.floors[0],
          windows: project.floors[0].windows.map((window) => ({ ...window, sillHeight: window.sillHeight + 300 })),
        },
      ],
    };
    rerender(view(edited));
    expect(status(container)).toBe('stale');
    expect(source(container, northWindow.id)).not.toBeNull();
    expect(container.querySelector('[data-loading-state="loading"]')).toBeNull();

    await waitFor(() => expect(status(container)).toBe('ready'));
    expect(source(container, northWindow.id)).not.toBeNull();
  });

  it('comes back from the cache at once when the project has not changed', async () => {
    const { project } = fixture();
    const first = render(view(project));
    await waitFor(() => expect(status(first.container)).toBe('ready'));
    first.unmount();

    const again = render(view(project));
    expect(status(again.container)).toBe('ready');
    expect(again.container.querySelector('[data-section-placeholder]')).toBeNull();
  });
});
