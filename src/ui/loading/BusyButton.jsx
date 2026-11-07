import { LOADING_TIMING } from './loadingCopy';
import Spinner from './Spinner';
import { useDelayedFlag } from './timing';
import styles from './BusyButton.module.css';

/**
 * A button that answers its own click: while `busy` it swaps its label for the
 * spinner and `busyLabel`, keeps its width, is disabled, and holds the busy
 * look at least 400 ms so a quick job does not blink. `error` renders inline
 * beside it. Everything else is an ordinary <button> prop, `className`
 * included, so it keeps whatever look the screen gives its buttons.
 */
export default function BusyButton({
  busy = false,
  busyLabel,
  error = null,
  children,
  className = '',
  disabled = false,
  spinnerTone = 'light',
  minBusyMs = LOADING_TIMING.minVisibleMs,
  type = 'button',
  ...rest
}) {
  const looksBusy = useDelayedFlag(busy, { minVisibleMs: minBusyMs });
  const showBusy = busy || looksBusy;

  return (
    <>
      <button
        {...rest}
        type={type}
        className={`${styles.button} ${className}`}
        disabled={disabled || showBusy}
        data-busy={showBusy ? 'true' : 'false'}
        aria-busy={showBusy ? 'true' : 'false'}
      >
        <span className={styles.faces}>
          <span className={styles.face} data-hidden={showBusy ? 'true' : 'false'} aria-hidden={showBusy}>
            {children}
          </span>
          <span className={styles.face} data-hidden={showBusy ? 'false' : 'true'} aria-hidden={!showBusy}>
            <Spinner tone={spinnerTone} />
            {/* Drawn from the attribute, so the idle button's text is only its label. */}
            <span className={styles.busyText} data-label={busyLabel || ''} />
          </span>
        </span>
      </button>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
