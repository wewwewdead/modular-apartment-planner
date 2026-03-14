export const SECTION_VISIBILITY_REASONS = {
  OK: 'ok',
  NO_GEOMETRY: 'no_geometry',
  MISSES_CUT: 'misses_cut',
  OUTSIDE_DEPTH_OR_DIRECTION: 'outside_depth_or_direction',
  HIDDEN_BY_PHASE: 'hidden_by_phase',
};

export function getSectionVisibilityMessage(kind, reason) {
  if (!reason || reason === SECTION_VISIBILITY_REASONS.OK) return null;

  if (reason === SECTION_VISIBILITY_REASONS.HIDDEN_BY_PHASE) {
    if (kind === 'roof') return 'Roof is hidden by the current phase filter.';
    if (kind === 'railing') return 'Railings are hidden by the current phase filter.';
    return 'Trusses are hidden by the current phase filter.';
  }

  if (reason === SECTION_VISIBILITY_REASONS.MISSES_CUT) {
    if (kind === 'roof') return 'Section cut does not cross the roof footprint.';
    if (kind === 'railing') return 'Section cut does not cross the railing layout.';
    return 'Section cut does not cross the truss layout.';
  }

  if (reason === SECTION_VISIBILITY_REASONS.OUTSIDE_DEPTH_OR_DIRECTION) {
    if (kind === 'roof') {
      return 'Roof is outside the current section depth or on the hidden side; increase depth or flip section direction.';
    }
    if (kind === 'railing') {
      return 'Railings are outside the current section depth or on the hidden side; increase depth or flip section direction.';
    }
    return 'Trusses are outside the current section depth or on the hidden side; increase depth or flip section direction.';
  }

  if (kind === 'roof') return 'Roof has no sectionable geometry.';
  if (kind === 'railing') return 'No railing geometry is available for this section.';
  return 'No truss geometry is available for this section.';
}
