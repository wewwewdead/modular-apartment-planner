import { useEffect, useLayoutEffect, useRef } from 'react';

const HUD_OFFSET_PX = 18;

// `cursorChannel` (hooks/cursorChannel.js) moves the HUD with the cursor
// without a render; `cursorScreen` is the plain-prop form, used when no
// channel is given.
export default function PrecisionHud({
  precisionHud,
  cursorScreen,
  cursorChannel = null,
  onInputChange,
  onSubmit,
  onToggleChange,
}) {
  const firstInputRef = useRef(null);
  const hudRef = useRef(null);
  const isShown = Boolean(precisionHud && (cursorChannel || cursorScreen));

  useEffect(() => {
    if (precisionHud?.inputs?.length) {
      firstInputRef.current?.focus();
      firstInputRef.current?.select();
    }
  }, [precisionHud?.tool]);

  useLayoutEffect(() => {
    if (!cursorChannel || !isShown) return undefined;
    const write = (channel) => {
      if (!hudRef.current) return;
      hudRef.current.style.left = `${channel.screen.x + HUD_OFFSET_PX}px`;
      hudRef.current.style.top = `${channel.screen.y + HUD_OFFSET_PX}px`;
    };
    write(cursorChannel);
    return cursorChannel.subscribe(write);
  }, [cursorChannel, isShown]);

  if (!isShown) {
    return null;
  }

  const screen = cursorChannel ? cursorChannel.screen : cursorScreen;
  const style = {
    left: `${screen.x + HUD_OFFSET_PX}px`,
    top: `${screen.y + HUD_OFFSET_PX}px`,
  };

  return (
    <div ref={hudRef} className="sketchStudioPrecisionHud" style={style} data-precision-hud="">
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
