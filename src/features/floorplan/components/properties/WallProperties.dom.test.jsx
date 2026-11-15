// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createFloor, createSlab, createWall } from '@/domain/models';
import { createWallAssembly } from '@/domain/wallAssemblies';
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

/**
 * The side an offset will go to, picked while a wall is still on its axis. The
 * properties panel stays mounted as the selection moves from wall to wall, so
 * the pick has to belong to the wall it was made on.
 */
describe('WallProperties outboard side', () => {
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

  function fieldInput(label) {
    const field = [...container.querySelectorAll('label')].find(
      (node) => node.firstElementChild?.textContent?.trim() === label,
    );
    return field?.querySelector('input') || null;
  }

  // Bypass walls open the Facade section, so both sit on their axes with the
  // side control on screen.
  function mountSelection() {
    const floor = { ...createFloor('First', 1, { elevation: 3000 }), id: 'floor_first' };
    const wallA = {
      ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200, { height: 2400 }),
      id: 'wall_a',
      framingMode: 'bypass',
    };
    const wallB = {
      ...createWall({ x: 0, y: 3000 }, { x: 6000, y: 3000 }, 200, { height: 2400 }),
      id: 'wall_b',
      framingMode: 'bypass',
    };
    floor.walls = [wallA, wallB];
    floor.slabs = [createSlab(floor.id, PLATE, 250, 3000)];
    const actions = [];

    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const select = (wall) =>
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
    select(wallA);
    return { actions, select, wallA, wallB };
  }

  it('sends the offset to the side picked on that wall', () => {
    const { actions } = mountSelection();

    choose(fieldSelect('Side'), 'left');
    type(fieldInput('Offset from axis'), '300');

    expect(actions).toEqual([
      { type: 'WALL_UPDATE', floorId: 'floor_first', wall: { id: 'wall_a', outboardOffset: -300 } },
    ]);
  });

  it('does not carry a side picked on one wall over to the next wall selected', () => {
    const { actions, select, wallB } = mountSelection();

    choose(fieldSelect('Side'), 'left');
    select(wallB);

    expect(fieldSelect('Side').value).toBe('axis');
    type(fieldInput('Offset from axis'), '300');
    expect(actions).toEqual([
      { type: 'WALL_UPDATE', floorId: 'floor_first', wall: { id: 'wall_b', outboardOffset: 300 } },
    ]);
  });
});

describe('WallProperties finishes (docs/wall-cladding-finishes.md §5.7)', () => {
  const ORANGE = {
    kind: 'paint',
    colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
    sheen: 'matte',
  };
  const paintedExterior = (assembly) => ({ ...assembly, exterior: { ...assembly.exterior, finish: ORANGE } });

  function setNativeValue(input, value) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  }

  function finishesHead() {
    return [...container.querySelectorAll('button[aria-expanded]')].find((node) =>
      node.textContent.trim().startsWith('Finishes'),
    );
  }

  it('opens after Assembly and offers both faces of a masonry wall, with the inside side to say which is which', () => {
    mount();
    const heads = [...container.querySelectorAll('button[aria-expanded]')].map((node) => node.textContent.trim());
    const finishesAt = heads.findIndex((text) => text.startsWith('Finishes'));
    expect(finishesAt).toBe(heads.findIndex((text) => text.startsWith('Assembly')) + 1);
    expect(finishesHead().getAttribute('aria-expanded')).toBe('true');
    expect(fieldSelect('Outside finish').value).toBe('stock');
    expect([...fieldSelect('Inside finish').options].map((option) => option.value)).toEqual([
      'stock',
      'paint',
      'render',
    ]);
    // Masonry now has the inside-side controls a framed wall always had.
    expect(fieldSelect('Inside side')).not.toBeNull();
    expect(container.textContent).toContain('Flip Inside / Outside');
  });

  it('offers only the boarded faces of a framed wall, each with the kinds its board takes', () => {
    const { wall } = mount({
      assembly: createWallAssembly('mixed_board', {
        exterior: { material: 'none', thickness: 0, layerCount: 0 },
      }),
    });
    expect(wall.assembly.exterior.material).toBe('none');
    expect(fieldSelect('Outside finish')).toBeNull();
    expect([...fieldSelect('Inside finish').options].map((option) => option.value)).toEqual([
      'stock',
      'paint',
      'timber',
    ]);
  });

  it('writes the default finish for a chosen kind, and only the assembly', () => {
    const { actions } = mount();
    choose(fieldSelect('Outside finish'), 'render');

    expect(actions).toHaveLength(1);
    expect(Object.keys(actions[0].wall)).toEqual(['id', 'assembly']);
    expect(actions[0].wall.assembly.exterior.finish).toEqual({
      kind: 'render',
      colour: { hex: '#E4DDCC', name: 'Bone', catalogue: 'facade' },
      sheen: 'matte',
    });
    expect(actions[0].wall.assembly.interior).not.toHaveProperty('finish');
  });

  it('puts a face back to stock with no finish key at all', () => {
    const base = createWallAssembly('chb', {}, 200);
    const { actions } = mount({ assembly: paintedExterior(base) });
    choose(fieldSelect('Outside finish'), 'stock');
    expect(actions[0].wall.assembly.exterior).toEqual(base.exterior);
  });

  it('commits a swatch and a typed hex as single edits, never as a gesture', () => {
    const { actions } = mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
    const field = container.querySelector('[data-colour-field="wall-finish-exterior-colour"]');
    act(() => field.querySelector('[data-swatch="Slate Blue"]').click());
    const hex = field.querySelector('input[aria-label="Outside colour hex"]');
    act(() => {
      setNativeValue(hex, '#123456');
      hex.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(actions.map((action) => action.type)).toEqual(['WALL_UPDATE', 'WALL_UPDATE']);
    expect(actions[0].wall.assembly.exterior.finish.colour).toEqual({
      hex: '#6F8597',
      name: 'Slate Blue',
      catalogue: 'facade',
    });
    expect(actions[1].wall.assembly.exterior.finish.colour).toEqual({
      hex: '#123456',
      name: '#123456',
      catalogue: 'custom',
    });
  });

  it('brackets a system-picker drag as one gesture: begin on the first input, end on change', () => {
    const { actions } = mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
    const picker = container.querySelector('input[aria-label="Outside colour picker"]');
    for (const value of ['#112233', '#223344', '#334455']) {
      act(() => {
        setNativeValue(picker, value);
        picker.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    act(() => picker.dispatchEvent(new Event('change', { bubbles: true })));
    // A blur after the close is not a second end.
    act(() => picker.dispatchEvent(new FocusEvent('blur')));

    // Three colours inside one frame are one commit (PP-1 §2.4): the latest,
    // flushed by the close before the gesture ends.
    expect(actions.map((action) => action.type)).toEqual(['BEGIN_DRAG_GESTURE', 'WALL_UPDATE', 'END_DRAG_GESTURE']);
    expect(actions[1].wall.assembly.exterior.finish.colour.hex).toBe('#334455');

    // The next pick is a gesture of its own; a blur ends it too.
    act(() => {
      setNativeValue(picker, '#445566');
      picker.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      picker.focus();
      picker.blur();
    });
    expect(actions.slice(3).map((action) => action.type)).toEqual([
      'BEGIN_DRAG_GESTURE',
      'WALL_UPDATE',
      'END_DRAG_GESTURE',
    ]);
  });

  describe('a long picker drag (docs/paint-edit-performance.md §2.4)', () => {
    afterEach(() => vi.useRealTimers());

    const drag = (picker, count, stepMs) => {
      const sent = [];
      for (let index = 0; index < count; index += 1) {
        const value = `#${(0x102030 + index * 0x010203).toString(16).padStart(6, '0').toUpperCase()}`;
        sent.push(value);
        act(() => {
          setNativeValue(picker, value.toLowerCase());
          picker.dispatchEvent(new Event('input', { bubbles: true }));
        });
        act(() => vi.advanceTimersByTime(stepMs));
      }
      return sent;
    };

    it('commits at a bounded rate, inside the gesture, ending on the last colour', () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
      });
      const { actions } = mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
      const picker = container.querySelector('input[aria-label="Outside colour picker"]');
      // 40 colours at 40 a second: the pointer rate of a brisk drag.
      const sent = drag(picker, 40, 25);
      act(() => picker.dispatchEvent(new Event('change', { bubbles: true })));

      const types = actions.map((action) => action.type);
      expect(types[0]).toBe('BEGIN_DRAG_GESTURE');
      expect(types.at(-1)).toBe('END_DRAG_GESTURE');
      expect(types.filter((type) => type === 'BEGIN_DRAG_GESTURE')).toHaveLength(1);
      const updates = actions.filter((action) => action.type === 'WALL_UPDATE');
      // One second of dragging: about fifteen commits, never one per colour.
      expect(updates.length).toBeGreaterThanOrEqual(10);
      expect(updates.length).toBeLessThanOrEqual(17);
      expect(updates.at(-1).wall.assembly.exterior.finish.colour.hex).toBe(sent.at(-1));
      // The last commit lands before the gesture closes.
      expect(types.at(-2)).toBe('WALL_UPDATE');
    });

    it('sends a trailing commit with no close at all, and nothing after it', () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
      });
      const { actions } = mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
      const picker = container.querySelector('input[aria-label="Outside colour picker"]');
      const sent = drag(picker, 6, 5);
      act(() => vi.advanceTimersByTime(500));
      const updates = actions.filter((action) => action.type === 'WALL_UPDATE');
      expect(updates.at(-1).wall.assembly.exterior.finish.colour.hex).toBe(sent.at(-1));
      const settled = actions.length;
      act(() => vi.advanceTimersByTime(500));
      expect(actions).toHaveLength(settled);
    });

    it('keeps the picker and the hex text on the pointer before the commit lands', () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
      });
      const { actions } = mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
      const field = container.querySelector('[data-colour-field="wall-finish-exterior-colour"]');
      const picker = field.querySelector('input[aria-label="Outside colour picker"]');
      const hex = field.querySelector('input[aria-label="Outside colour hex"]');
      act(() => {
        setNativeValue(picker, '#abcdef');
        picker.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(actions.filter((action) => action.type === 'WALL_UPDATE')).toHaveLength(0);
      expect(picker.value).toBe('#abcdef');
      expect(hex.value).toBe('#ABCDEF');
    });

    it('lets a swatch supersede a picker colour still waiting', () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
      });
      const { actions } = mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
      const field = container.querySelector('[data-colour-field="wall-finish-exterior-colour"]');
      const picker = field.querySelector('input[aria-label="Outside colour picker"]');
      act(() => {
        setNativeValue(picker, '#abcdef');
        picker.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => field.querySelector('[data-swatch="Slate Blue"]').click());
      act(() => vi.advanceTimersByTime(500));
      const updates = actions.filter((action) => action.type === 'WALL_UPDATE');
      expect(updates).toHaveLength(1);
      expect(updates[0].wall.assembly.exterior.finish.colour.hex).toBe('#6F8597');
    });
  });

  it('applies the face finish by scope, and offers the stack only to a wall that has one', () => {
    const { actions } = mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
    const faceButton = (text) =>
      [...container.querySelectorAll('[data-wall-finish-face="exterior"] button')].find(
        (node) => node.textContent.trim() === text,
      );

    expect(faceButton('Whole facade stack').disabled).toBe(true);
    act(() => faceButton('Matching walls on this floor').click());
    act(() => faceButton('Matching walls in the building').click());
    expect(actions).toEqual([
      { type: 'WALL_FACE_FINISH_APPLY', floorId: 'floor_first', wallId: 'wall_1', side: 'exterior', scope: 'floor' },
      { type: 'WALL_FACE_FINISH_APPLY', floorId: 'floor_first', wallId: 'wall_1', side: 'exterior', scope: 'building' },
    ]);

    container.remove();
    const stacked = mount({ stackId: 'stack_1' });
    expect(faceButton('Whole facade stack').disabled).toBe(false);
    act(() => faceButton('Whole facade stack').click());
    expect(stacked.actions).toEqual([
      { type: 'WALL_FACE_FINISH_APPLY', floorId: 'floor_first', wallId: 'wall_1', side: 'exterior', scope: 'stack' },
    ]);
  });

  it('says what each face wears on the folded tab', () => {
    mount({ assembly: paintedExterior(createWallAssembly('chb', {}, 200)) });
    act(() => finishesHead().click());
    expect(finishesHead().textContent).toContain('Outside: Paint · Signal Orange');
    expect(finishesHead().textContent).toContain('Inside: Stock');
  });
});

describe('WallProperties plank siding (spec §6.1)', () => {
  const sided = () => ({
    assembly: createWallAssembly('mixed_board', { exterior: { material: 'siding' } }),
  });
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  function fieldInput(label) {
    const field = [...container.querySelectorAll('label')].find(
      (node) => node.firstElementChild?.textContent?.trim() === label,
    );
    return field?.querySelector('input') || null;
  }
  function type(input, text) {
    act(() => input.focus());
    for (let index = 1; index <= text.length; index += 1) {
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: text[index - 1], bubbles: true })));
      nativeSetter.call(input, text.slice(0, index));
      act(() => input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })));
    }
    act(() => input.blur());
  }

  it('offers siding in both board pickers, from the one option list', () => {
    mount(sided());
    for (const label of ['Inside board', 'Outside board']) {
      expect([...fieldSelect(label).options].map((option) => option.textContent)).toEqual([
        'None',
        'HardieFlex / fiber cement',
        'Plywood',
        'Rainscreen panel',
        'Plank siding',
      ]);
    }
    expect(container.textContent).toContain('Design Outside Face — Plank siding');
  });

  it('shows the course fields under a siding face, with its pitch and how many courses climb the wall', () => {
    mount(sided());
    expect(fieldSelect('Outside boards run').value).toBe('horizontal');
    expect(fieldInput('Outside exposure').value).toBe('140');
    expect(fieldInput('Outside joint').value).toBe('6');
    expect(readout('Outside pitch')).toEqual(['146', 'mm']);
    // A 2400 platform wall on a deck at 3000: joints at 3066, 3212 … 5402 —
    // 16 of them inside the face, so 17 courses.
    expect(readout('Outside courses up')).toEqual(['17']);
    // The plywood face has none of them.
    expect(fieldSelect('Inside boards run')).toBeNull();
  });

  it('writes the course onto the siding layer', () => {
    const { actions } = mount(sided());
    type(fieldInput('Outside exposure'), '180');
    expect(actions.at(-1).wall.assembly.exterior.course).toEqual({
      orientation: 'horizontal',
      exposure: 180,
      joint: 6,
    });
    choose(fieldSelect('Outside boards run'), 'vertical');
    expect(actions.at(-1).wall.assembly.exterior.course.orientation).toBe('vertical');
  });

  it('gives a siding face no Stock finish to go back to', () => {
    mount(sided());
    expect([...fieldSelect('Outside finish').options].map((option) => option.value)).toEqual(['timber', 'paint']);
    expect(fieldSelect('Outside finish').value).toBe('timber');
  });
});

describe('WallProperties accent panels (spec §7.1)', () => {
  const ORANGE = {
    kind: 'paint',
    colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
    sheen: 'matte',
  };
  const withAccents = (extra = {}) => ({
    assembly: createWallAssembly('mixed_board', {
      exterior: {
        material: 'fiber_cement',
        accents: [
          { id: 'a1', u: 100, v: 900, width: 600, height: 600, finish: ORANGE },
          { id: 'a2', u: 1000, v: 900, width: 600, height: 600, finish: ORANGE },
        ],
      },
    }),
    ...extra,
  });
  const faceButton = (text) =>
    [...container.querySelectorAll('[data-wall-finish-face="exterior"] button')].find(
      (node) => node.textContent.trim() === text,
    );

  it('counts a face’s accents and clears them as an assembly-only edit', () => {
    const { actions } = mount(withAccents());
    expect(readout('Outside accents')).toEqual(['2']);
    expect(readout('Inside accents')).toEqual(['0']);
    act(() => faceButton('Clear accents').click());
    expect(actions).toHaveLength(1);
    expect(Object.keys(actions[0].wall)).toEqual(['id', 'assembly']);
    expect(actions[0].wall.assembly.exterior).not.toHaveProperty('accents');
  });

  it('copies them up the facade stack, and only offers that to a wall in one', () => {
    mount(withAccents());
    expect(faceButton('Copy accents to the facade stack').disabled).toBe(true);
    container.remove();
    const stacked = mount(withAccents({ stackId: 'stack_1' }));
    act(() => faceButton('Copy accents to the facade stack').click());
    expect(stacked.actions).toEqual([
      { type: 'WALL_FACE_ACCENTS_APPLY', floorId: 'floor_first', wallId: 'wall_1', side: 'exterior', scope: 'stack' },
    ]);
  });

  it('opens the wall detail editor on that face to edit them', () => {
    const floor = { ...createFloor('First', 1, { elevation: 3000 }), id: 'floor_first' };
    const wall = {
      ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200, { height: 2400 }),
      id: 'wall_1',
      ...withAccents(),
    };
    floor.walls = [wall];
    const editorActions = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() =>
      createRoot(container).render(
        <WallProperties
          wall={wall}
          floor={floor}
          floors={[floor]}
          dispatch={() => {}}
          editorDispatch={(action) => editorActions.push(action)}
          floorId={floor.id}
          u={u}
          phases={[]}
        />,
      ),
    );
    act(() => faceButton('Edit accents').click());
    expect(editorActions).toEqual([
      { type: 'OPEN_WALL_DETAIL_EDITOR', floorId: 'floor_first', wallId: 'wall_1', side: 'exterior' },
    ]);
  });

  it('tells a masonry wall it cannot carry accents yet, rather than offering buttons', () => {
    mount();
    expect(faceButton('Edit accents')).toBeUndefined();
    expect(container.textContent).toContain('Accent panels are drawn on boarded faces of straight framed walls');
  });
});
