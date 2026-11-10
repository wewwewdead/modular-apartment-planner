// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor, createProject, createSlab, createStair } from '@/domain/models';
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

/** The same grid after one bay was retuned on the plan — no longer regular. */
function projectWithCustomBays() {
  const result = executeBuildingCommand(projectWithGrid(), {
    type: BUILDING_COMMANDS.SET_STRUCTURAL_GRID_BAY_SPACING,
    gridId: 'grid_ui',
    orientation: 'vertical',
    bayIndex: 0,
    spacing: 6000,
  });
  return result.project;
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

  it('reads a per-bay grid off its axes instead of falling back to blank-form defaults', () => {
    const { field } = mountStructureStage(projectWithCustomBays());

    // Defaults would read 3 / 3 / 4 m / 4 m and quietly replace the grid with
    // that on the next keystroke in any field. The axes say otherwise.
    expect(field('Numbered axis count').value).toBe('3');
    expect(field('Lettered axis count').value).toBe('4');
    expect(field('Numbered axis spacing').value).toBe('6');
    expect(field('Lettered axis spacing').value).toBe('5');
    expect(container.textContent).toContain('per-bay spacings edited on the plan');
  });

  it('rebuilds a per-bay grid from what is on the plan, not from a default it never had', () => {
    const { commands, field } = mountStructureStage(projectWithCustomBays());

    // Origin X is nowhere near the axis layout, but this form rebuilds the whole
    // grid on any edit — so the layout it carries has to be the real one.
    type(field('Grid origin X'), '3');

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      xAxisCount: 3,
      yAxisCount: 4,
      xSpacing: 6000,
      ySpacing: 5000,
      origin: { x: 3000, y: 2000 },
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

describe('Lifecycle stage rail', () => {
  function mountAt(activeStage) {
    const changes = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <ProjectLifecyclePanel
          project={createProject()}
          derived={derivedFixture()}
          activeStage={activeStage}
          onStageChange={(stage) => changes.push(stage)}
          onExecuteCommand={() => {}}
        />,
      ),
    );
    return changes;
  }

  it('names each chip by number, label and status, and marks only the active one', () => {
    mountAt('site');
    const chips = [...container.querySelectorAll('nav[aria-label="Building lifecycle stages"] button')];
    expect(chips).toHaveLength(8);
    expect(chips[1].textContent).toMatch(/^2 Site — /);
    expect(chips[1].getAttribute('title')).toBe(chips[1].textContent);
    expect(chips.filter((chip) => chip.getAttribute('aria-current') === 'step')).toEqual([chips[1]]);
  });

  it('steps with Previous / Next and disables them at the ends', () => {
    const changes = mountAt('site');
    const previous = container.querySelector('[aria-label="Previous stage"]');
    const next = container.querySelector('[aria-label="Next stage"]');
    act(() => previous.click());
    act(() => next.click());
    expect(changes).toEqual(['brief', 'spaces']);
    container.remove();

    mountAt('brief');
    expect(container.querySelector('[aria-label="Previous stage"]').disabled).toBe(true);
    expect(container.querySelector('[aria-label="Next stage"]').disabled).toBe(false);
    container.remove();

    mountAt('documents');
    expect(container.querySelector('[aria-label="Next stage"]').disabled).toBe(true);
  });
});

describe('SystemsStage stair headroom form', () => {
  // Three storeys. The first stair climbs to the first floor, whose slab has an
  // opening it is already linked to; the second climbs to the second floor and
  // has its own opening and headroom; the third climbs to a roof with no slab.
  function projectWithStairs({ linkedOpeningId = 'opening_first' } = {}) {
    const project = createProject();
    const ground = project.floors[0];
    const first = { ...createFloor('First Floor', 1), id: 'floor_first' };
    const second = { ...createFloor('Second Floor', 2), id: 'floor_second' };
    const roof = { ...createFloor('Roof', 3), id: 'floor_roof' };
    const opening = (id, name) => ({ id, name, boundaryPoints: [] });
    first.slabs = [createSlab(first.id, [], 200, 0, { openings: [opening('opening_first', 'Upper well')] })];
    second.slabs = [createSlab(second.id, [], 200, 0, { openings: [opening('opening_second', 'Top well')] })];
    const stair = (id, name, toFloorId, coordination) => {
      const floorRelation = { fromFloorId: ground.id, toFloorId };
      return { ...createStair({ x: 0, y: 0 }, 1000, 16, 175, 250, {}, floorRelation, { coordination }), id, name };
    };
    ground.stairs = [
      stair('stair_lower', 'Lower stair', first.id, {
        clearanceOpeningRef: { openingId: linkedOpeningId },
        minimumHeadroom: 2100,
      }),
      stair('stair_upper', 'Upper stair', second.id, { minimumHeadroom: 2400 }),
      stair('stair_roof', 'Roof stair', roof.id, { minimumHeadroom: 2200 }),
    ];
    return { ...project, floors: [ground, first, second, roof] };
  }

  function mountSystemsStage(project) {
    const commands = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <ProjectLifecyclePanel
          project={project}
          derived={derivedFixture()}
          activeStage="systems"
          onStageChange={() => {}}
          onExecuteCommand={(command) => commands.push(command)}
        />,
      ),
    );
    const field = (label) => container.querySelector(`[aria-label="${label}"]`);
    const linkButton = () =>
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Link and check headroom opening',
      );
    return { commands, field, linkButton };
  }

  function choose(select, value) {
    select.value = value;
    act(() => select.dispatchEvent(new Event('change', { bubbles: true })));
  }

  it('starts from the first stair, its linked opening and its headroom', () => {
    const { field, linkButton } = mountSystemsStage(projectWithStairs());

    expect(field('Headroom stair').value).toBe('stair_lower');
    expect(field('Headroom slab opening').value).toBe('opening_first');
    expect(field('Minimum stair headroom').value).toBe('2.1');
    expect(linkButton().disabled).toBe(false);
  });

  it('takes the opening and headroom of the stair the user switches to, and links that', () => {
    const { commands, field, linkButton } = mountSystemsStage(projectWithStairs());

    choose(field('Headroom stair'), 'stair_upper');

    expect(field('Headroom slab opening').value).toBe('opening_second');
    expect(field('Minimum stair headroom').value).toBe('2.4');

    act(() => linkButton().click());
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: BUILDING_COMMANDS.LINK_STAIR_CLEARANCE_OPENING,
      stairId: 'stair_upper',
      openingFloorId: 'floor_second',
      openingId: 'opening_second',
      minimumHeadroom: 2400,
    });
  });

  it('offers nothing to link for a stair whose destination has no opening', () => {
    const { commands, field, linkButton } = mountSystemsStage(projectWithStairs());

    choose(field('Headroom stair'), 'stair_roof');

    expect(field('Headroom slab opening').value).toBe('');
    expect(field('Minimum stair headroom').value).toBe('2.2');
    expect(linkButton().disabled).toBe(true);
    act(() => linkButton().click());
    expect(commands).toEqual([]);
  });

  it('does not offer to link an opening that is no longer on the destination slab', () => {
    const { field, linkButton } = mountSystemsStage(projectWithStairs({ linkedOpeningId: 'opening_removed' }));

    expect(field('Headroom slab opening').value).toBe('');
    expect(linkButton().disabled).toBe(true);
  });
});
