import { useState } from 'react';
import styles from '../styles/craftsman.module.css';
import { getAllMaterials, getMaterialById, getMergedMaterialCategories } from '../data/materials';
import useCustomMaterials from '../hooks/useCustomMaterials';
import CustomMaterialForm from './CustomMaterialForm';
import {
  createBlankMaterialForm,
  createDuplicateMaterialForm,
  createEditMaterialForm,
  formStateToDraft,
  formatMaterialPrice,
  groupMaterialsByCategory,
} from './customMaterialFormHelpers';

/**
 * Custom material editor. Built-in catalog materials stay read-only — they can
 * only be copied via "Duplicate as custom" — while custom materials support
 * edit and delete. Everything is persisted to localStorage by the registry, and
 * the merged catalog updates synchronously so BOM cost follows immediately.
 */
export default function MaterialEditorPanel() {
  const { customMaterials, add, update, remove } = useCustomMaterials();
  const [formState, setFormState] = useState(null);
  const [errors, setErrors] = useState({});
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState('');

  const categories = getMergedMaterialCategories();
  const duplicateGroups = groupMaterialsByCategory(getAllMaterials(), categories);

  const closeForm = () => {
    setFormState(null);
    setErrors({});
  };

  const openBlankForm = () => {
    setFormState(createBlankMaterialForm());
    setErrors({});
  };

  const openEditForm = (material) => {
    setPendingDeleteId(null);
    setFormState(createEditMaterialForm(material));
    setErrors({});
  };

  const openDuplicateForm = () => {
    const source = getMaterialById(duplicateSourceId);
    if (!source) {
      return;
    }

    setPendingDeleteId(null);
    setFormState(createDuplicateMaterialForm(source));
    setErrors({});
  };

  const submitForm = () => {
    const draft = formStateToDraft(formState);
    const outcome = formState.id ? update(formState.id, draft) : add(draft);

    if (!outcome.valid) {
      setErrors(outcome.errors);
      return;
    }

    closeForm();
  };

  const confirmDelete = (id) => {
    remove(id);
    setPendingDeleteId(null);
    if (formState?.id === id) {
      closeForm();
    }
  };

  return (
    <div className={styles.materialEditor}>
      <p className={styles.hint}>
        Add your own materials with real local prices. Catalog materials are read-only — duplicate one to reprice it.
      </p>

      {customMaterials.length === 0 ? (
        <p className={styles.emptyMessage}>No custom materials yet.</p>
      ) : (
        <ul className={styles.materialEditorList}>
          {customMaterials.map((material) => (
            <li key={material.id} className={styles.materialEditorRow}>
              <span className={styles.materialSwatch} style={{ backgroundColor: material.color }} />
              <span className={styles.materialEditorInfo}>
                <span className={styles.materialEditorName}>
                  {material.name}
                  <span className={styles.customMaterialBadge}>Custom</span>
                </span>
                <span className={styles.materialEditorMeta}>
                  {material.category} · {material.thickness}mm · {formatMaterialPrice(material)}
                </span>
              </span>
              <span className={styles.materialEditorActions}>
                {pendingDeleteId === material.id ? (
                  <>
                    <button
                      type="button"
                      className={styles.materialEditorDangerBtn}
                      onClick={() => confirmDelete(material.id)}
                    >
                      Confirm
                    </button>
                    <button type="button" className={styles.exportBtn} onClick={() => setPendingDeleteId(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={styles.exportBtn} onClick={() => openEditForm(material)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.exportBtn}
                      onClick={() => setPendingDeleteId(material.id)}
                      title="Delete this custom material"
                    >
                      Delete
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pendingDeleteId && (
        <p className={styles.materialFormError}>
          Parts already using this material keep their id but lose pricing (counted at $0) until you reassign them.
        </p>
      )}

      {formState ? (
        <CustomMaterialForm
          formState={formState}
          setFormState={setFormState}
          categories={categories}
          errors={errors}
          isEditing={Boolean(formState.id)}
          onSubmit={submitForm}
          onCancel={closeForm}
        />
      ) : (
        <>
          <button type="button" className={styles.templateBtn} onClick={openBlankForm}>
            Add Custom Material
          </button>

          <label className={styles.fieldLabel}>Duplicate From Catalog</label>
          <div className={styles.materialDuplicateRow}>
            <select
              className={styles.materialSelect}
              value={duplicateSourceId}
              onChange={(event) => setDuplicateSourceId(event.target.value)}
            >
              <option value="">Select a material…</option>
              {duplicateGroups.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name} — {formatMaterialPrice(material)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={openDuplicateForm}
              disabled={!duplicateSourceId}
            >
              Duplicate
            </button>
          </div>
        </>
      )}
    </div>
  );
}
