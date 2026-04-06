import { useEffect, useMemo } from 'react';
import styles from '../styles/craftsman.module.css';
import {
  JOINT_PARAMETER_DEPTH_MODES,
  JOINT_PLACEMENT_MODES,
  computeSketchJointDefaults,
  getJointTypeDefinition,
  getSketchJointSummary,
  getSketchJointTypeOptions,
  listJointTypeParameterFields,
} from '../../utils/sketchJoineryUtils';
import {
  buildContactSummary,
  buildParameterValues,
  buildSeedJoint,
  getEdgeOptionsForEntity,
  getJointStatusClassName,
  getRectPartOptions,
  supportsAutoDepthMode,
} from './jointPanelHelpers';

function JointStatus({ diagnostic }) {
  if (!diagnostic) {
    return null;
  }

  return (
    <span className={`${styles.jointStatus} ${getJointStatusClassName(diagnostic)}`}>{diagnostic.statusLabel}</span>
  );
}

export default function JointForm({
  entities,
  selectedEntities,
  formState,
  setFormState,
  candidateJoint,
  candidateDiagnostic,
  contextPairIds = [],
  isEditingExistingJoint = false,
  onSubmit,
  onCancel,
  submitLabel,
}) {
  const partOptions = useMemo(() => getRectPartOptions(entities), [entities]);
  const sourceEdgeOptions = useMemo(
    () => getEdgeOptionsForEntity(entities, formState.sourcePartId),
    [entities, formState.sourcePartId],
  );
  const targetEdgeOptions = useMemo(
    () => getEdgeOptionsForEntity(entities, formState.targetPartId),
    [entities, formState.targetPartId],
  );
  const currentType = getJointTypeDefinition(formState.type);
  const parameterFields = listJointTypeParameterFields(formState.type);
  const pairSelectionIds = contextPairIds.length ? contextPairIds : selectedEntities.map((entity) => entity.id);
  const isManualPlacement = formState.placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS;
  const autoDepthEnabled = supportsAutoDepthMode(formState.type, formState.placementMode);
  const depthIsAuto = formState.parameterModes.depth === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP;
  const defaultSeedJoint = useMemo(
    () => buildSeedJoint(formState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      formState.id,
      formState.type,
      formState.placementMode,
      formState.parameterModes,
      formState.sourcePartId,
      formState.targetPartId,
      formState.sourceEdgeValue,
      formState.targetEdgeValue,
    ],
  );
  const defaultParameters = useMemo(
    () => computeSketchJointDefaults(defaultSeedJoint, entities),
    [defaultSeedJoint, entities],
  );
  const contactSummary = buildContactSummary(candidateJoint);

  useEffect(() => {
    if (!formState.sourcePartId && partOptions[0]?.value) {
      setFormState((current) => ({
        ...current,
        sourcePartId: partOptions[0].value,
      }));
    }
  }, [formState.sourcePartId, partOptions, setFormState]);

  useEffect(() => {
    if (formState.sourcePartId === formState.targetPartId) {
      const nextTargetId = partOptions.find((option) => option.value !== formState.sourcePartId)?.value || '';
      if (nextTargetId) {
        setFormState((current) => ({
          ...current,
          targetPartId: nextTargetId,
        }));
      }
    }
  }, [formState.sourcePartId, formState.targetPartId, partOptions, setFormState]);

  useEffect(() => {
    if (!isManualPlacement) {
      return;
    }

    if (!sourceEdgeOptions.some((option) => option.value === formState.sourceEdgeValue)) {
      setFormState((current) => ({
        ...current,
        sourceEdgeValue: sourceEdgeOptions[0]?.value || '',
      }));
    }
  }, [formState.sourceEdgeValue, isManualPlacement, sourceEdgeOptions, setFormState]);

  useEffect(() => {
    if (!isManualPlacement) {
      return;
    }

    if (!targetEdgeOptions.some((option) => option.value === formState.targetEdgeValue)) {
      setFormState((current) => ({
        ...current,
        targetEdgeValue: targetEdgeOptions[0]?.value || '',
      }));
    }
  }, [formState.targetEdgeValue, isManualPlacement, targetEdgeOptions, setFormState]);

  useEffect(() => {
    setFormState((current) => {
      let nextParameterValues = current.parameterValues;
      let didChange = false;

      if (current.autoDefaults) {
        const computedValues = buildParameterValues(current.type, defaultParameters, null);

        const currentKeys = Object.keys(current.parameterValues);
        const nextKeys = Object.keys(computedValues);
        let equal = currentKeys.length === nextKeys.length;
        if (equal) {
          for (const key of nextKeys) {
            if (current.parameterValues[key] !== computedValues[key]) {
              equal = false;
              break;
            }
          }
        }

        if (!equal) {
          nextParameterValues = computedValues;
          didChange = true;
        }
      } else if (current.parameterModes.depth === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP) {
        const nextDepthValue = defaultParameters.depth != null ? String(defaultParameters.depth) : '';
        if ((current.parameterValues.depth ?? '') !== nextDepthValue) {
          nextParameterValues = {
            ...current.parameterValues,
            depth: nextDepthValue,
          };
          didChange = true;
        }
      }

      return didChange
        ? {
            ...current,
            parameterValues: nextParameterValues,
          }
        : current;
    });
  }, [
    defaultParameters,
    formState.autoDefaults,
    formState.parameterModes.depth,
    formState.placementMode,
    formState.sourceEdgeValue,
    formState.sourcePartId,
    formState.targetEdgeValue,
    formState.targetPartId,
    formState.type,
    setFormState,
  ]);

  const canSubmit =
    candidateDiagnostic &&
    candidateDiagnostic.status !== 'invalid' &&
    candidateDiagnostic.status !== 'disabled' &&
    candidateDiagnostic.canApply !== false;

  return (
    <div className={styles.jointDetail}>
      <p className={styles.jointDescription}>
        {currentType?.description || 'Generate manufacturing-aware joinery from the selected parts.'}
      </p>

      {pairSelectionIds.length === 2 ? (
        <p className={styles.jointContext}>
          {isEditingExistingJoint ? 'Editing pair' : 'Selected pair'}: <strong>{pairSelectionIds.join(' + ')}</strong>
        </p>
      ) : null}

      <div className={styles.jointFormGrid}>
        <label className={styles.fieldLabel}>
          Joint Type
          <select
            className={styles.materialSelect}
            value={formState.type}
            onChange={(event) => {
              const nextType = event.target.value;
              const nextDepthMode = supportsAutoDepthMode(nextType, formState.placementMode)
                ? JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP
                : JOINT_PARAMETER_DEPTH_MODES.MANUAL;

              setFormState((current) => ({
                ...current,
                type: nextType,
                autoDefaults: true,
                parameterModes: {
                  ...current.parameterModes,
                  depth: nextDepthMode,
                },
                parameterValues: {},
              }));
            }}
          >
            {getSketchJointTypeOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Source Part
          <select
            className={styles.materialSelect}
            value={formState.sourcePartId}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                sourcePartId: event.target.value,
                autoDefaults: true,
              }))
            }
          >
            {partOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Target Part
          <select
            className={styles.materialSelect}
            value={formState.targetPartId}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                targetPartId: event.target.value,
                autoDefaults: true,
              }))
            }
          >
            {partOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Placement
          <div className={styles.jointModeValue}>
            {isManualPlacement ? 'Manual edge references' : 'Automatic contact detection'}
          </div>
        </label>

        {isManualPlacement ? (
          <>
            <label className={styles.fieldLabel}>
              Source Edge
              <select
                className={styles.materialSelect}
                value={formState.sourceEdgeValue}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    sourceEdgeValue: event.target.value,
                    autoDefaults: true,
                  }))
                }
              >
                {sourceEdgeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              Target Edge
              <select
                className={styles.materialSelect}
                value={formState.targetEdgeValue}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    targetEdgeValue: event.target.value,
                    autoDefaults: true,
                  }))
                }
              >
                {targetEdgeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className={styles.fieldLabel}>
          Label
          <input
            type="text"
            className={styles.thicknessInput}
            value={formState.label}
            onChange={(event) => setFormState((current) => ({ ...current, label: event.target.value }))}
            placeholder="Optional joint label"
          />
        </label>

        {parameterFields.map((field) => {
          if (field.key === 'depth' && autoDepthEnabled && depthIsAuto) {
            return (
              <label key={field.key} className={styles.fieldLabel}>
                {field.label}
                <input
                  type="text"
                  className={styles.thicknessInput}
                  value={formState.parameterValues.depth ?? ''}
                  readOnly
                />
                <div className={styles.jointFieldControls}>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      setFormState((current) => ({
                        ...current,
                        autoDefaults: false,
                        parameterModes: {
                          ...current.parameterModes,
                          depth: JOINT_PARAMETER_DEPTH_MODES.MANUAL,
                        },
                        parameterValues: {
                          ...current.parameterValues,
                          depth: current.parameterValues.depth ?? '',
                        },
                      }))
                    }
                  >
                    Use Manual Depth
                  </button>
                </div>
              </label>
            );
          }

          return (
            <label key={field.key} className={styles.fieldLabel}>
              {field.label}
              <input
                type="number"
                min={field.min}
                step={field.step}
                className={styles.thicknessInput}
                value={formState.parameterValues[field.key] ?? ''}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    autoDefaults: false,
                    parameterValues: {
                      ...current.parameterValues,
                      [field.key]: event.target.value,
                    },
                  }))
                }
              />
              {field.key === 'depth' && autoDepthEnabled ? (
                <div className={styles.jointFieldControls}>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      setFormState((current) => ({
                        ...current,
                        parameterModes: {
                          ...current.parameterModes,
                          depth: JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP,
                        },
                        parameterValues: {
                          ...current.parameterValues,
                          depth: defaultParameters.depth != null ? String(defaultParameters.depth) : '',
                        },
                      }))
                    }
                  >
                    Link To Overlap
                  </button>
                </div>
              ) : null}
            </label>
          );
        })}
      </div>

      <div className={styles.jointCandidateRow}>
        <JointStatus diagnostic={candidateDiagnostic} />
        <span className={styles.jointSummary}>{getSketchJointSummary(candidateJoint)}</span>
      </div>

      {contactSummary ? <p className={styles.jointHowTo}>{contactSummary}</p> : null}

      {candidateDiagnostic?.message ? (
        <p className={styles.jointHowTo}>{candidateDiagnostic.message}</p>
      ) : (
        <p className={styles.jointHowTo}>
          Automatic joints detect the single valid contact or overlap region between the selected parts, keep the joint
          definition intact after edits, and regenerate manufacturing geometry instead of decorative labels.
        </p>
      )}

      <div className={styles.jointActionRow}>
        <button type="button" className={styles.exportBtn} onClick={onSubmit} disabled={!canSubmit}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className={styles.exportBtn} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
