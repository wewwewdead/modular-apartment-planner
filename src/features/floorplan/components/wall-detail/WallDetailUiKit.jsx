import { useId, useState } from 'react';
import styles from './WallDetailEditor.module.css';

const GLYPHS = {
  select: <path d="M6 3l12 7.5-5.2 1.4L15 19l-2.4 1-2.6-6.8L6 17z" fill="currentColor" stroke="none" />,
  pan: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M12 3l-2.6 2.6M12 3l2.6 2.6M12 21l-2.6-2.6M12 21l2.6-2.6" />
      <path d="M3 12l2.6-2.6M3 12l2.6 2.6M21 12l-2.6-2.6M21 12l-2.6 2.6" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M12 4v16" />
    </>
  ),
  trace: (
    <>
      <path d="M4 6l8-2 8 5-2 10-11 1z" />
      <circle cx="4" cy="6" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="20" cy="9" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  stud: <rect x="9" y="3" width="6" height="18" rx="1" />,
  noggin: <rect x="3" y="9" width="18" height="6" rx="1" />,
  screw: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M8 12h8" />
    </>
  ),
  measure: (
    <>
      <path d="M3 12h18M4 7v10M20 7v10" />
      <path d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
};

export function ToolGlyph({ name }) {
  const glyph = GLYPHS[name];
  if (!glyph) return null;
  return (
    <svg
      className={styles.glyph}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph}
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function NumberField({ label, value, onChange, min, step = 1, suffix = 'mm', disabled = false }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.inputWrap}>
        <input
          type="number"
          value={Number.isFinite(Number(value)) ? value : ''}
          min={min}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <small>{suffix}</small> : null}
      </span>
    </label>
  );
}

export function SelectField({ label, value, onChange, children }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Metric({ label, value, note }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export function ToolbarButton({ active = false, danger = false, children, ...props }) {
  return (
    <button
      type="button"
      className={`${styles.button} ${active ? styles.buttonActive : ''} ${danger ? styles.buttonDanger : ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Icon + label + shortcut badge. The single visual language for every canvas tool. */
export function ToolButton({
  icon,
  label,
  shortcut,
  title,
  active = false,
  danger = false,
  disabled = false,
  toggle = true,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`${styles.toolButton} ${active ? styles.toolButtonActive : ''} ${
        danger ? styles.toolButtonDanger : ''
      }`}
      title={title}
      aria-label={title}
      aria-pressed={toggle ? active : undefined}
      aria-keyshortcuts={shortcut || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <ToolGlyph name={icon} />
      <span className={styles.toolButtonLabel}>{label}</span>
      {shortcut ? <kbd className={styles.kbd}>{shortcut}</kbd> : null}
    </button>
  );
}

/** Trade jargon and long guidance, folded behind a small "?" until asked for. */
export function InfoHint({ label = 'Why this matters', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className={styles.infoHint} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.infoHintButton}
        aria-expanded={open}
        aria-controls={bodyId}
        title={open ? 'Hide this note' : 'Show this note'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.infoHintMark} aria-hidden="true">
          ?
        </span>
        <span>{label}</span>
        <Chevron />
      </button>
      <div className={styles.infoHintBody} id={bodyId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** Secondary fields most people never touch, tucked behind one toggle per section. */
export function AdvancedGroup({ label = 'Advanced', children }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className={styles.advanced} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className={styles.advancedToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <Chevron />
        <span>{label}</span>
      </button>
      <div className={styles.advancedBody} id={bodyId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** Collapsible panel section. `step` renders the numbered workflow badge. */
export function CollapsibleSection({ id, step, title, summary, badge, badgeTone, open, onToggle, innerRef, children }) {
  const bodyId = `wall-detail-${id}`;
  return (
    <section className={styles.collapsible} data-open={open ? 'true' : 'false'} ref={innerRef}>
      <h2 className={styles.sectionHeading}>
        <button
          type="button"
          className={styles.sectionHeader}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          {step ? <span className={styles.sectionStep}>{step}</span> : null}
          <span className={styles.sectionTitles}>
            <span className={styles.sectionTitle}>{title}</span>
            {summary ? <small>{summary}</small> : null}
          </span>
          {badge ? (
            <span className={styles.sectionBadge} data-tone={badgeTone || 'neutral'}>
              {badge}
            </span>
          ) : null}
          <Chevron />
        </button>
      </h2>
      <div className={styles.sectionBody} id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** Compact numbered map of the whole job, so nobody has to guess the order. */
export function StepStrip({ steps, isOpen, onSelect }) {
  return (
    <nav className={styles.stepStrip} aria-label="Wall detailing workflow">
      <span className={styles.stepStripLabel}>Workflow</span>
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              data-open={isOpen(step.id) ? 'true' : 'false'}
              title={`${index + 1}. ${step.title} — ${step.hint}`}
              onClick={() => onSelect(step.id)}
            >
              <span className={styles.stepIndex}>{index + 1}</span>
              <span className={styles.stepName}>{step.short}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className={styles.emptyState}>
      {icon ? <ToolGlyph name={icon} /> : null}
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
    </div>
  );
}
