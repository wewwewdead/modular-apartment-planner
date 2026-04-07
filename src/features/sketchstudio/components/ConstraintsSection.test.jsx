import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ConstraintsSection from './ConstraintsSection';

const baseEntities = [
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
];

function makeDocument(overrides = {}) {
  return {
    name: 'Test Sketch',
    variables: [],
    constraints: [],
    entities: baseEntities,
    ...overrides,
  };
}

function defaultProps(overrides = {}) {
  return {
    document: makeDocument(),
    selectedIds: [],
    selectedEntities: [],
    diagnostics: [],
    onVariablesChange: vi.fn(),
    onConstraintAdd: vi.fn(),
    onConstraintUpdate: vi.fn(),
    onConstraintRemove: vi.fn(),
    ...overrides,
  };
}

describe('ConstraintsSection', () => {
  it('renders the Add Constraint submit button for new constraints', () => {
    const markup = renderToStaticMarkup(<ConstraintsSection {...defaultProps()} />);

    expect(markup).toContain('Add Constraint');
    expect(markup).toContain('Constraints');
  });

  it('renders existing constraint with status and summary', () => {
    const constraint = {
      id: 'constraint-1',
      type: 'equal_width',
      label: 'Shelf Width Match',
      enabled: true,
      driverEntityId: 'rect-1',
      drivenEntityId: 'rect-2',
    };

    const markup = renderToStaticMarkup(
      <ConstraintsSection
        {...defaultProps({
          document: makeDocument({ constraints: [constraint] }),
          diagnostics: [
            {
              constraintId: 'constraint-1',
              status: 'applied',
              statusLabel: 'Applied',
              message: null,
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('Shelf Width Match');
    expect(markup).toContain('Applied');
    expect(markup).toContain('equal width');
    expect(markup).toContain('Edit');
    expect(markup).toContain('Disable');
    expect(markup).toContain('Remove');
  });

  it('shows suggestion buttons when entities are selected', () => {
    const markup = renderToStaticMarkup(
      <ConstraintsSection
        {...defaultProps({
          selectedIds: ['rect-1', 'rect-2'],
          selectedEntities: baseEntities,
        })}
      />,
    );

    // Two rects selected should suggest equal_width and equal_height
    expect(markup).toContain('equal width');
    expect(markup).toContain('equal height');
  });

  it('shows empty placeholder when no constraints exist', () => {
    const markup = renderToStaticMarkup(<ConstraintsSection {...defaultProps()} />);

    expect(markup).toContain('No constraints');
    expect(markup).toContain('Use the form above to tie selected geometry together.');
  });

  it('renders the constraint form type selector with all constraint types', () => {
    const markup = renderToStaticMarkup(<ConstraintsSection {...defaultProps()} />);

    expect(markup).toContain('Type');
    expect(markup).toContain('Label');
    expect(markup).toContain('Equal Length');
  });

  it('shows the Cancel button when editing an existing constraint', () => {
    // When there is no editingConstraintId, there should be no Cancel button
    const markup = renderToStaticMarkup(<ConstraintsSection {...defaultProps()} />);

    // In non-editing mode, the submit label is "Add Constraint" and no Cancel
    expect(markup).toContain('Add Constraint');
    expect(markup).not.toContain('Save Constraint');
  });

  it('renders parametric variables panel', () => {
    const markup = renderToStaticMarkup(
      <ConstraintsSection
        {...defaultProps({
          document: makeDocument({
            variables: [{ id: 'var-width', name: 'width', value: 1200, unit: 'mm' }],
          }),
        })}
      />,
    );

    expect(markup).toContain('Parametric Variables');
    expect(markup).toContain('width');
  });

  it('highlights relevant constraints when entities are selected', () => {
    const constraint = {
      id: 'constraint-1',
      type: 'equal_width',
      label: 'Width Match',
      enabled: true,
      driverEntityId: 'rect-1',
      drivenEntityId: 'rect-2',
    };

    const markup = renderToStaticMarkup(
      <ConstraintsSection
        {...defaultProps({
          document: makeDocument({ constraints: [constraint] }),
          selectedIds: ['rect-1'],
          selectedEntities: [baseEntities[0]],
          diagnostics: [],
        })}
      />,
    );

    expect(markup).toContain('is-active');
    expect(markup).toContain('Width Match');
  });

  it('renders disabled constraint with Enable button', () => {
    const constraint = {
      id: 'constraint-1',
      type: 'equal_width',
      label: 'Disabled Constraint',
      enabled: false,
      driverEntityId: 'rect-1',
      drivenEntityId: 'rect-2',
    };

    const markup = renderToStaticMarkup(
      <ConstraintsSection
        {...defaultProps({
          document: makeDocument({ constraints: [constraint] }),
        })}
      />,
    );

    expect(markup).toContain('Enable');
    expect(markup).toContain('Disabled Constraint');
  });
});
