import * as THREE from 'three';

export function createMaterialPalette() {
  return {
    wall: new THREE.MeshStandardMaterial({
      color: 0xb7c0ca,
      roughness: 0.88,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    slab: new THREE.MeshStandardMaterial({
      color: 0xd6d9de,
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    roof: new THREE.MeshStandardMaterial({
      color: 0xd9dde2,
      roughness: 0.86,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
    parapet: new THREE.MeshStandardMaterial({
      color: 0xc4ccd4,
      roughness: 0.82,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    drain: new THREE.MeshStandardMaterial({
      color: 0x6d7a87,
      roughness: 0.42,
      metalness: 0.28,
      side: THREE.DoubleSide,
    }),
    roofOpening: new THREE.MeshStandardMaterial({
      color: 0x8dc8ef,
      roughness: 0.18,
      metalness: 0.02,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    }),
    column: new THREE.MeshStandardMaterial({
      color: 0x95a3b0,
      roughness: 0.8,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    beam: new THREE.MeshStandardMaterial({
      color: 0x7a8794,
      roughness: 0.76,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    stair: new THREE.MeshStandardMaterial({
      color: 0xc2c9d1,
      roughness: 0.84,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    landing: new THREE.MeshStandardMaterial({
      color: 0xc8cad0,
      roughness: 0.85,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    door: new THREE.MeshStandardMaterial({
      color: 0xc48f5d,
      roughness: 0.82,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    windowFrame: new THREE.MeshStandardMaterial({
      color: 0xe8eaed,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    window: new THREE.MeshStandardMaterial({
      color: 0x8dc8ef,
      roughness: 0.15,
      metalness: 0.02,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
    }),
    fixture_kitchenTop: new THREE.MeshStandardMaterial({
      color: 0xD8C5A4,
      roughness: 0.82,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
    fixture_toilet: new THREE.MeshStandardMaterial({
      color: 0xD4E8F0,
      roughness: 0.85,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    fixture_lavatory: new THREE.MeshStandardMaterial({
      color: 0xD0E0EC,
      roughness: 0.85,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    fixture_table: new THREE.MeshStandardMaterial({
      color: 0xD0C4B0,
      roughness: 0.78,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
    fixture_tv: new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.15,
      side: THREE.DoubleSide,
    }),
    fixture_sofa: new THREE.MeshStandardMaterial({
      color: 0xC8B8A8,
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    fixture_bed: new THREE.MeshStandardMaterial({
      color: 0xC8D2E1,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    fixtureAccentMetal: new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 0.4,
      side: THREE.DoubleSide,
    }),
    fixtureAccentDark: new THREE.MeshStandardMaterial({
      color: 0x2A2A2A,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
    fixtureAccentCeramic: new THREE.MeshStandardMaterial({
      color: 0xE8EEF2,
      roughness: 0.7,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    fixtureAccentFabric: new THREE.MeshStandardMaterial({
      color: 0xB0A090,
      roughness: 0.95,
      metalness: 0.01,
      side: THREE.DoubleSide,
    }),
    fixtureAccentWood: new THREE.MeshStandardMaterial({
      color: 0xA08060,
      roughness: 0.85,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    railing_glass: new THREE.MeshStandardMaterial({
      color: 0x8dc8ef,
      roughness: 0.15,
      metalness: 0.02,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }),
    railing_handrail: new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.35,
      metalness: 0.4,
      side: THREE.DoubleSide,
    }),
    railing_guardrail: new THREE.MeshStandardMaterial({
      color: 0x95a3b0,
      roughness: 0.8,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    outline: new THREE.LineBasicMaterial({
      color: 0x25303d,
      transparent: true,
      opacity: 0.7,
    }),
  };
}

export function disposeMaterialPalette(materialPalette) {
  Object.values(materialPalette || {}).forEach((material) => {
    material.dispose?.();
  });
}
