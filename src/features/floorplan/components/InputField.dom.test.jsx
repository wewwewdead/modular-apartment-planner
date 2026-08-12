// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import InputField from './InputField';

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
});

const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

// Typing into a controlled input: the DOM value has to be set through the
// native setter or React's own value tracker swallows the event. The keydown and
// the inputType are not decoration — they are exactly how the field tells typing
// apart from the spinner, so a test that omits them is testing the spinner.
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
// browser does, and how a clamped commit used to eat the rest of the number.
function typeDigit(input, digit) {
  type(input, input.value + digit);
}

function press(input, key) {
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

// What the arrow buttons and the wheel do: the browser steps the value and fires
// a plain input event, with no inputType, because no text was edited.
function spinUp(input) {
  act(() => input.stepUp());
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

function NumberHarness({ committed, initial = 0, clamp = (v) => v }) {
  const [value, setValue] = useState(initial);
  return (
    <InputField
      label="Rotation"
      type="number"
      step={1}
      value={value}
      onChange={(next) => {
        const settled = clamp(next);
        committed.push(settled);
        setValue(settled);
      }}
    />
  );
}

describe('InputField number entry', () => {
  it('lets a number be cleared and retyped instead of writing the old value back', () => {
    const committed = [];
    const node = mount(<NumberHarness committed={committed} />);
    const input = node.querySelector('input');
    act(() => input.focus());

    // Emptying the field (and a lone '-', which the DOM sanitizes to the same
    // empty string) parses to nothing, so nothing is committed — but what was
    // typed has to stay on screen or the rest of the number can never follow.
    type(input, '');
    expect(committed).toEqual([]);
    expect(input.value).toBe('');

    type(input, '-4');
    type(input, '-45');
    expect(input.value).toBe('-45');

    act(() => input.blur());
    expect(committed).toEqual([-45]);
    expect(input.value).toBe('-45');
  });

  it('never hands a non-finite number upstream', () => {
    const committed = [];
    const node = mount(<NumberHarness committed={committed} initial={12} />);
    const input = node.querySelector('input');
    act(() => input.focus());

    type(input, '');
    type(input, 'e');
    type(input, '.');
    act(() => input.blur());

    expect(committed).toEqual([]);
  });

  it('shows the committed value again once the field is left', () => {
    const committed = [];
    const node = mount(<NumberHarness committed={committed} initial={12} />);
    const input = node.querySelector('input');

    act(() => input.focus());
    type(input, '');
    act(() => input.blur());

    expect(input.value).toBe('12');
  });

  // The bug this field exists to prevent: a value that is clamped upstream used
  // to land back in the box between keystrokes, so the digits still to come were
  // typed onto the clamp instead of onto what the user had entered.
  it('replaces the whole value when it is typed over, even against a clamp', () => {
    const committed = [];
    const node = mount(<NumberHarness committed={committed} initial={3000} clamp={(v) => Math.max(100, v)} />);
    const input = node.querySelector('input');
    act(() => input.focus());

    // Select-all, then type. The first keystroke replaces everything; the rest
    // land on whatever the box is showing by then.
    type(input, '2');
    typeDigit(input, '0');
    typeDigit(input, '0');
    typeDigit(input, '0');

    // Nothing has been committed yet, so the clamp never got a 2 to round up.
    expect(committed).toEqual([]);
    expect(input.value).toBe('2000');

    act(() => input.blur());
    expect(committed).toEqual([2000]);
    expect(input.value).toBe('2000');
  });

  it('commits on Enter without waiting for the field to be left', () => {
    const committed = [];
    const node = mount(<NumberHarness committed={committed} initial={3000} />);
    const input = node.querySelector('input');
    act(() => input.focus());

    type(input, '2000');
    expect(committed).toEqual([]);

    press(input, 'Enter');
    expect(committed).toEqual([2000]);
    expect(input.value).toBe('2000');
  });

  it('abandons the draft on Escape and shows the committed value again', () => {
    const committed = [];
    const node = mount(<NumberHarness committed={committed} initial={3000} />);
    const input = node.querySelector('input');
    act(() => input.focus());

    type(input, '2000');
    press(input, 'Escape');

    expect(committed).toEqual([]);
    expect(input.value).toBe('3000');
  });

  it('still commits immediately when the spinner steps the value', () => {
    const committed = [];
    const node = mount(<NumberHarness committed={committed} initial={10} />);
    const input = node.querySelector('input');
    act(() => input.focus());

    spinUp(input);

    // No blur, no Enter — a step is already a whole number, so there is nothing
    // half-finished to wait for.
    expect(committed).toEqual([11]);
    expect(input.value).toBe('11');
  });

  it('leaves text fields reporting every keystroke', () => {
    const committed = [];
    function TextHarness() {
      const [value, setValue] = useState('');
      return (
        <InputField
          label="Name"
          value={value}
          onChange={(next) => {
            committed.push(next);
            setValue(next);
          }}
        />
      );
    }
    const node = mount(<TextHarness />);
    const input = node.querySelector('input');

    type(input, 'Un');
    type(input, 'Uni');

    expect(committed).toEqual(['Un', 'Uni']);
  });
});
