import { useEffect, useRef } from 'react';

export default function PrecisionHud({ precisionHud, cursorScreen, onInputChange, onSubmit, onToggleChange }) {
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (precisionHud?.inputs?.length) {
      firstInputRef.current?.focus();
      firstInputRef.current?.select();
    }
  }, [precisionHud?.tool]);

  if (!precisionHud || !cursorScreen) {
    return null;
  }

  const style = {
    left: `${cursorScreen.x + 18}px`,
    top: `${cursorScreen.y + 18}px`,
  };

  return (
    <div className="sketchStudioPrecisionHud" style={style}>
      <p className="sketchStudioPrecisionHudTitle">{precisionHud.tool}</p>
      {precisionHud.measurements.map((measurement) => (
        <div key={measurement.key} className="sketchStudioPrecisionRow">
          <span className="sketchStudioPrecisionLabel">{measurement.label}</span>
          <span className="sketchStudioPrecisionValue">{measurement.value.toFixed(1)}</span>
        </div>
      ))}
      {(precisionHud.toggles ?? []).map((toggle) => (
        <div key={toggle.key} className="sketchStudioPrecisionRow">
          <span className="sketchStudioPrecisionLabel">{toggle.label}</span>
          <span className="sketchStudioPrecisionToggleGroup">
            {toggle.options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`sketchStudioPrecisionToggle ${toggle.value === option.value ? 'is-active' : ''}`}
                aria-pressed={toggle.value === option.value}
                onClick={() => onToggleChange?.(toggle.key, option.value)}
              >
                {option.label}
              </button>
            ))}
          </span>
        </div>
      ))}
      {precisionHud.inputs.map((input, index) => (
        <label key={input.key} className="sketchStudioPrecisionField">
          <span className="sketchStudioPrecisionLabel">{input.label}</span>
          <input
            ref={index === 0 ? firstInputRef : null}
            className="sketchStudioPrecisionInput"
            value={input.value}
            placeholder={input.placeholder}
            onChange={(event) => onInputChange(input.key, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
        </label>
      ))}
    </div>
  );
}
