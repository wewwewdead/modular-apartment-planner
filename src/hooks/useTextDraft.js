import { useCallback, useState } from 'react';

/**
 * Free-text entry that commits once, not once per character.
 *
 * A text field wired straight to the store dispatched every keystroke: a
 * ten-letter project name was ten undo steps (of a hundred) and ten
 * whole-project coordination passes. So typing keeps a local draft — the box
 * still shows every character as it is typed — and Enter or blur commits it,
 * Escape throws it away. A draft that ends where it started commits nothing.
 *
 * The text counterpart of useNumericDraft; it decides WHEN a value commits,
 * never what.
 */
export function useTextDraft(value, onCommit) {
  const [draft, setDraft] = useState(null);

  const commit = useCallback(
    (text) => {
      if (text !== value) onCommit(text);
    },
    [onCommit, value],
  );

  const handleChange = useCallback((event) => setDraft(event.target.value), []);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        if (draft !== null) commit(draft);
        setDraft(null);
        return;
      }
      // Safe to settle here: the global Escape listeners ignore events aimed at
      // an input, so reverting cannot also cancel the active tool.
      if (event.key === 'Escape') setDraft(null);
    },
    [commit, draft],
  );

  const handleBlur = useCallback(() => {
    if (draft !== null) commit(draft);
    setDraft(null);
  }, [commit, draft]);

  return { displayValue: draft ?? value, handleChange, handleKeyDown, handleBlur };
}
