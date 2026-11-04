import { describe, expect, it } from 'vitest';
import { createProject } from '@/domain/models';
import { createTrussSystem } from '@/domain/trussModels';
import { deriveQuantityTakeoff } from '@/domain/quantityTakeoff';
import { buildProjectTrussQuantities, buildTrussSchedule, memberSectionLabel } from './trussSchedule';

// Fixture: the RT-2 gable — 7200 span, 1800 rise (50 %), 300 tails, five
// copies at 900 — with 90 × 35 chords, 70 × 35 webs and both ends infilled,
// so copies 0 and 4 are gable end frames (11 studs each).
function fixtureSystem(overrides = {}) {
  return createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: 'floor_1',
    baseElevation: 3000,
    purlinSystem: { enabled: true, spacing: 900, startOffset: 0, endOffset: 0, depth: 50, width: 75 },
    ...overrides,
    trussInstances: [
      {
        id: 'ti_1',
        trussTypeId: 'truss_type_gable',
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        overhangs: { start: 300, end: 300 },
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3600, y: 0 },
      },
    ],
  });
}

describe('buildTrussSchedule (spec §7.5)', () => {
  const schedule = buildTrussSchedule(fixtureSystem());

  it('lists one row per instance with its label, type, pattern and sizes', () => {
    expect(schedule.rows).toHaveLength(1);
    expect(schedule.rows[0]).toMatchObject({
      label: 'T1',
      type: 'Gable Truss',
      pattern: 'Fink',
      quantity: 5,
      gableEnds: 2,
      span: 7200,
      rise: 1800,
      pitchPercent: 50,
      pitchDegrees: 26.6,
      overhangStart: 300,
      overhangEnd: 300,
      spacing: 900,
      topChord: '90 × 35',
      bottomChord: '90 × 35',
      web: '70 × 35',
      outToOut: 7800,
    });
    expect(schedule.rows[0].heelHeight).toBeCloseTo(90 + 90 * Math.hypot(1, 0.5), 1);
  });

  it('totals the trusses, the timber by section, the purlins and the closures', () => {
    const { totals } = schedule;
    expect(totals.trussCount).toBe(5);
    expect(totals.gableEndCount).toBe(2);
    // Chords: per copy the bottom chord is 7200 and the top chord (centre-line,
    // tail to tail) 2 × 3900 × √1.25 → 5 × (7200 + 8720.67) = 79.60 m of 90 × 35.
    const chord = totals.timberBySection.find((entry) => entry.key === '90x35');
    expect(chord.lengthM).toBeCloseTo((5 * (7200 + 2 * 3900 * Math.hypot(1, 0.5))) / 1000, 1);
    const web = totals.timberBySection.find((entry) => entry.key === '70x35');
    expect(web.lengthM).toBeGreaterThan(0);
    expect(totals.timberLm).toBeCloseTo(chord.lengthM + web.lengthM, 6);
    // Purlins: 5 seats a slope, each run 4 bays of 900 → 10 × 3600.
    expect(totals.purlinLm).toBeCloseTo(36, 6);
    expect(totals.closureAreaM2).toBeGreaterThan(2 * 6.48);
  });

  it('cuts a list per member: count × length rounded up to 100', () => {
    const bottom = schedule.cuttingList.filter((cut) => cut.member === 'Bottom chord');
    // Fink: 3 panels of 7200 / 3 = 2400 on the three typical copies; the gable
    // end frames' bottom chords break at every stud (600).
    expect(bottom).toContainEqual(expect.objectContaining({ length: 2400, count: 9, section: '90 × 35' }));
    expect(bottom).toContainEqual(expect.objectContaining({ length: 600, count: 24 }));
    expect(schedule.cuttingList.every((cut) => cut.length % 100 === 0)).toBe(true);
    const studs = schedule.cuttingList.filter((cut) => cut.member === 'Gable stud');
    expect(studs.reduce((sum, cut) => sum + cut.count, 0)).toBe(22);
  });

  it('formats a section as depth × width', () => {
    expect(memberSectionLabel({ depth: 90, width: 35 })).toBe('90 × 35');
  });
});

describe('truss quantities in the takeoff (spec §7.5)', () => {
  it('adds the truss count, the timber per section and the purlin length', () => {
    const project = createProject('Trusses');
    project.trussSystems = [{ ...fixtureSystem(), floorId: project.floors[0].id }];
    const quantities = buildProjectTrussQuantities(project);
    expect(quantities.trussCount).toBe(5);
    expect(quantities.purlinLm).toBeCloseTo(36, 6);

    const takeoff = deriveQuantityTakeoff(project);
    const byId = (id) => takeoff.items.find((entry) => entry.id === id);
    expect(byId('truss_count')).toMatchObject({ category: 'roof', unit: 'ea', quantity: 5, rateKey: 'truss' });
    expect(byId('truss_timber_90x35')).toMatchObject({ unit: 'lm', rateKey: 'trussTimber' });
    expect(byId('truss_timber_70x35').quantity).toBeGreaterThan(0);
    expect(byId('truss_purlins').quantity).toBeCloseTo(36, 6);
  });
});
