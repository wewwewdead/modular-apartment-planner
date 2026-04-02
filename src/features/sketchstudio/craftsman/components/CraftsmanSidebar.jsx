import { useState } from 'react';
import MaterialPicker from './MaterialPicker';
import BomPanel from './BomPanel';
import NestingPanel from './NestingPanel';
import JointPanel from './JointPanel';
import ParametricPanel from './ParametricPanel';
import AssemblyPanel from './AssemblyPanel';
import useSketchBOM from '../hooks/useSketchBOM';
import styles from '../styles/craftsman.module.css';

function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.collapsibleSection}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={styles.collapsibleArrow}>{open ? '\u25BC' : '\u25B6'}</span>
        {title}
      </button>
      {open && <div className={styles.collapsibleBody}>{children}</div>}
    </div>
  );
}

export default function CraftsmanSidebar({
  entities,
  selectedEntity,
  selectedIds,
  variables,
  onMaterialChange,
  onThicknessChange,
  onVariablesChange,
  onLoadTemplate,
  onDuplicateEntities,
}) {
  const { bomRows, totalCost, costByMaterial } = useSketchBOM(entities);
  const hasEntities = entities.length > 0;

  return (
    <div className={styles.craftsmanSidebar}>
      <h2 className={styles.sidebarTitle}>Craftsman Studio</h2>

      {selectedEntity && (
        <CollapsibleSection title="Material Assignment">
          <MaterialPicker
            selectedMaterialId={selectedEntity.materialId ?? null}
            thickness={selectedEntity.thickness ?? null}
            onMaterialChange={(materialId) => onMaterialChange(selectedIds, materialId)}
            onThicknessChange={(thickness) => onThicknessChange(selectedIds, thickness)}
          />
        </CollapsibleSection>
      )}

      {!selectedEntity && selectedIds.length > 1 && (
        <CollapsibleSection title="Bulk Material Assignment">
          <p className={styles.hint}>{selectedIds.length} entities selected</p>
          <MaterialPicker
            selectedMaterialId={null}
            thickness={null}
            onMaterialChange={(materialId) => onMaterialChange(selectedIds, materialId)}
            onThicknessChange={(thickness) => onThicknessChange(selectedIds, thickness)}
          />
        </CollapsibleSection>
      )}

      {!hasEntities && onLoadTemplate && (
        <CollapsibleSection title="Quick Start" defaultOpen={true}>
          <p className={styles.hint}>Start with a template or draw your own.</p>
          <button type="button" className={styles.templateBtn} onClick={onLoadTemplate}>
            Browse Templates
          </button>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Bill of Materials" defaultOpen={hasEntities}>
        <BomPanel bomRows={bomRows} totalCost={totalCost} costByMaterial={costByMaterial} onRemoveRow={onMaterialChange} onDuplicateRow={onDuplicateEntities} />
      </CollapsibleSection>

      <CollapsibleSection title="Cut-List Optimizer" defaultOpen={false}>
        <NestingPanel bomRows={bomRows} />
      </CollapsibleSection>

      <CollapsibleSection title="Joint Library" defaultOpen={false}>
        <JointPanel selectedEntity={selectedEntity} entities={entities} />
      </CollapsibleSection>

      <CollapsibleSection title="Parametric Variables" defaultOpen={false}>
        <ParametricPanel variables={variables || []} entities={entities} onVariablesChange={onVariablesChange} />
      </CollapsibleSection>

      <CollapsibleSection title="Assembly Instructions" defaultOpen={false}>
        <AssemblyPanel entities={entities} />
      </CollapsibleSection>
    </div>
  );
}
