import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RightPanel from './RightPanel';

describe('RightPanel', () => {
  it('renders constraint statuses and the drafting-side variable panel', () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        document={{
          name: 'Desk Draft',
          variables: [{ id: 'var-width', name: 'width', value: 1200, unit: 'mm' }],
          constraints: [
            {
              id: 'constraint-1',
              type: 'equal_width',
              label: 'Shelf Width Match',
              enabled: true,
              driverEntityId: 'rect-1',
              drivenEntityId: 'rect-2',
            },
          ],
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
        constraintDiagnostics={[
          {
            constraintId: 'constraint-1',
            status: 'applied',
            statusLabel: 'Applied',
            message: null,
          },
        ]}
        onEntityFieldCommit={vi.fn()}
        onVariablesChange={vi.fn()}
        onConstraintAdd={vi.fn()}
        onConstraintUpdate={vi.fn()}
        onConstraintRemove={vi.fn()}
        onRotateLeft={vi.fn()}
        onRotateRight={vi.fn()}
        onFlipHorizontal={vi.fn()}
        onFlipVertical={vi.fn()}
        onToggleBrokenLines={vi.fn()}
      />,
    );

    expect(markup).toContain('Shelf Width Match');
    expect(markup).toContain('Applied');
    expect(markup).toContain('Parametric Variables');
    expect(markup).toContain('width');
  });
});
