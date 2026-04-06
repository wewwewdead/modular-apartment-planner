import { useState } from 'react';
import MaterialPicker from './MaterialPicker';
import BomPanel from './BomPanel';
import NestingPanel from './NestingPanel';
import JointPanel from './JointPanel';
import ParametricPanel from './ParametricPanel';
import AssemblyPanel from './AssemblyPanel';
import { getMaterialSelectionState } from '../utils/materialSelectionUtils';
import styles from '../styles/craftsman.module.css';

function CollapsibleSection({ title, defaultOpen = true, forceOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;

  return (
    <div className={styles.collapsibleSection}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className={styles.collapsibleArrow}>{isOpen ? '\u25BC' : '\u25B6'}</span>
        {title}
      </button>
      {isOpen && <div className={styles.collapsibleBody}>{children}</div>}
    </div>
  );
}

function LabelAnnotationSection({ entity, onEntityFieldCommit, styles: cssStyles }) {
  if (!entity || entity.type !== 'text' || !onEntityFieldCommit) {
    return null;
  }

  return (
    <CollapsibleSection title="Label Annotation">
      <div className={cssStyles.materialPicker}>
        <label className={cssStyles.fieldLabel}>Text</label>
        <input
          type="text"
          className={cssStyles.thicknessInput}
          defaultValue={entity.text}
          onBlur={(event) => onEntityFieldCommit('text', event.target.value)}
        />

        <label className={cssStyles.fieldLabel}>Arrow</label>
        <select
          className={cssStyles.materialSelect}
          defaultValue={entity.leader?.target ? 'on' : 'off'}
          onChange={(event) => onEntityFieldCommit('leaderEnabled', event.target.value === 'on' ? 'true' : 'false')}
        >
          <option value="off">None</option>
          <option value="on">Leader arrow</option>
        </select>

        {entity.leader?.target && (
          <>
            <label className={cssStyles.fieldLabel}>Arrow Target X</label>
            <input
              type="number"
              step="0.1"
              className={cssStyles.thicknessInput}
              defaultValue={entity.leader.target.x}
              onBlur={(event) => onEntityFieldCommit('leaderTargetX', event.target.value)}
            />

            <label className={cssStyles.fieldLabel}>Arrow Target Y</label>
            <input
              type="number"
              step="0.1"
              className={cssStyles.thicknessInput}
              defaultValue={entity.leader.target.y}
              onBlur={(event) => onEntityFieldCommit('leaderTargetY', event.target.value)}
            />
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}

export default function CraftsmanSidebar({
  entities,
  selectedEntity,
  selectedEntities,
  selectedIds,
  variables,
  constraints,
  joints,
  jointDiagnostics,
  focusedJointId,
  editingJointId,
  onClearFocusedJoint,
  onEditJoint,
  onClearEditingJoint,
  bomRows = [],
  totalCost = 0,
  costByMaterial = {},
  onMaterialChange,
  onThicknessChange,
  onVariablesChange,
  onJointAdd,
  onJointUpdate,
  onJointRemove,
  onLoadTemplate,
  onDuplicateEntities,
  onEntityFieldCommit,
}) {
  const hasEntities = entities.length > 0;
  const materialSelection = getMaterialSelectionState(entities, selectedIds);

  return (
    <div className={styles.craftsmanSidebar}>
      <h2 className={styles.sidebarTitle}>Craftsman Studio</h2>

      {selectedIds.length > 0 && (
        <CollapsibleSection title={selectedIds.length > 1 ? 'Bulk Material Assignment' : 'Material Assignment'}>
          <MaterialPicker
            selectedMaterialId={materialSelection.selectedMaterialId}
            thickness={materialSelection.thickness}
            selectionCount={materialSelection.selectionCount}
            isMixedMaterial={materialSelection.isMixedMaterial}
            isMixedThickness={materialSelection.isMixedThickness}
            onMaterialChange={(materialId) => onMaterialChange(selectedIds, materialId)}
            onThicknessChange={(thickness) => onThicknessChange(selectedIds, thickness)}
          />
        </CollapsibleSection>
      )}

      <LabelAnnotationSection entity={selectedEntity} onEntityFieldCommit={onEntityFieldCommit} styles={styles} />

      {!hasEntities && onLoadTemplate && (
        <CollapsibleSection title="Quick Start" defaultOpen={true}>
          <p className={styles.hint}>Start with a template or draw your own.</p>
          <button type="button" className={styles.templateBtn} onClick={onLoadTemplate}>
            Browse Templates
          </button>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Bill of Materials" defaultOpen={hasEntities}>
        <BomPanel
          bomRows={bomRows}
          totalCost={totalCost}
          costByMaterial={costByMaterial}
          onRemoveRow={onMaterialChange}
          onDuplicateRow={onDuplicateEntities}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Cut-List Optimizer" defaultOpen={false}>
        <NestingPanel bomRows={bomRows} />
      </CollapsibleSection>

      <CollapsibleSection title="Joint Library" defaultOpen={false} forceOpen={!!focusedJointId}>
        <JointPanel
          entities={entities}
          selectedEntity={selectedEntity}
          selectedEntities={selectedEntities}
          selectedIds={selectedIds}
          joints={joints || []}
          diagnostics={jointDiagnostics || []}
          focusedJointId={focusedJointId}
          editingJointId={editingJointId}
          onClearFocusedJoint={onClearFocusedJoint}
          onEditJoint={onEditJoint}
          onClearEditingJoint={onClearEditingJoint}
          onJointAdd={onJointAdd}
          onJointUpdate={onJointUpdate}
          onJointRemove={onJointRemove}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Parametric Variables" defaultOpen={false}>
        <ParametricPanel
          variables={variables || []}
          entities={entities}
          constraints={constraints || []}
          onVariablesChange={onVariablesChange}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Assembly Instructions" defaultOpen={false}>
        <AssemblyPanel entities={entities} />
      </CollapsibleSection>
    </div>
  );
}
