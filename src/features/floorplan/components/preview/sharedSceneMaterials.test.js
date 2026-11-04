import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGroundMaterial, createGroundPlane, disposeGroundMaterial } from './createGroundPlane';
import { createGrid } from './previewCameraMath';

const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(12000, 3000, 9000));
const bounds = { minX: 0, maxX: 12000, minY: 0, maxY: 9000 };

describe('ground plane material sharing', () => {
  it('owns and disposes its own material when none is handed in', () => {
    const ground = createGroundPlane(box, 0);
    const dispose = vi.spyOn(ground.object.material, 'dispose');
    ground.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('draws every rebuild with the one shared material and leaves it alive on dispose', () => {
    const material = createGroundMaterial();
    const first = createGroundPlane(box, 0, { material });
    const second = createGroundPlane(box, 0, { material });
    expect(first.object.material).toBe(material);
    expect(second.object.material).toBe(material);
    const dispose = vi.spyOn(material, 'dispose');
    first.dispose();
    second.dispose();
    expect(dispose).not.toHaveBeenCalled();
    // The colour still reaches the shared material.
    second.setColor(0x123456);
    expect(material.color.getHex()).toBe(0x123456);
    disposeGroundMaterial(material);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('ground grid material sharing', () => {
  it('reports its materials and reuses the ones it is given', () => {
    const first = createGrid(bounds, 0);
    const materials = first.userData.materials;
    expect(materials.grid).toBe(first.material);
    expect(materials.xAxis).toBe(first.children[0].material);
    expect(materials.zAxis).toBe(first.children[1].material);
    expect(first.material.opacity).toBeCloseTo(0.45);

    const second = createGrid({ minX: 0, maxX: 30000, minY: 0, maxY: 20000 }, 1200, materials);
    expect(second.material).toBe(materials.grid);
    expect(second.children[0].material).toBe(materials.xAxis);
    expect(second.children[1].material).toBe(materials.zAxis);
    expect(second.userData.materials).toEqual(materials);
    expect(second.position.y).toBe(1200);
    expect(second.geometry).not.toBe(first.geometry);
  });
});
