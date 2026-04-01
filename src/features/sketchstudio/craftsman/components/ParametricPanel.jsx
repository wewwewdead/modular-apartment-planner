import { useCallback, useState } from 'react';
import { createVariable, findVariableReferences } from '../utils/parametricEngine';
import styles from '../styles/craftsman.module.css';

export default function ParametricPanel({ variables, entities, onVariablesChange }) {
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = useCallback(() => {
    const name = newName.trim();
    const value = Number(newValue);
    if (!name || !Number.isFinite(value)) return;
    if (variables.some((v) => v.name === name)) return; // duplicate name

    onVariablesChange([...variables, createVariable(name, value)]);
    setNewName('');
    setNewValue('');
  }, [newName, newValue, variables, onVariablesChange]);

  const handleUpdate = useCallback((varId, newVal) => {
    const parsed = Number(newVal);
    if (!Number.isFinite(parsed)) return;
    onVariablesChange(variables.map((v) => v.id === varId ? { ...v, value: parsed } : v));
  }, [variables, onVariablesChange]);

  const handleDelete = useCallback((varId) => {
    onVariablesChange(variables.filter((v) => v.id !== varId));
  }, [variables, onVariablesChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleAdd();
  }, [handleAdd]);

  return (
    <div className={styles.parametricPanel}>
      <h3 className={styles.panelTitle}>Parametric Variables</h3>

      {variables.length > 0 && (
        <div className={styles.varList}>
          {variables.map((v) => {
            const refs = findVariableReferences(entities, v.name);
            return (
              <div key={v.id} className={styles.varRow}>
                <span className={styles.varName}>{v.name}</span>
                <input
                  type="number"
                  className={styles.varInput}
                  value={v.value}
                  onChange={(e) => handleUpdate(v.id, e.target.value)}
                />
                <span className={styles.varUnit}>mm</span>
                {refs.length > 0 && (
                  <span className={styles.varRefs} title={`Used by ${refs.length} entity field(s)`}>
                    {refs.length}x
                  </span>
                )}
                <button type="button" className={styles.varDelete} onClick={() => handleDelete(v.id)} title="Delete variable">x</button>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.varAddRow}>
        <input
          type="text"
          className={styles.varNameInput}
          placeholder="name"
          value={newName}
          onChange={(e) => setNewName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          onKeyDown={handleKeyDown}
        />
        <input
          type="number"
          className={styles.varInput}
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className={styles.exportBtn} onClick={handleAdd}>Add</button>
      </div>

      <p className={styles.emptyMessage}>
        Use =variableName in entity dimensions (e.g., =width, =width/2+10)
      </p>
    </div>
  );
}
