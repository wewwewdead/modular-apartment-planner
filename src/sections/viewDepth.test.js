import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createSectionCut, createStair, createWall } from '@/domain/models';
import { getSectionDepthMode } from '@/domain/sectionModels';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { buildProjectSectionScene, buildSectionScene } from './scene';
import { resolveSectionViewDepth } from './viewDepth';
import { getVisibleSectionDrawables } from './visibility';

function diagonalFixture() {
  const ground = createFloor('Ground', 0);
  const upper = createFloor('Upper', 1, { elevation: 3000 });
  // Two opposed flights 1.7–3.8 m beyond an oblique cut: the old 2 m default
  // retained just a few treads, even though the rest belonged to the same flight.
  ground.stairs = [createStair({ x: -3094, y: -3737 }, 1000, 8, 175, 260, { angle: -50.79 })];
  upper.stairs = [createStair({ x: -2386, y: -5810 }, 1000, 8, 175, 245, { angle: 129.29 })];
  const cut = createSectionCut({ x: -10319, y: -7329 }, { x: 628, y: 1409 }, { direction: -1 });
  ground.sectionCuts = [cut];
  return { floors: [ground, upper] };
}

describe('section viewing depth', () => {
  it('defaults new and legacy default cuts to full depth, while preserving explicit limits', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 6000, y: 0 };
    expect(getSectionDepthMode(createSectionCut(a, b))).toBe('full');
    expect(getSectionDepthMode({ depth: 2000 })).toBe('full');
    expect(getSectionDepthMode({ depth: 4500 })).toBe('limited');
    expect(getSectionDepthMode(createSectionCut(a, b, { depth: 2000 }))).toBe('limited');
    expect(getSectionDepthMode({ depth: 2000, depthMode: 'limited' })).toBe('limited');
  });

  it('includes every tread of both diagonal flights and identifies a partial depth crop', () => {
    const project = diagonalFixture();
    const ground = project.floors[0];
    const cut = ground.sectionCuts[0];
    const full = buildProjectSectionScene(project, ground.id);
    expect(full.viewDepth.depth).toBeGreaterThan(3700);
    expect(Number.isFinite(full.viewDepth.depth)).toBe(true);
    expect(full.viewDepth.stairs.clippedByDepth).toBe(0);
    for (const floor of project.floors) {
      const stair = floor.stairs[0];
      const faces = full.rectElements.filter((element) => element.sourceId === stair.id);
      expect(new Set(faces.map((element) => element.top)).size).toBe(8);
      expect(getVisibleSectionDrawables(full).some((element) => element.sourceId === stair.id)).toBe(true);
    }
    ground.sectionCuts = [{ ...cut, depthMode: 'limited', depth: 2000 }];
    const limited = buildProjectSectionScene(project, ground.id);
    expect(limited.viewDepth.stairs.clippedByDepth).toBe(2);
    expect(limited.rectElements.length).toBeLessThan(full.rectElements.length);
    ground.sectionCuts = [{ ...cut, depthMode: undefined, depth: 2000 }];
    expect(buildProjectSectionScene(project, ground.id).rectElements).toEqual(full.rectElements);
  });

  it('automatically extends to model edits while respecting cut direction and width', () => {
    const floor = createFloor('Ground', 0);
    const cut = createSectionCut({ x: 0, y: 0 }, { x: 6000, y: 0 });
    floor.stairs = [createStair({ x: 1000, y: 4000 }, 1000, 8)];
    const original = resolveSectionViewDepth([floor], cut).depth;
    floor.stairs[0].startPoint.y += 7000;
    const deeper = buildSectionScene(floor, cut);
    expect(deeper.viewDepth.depth).toBe(original + 7000);
    expect(deeper.rectElements.some((element) => element.category === 'stair')).toBe(true);
    const reversed = buildSectionScene(floor, { ...cut, direction: -1 });
    expect(reversed.viewDepth.stairs.behindCut).toBe(1);
    expect(reversed.rectElements).toHaveLength(0);
    floor.stairs[0].startPoint.x = 10000;
    const outside = buildSectionScene(floor, cut);
    expect(outside.viewDepth.stairs.outsideWidth).toBe(1);
    expect(outside.rectElements).toHaveLength(0);
  });

  it('keeps opaque walls in front of distant stairs', () => {
    const floor = createFloor('Ground', 0);
    const cut = createSectionCut({ x: 0, y: 0 }, { x: 6000, y: 0 });
    floor.stairs = [createStair({ x: 1000, y: 4000 }, 1000, 8)];
    floor.walls = [createWall({ x: 0, y: 1000 }, { x: 6000, y: 1000 }, 200, { height: 3000 })];
    const scene = buildSectionScene(floor, cut);
    expect(scene.rectElements.some((element) => element.category === 'stair')).toBe(true);
    expect(getVisibleSectionDrawables(scene).some((element) => element.category === 'stair')).toBe(false);
  });

  it('preserves both depth modes and the numeric limit across saving and loading', () => {
    const project = createProject();
    project.floors[0].sectionCuts = ['full', 'limited'].map((depthMode) =>
      createSectionCut({ x: 0, y: 0 }, { x: 6000, y: 0 }, { depthMode, depth: 4200 }),
    );
    const restored = deserializeProject(JSON.parse(JSON.stringify(serializeProject(project)))).project;
    expect(restored.floors[0].sectionCuts.map(({ depthMode, depth }) => ({ depthMode, depth }))).toEqual([
      { depthMode: 'full', depth: 4200 },
      { depthMode: 'limited', depth: 4200 },
    ]);
  });
});
