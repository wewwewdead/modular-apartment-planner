/* @vitest-environment jsdom */
/**
 * The selection panel's numeric rows are the only way to type an exact size into
 * a sketch. These drive the real chain — RightPanel -> renderEditableFields ->
 * updateEntityFromNumericField -> sketchStudioReducer — because every failure
 * mode here lives in the wiring, not in any one of those pieces:
 *
 *  - typing a width and pressing Enter used to do nothing at all (blur was the
 *    only commit), which is what "the side panel doesn't work" meant;
 *  - clearing a field and tabbing away used to write 0, because a number input
 *    reports invalid text as '' and Number('') is a perfectly finite 0;
 *  - Escape had no meaning, so a half-typed number could not be abandoned.
 */

import { useEffect, useReducer, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import RightPanel from './RightPanel';
import sketchStudioReducer from '../store/sketchStudioReducer';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import { setDocumentEntities } from '../store/sketchStudioActions';
import { updateEntityFromNumericField, updateEntityInList } from '../utils/entityUtils';
import { resolveSketchDocument } from '../utils/sketchDocumentResolver';
import useSketchStudio from '../hooks/useSketchStudio';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';

afterEach(cleanup);

const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

// The DOM value has to go through the native setter or React's value tracker
// swallows the event. The keydown and the inputType are how the field tells
// typing apart from the spinner, so a test without them is testing the spinner.
function type(input, text) {
  const deleting = text.length < input.value.length;
  act(() =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: deleting ? 'Backspace' : text.slice(-1), bubbles: true })),
  );
  nativeSetter.call(input, text);
  act(() =>
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: deleting ? 'deleteContentBackward' : 'insertText' }),
    ),
  );
}

// What the arrow buttons and the wheel do: step the value, then a plain input
// event with no inputType, because no text was edited.
function spinUp(input) {
  act(() => input.stepUp());
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

function rectEntity(overrides = {}) {
  return {
    id: 'rect-1',
    type: 'rect',
    x: 0,
    y: 0,
    width: 600,
    height: 300,
    rotation: 0,
    layerId: 'default',
    locked: false,
    visible: true,
    meta: {},
    ...overrides,
  };
}

function featureEntity(overrides = {}) {
  return {
    id: 'feature-1',
    type: 'feature',
    featureType: 'cutout',
    shape: 'rect',
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    layerId: 'default',
    locked: false,
    visible: true,
    meta: {},
    ...overrides,
  };
}

/**
 * Mirrors useSketchStudio.updateSelectedEntityField exactly (same action, same
 * entity updater) so the reducer, the resolver and the field editors are all the
 * real thing; only the surrounding hook composition is stubbed.
 */
function Harness({ entity, onDocument, variables = [] }) {
  const [state, dispatch] = useReducer(sketchStudioReducer, null, () => {
    const resolved = resolveSketchDocument({
      ...sketchStudioInitialState.document,
      variables,
      entities: [entity],
    });

    return {
      ...sketchStudioInitialState,
      document: { ...resolved.document, groupIndex: new Map() },
      selection: { ...sketchStudioInitialState.selection, selectedIds: [entity.id] },
    };
  });

  useEffect(() => {
    onDocument(state.document);
  }, [onDocument, state.document]);

  const selectedEntity = state.document.entities.find((candidate) => candidate.id === entity.id) ?? null;

  const handleEntityFieldCommit = (field, rawValue) =>
    dispatch(
      setDocumentEntities(
        updateEntityInList(state.document.entities, entity.id, (candidate) =>
          updateEntityFromNumericField(candidate, field, rawValue),
        ),
      ),
    );

  return (
    <RightPanel
      document={state.document}
      selectedEntity={selectedEntity}
      selectedIds={[entity.id]}
      groupSelectionSummary={null}
      selectedMeasurements={[]}
      selectedProfileInfo={null}
      isBrokenLineSelection={false}
      canGroupSelection={false}
      canUngroupSelection={false}
      onEntityFieldCommit={handleEntityFieldCommit}
      onVariablesChange={vi.fn()}
      onRotateLeft={vi.fn()}
      onRotateRight={vi.fn()}
      onFlipHorizontal={vi.fn()}
      onFlipVertical={vi.fn()}
      onToggleBrokenLines={vi.fn()}
      onGroupSelection={vi.fn()}
      onUngroupSelection={vi.fn()}
      onMaterialChange={vi.fn()}
      onThicknessChange={vi.fn()}
      onGrainAngleChange={vi.fn()}
      activeTool="select"
      activeHardwareId={null}
      onActiveHardwareChange={vi.fn()}
      onEntityHardwareChange={vi.fn()}
    />
  );
}

function mountPanel(entity, options = {}) {
  const capture = { document: null };
  const view = render(
    <Harness
      entity={entity}
      onDocument={(nextDocument) => {
        capture.document = nextDocument;
      }}
      {...options}
    />,
  );

  return {
    entity: () => capture.document.entities.find((candidate) => candidate.id === entity.id),
    field: (name) => {
      const rows = [...view.container.querySelectorAll('.sketchStudioEditableRow')];
      const row = rows.find((candidate) => candidate.querySelector('.sketchStudioPropertyKey')?.textContent === name);
      const input = row?.querySelector('input');
      if (!input) throw new Error(`No editable field row for "${name}"`);
      return input;
    },
  };
}

describe('selection panel numeric fields', () => {
  it('commits a typed width when Enter is pressed', () => {
    const panel = mountPanel(rectEntity());
    const width = panel.field('width');

    type(width, '900');
    fireEvent.keyDown(width, { key: 'Enter' });

    expect(panel.entity().width).toBe(900);
  });

  it('shows the committed value after Enter instead of the stale draft', () => {
    const panel = mountPanel(rectEntity());
    const width = panel.field('width');

    type(width, '-900');
    fireEvent.keyDown(width, { key: 'Enter' });

    expect(panel.entity().width).toBe(900);
    expect(panel.field('width').value).toBe('900');
  });

  it('commits a typed height when the field is blurred', () => {
    const panel = mountPanel(rectEntity());
    const height = panel.field('height');

    type(height, '450');
    fireEvent.blur(height);

    expect(panel.entity().height).toBe(450);
  });

  it('does not commit anything while the value is still being typed', () => {
    const panel = mountPanel(rectEntity());
    const width = panel.field('width');

    type(width, '9');
    type(width, '90');

    expect(panel.entity().width).toBe(600);
    expect(panel.field('width').value).toBe('90');
  });

  it('keeps the current height when the field is cleared and blurred', () => {
    const panel = mountPanel(rectEntity());
    const height = panel.field('height');

    type(height, '');
    fireEvent.blur(height);

    expect(panel.entity().height).toBe(300);
    expect(panel.field('height').value).toBe('300');
  });

  it('keeps the current width when the field is cleared and Enter is pressed', () => {
    const panel = mountPanel(rectEntity());
    const width = panel.field('width');

    type(width, '');
    fireEvent.keyDown(width, { key: 'Enter' });

    expect(panel.entity().width).toBe(600);
    expect(panel.field('width').value).toBe('600');
  });

  it('abandons the draft on Escape without committing it', () => {
    const panel = mountPanel(rectEntity());
    const width = panel.field('width');

    type(width, '900');
    fireEvent.keyDown(width, { key: 'Escape' });

    expect(panel.entity().width).toBe(600);
    expect(panel.field('width').value).toBe('600');

    fireEvent.blur(panel.field('width'));
    expect(panel.entity().width).toBe(600);
  });

  it('commits immediately when the value is stepped rather than typed', () => {
    const panel = mountPanel(rectEntity());

    spinUp(panel.field('width'));

    expect(panel.entity().width).toBeCloseTo(600.1, 5);
  });

  it('edits width and height on feature entities too', () => {
    const panel = mountPanel(featureEntity());

    type(panel.field('width'), '250');
    fireEvent.keyDown(panel.field('width'), { key: 'Enter' });
    type(panel.field('height'), '175');
    fireEvent.blur(panel.field('height'));

    expect(panel.entity().width).toBe(250);
    expect(panel.entity().height).toBe(175);
  });

  it('edits the other numeric rows through the same interaction', () => {
    const panel = mountPanel(rectEntity());

    type(panel.field('x'), '-40');
    fireEvent.keyDown(panel.field('x'), { key: 'Enter' });
    type(panel.field('rotation'), '15');
    fireEvent.keyDown(panel.field('rotation'), { key: 'Enter' });

    expect(panel.entity().x).toBe(-40);
    expect(panel.entity().rotation).toBe(15);
  });

  it('keeps the edited row focused so a second edit does not need a re-click', () => {
    const panel = mountPanel(rectEntity());
    const width = panel.field('width');

    width.focus();
    type(width, '900');
    fireEvent.keyDown(width, { key: 'Enter' });

    expect(document.activeElement).toBe(panel.field('width'));
  });
});

describe('selection panel fields bound to a parametric variable', () => {
  const boundRect = () =>
    rectEntity({
      parametricExpressions: { width: '=shelfWidth' },
    });
  const variables = [{ id: 'var-1', name: 'shelfWidth', value: 800, unit: 'mm' }];

  it('shows the resolved value read-only and leaves the free fields editable', () => {
    const panel = mountPanel(boundRect(), { variables });

    expect(panel.field('width').readOnly).toBe(true);
    expect(panel.field('width').value).toBe('800');
    expect(panel.field('height').readOnly).toBe(false);
  });

  it('ignores typed edits to a bound field instead of silently reverting them', () => {
    const panel = mountPanel(boundRect(), { variables });
    const width = panel.field('width');

    type(width, '900');
    fireEvent.keyDown(width, { key: 'Enter' });

    expect(panel.entity().width).toBe(800);
    expect(panel.field('width').value).toBe('800');
  });
});

/**
 * The same edit driven by the real hook rather than a stand-in reducer, so the
 * wiring the panel actually ships with — useSketchStudio's own
 * updateSelectedEntityField and the selection it reads — is covered too.
 */
function LiveStudio({ entity, onSelected }) {
  const studio = useSketchStudio();
  const stage = useRef('load');

  useEffect(() => {
    if (stage.current === 'load') {
      stage.current = 'select';
      studio.loadTemplate({ document: { ...sampleDocument, entities: [entity] } });
      return;
    }

    if (stage.current === 'select' && studio.document.entities.some((candidate) => candidate.id === entity.id)) {
      stage.current = 'ready';
      // The only selection route the hook exposes without pointer geometry.
      studio.duplicateEntities([entity.id]);
    }
  });

  useEffect(() => {
    onSelected(studio.selectedEntity);
  }, [onSelected, studio.selectedEntity]);

  return (
    <RightPanel
      document={studio.document}
      selectedEntity={studio.selectedEntity}
      selectedIds={studio.selection.selectedIds}
      groupSelectionSummary={studio.groupSelectionSummary}
      selectedMeasurements={studio.selectedMeasurements}
      selectedProfileInfo={studio.selectedProfileInfo}
      isBrokenLineSelection={studio.isBrokenLineSelection}
      canGroupSelection={false}
      canUngroupSelection={false}
      onEntityFieldCommit={studio.updateSelectedEntityField}
      onVariablesChange={studio.setVariables}
      onRotateLeft={studio.rotateSelectionLeft}
      onRotateRight={studio.rotateSelectionRight}
      onFlipHorizontal={studio.flipSelectionHorizontal}
      onFlipVertical={studio.flipSelectionVertical}
      onToggleBrokenLines={studio.toggleBrokenLines}
      onGroupSelection={studio.groupSelection}
      onUngroupSelection={studio.degroupSelection}
      onMaterialChange={studio.setEntityMaterial}
      onThicknessChange={studio.setEntityThickness}
      onGrainAngleChange={studio.setEntityGrainAngle}
      activeTool={studio.activeTool}
      activeHardwareId={studio.ui.activeHardwareId}
      onActiveHardwareChange={studio.setActiveHardware}
      onEntityHardwareChange={studio.setEntityHardware}
    />
  );
}

describe('the shipped panel wiring', () => {
  it('writes a typed width through useSketchStudio into the selected entity', () => {
    const selected = { entity: null };
    const view = render(
      <ConfirmDialogProvider>
        <LiveStudio
          entity={rectEntity()}
          onSelected={(entity) => {
            selected.entity = entity;
          }}
        />
      </ConfirmDialogProvider>,
    );

    const findField = (name) =>
      [...view.container.querySelectorAll('.sketchStudioEditableRow')]
        .find((row) => row.querySelector('.sketchStudioPropertyKey')?.textContent === name)
        ?.querySelector('input');

    expect(selected.entity).not.toBeNull();
    expect(selected.entity.width).toBe(600);

    const width = findField('width');
    type(width, '1234');
    fireEvent.keyDown(width, { key: 'Enter' });

    expect(selected.entity.width).toBe(1234);
    expect(findField('width').value).toBe('1234');
  });
});
