import { createContext, useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { insertSuggestion, parameterSuggestions } from './parameters.js';

// Parameter names (and resolved values, for the dropdown) for every
// expression field in the CAD workspace.
export const ParameterContext = createContext({ names: [], values: {} });

const format = (value) => (Number.isFinite(value) ? String(+value.toFixed(4)) : '');

// A text input that, once the text starts with "=", offers parameter names
// for the identifier at the caret: arrows move, Enter/Tab insert, Esc closes.
// Keys it does not use go to the caller's onKeyDown unchanged.
export default function ExpressionInput({ value, onChange, onKeyDown, onBlur, names, ref, ...rest }) {
  const context = useContext(ParameterContext);
  const list = names || context.names;
  const input = useRef(null);
  const pendingCaret = useRef(null);
  const [caret, setCaret] = useState(null);
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const listId = useId();
  const suggestion = !closed && caret != null ? parameterSuggestions(value, caret, list) : null;
  const highlighted = suggestion ? Math.min(active, suggestion.items.length - 1) : 0;
  useLayoutEffect(() => {
    if (pendingCaret.current == null || !input.current) return;
    input.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });
  const setInput = (element) => {
    input.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  };
  const choose = (name) => {
    const result = insertSuggestion(value, suggestion, name);
    pendingCaret.current = result.caret;
    setCaret(result.caret);
    setActive(0);
    onChange(result.text);
    return result.text;
  };
  const keyDown = (event) => {
    if (suggestion) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((highlighted + step + suggestion.items.length) % suggestion.items.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        // Only consumed when it changes the text: a name already typed in
        // full lets Enter/Tab do their usual job.
        const name = suggestion.items[highlighted];
        if (insertSuggestion(value, suggestion, name).text !== value) {
          event.preventDefault();
          event.stopPropagation();
          choose(name);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setClosed(true);
        return;
      }
    }
    onKeyDown?.(event);
  };
  return (
    <span className="cad-expression">
      <input
        {...rest}
        ref={setInput}
        value={value}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={suggestion ? listId : undefined}
        onChange={(event) => {
          setCaret(event.target.selectionStart);
          setActive(0);
          setClosed(false);
          onChange(event.target.value);
        }}
        onSelect={(event) => setCaret(event.target.selectionStart)}
        onKeyDown={keyDown}
        onBlur={(event) => {
          setCaret(null);
          onBlur?.(event);
        }}
      />
      {suggestion && (
        <ul className="cad-expression-list" id={listId} role="listbox" aria-label="Parameters">
          {suggestion.items.map((name, index) => (
            <li
              key={name}
              role="option"
              aria-selected={index === highlighted}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(name);
              }}
            >
              {name}
              <small>{format(context.values?.[name])}</small>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
