import { useCallback } from 'react';

export default function InputField({ label, value, onChange, type = 'text', suffix, readOnly, step }) {
  const handleChange = useCallback((e) => {
    const val = type === 'number' ? parseFloat(e.target.value) : e.target.value;
    if (type === 'number' && isNaN(val)) return;
    onChange(val);
  }, [onChange, type]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '6px',
    }}>
      <label style={{
        flex: '0 0 80px',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
      }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '4px', minWidth: 0 }}>
        <input
          type={type}
          value={value}
          onChange={handleChange}
          readOnly={readOnly}
          step={step}
          style={{
            flex: 1,
            minWidth: 0,
            height: '28px',
            padding: '0 8px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontFamily: type === 'number' ? 'var(--font-blueprint)' : 'inherit',
            background: readOnly ? 'var(--color-panel-bg)' : 'var(--color-surface-elevated)',
            color: readOnly ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
          }}
        />
        {suffix && (
          <span style={{
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-blueprint)',
          }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
