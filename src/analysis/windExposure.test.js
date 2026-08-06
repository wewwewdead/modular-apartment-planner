import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_EXPOSURE_CLASS, SITE_EXPOSURE_CLASSES } from '@/domain/defaults';
import { createProject } from '@/domain/models';
import { CLIMATE_REFERENCE_HEIGHT_M, EXPOSURE_ALPHA, siteExposure } from './windExposure';
import { computeWindStudy } from './windRunner';
import { weibullMixtureQuantile } from './windComfort';
import {
  WIND_FIXTURE_COMFORT_SETTINGS,
  WIND_FIXTURE_DIRECTION_SETTINGS,
  createWindApartmentProject,
} from './__fixtures__/windApartmentProject';

function exposedProject(exposureClass) {
  const project = createWindApartmentProject();
  project.building.site.exposureClass = exposureClass;
  return project;
}

describe('site exposure — the power-law transformation', () => {
  it('agrees with the hand-computed ratio at 1.5 m for every class', () => {
    // U(1.5)/U(10) = (0.15)^alpha, evaluated independently of the module.
    for (const className of SITE_EXPOSURE_CLASSES) {
      const alpha = EXPOSURE_ALPHA[className];
      const exposure = siteExposure({ exposureClass: className, sliceHeightMm: 1500 });
      expect(exposure.class, className).toBe(className);
      expect(exposure.alpha, className).toBe(alpha);
      expect(exposure.referenceHeightM, className).toBe(10);
      expect(exposure.sliceHeightM, className).toBe(1.5);
      expect(exposure.factor, className).toBeCloseTo(Math.exp(alpha * Math.log(0.15)), 12);
    }
  });

  it('pins the three factors at the default slice height', () => {
    const factor = (className) => siteExposure({ exposureClass: className, sliceHeightMm: 1500 }).factor;
    expect(factor('open')).toBeCloseTo(0.76674822, 8);
    expect(factor('suburban')).toBeCloseTo(0.6587795, 8);
    expect(factor('dense-urban')).toBeCloseTo(0.53469992, 8);
    // Rougher terrain always slows the pedestrian-height wind more.
    expect(factor('open')).toBeGreaterThan(factor('suburban'));
    expect(factor('suburban')).toBeGreaterThan(factor('dense-urban'));
  });

  it('is the identity exactly at the reference height, for every class', () => {
    for (const className of SITE_EXPOSURE_CLASSES) {
      const exposure = siteExposure({ exposureClass: className, sliceHeightMm: CLIMATE_REFERENCE_HEIGHT_M * 1000 });
      expect(exposure.factor, className).toBeCloseTo(1, 12);
    }
  });

  it('falls back to the default class rather than to a factor of 1', () => {
    for (const value of [undefined, null, '', 'rural', 'OPEN', 42]) {
      const exposure = siteExposure({ exposureClass: value, sliceHeightMm: 1500 });
      expect(exposure.class, String(value)).toBe(DEFAULT_SITE_EXPOSURE_CLASS);
      expect(exposure.factor, String(value)).toBeLessThan(1);
    }
  });

  it('clamps a nonsensical slice height instead of extrapolating the power law', () => {
    expect(siteExposure({ exposureClass: 'open', sliceHeightMm: 0 }).sliceHeightM).toBe(0.1);
    expect(siteExposure({ exposureClass: 'open', sliceHeightMm: -900 }).sliceHeightM).toBe(0.1);
    expect(siteExposure({ exposureClass: 'open', sliceHeightMm: 'tall' }).sliceHeightM).toBe(0.1);
    expect(siteExposure().sliceHeightM).toBe(0.1);
  });
});

describe('site exposure — the domain field it reads', () => {
  it('defaults a new project to suburban', () => {
    expect(createProject('Exposure').building.site.exposureClass).toBe('suburban');
    expect(DEFAULT_SITE_EXPOSURE_CLASS).toBe('suburban');
  });
});

describe('site exposure — applied once, in one place', () => {
  const SETTINGS = { ...WIND_FIXTURE_DIRECTION_SETTINGS, iterations: 120, resolution: 48 };

  function directionRun(exposureClass) {
    return computeWindStudy({ project: exposedProject(exposureClass), windStudy: { ...SETTINGS } });
  }

  it('stamps what it did on the study model', () => {
    const model = directionRun('dense-urban').model;
    expect(Object.keys(model.exposure).sort()).toEqual([
      'alpha',
      'class',
      'factor',
      'referenceHeightM',
      'sliceHeightM',
    ]);
    expect(model.exposure.class).toBe('dense-urban');
    expect(model.exposure.alpha).toBe(0.33);
    expect(model.exposure.sliceHeightM).toBe(1.5);
  });

  it('scales the reported peak speed by exactly the factor, and nothing else', () => {
    const open = directionRun('open');
    const urban = directionRun('dense-urban');
    const ratio = urban.model.exposure.factor / open.model.exposure.factor;

    // The dimensionless field is untouched: same lattice, same amplification.
    expect(urban.summary.peakAmplification).toBe(open.summary.peakAmplification);
    expect(urban.summary.acceleratedFraction).toBe(open.summary.acceleratedFraction);
    // Only the speed the field is scaled BY moves.
    expect(urban.summary.referenceSpeed / open.summary.referenceSpeed).toBeCloseTo(ratio, 12);
    expect(urban.summary.peakSpeed / open.summary.peakSpeed).toBeCloseTo(ratio, 12);
  });

  it('is not applied twice: the reference speed is the settings value times one factor', () => {
    const run = directionRun('suburban');
    expect(run.summary.referenceSpeed).toBeCloseTo(SETTINGS.referenceSpeed * run.model.exposure.factor, 12);
    // Squaring the factor is the failure this guards against, and it is far
    // outside the tolerance above.
    expect(run.summary.referenceSpeed).not.toBeCloseTo(SETTINGS.referenceSpeed * run.model.exposure.factor ** 2, 6);
  });

  it('carries the same factor into the airflow network, so ACH scales with it', () => {
    const open = directionRun('open');
    const urban = directionRun('dense-urban');
    const ratio = urban.model.exposure.factor / open.model.exposure.factor;
    const achOf = (run, id) => run.ventilation.rooms.find((room) => room.id === id).airChangesPerHour;

    for (const id of ['room_nw', 'room_ne', 'room_sw']) {
      // Facade pressure goes as U², orifice flow as sqrt(dP), so air change
      // rate is LINEAR in the reference speed — but only in the limit. The
      // PRESSURE_SMOOTHING_PA regulariser in `flowAtPressureDifference` adds a
      // fixed 0.01 Pa to a pressure difference that itself scales as U², which
      // breaks exact homogeneity by a few parts in ten thousand here. That is
      // the departure this tolerance admits, and nothing larger: a doubled
      // application of the factor would show up as ratio², a 30% error.
      expect(achOf(urban, id) / achOf(open, id), id).toBeCloseTo(ratio, 3);
      expect(Math.abs(achOf(urban, id) / achOf(open, id) - ratio) / ratio, id).toBeLessThan(1e-3);
    }
  });

  it('moves the bulk air-speed index by the same factor', () => {
    const open = directionRun('open');
    const urban = directionRun('dense-urban');
    const ratio = urban.model.exposure.factor / open.model.exposure.factor;
    const speedOf = (run, id) => run.ventilation.rooms.find((room) => room.id === id).airSpeedMs;
    // Same regulariser departure as the air-change ratio above; the index is
    // the same through-flow divided by a geometry that does not move at all.
    expect(speedOf(urban, 'room_nw') / speedOf(open, 'room_nw')).toBeCloseTo(ratio, 3);
  });
});

describe('site exposure — direction and comfort transform consistently', () => {
  const COMFORT = { ...WIND_FIXTURE_COMFORT_SETTINGS, iterations: 120, resolution: 48 };

  it('scales the comfort mixture by the same factor the direction mode uses', () => {
    const open = computeWindStudy({ project: exposedProject('open'), windStudy: { ...COMFORT } });
    const urban = computeWindStudy({ project: exposedProject('dense-urban'), windStudy: { ...COMFORT } });

    expect(open.model.exposure.class).toBe('open');
    expect(urban.model.exposure.class).toBe('dense-urban');

    // Weibull scale is a pure scale parameter, so a quantile of the mixture is
    // homogeneous of degree one in it: scaling every sector's c by f scales the
    // 5% exceedance speed by f exactly. Read the classifier's own output to
    // prove the runner handed it the transformed rose.
    const amplifications = new Float64Array(open.windRose.length).fill(1);
    const speedAt = (run) => weibullMixtureQuantile(amplifications, run.windRose, 0.95);
    const ratio = urban.model.exposure.factor / open.model.exposure.factor;

    // The reported rose is deliberately the untransformed 10 m one...
    expect(speedAt(urban)).toBeCloseTo(speedAt(open), 12);
    // ...while the comfort field it produced is not.
    let openSum = 0;
    let urbanSum = 0;
    for (let index = 0; index < open.grid.comfortSpeed.length; index += 1) {
      if (open.grid.obstacles[index]) continue;
      openSum += open.grid.comfortSpeed[index];
      urbanSum += urban.grid.comfortSpeed[index];
    }
    expect(openSum).toBeGreaterThan(0);
    expect(urbanSum / openSum).toBeCloseTo(ratio, 6);
  });

  it('paces the representative particles at slice height, not at 10 m', () => {
    const run = computeWindStudy({ project: exposedProject('suburban'), windStudy: { ...COMFORT } });
    const sector = run.windRose.find((entry) => entry.directionDeg === run.representativeFlow.directionDeg);
    expect(run.representativeFlow.referenceSpeed).toBeCloseTo(sector.weibullC * run.model.exposure.factor, 12);
    expect(run.representativeFlow.referenceSpeed).toBeLessThan(sector.weibullC);
  });

  it('gives an open-terrain comfort map more wind than a dense-urban one, everywhere', () => {
    const open = computeWindStudy({ project: exposedProject('open'), windStudy: { ...COMFORT } });
    const urban = computeWindStudy({ project: exposedProject('dense-urban'), windStudy: { ...COMFORT } });
    for (let index = 0; index < open.grid.comfortSpeed.length; index += 1) {
      if (open.grid.obstacles[index]) continue;
      expect(urban.grid.comfortSpeed[index]).toBeLessThanOrEqual(open.grid.comfortSpeed[index]);
    }
  });
});
