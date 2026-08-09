import { describe, expect, it } from 'vitest';
import {
  CEILING_APPLICATIONS,
  CEILING_JURISDICTION_PROFILES,
  CEILING_PRODUCT_PROFILES,
  CEILING_PRODUCT_PROFILE_STATUS,
  DEFAULT_CEILING_JURISDICTION_PROFILE_ID,
  DEFAULT_CEILING_PRODUCT_PROFILE_ID,
  getCeilingJurisdictionProfile,
  getCeilingProductProfile,
} from './ceilingProductProfiles';

describe('ceiling product profiles', () => {
  it('exposes the generic profile as the default', () => {
    expect(DEFAULT_CEILING_PRODUCT_PROFILE_ID).toBe('generic-fiber-cement-ceiling-v1');
    expect(getCeilingProductProfile(DEFAULT_CEILING_PRODUCT_PROFILE_ID).status).toBe(
      CEILING_PRODUCT_PROFILE_STATUS.CUSTOM_ASSUMPTION,
    );
  });

  it('looks up the referenced HardieFlex ceiling profile', () => {
    const profile = getCeilingProductProfile('jh-ph-hardieflex-ceilings-2021-reference-v1');
    expect(profile.region).toBe('PH');
    expect(profile.status).toBe(CEILING_PRODUCT_PROFILE_STATUS.REFERENCE_ONLY);
    expect(profile.application).toBe(CEILING_APPLICATIONS.INTERIOR_CEILING);
    expect(profile.planningDefaults.fastenerType).toBe('hardiedrive_or_profile_approved_equivalent');
    expect(profile.source.checkedAt).toBe('2026-08-07');
  });

  it('keeps installation rules out of verifiedRules for the reference-only profile', () => {
    const profile = getCeilingProductProfile('jh-ph-hardieflex-ceilings-2021-reference-v1');
    expect(profile.verifiedRules).toEqual({ stockBoards: true, thicknesses: true, application: true });
    expect(profile.verifiedRules.perimeterSpacingMm).toBeUndefined();
    expect(profile.planningDefaults.perimeterSpacingMm).toBe(150);
  });

  it('falls back to the first profile for unknown or missing ids', () => {
    expect(getCeilingProductProfile('does-not-exist').id).toBe(DEFAULT_CEILING_PRODUCT_PROFILE_ID);
    expect(getCeilingProductProfile(undefined).id).toBe(DEFAULT_CEILING_PRODUCT_PROFILE_ID);
    expect(getCeilingJurisdictionProfile('does-not-exist').id).toBe(DEFAULT_CEILING_JURISDICTION_PROFILE_ID);
    expect(getCeilingJurisdictionProfile(null).id).toBe(DEFAULT_CEILING_JURISDICTION_PROFILE_ID);
  });

  it('resolves the Philippine jurisdiction marker', () => {
    const jurisdiction = getCeilingJurisdictionProfile('ph-nbcp-planning-v1');
    expect(jurisdiction.region).toBe('PH');
    expect(jurisdiction.professionalReviewRequired).toBe(true);
  });

  it('freezes every profile so callers cannot mutate shared planning data', () => {
    expect(Object.isFrozen(CEILING_PRODUCT_PROFILES)).toBe(true);
    expect(CEILING_PRODUCT_PROFILES.every((profile) => Object.isFrozen(profile))).toBe(true);
    expect(CEILING_JURISDICTION_PROFILES.every((profile) => Object.isFrozen(profile))).toBe(true);
    expect(CEILING_PRODUCT_PROFILES.every((profile) => profile.professionalReviewRequired)).toBe(true);
  });
});
