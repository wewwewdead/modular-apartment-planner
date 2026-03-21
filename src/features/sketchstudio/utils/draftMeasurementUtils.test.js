import { describe, expect, it } from 'vitest';
import { buildDraftMeasurementAnnotations } from './draftMeasurementUtils';

describe('draftMeasurementUtils', () => {
  it('builds a live line-length annotation', () => {
    const annotations = buildDraftMeasurementAnnotations({
      draft: { type: 'line' },
      draftPreview: { type: 'line', x1: 0, y1: 0, x2: 120, y2: 0 },
      units: 'mm',
      zoom: 1,
    });

    expect(annotations).toHaveLength(1);
    expect(annotations[0].text).toBe('120 mm');
  });

  it('builds width and height annotations for rectangles', () => {
    const annotations = buildDraftMeasurementAnnotations({
      draft: { type: 'rect' },
      draftPreview: {
        type: 'rect',
        startPoint: { x: 10, y: 20 },
        endPoint: { x: 110, y: 80 },
      },
      units: 'mm',
      zoom: 1,
    });

    expect(annotations).toHaveLength(2);
    expect(annotations[0].text).toBe('100 mm');
    expect(annotations[1].text).toBe('60 mm');
  });

  it('builds segment annotations for polylines', () => {
    const annotations = buildDraftMeasurementAnnotations({
      draft: { type: 'polyline' },
      draftPreview: {
        type: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
        closed: false,
      },
      units: 'mm',
      zoom: 1,
    });

    expect(annotations).toHaveLength(1);
    expect(annotations[0].text).toBe('30 mm');
  });

  it('builds labels for isometric rectangle previews from polygon edges', () => {
    const annotations = buildDraftMeasurementAnnotations({
      draft: { type: 'rect' },
      draftPreview: {
        type: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 80, y: 40 }, { x: 40, y: 80 }, { x: -40, y: 40 }],
        closed: true,
        width: 92,
        height: 56,
      },
      units: 'mm',
      zoom: 1,
    });

    expect(annotations).toHaveLength(2);
    expect(annotations[0].text).toBe('92 mm');
    expect(annotations[1].text).toBe('56 mm');
  });

  it('builds radius and diameter labels for circular previews', () => {
    const circleAnnotations = buildDraftMeasurementAnnotations({
      draft: { type: 'circle' },
      draftPreview: {
        type: 'circle',
        center: { x: 50, y: 50 },
        radius: 40,
      },
      units: 'mm',
      zoom: 1,
    });
    const holeAnnotations = buildDraftMeasurementAnnotations({
      draft: { type: 'holeCircle' },
      draftPreview: {
        type: 'feature',
        featureType: 'hole',
        shape: 'ellipse',
        cx: 50,
        cy: 50,
        rx: 40,
        ry: 20,
        diameter: 80,
      },
      units: 'mm',
      zoom: 1,
    });

    expect(circleAnnotations[0].text).toBe('R 40 mm');
    expect(holeAnnotations[0].text).toBe('Dia 80 mm');
  });
});
