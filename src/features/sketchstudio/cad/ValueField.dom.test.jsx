// @vitest-environment jsdom
// Phase L (docs/sketch-studio-live-fields.md §3): the live ValueField.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ParameterContext } from './ExpressionInput.jsx';
import { ValueField, VectorFields } from './CadEditors.jsx';
import { FieldSessionContext, LIVE_DEBOUNCE_MS, liveFieldValue, stepFieldValue } from './liveField.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const context = { names: ['pitch', 'width'], values: { pitch: 25, width: 600 } };
// A field whose value follows its commits, like every panel does.
function Controlled({ initial = 18, spy, asText = false, label = 'Depth (mm)' }) {
  const [value, setValue] = useState(initial);
  return (
    <ParameterContext.Provider value={context}>
      <ValueField
        label={label}
        value={value}
        asText={asText}
        onChange={(next, meta) => {
          spy(next, meta);
          setValue(next);
        }}
      />
      <output aria-label="value">{String(value)}</output>
    </ParameterContext.Provider>
  );
}
const type = (input, text) => fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
const settle = () => act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS));
const setup = (props = {}) => {
  const spy = vi.fn();
  render(<Controlled spy={spy} {...props} />);
  return { spy, input: screen.getByLabelText(props.label || 'Depth (mm)') };
};

it('commits a typed number live after the settle time, with meta.live and a session', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '25');
  act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS - 1));
  expect(spy).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith(25, { live: true, session: expect.stringMatching(/^field-/) });
  expect(screen.getByLabelText('value').textContent).toBe('25');
});

it('restarts the timer on each keystroke: 1, 5, 0 typed quickly is one live commit of 150', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '1');
  act(() => vi.advanceTimersByTime(60));
  type(input, '15');
  act(() => vi.advanceTimersByTime(60));
  type(input, '150');
  settle();
  expect(spy.mock.calls).toEqual([[150, expect.objectContaining({ live: true })]]);
});

it('commits nothing live for 1. / - / =pit / empty, and the same value twice is not re-sent', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  for (const text of ['1.', '-', '=pit', '', '2e', '=pitch*']) {
    type(input, text);
    settle();
  }
  expect(spy).not.toHaveBeenCalled();
  type(input, '18');
  settle();
  expect(spy).not.toHaveBeenCalled();
});

it('commits a resolvable expression live as the expression string', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '=pitch');
  settle();
  type(input, '=pitch*2');
  settle();
  expect(spy.mock.calls.map(([v, m]) => [v, m.live])).toEqual([
    ['=pitch', true],
    ['=pitch*2', true],
  ]);
});

it('commits on blur with live: false, once, when blur comes before the timer', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '30');
  act(() => input.blur());
  settle();
  expect(spy.mock.calls).toEqual([[30, { live: false, session: expect.any(String) }]]);
  // The same session id carries the live commits and the final one.
  act(() => input.focus());
  type(input, '31');
  settle();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy.mock.calls[1][1].live).toBe(true);
  expect(spy.mock.calls[1][1].session).not.toBe(spy.mock.calls[0][1].session);
  expect(document.activeElement).not.toBe(input);
});

it('commits on blur without focus first (fireEvent change + blur, as the existing tests do)', () => {
  const { spy, input } = setup();
  type(input, '42');
  fireEvent.blur(input);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith(42, expect.objectContaining({ live: false }));
});

it('keeps the same input element, focus and caret across its own live commit', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '150');
  input.setSelectionRange(1, 1);
  settle();
  expect(spy).toHaveBeenCalledWith(150, expect.objectContaining({ live: true }));
  expect(screen.getByLabelText('value').textContent).toBe('150');
  expect(screen.getByLabelText('Depth (mm)')).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('150');
  expect(input.selectionStart).toBe(1);
  // A trailing "." is not eaten by the echoed value.
  type(input, '150.');
  settle();
  expect(input.value).toBe('150.');
  expect(spy).toHaveBeenCalledTimes(1);
});

it('Escape after live edits restores the value from before the edit, then blurs', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '25');
  settle();
  type(input, '26');
  fireEvent.keyDown(input, { key: 'Escape' });
  settle();
  expect(spy.mock.calls.map(([v, m]) => [v, m.live, Boolean(m.revert)])).toEqual([
    [25, true, false],
    [18, false, true],
  ]);
  expect(spy.mock.calls[1][1].session).toBe(spy.mock.calls[0][1].session);
  expect(input.value).toBe('18');
  expect(document.activeElement).not.toBe(input);
});

it('Escape with only an uncommitted draft puts the text back without a commit', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '1.');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(spy).not.toHaveBeenCalled();
  expect(input.value).toBe('18');
});

it('Escape with nothing typed is left to the workspace (not consumed)', () => {
  const { input } = setup();
  act(() => input.focus());
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

it('syncs from props only when not editing', () => {
  const spy = vi.fn();
  const view = render(<ValueField label="Width" value={10} onChange={spy} />);
  const input = screen.getByLabelText('Width');
  view.rerender(<ValueField label="Width" value={40} onChange={spy} />);
  expect(input.value).toBe('40');
  act(() => input.focus());
  type(input, '7');
  view.rerender(<ValueField label="Width" value={99} onChange={spy} />);
  expect(input.value).toBe('7');
  act(() => input.blur());
  // The blur commit went to a parent that does not echo: the field shows the value.
  expect(spy).toHaveBeenCalledWith(7, expect.objectContaining({ live: false }));
  expect(input.value).toBe('99');
});

it('keeps text that cannot be committed on screen after blur until the value changes', () => {
  const spy = vi.fn();
  const view = render(<ValueField label="Width" value={10} onChange={spy} />);
  const input = screen.getByLabelText('Width');
  act(() => input.focus());
  type(input, '=nope');
  settle();
  expect(spy).not.toHaveBeenCalled();
  act(() => input.blur());
  expect(spy).toHaveBeenCalledWith('=nope', expect.objectContaining({ live: false }));
  expect(input.value).toBe('=nope');
  view.rerender(<ValueField label="Width" value={12} onChange={spy} />);
  expect(input.value).toBe('12');
});

it('steps a plain number with Up / Down (Shift: 10) and commits at once', () => {
  const { spy, input } = setup({ initial: 6.6 });
  act(() => input.focus());
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.value).toBe('7.6');
  fireEvent.keyDown(input, { key: 'ArrowDown', shiftKey: true });
  expect(input.value).toBe('-2.4');
  expect(spy.mock.calls.map(([v, m]) => [v, m.live])).toEqual([
    [7.6, true],
    [-2.4, true],
  ]);
  expect(spy.mock.calls[0][1].session).toBe(spy.mock.calls[1][1].session);
  // An expression is not stepped; with the suggestion list open the arrows move it.
  type(input, '=p');
  expect(screen.getByRole('listbox')).toBeTruthy();
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.value).toBe('=p');
  type(input, '=pitch*2');
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.value).toBe('=pitch*2');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('does not step a text field', () => {
  const { spy, input } = setup({ initial: '12', asText: true, label: 'Part number' });
  act(() => input.focus());
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.value).toBe('12');
  expect(spy).not.toHaveBeenCalled();
});

it('Ctrl+Z closes the typing session (the studio undoes); the next keystroke starts a new one', () => {
  const { spy, input } = setup();
  act(() => input.focus());
  type(input, '25');
  settle();
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  type(input, '26');
  settle();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy.mock.calls[1][1].session).not.toBe(spy.mock.calls[0][1].session);
});

it('publishes the meta on the workspace channel only for the duration of onChange', () => {
  const seen = [];
  // The workspace's channel: a ref-shaped object, as CadWorkspace passes its useRef.
  const channel = { current: null };
  const ref = channel;
  function Workspace() {
    const [value, setValue] = useState(5);
    return (
      <FieldSessionContext.Provider value={ref}>
        <ValueField
          label="Offset"
          value={value}
          onChange={(next) => {
            seen.push(ref.current);
            setValue(next);
          }}
        />
      </FieldSessionContext.Provider>
    );
  }
  render(<Workspace />);
  const input = screen.getByLabelText('Offset');
  act(() => input.focus());
  type(input, '8');
  settle();
  act(() => input.blur());
  type(input, '9');
  fireEvent.blur(input);
  expect(seen.map((m) => m.live)).toEqual([true, false]);
  expect(seen[0].session).toEqual(expect.any(String));
  expect(channel.current).toBeNull();
});

it('a consumer that throws on a live value stays silent', () => {
  const onChange = vi.fn((next, meta) => {
    if (next > 10) throw new Error(`too big (${meta.live ? 'live' : 'commit'})`);
  });
  render(<ValueField label="Count" value={4} onChange={onChange} />);
  const input = screen.getByLabelText('Count');
  act(() => input.focus());
  type(input, '12');
  expect(() => settle()).not.toThrow();
  expect(onChange).toHaveBeenCalledWith(12, expect.objectContaining({ live: true }));
});

it('VectorFields passes the meta through and keeps each component field mounted', () => {
  const spy = vi.fn();
  function Vector() {
    const [value, setValue] = useState([1, 2, 3]);
    return (
      <VectorFields
        label="Position (mm)"
        value={value}
        onChange={(next, meta) => {
          spy(next, meta);
          setValue(next);
        }}
      />
    );
  }
  render(<Vector />);
  const y = screen.getByLabelText('Y');
  act(() => y.focus());
  type(y, '20');
  settle();
  expect(spy).toHaveBeenCalledWith([1, 20, 3], expect.objectContaining({ live: true }));
  expect(screen.getByLabelText('Y')).toBe(y);
  expect(document.activeElement).toBe(y);
});

it('liveFieldValue and stepFieldValue', () => {
  expect(liveFieldValue('50')).toBe(50);
  expect(liveFieldValue(' 0050 ')).toBe(50);
  expect(liveFieldValue('50.')).toBeUndefined();
  expect(liveFieldValue('1e')).toBeUndefined();
  expect(liveFieldValue('-')).toBeUndefined();
  expect(liveFieldValue('-3')).toBe(-3);
  expect(liveFieldValue('abc')).toBeUndefined();
  expect(liveFieldValue('=width/2', { values: { width: 600 } })).toBe('=width/2');
  expect(liveFieldValue('=width/2')).toBeUndefined();
  expect(liveFieldValue('  ', { asText: true })).toBeUndefined();
  expect(liveFieldValue('M5.', { asText: true })).toBe('M5.');
  expect(stepFieldValue('0.1', 1, 1)).toBe(1.1);
  expect(stepFieldValue('0.2', 1, 0.1)).toBe(0.3);
  expect(stepFieldValue('=a', 1, 1)).toBeNull();
  expect(stepFieldValue('', 1, 1)).toBeNull();
});
