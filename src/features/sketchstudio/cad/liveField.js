import { createContext, createElement } from 'react';
import { evaluateSketchExpression } from '../utils/sketchExpressionUtils.js';
import { ParameterContext } from './ExpressionInput.jsx';

// Phase L (docs/sketch-studio-live-fields.md): every Properties field applies
// its value as you type, this long after the last keystroke.
export const LIVE_DEBOUNCE_MS = 150;

// The workspace's field-session channel (spec §5, option 2): a ref that a
// ValueField fills with its { live, session, revert } meta synchronously
// around its onChange call (cleared in a finally), so CadWorkspace's commit
// can fold one typing session into one undo step without every onChange in
// between passing the meta along. null outside the workspace.
export const FieldSessionContext = createContext(null);

// The workspace's two field contexts in one element: parameter names and
// values for expressions, and the session channel.
export function FieldContexts({ parameters, channel, children }) {
  return createElement(
    ParameterContext.Provider,
    { value: parameters },
    createElement(FieldSessionContext.Provider, { value: channel }, children),
  );
}

const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

// What a draft may commit while it is being typed, or undefined (wait for
// Enter / blur): a text field's non-empty text; a finite number not still
// being typed (no trailing ".", "e", "+" or "-"); or an "=expression" that
// resolves against the current parameter values, kept as the expression.
export function liveFieldValue(text, { asText = false, values = {} } = {}) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') return undefined;
  if (asText) return trimmed;
  if (trimmed.startsWith('=')) {
    const result = evaluateSketchExpression(trimmed, { context: values || {} });
    return !result.error && Number.isFinite(result.value) ? trimmed : undefined;
  }
  if (/[.eE+-]$/.test(trimmed)) return undefined;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
}

// ↑ / ↓ in a field: a plain number stepped by `step` (Shift: 10), without
// float noise; null when the text is not a plain number.
export function stepFieldValue(text, direction, step = 1) {
  const trimmed = String(text ?? '').trim();
  if (!PLAIN_NUMBER.test(trimmed)) return null;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return null;
  return +(number + direction * step).toFixed(10);
}
