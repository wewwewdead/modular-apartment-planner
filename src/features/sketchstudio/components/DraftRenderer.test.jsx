import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DraftRenderer from './DraftRenderer';

describe('DraftRenderer', () => {
  it('renders a leader-label preview for text drafts', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <DraftRenderer
          draft={{
            type: 'text',
            points: [{ x: 40, y: 200 }],
            currentPoint: { x: 180, y: 120 },
          }}
          draftPreview={{
            type: 'text-leader',
            x: 180,
            y: 120,
            text: 'Label',
            fontSize: 120,
            rotation: 0,
            target: { x: 40, y: 200 },
          }}
          units="mm"
          zoom={1}
        />
      </svg>,
    );

    expect(markup).toContain('sketchStudioDraftLeader');
    expect(markup).toContain('sketchStudioDraftLeaderHead');
    expect(markup).toContain('sketchStudioDraftTextBox');
    expect(markup).toContain('Label');
  });
});
