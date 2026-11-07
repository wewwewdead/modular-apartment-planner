import { useCallback, useRef, useState } from 'react';

/**
 * Number entry that survives being typed into.
 *
 * A controlled number input has one hostile property: React writes `value` back
 * over whatever is in the box on every render. So if every keystroke is committed
 * upstream, the value that comes back is the one the next keystroke lands on —
 * and upstream almost always clamps. Typing 2000 over a wall's 3000mm height ran
 * 2 → clamped to 100 → '100' in the box → '1000' → '10000' → '100000'. Only the
 * spinner arrows looked like they worked, because they step from a value that was
 * already legal and so never trip the clamp.
 *
 * So typing keeps a text draft and commits nothing. Enter and blur commit it,
 * Escape throws it away. The stepper still commits on the spot: stepping cannot
 * produce a half-finished number the way typing can, so there is nothing to wait
 * for.
 *
 * Nothing non-finite is ever handed upstream. An emptied field, a lone '-', a
 * trailing '.' all sit in the draft and are simply never committed, so no command
 * has to defend against NaN.
 */

// Keys that can change the text. Steppers (Up/Down), navigation and modifiers
// deliberately do not count — pressing them must not leave a flag behind that
// makes the next spinner click look like typing.
function isTextEditingKey(key) {
  return key.length === 1 || key === 'Backspace' || key === 'Delete';
}

export function useNumericDraft(value, onChange) {
  const [draft, setDraft] = useState(null);
  // Set by the keydown that is about to produce an input event; read once and
  // cleared. See the `stepped` test below for why it exists at all.
  const typedRef = useRef(false);

  const commit = useCallback(
    (raw) => {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed)) onChange(parsed);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (event) => {
      const raw = event.target.value;
      const typed = typedRef.current;
      typedRef.current = false;

      // The stepper — arrow buttons, wheel, Up/Down — does not edit text, so the
      // browser fires an input event carrying no inputType. Typed text always
      // carries one. The keydown flag is the second opinion: were inputType ever
      // missing, a printable key having just been pressed still says this was
      // typed, and the draft protects the entry either way.
      const stepped = !event.nativeEvent?.inputType && !typed;

      // A step commits on the spot; it cannot leave a number half-finished the
      // way typing can, so there is nothing to wait for. Anything that does not
      // parse stays a draft no matter where it came from — what is on screen is
      // never thrown away in favour of a value that could not be committed.
      if (stepped && Number.isFinite(parseFloat(raw))) {
        setDraft(null);
        commit(raw);
        return;
      }

      setDraft(raw);
    },
    [commit],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        commit(event.target.value);
        setDraft(null);
        return;
      }
      if (event.key === 'Escape') {
        // Safe to settle here: every global Escape listener already ignores
        // events aimed at an input, so abandoning the draft cannot also cancel
        // the active tool or drop the panel out of focus mode.
        setDraft(null);
        return;
      }
      typedRef.current = isTextEditingKey(event.key);
    },
    [commit],
  );

  // Leaving the field is a commit — a number typed and then clicked away from was
  // still meant to be kept. A partial entry parses to nothing and falls back to
  // the committed value, so it never lingers as though it had been saved.
  const handleBlur = useCallback(
    (event) => {
      if (draft !== null) commit(event.target.value);
      setDraft(null);
      typedRef.current = false;
    },
    [commit, draft],
  );

  return { displayValue: draft ?? value, handleChange, handleKeyDown, handleBlur };
}
