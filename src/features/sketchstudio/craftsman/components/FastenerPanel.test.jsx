import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FastenerPanel, { isFastenerPanelVisible } from './FastenerPanel';

const fastenerEntity = {
  id: 'feature-1',
  type: 'feature',
  featureType: 'hole',
  operation: 'subtract',
  shape: 'circle',
  cx: 120,
  cy: 80,
  diameter: 3,
  hardwareId: 'hw-screw-8-32',
  targetPartId: 'rect-1',
  depth: 32,
  through: false,
  layerId: 'default',
  meta: {},
};

describe('FastenerPanel', () => {
  it('stays hidden unless the tool is active or a fastener is selected', () => {
    expect(isFastenerPanelVisible('select', null)).toBe(false);
    expect(isFastenerPanelVisible('select', { id: 'rect-1', type: 'rect' })).toBe(false);
    expect(isFastenerPanelVisible('fastener', null)).toBe(true);
    expect(isFastenerPanelVisible('select', fastenerEntity)).toBe(true);

    expect(
      renderToStaticMarkup(
        <FastenerPanel
          activeTool="select"
          activeHardwareId="hw-screw-8-32"
          onActiveHardwareChange={vi.fn()}
          selectedEntity={null}
          selectedIds={[]}
          onEntityHardwareChange={vi.fn()}
          onEntityFieldCommit={vi.fn()}
        />,
      ),
    ).toBe('');
  });

  it('lists catalog hardware grouped by kind while the tool is active', () => {
    const markup = renderToStaticMarkup(
      <FastenerPanel
        activeTool="fastener"
        activeHardwareId="hw-screw-8-32"
        onActiveHardwareChange={vi.fn()}
        selectedEntity={null}
        selectedIds={[]}
        onEntityHardwareChange={vi.fn()}
        onEntityFieldCommit={vi.fn()}
      />,
    );

    expect(markup).toContain('Wood screws');
    expect(markup).toContain('Bolts');
    expect(markup).toContain('#8 x 32mm Wood Screw');
    expect(markup).toContain('pilot 3mm');
    expect(markup).toContain('Click the canvas to drill a pilot hole');
  });

  it('edits the hardware, hole type, and depth of a selected fastener', () => {
    const markup = renderToStaticMarkup(
      <FastenerPanel
        activeTool="select"
        activeHardwareId="hw-screw-8-32"
        onActiveHardwareChange={vi.fn()}
        selectedEntity={fastenerEntity}
        selectedIds={['feature-1']}
        onEntityHardwareChange={vi.fn()}
        onEntityFieldCommit={vi.fn()}
      />,
    );

    expect(markup).toContain('Blind hole');
    expect(markup).toContain('Depth (mm)');
    expect(markup).toContain('value="32"');
    expect(markup).toContain('head 8mm');
  });
});
