export function getObjectDraftWarnings(objectDraft) {
  const warnings = [];

  if (!objectDraft?.name?.trim()) {
    warnings.push('Object name is required.');
  }

  if (!objectDraft?.footprint?.points?.length || objectDraft.footprint.points.length < 3) {
    warnings.push('A closed footprint is required.');
  }

  if (!(Number(objectDraft?.bounds?.height) > 0)) {
    warnings.push('Object height must be greater than 0.');
  }

  const primaryAnchor = (objectDraft?.anchors || []).find((anchor) => anchor.kind === 'primary');
  if (!primaryAnchor) {
    warnings.push('A primary anchor is required.');
  }

  if (!objectDraft?.parts?.length) {
    warnings.push('At least one part should be defined for production workflows.');
  }

  return warnings;
}

export function validateObjectDraft(objectDraft) {
  const warnings = getObjectDraftWarnings(objectDraft);
  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

export function isObjectExportReady(objectDraft) {
  return validateObjectDraft(objectDraft).isValid;
}
