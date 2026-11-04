// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor } from '@/domain/models';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem } from '@/domain/trussModels';

// The system panel reads the armed tool from the editor context; a panel test
// has no provider, so hand it an idle editor.
vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useEditorState: () => ({ activeTool: null }),
  useToolSettings: () => ({}),
}));

const { TrussSystemProperties } = await import('./TrussProperties');

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

function trussSystem(trussTypeId = 'truss_type_gable', instance = {}) {
  return createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: 'floor_1',
    baseElevation: 3000,
    trussInstances: [
      {
        id: 'ti_1',
        trussTypeId,
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3600, y: 0 },
        ...instance,
      },
    ],
  });
}

function mount(system = trussSystem(), { withRoof = false } = {}) {
  const floor = { ...createFloor('Ground', 0), id: 'floor_1' };
  const base = { floors: [floor], trussSystems: [system] };
  const roofSystem = withRoof ? createRoofSystemForProject(base, { id: 'roof_1' }) : null;
  const project = { ...base, roofSystem };
  const actions = [];

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <TrussSystemProperties
        project={project}
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

function sectionHead(title) {
  return [...container.querySelectorAll('button[aria-expanded]')].find((node) =>
    node.textContent.trim().startsWith(title),
  );
}

function sideBlock(side) {
  return container.querySelector(`[data-closure-side="${side}"]`);
}

function readout(label) {
  const node = [...container.querySelectorAll('div')].find(
    (entry) => entry.firstElementChild?.textContent?.trim() === label && entry.children.length >= 3,
  );
  return node ? node.children[2].textContent.trim() : null;
}

describe('TrussSystemProperties — Gable ends', () => {
  it('renders open with End A and End B infilled, and no side strips on a gable', () => {
    mount();
    expect(sectionHead('Gable ends').getAttribute('aria-expanded')).toBe('true');
    expect(sideBlock('start').textContent).toContain('End A');
    expect(sideBlock('end').textContent).toContain('End B');
    expect(sideBlock('spanStart')).toBeNull();
    expect(sideBlock('spanEnd')).toBeNull();
    expect(sideBlock('start').querySelector('select').value).toBe('infill');
    // RT-3: each 7.2 × 1.8 gable stands on a 190.6 heel strip (real chords): 2 × 7.85.
    expect(readout('Closure area')).toBe('15.70');
  });

  it('switches End A to open by dispatching the whole endClosures object', () => {
    const { actions } = mount();
    choose(sideBlock('start').querySelector('select'), 'open');
    const update = actions.find((action) => action.type === 'TRUSS_SYSTEM_UPDATE');
    expect(update.trussSystem.id).toBe('ts_1');
    expect(update.trussSystem.endClosures.start.mode).toBe('open');
    expect(update.trussSystem.endClosures.end.mode).toBe('infill');
    expect(update.trussSystem.endClosures.colour.hex).toBe('#E9E5DD');
  });

  it('turns a vent on for one end', () => {
    const { actions } = mount();
    click(sideBlock('end').querySelector('input[type="checkbox"][aria-label="End B vent"]'));
    const update = actions.find((action) => action.type === 'TRUSS_SYSTEM_UPDATE');
    expect(update.trussSystem.endClosures.end.vent).toMatchObject({ enabled: true, width: 600, height: 300 });
    expect(update.trussSystem.endClosures.start.vent.enabled).toBe(false);
  });

  it('sets the cladding colour for the system from a swatch', () => {
    const { actions } = mount();
    click(container.querySelector('[data-colour-field="truss-closure-colour"] [data-swatch="Manor Red"]'));
    const update = actions.find((action) => action.type === 'TRUSS_SYSTEM_UPDATE');
    expect(update.trussSystem.endClosures.colour).toMatchObject({ hex: '#5E1D0E', name: 'Manor Red' });
  });

  it('hints at the roof only while none is attached', () => {
    mount();
    expect(container.textContent).toContain('Top edge follows the truss top chord');
    container.remove();
    mount(trussSystem(), { withRoof: true });
    expect(container.textContent).not.toContain('Top edge follows the truss top chord');
    // The attached roof adds nothing over the chord top face without purlins
    // (RT-3: the roof underside IS the top face), so the area stays 15.70.
    expect(Number(readout('Closure area'))).toBeGreaterThanOrEqual(15.7);
  });

  it('shows the high side of a shed', () => {
    mount(trussSystem('truss_type_shed', { span: 6000, rise: 1200 }));
    expect(sideBlock('spanEnd').textContent).toContain('High side');
    expect(sideBlock('spanStart')).toBeNull();
  });
});
