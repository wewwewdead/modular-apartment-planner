import { describe, expect, it } from 'vitest';
import { getDraftPreviewEntity, TOOL_DEFINITIONS } from './sketchConstants';

describe('sketchConstants', () => {
  it('builds a leader-label preview for text drafts', () => {
    const draftPreview = getDraftPreviewEntity(
      {
        type: 'text',
        points: [{ x: 40, y: 80 }],
        currentPoint: { x: 160, y: 120 },
      },
      {
        units: 'mm',
      },
      null,
      {
        viewMode: 'plan',
      },
    );

    expect(draftPreview).toEqual({
      type: 'text-leader',
      x: 160,
      y: 120,
      text: 'Label',
      fontSize: 120,
      rotation: 0,
      target: { x: 40, y: 80 },
    });
  });

  it('describes the text tool as leader-label placement', () => {
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === 'text')).toMatchObject({
      description: 'Place leader labels with a target point and offset',
    });
  });
});
