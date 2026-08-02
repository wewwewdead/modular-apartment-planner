import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import {
  createColumn,
  createDoor,
  createFloor,
  createProject,
  createRoom,
  createSectionCut,
  createSlab,
  createWall,
} from './models';
import { createSheet } from './sheetModels';
import { validateDocumentCoordination } from './documentValidation';
import { resolveSheetViewportSource } from '@/sheets/sources';

function rectangle(width, depth) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function makeDocumentedProject() {
  const project = createProject('Four-unit apartment');
  const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
  project.floors.push(upper);
  project.building.site.boundary = rectangle(12_000, 20_000);
  project.building.site.roadEdges = [{ edgeIndex: 0, roadName: 'Road' }];
  project.building.site.parkingPlan = {
    profile: {},
    bays: [
      {
        id: 'parking_1',
        name: 'Parking 1',
        origin: { x: 10_000, y: 3000 },
        width: 2500,
        length: 5000,
        angle: 0,
        location: 'open_site',
      },
    ],
    accessRoutes: [
      {
        id: 'access_1',
        name: 'Access',
        roadEdgeIndex: 0,
        clearWidth: 3000,
        points: [
          { x: 10_000, y: 0 },
          { x: 10_000, y: 3000 },
        ],
        servedBayIds: ['parking_1'],
      },
    ],
  };
  for (const floor of project.floors) {
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 8000, y: 0 }), id: `${floor.id}_wall` };
    floor.walls = [wall];
    floor.rooms = [{ ...createRoom('Apartment', rectangle(8000, 6000)), id: `${floor.id}_room` }];
    floor.doors = [{ ...createDoor(wall.id, 1200), id: `${floor.id}_door` }];
    floor.columns = [{ ...createColumn(0, 0), id: `${floor.id}_column` }];
    floor.slabs = [createSlab(floor.id, rectangle(8000, 6000))];
  }
  project.floors[0].sectionCuts = [
    { ...createSectionCut({ x: -1000, y: 3000 }, { x: 9000, y: 3000 }), id: 'section_1' },
  ];
  project.roofSystem = {
    id: 'roof_1',
    roofType: 'flat',
    boundaryPolygon: rectangle(8000, 6000),
    finishSlope: 1,
    roofPlanes: [],
    roofEdges: [],
    drains: [
      {
        id: 'roof_drain_1',
        name: 'Roof drain',
        position: { x: 2000, y: 2000 },
        diameter: 100,
        catchmentPlaneIds: [],
        outletRef: { kind: 'site_discharge', id: 'site_outlet', point: { x: 0, y: 2000 } },
        routePoints: [
          { x: 2000, y: 2000 },
          { x: 0, y: 2000 },
        ],
      },
    ],
    roofOpenings: [],
  };
  return project;
}

describe('preliminary document package', () => {
  it('derives requirement readiness and coordinated report content', () => {
    const project = makeDocumentedProject();
    const manifest = derivePreliminaryPackage(project);
    expect(manifest.totalDeliverableCount).toBe(15);
    expect(manifest.missingDeliverables).toEqual([]);
    expect(manifest.sheets.map((sheet) => sheet.number)).toEqual(
      expect.arrayContaining([
        'G-001',
        'A-001',
        'A-101',
        'A-102',
        'A-201',
        'A-202',
        'A-301',
        'A-401',
        'Q-001',
        'G-002',
      ]),
    );
    expect(manifest.sheets.every((sheet) => sheet.packageKind === 'apartment_alpha_preliminary')).toBe(true);
    expect(manifest.sheets.every((sheet) => sheet.notes.some((note) => note.includes('PROFESSIONAL REVIEW')))).toBe(
      true,
    );

    const quantityReport = buildBuildingReport(project, 'quantity_summary');
    expect(quantityReport.title).toContain('Quantity');
    expect(quantityReport.rows.some((row) => row[0] === 'Structural concrete')).toBe(true);
    const validationReport = buildBuildingReport(project, 'validation');
    expect(validationReport.notes.some((note) => note.includes('engineer-verified'))).toBe(true);

    const siteSheet = manifest.sheets.find((sheet) => sheet.number === 'A-001');
    const reportSheet = manifest.sheets.find((sheet) => sheet.number === 'G-001');
    expect(resolveSheetViewportSource(project, siteSheet.viewports[0])).toMatchObject({ kind: 'site_plan' });
    expect(resolveSheetViewportSource(project, reportSheet.viewports[0])).toMatchObject({
      kind: 'building_report',
      report: { title: 'Project Basis and Design Assumptions' },
    });
  });

  it('generates stable sheets idempotently, preserves user sheets, and detects stale generated output', () => {
    const project = makeDocumentedProject();
    const userSheet = { ...createSheet('User Detail'), id: 'user_sheet' };
    project.sheets = [userSheet];
    const command = {
      type: BUILDING_COMMANDS.GENERATE_PRELIMINARY_DRAWING_PACKAGE,
      packageId: 'alpha',
    };
    const generated = executeBuildingCommand(project, command);
    expect(generated.ok).toBe(true);
    expect(generated.project.sheets).toContainEqual(expect.objectContaining({ id: 'user_sheet' }));
    const firstIds = generated.project.sheets.filter((sheet) => sheet.packageId === 'alpha').map((sheet) => sheet.id);
    expect(firstIds.length).toBeGreaterThan(8);
    expect(derivePreliminaryPackage(generated.project)).toMatchObject({
      generatedSheetCount: firstIds.length,
      currentGeneratedSheetCount: firstIds.length,
      outOfDate: false,
    });

    const repeated = executeBuildingCommand(generated.project, command);
    const repeatedIds = repeated.project.sheets.filter((sheet) => sheet.packageId === 'alpha').map((sheet) => sheet.id);
    expect(repeatedIds).toEqual(firstIds);
    expect(repeated.project.sheets.filter((sheet) => sheet.id === 'user_sheet')).toHaveLength(1);

    const changed = {
      ...repeated.project,
      floors: repeated.project.floors.map((floor, index) =>
        index === 0
          ? {
              ...floor,
              walls: floor.walls.map((wall) => ({ ...wall, end: { ...wall.end, x: wall.end.x + 100 } })),
            }
          : floor,
      ),
    };
    expect(derivePreliminaryPackage(changed).outOfDate).toBe(true);
    expect(validateDocumentCoordination(changed)).toContainEqual(
      expect.objectContaining({ ruleId: 'DOC.GENERATED_PACKAGE_OUTDATED' }),
    );
  });
});
