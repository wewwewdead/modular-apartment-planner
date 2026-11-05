import { describe, expect, it } from 'vitest';
import { createTrussSystem } from '@/domain/trussModels';
import { buildTrussDetailScene, buildTrussPreviewObjects, buildTrussSystemGeometry } from './trussGeometry';

// Copies march along +x at 900 (five: 0 … 3600); each truss spans along +y.
function gableSystem(options = {}, instance = {}) {
  return createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: 'floor_1',
    baseElevation: 3000,
    ...options,
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
        ...instance,
      },
    ],
  });
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

describe('truss member descriptors (RT-3, spec §7.1)', () => {
  const descriptors = buildTrussPreviewObjects(gableSystem());
  const members = descriptors.filter((descriptor) => descriptor.metadata.memberType !== 'purlin');

  it('sizes every member from the system member sizes (AU 90 × 35, webs 70 × 35)', () => {
    for (const member of members) {
      const expected = member.metadata.memberType === 'web' ? { height: 70, width: 35 } : { height: 90, width: 35 };
      expect(member.crossSection).toEqual(expected);
    }
  });

  it('keeps the depth in the truss plane: up is square to the member and has no layout-axis part', () => {
    for (const member of members) {
      const direction = sub(member.end, member.start);
      expect(Math.abs(dot(direction, member.up))).toBeLessThan(1e-6);
      // The truss plane is x = const (copies along x): up has no x component.
      expect(Math.abs(member.up.x)).toBeLessThan(1e-9);
      expect(Math.hypot(member.up.x, member.up.y, member.up.z)).toBeCloseTo(1, 9);
    }
  });

  it('sits the bottom chord on the bearing: its centre-line is bc / 2 up', () => {
    const bottom = members.filter((member) => member.metadata.memberType === 'bottomChord');
    for (const member of bottom) {
      expect(member.start.y).toBeCloseTo(3045, 6);
      expect(member.end.y).toBeCloseTo(3045, 6);
    }
  });

  it('follows a preset change', () => {
    const heavy = buildTrussPreviewObjects(gableSystem({ memberSizes: { preset: 'au_120x45' } })).find(
      (descriptor) => descriptor.metadata.memberType === 'topChord',
    );
    expect(heavy.crossSection).toEqual({ height: 120, width: 45 });
  });
});

describe('purlin descriptors (RT-3, spec §7.4)', () => {
  const descriptors = buildTrussPreviewObjects(
    gableSystem({ purlinSystem: { enabled: true, spacing: 900, depth: 50, width: 75 } }),
  );
  const purlins = descriptors.filter((descriptor) => descriptor.metadata.memberType === 'purlin');

  it('rolls each purlin to its slope: up is the chord normal', () => {
    expect(purlins.length).toBeGreaterThan(0);
    const slope = Math.atan(0.5);
    for (const purlin of purlins) {
      // Purlins run along the layout axis (x).
      expect(Math.abs(purlin.up.x)).toBeLessThan(1e-9);
      expect(purlin.up.y).toBeCloseTo(Math.cos(slope), 6);
      expect(Math.abs(purlin.up.z)).toBeCloseTo(Math.sin(slope), 6);
      expect(purlin.crossSection).toEqual({ height: 50, width: 75 });
    }
  });
});

describe('gable end frames and labels (RT-3, spec §7.3, §7.5)', () => {
  it('draws the end copies of an infill-closed system with gable studs and labels them GE', () => {
    const geometry = buildTrussSystemGeometry(gableSystem());
    const copies = geometry.instances[0].copies;
    expect(copies.map((copy) => copy.label)).toEqual(['GE', 'T1', 'T1', 'T1', 'GE']);
    expect(copies[0].webPatternKey).toBe('gable_studs');
    expect(copies[1].webPatternKey).toBe('fink');
    const studs = copies[0].members.filter((member) => member.memberType === 'web');
    expect(studs).toHaveLength(11);
    expect(copies[2].members.filter((member) => member.memberType === 'web')).toHaveLength(4);
  });

  it('keeps the typical pattern at an open end', () => {
    const open = gableSystem({ endClosures: { start: { mode: 'open' } } });
    const copies = buildTrussSystemGeometry(open).instances[0].copies;
    expect(copies[0].label).toBe('T1');
    expect(copies[4].label).toBe('GE');
  });

  it('labels instances with the system prefix', () => {
    const system = createTrussSystem('Trusses', {
      id: 'ts_2',
      labelPrefix: 'RT',
      endClosures: { start: { mode: 'open' }, end: { mode: 'open' } },
      trussInstances: [
        { id: 'a', trussTypeId: 'truss_type_gable', count: 2, startPoint: { x: 0, y: 0 }, endPoint: { x: 1200, y: 0 } },
        {
          id: 'b',
          trussTypeId: 'truss_type_gable',
          count: 2,
          startPoint: { x: 0, y: 9000 },
          endPoint: { x: 1200, y: 9000 },
        },
      ],
    });
    const geometry = buildTrussSystemGeometry(system);
    expect(geometry.instances.map((entry) => entry.label)).toEqual(['RT1', 'RT2']);
  });
});

// RT-4 (spec §7.9.3.3): the copy geometry says which copies are step-down hip
// slices, so the purlin builder can stop its layout extension at them.
describe('hip slice flags (RT-4)', () => {
  it('flags the H copies of a hip and nothing else', () => {
    // Layout 0 → 12 000 at 1200: slices at 0 / 1200 / 2400 from each end
    // (span 7200, so the copies from 3600 to 8400 are full gables).
    const hip = gableSystem(
      {},
      { trussTypeId: 'truss_type_hip', rise: 900, spacing: 1200, count: 11, endPoint: { x: 12000, y: 0 } },
    );
    const copies = buildTrussSystemGeometry(hip).instances[0].copies;
    expect(copies.map((copy) => copy.label)).toEqual([
      'H1',
      'H2',
      'H3',
      'T1',
      'T1',
      'T1',
      'T1',
      'T1',
      'H3',
      'H2',
      'H1',
    ]);
    expect(copies.map((copy) => copy.isHipSlice)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it('never bridges a purlin across copies that do not carry it', () => {
    // The two H1 flat slices share their seat ids ('main_*'); nothing between
    // them carries those seats, so each is a plan marker, not a 12 m purlin
    // run under the whole roof.
    const hip = gableSystem(
      { purlinSystem: { enabled: true, depth: 50, width: 75, spacing: 900 } },
      { trussTypeId: 'truss_type_hip', rise: 900, spacing: 1200, count: 11, endPoint: { x: 12000, y: 0 } },
    );
    const instance = buildTrussSystemGeometry(hip).instances[0];
    const indexById = new Map(instance.copies.map((copy) => [copy.id, copy.index]));
    expect(instance.purlinSegments.length).toBeGreaterThan(0);
    for (const segment of instance.purlinSegments) {
      const [a, b] = segment.copyIds.map((id) => indexById.get(id));
      expect(b - a).toBe(1);
    }
    const flatSeats = instance.copies[0].purlinAttachments.map((attachment) => attachment.id);
    expect(flatSeats.length).toBeGreaterThan(0);
    expect(flatSeats.every((id) => id.startsWith('main_'))).toBe(true);
    for (const id of flatSeats) {
      const markers = instance.purlinMarkers.filter((marker) => marker.id.startsWith(`ti_1_${id}_marker`));
      expect(markers.map((marker) => marker.center.x)).toEqual([0, 12000]);
    }
  });

  it('never flags a gable copy or its GE end frames', () => {
    const copies = buildTrussSystemGeometry(gableSystem()).instances[0].copies;
    expect(copies.map((copy) => copy.label)).toEqual(['GE', 'T1', 'T1', 'T1', 'GE']);
    expect(copies.every((copy) => copy.isHipSlice === false)).toBe(true);
  });
});

describe('truss detail scene (RT-3, spec §7.5)', () => {
  it('draws members with their depth and tags the heel, overall height and sizes', () => {
    const scene = buildTrussDetailScene(gableSystem());
    const chord = scene.memberOutlines.find((outline) => outline.memberType === 'bottomChord');
    expect(chord.points).toHaveLength(4);
    const zs = chord.points.map((point) => point.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(90, 6);
    const labels = [
      ...scene.dimensions.map((figure) => figure.text?.value),
      ...scene.tags.flatMap((tag) => tag.textLines),
    ];
    expect(labels.some((label) => /^Heel 19[01]/.test(label))).toBe(true);
    expect(labels.some((label) => /^Overall 199[01]/.test(label))).toBe(true);
    expect(labels).toContain('90 × 35 TC');
    expect(labels).toContain('90 × 35 BC');
    expect(labels).toContain('70 × 35 W');
  });
});
