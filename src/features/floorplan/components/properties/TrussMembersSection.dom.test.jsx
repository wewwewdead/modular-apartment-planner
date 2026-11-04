// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor } from '@/domain/models';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem } from '@/domain/trussModels';

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useEditorState: () => ({ activeTool: null }),
  useToolSettings: () => ({}),
}));

const { TrussSystemProperties, TrussInstanceProperties } = await import('../TrussProperties');

const u = {
  unit: 'mm',
  suffix: 'mm',
  step: (value) => value,
  toDisplay: (value) => value,
  fromDisplay: (value) => value,
};

let container = null;

afterEach(() => {
  container?.remove();
  container = null;
  window.localStorage.clear();
});

function click(node) {
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function choose(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function typeNumber(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

function fieldControl(scope, label) {
  const field = [...scope.querySelectorAll('label')].find(
    (node) => node.firstElementChild?.textContent.trim() === label,
  );
  return field?.querySelector('input, select') || null;
}

function readout(scope, label) {
  const row = [...scope.querySelectorAll('div')].find(
    (node) => node.firstElementChild?.textContent === label && node.children.length >= 3,
  );
  return row ? row.children[2].textContent : null;
}

function trussSystem(instance = {}, options = {}) {
  return createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: 'floor_1',
    baseElevation: 3000,
    ...options,
    trussInstances: [
      {
        id: 'ti_1',
        trussTypeId: 'truss_type_gable',
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        overhangs: { start: 300, end: 300 },
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3600, y: 0 },
        ...instance,
      },
    ],
  });
}

function mountSystem(system = trussSystem(), { withRoof = false } = {}) {
  const floor = { ...createFloor('Ground', 0), id: 'floor_1' };
  const base = { floors: [floor], trussSystems: [system] };
  const roofSystem = withRoof ? createRoofSystemForProject(base, { id: 'roof_1' }) : null;
  const actions = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() =>
    createRoot(container).render(
      <TrussSystemProperties
        project={{ ...base, roofSystem }}
        trussSystem={system}
        dispatch={(action) => actions.push(action)}
        editorDispatch={() => {}}
        u={u}
        phases={[]}
      />,
    ),
  );
  return { actions };
}

function mountInstance(system = trussSystem(), { roofSystem = null } = {}) {
  const floor = { ...createFloor('Ground', 0), id: 'floor_1' };
  const actions = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() =>
    createRoot(container).render(
      <TrussInstanceProperties
        project={{ floors: [floor], trussSystems: [system], roofSystem }}
        trussSystem={system}
        trussInstance={system.trussInstances[0]}
        dispatch={(action) => actions.push(action)}
        u={u}
        phases={[]}
      />,
    ),
  );
  return { actions };
}

describe('Members section (RT-3, spec §7.6)', () => {
  it('sets every member from a preset', () => {
    const { actions } = mountSystem();
    const members = container.querySelector('[data-truss-members]');
    choose(fieldControl(members, 'Preset'), 'au_120x45');
    const update = actions.find((action) => action.type === 'TRUSS_SYSTEM_UPDATE');
    expect(update.trussSystem.memberSizes).toMatchObject({
      preset: 'au_120x45',
      topChord: { width: 45, depth: 120 },
      bottomChord: { width: 45, depth: 120 },
      web: { width: 45, depth: 90 },
    });
  });

  it('marks the sizes custom when one is typed', () => {
    const { actions } = mountSystem();
    const row = container.querySelector('[data-member-row="topChord"]');
    typeNumber(fieldControl(row, 'Depth'), 140);
    const update = actions.find((action) => action.type === 'TRUSS_SYSTEM_UPDATE');
    expect(update.trussSystem.memberSizes.preset).toBe('custom');
    expect(update.trussSystem.memberSizes.topChord).toEqual({ width: 35, depth: 140 });
  });

  it('shows the schedule with the T1 row and a cutting list', () => {
    mountSystem();
    expect(container.querySelector('[data-truss-schedule-row="T1"]')).not.toBeNull();
    expect(container.querySelector('[data-truss-cutting-list]').textContent).toContain('Gable stud');
  });

  it('suggests purlins from the attached covering, only when asked', () => {
    const { actions } = mountSystem(trussSystem(), { withRoof: true });
    expect(actions).toHaveLength(0);
    const role = container.querySelector('[data-truss-purlin-role]');
    const button = [...role.querySelectorAll('button')].find((node) => node.textContent === 'Suggest from covering');
    expect(button.disabled).toBe(false);
    click(button);
    const update = actions.find((action) => action.type === 'TRUSS_SYSTEM_UPDATE');
    // Corrugated 0.42 (the default pitched covering): 1200 internal span, 75 × 50 purlins.
    expect(update.trussSystem.purlinSystem).toMatchObject({
      enabled: true,
      role: 'purlin',
      spacing: 1200,
      width: 75,
      depth: 50,
    });
  });
});

describe('Profile section (RT-3, spec §7.6)', () => {
  it('reads the heel, overall height and out-to-out', () => {
    mountInstance();
    const profile = container.querySelector('[data-truss-profile]');
    expect(readout(profile, 'Heel height')).toBe(String(90 + 90 * Math.hypot(1, 0.5)));
    expect(Number(readout(profile, 'Overall height'))).toBeCloseTo(90 + 1800 + 90 * Math.hypot(1, 0.5), 6);
    expect(readout(profile, 'Out to out')).toBe('7800');
  });

  it('writes rise from a pitch in degrees (rise stays the stored truth)', () => {
    const { actions } = mountInstance();
    const profile = container.querySelector('[data-truss-profile]');
    typeNumber(fieldControl(profile, 'Pitch'), 45);
    const update = actions.find((action) => action.type === 'TRUSS_INSTANCE_UPDATE');
    expect(update.trussInstance.rise).toBeCloseTo(3600, 6);
    expect(update.trussInstance.pitch).toBeCloseTo(100, 6);
  });

  it('picks a web pattern from the gable family', () => {
    const { actions } = mountInstance();
    const select = fieldControl(container.querySelector('[data-truss-profile]'), 'Web pattern');
    expect([...select.options].map((option) => option.value)).toEqual([
      'king_post',
      'queen_post',
      'fink',
      'howe',
      'fan',
      'double_fink',
      'double_howe',
    ]);
    expect(select.value).toBe('fink');
    choose(select, 'howe');
    const update = actions.find((action) => action.type === 'TRUSS_INSTANCE_UPDATE');
    expect(update.trussInstance.webPatternKey).toBe('howe');
  });

  it('warns about an overhang past 750 and a too-shallow flat truss', () => {
    mountInstance(trussSystem({ overhangs: { start: 900, end: 300 } }));
    expect(container.textContent).toContain('past the 750 mm eave limit');
    container.remove();
    mountInstance(trussSystem({ trussTypeId: 'truss_type_flat', rise: 600 }));
    expect(container.textContent).toContain('Span / depth');
  });
});
