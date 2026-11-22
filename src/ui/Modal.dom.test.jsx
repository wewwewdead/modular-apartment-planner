// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import Modal from './Modal';

afterEach(cleanup);

function press(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('Modal keyboard isolation', () => {
  it('keeps keys away from the app behind it, wherever focus is', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    const onKeyInside = vi.fn();
    const view = render(
      <Modal title="Delete 'Floor 2'?" onClose={() => {}}>
        <button type="button" onKeyDown={onKeyInside}>
          OK
        </button>
      </Modal>,
    );
    const ok = view.getByText('OK');

    // Focus on the dialog's own button: the button hears it, the app does not.
    press(ok, 'Delete');
    press(ok, 'z', { ctrlKey: true });
    expect(onKeyInside).toHaveBeenCalledTimes(2);
    // Focus left behind on the page.
    press(document.body, 'Delete');
    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
  });

  it('still closes on Escape, and lets Escape through as before', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    const onClose = vi.fn();
    const view = render(
      <Modal title="Confirm" onClose={onClose}>
        <button type="button">OK</button>
      </Modal>,
    );
    press(view.getByText('OK'), 'Escape');
    press(document.body, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(behind).toHaveBeenCalledTimes(2);
    window.removeEventListener('keydown', behind);
  });

  it('closes only the dialog on top when one is open over another', () => {
    const closeBelow = vi.fn();
    const closeTop = vi.fn();
    const below = render(
      <Modal title="Open Project" onClose={closeBelow}>
        <p>drafts</p>
      </Modal>,
    );
    const top = render(
      <Modal title="Confirm" onClose={closeTop}>
        <button type="button">OK</button>
      </Modal>,
    );

    press(top.getByText('OK'), 'Escape');
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBelow).not.toHaveBeenCalled();

    // With the confirm gone, the next Escape is the dialog under it.
    top.unmount();
    press(document.body, 'Escape');
    expect(closeBelow).toHaveBeenCalledTimes(1);
    expect(closeTop).toHaveBeenCalledTimes(1);
    below.unmount();
  });

  it('marks the Escape it used, for listeners that were there before it opened', () => {
    // A window listener added before the dialog (focus mode's Escape) hears the
    // press first; it can only stand down if the press already says it was used.
    let seenPrevented = null;
    const earlier = (event) => {
      seenPrevented = event.defaultPrevented;
    };
    window.addEventListener('keydown', earlier);
    const view = render(
      <Modal title="Open Project" onClose={() => {}}>
        <button type="button">OK</button>
      </Modal>,
    );

    const event = press(view.getByText('OK'), 'Escape');
    expect(seenPrevented).toBe(true);
    expect(event.defaultPrevented).toBe(true);

    view.unmount();
    // No dialog open: an Escape is nobody's but the app's.
    expect(press(document.body, 'Escape').defaultPrevented).toBe(false);
    window.removeEventListener('keydown', earlier);
  });

  it('is announced as a modal dialog', () => {
    const view = render(
      <Modal title="Open Project" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    const dialog = view.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('stops listening once it closes', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    const view = render(
      <Modal title="Confirm" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    view.unmount();
    press(document.body, 'Delete');
    expect(behind).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', behind);
  });
});
