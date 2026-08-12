// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NumberField, Readout, Section } from './PanelKit';
import WallProperties from './WallProperties';

const u = {
  step: () => 1,
  suffix: 'mm',
  fromDisplay: (value) => Number(value),
  toDisplay: (value) => value,
};

let container = null;

function mount(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  container?.remove();
  container = null;
  window.localStorage.clear();
});

describe('Section', () => {
  it('opens and closes, and remembers the choice', () => {
    const node = mount(
      <Section id="test.section" title="Framing">
        <p>inside the section</p>
      </Section>,
    );
    expect(node.textContent).toContain('inside the section');

    act(() => node.querySelector('button').click());

    expect(node.textContent).not.toContain('inside the section');
    expect(window.localStorage.getItem('floorplan.panel.section.test.section')).toBe('closed');
  });

  it('starts from the remembered choice rather than the default', () => {
    window.localStorage.setItem('floorplan.panel.section.test.remembered', 'closed');

    const node = mount(
      <Section id="test.remembered" title="Framing" defaultOpen>
        <p>inside the section</p>
      </Section>,
    );

    expect(node.textContent).not.toContain('inside the section');
    expect(node.querySelector('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a summary only while collapsed, so nothing hides silently', () => {
    const node = mount(
      <Section id="test.summary" title="Framing" summary="9 studs @ 400">
        <p>inside</p>
      </Section>,
    );
    expect(node.textContent).not.toContain('9 studs @ 400');

    act(() => node.querySelector('button').click());

    expect(node.textContent).toContain('9 studs @ 400');
  });
});

describe('Readout', () => {
  // The whole point of the readout: a derived number is not an input, so it
  // cannot be focused, typed into, or given dead spinner arrows.
  it('renders derived values as text, never as a form control', () => {
    const node = mount(<Readout label="Stud count" value={9} unit="mm" />);

    expect(node.querySelector('input')).toBeNull();
    expect(node.textContent).toContain('Stud count');
    expect(node.textContent).toContain('9');
  });
});

const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

// The DOM value has to go through the native setter or React's value tracker
// swallows the event. The keydown and the inputType are how the field tells
// typing apart from the spinner, so a test without them is testing the spinner.
function type(input, text) {
  const deleting = text.length < input.value.length;
  act(() =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: deleting ? 'Backspace' : text.slice(-1), bubbles: true })),
  );
  nativeSetter.call(input, text);
  act(() =>
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: deleting ? 'deleteContentBackward' : 'insertText' }),
    ),
  );
}

// A digit typed onto whatever the box is showing right now — which is what a
// browser does, and precisely how a clamped commit used to eat the rest of the
// number the user was still typing.
function typeDigit(input, digit) {
  type(input, input.value + digit);
}

// What the arrow buttons and the wheel do: step the value, then a plain input
// event with no inputType, because no text was edited.
function spinUp(input) {
  act(() => input.stepUp());
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

/** A wall height: 3000mm, floored at 100 the way WallProperties floors it. */
function HeightHarness({ committed }) {
  const [height, setHeight] = useState(3000);
  return (
    <NumberField
      label="Height"
      value={height}
      step={100}
      unit="mm"
      onChange={(v) => {
        const clamped = Math.max(100, v);
        committed.push(clamped);
        setHeight(clamped);
      }}
    />
  );
}

describe('NumberField', () => {
  /**
   * The reported bug, exactly. Committing every keystroke meant the first digit
   * of 2000 was committed as 2, floored to 100, and written back into the box —
   * so the remaining digits landed on the clamp: 100 → 1000 → 10000 → 100000.
   * Only the spinner appeared to work, because it steps from a legal value.
   */
  it('lets a value be typed over instead of building on the clamped commit', () => {
    const committed = [];
    const node = mount(<HeightHarness committed={committed} />);
    const input = node.querySelector('input');
    expect(input.value).toBe('3000');

    act(() => input.focus());
    // Select-all puts the first digit in on its own; every digit after it lands
    // on whatever the box is showing by then.
    type(input, '2');
    typeDigit(input, '0');
    typeDigit(input, '0');
    typeDigit(input, '0');

    expect(input.value).toBe('2000');
    expect(committed).toEqual([]);

    act(() => input.blur());
    expect(committed).toEqual([2000]);
    expect(input.value).toBe('2000');
  });

  // Clearing used to be impossible: parseFloat('') is NaN, the change was
  // dropped, and the controlled value put 3000 straight back in the box.
  it('can be emptied without the old value snapping back', () => {
    const committed = [];
    const node = mount(<HeightHarness committed={committed} />);
    const input = node.querySelector('input');

    act(() => input.focus());
    type(input, '');

    expect(input.value).toBe('');
    expect(committed).toEqual([]);
  });

  it('commits on Enter', () => {
    const committed = [];
    const node = mount(<HeightHarness committed={committed} />);
    const input = node.querySelector('input');

    act(() => input.focus());
    type(input, '2400');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

    expect(committed).toEqual([2400]);
  });

  it('reverts on Escape', () => {
    const committed = [];
    const node = mount(<HeightHarness committed={committed} />);
    const input = node.querySelector('input');

    act(() => input.focus());
    type(input, '2400');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    expect(committed).toEqual([]);
    expect(input.value).toBe('3000');
  });

  // The half of the field that always worked, and must keep working.
  it('still commits the moment the spinner steps it', () => {
    const committed = [];
    const node = mount(<HeightHarness committed={committed} />);
    const input = node.querySelector('input');

    act(() => input.focus());
    spinUp(input);

    expect(committed).toEqual([3100]);
    expect(input.value).toBe('3100');
  });

  it('never commits a partial entry', () => {
    const committed = [];
    const node = mount(<HeightHarness committed={committed} />);
    const input = node.querySelector('input');

    act(() => input.focus());
    type(input, '');
    type(input, '-');
    type(input, '2.');
    act(() => input.blur());

    // '2.' does parse, to 2 — the point is that nothing NaN ever escapes.
    expect(committed.every((entry) => Number.isFinite(entry))).toBe(true);
  });
});

describe('WallProperties framing section', () => {
  it('reveals the framing controls once the section is opened', () => {
    window.localStorage.setItem('floorplan.panel.section.wall.framing', 'open');

    const wall = {
      id: 'w1',
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 },
      thickness: 100,
      height: 2400,
      assembly: { preset: 'fiber_cement', system: 'framed' },
    };
    const node = mount(
      <WallProperties
        wall={wall}
        floor={{ walls: [wall], doors: [], windows: [], columns: [], rooms: [] }}
        dispatch={() => {}}
        editorDispatch={() => {}}
        floorId="floor_1"
        u={u}
        phases={[]}
      />,
    );

    expect(node.textContent).toContain('Stud spacing');
    expect(node.textContent).toContain('Double-stud wall');
    expect(node.textContent).toContain('Noggin rows');
    // Derived framing figures are readouts, not inputs.
    expect(node.textContent).toContain('Stud count');
    expect([...node.querySelectorAll('input')].some((input) => input.value === '9')).toBe(false);
  });
});
