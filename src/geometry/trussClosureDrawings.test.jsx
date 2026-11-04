/**
 * Gable-end closures in the 2D drawings (docs/roof-truss-industrial.md §6.2):
 * a filled polygon on the front elevation, a cut band in section, and a
 * footprint in the Truss-mode plan.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject, createSectionCut } from '@/domain/models';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem } from '@/domain/trussModels';
import { buildProjectElevationScene } from '@/elevations/scene';
import { getVisibleElevationDrawables } from '@/elevations/visibility';
import { buildProjectSectionScene } from '@/sections/scene';
import TrussRenderer from '@/features/floorplan/components/renderers/TrussRenderer';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';

const BASE = 3000;

// Copies march along +y (End A at y = 0, End B at y = 3600); each truss spans
// along x, centred on x = 0, so the front elevation (looking along +y) sees
// End A square on.
function fixture({ sectionCut = null } = {}) {
  const base = createProject('Gable closure');
  const ground = { ...base.floors[0], sectionCuts: sectionCut ? [sectionCut] : [] };
  const trussSystem = createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: ground.id,
    baseElevation: BASE,
    trussInstances: [
      {
        id: 'ti_1',
        trussTypeId: 'truss_type_gable',
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 0, y: 3600 },
      },
    ],
  });
  const project = { ...base, floors: [ground], trussSystems: [trussSystem] };
  project.roofSystem = createRoofSystemForProject(project, { id: 'roof_1' });
  return { project, ground };
}

function ridgeUnderside(project) {
  return buildRoofPlaneGeometry(project.roofSystem).getSurfaceElevation({ x: 0, y: 0 }, 'bottom');
}

describe('gable closures in elevation', () => {
  it('draws a gableInfill polygon on the front elevation whose apex is the roof ridge underside', () => {
    const { project, ground } = fixture();
    expect(project.roofSystem?.trussAttachmentId).toBe('ts_1');
    const scene = buildProjectElevationScene(project, ground.id, 'elevation_front');
    const closures = scene.polygonElements.filter((element) => element.category === 'gableInfill');
    expect(closures.map((element) => element.side).sort()).toEqual(['end', 'start']);

    const front = closures.find((element) => element.side === 'start');
    const apex = Math.max(...front.points.map((point) => point.z));
    expect(apex).toBeCloseTo(ridgeUnderside(project), 3);
    expect(apex).toBeGreaterThan(BASE + 1800);
    expect(Math.min(...front.points.map((point) => point.z))).toBeCloseTo(BASE, 6);
    expect(front.systemId).toBe('ts_1');

    // End A is in front and still drawn; End B sits wholly behind it.
    const drawn = getVisibleElevationDrawables(scene).filter((element) => element.category === 'gableInfill');
    expect(drawn.map((element) => element.side)).toEqual(['start']);
  });

  it('leaves the end truss members drawn over the infill on its own plane', () => {
    const { project, ground } = fixture();
    const scene = buildProjectElevationScene(project, ground.id, 'elevation_front');
    const chords = getVisibleElevationDrawables(scene).filter(
      (element) => element.shape === 'line' && element.style === 'trussChord',
    );
    expect(chords.length).toBeGreaterThan(0);
  });

  it('draws nothing for an open gable, and nothing on a side elevation that sees it edge-on', () => {
    const { project, ground } = fixture();
    const open = {
      ...project,
      trussSystems: project.trussSystems.map((entry) => ({
        ...entry,
        endClosures: { ...entry.endClosures, start: { mode: 'open' }, end: { mode: 'open' } },
      })),
    };
    const openScene = buildProjectElevationScene(open, ground.id, 'elevation_front');
    expect(openScene.polygonElements.some((element) => element.category === 'gableInfill')).toBe(false);

    const side = buildProjectElevationScene(project, ground.id, 'elevation_left');
    expect(side.polygonElements.some((element) => element.category === 'gableInfill')).toBe(false);
  });

  it('outlines an enabled vent on the infill', () => {
    const { project, ground } = fixture();
    const vented = {
      ...project,
      trussSystems: project.trussSystems.map((entry) => ({
        ...entry,
        endClosures: { ...entry.endClosures, start: { vent: { enabled: true } } },
      })),
    };
    const scene = buildProjectElevationScene(vented, ground.id, 'elevation_front');
    expect(scene.lineElements.filter((element) => element.style === 'gableVent')).toHaveLength(4);
  });
});

describe('gable closures in section', () => {
  it('cuts a band through each closure the section crosses, up to the closure top edge', () => {
    const cut = createSectionCut({ x: 0, y: -1000 }, { x: 0, y: 5000 }, { label: 'A-A' });
    const { project, ground } = fixture({ sectionCut: cut });
    const scene = buildProjectSectionScene(project, ground.id, cut.id);
    const bands = scene.polygonElements.filter((element) => element.category === 'gableInfill');
    expect(bands).toHaveLength(2);
    for (const band of bands) {
      expect(band.renderMode).toBe('cut');
      expect(band.id.startsWith('closure-')).toBe(true);
      expect(Math.min(...band.points.map((point) => point.z))).toBeCloseTo(BASE, 6);
      // The cut runs along the ridge line, so the band reaches the ridge underside.
      expect(Math.max(...band.points.map((point) => point.z))).toBeCloseTo(ridgeUnderside(project), 0);
    }
  });
});

describe('gable closures in plan', () => {
  it('draws each closure footprint in the Truss-mode plan', () => {
    const { project, ground } = fixture();
    const markup = renderToStaticMarkup(
      <svg>
        <TrussRenderer floor={ground} trussSystems={project.trussSystems} roofSystem={project.roofSystem} />
      </svg>,
    );
    expect(markup).toContain('data-truss-closure="start"');
    expect(markup).toContain('data-truss-closure="end"');
  });

  it('tags every copy on the layout plan and notes the spacing (RT-3, spec §7.5)', () => {
    const { project, ground } = fixture();
    const markup = renderToStaticMarkup(
      <svg>
        <TrussRenderer floor={ground} trussSystems={project.trussSystems} roofSystem={project.roofSystem} />
      </svg>,
    );
    // Both ends are infilled, so the end copies are gable end frames.
    expect(markup.match(/data-truss-label="GE"/g)).toHaveLength(2);
    expect(markup.match(/data-truss-label="T1"/g)).toHaveLength(3);
    expect(markup).toContain('5 @ 900 = 3600');
  });
});
