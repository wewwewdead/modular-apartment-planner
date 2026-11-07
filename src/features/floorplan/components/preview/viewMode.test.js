import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PALETTE_LOOKS, createMaterialPalette, ghostMaterialFor, ghostMaterialsOf } from './materials';
import { createWallAssembly, wallAssemblyThickness } from '@/domain/wallAssemblies';
import { createWallDetailing } from '@/domain/wallDetailing';
import { createPreviewSceneCache } from './previewSceneCache';
import { createCollisionIndex } from './previewCollisionIndex';
import { SOURCE_ONLY_LAYER } from './previewBatching';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { deserializeProject } from '@/persistence/deserialize';
import demoData from '@/pages/playground-demo.json';
import { RENDER_STYLES, renderStyleConfig } from './renderStyle';
import {
  DEFAULT_VIEW_MODE,
  GHOST_OPACITY,
  MATERIAL_TIERS,
  VIEW_MODES,
  VIEW_MODE_COPY,
  applyViewModeToWorld,
  choosePickTarget,
  effectiveRenderStyle,
  imageFileSuffix,
  isSeeThrough,
  nextViewMode,
  outlineOpacityFor,
  paletteOpacities,
  tierOf,
  viewModePolicy,
} from './viewMode';

/**
 * The see-through modes against real THREE: the tier table against the real
 * palette, and the world traversal against a real playground build — what a
 * mesh holds, whether it casts, and what it must never have touched.
 */

function playgroundBuild() {
  const palette = createMaterialPalette();
  const cache = createPreviewSceneCache();
  const { project } = deserializeProject(demoData);
  const built = cache.build(buildPreviewScene(project, {}), palette);
  return { palette, cache, project, ...built };
}

/** Every mesh's material, shadow flag and visibility, by identity. */
function snapshotMeshes(...roots) {
  const rows = new Map();
  for (const root of roots) {
    root.traverse((node) => {
      rows.set(node, { material: node.material, castShadow: node.castShadow, visible: node.visible });
    });
  }
  return rows;
}

describe('view modes — the tier table', () => {
  it('gives every material in both palette looks a tier', () => {
    for (const look of Object.values(PALETTE_LOOKS)) {
      const palette = createMaterialPalette({ look });
      const missing = Object.entries(palette)
        .filter(([, value]) => value?.isMaterial)
        .filter(([key]) => !MATERIAL_TIERS[key])
        .map(([key]) => key);
      expect(missing).toEqual([]);
    }
  });

  it('reads the tier off the material, aliases included', () => {
    const palette = createMaterialPalette();
    expect(tierOf(palette.wall)).toBe('skin');
    expect(tierOf(palette.slab)).toBe('deck');
    expect(tierOf(palette.column)).toBe('structure');
    expect(tierOf(palette.stair)).toBe('structure');
    expect(tierOf(palette.fixture_sofa)).toBe('contents');
    expect(tierOf(palette.window)).toBe('glazing');
    expect(tierOf(palette.systemWater)).toBe('systems');
    expect(tierOf(palette.windowGlow)).toBe('glow');
    expect(tierOf(palette.outline)).toBe('outline');
    // The aliases are the same instances and keep their first key.
    expect(palette.roof.userData.paletteKey).toBe('roof_slab');
    expect(palette.roofGutter.userData.paletteKey).toBe('roofTrim');
    expect(tierOf(palette.roof)).toBe('skin');
    expect(tierOf(new THREE.MeshStandardMaterial())).toBeNull();
  });
});

describe('view modes — policies', () => {
  it('ghosts the skin and the slabs in X-ray and leaves structure and contents solid', () => {
    expect(viewModePolicy('xray', 'skin')).toMatchObject({
      ghost: true,
      opacity: GHOST_OPACITY.xray.skin,
      castShadow: false,
    });
    expect(viewModePolicy('xray', 'deck')).toMatchObject({
      ghost: true,
      opacity: GHOST_OPACITY.xray.deck,
      castShadow: false,
    });
    expect(viewModePolicy('xray', 'structure')).toMatchObject({ ghost: false, castShadow: true });
    expect(viewModePolicy('xray', 'contents')).toMatchObject({ ghost: false, castShadow: true });
    // The deck stays more present than the skin, so the storeys still read.
    expect(GHOST_OPACITY.xray.deck).toBeGreaterThan(GHOST_OPACITY.xray.skin);
  });

  it("ghosts a framed wall's fallback core, fainter than the skin, and nothing of it in Solid", () => {
    // The core stands in for studs but is not studs (§12): it ghosts with the
    // boards either side of it, below the skin's α because a frame covers only
    // a fraction of the wall. Since §13 it is drawn only for a framed wall with
    // no derivable members, but the tier stays for that fallback.
    const palette = createMaterialPalette();
    expect(tierOf(palette.wallCoreSteel)).toBe('core');
    expect(tierOf(palette.wallCoreTimber)).toBe('core');
    expect(tierOf(palette.wallFramingSteel)).toBe('structure');
    expect(tierOf(palette.wallFramingTimber)).toBe('structure');

    expect(viewModePolicy('xray', 'core')).toMatchObject({
      ghost: true,
      opacity: GHOST_OPACITY.xray.core,
      castShadow: false,
      hidden: false,
    });
    expect(GHOST_OPACITY.xray.core).toBeGreaterThanOrEqual(0.06);
    expect(GHOST_OPACITY.xray.core).toBeLessThanOrEqual(0.08);
    expect(GHOST_OPACITY.xray.core).toBeLessThan(GHOST_OPACITY.xray.skin);
    expect(viewModePolicy('wireframe', 'core')).toMatchObject({ ghost: true, opacity: 0.05, castShadow: false });
    expect(viewModePolicy('solid', 'core')).toMatchObject({ ghost: false, opacity: null, castShadow: true });
  });

  it('ghosts everything to a faint fill in Wireframe', () => {
    for (const tier of ['skin', 'deck', 'core', 'structure', 'contents']) {
      const policy = viewModePolicy('wireframe', tier);
      expect(policy.ghost).toBe(true);
      expect(policy.opacity).toBeGreaterThanOrEqual(0.04);
      expect(policy.opacity).toBeLessThanOrEqual(0.08);
      expect(policy.castShadow).toBe(false);
    }
  });

  it('changes nothing in Solid', () => {
    for (const tier of new Set(Object.values(MATERIAL_TIERS))) {
      const policy = viewModePolicy('solid', tier);
      expect(policy.ghost).toBe(false);
      expect(policy.hidden).toBe(false);
      expect(policy.castShadow).toBe(true);
      if (policy.opacityScale !== null) expect(policy.opacityScale).toBe(1);
    }
  });

  it('scales the glass down, thickens the service runs, and hides the window glow', () => {
    expect(viewModePolicy('xray', 'glazing').opacityScale).toBe(0.4);
    expect(viewModePolicy('wireframe', 'glazing').opacityScale).toBe(0.15);
    expect(viewModePolicy('xray', 'systems')).toMatchObject({ opacityScale: 1.4, opacityCap: 0.95 });
    expect(viewModePolicy('xray', 'glow').hidden).toBe(true);
    expect(viewModePolicy('wireframe', 'glow').hidden).toBe(true);
    expect(viewModePolicy('solid', 'glow').hidden).toBe(false);
    expect([outlineOpacityFor('solid'), outlineOpacityFor('xray'), outlineOpacityFor('wireframe')]).toEqual([
      0.7, 0.5, 0.9,
    ]);
  });

  it('turns ambient occlusion off and outlines on, and nothing else', () => {
    const realistic = renderStyleConfig(RENDER_STYLES.REALISTIC);
    expect(effectiveRenderStyle(realistic, 'solid')).toBe(realistic);
    const xray = effectiveRenderStyle(realistic, 'xray');
    expect(xray).toEqual({ ...realistic, ambientOcclusion: false, outlines: true });
    expect(realistic.ambientOcclusion).toBe(true);
    expect(realistic.outlines).toBe(false);
  });

  it('answers the opacities a mode gives the palette, from the opacity each was built with', () => {
    const palette = createMaterialPalette();
    const solid = paletteOpacities(palette, 'solid');
    const xray = paletteOpacities(palette, 'xray');
    expect(solid.get(palette.window)).toBeCloseTo(palette.window.userData.baseOpacity);
    expect(xray.get(palette.window)).toBeCloseTo(palette.window.userData.baseOpacity * 0.4);
    expect(xray.get(palette.systemElectrical)).toBeCloseTo(0.95);
    expect(xray.get(palette.outline)).toBe(0.5);
    expect(paletteOpacities(palette, 'solid', { outlinesShown: false }).get(palette.outline)).toBe(0);
    // Not a material the modes drive.
    expect(xray.has(palette.wall)).toBe(false);
  });
});

describe('view modes — the keyboard, the file name, the copy', () => {
  it('toggles Solid and X-ray with X, and Wireframe with Shift+X', () => {
    expect(DEFAULT_VIEW_MODE).toBe('solid');
    expect(nextViewMode('solid')).toBe('xray');
    expect(nextViewMode('xray')).toBe('solid');
    expect(nextViewMode('wireframe')).toBe('solid');
    expect(nextViewMode('solid', { wireframe: true })).toBe('wireframe');
    expect(nextViewMode('xray', { wireframe: true })).toBe('wireframe');
    expect(nextViewMode('wireframe', { wireframe: true })).toBe('solid');
    expect(nextViewMode('nonsense')).toBe('xray');
  });

  it('names the saved picture after the mode', () => {
    expect(imageFileSuffix('solid')).toBe('');
    expect(imageFileSuffix('xray')).toBe('-xray');
    expect(imageFileSuffix('wireframe')).toBe('-wireframe');
    expect(isSeeThrough('solid')).toBe(false);
    expect(isSeeThrough('xray')).toBe(true);
  });

  it('carries the spec copy', () => {
    expect(VIEW_MODE_COPY.groupLabel).toBe('Preview see-through mode');
    expect(VIEW_MODE_COPY.xray.label).toBe('X-ray');
    expect(VIEW_MODE_COPY.xray.titleSuffix).toBe(' · X-ray');
    expect(VIEW_MODE_COPY.wireframe.footer).toBe('Wireframe: edges only. Clicks pick the nearest object.');
    expect(VIEW_MODE_COPY.solid.title).toBe('Everything as built');
    // The button face is shortened (§4.6); the name and the title are not.
    expect(VIEW_MODE_COPY.wireframe.label).toBe('Wire');
    expect(VIEW_MODE_COPY.wireframe.name).toBe('Wireframe');
    expect(VIEW_MODE_COPY.wireframe.title).toMatch(/^Wireframe/);
  });
});

describe('view modes — what a click picks', () => {
  const entry = (kind, floorId, ghost) => ({ target: { kind, floorId }, hit: { ghost } });
  const isGhostHit = (e) => e.hit.ghost;

  it('prefers what you can see over what you see through', () => {
    const hits = [entry('wall', 'f1', true), entry('column', 'f1', false)];
    expect(choosePickTarget(hits, { activeFloorId: 'f1', isGhostHit }).target.kind).toBe('column');
  });

  it('prefers solid on the active floor, then solid anywhere, then ghosts the same way', () => {
    const hits = [
      entry('wall', 'f1', true),
      entry('slab', 'f2', true),
      entry('beam', 'f1', false),
      entry('column', 'f2', false),
    ];
    expect(choosePickTarget(hits, { activeFloorId: 'f2', isGhostHit }).target.kind).toBe('column');
    expect(choosePickTarget(hits, { activeFloorId: 'f1', isGhostHit }).target.kind).toBe('beam');
    expect(choosePickTarget(hits, { activeFloorId: null, isGhostHit }).target.kind).toBe('beam');
    const ghosts = [entry('wall', 'f1', true), entry('slab', 'f2', true)];
    expect(choosePickTarget(ghosts, { activeFloorId: 'f2', isGhostHit }).target.kind).toBe('slab');
    expect(choosePickTarget(ghosts, { activeFloorId: null, isGhostHit }).target.kind).toBe('wall');
  });

  it('is the old rule when nothing is a ghost', () => {
    const hits = [entry('wall', 'f1', false), entry('column', 'f2', false)];
    expect(choosePickTarget(hits, { activeFloorId: 'f2' }).target.kind).toBe('column');
    expect(choosePickTarget(hits, {}).target.kind).toBe('wall');
    expect(choosePickTarget([], {})).toBeNull();
  });
});

describe('view modes — applied to a real world', () => {
  it('ghosts the skin, keeps the structure, and never touches visibility', () => {
    const { palette, cache, root, batchRoot } = playgroundBuild();
    const before = snapshotMeshes(root, batchRoot);

    expect(applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY)).toBe(true);

    let ghostWalls = 0;
    let solidColumns = 0;
    let ghostBatches = 0;
    for (const [node, was] of before) {
      expect(node.visible).toBe(was.visible);
      if (!node.isMesh) continue;
      const base = node.userData.baseMaterial || node.material;
      const tier = tierOf(base);
      if (tier === 'skin' || tier === 'deck') {
        expect(node.material.userData.ghostTwin).toBe(true);
        expect(node.material.userData.paletteKey).toBe(base.userData.paletteKey);
        expect(node.castShadow).toBe(false);
        expect(node.userData.castShadowBuilt).toBe(was.castShadow);
        if (base === palette.wall) ghostWalls += 1;
        if (node.isInstancedMesh) ghostBatches += 1;
      } else if (tier === 'structure' || tier === 'contents') {
        expect(node.material).toBe(was.material);
        expect(node.castShadow).toBe(was.castShadow);
        if (base === palette.column) solidColumns += 1;
      } else {
        // Glass, lenses, the glow pane, anything without a palette key.
        expect(node.material).toBe(was.material);
      }
    }
    expect(ghostWalls).toBeGreaterThan(0);
    expect(solidColumns).toBeGreaterThan(0);
    expect(ghostBatches).toBeGreaterThan(0);
    // No palette material had its transparency flipped.
    for (const material of Object.values(palette)) {
      if (!material?.isMaterial) continue;
      expect(material.transparent).toBe(Boolean(material.userData.baseOpacity !== undefined));
    }
    cache.dispose();
  });

  it('puts every mesh back exactly as built when it returns to Solid', () => {
    const { palette, cache, root, batchRoot } = playgroundBuild();
    const before = snapshotMeshes(root, batchRoot);
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.WIREFRAME);
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY);
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.SOLID);
    for (const [node, was] of before) {
      expect(node.material).toBe(was.material);
      expect(node.castShadow).toBe(was.castShadow);
      expect(node.visible).toBe(was.visible);
    }
    cache.dispose();
  });

  it('is idempotent, and walks only the groups it has not stamped', () => {
    const { palette, cache, root, batchRoot } = playgroundBuild();
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY);
    const twinCount = ghostMaterialsOf(palette).length;
    const after = snapshotMeshes(root, batchRoot);
    expect(applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY)).toBe(false);
    for (const [node, was] of after) expect(node.material).toBe(was.material);
    expect(ghostMaterialsOf(palette)).toHaveLength(twinCount);

    // A stamped group is skipped outright: mutate one and see it left alone.
    const group = root.children.find((child) => child.children.length > 0);
    let probe = null;
    group.traverse((node) => {
      if (!probe && node.isMesh && node.material.userData?.ghostTwin) probe = node;
    });
    probe.material = probe.userData.baseMaterial;
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY);
    expect(probe.material.userData.ghostTwin).toBeUndefined();
    delete group.userData.viewModeApplied;
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY);
    expect(probe.material.userData.ghostTwin).toBe(true);
    cache.dispose();
  });

  it('holds twins for both sides of a fade and keeps the shadows of the mode being left', () => {
    const { palette, cache, root, batchRoot } = playgroundBuild();
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY, { during: VIEW_MODES.SOLID });
    let wall = null;
    let column = null;
    root.traverse((node) => {
      if (!node.isMesh) return;
      const base = node.userData.baseMaterial || node.material;
      if (!wall && base === palette.wall) wall = node;
      if (!column && base === palette.column) column = node;
    });
    expect(wall.material.userData.ghostTwin).toBe(true);
    expect(wall.castShadow).toBe(wall.userData.castShadowBuilt);
    expect(column.material).toBe(palette.column);

    // X-ray → Wireframe: the column becomes a ghost, and keeps casting until the fade lands.
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY);
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.WIREFRAME, { during: VIEW_MODES.XRAY });
    expect(column.material.userData.ghostTwin).toBe(true);
    expect(column.castShadow).toBe(column.userData.castShadowBuilt);
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.WIREFRAME);
    expect(column.castShadow).toBe(false);
    cache.dispose();
  });
});

describe('view modes — the walk does not notice', () => {
  it('keeps the collision index exactly as it was: same meshes, same signature, same hits', () => {
    const { palette, cache, root, batchRoot } = playgroundBuild();
    const index = createCollisionIndex();
    index.sync([root]);
    const before = index.getStats();
    const rays = [];
    for (let i = 0; i < 80; i += 1) {
      const angle = (i / 80) * Math.PI * 2;
      rays.push([
        new THREE.Vector3(1000 + ((i * 331) % 6000), 1500, 3000 + ((i * 517) % 6000)),
        new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
      ]);
    }
    const cast = () =>
      rays.map(([origin, direction]) => {
        const raycaster = new THREE.Raycaster();
        raycaster.near = 0;
        raycaster.far = 8000;
        raycaster.set(origin, direction);
        return index.raycastNearest(raycaster)?.distance ?? null;
      });
    const distances = cast();

    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.WIREFRAME);
    index.sync([root]);
    // No rebuild: the structural signature (sources, children, visible flags) did not move.
    expect(index.getStats()).toEqual(before);
    expect(cast()).toEqual(distances);
    cache.dispose();
  });
});

describe('view modes — a framed wall (§12, §13)', () => {
  /**
   * The playground with two of its walls re-clad in HardieFlex: one left
   * undetailed and one detailed. Since §13 both draw their real studs, tracks
   * and noggins between the boards — before it the undetailed one was a
   * schematic core slab, which left X-ray nothing to see through to.
   */
  function framedBuild() {
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();
    const { project } = deserializeProject(demoData);
    const walls = project.floors.flatMap((floor) => floor.walls || []);
    const [undetailed, detailed] = walls;
    for (const wall of [undetailed, detailed]) {
      wall.assembly = createWallAssembly('fiber_cement');
      wall.thickness = wallAssemblyThickness(wall.assembly);
    }
    detailed.assembly.detailing = createWallDetailing({ enabled: true, sides: { interior: { enabled: true } } });
    const built = cache.build(buildPreviewScene(project, {}), palette);
    return { palette, cache, wallIds: [undetailed.id, detailed.id], ...built };
  }

  function meshesOf(roots, material, sourceId = null) {
    const found = [];
    for (const root of roots) {
      root.traverse((node) => {
        if (!node.isMesh || (node.userData.baseMaterial || node.material) !== material) return;
        if (sourceId && node.userData.previewTarget?.sourceId !== sourceId) return;
        found.push(node);
      });
    }
    return found;
  }

  it('draws real studs for every framed wall and keeps them solid in X-ray while the boards ghost', () => {
    const { palette, cache, root, batchRoot, wallIds } = framedBuild();

    // Both walls, detailed or not, are framed in the real members — drawn by
    // the floor's instanced batch, their source meshes left standing for picks
    // and the walk — and neither has a stand-in core.
    for (const wallId of wallIds) {
      const members = meshesOf([root], palette.wallFramingSteel, wallId);
      expect(members.length).toBeGreaterThan(1);
      expect(members.every((node) => node.layers.mask === 1 << SOURCE_ONLY_LAYER)).toBe(true);
      expect(meshesOf([root], palette.wallCoreSteel, wallId)).toEqual([]);
      expect(meshesOf([root], palette.wallCoreTimber, wallId)).toEqual([]);
    }
    expect(meshesOf([batchRoot], palette.wallCoreSteel)).toEqual([]);
    const studs = meshesOf([root, batchRoot], palette.wallFramingSteel);
    const boards = meshesOf([root, batchRoot], palette.wallFiberCement);
    expect(studs.some((node) => node.isInstancedMesh)).toBe(true);
    expect(boards.some((node) => node.isInstancedMesh)).toBe(true);

    const castBefore = new Map([...studs, ...boards].map((node) => [node, node.castShadow]));
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.XRAY);
    const boardTwin = ghostMaterialFor(palette, palette.wallFiberCement);
    expect(boardTwin.userData.ghostTwin).toBe(true);
    expect(paletteOpacities(palette, VIEW_MODES.XRAY).get(boardTwin)).toBe(GHOST_OPACITY.xray.skin);
    for (const board of boards) {
      expect(board.material).toBe(boardTwin);
      expect(board.castShadow).toBe(false);
      expect(board.visible).toBe(true);
    }
    for (const stud of studs) {
      expect(stud.material).toBe(palette.wallFramingSteel);
      expect(stud.castShadow).toBe(castBefore.get(stud));
    }

    // Wireframe takes the frame down to the same faint fill as everything else.
    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.WIREFRAME);
    const studTwin = ghostMaterialFor(palette, palette.wallFramingSteel);
    expect(paletteOpacities(palette, VIEW_MODES.WIREFRAME).get(studTwin)).toBe(0.05);
    for (const stud of studs) {
      expect(stud.material).toBe(studTwin);
      expect(stud.castShadow).toBe(false);
      expect(stud.visible).toBe(true);
    }

    applyViewModeToWorld(root, batchRoot, palette, VIEW_MODES.SOLID);
    for (const node of [...studs, ...boards]) {
      expect(node.material).toBe(node.userData.baseMaterial);
      expect(node.castShadow).toBe(castBefore.get(node));
    }
    cache.dispose();
  });
});
