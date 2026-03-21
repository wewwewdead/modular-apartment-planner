import { describe, expect, it } from 'vitest';
import { getPrecisionHudData } from './draftPrecisionUtils';

describe('draftPrecisionUtils', () => {
  it('shows chord length for arc previews during both draft steps', () => {
    const firstStep = getPrecisionHudData(
      {
        type: 'arc',
        points: [{ x: 0, y: 0 }],
        precisionInput: {},
      },
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
      },
    );
    const secondStep = getPrecisionHudData(
      {
        type: 'arc',
        points: [{ x: 0, y: 0 }, { x: 80, y: 60 }],
        precisionInput: {},
      },
      {
        type: 'arc',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 60 },
        control: { x: 60, y: 100 },
      },
    );

    expect(firstStep.measurements).toEqual([{ key: 'chord', label: 'Chord', value: 100 }]);
    expect(secondStep.measurements).toEqual([{ key: 'chord', label: 'Chord', value: 100 }]);
  });

  it('shows dimension value while picking the second point', () => {
    const hud = getPrecisionHudData(
      {
        type: 'dimension',
        precisionInput: {},
      },
      {
        type: 'dimension-guide',
        p1: { x: 0, y: 0 },
        p2: { x: 120, y: 0 },
      },
    );

    expect(hud.tool).toBe('dimension');
    expect(hud.measurements).toEqual([{ key: 'value', label: 'Value', value: 120 }]);
  });

  it('shows dimension value and absolute offset during placement', () => {
    const hud = getPrecisionHudData(
      {
        type: 'dimension',
        precisionInput: {},
      },
      {
        type: 'dimension',
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        subtype: 'horizontal',
        offset: -40,
      },
    );

    expect(hud.measurements).toEqual([
      { key: 'value', label: 'Value', value: 100 },
      { key: 'offset', label: 'Offset', value: 40 },
    ]);
  });

  it('keeps existing line HUD behavior intact', () => {
    const hud = getPrecisionHudData(
      {
        type: 'line',
        startPoint: { x: 0, y: 0 },
        precisionInput: { length: '' },
      },
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 30,
        y2: 40,
      },
    );

    expect(hud.measurements).toEqual([{ key: 'length', label: 'Length', value: 50 }]);
  });
});
