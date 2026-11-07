/* @vitest-environment jsdom */
/**
 * A template card answers its own click: it goes busy while its module loads
 * and the other cards wait for it, then the workspace it brought is handed on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const gate = vi.hoisted(() => ({ resolve: null }));
vi.mock('../templates/index', () => ({
  default: [
    {
      id: 'shelf',
      name: 'Wall shelf',
      description: 'A shelf',
      difficulty: 'beginner',
      estimatedTime: '1 h',
      load: () =>
        new Promise((resolve) => {
          gate.resolve = resolve;
        }),
    },
    {
      id: 'box',
      name: 'Box',
      description: 'A box',
      difficulty: 'beginner',
      estimatedTime: '1 h',
      load: () => Promise.resolve({ default: {} }),
    },
  ],
}));
vi.mock('./TemplateThumbnail', () => ({ default: () => null }));

import TemplateGallery from './TemplateGallery';

afterEach(cleanup);

describe('TemplateGallery', () => {
  it('shows the clicked card as busy until its template arrives', async () => {
    const onLoadTemplate = vi.fn();
    render(<TemplateGallery onLoadTemplate={onLoadTemplate} />);
    const card = screen.getByRole('button', { name: /Wall shelf/ });
    await act(async () => {
      fireEvent.click(card);
    });
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.querySelector('[data-label]').getAttribute('data-label')).toBe('Opening…');
    expect(screen.getByRole('button', { name: /Box/ }).disabled).toBe(true);

    const workspace = { document: {} };
    await act(async () => {
      gate.resolve({ default: workspace });
    });
    expect(onLoadTemplate).toHaveBeenCalledWith(workspace);
  });
});
