import { describe, expect, it, vi } from 'vitest';
import { deserializeProject } from '@/persistence/deserialize';
import demoData from '@/pages/playground-demo.json';
import { buildPreviewScene } from './buildPreviewScene';

/*
 * The descriptor memo's extra key parts, each made observable.
 *
 * `buildPreviewScene.memo.test.js` proves the memo equal to a fresh build on
 * the playground — but there, nothing on the upper floor rides a stair below
 * and the truss has no gable closure, so three of the memo's checks could be
 * deleted without that test noticing. Here the builders are wrapped so each of
 * those inputs shows up in the objects: every floor's objects carry the stair
 * contexts they were given, every truss system's carry the roof they were
 * given. A memo that skipped any of its checks hands back an object built from
 * stale inputs, and the comparison with a fresh build fails.
 */

vi.mock('./objectBuilders', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildFloorPreviewObjects: (floor, options) => [
      ...actual.buildFloorPreviewObjects(floor, options),
      {
        id: `${floor.id}:stairs`,
        kind: 'probe',
        stairBases: (options.stairContexts || []).map((context) => context.baseElevation),
      },
    ],
  };
});

vi.mock('@/truss/endClosures', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildEndClosureObjects: (trussSystem, geometry, roofSystem) => [
      ...actual.buildEndClosureObjects(trussSystem, geometry, roofSystem),
      { id: `${trussSystem.id}:roof`, kind: 'probe', roofThickness: roofSystem?.slabThickness ?? null },
    ],
  };
});

const demoProject = () => deserializeProject(demoData).project;

describe('buildPreviewScene descriptor memo keys', () => {
  it('rebuilds every floor whose stair contexts moved with another floor’s elevation', () => {
    const memo = {};
    const project = demoProject();
    buildPreviewScene(project, { memo });
    // Floor 0 holds the stairs; raising it moves their base elevation, which
    // every floor's objects read — the upper floor's key does not change.
    const raised = {
      ...project,
      floors: project.floors.map((floor, index) =>
        index === 0 ? { ...floor, elevation: (floor.elevation || 0) + 150 } : floor,
      ),
    };
    expect(raised.floors[0].stairs.length).toBeGreaterThan(0);
    expect(buildPreviewScene(raised, { memo })).toEqual(buildPreviewScene(raised));
  });

  it('re-cuts a truss whose roof changed', () => {
    const memo = {};
    const project = demoProject();
    buildPreviewScene(project, { memo });
    const thicker = {
      ...project,
      roofSystems: project.roofSystems.map((roof) => ({ ...roof, slabThickness: (roof.slabThickness || 150) + 40 })),
    };
    expect(buildPreviewScene(thicker, { memo })).toEqual(buildPreviewScene(thicker));
  });

  it('re-tags a roof whose objects report a different floor', () => {
    // A roof on no truss system stands with the top storey and reports it, so
    // a storey added on top moves it without touching anything in its key.
    const memo = {};
    const demo = demoProject();
    const project = { ...demo, roofSystems: demo.roofSystems.map((roof) => ({ ...roof, trussAttachmentId: null })) };
    buildPreviewScene(project, { memo });
    const top = project.floors.at(-1);
    const added = {
      ...project,
      floors: [...project.floors, { ...top, id: 'floor_added', levelIndex: top.levelIndex + 1 }],
    };
    const roofId = project.roofSystems[0].id;
    const fresh = buildPreviewScene(added);
    expect(fresh.floors.find((floor) => floor.floorId === roofId).objects[0].metadata.floorId).toBe('floor_added');
    expect(buildPreviewScene(added, { memo })).toEqual(fresh);
  });
});
