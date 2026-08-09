import { memo, useCallback, useId, useState } from 'react';
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
export const Section = memo(function Section({ id, title, summary, defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => readSectionPreference(id || title, defaultOpen));
  const bodyId = useId();

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      writeSectionPreference(id || title, !wasOpen);
      return !wasOpen;
    });
  }, [id, title]);

  return (
    <div className={styles.section}>
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

export function NumberField({ label, value, onChange, step, unit, min }) {
  const handle = useCallback(
    (event) => {
      const next = parseFloat(event.target.value);
      if (Number.isNaN(next)) return;
      onChange(next);
    },
    [onChange],
  );

  return (
    <Field label={label}>
      <input type="number" className={styles.controlNumber} value={value} onChange={handle} step={step} min={min} />
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
 */
export function SelectField({ label, value, onChange, children }) {
  return (
    <Field label={label}>
      <select className={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>
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

export { styles as panelKitStyles };
