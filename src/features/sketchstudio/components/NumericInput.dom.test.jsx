// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import NumericInput from './NumericInput';

let container = null;

function mount(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return container.querySelector('input');
}

afterEach(() => {
  container?.remove();
  container = null;
});

const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

// Typing: keydown, the native setter, then an input event carrying an inputType.
// Leave out the inputType and the field reads it as the spinner.
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

function press(input, key) {
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

function spinUp(input) {
  act(() => input.stepUp());
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

function blur(input) {
  act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
}

// Mirrors the `Number(x) || DEFAULT` sites: the commit callback keeps its fallback.
function Harness({ committed, initial = 3, fallback = 3, ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <NumericInput
      aria-label="Kerf"
      value={value}
      onCommit={(next) => {
        committed.push(next);
        setValue(next === null ? null : next > 0 ? next : fallback);
      }}
      {...props}
    />
  );
}

describe('sketch studio NumericInput', () => {
  it('can be cleared without committing, and falls back to the stored value on blur', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} />);
    act(() => input.focus());

    type(input, '');
    expect(input.value).toBe('');
    expect(committed).toEqual([]);

    blur(input);
    expect(committed).toEqual([]);
    expect(input.value).toBe('3');
  });

  it('commits a typed number once, on Enter', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} />);
    act(() => input.focus());

    type(input, '');
    type(input, '0');
    type(input, '0.');
    type(input, '0.5');
    expect(committed).toEqual([]);
    expect(input.value).toBe('0.5');

    press(input, 'Enter');
    expect(committed).toEqual([0.5]);
    expect(input.value).toBe('0.5');
  });

  it('commits on blur, and Escape reverts', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} />);
    act(() => input.focus());

    type(input, '');
    type(input, '7');
    press(input, 'Escape');
    expect(input.value).toBe('3');
    expect(committed).toEqual([]);

    type(input, '');
    type(input, '8');
    blur(input);
    expect(committed).toEqual([8]);
  });

  it('commits a spinner step immediately', () => {
    const committed = [];
    const input = mount(<Harness committed={committed} step="0.5" />);

    spinUp(input);
    expect(committed).toEqual([3.5]);
  });

  it('passes input attributes through', () => {
    const input = mount(
      <NumericInput
        value={null}
        onCommit={() => {}}
        className="kerf"
        min="0"
        max="5"
        step="0.05"
        title="Kerf width"
        placeholder="Mixed"
        aria-label="Kerf width"
        disabled
      />,
    );

    expect(input.type).toBe('number');
    expect(input.value).toBe('');
    expect(input.className).toBe('kerf');
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('5');
    expect(input.getAttribute('step')).toBe('0.05');
    expect(input.title).toBe('Kerf width');
    expect(input.placeholder).toBe('Mixed');
    expect(input.getAttribute('aria-label')).toBe('Kerf width');
    expect(input.disabled).toBe(true);
  });

  describe('allowEmpty', () => {
    it('commits null when a stored value is emptied and Enter is pressed', () => {
      const committed = [];
      const input = mount(<Harness committed={committed} allowEmpty />);
      act(() => input.focus());

      type(input, '');
      expect(committed).toEqual([]);

      press(input, 'Enter');
      expect(committed).toEqual([null]);
      expect(input.value).toBe('');
    });

    it('commits null on blur after emptying', () => {
      const committed = [];
      const input = mount(<Harness committed={committed} allowEmpty />);
      act(() => input.focus());

      type(input, '');
      blur(input);
      expect(committed).toEqual([null]);
    });

    it('does not commit null for a box that was already empty', () => {
      const committed = [];
      const input = mount(<Harness committed={committed} initial={null} allowEmpty />);
      act(() => input.focus());

      press(input, 'Enter');
      blur(input);
      expect(committed).toEqual([]);
    });

    it('still commits a typed number', () => {
      const committed = [];
      const input = mount(<Harness committed={committed} allowEmpty />);
      act(() => input.focus());

      type(input, '');
      type(input, '9');
      blur(input);
      expect(committed).toEqual([9]);
    });
  });
});
