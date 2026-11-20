// @vitest-environment jsdom
// Gauging off a flange at the press brake (docs/sketch-studio-skin-gauge.md
// §4.6, §4.7, SG-1): the user's two hits in the workspace (bend at L 20, the
// same edge again, L 30 read off bend 1's skin: the readouts and the
// committed bend at flat 48.9306), Gauge off → Bend 1's flange with L 15 (flat
// 33.9306), the hint under the field and its button, and the panel's words
// for an armed try whose order reads otherwise. The kernel hook and the 3D
// viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { forgetPunch } from './brakeMemory.js';
import { brakePatch, brakeSessionDefaults, brakeStation, sequenceChecks } from './brakeStation.js';
import { emptyModel } from './model.js';
import { machineOf } from './shopCatalog.js';
import { sheetMetalPart } from './ShopPanels.jsx';
// The whole workspace renders: allow for the full suite's load.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: [],
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [100, 60, 30],
        ],
        placement: [],
      })),
    },
    request: vi.fn(),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
beforeEach(() => forgetPunch());
afterEach(() => cleanup());

// §3's blank: 300 × 100, t 1.2 SPCC; the left edge (edge 4) on the backgauge.
const W = 300,
  H = 100;
const LEFT = 3;
const line = (id, x, angle = 90) => ({
  id,
  a: [x, 0],
  b: [x, H],
  angle,
  direction: 'up',
  radius: null,
  punch: 'straight-88',
});
const sheetModel = (bends = []) => {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.2, name: 'Tray' });
  part.id = 'tray';
  part.features[0].bends = bends;
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        profile: { type: 'rectangle', width: W, height: H, origin: [0, 0] },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
};
function setup(model) {
  let current = model;
  const setCadModel = vi.fn((next) => {
    current = next;
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model: current }}
        setCadModel={setCadModel}
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  act(() => viewport.props.onSelect('tray-1'));
  return { rerender: () => view.rerender(workspace()), model: () => current };
}
const region = () => screen.getByRole('region', { name: 'Press brake' });
const map = () => screen.getByRole('figure', { name: 'Flat blank' });
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const openBrake = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
};
const fill = (label, value) => {
  const field = within(region()).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};
const readout = (label) => within(region()).getByLabelText(label, { exact: true }).textContent;
const pickEdge = () => act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 4' })));
const pedal = (harness) => {
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Bend', exact: true })));
  const stroke = viewport.props.brakeView.stroke;
  act(() => viewport.props.onBrakeStrokeEnd(stroke.token));
  harness.rerender();
};
const bendsOf = (harness) => harness.model().parts[0].features[0].bends;

it('the user’s two hits: L 20, then the same edge, L 30 off bend 1’s skin, committed at flat 48.9306', () => {
  const harness = setup(sheetModel());
  openBrake();
  pickEdge();
  fill('Backgauge L (mm)', 20);
  // Nothing bent yet: no Gauge off, L from the edge, no flat-blank line readout.
  expect(within(region()).queryByLabelText('Gauge off')).toBe(null);
  expect(readout('Backgauge L')).toBe('20 mm');
  expect(within(region()).queryByLabelText('Line on the flat blank')).toBe(null);
  pedal(harness);
  expect(bendsOf(harness)).toHaveLength(1);
  expect(bendsOf(harness)[0].a[0]).toBeCloseTo(20, 9);
  // The same edge again, L 30: 30 from the outside face of bend 1's flange.
  pickEdge();
  expect(within(region()).getByLabelText('Gauge off').value).toBe('auto');
  // At the L kept (20) the line is bend 1's: bend it on (tight bends §4.4), the angle set on arriving.
  expect(within(region()).getByRole('note', { name: 'Bend on' })).toBeTruthy();
  fill('Backgauge L (mm)', 30);
  // Moved on before the angle was touched: the angle the operator had (90°) is back.
  expect(within(region()).getByLabelText('Bend angle (°)', { exact: true }).value).toBe('90');
  expect(within(region()).getByLabelText('Backgauge L (mm)', { exact: true }).value).toBe('30');
  expect(readout('Backgauge L')).toBe("30 mm · off bend 1's flange");
  expect(within(region()).getByLabelText('Backgauge L', { exact: true }).closest('.cad-brake-readout').title).toBe(
    "The fingers stop on the outside face of bend 1's flange, not on the blank's edge",
  );
  expect(readout('Line on the flat blank')).toBe('48.93 mm from edge 4');
  // The 3D view stands the fingers at the reading, against the standing flange.
  expect(viewport.props.brakeView.gaugeDistance).toBeCloseTo(30, 6);
  pedal(harness);
  const bends = bendsOf(harness);
  expect(bends).toHaveLength(2);
  expect(bends[1].a[0]).toBeCloseTo(48.9306, 3);
  expect(bends[1].b[0]).toBeCloseTo(48.9306, 3);
});

it('Gauge off: Bend 1’s flange with L 15 is flat 33.9306; automatic, L 15 is from the edge, and the hint says so', () => {
  setup(sheetModel([line('b1', 20)]));
  openBrake();
  pickEdge();
  const choice = within(region()).getByLabelText('Gauge off');
  expect([...choice.options].map((o) => o.textContent)).toEqual(['Automatic', 'The edge', "Bend 1's flange"]);
  fill('Backgauge L (mm)', 15);
  // Automatic took the edge: a line inside bend 1's flange, and the hint with its one click.
  expect(readout('Backgauge L')).toBe('15 mm');
  const hint = within(region()).getByRole('note', { name: 'Gauge off a flange' });
  expect(hint.textContent).toBe("L 15 is from the edge, inside bend 1's flange. Gauge off bend 1's flange");
  act(() => fireEvent.click(within(hint).getByRole('button', { name: "Gauge off bend 1's flange" })));
  expect(within(region()).getByLabelText('Gauge off').value).toBe('b1');
  expect(within(region()).getByLabelText('Backgauge L (mm)', { exact: true }).value).toBe('15');
  expect(readout('Line on the flat blank')).toBe('33.93 mm from edge 4');
  expect(readout('Backgauge L')).toBe("15 mm · off bend 1's flange");
  expect(within(region()).queryByRole('note', { name: 'Gauge off a flange' })).toBe(null);
  // Back to the edge by hand: the L stays, the line moves.
  act(() => fireEvent.change(within(region()).getByLabelText('Gauge off'), { target: { value: 'edge' } }));
  expect(readout('Backgauge L')).toBe('15 mm');
  expect(within(region()).queryByLabelText('Line on the flat blank')).toBe(null);
  // And by the select to bend 1's flange: the same as the hint's click.
  act(() => fireEvent.change(within(region()).getByLabelText('Gauge off'), { target: { value: 'b1' } }));
  expect(readout('Line on the flat blank')).toBe('33.93 mm from edge 4');
});

// ---------------------------------------------------------------- the panel alone
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'tray-1',
  mode: 'gauge',
  edge: LEFT,
  distance: 20,
  ...patch,
});
const panelOf = (model, s) => {
  const station = brakeStation({ model, session: s, advise: false });
  const checks = sequenceChecks({ fold: station.fold, machine: machineOf('brake-50-2000') });
  return render(
    <PressBrakePanel
      station={station}
      session={s}
      checks={checks}
      onSession={() => {}}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
      onBendOn={() => {}}
    />,
  );
};

it('an armed try whose order reads otherwise: that order’s reading and why', () => {
  const model = sheetModel([line('b1', 20)]);
  const before = session();
  const s = brakePatch(before, { distance: 30 }, brakeStation({ model, session: before, advise: false }));
  panelOf(model, { ...s, armed: { kind: 'before', key: 'b1' } });
  expect(readout('Backgauge L')).toBe('48.93 mm · made before bend 1: the sheet is still flat there');
  // The field keeps the L the part as made reads; the line where it was.
  expect(within(region()).getByLabelText('Backgauge L (mm)', { exact: true }).value).toBe('30');
  expect(readout('Line on the flat blank')).toBe('48.93 mm from edge 4');
});

it('the edge held past bend 1 is refused in words, with the click that gauges off the flange', () => {
  const model = sheetModel([line('b1', 20)]);
  const before = session();
  const s = brakePatch(
    before,
    { stopHold: 'edge', distance: 30 },
    brakeStation({ model, session: before, advise: false }),
  );
  panelOf(model, s);
  const card = screen.getByText(/^Gauged off the edge, L 30 mm does not reach this line/).closest('.cad-problem');
  expect(within(card).getByRole('button', { name: "Gauge off bend 1's flange" })).toBeTruthy();
  expect(within(region()).getByRole('button', { name: 'Bend', exact: true }).disabled).toBe(true);
});
