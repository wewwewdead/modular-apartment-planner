import { useMemo, useState } from 'react';
import { getMaterialById } from '../data/materials';
import { getEntityManufacturingGeometry } from '../utils/entityManufacturingGeometry';
import { isEntityBomEligible } from '../utils/entityBomAdapter';
import {
  DEFAULT_BOOK_LOAD_KG_PER_M,
  SAG_BORDERLINE_MM_PER_M,
  SAG_FINE_MM_PER_M,
  SAG_VERDICTS,
  estimateShelfSag,
} from '../physics/shelfSag';
import { resolveMaterialPhysics } from '../physics/woodProperties';
import styles from '../styles/craftsman.module.css';

const LOAD_TYPE_OPTIONS = [
  { value: 'uniform', label: 'Spread evenly' },
  { value: 'center', label: 'Concentrated at midspan' },
];

const FIXITY_OPTIONS = [
  { value: 'simple', label: 'Resting on supports' },
  { value: 'fixed', label: 'Fixed / housed both ends' },
];

const VERDICT_CLASS = {
  [SAG_VERDICTS.FINE]: styles.jointStatusApplied,
  [SAG_VERDICTS.BORDERLINE]: styles.jointStatusWarning,
  [SAG_VERDICTS.SAGS]: styles.jointStatusInvalid,
};

function formatMm(value) {
  return `${Math.round((Number(value) || 0) * 100) / 100}mm`;
}

/**
 * Span, depth and thickness read straight off the drawn part: the LONGEST
 * dimension is the span (that is the direction a shelf bridges), the shorter
 * in-plane dimension is its depth, and thickness comes from the entity or the
 * material. All three stay editable, because a shelf's span is the gap between
 * its supports, which can be shorter than the board.
 */
export function resolveShelfDefaults(entity, material) {
  const geometry = getEntityManufacturingGeometry(entity, material);
  const longest = Math.max(geometry.width, geometry.height);
  const shortest = Math.min(geometry.width, geometry.height);

  return {
    spanMm: longest,
    widthMm: shortest,
    thicknessMm: Number(entity?.thickness) || Number(material?.thickness) || 0,
  };
}

export function isShelfSagPanelVisible(entity) {
  if (!entity || !isEntityBomEligible(entity)) {
    return false;
  }
  return resolveMaterialPhysics(getMaterialById(entity.materialId))?.modulusGPa > 0;
}

export default function ShelfSagPanel({ entity }) {
  const material = useMemo(() => getMaterialById(entity?.materialId), [entity?.materialId]);
  const defaults = useMemo(() => resolveShelfDefaults(entity, material), [entity, material]);

  const [spanMm, setSpanMm] = useState(null);
  const [loadKgPerM, setLoadKgPerM] = useState(DEFAULT_BOOK_LOAD_KG_PER_M);
  const [loadType, setLoadType] = useState('uniform');
  const [fixity, setFixity] = useState('simple');

  const effectiveSpan = spanMm ?? defaults.spanMm;

  const result = useMemo(
    () =>
      estimateShelfSag({
        spanMm: effectiveSpan,
        widthMm: defaults.widthMm,
        thicknessMm: defaults.thicknessMm,
        material,
        loadKgPerM,
        loadType,
        fixity,
      }),
    [effectiveSpan, defaults.widthMm, defaults.thicknessMm, material, loadKgPerM, loadType, fixity],
  );

  if (!isShelfSagPanelVisible(entity)) {
    return null;
  }

  return (
    <div className={styles.materialPicker}>
      <label className={styles.fieldLabel} htmlFor="shelf-sag-span">
        Span between supports (mm)
      </label>
      <input
        id="shelf-sag-span"
        type="number"
        min="1"
        step="1"
        className={styles.thicknessInput}
        value={effectiveSpan}
        onChange={(event) => setSpanMm(Number(event.target.value) || defaults.spanMm)}
      />
      <p className={styles.fieldHint}>
        {formatMm(defaults.widthMm)} deep x {formatMm(defaults.thicknessMm)} thick, from the drawn part.
      </p>

      <label className={styles.fieldLabel} htmlFor="shelf-sag-load">
        Load (kg per metre)
      </label>
      <input
        id="shelf-sag-load"
        type="number"
        min="0"
        step="1"
        className={styles.thicknessInput}
        value={loadKgPerM}
        onChange={(event) => setLoadKgPerM(Number(event.target.value) || 0)}
      />
      <p className={styles.fieldHint}>{DEFAULT_BOOK_LOAD_KG_PER_M} kg/m is a densely packed run of hardcover books.</p>

      <label className={styles.fieldLabel} htmlFor="shelf-sag-load-type">
        Load placement
      </label>
      <select
        id="shelf-sag-load-type"
        className={styles.materialSelect}
        value={loadType}
        onChange={(event) => setLoadType(event.target.value)}
      >
        {LOAD_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label className={styles.fieldLabel} htmlFor="shelf-sag-fixity">
        End support
      </label>
      <select
        id="shelf-sag-fixity"
        className={styles.materialSelect}
        value={fixity}
        onChange={(event) => setFixity(event.target.value)}
      >
        {FIXITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {result ? (
        <>
          <div className={styles.nestingSummary}>
            <div className={styles.nestingStat}>
              <span className={styles.nestingStatValue}>{result.deflectionMm.toFixed(2)}</span>
              <span className={styles.nestingStatLabel}>mm sag</span>
            </div>
            <div className={styles.nestingStat}>
              <span className={styles.nestingStatValue}>{result.sagPerMeterMm.toFixed(2)}</span>
              <span className={styles.nestingStatLabel}>mm per m</span>
            </div>
            <div className={styles.nestingStat}>
              <span className={`${styles.jointStatus} ${VERDICT_CLASS[result.verdict] || ''}`}>
                {result.verdictLabel}
              </span>
              <span className={styles.nestingStatLabel}>verdict</span>
            </div>
          </div>
          <p className={styles.hint}>
            E = {result.modulusGPa} GPa ({material?.name}). Under {SAG_FINE_MM_PER_M}mm/m reads flat; over{' '}
            {SAG_BORDERLINE_MM_PER_M}mm/m is a visible sag (the 1/32-inch-per-foot rule). Clear-wood stiffness and
            elastic only — a loaded shelf creeps to roughly double this over a year or two.
          </p>
        </>
      ) : (
        <p className={styles.emptyMessage}>Set a thickness and a load to estimate deflection.</p>
      )}
    </div>
  );
}
