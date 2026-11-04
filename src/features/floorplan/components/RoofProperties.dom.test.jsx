// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor } from '@/domain/models';
import { createRoofSystem, createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem } from '@/domain/trussModels';
import { RoofSystemProperties } from './RoofProperties';

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

function rectangle(width, depth) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function mount(roofOptions = {}, { trussSystems = [] } = {}) {
  const floor = createFloor('Ground', 0);
  const attached = trussSystems.length
    ? createRoofSystemForProject({ floors: [floor], trussSystems }, { id: 'roof_1', ...roofOptions })
    : null;
  const roofSystem =
    attached ||
    createRoofSystem('Roof', {
      id: 'roof_1',
      roofType: 'gable',
      baseElevation: 3000,
      boundaryPolygon: rectangle(10000, 8000),
      pitch: { slope: 25, overhang: 300, direction: { x: 0, y: 1 } },
      ...roofOptions,
    });
  const project = { floors: [floor], trussSystems, roofSystem };
  const actions = [];

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <RoofSystemProperties
        project={project}
        roofSystem={roofSystem}
        dispatch={(action) => actions.push(action)}
        editorDispatch={() => {}}
        u={u}
        phases={[]}
      />,
    ),
  );
  return { roofSystem, actions };
}

function sectionHead(title) {
  return [...container.querySelectorAll('button[aria-expanded]')].find((node) =>
    node.textContent.trim().startsWith(title),
  );
}

function readout(label) {
  const node = [...container.querySelectorAll('div')].find(
    (entry) => entry.firstElementChild?.textContent?.trim() === label && entry.children.length >= 3,
  );
  return node ? node.children[2].textContent.trim() : null;
}

describe('RoofSystemProperties — Covering', () => {
  it('renders open, with the covering, its colour and the pitch in both units', () => {
    mount();
    expect(sectionHead('Covering').getAttribute('aria-expanded')).toBe('true');
    const colourField = container.querySelector('[data-colour-field="roof-covering-colour"]');
    expect(colourField.querySelector('input[type="color"]').value).toBe('#bdbfba');
    expect(readout('Pitch')).toBe('25 % · 14.0°');
    expect(readout('Solar abs.')).toBe('0.44 · medium');
    expect(readout('Min pitch')).toBe('5.0°');
  });

  it('dispatches the whole covering with the swatch colour when a swatch is picked', () => {
    const { actions } = mount();
    const swatch = container.querySelector('[data-colour-field="roof-covering-colour"] [data-swatch="Manor Red"]');
    click(swatch);

    const update = actions.find((action) => action.type === 'ROOF_UPDATE');
    expect(update.roofSystem.id).toBe('roof_1');
    expect(update.roofSystem.covering.colour).toEqual({
      hex: '#5E1D0E',
      name: 'Manor Red',
      catalogue: 'colorbond',
      solarAbsorptance: 0.69,
    });
    // The rest of the covering rides along unchanged.
    expect(update.roofSystem.covering.kind).toBe('metal_corrugated');
  });

  it('turns a typed hex into a custom colour named by its hex', () => {
    const { actions } = mount();
    const hexInput = container.querySelector('[data-colour-field="roof-covering-colour"] input[type="text"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      setter.call(hexInput, '#123456');
      hexInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const update = actions.find((action) => action.type === 'ROOF_UPDATE');
    expect(update.roofSystem.covering.colour).toEqual({
      hex: '#123456',
      name: '#123456',
      catalogue: 'custom',
      solarAbsorptance: null,
    });
  });

  it('switches the swatch strip to RAL', () => {
    mount();
    const toggle = [...container.querySelectorAll('[data-colour-field="roof-covering-colour"] button')].find(
      (node) => node.textContent === 'RAL',
    );
    click(toggle);
    expect(
      container.querySelector('[data-colour-field="roof-covering-colour"] [data-swatch="RAL 7016 Anthracite grey"]'),
    ).not.toBeNull();
  });

  it('warns, without blocking, when the pitch is below the covering minimum', () => {
    mount({ pitch: { slope: 5, overhang: 300, direction: { x: 0, y: 1 } }, covering: { kind: 'concrete_tile' } });
    expect(container.textContent).toContain('is below the 15.0° minimum');
  });

  it('warns about truss spacing for a tile roof, not for a sheet roof on purlins', () => {
    const trussSystem = createTrussSystem('Trusses', {
      floorId: 'floor_1',
      baseElevation: 3000,
      trussInstances: [
        {
          trussTypeId: 'truss_type_gable',
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 10000, y: 0 },
          span: 8000,
          rise: 2000,
          spacing: 2000,
          count: 6,
        },
      ],
    });
    mount({ covering: { kind: 'concrete_tile' } }, { trussSystems: [trussSystem] });
    expect(container.textContent).toContain('Trusses at 2000 mm exceed the 900 mm this covering allows.');
    container.remove();
    mount({}, { trussSystems: [trussSystem] });
    expect(container.textContent).not.toContain('Trusses at');
  });

  it('suggests a body build-up and applies it only on request', () => {
    const { actions } = mount();
    expect(readout('Suggested body')).toBe('66');
    expect(actions).toHaveLength(0);
    const button = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Use suggested');
    click(button);
    expect(actions.at(-1)).toEqual({ type: 'ROOF_UPDATE', roofSystem: { id: 'roof_1', slabThickness: 66 } });
  });
});

describe('RoofSystemProperties — Edges & trims', () => {
  it('folds by default and says what it holds', () => {
    mount();
    const head = sectionHead('Edges & trims');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(head.textContent).toContain('Fascia · Barge');
  });

  it('switches a trim off by dispatching the whole trims object', () => {
    const { actions } = mount();
    click(sectionHead('Edges & trims'));
    const fascia = container.querySelector('input[type="checkbox"][aria-label="Fascia"]');
    expect(fascia.checked).toBe(true);
    click(fascia);
    const update = actions.find((action) => action.type === 'ROOF_UPDATE');
    expect(update.roofSystem.trims.fascia).toEqual({ enabled: false, depth: 200, thickness: 25, drop: 0 });
    expect(update.roofSystem.trims.gutter.enabled).toBe(true);
  });
});

// RT-3.1 follow-up: a hand-set slope on an attached gable pivots on the
// bearings, so the panel says so when it differs from the trusses.
describe('RoofSystemProperties — manual slope on an attached roof', () => {
  // Gable trusses at 35.6 %: rise 1281.6 over a 3600 run.
  function gableTrusses() {
    return createTrussSystem('Gable System', {
      id: 'ts_1',
      floorId: 'floor_1',
      baseElevation: 3000,
      purlinSystem: { enabled: true, depth: 50, width: 75, spacing: 900 },
      trussInstances: [
        {
          trussTypeId: 'truss_type_gable',
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 6000, y: 0 },
          span: 7200,
          rise: 1281.6,
          spacing: 1200,
          count: 6,
          overhangs: { start: 300, end: 300 },
        },
      ],
    });
  }

  it('warns, with the real numbers, when the manual slope differs from the trusses', () => {
    mount({ pitchSource: 'manual', pitch: { slope: 32.5 } }, { trussSystems: [gableTrusses()] });
    const warning = container.querySelector('[data-manual-slope-warning]');
    expect(warning).not.toBeNull();
    expect(warning.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Hand-set slope 32.5 % differs from the trusses (35.6 %): the roof pivots on the bearings and leaves the purlins near the ridge. Reset slope seats it.',
    );
  });

  it('says nothing when the roof follows the truss', () => {
    const { roofSystem } = mount({}, { trussSystems: [gableTrusses()] });
    expect(roofSystem.pitchSource).toBe('truss');
    expect(container.querySelector('[data-manual-slope-warning]')).toBeNull();
  });
});
