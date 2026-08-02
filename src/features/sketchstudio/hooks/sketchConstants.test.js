import { describe, expect, it } from 'vitest';
import { getDraftPreviewEntity, TOOL_DEFINITIONS, TOOL_SHORTCUT_MAP } from './sketchConstants';

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

  it('declares the fastener tool without colliding with another shortcut', () => {
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === 'fastener')).toMatchObject({
      label: 'Fastener',
      shortLabel: 'FAS',
      shortcut: 'K',
      description: 'Place screws, bolts, and other catalog hardware',
    });

    // Every tool keeps its own key, so the derived shortcut map (and the overlay
    // built from it) can never silently drop a tool.
    const shortcuts = TOOL_DEFINITIONS.map((tool) => tool.shortcut.toLowerCase());
    expect(new Set(shortcuts).size).toBe(TOOL_DEFINITIONS.length);
    expect(TOOL_SHORTCUT_MAP.size).toBe(TOOL_DEFINITIONS.length);
    expect(TOOL_SHORTCUT_MAP.get('k')).toBe('fastener');
  });

  it('previews the active fastener as a pilot circle with its head outline', () => {
    const draftPreview = getDraftPreviewEntity(
      {
        type: 'fastener',
        step: 'place',
        startPoint: { x: 200, y: 140 },
        currentPoint: { x: 200, y: 140 },
        points: [{ x: 200, y: 140 }],
      },
      { units: 'mm' },
      null,
      { viewMode: 'plan', activeHardwareId: 'hw-screw-8-32' },
    );

    expect(draftPreview).toEqual({
      type: 'fastener-preview',
      cx: 200,
      cy: 140,
      diameter: 3,
      headDiameter: 8,
      hardwareId: 'hw-screw-8-32',
    });
  });

  it('falls back to the default fastener when the ui carries no active hardware', () => {
    const draftPreview = getDraftPreviewEntity(
      { type: 'fastener', step: 'place', currentPoint: { x: 10, y: 20 }, points: [] },
      { units: 'mm' },
      null,
      { viewMode: 'plan' },
    );

    expect(draftPreview).toMatchObject({ hardwareId: 'hw-screw-8-32', diameter: 3 });
  });
});
