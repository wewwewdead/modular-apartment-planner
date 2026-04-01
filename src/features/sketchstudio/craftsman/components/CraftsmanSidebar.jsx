import MaterialPicker from './MaterialPicker';
import BomPanel from './BomPanel';
import NestingPanel from './NestingPanel';
import JointPanel from './JointPanel';
import ParametricPanel from './ParametricPanel';
import AssemblyPanel from './AssemblyPanel';
import useSketchBOM from '../hooks/useSketchBOM';
import styles from '../styles/craftsman.module.css';

export default function CraftsmanSidebar({
  entities,
  selectedEntity,
  selectedIds,
  variables,
  onMaterialChange,
  onThicknessChange,
  onVariablesChange,
}) {
  const { bomRows, totalCost, costByMaterial } = useSketchBOM(entities);

  return (
    <div className={styles.craftsmanSidebar}>
      <h2 className={styles.sidebarTitle}>Craftsman Studio</h2>

      {selectedEntity && (
        <div className={styles.section}>
          <h3 className={styles.panelTitle}>Material Assignment</h3>
          <MaterialPicker
            selectedMaterialId={selectedEntity.materialId ?? null}
            thickness={selectedEntity.thickness ?? null}
            onMaterialChange={(materialId) => onMaterialChange(selectedIds, materialId)}
            onThicknessChange={(thickness) => onThicknessChange(selectedIds, thickness)}
          />
        </div>
      )}

      {!selectedEntity && selectedIds.length > 1 && (
        <div className={styles.section}>
          <h3 className={styles.panelTitle}>Bulk Material Assignment</h3>
          <p className={styles.hint}>{selectedIds.length} entities selected</p>
          <MaterialPicker
            selectedMaterialId={null}
            thickness={null}
            onMaterialChange={(materialId) => onMaterialChange(selectedIds, materialId)}
            onThicknessChange={(thickness) => onThicknessChange(selectedIds, thickness)}
          />
        </div>
      )}

      <BomPanel
        bomRows={bomRows}
        totalCost={totalCost}
        costByMaterial={costByMaterial}
      />

      <NestingPanel bomRows={bomRows} />

      <JointPanel selectedEntity={selectedEntity} entities={entities} />

      <ParametricPanel
        variables={variables || []}
        entities={entities}
        onVariablesChange={onVariablesChange}
      />

      <AssemblyPanel entities={entities} />
    </div>
  );
}
