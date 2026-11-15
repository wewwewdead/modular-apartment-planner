import { useEffect, useId, useRef, useState } from 'react';
import { useNumericDraft } from '@/hooks/useNumericDraft';
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
  // A board with one block of it picked out in another finish.
  accent: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <rect x="12" y="8" width="6" height="8" fill="currentColor" stroke="none" />
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
  // A luminaire as a lit disc: the RCP circle with its throw drawn round it, so
  // it never reads as the screw's slotted head.
  light: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
  measure: (
    <>
      <path d="M3 12h18M4 7v10M20 7v10" />
      <path d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
    </>
  ),
  // A hole cut through a sheet: the sheet's own edge, then the void inside it
  // drawn the way a plan hatches a cut-out.
  opening: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <rect x="7.5" y="8" width="9" height="8" />
      <path d="M7.5 8l9 8M16.5 8l-9 8" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  undo: (
    <>
      <path d="M8 6l-4 4 4 4" />
      <path d="M4 10h10a6 6 0 0 1 0 12h-4" />
    </>
  ),
  redo: (
    <>
      <path d="M16 6l4 4-4 4" />
      <path d="M20 10H10a6 6 0 0 0 0 12h4" />
    </>
  ),
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  focus: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  layers: (
    <>
      <path d="M12 4l9 5-9 5-9-5z" />
      <path d="M3 14l9 5 9-5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6" />
      <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
    </>
  ),
  minus: <path d="M6 12h12" />,
  plus: <path d="M12 6v12M6 12h12" />,
  fit: (
    <>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      <rect x="9" y="9" width="6" height="6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </>
  ),
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
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

/**
 * Typing holds a draft and commits on Enter or blur (see useNumericDraft).
 * Committing per keystroke made the box impossible to clear — '' parsed to 0,
 * 0 was written back — and turned every keystroke into an undo step and a 3D
 * rebuild.
 */
export function NumberField({ label, value, onChange, min, step = 1, suffix = 'mm', disabled = false }) {
  // null/undefined must never reach `value`, or React flips the input to uncontrolled.
  const stored = value != null && Number.isFinite(Number(value)) ? value : '';
  const { displayValue, handleChange, handleKeyDown, handleBlur } = useNumericDraft(stored, onChange);
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.inputWrap}>
        <input
          type="number"
          value={displayValue}
          min={min}
          step={step}
          disabled={disabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
        {suffix ? <small>{suffix}</small> : null}
      </span>
    </label>
  );
}

/**
 * A number that is allowed to be negative. Same draft rule as NumberField; it
 * matters most here, since the first character of "-150" is a lone minus that
 * parses to nothing. Only `min` is left off.
 */
export function SignedNumberField({ label, value, onChange, step = 1, suffix = 'mm', disabled = false }) {
  const { displayValue, handleChange, handleKeyDown, handleBlur } = useNumericDraft(value, onChange);
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.inputWrap}>
        <input
          type="number"
          value={displayValue}
          step={step}
          disabled={disabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
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

/**
 * One derived number as a schedule line: label left, the value set in the
 * blueprint face on a dotted leader, its note underneath in secondary text.
 * Computed values are read, never typed, so nothing here looks like a field.
 */
export function ReadoutRow({ label, value, note }) {
  return (
    <div className={styles.readoutRow}>
      <span className={styles.readoutLabel}>{label}</span>
      <span className={styles.readoutLeader} aria-hidden="true" />
      <strong className={styles.readoutValue}>{value}</strong>
      {note ? <small className={styles.readoutNote}>{note}</small> : null}
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

/**
 * Icon + label + shortcut key. The single visual language for every canvas tool.
 * The key is a quiet hint beside the label, not a boxed badge; it is in the
 * tooltip too. `iconOnly` drops both for the toolbar's Undo / Redo / Delete,
 * whose names live in the tooltip and the accessible name.
 */
export function ToolButton({
  icon,
  label,
  shortcut,
  title,
  active = false,
  danger = false,
  disabled = false,
  toggle = true,
  iconOnly = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`${styles.toolButton} ${active ? styles.toolButtonActive : ''} ${
        danger ? styles.toolButtonDanger : ''
      } ${iconOnly ? styles.toolButtonIconOnly : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={toggle ? active : undefined}
      aria-keyshortcuts={shortcut || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <ToolGlyph name={icon} />
      {iconOnly ? null : <span className={styles.toolButtonLabel}>{label}</span>}
      {shortcut && !iconOnly ? (
        <span className={styles.toolKey} aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

/** A square glyph button for chrome actions (zoom, close, help). The name is the tooltip and the accessible name. */
export function IconButton({ icon, label, title, active, danger = false, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`${styles.iconButton} ${danger ? styles.iconButtonDanger : ''} ${className}`}
      title={title || label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      {...props}
    >
      <ToolGlyph name={icon} />
    </button>
  );
}

/** A row of mutually exclusive choices drawn as one control — the workspace view switch. */
export function SegmentedControl({ label, options, value, onChange, className = '' }) {
  return (
    <div className={`${styles.segmentedControl} ${className}`} role="group" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`${styles.segmentedOption} ${selected ? styles.segmentedOptionActive : ''}`}
            aria-pressed={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/*
 * Popovers and the editors' Escape key.
 *
 * Both assembly editors listen for keys on `window` in the capture phase and
 * read Escape as "cancel the gesture, then return to Select". An open popover
 * has to take that Escape for itself — close, and nothing else — while a closed
 * one must not swallow it. The editor's listener is registered first, so it
 * asks `isPopoverOpen()` and stands aside; the popover's own listener (only
 * attached while it is open) then claims the key outright, so a bubble-phase
 * Escape handler (the trace cancel) never sees it either.
 */
const openPopovers = new Set();

/** True while any kit popover is open: the editors' Escape handlers stand aside for it. */
export function isPopoverOpen() {
  return openPopovers.size > 0;
}

/**
 * A button that opens a small panel under itself: the Export and Layers menus
 * and the "?" note. The panel stays mounted and `hidden` while closed, like a
 * section body, so what it holds is always in the DOM. It closes on Escape, on
 * a pointer-down outside it, and — for menus — when an item is chosen.
 */
export function Popover({
  label,
  icon,
  title,
  ariaLabel,
  panelLabel,
  kind = 'dialog',
  align = 'end',
  caret = true,
  indicator = false,
  triggerClassName = '',
  panelClassName = '',
  children,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const focusFirstRef = useRef(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    openPopovers.add(token);
    if (focusFirstRef.current) {
      focusFirstRef.current = false;
      panelRef.current?.querySelector('button:not(:disabled), input, select, [tabindex="0"]')?.focus();
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      openPopovers.delete(token);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // A menu closes once one of its items has done its work.
  const handlePanelClick = (event) => {
    if (kind !== 'menu' || !event.target.closest?.('[role="menuitem"]')) return;
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Up / Down walk a menu's items; Home / End jump to its ends.
  const handlePanelKeyDown = (event) => {
    if (kind !== 'menu') return;
    const items = Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
    else if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items[items.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <div className={styles.popover} ref={rootRef} data-open={open ? 'true' : 'false'}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.popoverTrigger} ${label ? '' : styles.popoverTriggerIcon} ${triggerClassName}`}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup={kind === 'menu' ? 'menu' : 'dialog'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(event) => {
          // A keyboard click (Enter / Space) carries no pointer detail: take focus into the panel.
          focusFirstRef.current = !open && event.detail === 0;
          setOpen((value) => !value);
        }}
      >
        {icon ? <ToolGlyph name={icon} /> : null}
        {label ? <span>{label}</span> : null}
        {indicator ? <span className={styles.popoverIndicator} aria-hidden="true" /> : null}
        {caret && label ? <Chevron /> : null}
      </button>
      <div
        ref={panelRef}
        id={panelId}
        className={`${styles.popoverPanel} ${align === 'start' ? styles.popoverPanelStart : ''} ${panelClassName}`}
        role={kind === 'menu' ? 'menu' : 'dialog'}
        aria-label={panelLabel}
        hidden={!open}
        onKeyDown={handlePanelKeyDown}
        onClick={handlePanelClick}
      >
        {children}
      </div>
    </div>
  );
}

/** One choice in a `kind="menu"` Popover; choosing it closes the menu. */
export function MenuItem({ icon, label, detail, onSelect, ...props }) {
  return (
    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => onSelect?.()} {...props}>
      {icon ? <ToolGlyph name={icon} /> : null}
      <span className={styles.menuItemText}>
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </span>
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

/**
 * Collapsible panel section. `step` renders the numbered workflow badge;
 * `optional` marks an un-numbered step that keeps its place in the order.
 * `next` ({ label, onClick }) ends the open body with a "Next: …" button, and
 * `collapsible={false}` makes a section that is always open (the inspector's
 * Selection). The header lays out as: badge · titles (flex) · count · chevron
 * at the far right, with or without a step number.
 */
export function CollapsibleSection({
  id,
  step,
  optional = false,
  title,
  summary,
  badge,
  badgeTone,
  open,
  onToggle,
  innerRef,
  next = null,
  collapsible = true,
  children,
}) {
  const bodyId = `wall-detail-${id}`;
  const headerContent = (
    <>
      {step ? <span className={styles.sectionStep}>{step}</span> : null}
      <span className={styles.sectionTitles}>
        <span className={styles.sectionTitle}>
          {title}
          {optional ? <span className={styles.sectionOptional}>Optional</span> : null}
        </span>
        {summary ? <small>{summary}</small> : null}
      </span>
      {badge ? (
        <span className={styles.sectionBadge} data-tone={badgeTone || 'neutral'}>
          {badge}
        </span>
      ) : null}
      {collapsible ? <Chevron /> : null}
    </>
  );
  const isOpen = collapsible ? open : true;
  return (
    <section
      className={styles.collapsible}
      data-open={isOpen ? 'true' : 'false'}
      data-static={collapsible ? undefined : 'true'}
      data-step={step || optional ? 'true' : undefined}
      ref={innerRef}
    >
      <h2 className={styles.sectionHeading}>
        {collapsible ? (
          <button
            type="button"
            className={styles.sectionHeader}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            {headerContent}
          </button>
        ) : (
          <span className={`${styles.sectionHeader} ${styles.sectionHeaderStatic}`}>{headerContent}</span>
        )}
      </h2>
      <div className={styles.sectionBody} id={bodyId} hidden={!isOpen}>
        {children}
        {next ? (
          <div className={styles.stepNextRow}>
            <button type="button" className={styles.stepNext} onClick={next.onClick}>
              <span>Next: {next.label}</span>
              <ToolGlyph name="next" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
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
