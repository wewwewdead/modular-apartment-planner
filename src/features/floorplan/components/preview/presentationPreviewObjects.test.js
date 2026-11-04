/**
 * The white-model additions to the preview's object builders: the warm glow
 * behind every window, and the plant and shower fixtures. Built through the
 * real pipeline (descriptors → THREE, batching on) so the draw-call contracts
 * are tested as they run, not as a mock would have them run.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFloorObjectGroup } from './buildPreviewObjects';
import { SOURCE_ONLY_LAYER } from './previewBatching';
import { PALETTE_LOOKS, createMaterialPalette } from './materials';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { deserializeProject } from '@/persistence/deserialize';
import { createFixture } from '@/domain/models';
import demoData from '@/pages/playground-demo.json';

function sceneWithFurniture() {
  const { project } = deserializeProject(demoData);
  const floor = project.floors[0];
  const plant = createFixture('plant', 500, 500, { width: 800, depth: 800 });
  const shower = createFixture('shower', 2000, 2000);
  const furnished = { ...floor, fixtures: [...(floor.fixtures || []), plant, shower] };
  const next = { ...project, floors: [furnished, ...project.floors.slice(1)] };
  return { scene: buildPreviewScene(next), plantId: plant.id, showerId: shower.id, floorId: floor.id };
}

function buildFirstFloor(scene, palette) {
  const floor = scene.floors.find((entry) => entry.objects.some((descriptor) => descriptor.geometry === 'window'));
  const built = buildFloorObjectGroup(floor, palette, null, { batch: true });
  return { floor, ...built };
}

function isBatched(mesh) {
  return mesh.layers.isEnabled(SOURCE_ONLY_LAYER) && !mesh.layers.isEnabled(0);
}

describe('descriptors stay pure data', () => {
  it('round-trips every new field through JSON unchanged', () => {
    const { scene } = sceneWithFurniture();
    for (const floor of scene.floors) {
      for (const descriptor of floor.objects) {
        if (descriptor.geometry !== 'window' && descriptor.geometry !== 'fixture') continue;
        expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
      }
    }
  });

  it('tells every window which face looks into the building', () => {
    const { scene } = sceneWithFurniture();
    const windows = scene.floors.flatMap((floor) => floor.objects.filter((d) => d.geometry === 'window'));
    expect(windows.length).toBeGreaterThan(0);
    for (const descriptor of windows) expect([1, -1]).toContain(descriptor.interiorSign);
  });

  it('stands a plant 1.3 times as tall as it is wide', () => {
    const { scene, plantId } = sceneWithFurniture();
    const plant = scene.floors.flatMap((floor) => floor.objects).find((d) => d.id === plantId);
    expect(plant.size.y).toBeCloseTo(800 * 1.3);
  });
});

describe('the window glow pane', () => {
  it('hangs one glow pane per window, on the inside of the glass, never batched and never shadowing', () => {
    const palette = createMaterialPalette();
    const { scene } = sceneWithFurniture();
    const { floor, entries } = buildFirstFloor(scene, palette);
    const windows = floor.objects.filter((descriptor) => descriptor.geometry === 'window');

    for (const descriptor of windows) {
      const group = entries.get(descriptor.id).object;
      const glows = [];
      group.traverse((node) => {
        if (node.isMesh && node.material === palette.windowGlow) glows.push(node);
      });
      expect(glows, descriptor.id).toHaveLength(1);
      const [glow] = glows;
      expect(glow.castShadow).toBe(false);
      expect(glow.receiveShadow).toBe(false);
      expect(isBatched(glow)).toBe(false);
      expect(glow.geometry.userData?.batchUnit).toBeUndefined();
      expect(glow.children.filter((child) => child.isLineSegments)).toHaveLength(0);
      expect(Math.sign(glow.position.z)).toBe(descriptor.interiorSign);
      // One-sided and facing the outside: its normal points away from the room.
      glow.updateMatrix();
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(glow.rotation);
      expect(Math.sign(normal.z)).toBe(-descriptor.interiorSign);
      expect(glow.material.side).toBe(THREE.FrontSide);
    }
  });

  it('shares the one palette material, so its brightness is a single uniform', () => {
    const palette = createMaterialPalette();
    const { scene } = sceneWithFurniture();
    const { floor, entries } = buildFirstFloor(scene, palette);
    const materials = new Set();
    for (const descriptor of floor.objects.filter((d) => d.geometry === 'window')) {
      entries.get(descriptor.id).object.traverse((node) => {
        if (node.userData?.windowGlow) materials.add(node.material);
      });
    }
    expect([...materials]).toEqual([palette.windowGlow]);
  });
});

describe('plant and shower builders', () => {
  it('builds a plant from a batched pot and a three-blob canopy in the two leaf greens', () => {
    const palette = createMaterialPalette();
    const { scene, plantId } = sceneWithFurniture();
    const { entries } = buildFirstFloor(scene, palette);
    const group = entries.get(plantId).object;
    const meshes = group.children.filter((child) => child.isMesh);

    const pots = meshes.filter((mesh) => mesh.material === palette.plantPot);
    const leaves = meshes.filter(
      (mesh) => mesh.material === palette.plantLeaf || mesh.material === palette.plantLeafDeep,
    );
    expect(pots).toHaveLength(1);
    expect(isBatched(pots[0])).toBe(true);
    expect(leaves).toHaveLength(3);
    expect(new Set(leaves.map((mesh) => mesh.material)).size).toBe(2);
    for (const leaf of leaves) expect(leaf.geometry).toBeInstanceOf(THREE.IcosahedronGeometry);

    // The canopy tops out at the descriptor's height.
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    expect(box.max.y - box.min.y).toBeGreaterThan(800 * 1.2);
    expect(box.max.y - box.min.y).toBeLessThan(800 * 1.4);
  });

  it('builds a shower from a glazed tray and a glass screen on the open side', () => {
    const palette = createMaterialPalette();
    const { scene, showerId } = sceneWithFurniture();
    const { entries } = buildFirstFloor(scene, palette);
    const group = entries.get(showerId).object;
    const meshes = group.children.filter((child) => child.isMesh);

    const tray = meshes.find((mesh) => mesh.material === palette.shower);
    const screen = meshes.find((mesh) => mesh.material === palette.railing_glass);
    expect(tray).toBeTruthy();
    expect(screen).toBeTruthy();
    expect(isBatched(screen)).toBe(false);
    // On the +z (open) side of a 900 deep tray, 1.9 m tall.
    expect(screen.position.z).toBeCloseTo(450 - 4);
    expect(screen.geometry.parameters.height).toBeCloseTo(1900);
  });
});

describe('the classic look the detail editors keep', () => {
  it('builds the previous palette for every key the white model changed, with no window glow', () => {
    const classic = createMaterialPalette({ look: PALETTE_LOOKS.CLASSIC });
    const whiteModel = createMaterialPalette();
    expect(classic.wall.color.getHex()).toBe(0xcfc8ba);
    expect(classic.column.color.getHex()).toBe(0x94989b);
    expect(classic.windowFrame.color.getHex()).toBe(0xe8eaed);
    expect(classic.window.opacity).toBeCloseTo(0.28);
    expect(classic.door.color.getHex()).toBe(0xb9854f);
    expect(classic.windowGlow).toBeUndefined();
    // The white model is what everything else gets.
    expect(whiteModel.wall.color.getHex()).toBe(0xe9e5dd);
    expect(whiteModel.windowFrame.color.getHex()).toBe(0x2f3338);
  });

  it('builds no glow pane into a window in the classic look', () => {
    const palette = createMaterialPalette({ look: PALETTE_LOOKS.CLASSIC });
    const { scene } = sceneWithFurniture();
    const { floor, entries } = buildFirstFloor(scene, palette);
    for (const descriptor of floor.objects.filter((d) => d.geometry === 'window')) {
      let glows = 0;
      entries.get(descriptor.id).object.traverse((node) => {
        if (node.userData?.windowGlow) glows += 1;
      });
      expect(glows).toBe(0);
    }
  });
});
