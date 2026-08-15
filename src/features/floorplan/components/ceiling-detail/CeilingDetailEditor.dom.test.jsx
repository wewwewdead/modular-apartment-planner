/* @vitest-environment jsdom */
/**
 * A ceiling hangs from the beams someone chose, one at a time. These pin the
 * fine control in the Suspension section: every eligible beam on the floor is
 * listed under the level it sits at, ticked when the ceiling is on it, and
 * ticking one rewrites both the attachment and the plane it settles at.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createBeam, createFloor } from '@/domain/models';
import { createCeiling, deriveCeilingHangers } from '@/domain/ceilingModels';
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
}));

// The live 3D pane is lazy and pulls in three.js; this suite is about the right
// panel, so keep it out of the render.
vi.mock('@/features/floorplan/components/preview/ThreePreviewPanel', () => ({ default: () => null }));

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

/** The number input of the field whose label reads exactly `label`. */
function numberField(container, label) {
  const field = Array.from(container.querySelectorAll('label')).find(
    (node) => node.querySelector('span')?.textContent?.trim() === label,
  );
  return field?.querySelector('input[type="number"]') || null;
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
