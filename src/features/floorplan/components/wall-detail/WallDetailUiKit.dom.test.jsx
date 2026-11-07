// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NumberField } from './WallDetailUiKit';

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

// Typing: keydown, then the native setter (React's value tracker swallows a
// plain assignment), then an input event carrying an inputType. Without the last
// two the field reads the event as the spinner.
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

function typeDigits(input, digits) {
  for (const digit of digits) type(input, input.value + digit);
}

function press(input, key) {
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

// The arrow buttons and the wheel: a stepped value and a plain input event.
function spinUp(input) {
  act(() => input.stepUp());
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

function blur(input) {
  act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
}

function Harness({ committed, initial = 100, ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <NumberField
      label="Drop below attachment"
      value={value}
      onChange={(next) => {
        committed.push(next);
        setValue(next);
      }}
      {...props}
    />
  );
}

describe('wall/ceiling detail NumberField', () => {
  it('can be cleared to an empty box without committing anything', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} />).querySelector('input');
    act(() => input.focus());

    type(input, '10');
    type(input, '1');
    type(input, '');

    expect(input.value).toBe('');
    expect(committed).toEqual([]);

    blur(input);
    expect(committed).toEqual([]);
    expect(input.value).toBe('100');
  });

  it('holds a typed number until Enter, then commits it once', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} />).querySelector('input');
    act(() => input.focus());

    type(input, '');
    typeDigits(input, '250');
    expect(input.value).toBe('250');
    expect(committed).toEqual([]);

    press(input, 'Enter');
    expect(committed).toEqual([250]);
    expect(input.value).toBe('250');
  });

  it('commits a typed number once on blur', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} />).querySelector('input');
    act(() => input.focus());

    type(input, '');
    typeDigits(input, '250');
    blur(input);

    expect(committed).toEqual([250]);
    expect(input.value).toBe('250');
  });

  it('reverts to the stored value on Escape', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} />).querySelector('input');
    act(() => input.focus());

    type(input, '');
    typeDigits(input, '42');
    press(input, 'Escape');

    expect(input.value).toBe('100');
    expect(committed).toEqual([]);
  });

  it('commits a spinner step immediately', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} step={5} />).querySelector('input');

    spinUp(input);

    expect(committed).toEqual([105]);
    expect(input.value).toBe('105');
  });

  it('keeps min, step, suffix and disabled', () => {
    const node = mount(<Harness committed={[]} min={0} step={10} suffix="kg" disabled />);
    const input = node.querySelector('input');

    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('step')).toBe('10');
    expect(input.disabled).toBe(true);
    expect(node.querySelector('small').textContent).toBe('kg');
  });

  it('shows a non-finite value as an empty box', () => {
    for (const value of [NaN, undefined, null, 'abc']) {
      const node = mount(<NumberField label="Drop" value={value} onChange={() => {}} />);
      expect(node.querySelector('input').value).toBe('');
      container.remove();
    }
  });
});
