import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/features/sketchstudio/components/SketchStudioLayout', () => ({
  default: function MockSketchStudioLayout({ status, confirmAvailable }) {
    return (
      <div data-status={status?.documentStatus || 'missing'} data-confirm={confirmAvailable ? 'ready' : 'missing'} />
    );
  },
}));

vi.mock('@/features/sketchstudio/hooks/useSketchStudio', async () => {
  const { useConfirmDialog } = await import('@/ui/ConfirmDialog');

  return {
    default: function useSketchStudioMock() {
      const confirm = useConfirmDialog();

      return {
        confirmAvailable: typeof confirm === 'function',
        status: { documentStatus: 'idle' },
      };
    },
  };
});

import SketchStudio from './SketchStudio';

describe('SketchStudio', () => {
  it('mounts the sketch hook within ConfirmDialogProvider', () => {
    const markup = renderToStaticMarkup(<SketchStudio />);

    expect(markup).toContain('data-status="idle"');
    expect(markup).toContain('data-confirm="ready"');
  });
});
