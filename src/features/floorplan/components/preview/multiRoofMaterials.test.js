import { describe, expect, it } from 'vitest';
import { createFloor, createProject } from '@/domain/models';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem } from '@/domain/trussModels';
import { parseOwnerMaterialKey, resolveRoofAppearances } from '@/domain/roofCoveringCatalog';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { applyRoofAppearanceToPalette, createMaterialPalette, ownerMaterialKeys } from './materials';
import { createPreviewSceneCache } from './previewSceneCache';

/**
 * Each roof, and each truss system's gable-end closures, in its own colours
 * (docs/multi-roof.md §6), through the real pipeline: project → scene →
 * cache → THREE, against real THREE, so what these assert is the mesh,
 * geometry and material identity the renderer sees. The property the shared
 * palette mutation was built for has to survive the move to per-owner
 * materials: a colour edit re-triangulates nothing.
 */

function trussSystem(id, floorId, y) {
  return createTrussSystem(id, {
    id,
    floorId,
    baseElevation: 3000,
    trussInstances: [
      {
        id: `${id}_ti`,
        trussTypeId: 'truss_type_gable',
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        startPoint: { x: 0, y },
        endPoint: { x: 3600, y },
      },
    ],
  });
}

/** Two truss systems on the ground floor, a roof on each, an empty upper floor. */
function twoRoofProject() {
  const base = createProject('Two roofs, two colours');
  const ground = base.floors[0];
  const upper = createFloor('Level 2', 1);
  let project = {
    ...base,
    floors: [ground, upper],
    trussSystems: [trussSystem('ts_a', ground.id, 0), trussSystem('ts_b', ground.id, 20000)],
  };
  project = {
    ...project,
    roofSystems: [createRoofSystemForProject(project, { id: 'roof_a', trussAttachmentId: 'ts_a' })],
  };
  project = {
    ...project,
    roofSystems: [
      ...project.roofSystems,
      createRoofSystemForProject(project, { id: 'roof_b', trussAttachmentId: 'ts_b' }),
    ],
  };
  return { project, ground, upper };
}

function withRoofColour(project, roofId, hex) {
  return {
    ...project,
    roofSystems: project.roofSystems.map((roof) =>
      roof.id === roofId ? { ...roof, covering: { ...roof.covering, colour: { ...roof.covering.colour, hex } } } : roof,
    ),
  };
}

function withClosureColour(project, systemId, hex) {
  return {
    ...project,
    trussSystems: project.trussSystems.map((system) =>
      system.id === systemId
        ? { ...system, endClosures: { ...system.endClosures, colour: { ...system.endClosures?.colour, hex } } }
        : system,
    ),
  };
}

/** What the panel's effect does: resolve every owner's look and put it on the palette. */
function applyAppearances(palette, project) {
  return applyRoofAppearanceToPalette(palette, resolveRoofAppearances(project.roofSystems, project.trussSystems));
}

function groupNamed(root, floorId) {
  return root.children.find((child) => child.name === `floor-${floorId}`);
}

/** Every mesh and geometry under a group, by identity. */
function meshesAndGeometries(group) {
  const meshes = new Set();
  const geometries = new Set();
  group.traverse((node) => {
    if (!node.isMesh) return;
    meshes.add(node);
    geometries.add(node.geometry);
  });
  return { meshes, geometries };
}

/** The same objects, by identity (a deep `toEqual` would walk THREE's parent links). */
function sameMembers(a, b) {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

function watchDisposal(group) {
  const disposed = new Set();
  group.traverse((node) => {
    node.geometry?.addEventListener('dispose', () => disposed.add(node.geometry));
  });
  return disposed;
}

/** The covering material a roof's body mesh is drawn with. */
function bodyMaterial(meshMap, roofId) {
  return meshMap.get(roofId).object.material;
}

describe('each roof in its own colours, through the preview pipeline (docs/multi-roof.md §6)', () => {
  it('draws two roofs with different covering colours in two materials carrying those colours', () => {
    const { project: start } = twoRoofProject();
    const project = withRoofColour(withRoofColour(start, 'roof_a', '#5E1D0E'), 'roof_b', '#1F4E79');
    const palette = createMaterialPalette();
    applyAppearances(palette, project);
    const { meshMap } = createPreviewSceneCache().build(buildPreviewScene(project), palette);

    const a = bodyMaterial(meshMap, 'roof_a');
    const b = bodyMaterial(meshMap, 'roof_b');
    expect(a).not.toBe(b);
    expect(a.userData.paletteKey).toBe('roof_metal@roof_a');
    expect(b.userData.paletteKey).toBe('roof_metal@roof_b');
    expect(a.color.getHexString().toUpperCase()).toBe('5E1D0E');
    expect(b.color.getHexString().toUpperCase()).toBe('1F4E79');
    // The base key is a clone source only.
    expect(palette.roof_metal.color.getHexString().toUpperCase()).toBe('BDBFBA');
  });

  it("reuses roof A's meshes on a colour edit, and does not touch roof B at all", () => {
    const { project, ground, upper } = twoRoofProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();
    applyAppearances(palette, project);
    const first = cache.build(buildPreviewScene(project), palette);

    const roofA = groupNamed(first.root, 'roof_a');
    const roofB = groupNamed(first.root, 'roof_b');
    const trussFloor = groupNamed(first.root, ground.id);
    const upperFloor = groupNamed(first.root, upper.id);
    const roofAParts = meshesAndGeometries(roofA);
    const trussParts = meshesAndGeometries(trussFloor);
    const roofAObjects = [...first.meshMap].filter(([, entry]) => entry.object.parent === roofA);
    const disposed = new Set([...watchDisposal(roofA), ...watchDisposal(trussFloor), ...watchDisposal(roofB)]);
    const materialB = bodyMaterial(first.meshMap, 'roof_b');
    const materialA = bodyMaterial(first.meshMap, 'roof_a');
    const versionB = materialB.version;
    const colourB = materialB.color.getHex();

    // A covering colour edit on roof A: a new roof A object, as the reducer makes.
    const recoloured = withRoofColour(project, 'roof_a', '#5E1D0E');
    const second = cache.build(buildPreviewScene(recoloured), palette);
    applyAppearances(palette, recoloured);

    // Roof B: the same group, the same material, untouched.
    expect(groupNamed(second.root, 'roof_b')).toBe(roofB);
    expect(bodyMaterial(second.meshMap, 'roof_b')).toBe(materialB);
    expect(materialB.version).toBe(versionB);
    expect(materialB.color.getHex()).toBe(colourB);
    // A floor that depends on neither roof keeps its group.
    expect(groupNamed(second.root, upper.id)).toBe(upperFloor);

    // Roof A: its layer is keyed on the roof object, so a new group is made —
    // but every mesh in it is carried over, so nothing was re-triangulated.
    // Its material is the same instance, recoloured in place.
    const roofAAfter = meshesAndGeometries(groupNamed(second.root, 'roof_a'));
    expect(roofAObjects.length).toBeGreaterThan(0);
    for (const [id, entry] of roofAObjects) expect(second.meshMap.get(id).object, id).toBe(entry.object);
    expect(roofAParts.meshes.size).toBeGreaterThan(0);
    expect(sameMembers(roofAAfter.meshes, roofAParts.meshes)).toBe(true);
    expect(sameMembers(roofAAfter.geometries, roofAParts.geometries)).toBe(true);
    expect(bodyMaterial(second.meshMap, 'roof_a')).toBe(materialA);
    expect(materialA.color.getHexString().toUpperCase()).toBe('5E1D0E');
    // The trusses' floor reads roof A for its closures' top edge, so it keys on
    // roof A too: same story, every mesh carried over.
    expect(sameMembers(meshesAndGeometries(groupNamed(second.root, ground.id)).geometries, trussParts.geometries)).toBe(
      true,
    );
    expect(disposed.size).toBe(0);
  });

  it("gives each truss system's gable closures their own colour, and a closure colour edit rebuilds no geometry", () => {
    const { project: start, ground } = twoRoofProject();
    const project = withClosureColour(withClosureColour(start, 'ts_a', '#6B4A3A'), 'ts_b', '#9DB0A1');
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();
    applyAppearances(palette, project);
    const first = cache.build(buildPreviewScene(project), palette);

    const closureA = first.meshMap.get('ts_a-closure-start').object;
    const closureB = first.meshMap.get('ts_b-closure-start').object;
    expect(closureA.material.userData.paletteKey).toBe('gableInfill@ts_a');
    expect(closureB.material.userData.paletteKey).toBe('gableInfill@ts_b');
    expect(closureA.material.color.getHexString().toUpperCase()).toBe('6B4A3A');
    expect(closureB.material.color.getHexString().toUpperCase()).toBe('9DB0A1');

    const trussParts = meshesAndGeometries(groupNamed(first.root, ground.id));
    const materialB = closureB.material;
    const recoloured = withClosureColour(project, 'ts_a', '#E9E5DD');
    applyAppearances(palette, recoloured);
    const second = cache.build(buildPreviewScene(recoloured), palette);
    expect(second.meshMap.get('ts_a-closure-start').object).toBe(closureA);
    expect(closureA.material.color.getHexString().toUpperCase()).toBe('E9E5DD');
    expect(second.meshMap.get('ts_b-closure-start').object.material).toBe(materialB);
    expect(materialB.color.getHexString().toUpperCase()).toBe('9DB0A1');
    expect(sameMembers(meshesAndGeometries(groupNamed(second.root, ground.id)).geometries, trussParts.geometries)).toBe(
      true,
    );
    // Both roof layers keep their groups: no roof changed.
    expect(groupNamed(second.root, 'roof_a')).toBe(groupNamed(first.root, 'roof_a'));
    expect(groupNamed(second.root, 'roof_b')).toBe(groupNamed(first.root, 'roof_b'));
  });

  it("dresses an owner's gutters and downpipes in that owner's trim instance", () => {
    const { project } = twoRoofProject();
    const palette = createMaterialPalette();
    const { meshMap } = createPreviewSceneCache().build(buildPreviewScene(project), palette);
    const kit = (roofId, part) =>
      [...meshMap.values()].filter(
        (entry) => entry.descriptor.metadata?.sourceId === roofId && entry.descriptor.metadata?.part === part,
      );
    for (const roofId of ['roof_a', 'roof_b']) {
      const trims = new Set(
        ['fascia', 'barge', 'gutter', 'downpipe']
          .flatMap((part) => kit(roofId, part))
          .map((entry) => entry.object.material),
      );
      expect(kit(roofId, 'gutter').length, roofId).toBeGreaterThan(0);
      expect(trims.size, roofId).toBe(1);
      expect([...trims][0].userData.paletteKey).toBe(`roofTrim@${roofId}`);
    }
  });

  it('gives a material its owner look whichever comes first, the appearances or the build', () => {
    const { project: start } = twoRoofProject();
    const project = withRoofColour(start, 'roof_b', '#1F4E79');

    // The effect first (the first mount): the build's new material is born in its look.
    const effectFirst = createMaterialPalette();
    applyAppearances(effectFirst, project);
    expect(ownerMaterialKeys(effectFirst)).toEqual([]);
    const born = createPreviewSceneCache().build(buildPreviewScene(project), effectFirst);
    expect(bodyMaterial(born.meshMap, 'roof_b').color.getHexString().toUpperCase()).toBe('1F4E79');

    // The build first (a roof just added, the effect still to run): the
    // material starts in the base look and takes its owner's when it lands.
    const buildFirst = createMaterialPalette();
    const built = createPreviewSceneCache().build(buildPreviewScene(project), buildFirst);
    const material = bodyMaterial(built.meshMap, 'roof_b');
    expect(material.color.getHex()).toBe(buildFirst.roof_metal.color.getHex());
    expect(applyAppearances(buildFirst, project).changed).toBe(true);
    expect(material.color.getHexString().toUpperCase()).toBe('1F4E79');
  });

  it('drops the materials of a roof and a truss system once they are gone', () => {
    const { project } = twoRoofProject();
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();
    applyAppearances(palette, project);
    const first = cache.build(buildPreviewScene(project), palette);
    const ownersOf = (keys) => new Set(keys.map((key) => parseOwnerMaterialKey(key).ownerId));
    expect(ownersOf(ownerMaterialKeys(palette))).toEqual(new Set(['roof_a', 'roof_b', 'ts_a', 'ts_b']));
    const goneRoof = bodyMaterial(first.meshMap, 'roof_b');
    const goneInfill = first.meshMap.get('ts_b-closure-start').object.material;
    let disposed = 0;
    goneRoof.addEventListener('dispose', () => (disposed += 1));
    goneInfill.addEventListener('dispose', () => (disposed += 1));

    // Roof B and its truss system deleted.
    const smaller = {
      ...project,
      roofSystems: project.roofSystems.filter((roof) => roof.id !== 'roof_b'),
      trussSystems: project.trussSystems.filter((system) => system.id !== 'ts_b'),
    };
    cache.build(buildPreviewScene(smaller), palette);
    expect(ownersOf(ownerMaterialKeys(palette))).toEqual(new Set(['roof_a', 'ts_a']));
    expect(disposed).toBe(2);
  });
});
