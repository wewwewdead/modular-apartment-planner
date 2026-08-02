import { describe, expect, it } from 'vitest';
import { createProject, createRoom, createSlab } from './models';
import {
  AREA_PROVENANCE,
  deriveAreaLedger,
  deriveBuildableEnvelope,
  isConvexPolygon,
  isSimplePolygon,
  validateSiteCoordination,
} from './siteModels';

const rectangle = [
  { x: 0, y: 0 },
  { x: 10000, y: 0 },
  { x: 10000, y: 20000 },
  { x: 0, y: 20000 },
];

function configuredSite(boundary = rectangle) {
  return {
    boundaryId: 'property_1',
    boundary,
    edgeSetbacks: [
      { edgeIndex: 0, distance: 3000, classification: 'front' },
      { edgeIndex: 1, distance: 1000, classification: 'side' },
      { edgeIndex: 2, distance: 2000, classification: 'rear' },
      { edgeIndex: 3, distance: 1000, classification: 'side' },
    ],
  };
}

describe('site geometry', () => {
  it('recognizes simple convex and invalid self-intersecting polygons', () => {
    expect(isSimplePolygon(rectangle)).toBe(true);
    expect(isConvexPolygon(rectangle)).toBe(true);
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 10000, y: 10000 },
        { x: 0, y: 10000 },
        { x: 10000, y: 0 },
      ]),
    ).toBe(false);
  });

  it('derives a checked convex buildable envelope from per-edge setbacks', () => {
    const result = deriveBuildableEnvelope(configuredSite());
    expect(result.status).toBe('checked');
    expect(result.points).toHaveLength(4);
    expect(result.points).toEqual(
      expect.arrayContaining([
        { x: 1000, y: 3000 },
        { x: 9000, y: 3000 },
        { x: 9000, y: 18000 },
        { x: 1000, y: 18000 },
      ]),
    );
  });

  it('requires manual confirmation for concave-lot setback envelopes', () => {
    const result = deriveBuildableEnvelope({
      boundary: [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
        { x: 10000, y: 4000 },
        { x: 5000, y: 4000 },
        { x: 5000, y: 10000 },
        { x: 0, y: 10000 },
      ],
      edgeSetbacks: [],
    });
    expect(result).toMatchObject({ status: 'manual_required', points: [] });
  });
});

describe('site feasibility ledger and validation', () => {
  it('labels every area by its calculation provenance', () => {
    const project = createProject('Ledger');
    project.building.site = { ...project.building.site, ...configuredSite() };
    project.floors[0].slabs = [
      createSlab(project.floors[0].id, [
        { x: 1000, y: 3000 },
        { x: 9000, y: 3000 },
        { x: 9000, y: 13000 },
        { x: 1000, y: 13000 },
      ]),
    ];
    const room = createRoom('Unit A', [
      { x: 1000, y: 3000 },
      { x: 5000, y: 3000 },
      { x: 5000, y: 13000 },
      { x: 1000, y: 13000 },
    ]);
    room.useCategory = 'rentable';
    project.floors[0].rooms = [room];

    const ledger = deriveAreaLedger(project);
    expect(ledger.lotArea).toMatchObject({ value: 200000000, provenance: AREA_PROVENANCE.EXACT_GEOMETRY });
    expect(ledger.buildableArea).toMatchObject({
      value: 120000000,
      provenance: AREA_PROVENANCE.CONFIGURED_DERIVATION,
    });
    expect(ledger.grossFloorArea.value).toBe(80000000);
    expect(ledger.netRentableArea.value).toBe(40000000);
    expect(ledger.efficiencyRatio.value).toBe(0.5);
  });

  it('reports ground-floor geometry outside the configured envelope with measured evidence', () => {
    const project = createProject('Outside');
    project.building.site = { ...project.building.site, ...configuredSite() };
    project.floors[0].slabs = [
      {
        id: 'slab_outside',
        boundaryPoints: [
          { x: 0, y: 0 },
          { x: 5000, y: 0 },
          { x: 5000, y: 5000 },
          { x: 0, y: 5000 },
        ],
      },
    ];

    const issues = validateSiteCoordination(project);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'SITE.GROUND_SLAB_OUTSIDE_BUILDABLE_ENVELOPE',
      category: 'site_feasibility',
      severity: 'error',
      professionalReviewRequired: true,
      evidence: { confidence: 'checked' },
    });
    expect(issues[0].evidence.inputs.outsideArea).toBeGreaterThan(0);
  });
});
