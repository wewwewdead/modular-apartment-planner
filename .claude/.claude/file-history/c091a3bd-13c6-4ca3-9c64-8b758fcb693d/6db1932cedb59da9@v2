import { useCallback } from 'react';
import styles from './InputField.module.css';

export default function InputField({ label, value, onChange, type = 'text', suffix, readOnly, step }) {
  const handleChange = useCallback((e) => {
    const val = type === 'number' ? parseFloat(e.target.value) : e.target.value;
    if (type === 'number' && isNaN(val)) return;
    onChange(val);
  }, [onChange, type]);

  const inputClass = [
    styles.input,
    type === 'number' ? styles.inputNumber : '',
    readOnly ? styles.inputReadonly : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.inputWrap}>
        <input
          type={type}
          value={value}
          onChange={handleChange}
          readOnly={readOnly}
          step={step}
          className={inputClass}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </div>
  );
}
