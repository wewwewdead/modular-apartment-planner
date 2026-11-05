import { describe, expect, it } from 'vitest';
import demoData from '@/pages/playground-demo.json';
import { syncProjectStructures } from '@/domain/projectStateHelpers';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { deserializeProject } from '@/persistence/deserialize';
import { measurePurlins, measureTopChords } from './roofSeating.fixtures';
import { projectPointOntoAxis, resolveSystemPlanAxes } from './systemPlanAxes';

// RT-4 (spec §7.9.4): the playground opens with its hip roof following the
// trusses (`pitchSource 'truss'`, migrated offset 0) and every copy seated —
// on a system rotated 359.6° in plan, so every check works in the
// TRANSFORMED frame. Hip 1600 over 5050 (31.684 %), tails 300 / 300, 90-deep
// chords, 50-deep purlins, roof overhang 510, 7 copies at 1950.
describe('the playground hip roof seats on its trusses (RT-4)', () => {
  const TOLERANCE = 0.5;
  const TOP_CHORD_DEPTH = 90;
  const PURLIN_DEPTH = 50;

  const { project: loaded } = deserializeProject(demoData);
  const project = syncProjectStructures(loaded);
  const roofSystem = project.roofSystem;
  const trussSystem = project.trussSystems.find((entry) => entry.id === roofSystem.trussAttachmentId);
  const trussGeometry = buildTrussSystemGeometry(trussSystem);
  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const instanceGeometry = trussGeometry.instances[0];
  const ratio = instanceGeometry.metrics.rise / (instanceGeometry.metrics.span / 2);
  const secant = Math.hypot(1, ratio);
  const slopedGap = PURLIN_DEPTH * secant; // 52.45
  const flatGap = (TOP_CHORD_DEPTH + PURLIN_DEPTH) * secant - TOP_CHORD_DEPTH; // 56.86
  const planAxes = resolveSystemPlanAxes(trussGeometry);
  const along = (point) => projectPointOntoAxis(point, planAxes.origin, planAxes.layoutAxis);
  const across = (point) => projectPointOntoAxis(point, planAxes.origin, planAxes.spanAxis);
  const lineStart = along(instanceGeometry.layoutLineStartPoint);
  const lineEnd = along(instanceGeometry.supportLineEndPoint);

  it('follows the trusses: slope, offset and base from the datum', () => {
    expect(roofSystem.roofType).toBe('hip');
    expect(roofSystem.pitchSource).toBe('truss');
    expect(roofSystem.pitch.slope).toBeCloseTo(31.684, 2);
    expect(Math.abs(roofSystem.pitch.slope - ratio * 100)).toBeLessThan(1e-6);
    expect(roofSystem.attachmentOffset).toBe(0);
    // base + bc + (tc + pd) / cos θ at the heel, run down the tail and the
    // roof overhang: 6000 + 90 + 140 · sec θ − ratio · (300 + 510).
    expect(trussSystem.baseElevation).toBe(6000);
    expect(roofSystem.baseElevation).toBeCloseTo(6000 + 90 + 140 * secant - ratio * 810, 6);
    expect(Math.abs(roofSystem.baseElevation - 5980.22)).toBeLessThan(TOLERANCE);
  });

  it('builds the outline in the rotated frame: the support line ± (300 + 510), the tail tips ± 510', () => {
    expect(trussSystem.planRotationOffsetDegrees).toBeCloseTo(359.6, 1);
    const alongValues = roofGeometry.roofOutline.map(along);
    expect(Math.min(...alongValues)).toBeCloseTo(lineStart - 810, 6);
    expect(Math.max(...alongValues)).toBeCloseTo(lineEnd + 810, 6);
    const copy = instanceGeometry.copies[0];
    const acrossValues = roofGeometry.roofOutline.map(across);
    const tailTips = [across(copy.overallStartPoint), across(copy.overallEndPoint)];
    expect(Math.min(...acrossValues)).toBeCloseTo(Math.min(...tailTips) - 510, 6);
    expect(Math.max(...acrossValues)).toBeCloseTo(Math.max(...tailTips) + 510, 6);
  });

  it('seats all 7 copies: sloped runs at 50 · sec θ, flat tops at 140 · sec θ − 90', () => {
    const copies = instanceGeometry.copies;
    expect(copies.map((copy) => copy.label)).toEqual(['H2', 'H4', 'H6', 'T1', 'H5', 'H3', 'H1']);
    const kinds = { sloped: 0, flat: 0, kink: 0, levelTail: 0 };
    for (const copy of copies) {
      const measured = measureTopChords(roofGeometry, copy, {
        ratio,
        span: instanceGeometry.metrics.span,
        topChordDepth: TOP_CHORD_DEPTH,
      });
      for (const entry of measured) {
        kinds[entry.kind] += 1;
        const expected = entry.kind === 'flat' ? flatGap : slopedGap;
        for (const { gap } of entry.samples) expect(Math.abs(gap - expected)).toBeLessThan(TOLERANCE);
      }
    }
    // RT-4.1 (spec §7.10): every slice chord breaks at its crown, and the last
    // copy — 0.025 mm inside the line end (137.4 + 6 × 1950 against an
    // 11 837.42 line) — is a flat slice, not a sliver.
    expect(kinds.kink).toBe(0);
    expect(kinds.levelTail).toBe(0);
    expect(kinds.sloped).toBeGreaterThan(30);
    expect(kinds.flat).toBeGreaterThan(20);
  });

  it('seats all 26 purlin segments on the roof underside', () => {
    expect(trussGeometry.purlinSegments).toHaveLength(26);
    for (const { gap } of measurePurlins(roofGeometry, trussGeometry.purlinSegments)) {
      expect(Math.abs(gap)).toBeLessThan(TOLERANCE);
    }
  });
});
