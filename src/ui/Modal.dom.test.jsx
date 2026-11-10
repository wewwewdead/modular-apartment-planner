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
