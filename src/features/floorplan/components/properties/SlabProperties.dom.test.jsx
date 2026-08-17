// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor, createSlab } from '@/domain/models';
import SlabProperties from './SlabProperties';

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

function findByText(selector, text) {
  return [...container.querySelectorAll(selector)].find((node) => node.textContent.trim() === text) || null;
}

function readout(label) {
  const node = [...container.querySelectorAll('div')].find(
    (entry) => entry.firstElementChild?.textContent?.trim() === label,
  );
  return node ? [...node.children].slice(2).map((child) => child.textContent.trim()) : null;
}

function mount(overhang, editorState = {}) {
  const floor = { ...createFloor('First', 1, { elevation: 3000 }), id: 'floor_first' };
  const slab = { ...createSlab(floor.id, rectangle(0, 0, 3000, 5600), 200, 3000), id: 'slab_upper' };
  const actions = [];
  const editorActions = [];

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <SlabProperties
        slab={slab}
        floor={floor}
        overhang={overhang}
        selectedOverhangEdge={editorState.selectedOverhangEdge ?? null}
        belowFootprint={editorState.belowFootprint ?? null}
        profile={editorState.profile ?? null}
        dispatch={(action) => actions.push(action)}
        editorDispatch={(action) => editorActions.push(action)}
        floorId={floor.id}
        u={u}
        phases={[]}
        activeTool={editorState.activeTool ?? null}
        toolState={editorState.toolState ?? {}}
      />,
    ),
  );

  return { slab, floor, actions, editorActions };
}

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

describe('SlabProperties — cantilever', () => {
  const overhang = {
    floorId: 'floor_first',
    belowFloorId: 'floor_ground',
    slabId: 'slab_upper',
    overhangEdges: [{ start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 600 }],
    maxDepthMm: 600,
  };

  it('offers the generator only on a plate that actually reaches past the one below', () => {
    mount(null);
    expect(findByText('button', 'Generate support beams')).toBeNull();

    container.remove();
    mount(overhang);
    expect(findByText('button', 'Generate support beams')).not.toBeNull();
  });

  it('asks for the beams by selection alone — where they go is the model to work out', () => {
    const { actions } = mount(overhang);

    click(findByText('button', 'Generate support beams'));

    expect(actions).toEqual([
      { type: 'SLAB_GENERATE_OVERHANG_SUPPORTS', floorId: 'floor_first', slabId: 'slab_upper' },
    ]);
  });

  it('reports both dimensions of the reach: out past the floor below, and along the edge', () => {
    mount(overhang);

    expect(readout('Reach past floor below')).toEqual(['600', 'mm']);
    expect(readout('Edge run length')).toEqual(['3000', 'mm']);
  });

  it('names each run when there is more than one, so a side is identifiable', () => {
    mount({
      ...overhang,
      maxDepthMm: 1200,
      overhangEdges: [
        { start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 600, lengthMm: 3000 },
        { start: { x: 0, y: 5600 }, end: { x: 0, y: 0 }, depthMm: 1200, lengthMm: 5600 },
      ],
    });

    expect(readout('Edge 1')).toEqual(['3000 long × 600 out', 'mm']);
    expect(readout('Edge 2')).toEqual(['5600 long × 1200 out', 'mm']);
    expect(readout('Governing edge')).toEqual(['Edge 2']);
  });

  it('carries the engineering readouts, with deflection in mm whatever the drawing unit is', () => {
    mount(overhang);

    // 200 mm plate at 600 mm reach: M_Ed = 13.275 · 0.6²/2 = 2.39 kN·m against
    // M_Rd = 14.12, and delta = 7.4 · 600^4/(8 · 10333 · 6.667e8) = 0.02 mm
    // against a 2 · 600/250 = 4.8 mm limit.
    expect(readout('Bending utilisation')).toEqual(['17', '%']);
    expect(readout('Tip deflection, long term')).toEqual(['0.02', 'mm']);
    expect(readout('Deflection limit, 2L/250')).toEqual(['4.8', 'mm']);
    expect(readout('Limited by')).toEqual(['Bending']);
    expect(readout('Back-span behind support')).toEqual(['5000', 'mm']);
    expect(readout('Back-span ratio')).toEqual(['8.3× reach (want 3×)']);
  });

  it('says the verdict in plain language and keeps the assumption next to it', () => {
    mount(overhang);

    expect(container.textContent).toContain('OK — deflection 0.02 mm of a 4.8 mm limit');
    expect(container.textContent).toContain('200 mm C25/30');
    expect(container.textContent).toContain('not a structural design');
  });

  it('takes the reach from the profile it is given rather than a constant of its own', () => {
    mount(
      { ...overhang, maxDepthMm: 900, overhangEdges: [{ ...overhang.overhangEdges[0], depthMm: 900 }] },
      {
        profile: { maxCantileverPlanningLength: 500, minCantileverBackSpanRatio: 3 },
      },
    );

    expect(container.textContent).toContain('past the 500 mm early-planning assumption');
  });

  it('stays quiet about capacity on a plate with nothing hanging off it', () => {
    mount(null);

    expect(readout('Bending utilisation')).toBeNull();
    expect(readout('Tip deflection, long term')).toBeNull();
  });
});

describe('SlabProperties — guided cantilever', () => {
  const pick = {
    slabId: 'slab_upper',
    edgeIndex: 0,
    support: { kind: 'beam', offsetMm: -400 },
    defaultDistanceMm: 600,
    distanceMm: 600,
  };

  function picked(extra = {}) {
    return { activeTool: 'cantilever', toolState: { cantileverPick: { ...pick, ...extra } } };
  }

  it('offers the workflow on a plate that has no overhang yet — that is the plate that wants one', () => {
    mount(null);

    expect(findByText('button', 'Add cantilever')).not.toBeNull();
  });

  it('arms the tool and keeps the plate selected, because the flow is anchored on it', () => {
    const { editorActions } = mount(null);

    click(findByText('button', 'Add cantilever'));

    expect(editorActions.slice(0, 2)).toEqual([
      { type: 'SET_TOOL', tool: 'cantilever' },
      { type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' },
    ]);
  });

  it('asks for an edge before it asks for a number', () => {
    mount(null, { activeTool: 'cantilever', toolState: {} });

    expect(container.textContent).toContain('Hover an edge of this slab on the plan');
    expect(container.querySelector('input[type="number"][step="50"]')).toBeNull();
    expect(findByText('button', 'Apply cantilever')).toBeNull();
  });

  it('names the line the distance is measured from once a side is picked', () => {
    mount(null, picked());

    expect(container.textContent).toContain('from beam below');

    container.remove();
    mount(null, picked({ support: null }));
    expect(container.textContent).toContain('from current edge');
  });

  it('threads a typed distance into tool state so the plan preview follows it', () => {
    const { editorActions } = mount(null, picked());
    const input = container.querySelector('input[type="number"][step="50"]');

    act(() => {
      input.value = '1200';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editorActions[0]).toEqual({
      type: 'UPDATE_TOOL_STATE',
      payload: { cantileverPick: { ...pick, distanceMm: 1200 } },
    });
  });

  it('applies on Enter in the field, with the number just typed rather than the one in state', () => {
    const { actions, editorActions } = mount(null, picked());
    const input = container.querySelector('input[type="number"][step="50"]');

    act(() => {
      input.value = '1200';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Support line 400 into the plate, reach 1200: the edge travels 800 outward,
    // which for this plate's first edge is straight up the page.
    expect(actions).toEqual([
      {
        type: 'SLAB_UPDATE',
        floorId: 'floor_first',
        slab: {
          id: 'slab_upper',
          boundaryPoints: [
            { x: 0, y: -800 },
            { x: 3000, y: -800 },
            { x: 3000, y: 5600 },
            { x: 0, y: 5600 },
          ],
        },
      },
    ]);
    expect(editorActions.map((action) => action.type)).toContain('SET_TOOL');
  });

  it('applies the same way from the button', () => {
    const { actions } = mount(null, picked());

    click(findByText('button', 'Apply cantilever'));

    expect(actions).toHaveLength(1);
    expect(actions[0].slab.boundaryPoints[0]).toEqual({ x: 0, y: -200 });
  });

  it('cancels back to the select tool without touching the plate', () => {
    const { actions, editorActions } = mount(null, picked());

    click(findByText('button', 'Cancel'));

    expect(actions).toHaveLength(0);
    expect(editorActions).toEqual([
      { type: 'UPDATE_TOOL_STATE', payload: { cantileverHoverEdge: null, cantileverPick: null } },
      { type: 'SET_TOOL', tool: 'select' },
      { type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' },
    ]);
  });

  it('ignores a pick belonging to a different plate', () => {
    mount(null, { activeTool: 'cantilever', toolState: { cantileverPick: { ...pick, slabId: 'slab_other' } } });

    expect(container.textContent).toContain('Hover an edge of this slab on the plan');
  });
});

/* ── One cantilever of several ────────────────────────────────────────────
 *
 * Clicking a cantilever on the plan is a way of asking about THAT one, so the
 * panel has to answer about that one. The plate is still what is selected; the
 * run is a sub-selection, and it is an index into geometry that gets remeasured
 * after every edit — so the panel resolves it rather than trusting it.
 */
describe('SlabProperties — the selected cantilever', () => {
  // Two projecting sides of the mounted plate, which is 3000 x 5600: the south
  // edge (index 2) reaching 600, and the west edge (index 3) reaching 1200.
  const twoRuns = {
    floorId: 'floor_first',
    belowFloorId: 'floor_ground',
    slabId: 'slab_upper',
    maxDepthMm: 1200,
    overhangEdges: [
      { start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 600, lengthMm: 3000, boundaryEdgeIndex: 2 },
      { start: { x: 0, y: 5600 }, end: { x: 0, y: 0 }, depthMm: 1200, lengthMm: 5600, boundaryEdgeIndex: 3 },
    ],
  };

  // The footprint below that measurement came off: 1200 in from the west edge,
  // 600 short of the south one.
  const belowFootprint = [
    [
      { x: 1200, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 5000 },
      { x: 1200, y: 5000 },
    ],
  ];

  function selecting(edgeIndex, slabId = 'slab_upper') {
    return { selectedOverhangEdge: { slabId, edgeIndex }, belowFootprint };
  }

  it('reports the picked run rather than the governing one', () => {
    // Edge 2 governs on reach; edge 1 is the one that was clicked, so edge 1 is
    // what every number under it describes — and the governing edge is still
    // named, so choosing to look at one run never hides the worst one.
    mount(twoRuns, selecting(0));

    expect(readout('Showing')).toEqual(['Edge 1 — selected']);
    expect(readout('Governing edge')).toEqual(['Edge 2']);
    // The 600 reach: 17%, as against the deeper edge's 68%.
    expect(readout('Bending utilisation')).toEqual(['17', '%']);
    expect(readout('Edge 1 — selected')).toEqual(['3000 long × 600 out', 'mm']);
  });

  it('unfolds the Cantilever section for a picked run, whatever the stored preference says', () => {
    // The fold is remembered per user. Clicking a run on the plan has to beat
    // it: the click means "show me this", and readouts landing inside a closed
    // section read as no readouts at all. The preference itself is left alone —
    // being shown something is not the same as asking for it.
    window.localStorage.setItem('floorplan.panel.section.slab.cantilever', 'closed');

    mount(twoRuns);
    expect(findByText('button', 'Remove cantilever')).toBeNull();
    expect(readout('Showing')).toBeNull();

    container.remove();
    mount(twoRuns, selecting(0));
    expect(readout('Showing')).toEqual(['Edge 1 — selected']);
    expect(findByText('button', 'Remove cantilever')).not.toBeNull();
    expect(window.localStorage.getItem('floorplan.panel.section.slab.cantilever')).toBe('closed');
  });

  it('falls back to the governing run when nothing is picked', () => {
    mount(twoRuns);

    expect(readout('Showing')).toBeNull();
    expect(readout('Bending utilisation')).toEqual(['68', '%']);
  });

  it('fails soft on a pick that no longer answers to a run', () => {
    // Runs are recomputed from the boundary, so an index can outlive the thing
    // it named. The panel goes back to the governing edge; it never throws, and
    // it never describes a run other than the one lit up on the plan.
    mount(twoRuns, selecting(9));

    expect(readout('Showing')).toBeNull();
    expect(readout('Bending utilisation')).toEqual(['68', '%']);
  });

  it('ignores a pick belonging to another plate', () => {
    mount(twoRuns, selecting(0, 'slab_other'));

    expect(readout('Showing')).toBeNull();
  });
});

describe('SlabProperties — removing a cantilever', () => {
  const belowFootprint = [
    [
      { x: 1200, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 5000 },
      { x: 1200, y: 5000 },
    ],
  ];

  const southRun = {
    start: { x: 3000, y: 5600 },
    end: { x: 0, y: 5600 },
    depthMm: 600,
    lengthMm: 3000,
    boundaryEdgeIndex: 2,
  };
  const westRun = {
    start: { x: 0, y: 5600 },
    end: { x: 0, y: 0 },
    depthMm: 1200,
    lengthMm: 5600,
    boundaryEdgeIndex: 3,
  };

  const oneRun = {
    floorId: 'floor_first',
    belowFloorId: 'floor_ground',
    slabId: 'slab_upper',
    maxDepthMm: 600,
    overhangEdges: [southRun],
  };
  const twoRuns = { ...oneRun, maxDepthMm: 1200, overhangEdges: [southRun, westRun] };

  function removeButtons() {
    return [...container.querySelectorAll('button')].filter((node) => node.textContent.trim() === 'Remove');
  }

  it('offers nothing to remove on a plate with nothing hanging off it', () => {
    mount(null);

    expect(findByText('button', 'Remove cantilever')).toBeNull();
  });

  it('needs no choosing when there is only one run', () => {
    const { actions } = mount(oneRun, { belowFootprint });

    click(findByText('button', 'Remove cantilever'));

    // Pulled back the 600 it was reaching, which lands the edge on the
    // footprint below: one SLAB_UPDATE, so one undo step.
    expect(actions).toEqual([
      {
        type: 'SLAB_UPDATE',
        floorId: 'floor_first',
        slab: {
          id: 'slab_upper',
          boundaryPoints: [
            { x: 0, y: 0 },
            { x: 3000, y: 0 },
            { x: 3000, y: 5000 },
            { x: 0, y: 5000 },
          ],
        },
      },
    ]);
  });

  it('keeps the plate selected and says what it did, in that order', () => {
    const { editorActions } = mount(oneRun, { belowFootprint });

    click(findByText('button', 'Remove cantilever'));

    // SELECT_OBJECT is what drops the sub-selection, and it wipes the status
    // line — so the report has to be said after it.
    expect(editorActions).toEqual([
      { type: 'SELECT_OBJECT', id: 'slab_upper', objectType: 'slab' },
      { type: 'SET_STATUS_MESSAGE', message: 'Cantilever removed — edge pulled back 600 mm.' },
    ]);
  });

  it('removes the run that was picked when there are several', () => {
    const { actions } = mount(twoRuns, {
      belowFootprint,
      selectedOverhangEdge: { slabId: 'slab_upper', edgeIndex: 1 },
    });

    click(findByText('button', 'Remove cantilever'));

    // The west edge, back 1200 onto the footprint below.
    expect(actions[0].slab.boundaryPoints).toEqual([
      { x: 1200, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 5600 },
      { x: 1200, y: 5600 },
    ]);
  });

  it('asks which one in the rows rather than choosing for you', () => {
    const { actions } = mount(twoRuns, { belowFootprint });

    // Several runs and nothing picked: no single command, one affordance per row.
    expect(findByText('button', 'Remove cantilever')).toBeNull();
    expect(removeButtons()).toHaveLength(2);

    click(removeButtons()[1]);
    expect(actions[0].slab.boundaryPoints[0]).toEqual({ x: 1200, y: 0 });
  });

  it('drops the row affordances once a run is picked', () => {
    mount(twoRuns, { belowFootprint, selectedOverhangEdge: { slabId: 'slab_upper', edgeIndex: 0 } });

    expect(removeButtons()).toHaveLength(0);
    expect(findByText('button', 'Remove cantilever')).not.toBeNull();
  });

  it('refuses a run its own edge can never pull back, and touches nothing', () => {
    // A corner tail: it hangs over the diagonal gap left by the edge NEXT to
    // it, so retracting its own edge would only narrow the plate.
    const tail = {
      start: { x: 3000, y: 5050 },
      end: { x: 3000, y: 5600 },
      depthMm: 600,
      lengthMm: 550,
      boundaryEdgeIndex: 1,
    };
    const { actions, editorActions } = mount(
      { ...oneRun, overhangEdges: [tail] },
      { belowFootprint, selectedOverhangEdge: { slabId: 'slab_upper', edgeIndex: 0 } },
    );

    click(findByText('button', 'Remove cantilever'));

    expect(actions).toHaveLength(0);
    expect(editorActions).toEqual([
      {
        type: 'SET_STATUS_MESSAGE',
        message: 'This run hangs out because of the edge beside it — pull that edge back instead.',
      },
    ]);
  });
});
