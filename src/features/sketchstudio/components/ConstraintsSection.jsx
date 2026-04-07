import { memo, useMemo, useState } from 'react';
import ParametricPanel from '../craftsman/components/ParametricPanel';
import {
  getSuggestedConstraintTypesForSelection,
  getSketchConstraintSummary,
  listConstraintEntityIds,
} from '../utils/sketchConstraintUtils';
import ConstraintForm, { buildConstraintForm, buildConstraintPayload } from './ConstraintForm';

function ConstraintsSection({
  document,
  selectedIds,
  selectedEntities,
  diagnostics,
  onVariablesChange,
  onConstraintAdd,
  onConstraintUpdate,
  onConstraintRemove,
}) {
  const suggestions = useMemo(() => getSuggestedConstraintTypesForSelection(selectedEntities), [selectedEntities]);
  const constraintEntries = useMemo(
    () =>
      (document.constraints || [])
        .map((constraint) => ({
          constraint,
          diagnostic: diagnostics.find((item) => item.constraintId === constraint.id) || null,
          relevant:
            !selectedIds.length ||
            listConstraintEntityIds(constraint).some((entityId) => selectedIds.includes(entityId)),
        }))
        .sort((left, right) => Number(right.relevant) - Number(left.relevant)),
    [diagnostics, document.constraints, selectedIds],
  );
  const initialType = suggestions[0] || 'equal_length';
  const [editingConstraintId, setEditingConstraintId] = useState(null);
  const [formState, setFormState] = useState(() =>
    buildConstraintForm(initialType, document.entities, selectedEntities),
  );

  // Reset form when selection or suggestions change (React "adjust state during render" pattern).
  const [prevFormDeps, setPrevFormDeps] = useState({ entities: document.entities, selectedEntities, suggestions });
  if (
    !editingConstraintId &&
    (prevFormDeps.entities !== document.entities ||
      prevFormDeps.selectedEntities !== selectedEntities ||
      prevFormDeps.suggestions !== suggestions)
  ) {
    setPrevFormDeps({ entities: document.entities, selectedEntities, suggestions });
    setFormState(buildConstraintForm(suggestions[0] || 'equal_length', document.entities, selectedEntities));
  }

  const handleSubmit = () => {
    const payload = buildConstraintPayload(formState);
    if (!payload) return;
    if (editingConstraintId) {
      onConstraintUpdate(editingConstraintId, payload);
      setEditingConstraintId(null);
    } else {
      onConstraintAdd(payload);
    }
    setFormState(buildConstraintForm(formState.type, document.entities, selectedEntities));
  };

  return (
    <section className="sketchStudioPanelSection">
      <p className="sketchStudioPanelEyebrow">Constraints</p>
      {suggestions.length > 0 && (
        <div className="sketchStudioActionRow">
          {suggestions.map((type) => (
            <button
              key={type}
              type="button"
              className="sketchStudioInlineButton"
              onClick={() => {
                setEditingConstraintId(null);
                setFormState(buildConstraintForm(type, document.entities, selectedEntities));
              }}
            >
              {type.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
      <ConstraintForm
        document={document}
        selectedEntities={selectedEntities}
        formState={formState}
        setFormState={setFormState}
        onSubmit={handleSubmit}
        onCancel={
          editingConstraintId
            ? () => {
                setEditingConstraintId(null);
                setFormState(
                  buildConstraintForm(suggestions[0] || 'equal_length', document.entities, selectedEntities),
                );
              }
            : null
        }
        submitLabel={editingConstraintId ? 'Save Constraint' : 'Add Constraint'}
      />
      <div className="sketchStudioConstraintList">
        {constraintEntries.length ? (
          constraintEntries.map(({ constraint, diagnostic, relevant }) => (
            <div key={constraint.id} className={`sketchStudioConstraintCard ${relevant ? 'is-active' : ''}`}>
              <div className="sketchStudioSubpanelHeader">
                <strong className="sketchStudioLibraryName">{constraint.label}</strong>
                <span className={`sketchStudioConstraintStatus is-${diagnostic?.status || 'applied'}`}>
                  {diagnostic?.statusLabel || 'Applied'}
                </span>
              </div>
              <p className="sketchStudioLibraryMeta">{constraint.type.replace(/_/g, ' ')}</p>
              <p className="sketchStudioConstraintSummary">{getSketchConstraintSummary(constraint)}</p>
              {diagnostic?.message && <p className="sketchStudioConstraintMessage">{diagnostic.message}</p>}
              <div className="sketchStudioActionRow">
                <button
                  type="button"
                  className="sketchStudioInlineButton"
                  onClick={() => {
                    setEditingConstraintId(constraint.id);
                    setFormState(buildConstraintForm(constraint.type, document.entities, selectedEntities, constraint));
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="sketchStudioInlineButton"
                  onClick={() => onConstraintUpdate(constraint.id, { enabled: !constraint.enabled })}
                >
                  {constraint.enabled === false ? 'Enable' : 'Disable'}
                </button>
                <button
                  type="button"
                  className="sketchStudioInlineButton"
                  onClick={() => onConstraintRemove(constraint.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="sketchStudioPlaceholderCard">
            <p className="sketchStudioPlaceholderText">No constraints</p>
            <p className="sketchStudioPlaceholderSubtext">Use the form above to tie selected geometry together.</p>
          </div>
        )}
      </div>
      <div className="sketchStudioSubpanelCard">
        <ParametricPanel
          variables={document.variables || []}
          entities={document.entities}
          constraints={document.constraints || []}
          onVariablesChange={onVariablesChange}
        />
      </div>
    </section>
  );
}

export default memo(ConstraintsSection);
