import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLinearDimensionAnnotation } from '@/domain/models';
import AnnotationRenderer from './AnnotationRenderer';
import { CanvasZoomProvider } from './CanvasZoomContext';

function dimensionFloor() {
  const annotation = createLinearDimensionAnnotation({ x: 0, y: 0 }, { x: 4000, y: 0 }, { offset: 300 });
  return {
    id: 'floor-1',
    walls: [],
    rooms: [],
    annotations: [annotation],
    annotationSettings: {},
  };
}

describe('manual dimension annotation text', () => {
  it('renders the measurement value, not just the dimension line', () => {
    const html = renderToStaticMarkup(
      <svg>
        <AnnotationRenderer floor={dimensionFloor()} />
      </svg>,
    );

    expect(html).toContain('4000 mm');
    expect(html).toContain('font-size="128"');
  });

  it('scales dimension text up when the canvas is zoomed out, so numbers stay readable like the lines do', () => {
    const html = renderToStaticMarkup(
      <svg>
        <CanvasZoomProvider value={0.05}>
          <AnnotationRenderer floor={dimensionFloor()} />
        </CanvasZoomProvider>
      </svg>,
    );

    // 128 model-mm at baseline zoom 0.1 → doubled at zoom 0.05 = constant ~13 px on screen.
    expect(html).toContain('font-size="256"');
  });

  it('renders at the plotted model size at the baseline zoom and outside any canvas', () => {
    const zoomed = renderToStaticMarkup(
      <svg>
        <CanvasZoomProvider value={0.1}>
          <AnnotationRenderer floor={dimensionFloor()} />
        </CanvasZoomProvider>
      </svg>,
    );

    expect(zoomed).toContain('font-size="128"');
  });
});
