export const WALL_PRODUCT_PROFILE_STATUS = Object.freeze({
  VERIFIED: 'verified',
  REFERENCE_ONLY: 'reference_only',
  CUSTOM_ASSUMPTION: 'custom_assumption',
});

export const WALL_APPLICATIONS = Object.freeze({
  INTERNAL_PARTITION: 'internal_partition',
  INTERNAL_WET_AREA: 'internal_wet_area',
  EXTERIOR_CLADDING: 'exterior_cladding',
});

/**
 * Product profiles are deliberately versioned and application-specific. Values under
 * `planningDefaults` drive initial geometry, while `verifiedRules` are the only values
 * that may be presented as manufacturer-checked requirements.
 */
export const WALL_PRODUCT_PROFILES = Object.freeze([
  Object.freeze({
    id: 'generic-fiber-cement-internal-v1',
    version: 1,
    manufacturer: 'Generic',
    product: 'Fiber-cement board',
    region: 'GLOBAL',
    application: WALL_APPLICATIONS.INTERNAL_PARTITION,
    status: WALL_PRODUCT_PROFILE_STATUS.CUSTOM_ASSUMPTION,
    thicknessesMm: [4.5, 6, 9, 12],
    stockBoards: [{ widthMm: 1219, heightMm: 2438 }],
    allowedFrameMaterials: ['light_gauge_steel', 'timber'],
    jointSystems: ['butt', 'seamless', 'express', 'control'],
    planningDefaults: {
      edgeClearanceMm: 12,
      cornerClearanceMm: 50,
      perimeterSpacingMm: 200,
      fieldSpacingMm: 300,
      maximumStudSpacingMm: 406,
      minimumSupportWidthMm: 38,
      fastenerType: 'corrosion_resistant_screw',
    },
    verifiedRules: {},
    source: {
      title: 'User-configured generic fiber-cement planning profile',
      revision: 'v1',
      url: '',
      checkedAt: null,
    },
    professionalReviewRequired: true,
  }),
  Object.freeze({
    id: 'jh-ph-hardieflex-walls-2021-reference-v1',
    version: 1,
    manufacturer: 'James Hardie',
    product: 'HardieFlex Walls',
    region: 'PH',
    application: WALL_APPLICATIONS.INTERNAL_PARTITION,
    status: WALL_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY,
    thicknessesMm: [4.5, 6, 9, 12],
    stockBoards: [{ widthMm: 1219, heightMm: 2438 }],
    allowedFrameMaterials: ['light_gauge_steel', 'timber'],
    jointSystems: ['butt', 'seamless', 'express', 'control'],
    planningDefaults: {
      edgeClearanceMm: 12,
      cornerClearanceMm: 50,
      perimeterSpacingMm: 200,
      fieldSpacingMm: 300,
      maximumStudSpacingMm: 406,
      minimumSupportWidthMm: 38,
      fastenerType: 'hardiedrive_or_profile_approved_equivalent',
    },
    // The cited catalogue verifies the product sizes and intended wall application, but
    // does not contain a complete wall fixing schedule. Installation rules therefore stay
    // in planningDefaults until an application-specific current guide is attached.
    verifiedRules: {
      stockBoards: true,
      thicknesses: true,
      application: true,
    },
    source: {
      title: 'James Hardie Philippines Product Catalogue 2021',
      revision: '2021',
      url: 'https://jameshardie.com.ph/files/documents/JH%20Product%20Catalogue%202021.pdf',
      checkedAt: '2026-08-01',
    },
    professionalReviewRequired: true,
  }),
]);

export const WALL_JURISDICTION_PROFILES = Object.freeze([
  Object.freeze({
    id: 'global-unverified-v1',
    version: 1,
    region: 'GLOBAL',
    label: 'Global / not specified',
    status: WALL_PRODUCT_PROFILE_STATUS.CUSTOM_ASSUMPTION,
    professionalReviewRequired: true,
    source: null,
  }),
  Object.freeze({
    id: 'ph-nbcp-planning-v1',
    version: 1,
    region: 'PH',
    label: 'Philippines — project-specific code review required',
    status: WALL_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY,
    professionalReviewRequired: true,
    source: {
      title: 'National Building Code of the Philippines — jurisdiction marker',
      revision: 'Project team to confirm current applicable rules',
      url: '',
      checkedAt: null,
    },
  }),
]);

export const DEFAULT_WALL_PRODUCT_PROFILE_ID = WALL_PRODUCT_PROFILES[0].id;
export const DEFAULT_WALL_JURISDICTION_PROFILE_ID = WALL_JURISDICTION_PROFILES[0].id;

export function getWallProductProfile(profileId) {
  return WALL_PRODUCT_PROFILES.find((profile) => profile.id === profileId) || WALL_PRODUCT_PROFILES[0];
}

export function getWallJurisdictionProfile(profileId) {
  return WALL_JURISDICTION_PROFILES.find((profile) => profile.id === profileId) || WALL_JURISDICTION_PROFILES[0];
}
