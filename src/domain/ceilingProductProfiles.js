export const CEILING_PRODUCT_PROFILE_STATUS = Object.freeze({
  VERIFIED: 'verified',
  REFERENCE_ONLY: 'reference_only',
  CUSTOM_ASSUMPTION: 'custom_assumption',
});

export const CEILING_APPLICATIONS = Object.freeze({
  INTERIOR_CEILING: 'interior_ceiling',
  WET_AREA_CEILING: 'wet_area_ceiling',
});

/**
 * Ceiling profiles follow the wall profile contract: `planningDefaults` drive
 * initial geometry, while `verifiedRules` are the only values that may be
 * presented as manufacturer-checked requirements.
 */
export const CEILING_PRODUCT_PROFILES = Object.freeze([
  Object.freeze({
    id: 'generic-fiber-cement-ceiling-v1',
    version: 1,
    manufacturer: 'Generic',
    product: 'Fiber-cement ceiling board',
    region: 'GLOBAL',
    application: CEILING_APPLICATIONS.INTERIOR_CEILING,
    status: CEILING_PRODUCT_PROFILE_STATUS.CUSTOM_ASSUMPTION,
    thicknessesMm: [3.5, 4.5, 6],
    stockBoards: [{ widthMm: 1219, heightMm: 2438 }],
    allowedFrameMaterials: ['light_gauge_steel', 'timber'],
    jointSystems: ['butt', 'seamless', 'express', 'control'],
    planningDefaults: {
      edgeClearanceMm: 12,
      cornerClearanceMm: 50,
      perimeterSpacingMm: 150,
      fieldSpacingMm: 230,
      maximumFurringSpacingMm: 406,
      carrierSpacingMm: 1220,
      hangerSpacingMm: 1200,
      minimumSupportWidthMm: 35,
      fastenerType: 'corrosion_resistant_screw',
    },
    verifiedRules: {},
    source: {
      title: 'User-configured generic fiber-cement ceiling planning profile',
      revision: 'v1',
      url: '',
      checkedAt: null,
    },
    professionalReviewRequired: true,
  }),
  Object.freeze({
    id: 'jh-ph-hardieflex-ceilings-2021-reference-v1',
    version: 1,
    manufacturer: 'James Hardie',
    product: 'HardieFlex (ceilings)',
    region: 'PH',
    application: CEILING_APPLICATIONS.INTERIOR_CEILING,
    status: CEILING_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY,
    thicknessesMm: [3.5, 4.5, 6],
    stockBoards: [{ widthMm: 1219, heightMm: 2438 }],
    allowedFrameMaterials: ['light_gauge_steel', 'timber'],
    jointSystems: ['butt', 'seamless', 'express', 'control'],
    planningDefaults: {
      edgeClearanceMm: 12,
      cornerClearanceMm: 50,
      perimeterSpacingMm: 150,
      fieldSpacingMm: 230,
      maximumFurringSpacingMm: 406,
      carrierSpacingMm: 1220,
      hangerSpacingMm: 1200,
      minimumSupportWidthMm: 35,
      fastenerType: 'hardiedrive_or_profile_approved_equivalent',
    },
    // The cited catalogue verifies the board sizes and the intended ceiling
    // application, but does not contain a complete ceiling fixing schedule.
    // Furring, carrier, hanger and screw rules therefore stay in
    // planningDefaults until a current installation guide is attached.
    verifiedRules: {
      stockBoards: true,
      thicknesses: true,
      application: true,
    },
    source: {
      title: 'James Hardie Philippines Product Catalogue 2021',
      revision: '2021',
      url: 'https://jameshardie.com.ph/files/documents/JH%20Product%20Catalogue%202021.pdf',
      checkedAt: '2026-08-07',
    },
    professionalReviewRequired: true,
  }),
]);

export const CEILING_JURISDICTION_PROFILES = Object.freeze([
  Object.freeze({
    id: 'global-unverified-v1',
    version: 1,
    region: 'GLOBAL',
    label: 'Global / not specified',
    status: CEILING_PRODUCT_PROFILE_STATUS.CUSTOM_ASSUMPTION,
    professionalReviewRequired: true,
    source: null,
  }),
  Object.freeze({
    id: 'ph-nbcp-planning-v1',
    version: 1,
    region: 'PH',
    label: 'Philippines — project-specific code review required',
    status: CEILING_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY,
    professionalReviewRequired: true,
    source: {
      title: 'National Building Code of the Philippines — jurisdiction marker',
      revision: 'Project team to confirm current applicable rules',
      url: '',
      checkedAt: null,
    },
  }),
]);

export const DEFAULT_CEILING_PRODUCT_PROFILE_ID = CEILING_PRODUCT_PROFILES[0].id;
export const DEFAULT_CEILING_JURISDICTION_PROFILE_ID = CEILING_JURISDICTION_PROFILES[0].id;

export function getCeilingProductProfile(profileId) {
  return CEILING_PRODUCT_PROFILES.find((profile) => profile.id === profileId) || CEILING_PRODUCT_PROFILES[0];
}

export function getCeilingJurisdictionProfile(profileId) {
  return CEILING_JURISDICTION_PROFILES.find((profile) => profile.id === profileId) || CEILING_JURISDICTION_PROFILES[0];
}
