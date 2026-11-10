import { useState } from 'react';
import { numeric } from './model.js';
import { fitScale, parseScale, scaleLabel, standardScales } from './sheetLayout.js';

// The slider's usual range (20:1 … 1:5000), widened to hold the current and fitted scales.
const LARGEST = 20,
  SMALLEST = 1 / 5000;
const near = (a, b) => Math.abs(Math.log(a / b)) < 1e-9;

// A drawing sheet's paper scale (Phase R, docs/sketch-studio-drawing-fit.md §5):
// Fit to page, a slider over the ISO 1-2-5 stops with the stops where the
// generated views stop fitting marked, and a custom 1 : N entry. Dragging
// drafts the scale (onDraft, live preview); the gesture's end commits once.
export default function SheetScaleControl({ sheet, views = null, parts = [], onChange, onDraft = () => {} }) {
  const [draft, setDraft] = useState(null);
  const [custom, setCustom] = useState('');
  const [problem, setProblem] = useState('');
  const fit = sheet.scaleMode === 'fit';
  let fixed = null;
  try {
    fixed = numeric(sheet.scale);
  } catch {
    // An unreadable scale shows as "—" until one is chosen.
  }
  // The fitted scale needs generated views with a sheet-scaled, sized box.
  let fitted = null;
  if (views?.some((v) => typeof v === 'object' && v.scale == null && v.viewBox?.[2] > 0 && v.viewBox?.[3] > 0))
    try {
      fitted = fitScale({ ...sheet, scaleMode: 'fit' }, views, parts);
    } catch {
      fitted = null;
    }
  const shown = draft ?? (fit ? (fitted ?? fixed) : fixed);
  const span = [shown, fitted].filter((s) => s > 0);
  const lo = Math.min(SMALLEST, ...span),
    hi = Math.max(LARGEST, ...span);
  // Ascending: dragging right enlarges the drawing.
  const stops = standardScales()
    .filter((s) => s >= lo * (1 - 1e-9) && s <= hi * (1 + 1e-9))
    .reverse();
  const index =
    shown > 0
      ? stops.reduce(
          (best, s, i) => (Math.abs(Math.log(s / shown)) < Math.abs(Math.log(stops[best] / shown)) ? i : best),
          0,
        )
      : 0;
  const pct = (i) => (stops.length > 1 ? (i / (stops.length - 1)) * 100 : 0);
  // Stops above the fitted one overflow (fitting only gets easier as the scale drops).
  const fitsUpTo = fitted == null ? -1 : stops.findLastIndex((s) => s <= fitted * (1 + 1e-9));
  const track =
    fitted == null
      ? undefined
      : fitsUpTo < stops.length - 1
        ? `linear-gradient(to right, #c3ced8 0 ${(pct(fitsUpTo) + pct(fitsUpTo + 1)) / 2}%, #e0716a ${(pct(fitsUpTo) + pct(fitsUpTo + 1)) / 2}% 100%)`
        : '#c3ced8';
  const finish = () => {
    if (draft == null) return;
    setDraft(null);
    onDraft(null);
    if (fit || fixed == null || !near(draft, fixed)) onChange({ scaleMode: 'fixed', scale: draft });
  };
  const applyCustom = () => {
    if (!custom.trim()) return setProblem('');
    const value = parseScale(custom);
    if (value == null) return setProblem('Enter a positive scale such as 1:50, 50 or 2:1.');
    setProblem('');
    setCustom('');
    onChange({ scaleMode: 'fixed', scale: value });
  };
  return (
    <div className="cad-scale-control" role="group" aria-label="Paper scale">
      <div className="cad-inline">
        <button
          type="button"
          aria-pressed={fit}
          title="Draw at the largest standard scale where every view fits its cell"
          onClick={() => onChange(fit ? { scaleMode: 'fixed', scale: fitted ?? fixed ?? 1 } : { scaleMode: 'fit' })}
        >
          Fit to page{fit && fitted != null ? ` · ${scaleLabel(fitted)}` : ''}
        </button>
        <span aria-label="Sheet scale" className="cad-scale-value">
          {shown > 0 ? scaleLabel(shown) : '—'}
        </span>
      </div>
      <div className="cad-scale-slider">
        <input
          type="range"
          aria-label="Scale slider"
          title="Standard drawing scales; red stops do not fit the page"
          min="0"
          max={stops.length - 1}
          step="1"
          value={index}
          style={track ? { '--cad-scale-track': track } : undefined}
          onChange={(e) => {
            const s = stops[Number(e.target.value)];
            setDraft(s);
            onDraft(s);
          }}
          onPointerUp={finish}
          onKeyUp={finish}
          onBlur={finish}
        />
        {fitsUpTo >= 0 && (
          <span className="cad-scale-fits" style={{ left: `${pct(fitsUpTo)}%` }} title="Largest scale that fits">
            fits
          </span>
        )}
      </div>
      {views == null && <p className="cad-help">Generate views to see where the views stop fitting.</p>}
      <details>
        <summary>Custom</summary>
        <label className="cad-field">
          Custom scale (1 : N)
          <input
            value={custom}
            placeholder={fixed > 0 ? scaleLabel(fixed) : '1:50'}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCustom();
            }}
            onBlur={applyCustom}
          />
        </label>
        {problem && <p className="cad-help">{problem}</p>}
      </details>
    </div>
  );
}
