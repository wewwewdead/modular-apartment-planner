import { useCallback } from 'react';
import { useNumericDraft } from '@/hooks/useNumericDraft';

function isEmptyText(raw) {
  return String(raw ?? '').trim() === '';
}

/**
 * A number box that can be typed into. Typing holds a draft and commits on
 * Enter or blur; Escape reverts; the stepper commits at once (useNumericDraft).
 * Committing per keystroke made an emptied box snap back to whatever '' parsed
 * or fell back to, so it could never be cleared and retyped.
 *
 * `onCommit` only ever receives a finite number — keep each site's clamp or
 * fallback inside it. `allowEmpty` is for fields where an empty box means
 * something (null = "use the default"): emptying a stored value and pressing
 * Enter or leaving commits `null`.
 */
export default function NumericInput({ value, onCommit, allowEmpty = false, ...inputProps }) {
  const stored = value ?? '';
  const { displayValue, handleChange, handleKeyDown, handleBlur } = useNumericDraft(stored, onCommit);

  // Only a box that held something can be cleared; an already-empty one (unset,
  // or a mixed selection) must not commit null just for being visited.
  const commitClear = useCallback(
    (raw) => {
      if (allowEmpty && isEmptyText(raw) && !isEmptyText(stored)) onCommit(null);
    },
    [allowEmpty, onCommit, stored],
  );

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') commitClear(event.target.value);
      handleKeyDown(event);
    },
    [commitClear, handleKeyDown],
  );

  const onBlur = useCallback(
    (event) => {
      commitClear(event.target.value);
      handleBlur(event);
    },
    [commitClear, handleBlur],
  );

  return (
    <input
      type="number"
      {...inputProps}
      value={displayValue}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  );
}
