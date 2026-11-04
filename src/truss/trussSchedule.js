import { TRUSS_MEMBER_KEYS, normalizeTrussMemberSizes, resolveTrussType } from '@/domain/trussModels';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { buildEndClosureLayout } from './endClosures';
import { getWebPatternLabel } from './webPatterns';

/**
 * The truss schedule of one system (docs/roof-truss-industrial.md §7.5): one
 * row per instance, system totals and a cutting list — all measured off the
 * same built geometry the 3D and the drawings use.
 *
 * Member lengths are CENTRE-LINE lengths between panel points (the ends are
 * square, joints overlap — spec §7.1), so the cutting list is a timber order,
 * not a saw schedule: each length is rounded UP to the next 100.
 */

const CUT_ROUNDING = 100;
const MEMBER_LABELS = Object.freeze({ topChord: 'Top chord', bottomChord: 'Bottom chord', web: 'Web' });

/** Section key and label of a member size: "90x35" / "90 × 35". */
export function memberSectionKey(size) {
  return `${Math.round(size?.depth || 0)}x${Math.round(size?.width || 0)}`;
}

export function memberSectionLabel(size) {
  return `${Math.round(size?.depth || 0)} × ${Math.round(size?.width || 0)}`;
}

function memberKeyOf(member) {
  return TRUSS_MEMBER_KEYS.includes(member.memberType) ? member.memberType : 'web';
}

function memberLength(member) {
  if (Number.isFinite(member.length) && member.length > 0) return member.length;
  if (!member.startWorld || !member.endWorld) return 0;
  return Math.hypot(
    member.endWorld.x - member.startWorld.x,
    member.endWorld.y - member.startWorld.y,
    (member.endWorld.elevation || 0) - (member.startWorld.elevation || 0),
  );
}

function segmentLength(segment) {
  return Math.hypot(
    segment.endWorld.x - segment.startWorld.x,
    segment.endWorld.y - segment.startWorld.y,
    (segment.endWorld.elevation || 0) - (segment.startWorld.elevation || 0),
  );
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * `{rows, totals, cuttingList, sections}` for a truss system.
 * `options.systemGeometry` reuses a built geometry; `options.roofSystem` lets
 * the closure area follow the attached roof underside.
 */
export function buildTrussSchedule(trussSystem, options = {}) {
  const empty = {
    rows: [],
    totals: { trussCount: 0, gableEndCount: 0, timberBySection: [], timberLm: 0, purlinLm: 0, closureAreaM2: 0 },
    cuttingList: [],
  };
  if (!trussSystem || !(trussSystem.trussInstances || []).length) return empty;

  const geometry = options.systemGeometry || buildTrussSystemGeometry(trussSystem);
  const sizes = normalizeTrussMemberSizes(trussSystem.memberSizes);
  const timber = new Map();
  const cuts = new Map();
  let trussCount = 0;
  let gableEndCount = 0;

  const rows = geometry.instances.map((instanceGeometry) => {
    const { instance, metrics } = instanceGeometry;
    const trussType = instanceGeometry.trussType || resolveTrussType(instance.trussTypeId);
    const copies = instanceGeometry.copies || [];
    const endFrames = copies.filter((copy) => copy.endFrameSide).length;
    trussCount += copies.length;
    gableEndCount += endFrames;

    for (const copy of copies) {
      for (const member of copy.members || []) {
        const key = memberKeyOf(member);
        const size = sizes[key];
        const sectionKey = memberSectionKey(size);
        const length = memberLength(member);
        if (length <= 0) continue;
        const entry = timber.get(sectionKey) || { key: sectionKey, label: memberSectionLabel(size), lengthMm: 0 };
        entry.lengthMm += length;
        timber.set(sectionKey, entry);

        const role =
          member.role === 'heel_stud'
            ? 'Heel stud'
            : copy.endFrameSide && key === 'web'
              ? 'Gable stud'
              : MEMBER_LABELS[key];
        const cutLength = Math.ceil(length / CUT_ROUNDING - 1e-9) * CUT_ROUNDING;
        const cutKey = `${role}|${sectionKey}|${cutLength}`;
        const cut = cuts.get(cutKey) || {
          key: cutKey,
          member: role,
          section: memberSectionLabel(size),
          length: cutLength,
          count: 0,
        };
        cut.count += 1;
        cuts.set(cutKey, cut);
      }
    }

    return {
      id: instance.id,
      label: instanceGeometry.label || '',
      type: trussType.name,
      pattern: getWebPatternLabel(instanceGeometry.webPatternKey),
      quantity: copies.length,
      gableEnds: endFrames,
      span: metrics.span,
      pitchPercent: round(metrics.pitch || 0, 1),
      pitchDegrees: round(metrics.pitchDegrees || 0, 1),
      rise: metrics.rise,
      heelHeight: round(metrics.heelHeight || 0, 1),
      overallHeight: round(metrics.overallHeight || 0, 1),
      overhangStart: metrics.overhangStart,
      overhangEnd: metrics.overhangEnd,
      outToOut: metrics.outToOut,
      spacing: instance.spacing,
      topChord: memberSectionLabel(sizes.topChord),
      bottomChord: memberSectionLabel(sizes.bottomChord),
      web: memberSectionLabel(sizes.web),
    };
  });

  const purlinMm = geometry.instances.reduce(
    (sum, instanceGeometry) =>
      sum + (instanceGeometry.purlinSegments || []).reduce((total, segment) => total + segmentLength(segment), 0),
    0,
  );
  const closureAreaM2 = buildEndClosureLayout(trussSystem, geometry, options.roofSystem || null).totalAreaM2;
  const timberBySection = [...timber.values()]
    .map((entry) => ({ key: entry.key, label: entry.label, lengthM: entry.lengthMm / 1000 }))
    .sort((a, b) => b.lengthM - a.lengthM);

  return {
    rows,
    totals: {
      trussCount,
      gableEndCount,
      timberBySection,
      timberLm: timberBySection.reduce((sum, entry) => sum + entry.lengthM, 0),
      purlinLm: purlinMm / 1000,
      closureAreaM2,
    },
    cuttingList: [...cuts.values()].sort(
      (a, b) => a.member.localeCompare(b.member) || b.length - a.length || a.section.localeCompare(b.section),
    ),
  };
}

/** Takeoff figures for every truss system of a project (spec §7.5). */
export function buildProjectTrussQuantities(project) {
  const roofSystem = project?.roofSystem || null;
  const timber = new Map();
  let trussCount = 0;
  let purlinLm = 0;
  for (const trussSystem of project?.trussSystems || []) {
    const schedule = buildTrussSchedule(trussSystem, { roofSystem });
    trussCount += schedule.totals.trussCount;
    purlinLm += schedule.totals.purlinLm;
    for (const entry of schedule.totals.timberBySection) {
      const current = timber.get(entry.key) || { ...entry, lengthM: 0 };
      current.lengthM += entry.lengthM;
      timber.set(entry.key, current);
    }
  }
  return { trussCount, trussTimberLm: [...timber.values()], purlinLm };
}
