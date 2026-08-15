import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RightPanel from './RightPanel';

describe('RightPanel', () => {
  it('renders the drafting-side variable panel', () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        document={{
          name: 'Desk Draft',
          variables: [{ id: 'var-width', name: 'width', value: 1200, unit: 'mm' }],
          entities: [
            {
              id: 'rect-1',
              type: 'rect',
              x: 0,
              y: 0,
              width: 600,
              height: 300,
              rotation: 0,
              layerId: 'default',
              meta: {},
            },
            {
              id: 'rect-2',
              type: 'rect',
              x: 0,
              y: 400,
              width: 400,
              height: 300,
              rotation: 0,
              layerId: 'default',
              meta: {},
            },
          ],
        }}
        selectedEntity={null}
        selectedEntities={[]}
        selectedIds={[]}
        groupSelectionSummary={null}
        selectedMeasurements={[]}
        selectedProfileInfo={null}
        isBrokenLineSelection={false}
        onEntityFieldCommit={vi.fn()}
        onVariablesChange={vi.fn()}
        onRotateLeft={vi.fn()}
        onRotateRight={vi.fn()}
        onFlipHorizontal={vi.fn()}
        onFlipVertical={vi.fn()}
        onToggleBrokenLines={vi.fn()}
        onMaterialChange={vi.fn()}
        onThicknessChange={vi.fn()}
      />,
    );

    expect(markup).toContain('Parametric Variables');
    expect(markup).toContain('width');
  });

  it('renders bulk material assignment for multiple selected entities', () => {
    const entities = [
      {
        id: 'rect-1',
        type: 'rect',
        x: 0,
        y: 0,
        width: 600,
        height: 300,
        rotation: 0,
        materialId: 'plywood-birch-18',
        thickness: 18,
        layerId: 'default',
        meta: {},
      },
      {
        id: 'rect-2',
        type: 'rect',
        x: 0,
        y: 400,
        width: 400,
        height: 300,
        rotation: 0,
        materialId: 'mdf-primed-18',
        thickness: 12,
        layerId: 'default',
        meta: {},
      },
    ];
    const markup = renderToStaticMarkup(
      <RightPanel
        document={{
          name: 'Desk Draft',
          variables: [],
          entities,
        }}
        selectedEntity={null}
        selectedEntities={entities}
        selectedIds={['rect-1', 'rect-2']}
        groupSelectionSummary={{ count: 2, types: 'rect x2' }}
        selectedMeasurements={[]}
        selectedProfileInfo={null}
        isBrokenLineSelection={false}
        onEntityFieldCommit={vi.fn()}
        onVariablesChange={vi.fn()}
        onRotateLeft={vi.fn()}
        onRotateRight={vi.fn()}
        onFlipHorizontal={vi.fn()}
        onFlipVertical={vi.fn()}
        onToggleBrokenLines={vi.fn()}
        onMaterialChange={vi.fn()}
        onThicknessChange={vi.fn()}
      />,
    );

    expect(markup).toContain('Materials');
    expect(markup).toContain('Apply changes to all 2 selected entities.');
    expect(markup).toContain('Mixed materials');
  });
});
