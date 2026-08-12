import { useCallback } from 'react';
import styles from './InputField.module.css';
import { useNumericDraft } from './useNumericDraft';

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
 * every keystroke — see useNumericDraft. Text fields are unaffected: they have
 * no clamping upstream to fight, so they still report every character.
 */
export default function InputField({ label, value, onChange, type = 'text', suffix, readOnly, step }) {
  const isNumber = type === 'number';
  const numeric = useNumericDraft(value, onChange);

  const handleTextChange = useCallback((e) => onChange(e.target.value), [onChange]);

  const inputClass = [styles.input, type === 'number' ? styles.inputNumber : '', readOnly ? styles.inputReadonly : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.inputWrap}>
        <input
          type={type}
          value={isNumber ? numeric.displayValue : value}
          onChange={isNumber ? numeric.handleChange : handleTextChange}
          onKeyDown={isNumber ? numeric.handleKeyDown : undefined}
          onBlur={isNumber ? numeric.handleBlur : undefined}
          readOnly={readOnly}
          step={step}
          className={inputClass}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </div>
  );
}
