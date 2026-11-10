// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ErrorScreen, homeHref } from './ErrorBoundary';

afterEach(cleanup);

describe('error screen on the web', () => {
  it('sends Go Home to the app root relative to where it is served', () => {
    const view = render(<ErrorScreen error={new Error('boom')} onRetry={() => {}} />);
    const home = [...view.container.querySelectorAll('a')].find((link) => /home/i.test(link.textContent));
    expect(home.getAttribute('href')).toBe('./');
  });

  it('uses the hash route in the desktop build, which runs from file://', () => {
    expect(homeHref('file:')).toBe('#/');
    expect(homeHref('https:')).toBe('./');
  });
});
