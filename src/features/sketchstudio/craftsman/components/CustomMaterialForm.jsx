import styles from '../styles/craftsman.module.css';
import { COST_BASIS_OPTIONS } from '../data/customMaterials';
import {
  CUSTOM_CATEGORY_SENTINEL,
  buildCategoryOptions,
  getCostBasisUnitLabel,
  getFirstErrorMessage,
} from './customMaterialFormHelpers';

function FieldError({ message }) {
  if (!message) {
    return null;
  }

  return <span className={styles.materialFieldError}>{message}</span>;
}

/**
 * Add / edit form for a single custom material. Mirrors JointForm: controlled
 * `formState` owned by the parent panel, submit + cancel in a `jointActionRow`.
 */
export default function CustomMaterialForm({
  formState,
  setFormState,
  categories,
  errors = {},
  isEditing = false,
  onSubmit,
  onCancel,
}) {
  const categoryOptions = buildCategoryOptions(categories);
  const usesNewCategory = formState.category === CUSTOM_CATEGORY_SENTINEL;
  const summaryError = getFirstErrorMessage(errors);
  const setField = (key, value) => setFormState((current) => ({ ...current, [key]: value }));

  return (
    <div className={styles.jointDetail}>
      <p className={styles.jointDescription}>
        {isEditing
          ? 'Update your material. BOM costs recalculate as soon as you save.'
          : 'Enter your own material and the price you actually pay. It is stored on this device.'}
      </p>

      <div className={styles.jointFormGrid}>
        <label className={styles.fieldLabel}>
          Name
          <input
            type="text"
            className={styles.thicknessInput}
            value={formState.name}
            placeholder="e.g. 18mm Birch (local supplier)"
            onChange={(event) => setField('name', event.target.value)}
          />
          <FieldError message={errors.name} />
        </label>

        <label className={styles.fieldLabel}>
          Category
          <select
            className={styles.materialSelect}
            value={formState.category}
            onChange={(event) => setField('category', event.target.value)}
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.category} />
        </label>

        {usesNewCategory && (
          <label className={styles.fieldLabel}>
            New Category Name
            <input
              type="text"
              className={styles.thicknessInput}
              value={formState.newCategory}
              placeholder="custom"
              onChange={(event) => setField('newCategory', event.target.value)}
            />
          </label>
        )}

        <label className={styles.fieldLabel}>
          Cost Basis
          <select
            className={styles.materialSelect}
            value={formState.costBasis}
            onChange={(event) => setField('costBasis', event.target.value)}
          >
            {COST_BASIS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.costBasis} />
        </label>

        <label className={styles.fieldLabel}>
          Price (per {getCostBasisUnitLabel(formState.costBasis)})
          <input
            type="number"
            min="0"
            step="0.01"
            className={styles.thicknessInput}
            value={formState.price}
            placeholder="0.00"
            onChange={(event) => setField('price', event.target.value)}
          />
          <FieldError message={errors.pricePerM2} />
        </label>

        <label className={styles.fieldLabel}>
          Thickness (mm)
          <input
            type="number"
            min="0.1"
            step="0.1"
            className={styles.thicknessInput}
            value={formState.thickness}
            onChange={(event) => setField('thickness', event.target.value)}
          />
          <FieldError message={errors.thickness} />
        </label>

        <label className={styles.fieldLabel}>
          Stock Width (mm)
          <input
            type="number"
            min="1"
            step="1"
            className={styles.thicknessInput}
            value={formState.defaultWidth}
            onChange={(event) => setField('defaultWidth', event.target.value)}
          />
          <FieldError message={errors.defaultWidth} />
        </label>

        <label className={styles.fieldLabel}>
          Stock Length (mm)
          <input
            type="number"
            min="1"
            step="1"
            className={styles.thicknessInput}
            value={formState.defaultHeight}
            onChange={(event) => setField('defaultHeight', event.target.value)}
          />
          <FieldError message={errors.defaultHeight} />
        </label>

        <label className={styles.fieldLabel}>
          Density (kg/m3)
          <input
            type="number"
            min="1"
            step="1"
            className={styles.thicknessInput}
            value={formState.density}
            onChange={(event) => setField('density', event.target.value)}
          />
        </label>

        <label className={styles.fieldLabel}>
          Directional Grain
          <span className={styles.fieldHint}>
            Lumber and veneered panels have grain; MDF, acrylic and metal do not. Parts cut from a grain material can be
            locked to a grain direction, which the cut-list optimizer then honours as a hard constraint.
          </span>
          <label className={styles.kerfToggle}>
            <input
              type="checkbox"
              checked={formState.hasGrain === true}
              onChange={(event) => setField('hasGrain', event.target.checked)}
            />
            <span>This material has a grain direction</span>
          </label>
        </label>

        <label className={styles.fieldLabel}>
          Color
          <input
            type="color"
            className={styles.materialColorInput}
            value={formState.color}
            onChange={(event) => setField('color', event.target.value)}
          />
        </label>
      </div>

      {summaryError && <p className={styles.materialFormError}>{summaryError}</p>}

      <div className={styles.jointActionRow}>
        <button type="button" className={styles.exportBtn} onClick={onSubmit}>
          {isEditing ? 'Save Material' : 'Add Material'}
        </button>
        <button type="button" className={styles.exportBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
