import styles from './SketchPropertiesPanel.module.css';

export default function TemplateParamsForm({ parameters, values, onChange }) {
  return (
    <div className={styles.fieldGroup}>
      {parameters.map((param) => {
        if (param.type === 'boolean') {
          return (
            <label key={param.key} className={styles.field}>
              <span className={styles.fieldLabel}>{param.label}</span>
              <input
                type="checkbox"
                checked={!!values[param.key]}
                onChange={(e) => onChange(param.key, e.target.checked)}
                style={{ accentColor: 'var(--color-workspace-sketch, #B8860B)' }}
              />
            </label>
          );
        }

        const step = param.type === 'integer' ? 1 : (param.step || 1);
        return (
          <label key={param.key} className={styles.field}>
            <span className={styles.fieldLabel}>{param.label}</span>
            <div className={styles.fieldInput}>
              <input
                type="number"
                value={Math.round(values[param.key] ?? param.default)}
                min={param.min}
                max={param.max}
                step={step}
                onChange={(e) => {
                  const v = param.type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                  if (!isNaN(v)) onChange(param.key, v);
                }}
                className={styles.numberInput}
              />
              {param.suffix && <span className={styles.suffix}>{param.suffix}</span>}
            </div>
          </label>
        );
      })}
    </div>
  );
}
