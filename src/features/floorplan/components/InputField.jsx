import { useCallback, useId } from 'react';
import styles from './InputField.module.css';
import { useNumericDraft } from '@/hooks/useNumericDraft';
import { useTextDraft } from '@/hooks/useTextDraft';

/**
 * A number field keeps the raw text while it is being typed.
 *
 * This is a controlled input, so whenever a keystroke produces something
 * parseFloat cannot use — an emptied field, a lone '-', a trailing '.' — React
 * writes the previous value straight back over it. Dropping those keystrokes
 * silently made the field look dead and put negative and freshly-cleared
 * values out of reach entirely. The draft holds what was typed; only a finite
 * parse is handed upstream, so no command ever has to defend against NaN.
 *
 * The draft is now also what is committed, on Enter and on blur rather than on
 * every keystroke — see useNumericDraft. Text fields have no clamping upstream
 * to fight, so by default they still report every character; `commitOnBlur`
 * holds a text draft instead and commits it once on Enter or blur (see
 * useTextDraft), for fields whose every dispatch is an undo step.
 */
export default function InputField({ label, value, onChange, type = 'text', suffix, readOnly, step, commitOnBlur }) {
  const isNumber = type === 'number';
  // Ties the label to its input, so it names the field for assistive tech
  // and a click on it focuses the box.
  const inputId = useId();
  const numeric = useNumericDraft(value, onChange);
  const text = useTextDraft(value, onChange);
  const draftedText = !isNumber && commitOnBlur;

  const handleTextChange = useCallback((e) => onChange(e.target.value), [onChange]);
  const handlers = isNumber ? numeric : draftedText ? text : null;

  const inputClass = [styles.input, type === 'number' ? styles.inputNumber : '', readOnly ? styles.inputReadonly : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={inputId}
          type={type}
          value={handlers ? handlers.displayValue : value}
          onChange={handlers ? handlers.handleChange : handleTextChange}
          onKeyDown={handlers?.handleKeyDown}
          onBlur={handlers?.handleBlur}
          readOnly={readOnly}
          step={step}
          className={inputClass}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </div>
  );
}
