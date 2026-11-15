import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNumericDraft } from '@/hooks/useNumericDraft';
import styles from './PanelKit.module.css';

/**
 * Primitives for the properties panel.
 *
 * The panel's job is to let someone read a number off a model they are going to
 * build from, so the split that matters is editable versus derived. `Field`
 * wraps things you can change; `Readout` sets things the model computed, in the
 * blueprint face on a dotted leader like a drawing schedule. Anything derived
 * that renders as an input box is a bug — it invites an edit that cannot happen
 * and, when it is a number input, ships dead spinner arrows with it.
 */

const SECTION_PREFERENCE_PREFIX = 'floorplan.panel.section.';

// Runs under renderToStaticMarkup in tests, where there is no window at all.
function readSectionPreference(id, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(`${SECTION_PREFERENCE_PREFIX}${id}`);
    if (stored === 'open') return true;
    if (stored === 'closed') return false;
  } catch {
    /* private mode, quota, disabled storage — the default is fine */
  }
  return fallback;
}

function writeSectionPreference(id, open) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${SECTION_PREFERENCE_PREFIX}${id}`, open ? 'open' : 'closed');
  } catch {
    /* nothing to do — the section still works, it just will not be remembered */
  }
}

/**
 * A collapsible group. `summary` is shown while collapsed so a closed section
 * still says what is inside — collapsing must not hide information, only defer
 * it.
 */
export const Section = memo(function Section({ id, title, summary, defaultOpen = true, reveal = null, children }) {
  const [open, setOpen] = useState(() => readSectionPreference(id || title, defaultOpen));
  const bodyId = useId();
  const containerRef = useRef(null);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      writeSectionPreference(id || title, !wasOpen);
      return !wasOpen;
    });
  }, [id, title]);

  // A non-null `reveal` value opens the section, whatever the stored preference
  // says — pointing at something on the plan must never land its readouts in a
  // folded section. The preference itself is untouched: being shown something
  // is not the same as asking for it, and the fold returns next selection.
  // Adjusted during render (the sanctioned prop-change pattern) rather than in
  // an effect, so the section is open in the same commit that carries the new
  // reveal; only the scroll — a real DOM side effect — stays in an effect.
  const [lastReveal, setLastReveal] = useState(null);
  if (reveal !== lastReveal) {
    setLastReveal(reveal);
    if (reveal != null) setOpen(true);
  }

  useEffect(() => {
    if (reveal == null) return;
    containerRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [reveal]);

  return (
    <div className={styles.section} ref={containerRef}>
      <button type="button" className={styles.sectionHead} onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true" />
        <span className={styles.sectionTitle}>{title}</span>
        {!open && summary ? <span className={styles.sectionSummary}>{summary}</span> : null}
      </button>
      {open ? (
        <div className={styles.sectionBody} id={bodyId}>
          {children}
        </div>
      ) : null}
    </div>
  );
});

/** Label + control on the shared gutter. */
export function Field({ label, children }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldControl}>{children}</span>
    </label>
  );
}

/** A control row with no label — segmented pickers, button pairs. */
export function Stack({ children }) {
  return <div className={styles.stack}>{children}</div>;
}

/**
 * Editable number. The entry rules live in useNumericDraft, which is what keeps
 * a half-typed number on screen instead of letting the committed value — often
 * clamped from the first digit — overwrite it mid-word.
 *
 * `onSubmit` is for the fields that finish something rather than just set it —
 * the reach of a cantilever waiting on Apply. Enter still commits through
 * `onChange` first, so the submit handler sees a settled value; it is given the
 * parsed number as well so it never has to wait for state to come back round. A
 * stepper click is not a submit: stepping is how you find the number, not how
 * you agree to it.
 */
export function NumberField({ label, value, onChange, step, unit, min, onSubmit }) {
  const { displayValue, handleChange, handleKeyDown, handleBlur } = useNumericDraft(value, onChange);

  const keyDown = (event) => {
    handleKeyDown(event);
    if (!onSubmit || event.key !== 'Enter') return;
    const parsed = parseFloat(event.target.value);
    if (Number.isFinite(parsed)) onSubmit(parsed);
  };

  return (
    <Field label={label}>
      <input
        type="number"
        className={styles.controlNumber}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={keyDown}
        onBlur={handleBlur}
        step={step}
        min={min}
      />
      {unit ? <span className={styles.unit}>{unit}</span> : null}
    </Field>
  );
}

export function TextField({ label, value, onChange, placeholder }) {
  return (
    <Field label={label}>
      <input
        type="text"
        className={styles.control}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/**
 * Replaces the ~25 hand-inlined `<select>` rows that had drifted into three
 * different label widths and two different backgrounds.
 *
 * `disabled` is for a choice the model has taken away rather than one that is
 * merely inactive: the control stays on screen showing what it would say, so
 * the answer is still readable, and the caller owes it a `Hint` saying why. It
 * is never a substitute for hiding a control that does not apply at all.
 */
export function SelectField({ label, value, onChange, disabled = false, children }) {
  return (
    <Field label={label}>
      <select
        className={styles.select}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </Field>
  );
}

/**
 * A derived value. Reads as schedule data: label, dotted leader, number in the
 * blueprint face. Never focusable, never mistakable for something you can edit.
 */
export function Readout({ label, value, unit, muted = false }) {
  return (
    <div className={styles.readout}>
      <span className={styles.readoutLabel}>{label}</span>
      <span className={styles.readoutLeader} aria-hidden="true" />
      <span className={muted ? styles.readoutValueMuted : styles.readoutValue}>{value}</span>
      {unit ? <span className={styles.readoutUnit}>{unit}</span> : null}
    </div>
  );
}

export function Hint({ children, inset = false }) {
  return <p className={inset ? styles.hintInset : styles.hint}>{children}</p>;
}

/** Long advisory text, folded away behind one line until asked for. */
export function Note({ label, children }) {
  return (
    <details className={styles.note}>
      <summary className={styles.noteSummary}>
        <span className={styles.noteMark} aria-hidden="true">
          i
        </span>
        {label}
      </summary>
      <div className={styles.noteBody}>{children}</div>
    </details>
  );
}

/** What the model wants to tell you about this object, right now. */
export function Status({ children, tone = 'info' }) {
  return <div className={tone === 'warning' ? styles.statusWarning : styles.status}>{children}</div>;
}

const HEX_COLOUR = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(value) {
  const trimmed = String(value || '').trim();
  if (!HEX_COLOUR.test(trimmed)) return null;
  return `#${trimmed.replace('#', '').toUpperCase()}`;
}

/**
 * The shortest gap between two commits of a system-picker drag: about 15 a
 * second. Each commit is a whole project edit — a reducer pass, a 3D rebuild
 * and a Realistic refine restart — and the picker reports a colour for every
 * pixel the pointer crosses, so committing at its rate saturated the main
 * thread (docs/paint-edit-performance.md §2.4). Fifteen is still faster than
 * the eye follows a colour change across a wall.
 */
const PICK_COMMIT_INTERVAL_MS = 67;

const scheduleFrame = (callback) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16);
const cancelFrame = (handle) =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle);

/**
 * Commits the latest of a burst of values at most once per frame and no more
 * often than `PICK_COMMIT_INTERVAL_MS`, always ending on the last one pushed.
 *
 * `push` keeps only the newest value and arranges one commit for it: on the
 * next frame when the last commit is old enough, otherwise on the first frame
 * after the interval has run out — so a burst gets a trailing commit of its
 * final value without anyone having to ask. `flush` commits whatever is
 * waiting now, synchronously; it is what a pick end calls *before* it closes
 * the gesture, so the last colour lands inside it. `cancel` drops the waiting
 * value, for an edit that supersedes it.
 */
function useCoalescedCommit(commit) {
  const commitRef = useRef(commit);
  // A layout effect, so a frame callback that lands between a render and its
  // passive effects still commits through the latest render's callback.
  useLayoutEffect(() => {
    commitRef.current = commit;
  });
  const queueRef = useRef({ pending: null, frame: 0, timer: 0, lastCommitAt: -Infinity });

  const cancel = useCallback(() => {
    const queue = queueRef.current;
    if (queue.frame) cancelFrame(queue.frame);
    if (queue.timer) clearTimeout(queue.timer);
    queue.frame = 0;
    queue.timer = 0;
    queue.pending = null;
  }, []);

  const flush = useCallback(() => {
    const queue = queueRef.current;
    const value = queue.pending;
    cancel();
    if (value === null) return;
    queue.lastCommitAt = performance.now();
    commitRef.current(value);
  }, [cancel]);

  const push = useCallback(
    (value) => {
      const queue = queueRef.current;
      queue.pending = value;
      if (queue.frame || queue.timer) return;
      const onFrame = () => {
        queue.frame = 0;
        flush();
      };
      const wait = queue.lastCommitAt + PICK_COMMIT_INTERVAL_MS - performance.now();
      if (wait > 0) {
        queue.timer = setTimeout(() => {
          queue.timer = 0;
          queue.frame = scheduleFrame(onFrame);
        }, wait);
      } else {
        queue.frame = scheduleFrame(onFrame);
      }
    },
    [flush],
  );

  return { push, flush, cancel };
}

/**
 * A colour: the system picker and the hex beside it (the pair RoomProperties
 * introduced), plus a swatch strip of named catalogue colours with a toggle
 * between catalogues.
 *
 * `value` is `{hex, name, catalogue, solarAbsorptance}`. Picking a swatch hands
 * back the swatch whole — its name, catalogue and solar absorptance; picking
 * in the system picker or typing a hex is a custom colour named by its hex.
 * `catalogues` is `{key: {label, colours: [{name, hex, sa}]}}`.
 *
 * The hex text keeps its own draft so a half-typed value stays on screen; it
 * commits the moment it is a whole six-digit hex, and reverts on blur if it
 * never became one.
 *
 * `onPickStart` / `onPickEnd` (optional) bracket a pick in the system picker.
 * The picker fires an `input` event for every colour the pointer passes over,
 * and each one is an `onChange`; a caller that would rather that burst were one
 * edit — one undo step, one settle — brackets it. Start fires on the first
 * picker `input` after the last end; end fires on the native `change` (the
 * picker closing on a colour) and on blur, whichever comes first, and at most
 * once per start. Swatches and the hex box are single edits and never bracket.
 *
 * The picker's colours are not committed one `onChange` each: they are
 * coalesced (`useCoalescedCommit`) to the latest colour at most once a frame
 * and about fifteen times a second, and whatever is still waiting is flushed
 * on the native `change`, on blur and on unmount — always before `onPickEnd`,
 * so a bracketed pick stays one undo step that ends on the colour the pointer
 * stopped on. The picker's own swatch and the hex text follow the pointer
 * straight away from a local `liveHex`, never waiting for the commit.
 * Swatches and the hex box commit immediately, and drop any picker colour
 * still waiting, since they supersede it.
 */
export function ColourField({ label, value, onChange, catalogues = null, id, onPickStart, onPickEnd }) {
  const pickerRef = useRef(null);
  const pickingRef = useRef(false);
  // The colour the picker is showing while its commit is still on the way.
  const [liveHex, setLiveHex] = useState(null);
  // Read through refs so the native listener below is bound once and still
  // calls the callbacks of the latest render.
  const pickEndRef = useRef(onPickEnd);
  useEffect(() => {
    pickEndRef.current = onPickEnd;
  });
  const hex = normalizeHex(value?.hex) || '#000000';
  const catalogueKeys = Object.keys(catalogues || {});
  const [draft, setDraft] = useState(hex);
  const [lastHex, setLastHex] = useState(hex);
  if (hex !== lastHex) {
    setLastHex(hex);
    setDraft(hex);
  }
  const [activeCatalogue, setActiveCatalogue] = useState(
    catalogueKeys.includes(value?.catalogue) ? value.catalogue : catalogueKeys[0] || null,
  );

  const commitCustom = (nextHex) => {
    const normalized = normalizeHex(nextHex);
    if (!normalized) return false;
    if (normalized !== hex || value?.catalogue !== 'custom') {
      onChange({ hex: normalized, name: normalized, catalogue: 'custom', solarAbsorptance: null });
    }
    return true;
  };

  const pickCommit = useCoalescedCommit((nextHex) => {
    setLiveHex(null);
    commitCustom(nextHex);
  });
  const { flush: flushPick } = pickCommit;
  const endPick = useCallback(() => {
    flushPick();
    if (!pickingRef.current) return;
    pickingRef.current = false;
    pickEndRef.current?.();
  }, [flushPick]);
  // React's onChange on a colour input is the native `input` event; the
  // native `change` — the one that means "the picker closed on this" — has to
  // be listened for directly.
  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return undefined;
    picker.addEventListener('change', endPick);
    return () => picker.removeEventListener('change', endPick);
  }, [endPick]);
  // A field that unmounts mid-pick (the selection moved on) still closes it.
  useEffect(() => endPick, [endPick]);

  // An immediate edit (a swatch, a typed hex) supersedes a picker colour still
  // waiting to be committed.
  const commitNow = (commit) => {
    pickCommit.cancel();
    setLiveHex(null);
    commit();
  };

  const colours = activeCatalogue ? catalogues[activeCatalogue]?.colours || [] : [];
  const shownHex = liveHex || hex;

  return (
    <div data-colour-field={id || label}>
      {/* A div, not Field's <label>: a label holding the picker would open the
          system colour dialog on any click along the row. */}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{label}</span>
        <span className={styles.colourControls}>
          <input
            ref={pickerRef}
            type="color"
            className={styles.colourPicker}
            value={shownHex.toLowerCase()}
            onChange={(event) => {
              const nextHex = normalizeHex(event.target.value);
              if (!nextHex) return;
              if (!pickingRef.current && onPickStart) {
                pickingRef.current = true;
                onPickStart();
              }
              setLiveHex(nextHex);
              setDraft(nextHex);
              pickCommit.push(nextHex);
            }}
            onBlur={endPick}
            aria-label={`${label} picker`}
          />
          <input
            type="text"
            className={styles.colourHex}
            value={draft}
            spellCheck={false}
            aria-label={`${label} hex`}
            onChange={(event) => {
              const typed = event.target.value;
              setDraft(typed);
              if (normalizeHex(typed)) commitNow(() => commitCustom(typed));
            }}
            onBlur={() => setDraft(hex)}
          />
          <span className={styles.colourName} title={value?.name || hex}>
            {value?.catalogue === 'custom' ? 'Custom' : value?.name || ''}
          </span>
        </span>
      </div>
      {catalogueKeys.length ? (
        <div className={styles.swatchBlock}>
          {catalogueKeys.length > 1 ? (
            <div className={styles.swatchToggle} role="group" aria-label={`${label} catalogue`}>
              {catalogueKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={key === activeCatalogue ? styles.swatchToggleButtonActive : styles.swatchToggleButton}
                  aria-pressed={key === activeCatalogue}
                  onClick={() => setActiveCatalogue(key)}
                >
                  {catalogues[key].label}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.swatchStrip}>
            {colours.map((colour) => {
              const selected = value?.catalogue === activeCatalogue && value?.name === colour.name;
              return (
                <button
                  key={colour.name}
                  type="button"
                  className={selected ? styles.swatchActive : styles.swatch}
                  style={{ background: colour.hex }}
                  title={`${colour.name} ${colour.hex}`}
                  aria-label={colour.name}
                  aria-pressed={selected}
                  data-swatch={colour.name}
                  onClick={() =>
                    commitNow(() =>
                      onChange({
                        hex: colour.hex,
                        name: colour.name,
                        catalogue: activeCatalogue,
                        solarAbsorptance: Number.isFinite(colour.sa) ? colour.sa : null,
                      }),
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { styles as panelKitStyles };
