/**
 * The bench fixture's sun study, for tests (docs/all-day-shadow-freeze.md §7).
 *
 * `scripts/fixtures/bench-ceiling-project.json` placed in Manila at the
 * December solstice — the project on which the day envelope's union threw and
 * fell back to 8,408 unmerged pieces, and on which several moments' own unions
 * threw. Built from the project rather than checked in as polygons, so the
 * pieces stay exactly what `massShadowPieces` produces today.
 */
import envelope from '../../../scripts/fixtures/bench-ceiling-project.json';
import { deserializeProject } from '@/persistence/deserialize';
import { buildAnalysisMassing } from '@/analysis/buildingMassing';
import { massShadowPieces } from '@/analysis/shadowProjection';
import { sampleDaySunPositions, siteInstant } from '@/analysis/solarPosition';
import { createSunStudyState } from '@/analysis/sunStudyState';

export const BENCH_SITE = { latitude: 14.5995, longitude: 120.9842, timeZone: 'Asia/Manila', northAngle: 0 };

/** The bench project with the Manila site. A fresh copy per call. */
export function benchSunProject() {
  const { project } = deserializeProject(envelope);
  project.building = { ...(project.building || {}) };
  project.building.site = { ...(project.building.site || {}), ...BENCH_SITE };
  return project;
}

/**
 * Massing and the day's sun samples (15 min, December solstice — the sun
 * study's defaults), plus `samplesAboveOneDegree`: every moment the study casts.
 */
export function benchSunCase() {
  const project = benchSunProject();
  const { date, stepMinutes } = createSunStudyState();
  const [year, month, day] = date.split('-').map(Number);
  const noon = siteInstant({ year, month, day, minutes: 720, timeZone: BENCH_SITE.timeZone });
  const samples = sampleDaySunPositions({
    latitude: BENCH_SITE.latitude,
    longitude: BENCH_SITE.longitude,
    date: noon,
    stepMinutes,
    timeZone: BENCH_SITE.timeZone,
  });
  return {
    project,
    masses: buildAnalysisMassing(project),
    samples,
    samplesAboveOneDegree: samples.filter((sample) => sample.altitude > Math.PI / 180),
  };
}

/** Every shadow piece of every mass at one sun position, unmerged. */
export function benchShadowPieces(masses, sample) {
  return masses.flatMap((mass) =>
    massShadowPieces(mass, { altitude: sample.altitude, azimuth: sample.azimuth, northAngle: BENCH_SITE.northAngle }),
  );
}
