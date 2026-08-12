// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createProject } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import ProjectLifecyclePanel from './ProjectLifecyclePanel';

function derivedFixture() {
  return {
    validationIssues: [],
    lastCommand: null,
    structuralLoadPath: { summary: {} },
    structuralRealization: {
      profile: {},
      state: { status: 'not_realized' },
      generatedStackCount: 0,
      continuousStackCount: 0,
      skippedBeamSegments: [],
    },
  };
}

function projectWithGrid() {
  return executeBuildingCommand(createProject(), {
    type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
    gridId: 'grid_ui',
    name: 'Primary Grid',
    xAxisCount: 3,
    yAxisCount: 4,
    xSpacing: 4000,
    ySpacing: 5000,
    origin: { x: 1000, y: 2000 },
    rotation: 12,
  }).project;
}

let container = null;

afterEach(() => {
  container?.remove();
  container = null;
});

function mountStructureStage(project) {
  const commands = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <ProjectLifecyclePanel
        project={project}
        derived={derivedFixture()}
        activeStage="structure"
        onStageChange={() => {}}
        onExecuteCommand={(command) => commands.push(command)}
      />,
    ),
  );
  const field = (label) => container.querySelector(`[aria-label="${label}"]`);
  return { commands, field };
}

function type(input, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, text);
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

describe('StructureStage grid form', () => {
  it('applies a spacing edit immediately, keeping the rest of the grid as committed', () => {
    const { commands, field } = mountStructureStage(projectWithGrid());

    type(field('Lettered axis spacing'), '6.5');

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      gridId: 'grid_ui',
      name: 'Primary Grid',
      xAxisCount: 3,
      yAxisCount: 4,
      xSpacing: 4000,
      ySpacing: 6500,
      origin: { x: 1000, y: 2000 },
      rotation: 12,
    });
  });

  it('commands nothing for a half-typed grid, and keeps the keystrokes on screen', () => {
    const { commands, field } = mountStructureStage(projectWithGrid());
    const axisCount = field('Numbered axis count');

    type(axisCount, '');
    type(axisCount, '1');

    expect(commands).toHaveLength(0);
    // The '1' survives so a '2' can follow it — it is a prefix, not an answer.
    expect(axisCount.value).toBe('1');

    type(axisCount, '12');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ xAxisCount: 12 });
  });

  it('has no apply button once a grid exists, but still reports a rejected command', () => {
    const { field } = mountStructureStage(projectWithGrid());

    expect(container.textContent).not.toContain('Update structural grid');
    expect(container.textContent).not.toContain('Create structural grid');
    expect(container.textContent).toContain('Grid edits apply as you type');
    // The committed grid drives the fields, so an external move shows up here.
    expect(field('Grid origin X').value).toBe('1');
    expect(field('Grid rotation').value).toBe('12');
  });

  it('keeps grid creation an explicit action while no grid exists', () => {
    const { commands, field } = mountStructureStage(createProject());

    type(field('Numbered axis spacing'), '3');
    expect(commands).toHaveLength(0);
    expect(container.textContent).toContain('Create structural grid');

    const create = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Create structural grid',
    );
    act(() => create.click());

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      xSpacing: 3000,
    });
  });

  it('surfaces a rejected grid command now that no button reports it', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <ProjectLifecyclePanel
          project={projectWithGrid()}
          derived={{
            ...derivedFixture(),
            lastCommand: {
              ok: false,
              commandType: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
              error: { message: 'Regular structural grid spacing must be positive finite millimetres.' },
            },
          }}
          activeStage="structure"
          onStageChange={() => {}}
          onExecuteCommand={() => {}}
        />,
      ),
    );

    expect(container.textContent).toContain('spacing must be positive finite millimetres');
  });
});
