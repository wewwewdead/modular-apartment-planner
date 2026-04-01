import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EditHandles from './EditHandles';

describe('EditHandles', () => {
  it('keeps the visible handle screen-sized as zoom increases', () => {
    const handle = { id: 'start', x: 100, y: 80 };
    const onHandlePointerDown = vi.fn();

    const markupAtOneX = renderToStaticMarkup(
      <svg>
        <EditHandles handles={[handle]} onHandlePointerDown={onHandlePointerDown} zoom={1} />
      </svg>,
    );
    const markupAtFourX = renderToStaticMarkup(
      <svg>
        <EditHandles handles={[handle]} onHandlePointerDown={onHandlePointerDown} zoom={4} />
      </svg>,
    );

    expect(markupAtOneX).toContain('class="sketchStudioEditHandle"');
    expect(markupAtOneX).toContain('r="4"');
    expect(markupAtFourX).toContain('class="sketchStudioEditHandle"');
    expect(markupAtFourX).toContain('r="1"');
  });

  it('renders a larger invisible hit area than the visible handle', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <EditHandles handles={[{ id: 'radius', x: 10, y: 12 }]} onHandlePointerDown={() => {}} zoom={2} />
      </svg>,
    );

    expect(markup).toContain('class="sketchStudioEditHandleHitArea"');
    expect(markup).toContain('r="3.5"');
    expect(markup).toContain('class="sketchStudioEditHandle"');
    expect(markup).toContain('r="2"');
    expect(markup).toContain('pointer-events="none"');
  });
});
