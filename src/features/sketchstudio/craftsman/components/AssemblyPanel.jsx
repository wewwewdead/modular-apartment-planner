import { useMemo, useCallback } from 'react';
import { generateAssemblySteps, exportAssemblyToText } from '../utils/assemblyGenerator';
import { downloadAsFile } from '../../utils/bomExportUtils';
import styles from '../styles/craftsman.module.css';

const STEP_ICONS = {
  preparation: '\u2702', // scissors
  assembly: '\u2692',    // hammer and pick
  finishing: '\u2728',    // sparkles
};

export default function AssemblyPanel({ entities }) {
  const assembly = useMemo(() => generateAssemblySteps(entities), [entities]);

  const handleExport = useCallback(() => {
    const text = exportAssemblyToText(assembly);
    downloadAsFile(text, 'assembly-instructions.txt', 'text/plain');
  }, [assembly]);

  if (!assembly.steps.length) {
    return (
      <div className={styles.assemblyPanel}>
        <h3 className={styles.panelTitle}>Assembly Instructions</h3>
        <p className={styles.emptyMessage}>Assign materials to entities to generate assembly steps.</p>
      </div>
    );
  }

  return (
    <div className={styles.assemblyPanel}>
      <h3 className={styles.panelTitle}>Assembly Instructions</h3>
      <div className={styles.assemblyMeta}>
        {assembly.totalParts} parts · ~{assembly.estimatedTime}
      </div>

      <div className={styles.assemblySteps}>
        {assembly.steps.map((step) => (
          <div key={step.number} className={styles.assemblyStep}>
            <div className={styles.stepHeader}>
              <span className={styles.stepNumber}>{step.number}</span>
              <span className={styles.stepIcon}>{STEP_ICONS[step.type] || '\u2022'}</span>
              <span className={styles.stepTitle}>{step.title}</span>
            </div>
            <p className={styles.stepDescription}>{step.description}</p>
          </div>
        ))}
      </div>

      <button type="button" className={styles.exportBtn} onClick={handleExport}>
        Export Instructions
      </button>
    </div>
  );
}
