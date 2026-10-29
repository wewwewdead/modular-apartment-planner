// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor, createSlab, createWall } from '@/domain/models';
import WallProperties from './WallProperties';

/**
 * The Facade section's framing control, which is the only place the difference
 * between a wall that stands on the deck and one that runs past it can be said
 * or read. The static-markup test alongside this covers layout; this one covers
 * what happens when the control is used.
 */

const u = {
  unit: 'mm',
  suffix: 'mm',
  step: (value) => value,
  toDisplay: (value) => value,
  fromDisplay: (value) => Number(value),
};

// The 200-thick wall runs (0,0) → (6000,0), so this plate is under all of it.
const PLATE = [
  { x: -1000, y: -2000 },
  { x: 7000, y: -2000 },
  { x: 7000, y: 2000 },
  { x: -1000, y: 2000 },
];

let container = null;

afterEach(() => {
  container?.remove();
  container = null;
  window.localStorage.clear();
});

function mount(wallOverrides = {}) {
  const floor = { ...createFloor('First', 1, { elevation: 3000 }), id: 'floor_first' };
  const wall = {
    ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200, { height: 2400 }),
    id: 'wall_1',
    ...wallOverrides,
  };
  floor.walls = [wall];
  floor.slabs = [createSlab(floor.id, PLATE, 250, 3000)];
  const actions = [];

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <WallProperties
        wall={wall}
        floor={floor}
        floors={[floor]}
        dispatch={(action) => actions.push(action)}
        editorDispatch={() => {}}
        floorId={floor.id}
        u={u}
        phases={[]}
      />,
    ),
  );

  return { actions, floor, wall };
}

function fieldSelect(label) {
  const field = [...container.querySelectorAll('label')].find(
    (node) => node.firstElementChild?.textContent?.trim() === label,
  );
  return field?.querySelector('select') || null;
}

function choose(select, value) {
  select.value = value;
  act(() => select.dispatchEvent(new Event('change', { bubbles: true })));
}

function readout(label) {
  const node = [...container.querySelectorAll('div')].find(
    (entry) => entry.firstElementChild?.textContent?.trim() === label,
  );
  return node ? [...node.children].slice(2).map((child) => child.textContent.trim()) : null;
}

describe('WallProperties framing control', () => {
  it('writes the framing mode the user picks', () => {
    // Offset walls open the Facade section, which is where the control lives.
    const { actions } = mount({ outboardOffset: 250 });

    const select = fieldSelect('Framing');
    expect(select.value).toBe('platform');

    choose(select, 'bypass');

    expect(actions).toEqual([
      { type: 'WALL_UPDATE', floorId: 'floor_first', wall: { id: 'wall_1', framingMode: 'bypass' } },
    ]);
  });

  it('takes the top fit away from a bypass wall and says why', () => {
    mount({ framingMode: 'bypass' });

    // Still on screen and still readable — the decision was taken over, not hidden.
    expect(fieldSelect('Top').disabled).toBe(true);
    expect(container.textContent).toContain('runs past the beams by definition');
  });

  it('leaves the top fit alone for a platform wall', () => {
    mount({ outboardOffset: 250 });

    expect(fieldSelect('Top').disabled).toBe(false);
    expect(container.textContent).not.toContain('runs past the beams by definition');
  });

  it('reports where a bypass wall actually runs', () => {
    mount({ framingMode: 'bypass' });

    // 250 below the floor at 3000, up to the floor above at 6000.
    expect(readout('Runs from / to')).toEqual(['2750 → 6000', 'mm']);
  });

  it('has nothing to report about the run of a platform wall', () => {
    mount({ outboardOffset: 250 });

    expect(readout('Runs from / to')).toBeNull();
  });
});

/**
 * The structural role has been read by the coordination checks since they were
 * written and, until now, written by nothing — so those checks could never fire.
 * This is the control that ends that, and the test is that it writes the field.
 */
describe('WallProperties structural role', () => {
  it('starts every wall non-structural', () => {
    mount({ outboardOffset: 250 });

    expect(fieldSelect('Structural role').value).toBe('nonstructural');
  });

  it('writes the role the user declares', () => {
    const { actions } = mount({ outboardOffset: 250 });

    choose(fieldSelect('Structural role'), 'loadbearing');

    expect(actions).toEqual([
      { type: 'WALL_UPDATE', floorId: 'floor_first', wall: { id: 'wall_1', structuralRole: 'loadbearing' } },
    ]);
  });

  it('reads back a wall already declared load-bearing, and says what that costs it', () => {
    mount({ outboardOffset: 250, structuralRole: 'loadbearing' });

    expect(fieldSelect('Structural role').value).toBe('loadbearing');
    expect(container.textContent).toContain('member or foundation they stand on');
  });

  it('gives the declaration up when the wall becomes a board partition', () => {
    // Deliberate: what this app generates for a framed wall is a partition, so a
    // load-bearing declaration must not survive the switch by inertia.
    const { actions } = mount({ outboardOffset: 250, structuralRole: 'loadbearing' });

    choose(fieldSelect('Assembly'), 'fiber_cement');

    expect(actions).toHaveLength(1);
    expect(actions[0].wall).toMatchObject({ id: 'wall_1', structuralRole: 'nonstructural' });
  });

  it('leaves the declaration standing when the assembly is still masonry', () => {
    const { actions } = mount({ outboardOffset: 250, structuralRole: 'loadbearing' });

    choose(fieldSelect('Assembly'), 'chb');

    expect(actions[0].wall).toMatchObject({ id: 'wall_1', structuralRole: 'loadbearing' });
  });
});

/**
 * The corner detail's two numbers. The panel and the wall detail editor write
 * the same stored fields through the same assembly update path, which is what
 * keeps the plan, the elevation and the 3D preview from disagreeing about where
 * a wall's cladding stops.
 */
describe('WallProperties board overhang', () => {
  const framed = {
    assembly: { preset: 'mixed_board', system: 'framed', exterior: { material: 'plywood', thickness: 12 } },
  };

  function fieldInput(label) {
    const field = [...container.querySelectorAll('label')].find(
      (node) => node.firstElementChild?.textContent?.trim() === label,
    );
    return field?.querySelector('input') || null;
  }

  // Typed, not stepped: the DOM value goes through the native setter or React's
  // value tracker swallows the event, and the keydown plus inputType are how the
  // draft field tells a keystroke from a spinner click. Blur is the commit.
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  function type(input, text) {
    act(() => input.focus());
    for (let index = 1; index <= text.length; index += 1) {
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: text[index - 1], bubbles: true })));
      nativeSetter.call(input, text.slice(0, index));
      act(() => input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })));
    }
    act(() => input.blur());
  }

  it('offers an overhang pair on each boarded face and none on a bare one', () => {
    mount({ ...framed, assembly: { ...framed.assembly, interior: { material: 'none' } } });

    expect(fieldInput('Outside overhang start')).not.toBeNull();
    expect(fieldInput('Outside overhang end')).not.toBeNull();
    // No board on the inside face, so there is nothing there to overhang.
    expect(fieldInput('Inside overhang start')).toBeNull();
  });

  it('writes the overhang onto the board layer the user is editing', () => {
    const { actions } = mount(framed);

    type(fieldInput('Outside overhang end'), '137');

    expect(actions).toHaveLength(1);
    const written = actions[0].wall.assembly;
    expect(written.exterior).toMatchObject({ material: 'plywood', overhangEnd: 137, overhangStart: 0 });
    // The other face is untouched, and so is the wall's built thickness — a
    // board that runs further does not make the wall any thicker.
    expect(written.interior.overhangEnd).toBe(0);
    expect(actions[0].wall.thickness).toBe(99);
  });

  it('takes a setback, which is the other half of the same corner detail', () => {
    const { actions } = mount(framed);

    // A lone minus commits nothing — it is not a number yet. Without the draft
    // the panel would write 0 back over the box before the digits arrived.
    type(fieldInput('Outside overhang start'), '-90');

    expect(actions[0].wall.assembly.exterior.overhangStart).toBe(-90);
  });

  it('reads back what is already stored', () => {
    mount({
      assembly: {
        preset: 'mixed_board',
        system: 'framed',
        exterior: { material: 'plywood', thickness: 12, overhangStart: 40, overhangEnd: -25 },
      },
    });

    expect(fieldInput('Outside overhang start').value).toBe('40');
    expect(fieldInput('Outside overhang end').value).toBe('-25');
  });
});
