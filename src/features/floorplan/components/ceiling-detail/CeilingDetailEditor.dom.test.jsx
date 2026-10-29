/* @vitest-environment jsdom */
/**
 * A ceiling hangs from the beams someone chose, one at a time. These pin the
 * fine control in the Suspension section: every eligible beam on the floor is
 * listed under the level it sits at, ticked when the ceiling is on it, and
 * ticking one rewrites both the attachment and the plane it settles at.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createBeam, createFloor } from '@/domain/models';
import { createCeiling, deriveCeilingHangers, deriveCeilingPanels } from '@/domain/ceilingModels';
import CeilingDetailEditor from './CeilingDetailEditor';

const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

const mocks = vi.hoisted(() => ({
  project: null,
  dispatch: vi.fn(),
  editorDispatch: vi.fn(),
  editor: null,
}));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useProject: () => ({ project: mocks.project, dispatch: mocks.dispatch }),
  useEditor: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
  useEditorState: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
}));

// The live 3D pane is lazy and pulls in three.js. Standing in for it keeps the
// suite out of WebGL while still recording what the editor asks of it — which is
// the whole of the highlight contract between the two panes.
const previewProps = { current: null, pick: null };
vi.mock('@/features/floorplan/components/preview/ThreePreviewPanel', () => ({
  default: (props) => {
    previewProps.current = props;
    previewProps.pick = props.onAssemblyPick;
    return null;
  },
}));

function supportBeam(id, y, level) {
  return {
    ...createBeam({ kind: 'point', x: 0, y }, { kind: 'point', x: 6000, y }, 250, 450, level),
    id,
  };
}

// Three beams at 3000 and one on its own at 3600, so the checklist has two
// levels to group under.
function floorWithBeamLevels() {
  const floor = createFloor('Ground', 0);
  floor.beams = [
    supportBeam('beam_s', 0, 3000),
    supportBeam('beam_m', 2000, 3000),
    supportBeam('beam_n', 4000, 3000),
    supportBeam('beam_high', 3000, 3600),
  ];
  return floor;
}

function mountBeamHungCeiling(beamIds) {
  const floor = floorWithBeamLevels();
  const ceiling = createCeiling('Beam-hung', {
    floorId: floor.id,
    boundaryPolygon: BOUNDARY,
    baseElevation: 3000,
    attachment: { mode: 'beam', beamIds },
  });
  mocks.project = { id: 'project', floors: [floor], ceilings: [ceiling], trussSystems: [] };
  mocks.editor = { ceilingDetailEditor: { ceilingId: ceiling.id } };
  return { ceiling, ...render(<CeilingDetailEditor />) };
}

function mountManualCeiling(options = {}) {
  const floor = options.beamless ? createFloor('Ground', 0) : floorWithBeamLevels();
  const ceiling = createCeiling('Manual', {
    floorId: floor.id,
    boundaryPolygon: BOUNDARY,
    baseElevation: options.baseElevation ?? 2700,
    attachment: { mode: 'manual', beamIds: [] },
    detailing: options.detailing,
  });
  mocks.project = { id: 'project', floors: [floor], ceilings: [ceiling], trussSystems: [] };
  mocks.editor = { ceilingDetailEditor: { ceilingId: ceiling.id } };
  return { ceiling, floor, ...render(<CeilingDetailEditor />) };
}

/** The field whose label reads exactly `label`, whatever control it holds. */
function labelledField(container, label) {
  return Array.from(container.querySelectorAll('label')).find(
    (node) => node.querySelector('span')?.textContent?.trim() === label,
  );
}

/** The number input of the field whose label reads exactly `label`. */
function numberField(container, label) {
  return labelledField(container, label)?.querySelector('input[type="number"]') || null;
}

function selectField(container, label) {
  return labelledField(container, label)?.querySelector('select') || null;
}

/** The fill of every board shape on the reflected ceiling plan, in draw order. */
function boardFills(container) {
  return Array.from(container.querySelectorAll('path[fill-rule="evenodd"]')).map((path) => path.getAttribute('fill'));
}

/**
 * Text of every metric tile labelled `label`. There is more than one — the
 * Suspension section and the Elevations aside both report the same numbers —
 * so the tests assert on all of them at once.
 */
function metricValues(container, label) {
  return Array.from(container.querySelectorAll('div'))
    .filter((node) => node.firstElementChild?.textContent?.trim() === label)
    .map((node) => node.textContent);
}

function expectMetricsToRead(container, label, expected) {
  const values = metricValues(container, label);
  expect(values.length).toBeGreaterThan(0);
  for (const text of values) expect(text).toContain(expected);
}

/** The collapsed-header summary of the panel section with the given id. */
function sectionSummary(container, id) {
  const header = container.querySelector(`button[aria-controls="wall-detail-${id}"]`);
  return header?.querySelector('small')?.textContent ?? null;
}

/** The beam checklist rows, keyed by the label beside each box. */
function beamToggles(container) {
  return Object.fromEntries(
    Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .map((input) => [input.parentElement?.textContent?.trim(), input])
      .filter(([label]) => label?.startsWith('Beam ')),
  );
}

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.editorDispatch.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ceiling support beam checklist', () => {
  it('lists every eligible beam under its level, ticked where the ceiling hangs', () => {
    const { container } = mountBeamHungCeiling(['beam_s', 'beam_n']);

    const toggles = beamToggles(container);
    expect(Object.keys(toggles)).toHaveLength(4);
    expect(toggles['Beam s'].checked).toBe(true);
    expect(toggles['Beam n'].checked).toBe(true);
    expect(toggles['Beam m'].checked).toBe(false);
    expect(toggles['Beam high'].checked).toBe(false);
    // Grouped by the plane each sits at, so a beam 600 mm higher reads as a
    // different thing to hang from rather than one more box in a list.
    expect(container.textContent).toContain('3600 mm');
    expect(container.textContent).toContain('3000 mm');
  });

  it('adds one beam without disturbing the rest, and keeps the stored plane honest', () => {
    const { container, ceiling } = mountBeamHungCeiling(['beam_s', 'beam_n']);

    fireEvent.click(beamToggles(container)['Beam m']);

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'CEILING_UPDATE',
      ceiling: {
        id: ceiling.id,
        attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_m'] },
        baseElevation: 3000,
      },
    });
  });

  it('drops one beam, and re-reads the plane from what is left', () => {
    const { container, ceiling } = mountBeamHungCeiling(['beam_s', 'beam_n', 'beam_high']);

    // The ceiling cannot hang higher than the beam that stops first, so losing
    // the two low beams lifts the whole attachment to the one still carrying it.
    fireEvent.click(beamToggles(container)['Beam s']);
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'CEILING_UPDATE',
      ceiling: {
        id: ceiling.id,
        attachment: { mode: 'beam', beamIds: ['beam_n', 'beam_high'] },
        baseElevation: 3000,
      },
    });

    cleanup();
    mocks.dispatch.mockReset();
    const single = mountBeamHungCeiling(['beam_s', 'beam_high']);
    fireEvent.click(beamToggles(single.container)['Beam s']);
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'CEILING_UPDATE',
      ceiling: {
        id: single.ceiling.id,
        attachment: { mode: 'beam', beamIds: ['beam_high'] },
        baseElevation: 3600,
      },
    });
  });

  it('stays out of the way on a manual ceiling', () => {
    const floor = floorWithBeamLevels();
    const ceiling = createCeiling('Manual', {
      floorId: floor.id,
      boundaryPolygon: BOUNDARY,
      attachment: { mode: 'manual', beamIds: [] },
    });
    mocks.project = { id: 'project', floors: [floor], ceilings: [ceiling], trussSystems: [] };
    mocks.editor = { ceilingDetailEditor: { ceilingId: ceiling.id } };

    const { container } = render(<CeilingDetailEditor />);

    expect(container.textContent).not.toContain('Beams this ceiling hangs from');
    expect(Object.keys(beamToggles(container))).toHaveLength(0);
  });
});

/**
 * A manual ceiling hangs from nothing, so the drop that positions a beam-hung
 * ceiling does nothing for it — the height it does own has to be typeable, and
 * the field that no longer applies has to be gone rather than inert.
 */
describe('manual ceiling height', () => {
  it('offers the board underside instead of the drop, on any floor', () => {
    const { container } = mountManualCeiling({ baseElevation: 2700 });

    expect(numberField(container, 'Board underside height')?.value).toBe('2700');
    expect(numberField(container, 'Drop below attachment')).toBeNull();

    cleanup();
    // The fallback case: no beam on the floor is eligible, so there is no
    // attachment picker above the field either.
    const beamless = mountManualCeiling({ beamless: true, baseElevation: 2400 });
    expect(numberField(beamless.container, 'Board underside height')?.value).toBe('2400');
  });

  it('leaves a beam-hung ceiling with its drop and nothing else', () => {
    const { container } = mountBeamHungCeiling(['beam_s', 'beam_n']);

    expect(numberField(container, 'Drop below attachment')).not.toBeNull();
    expect(numberField(container, 'Board underside height')).toBeNull();
  });

  it('commits a typed height as a bare elevation change', () => {
    const { container, ceiling } = mountManualCeiling({ detailing: { suspension: { drop: 250 } } });

    const field = numberField(container, 'Board underside height');
    fireEvent.change(field, { target: { value: '2450' } });
    fireEvent.blur(field);

    // The payload carries no detailing, so the 250 mm drop this ceiling stored
    // survives the edit and is there again the moment it hangs from beams.
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'CEILING_UPDATE',
      ceiling: { id: ceiling.id, baseElevation: 2450 },
    });
  });

  it('reads its metrics off the stored elevation, so they follow the edit', () => {
    const { container, floor, rerender } = mountManualCeiling({ baseElevation: 2700 });

    expectMetricsToRead(container, 'Attachment', '2700 mm');
    expectMetricsToRead(container, 'Board underside', '2700 mm');

    // Stands in for the store coming back with the committed value: nothing but
    // baseElevation changes, and both readouts move with it.
    const edited = createCeiling('Manual', {
      floorId: floor.id,
      boundaryPolygon: BOUNDARY,
      baseElevation: 2450,
      attachment: { mode: 'manual', beamIds: [] },
    });
    mocks.project = { id: 'project', floors: [floor], ceilings: [edited], trussSystems: [] };
    mocks.editor = { ceilingDetailEditor: { ceilingId: edited.id } };
    rerender(<CeilingDetailEditor />);

    expect(numberField(container, 'Board underside height')?.value).toBe('2450');
    expectMetricsToRead(container, 'Attachment', '2450 mm');
    expectMetricsToRead(container, 'Board underside', '2450 mm');
  });
});

/**
 * A beam-hung ceiling whose supports were all deleted or re-levelled mid-session
 * still hangs from the elevation it last stored, so that elevation has to be
 * typeable. One surviving beam takes the plane back, and the field has to go
 * with it rather than accept a number the next read would overwrite.
 */
describe('stranded beam ceiling attachment height', () => {
  it('offers the stored plane once no support resolves, with the drop still working off it', () => {
    const { container } = mountBeamHungCeiling(['beam_deleted']);

    expect(numberField(container, 'Attachment height')?.value).toBe('3000');
    // The drop is not inert here: the boards hang below the typed plane by it.
    expect(numberField(container, 'Drop below attachment')?.value).toBe('150');
    expect(numberField(container, 'Board underside height')).toBeNull();
    expectMetricsToRead(container, 'Attachment', '3000 mm');
    expectMetricsToRead(container, 'Board underside', '2850 mm');
  });

  it('hides the field while any beam still governs the plane', () => {
    // One beam is short of an outline, so the missing-support warning stands —
    // but it is not short of a plane, and a typed height would be discarded.
    const single = mountBeamHungCeiling(['beam_s', 'beam_deleted']);
    expect(single.container.textContent).toContain('Support beams missing');
    expect(numberField(single.container, 'Attachment height')).toBeNull();
    expect(numberField(single.container, 'Drop below attachment')).not.toBeNull();

    cleanup();
    const many = mountBeamHungCeiling(['beam_s', 'beam_n']);
    expect(numberField(many.container, 'Attachment height')).toBeNull();

    cleanup();
    // Manual ceilings type their board underside instead; the plane field is a
    // beam-mode repair, not a second way to set a manual datum.
    const manual = mountManualCeiling();
    expect(numberField(manual.container, 'Attachment height')).toBeNull();
  });

  it('commits a typed plane as a bare elevation change', () => {
    const { container, ceiling } = mountBeamHungCeiling(['beam_deleted']);

    const field = numberField(container, 'Attachment height');
    fireEvent.change(field, { target: { value: '3200' } });
    fireEvent.blur(field);

    // No attachment and no detailing in the payload: the ceiling stays in beam
    // mode over the beam ids it remembers, so restoring one beam takes over
    // again, and the stored drop survives the edit.
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'CEILING_UPDATE',
      ceiling: { id: ceiling.id, baseElevation: 3200 },
    });
  });
});

/**
 * Selecting something is what re-lays-out the workspace — the status bar grows
 * from "Nothing selected" to a longer label — and the canvas contain-fits itself
 * to whatever height is left, so the drawing can move between a pointerdown and
 * its pointerup. Measured live, that turned a plain click into a drag of
 * whatever it had just picked: the board moved, and a generated grid froze into
 * custom boards to record the move.
 */
describe('clicking a board on the plan', () => {
  const CANVAS_AS_PRESSED = { left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 };
  // The same canvas after the status bar took a second line: 18 px shorter, and
  // pushed down by the same amount.
  const CANVAS_AFTER_RELAYOUT = { left: 0, top: 18, width: 600, height: 382, right: 600, bottom: 400 };

  function pressablePlan(container) {
    const svg = container.querySelector('svg[data-tool]');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    let measured = 0;
    svg.getBoundingClientRect = () => (measured++ === 0 ? CANVAS_AS_PRESSED : CANVAS_AFTER_RELAYOUT);
    return { svg, board: container.querySelector('path[fill-rule="evenodd"]'), measurements: () => measured };
  }

  it('selects the board and commits nothing, though the canvas moves under the pointer', () => {
    const { container } = mountManualCeiling();
    const { svg, board } = pressablePlan(container);
    const at = { clientX: 300, clientY: 200, button: 0, pointerId: 1 };

    fireEvent.pointerDown(board, at);
    fireEvent.pointerUp(svg, at);

    expect(container.textContent).toContain('Selected board');
    // Any dispatch here is a move nobody made: the only edit a click can make is
    // to the selection, which the editor holds itself.
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(sectionSummary(container, 'ceiling-face')).toContain('generated grid');
  });

  it('ignores a drag too small to see, and still commits one that is not', () => {
    const { container } = mountManualCeiling();
    const { svg, board } = pressablePlan(container);
    const at = { clientX: 300, clientY: 200, button: 0, pointerId: 1 };

    // Half a pixel. In ceiling millimetres that is a real number — 5 mm at this
    // scale — which is why the threshold is judged on screen instead.
    fireEvent.pointerDown(board, at);
    fireEvent.pointerUp(svg, { ...at, clientX: 300.5 });
    expect(mocks.dispatch).not.toHaveBeenCalled();

    fireEvent.pointerDown(board, at);
    fireEvent.pointerUp(svg, { ...at, clientX: 340 });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CEILING_UPDATE',
        ceiling: expect.objectContaining({ detailing: expect.any(Object) }),
      }),
    );
  });
});

/**
 * The collapsed Suspension header has to describe the ceiling it belongs to. A
 * manual ceiling applies no drop and hangs nothing, so quoting either number at
 * it states something untrue about the assembly.
 */
describe('suspension section summary', () => {
  it('quotes the drop and the hangers a beam-hung ceiling really has', () => {
    const { container, ceiling } = mountBeamHungCeiling(['beam_s', 'beam_n']);

    const hangers = deriveCeilingHangers(ceiling, mocks.project).length;
    expect(hangers).toBeGreaterThan(1);
    expect(sectionSummary(container, 'ceiling-suspension')).toBe(`150 mm drop · ${hangers} hangers`);
  });

  it('quotes the board underside for a manual ceiling, and claims no hangers', () => {
    const { container, ceiling } = mountManualCeiling({ baseElevation: 2450 });

    expect(sectionSummary(container, 'ceiling-suspension')).toBe('2450 mm underside');

    // Hangers are derived from the plan alone, so the count is not zero — it is
    // meaningless. Every one of them would have to rise from the carrier top to
    // an attachment plane that sits below it, which is why the summary stopped
    // reporting them rather than reporting a zero.
    expect(deriveCeilingHangers(ceiling, mocks.project).length).toBeGreaterThan(0);
  });

  it('keeps quoting the drop on a stranded beam ceiling, which still applies it', () => {
    const { container } = mountBeamHungCeiling(['beam_deleted']);

    expect(sectionSummary(container, 'ceiling-suspension')).toContain('150 mm drop');
  });
});

/**
 * The plan and the live 3D pane are two views of one selection. Picking a board
 * on the plan has to light that board — and only that board — in the pane, in
 * the editor's orange rather than the plan's green; picking one in the pane has
 * to come back and select it on the plan.
 */
describe('selection shared with the 3D pane', () => {
  function pressablePlan(container) {
    const svg = container.querySelector('svg[data-tool]');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 });
    return { svg, board: container.querySelector('path[fill-rule="evenodd"]') };
  }

  it('hands the pane the board that was picked on the plan, in the assembly accent', () => {
    const { container } = mountManualCeiling();
    const { svg, board } = pressablePlan(container);

    expect(previewProps.current.selectionAccent).toBe('assembly');
    expect(previewProps.current.assemblySelection).toBeNull();

    const at = { clientX: 300, clientY: 200, button: 0, pointerId: 1 };
    fireEvent.pointerDown(board, at);
    fireEvent.pointerUp(svg, at);

    // The id is the drawing's own — the same one the 3D descriptors carry, so
    // one board lights up rather than the whole ceiling.
    const selected = previewProps.current.assemblySelection;
    expect(selected.kind).toBe('panel');
    expect(container.textContent).toContain('Selected board');
    expect(typeof selected.id).toBe('string');
  });

  it('takes a pick made in the pane back to the plan', () => {
    mountManualCeiling();

    act(() => previewProps.pick({ kind: 'panel', id: 'p1', side: null }));
    expect(previewProps.current.assemblySelection).toEqual({ kind: 'panel', id: 'p1' });

    // Empty space clears; a part the plan cannot select leaves it alone.
    act(() => previewProps.pick({ kind: 'hanger', id: 'h1', side: null }));
    expect(previewProps.current.assemblySelection).toEqual({ kind: 'panel', id: 'p1' });

    act(() => previewProps.pick(null));
    expect(previewProps.current.assemblySelection).toBeNull();
  });
});

/**
 * Half a ceiling in fiber cement and the rest in plywood is one ceiling. A board
 * carries its own material only when someone said so: the picker offers the
 * ceiling's profile as the default, and choosing it back drops the override
 * rather than freezing today's profile onto the board.
 */
describe('per-board material override', () => {
  const MIXED_PANELS = [
    { id: 'left', u: 0, v: 0, width: 1200, height: 2400, material: 'plywood' },
    { id: 'right', u: 1300, v: 0, width: 1200, height: 2400 },
  ];

  /** The board layout of the last committed ceiling. */
  function committedLayout() {
    return mocks.dispatch.mock.calls.at(-1)?.[0]?.ceiling?.detailing?.face?.layout ?? null;
  }

  function selectBoard(localId) {
    act(() => previewProps.pick({ kind: 'panel', id: localId, side: null }));
  }

  it('names the profile default, and offers both materials beside it', () => {
    const { container } = mountManualCeiling();
    selectBoard('grid-c0-r0');

    const picker = selectField(container, 'Board material');
    expect(Array.from(picker.options).map((option) => option.textContent)).toEqual([
      'Profile default (Fiber cement)',
      'Fiber cement',
      'Plywood',
    ]);
    // A generated board stores nothing, so it can only be following the profile.
    expect(picker.value).toBe('');
  });

  it('seeds the grid into custom boards and stores the override on the one that was picked', () => {
    const { container } = mountManualCeiling();
    selectBoard('grid-c0-r0');

    fireEvent.change(selectField(container, 'Board material'), { target: { value: 'plywood' } });

    const layout = committedLayout();
    // Any per-board edit writes the grid out first, so the other nine boards are
    // still there — and still saying nothing about their material.
    expect(layout.mode).toBe('custom');
    expect(layout.customPanels).toHaveLength(10);
    const overridden = layout.customPanels.filter((panel) => 'material' in panel);
    expect(overridden).toHaveLength(1);
    expect(overridden[0]).toMatchObject({ id: 'grid-c0-r0', material: 'plywood' });
  });

  it('drops the override when the board is put back on the profile default', () => {
    const { container } = mountManualCeiling({
      detailing: { face: { layout: { mode: 'custom', customPanels: MIXED_PANELS } } },
    });
    selectBoard('left');
    expect(selectField(container, 'Board material').value).toBe('plywood');

    fireEvent.change(selectField(container, 'Board material'), { target: { value: '' } });

    // Cleared, not overwritten with today's profile material: the board follows
    // the profile from here on, including wherever it is switched to next.
    const stored = committedLayout().customPanels.find((panel) => panel.id === 'left');
    expect('material' in stored).toBe(false);
  });

  it('draws each board in its own material on the plan', () => {
    // Beamless: a beam crossing the ceiling would cut each board into several
    // shapes, and this is about what colour they are drawn in, not how many.
    const { container } = mountManualCeiling({
      beamless: true,
      detailing: { face: { layout: { mode: 'custom', customPanels: MIXED_PANELS } } },
    });

    const fills = boardFills(container);
    expect(fills).toHaveLength(2);
    expect(new Set(fills).size).toBe(2);

    // Same ceiling in one material draws as one field again.
    cleanup();
    const plain = mountManualCeiling({
      beamless: true,
      detailing: {
        face: {
          // Cleared rather than absent, which the normalizer treats the same way.
          layout: { mode: 'custom', customPanels: MIXED_PANELS.map((panel) => ({ ...panel, material: undefined })) },
        },
      },
    });
    expect(new Set(boardFills(plain.container)).size).toBe(1);
    // The board that never overrode anything is the one that has not moved.
    expect(boardFills(plain.container)[0]).toBe(fills[1]);
  });

  it('breaks the takeoff down by material only when there is more than one', () => {
    const { container } = mountManualCeiling({
      detailing: { face: { layout: { mode: 'custom', customPanels: MIXED_PANELS } } },
    });

    expect(container.textContent).toContain('Sheets are counted per material');
    expectMetricsToRead(container, 'Plywood', '1 board');
    expectMetricsToRead(container, 'Fiber cement', '1 board');

    cleanup();
    const plain = mountManualCeiling();
    expect(plain.container.textContent).not.toContain('Sheets are counted per material');
    expect(metricValues(plain.container, 'Plywood')).toHaveLength(0);
  });
});

/**
 * The wall angle is the edge framing of every ring the ceiling was traced into —
 * its perimeter, and the face of every beam, column and partition cut out of it.
 * Drawn as a profile line it landed 12.5 mm off the ceiling outline in the same
 * weight, which reads as the outline rather than as a member, and the faces of
 * an obstruction looked as though nothing framed them at all.
 */
describe('wall angles on the reflected ceiling plan', () => {
  function wallAngleLines(container) {
    return Array.from(container.querySelectorAll('line')).filter(
      (line) => line.querySelector('title')?.textContent === 'Wall angle',
    );
  }

  it('draws the angle at the width of its own leg, not as a hairline', () => {
    const { container } = mountManualCeiling({ beamless: true });
    const angles = wallAngleLines(container);

    // One per edge of the rectangle the ceiling was drawn on.
    expect(angles).toHaveLength(4);
    for (const angle of angles) {
      expect(Number.parseFloat(angle.style.strokeWidth)).toBeGreaterThanOrEqual(25);
      // A screen-constant stroke would draw the same hairline at every zoom.
      expect(angle.getAttribute('vector-effect')).toBeNull();
      // Nothing selects an angle, and a 25 mm band down every edge of the plan
      // must not swallow the clicks meant for the board under it.
      expect(angle.style.pointerEvents).toBe('none');
    }
  });
});

/**
 * Fixtures are stored on the ceiling and normalized by the catalog on every
 * commit, so the editor's job is to hand the factory whole objects rather than
 * patched fields: a luminaire has no socket for a lamp it was not built around,
 * and a picker that could produce one would be a spec nobody can install.
 */
describe('ceiling light fixtures', () => {
  const CAN = {
    id: 'light_a',
    u: 1500,
    v: 1000,
    fixtureType: 'recessed_can_6',
    bulbType: 'br30',
    colorTempK: 2700,
  };

  function mountLitCeiling(fixtures = [CAN]) {
    return mountManualCeiling({ beamless: true, detailing: { lighting: { fixtures } } });
  }

  /** The lighting of the last committed ceiling. */
  function committedFixtures() {
    return mocks.dispatch.mock.calls.at(-1)?.[0]?.ceiling?.detailing?.lighting?.fixtures ?? null;
  }

  it('lists the stored fixture and draws its symbol on the plan', () => {
    const { container } = mountLitCeiling();

    const symbols = container.querySelectorAll('g[data-fixture-id]');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].getAttribute('data-fixture-id')).toBe('light_a');
    // A 6" can is a plain circle at its true 190 mm aperture, and nothing else.
    expect(symbols[0].querySelector('circle')?.getAttribute('r')).toBe('95');

    expect(sectionSummary(container, 'ceiling-lighting')).toContain('1 fixture');
    // 650 lm on one BR30, straight off the lamp: nobody overrode it.
    expect(sectionSummary(container, 'ceiling-lighting')).toContain('650 lm total');
    expect(selectField(container, 'Fixture type').value).toBe('recessed_can_6');
    expect(numberField(container, 'Output').value).toBe('650');
  });

  it('re-picks the lamp when the fixture type changes under it', () => {
    const { container } = mountLitCeiling();

    fireEvent.change(selectField(container, 'Fixture type'), { target: { value: 'wafer_led' } });

    // A wafer has no socket for a BR30, so the whole object goes back through
    // the factory and comes out with the only lamp a wafer takes.
    expect(committedFixtures()).toHaveLength(1);
    expect(committedFixtures()[0]).toMatchObject({
      id: 'light_a',
      fixtureType: 'wafer_led',
      bulbType: 'led_disk',
      u: 1500,
      v: 1000,
    });
  });

  it('offers only the lamps the fixture takes', () => {
    const { container } = mountLitCeiling();

    const lamps = Array.from(selectField(container, 'Lamp').options).map((option) => option.value);
    expect(lamps).toEqual(['br30', 'br40', 'par30', 'par38', 'a19']);
  });

  it('commits a chosen colour temperature as a number', () => {
    const { container } = mountLitCeiling();

    fireEvent.change(selectField(container, 'Colour temperature'), { target: { value: '4000' } });

    expect(committedFixtures()[0].colorTempK).toBe(4000);
  });

  it('drops the fixture from the stored array when it is deleted', () => {
    const { container } = mountLitCeiling([CAN, { ...CAN, id: 'light_b', u: 3000 }]);

    const remove = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent === 'Delete light',
    );
    expect(remove.length).toBeGreaterThan(0);
    fireEvent.click(remove[0]);

    expect(committedFixtures().map((fixture) => fixture.id)).toEqual(['light_b']);
  });

  it('reports the lighting order in the takeoff, and stays quiet without one', () => {
    const { container } = mountLitCeiling([CAN, { ...CAN, id: 'light_b', u: 3000 }]);

    expectMetricsToRead(container, 'Light fixtures', '2');
    expectMetricsToRead(container, 'Connected load', '18 W');
    expectMetricsToRead(container, 'Installed lumens', '1300 lm');
    // Split by fixture and lamp together, which is how the order is placed.
    expectMetricsToRead(container, '6" recessed downlight', '2 × BR30 flood (65 W eq)');

    cleanup();
    const dark = mountManualCeiling({ beamless: true });
    expect(metricValues(dark.container, 'Light fixtures')).toHaveLength(0);
    expect(dark.container.querySelectorAll('g[data-fixture-id]')).toHaveLength(0);
  });

  it('takes a fixture picked in the 3D pane back to the plan', () => {
    const { container } = mountLitCeiling();

    act(() => previewProps.pick({ kind: 'fixture', id: 'light_a', side: null }));

    expect(previewProps.current.assemblySelection).toEqual({ kind: 'fixture', id: 'light_a' });
    expect(container.textContent).toContain('Selected light');
    expect(container.querySelector('g[data-fixture-id="light_a"]').getAttribute('data-selected')).toBe('true');
  });

  it('commits a drag on the plan as a move of that fixture alone', () => {
    const { container } = mountLitCeiling();
    const svg = container.querySelector('svg[data-tool]');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 });

    const at = { clientX: 150, clientY: 300, button: 0, pointerId: 1 };
    fireEvent.pointerDown(container.querySelector('g[data-fixture-id="light_a"]'), at);
    fireEvent.pointerUp(svg, { ...at, clientX: 250 });

    // 100 px across a 600 px canvas showing 6000 mm is a metre, snapped to the
    // 50 mm grid — and the fixture is still the object the factory built.
    const moved = committedFixtures()[0];
    expect(moved.id).toBe('light_a');
    expect(moved.u).toBe(2500);
    expect(moved.v).toBe(1000);
    expect(moved.fixtureType).toBe('recessed_can_6');
  });
});

/**
 * A screw is a three-pixel dot among several hundred identical ones, so its own
 * colour cannot say which is selected — the drawing rings it instead, the way
 * the wall elevation already did.
 */
describe('selected screw on the plan', () => {
  it('draws a ring around the one screw that is selected, and nothing around the rest', () => {
    const { container } = mountManualCeiling();
    const svg = container.querySelector('svg[data-tool]');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 });

    const screws = Array.from(container.querySelectorAll('title'))
      .filter((node) => node.textContent.startsWith('Screw'))
      .map((node) => node.parentElement);
    expect(screws.length).toBeGreaterThan(10);
    // Unselected, a screw is its head and nothing else.
    for (const screw of screws) expect(screw.querySelectorAll('circle')).toHaveLength(1);

    const at = { clientX: 300, clientY: 200, button: 0, pointerId: 1 };
    fireEvent.pointerDown(screws[3], at);
    fireEvent.pointerUp(svg, at);

    expect(container.textContent).toContain('Selected screw');
    const ringed = screws.filter((screw) => screw.querySelectorAll('circle').length === 2);
    expect(ringed).toHaveLength(1);
    expect(ringed[0]).toBe(screws[3]);
  });
});

/**
 * Measuring on the reflected ceiling plan, to the same rules the wall elevation
 * works by: two clicks or a drag, endpoints that lock onto real geometry and
 * stay tied to it, and a figure drawn to CAD convention rather than a label
 * floating over the drawing.
 */
describe('ceiling dimensions', () => {
  // 600 × 400 px over a 6000 × 4000 mm ceiling: 10 mm per px, V up from the
  // bottom. So clientX 100 is U 1000, and clientY 300 is V 1000.
  const CANVAS = { left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 };

  const SPAN = {
    id: 'dim_a',
    mode: 'horizontal',
    start: { u: 1000, v: 1000 },
    end: { u: 4000, v: 1000 },
    offset: 60,
  };

  function mountMeasuredCeiling(manual = [SPAN], settings = {}) {
    return mountManualCeiling({ beamless: true, detailing: { dimensions: { manual, ...settings } } });
  }

  /** The last committed ceiling's stored measurements. */
  function committedManualDimensions() {
    return mocks.dispatch.mock.calls.at(-1)?.[0]?.ceiling?.detailing?.dimensions?.manual ?? null;
  }

  function checkboxLabelled(container, label) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
      (input) => input.parentElement?.textContent?.trim() === label,
    );
  }

  function measurablePlan(container, { snap = false } = {}) {
    if (!snap) fireEvent.click(checkboxLabelled(container, 'Snap'));
    fireEvent.click(container.querySelector('button[title^="Draw measurement"]'));
    const svg = container.querySelector('svg[data-tool="draw_dimension"]');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    svg.getBoundingClientRect = () => CANVAS;
    return svg;
  }

  /** Every drawn measurement figure, keyed by whether it is derived or hand-drawn. */
  function dimensionFigures(container, source) {
    return Array.from(container.querySelectorAll(`g[data-source="${source}"]`));
  }

  it('draws the derived overall sizes, in the ceiling frame and to the chosen precision', () => {
    const { container } = mountManualCeiling({ beamless: true });

    const labels = dimensionFigures(container, 'automatic').map((figure) => figure.querySelector('text').textContent);
    expect(labels).toContain('6000.00 mm');
    expect(labels).toContain('4000.00 mm');
    expect(sectionSummary(container, 'ceiling-dimensions')).toBe('2 shown · 0 yours');
  });

  it('places a measurement from two clicks and stores exactly what was clicked', () => {
    const { container, ceiling } = mountManualCeiling({ beamless: true });
    const svg = measurablePlan(container);

    // Press and release without travelling: that is the first of two clicks, so
    // nothing is committed yet and the run stays open.
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 300 });
    expect(mocks.dispatch).not.toHaveBeenCalled();

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CEILING_UPDATE', ceiling: expect.objectContaining({ id: ceiling.id }) }),
    );
    expect(committedManualDimensions()).toHaveLength(1);
    // A run this much closer to level than plumb is stored as a set-out along U.
    expect(committedManualDimensions()[0]).toMatchObject({
      mode: 'horizontal',
      start: { u: 1000, v: 1000 },
      end: { u: 4000, v: 1000 },
      startRef: null,
      endRef: null,
    });
  });

  it('accepts a drag as one measurement instead of two clicks', () => {
    const { container } = mountManualCeiling({ beamless: true });
    const svg = measurablePlan(container);

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 350 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 100, clientY: 150 });
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 150 });

    expect(committedManualDimensions()).toHaveLength(1);
    expect(committedManualDimensions()[0]).toMatchObject({
      mode: 'vertical',
      start: { u: 1000, v: 500 },
      end: { u: 1000, v: 2500 },
    });
  });

  it('locks an endpoint onto real geometry and records what it was taken from', () => {
    const { container, ceiling } = mountManualCeiling({ beamless: true });
    const board = deriveCeilingPanels(ceiling, mocks.project).find((panel) => panel.localId === 'grid-c0-r0');
    const svg = measurablePlan(container, { snap: true });

    // 2 mm short of that board's far corner — a fifth of a pixel at this scale.
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: board.u1 / 10, clientY: 400 - board.v1 / 10 + 0.2 });
    fireEvent.pointerUp(svg, { button: 0, pointerId: 1, clientX: board.u1 / 10, clientY: 400 - board.v1 / 10 + 0.2 });
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 500, clientY: 100 });

    const stored = committedManualDimensions()[0];
    // Not the point that was clicked — the corner it was aiming at, exactly, and
    // named so the measurement moves when the board does.
    expect(stored.start).toEqual({ u: board.u1, v: board.v1 });
    expect(stored.startRef).toMatchObject({ entityType: 'panel', entityId: 'grid-c0-r0', anchor: 'vertex_2' });
  });

  it('draws a stored measurement as a CAD figure and reads it in the aside', () => {
    const { container } = mountMeasuredCeiling();

    const figures = dimensionFigures(container, 'custom');
    expect(figures).toHaveLength(1);
    expect(figures[0].querySelector('text').textContent).toBe('3000.00 mm');
    // Tick terminators, not arrowheads, and no marker element anywhere on it.
    expect(figures[0].querySelector('marker')).toBeNull();
    expect(figures[0].querySelectorAll('line').length).toBeGreaterThanOrEqual(5);

    const svg = container.querySelector('svg[data-tool]');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    svg.getBoundingClientRect = () => CANVAS;
    fireEvent.pointerDown(figures[0], { button: 0, pointerId: 1, clientX: 250, clientY: 294 });

    expect(container.textContent).toContain('Selected measurement');
    expect(container.textContent).toContain('measurement selected');
  });

  it('drops a selected measurement from the stored list', () => {
    const { container } = mountMeasuredCeiling([SPAN, { ...SPAN, id: 'dim_b', start: { u: 0, v: 2000 } }]);

    const figures = dimensionFigures(container, 'custom');
    expect(figures).toHaveLength(2);
    const svg = container.querySelector('svg[data-tool]');
    svg.setPointerCapture = () => {};
    svg.releasePointerCapture = () => {};
    svg.getBoundingClientRect = () => CANVAS;

    fireEvent.pointerDown(figures[0], { button: 0, pointerId: 1, clientX: 250, clientY: 294 });
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete measurement'),
    );

    expect(committedManualDimensions().map((dimension) => dimension.id)).toEqual(['dim_b']);
  });

  it('keeps a measurement on the piece it was taken from when that piece moves', () => {
    // Anchored to the north-east corner of an opening rather than to a coordinate.
    const anchored = {
      id: 'dim_anchored',
      mode: 'horizontal',
      start: { u: 0, v: 0 },
      end: { u: 0, v: 0 },
      startRef: { entityType: 'ceiling', entityId: 'ignored', anchor: 'bottom_left' },
      endRef: { entityType: 'opening', entityId: 'hatch', anchor: 'bottom_left' },
    };
    const opening = { id: 'hatch', type: 'access_hatch', u: 2000, v: 1500, width: 600, height: 600 };
    const { container } = mountManualCeiling({
      beamless: true,
      detailing: { openings: [opening], dimensions: { manual: [anchored], showOpenings: false } },
    });

    const figure = dimensionFigures(container, 'custom')[0];
    // 2000 mm along U from the west edge to the hatch, read off the hatch as it
    // stands rather than off anything stored on the measurement.
    expect(figure.querySelector('text').textContent).toBe('2000.00 mm');
  });

  it('turns a derived group off without touching the hand-drawn ones', () => {
    const { container } = mountMeasuredCeiling();
    expect(dimensionFigures(container, 'automatic')).toHaveLength(2);

    fireEvent.click(checkboxLabelled(container, 'Overall ceiling length and depth'));

    const committed = mocks.dispatch.mock.calls.at(-1)[0].ceiling.detailing.dimensions;
    expect(committed.showOverall).toBe(false);
    expect(committed.manual).toHaveLength(1);
  });

  it('hides every measurement behind the Sizes layer toggle', () => {
    const { container } = mountMeasuredCeiling();
    expect(dimensionFigures(container, 'custom')).toHaveLength(1);

    fireEvent.click(checkboxLabelled(container, 'Sizes'));

    expect(dimensionFigures(container, 'custom')).toHaveLength(0);
    expect(dimensionFigures(container, 'automatic')).toHaveLength(0);
  });
});

/**
 * A trace is a run of separate clicks with the pointer free in between, so the
 * canvas may pan under it. Each preview has to be measured against the canvas
 * where it is now — a click used to pin the measurement rect and keep it, and a
 * pan between clicks then had the rubber band pointing away from the cursor.
 */
describe('panel trace pointer mapping', () => {
  it('measures the trace preview against the canvas as it stands after a pan', () => {
    const { container } = mountManualCeiling({ beamless: true });
    fireEvent.click(container.querySelector('button[title^="Trace cut board"]'));
    const svg = container.querySelector('svg[data-tool="trace_panel"]');
    // 600x400 px over a 6000x4000 mm ceiling: 10 mm per px, V up from the bottom.
    let rect = { left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 };
    svg.getBoundingClientRect = () => rect;

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 300 });
    // The canvas pans 200 px left while the pointer stays put, as a space-pan
    // between clicks does; the same client point is now 2000 mm further along.
    rect = { ...rect, left: -200, right: 400 };
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 100, clientY: 300 });

    const preview = container.querySelector('polyline[stroke="#ffb85c"]');
    expect(preview).not.toBeNull();
    expect(preview.getAttribute('points')).toBe('1000,1000 3000,1000');
  });
});
