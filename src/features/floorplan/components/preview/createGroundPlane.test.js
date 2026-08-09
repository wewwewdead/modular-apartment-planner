import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGroundPlane } from './createGroundPlane';

const boxOf = (widthMm, depthMm) =>
  new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(widthMm, 3000, depthMm));

describe('createGroundPlane', () => {
  it('reaches far enough past the model to read as a horizon', () => {
    const ground = createGroundPlane(boxOf(40000, 30000), 0);
    // Half-diagonal of the model is 25 m; the ground has to go several times
    // that or its edge shows up inside the frame as a circle.
    expect(ground.object.geometry.parameters.radius).toBeGreaterThan(25000 * 5);
    ground.dispose();
  });

  it('still gives a single room a horizon', () => {
    const ground = createGroundPlane(boxOf(3000, 2500), 0);
    expect(ground.object.geometry.parameters.radius).toBeGreaterThanOrEqual(60000);
    ground.dispose();
  });

  it('copes with no model at all', () => {
    expect(() => createGroundPlane(new THREE.Box3(), 0).dispose()).not.toThrow();
    expect(() => createGroundPlane(null, 0).dispose()).not.toThrow();
  });

  it('sits just under the datum, where a slab is usually modelled', () => {
    const ground = createGroundPlane(boxOf(3000, 3000), 1500);
    expect(ground.object.position.y).toBeLessThan(1500);
    expect(ground.object.position.y).toBeGreaterThan(1490);
    ground.dispose();
  });

  it('catches shadows without casting one', () => {
    const ground = createGroundPlane(boxOf(3000, 3000), 0);
    expect(ground.object.receiveShadow).toBe(true);
    expect(ground.object.castShadow).toBe(false);
    ground.dispose();
  });

  it('takes the colour of the light it is standing in', () => {
    const ground = createGroundPlane(boxOf(3000, 3000), 0);
    ground.setColor(0x112233);
    expect(ground.object.material.color.getHex()).toBe(0x112233);
    ground.dispose();
  });

  it('lies flat, so the disc is a ground and not a wall', () => {
    const ground = createGroundPlane(boxOf(3000, 3000), 0);
    const normal = new THREE.Vector3();
    const attribute = ground.object.geometry.getAttribute('normal');
    normal.fromBufferAttribute(attribute, 0);
    expect(normal.y).toBeCloseTo(1, 6);
    ground.dispose();
  });
});
