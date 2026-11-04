import * as THREE from 'three';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { buildPreviewObjectRoot } from './buildPreviewObjects';
import { applyRenderStyleToPalette, createMaterialPalette, disposeMaterialPalette } from './materials';
import { disposeScene } from './disposeScene';
import { STUDIO_ENVIRONMENT_INTENSITY, createEnvironment } from './createEnvironment';
import { createGroundPlane } from './createGroundPlane';
import { RENDER_STYLES, renderStyleConfig, toneMappingConstant } from './renderStyle';
import { PRESETS } from './previewConfig';
import { fitOrthographicCamera, isElevationPreset } from './previewCameraMath';

/**
 * A single still of the model, for placing on a drawing sheet.
 *
 * Shares the viewport's materials, environment, tone curve and preset
 * directions (`previewConfig.PRESETS`, plus the elevation axes the 2D
 * elevations use) so a sheet viewport and the live preview cannot drift apart
 * in appearance. It does not share the progressive pipeline — there is no
 * camera to wait on here, so it takes plain MSAA and one render, which is what
 * a one-shot offscreen render should do.
 *
 * Defaults to the Shaded style; the sheet axonometric asks for `realistic`.
 * `projection: 'orthographic'` (or an elevation preset name) gives a true
 * parallel elevation.
 */

export function renderSceneToImage(project, options = {}) {
  const {
    activeFloorId = null,
    width = 1600,
    height = 1000,
    preset = 'plan_aligned',
    style: styleName = RENDER_STYLES.SHADED,
    projection = isElevationPreset(preset) ? 'orthographic' : 'perspective',
  } = options;

  const sceneDescriptor = buildPreviewScene(project, { activeFloorId });
  if (!sceneDescriptor.hasVisibleObjects) return null;

  const style = renderStyleConfig(styleName);
  const materialPalette = createMaterialPalette();
  applyRenderStyleToPalette(materialPalette, style);

  const scene = new THREE.Scene();

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = toneMappingConstant(style.toneMapping);
  renderer.toneMappingExposure = style.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);

  const environment = createEnvironment(renderer);
  scene.environment = environment.studioEnvironment();
  scene.environmentIntensity = style.environmentIntensity * STUDIO_ENVIRONMENT_INTENSITY;
  scene.background = style.sky ? environment.studioBackdrop() : new THREE.Color(0xf5f7fa);

  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  scene.add(new THREE.HemisphereLight(0xdde7f4, 0xe6ded0, 0.18));

  const bounds = sceneDescriptor.bounds;
  const box = new THREE.Box3(
    new THREE.Vector3(bounds.minX, bounds.minElevation, bounds.minY),
    new THREE.Vector3(bounds.maxX, bounds.maxElevation, bounds.maxY),
  );
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1000);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.copy(center).add(new THREE.Vector3(0.52, 0.74, 0.3).normalize().multiplyScalar(radius * 3));
  keyLight.target.position.copy(center);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  const shadowCamera = keyLight.shadow.camera;
  shadowCamera.left = -radius * 1.15;
  shadowCamera.right = radius * 1.15;
  shadowCamera.top = radius * 1.15;
  shadowCamera.bottom = -radius * 1.15;
  shadowCamera.near = Math.max(1, radius);
  shadowCamera.far = radius * 6;
  shadowCamera.updateProjectionMatrix();
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.normalBias = radius * 0.004;
  scene.add(keyLight);
  scene.add(keyLight.target);
  const fillLight = new THREE.DirectionalLight(0xdce6f2, 0.35);
  fillLight.position.copy(center).add(new THREE.Vector3(-0.62, 0.4, -0.5).normalize().multiplyScalar(radius * 3));
  fillLight.target.position.copy(center);
  scene.add(fillLight);
  scene.add(fillLight.target);

  // `buildPreviewObjectRoot` returns `{ root, meshMap }`. Handing the pair to
  // `scene.add` (as this used to) adds nothing — three logs and moves on — so
  // the sheet axonometric was a ground and a sky with no building on it.
  const { root } = buildPreviewObjectRoot(sceneDescriptor, materialPalette);
  if (!style.outlines) {
    root.traverse((object) => {
      if (object.isLineSegments) object.visible = false;
    });
  }
  scene.add(root);

  let grid = null;
  if (style.grid) {
    const gridSize = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 4000);
    const normalizedSize = Math.ceil(gridSize / 1000) * 1000;
    const divisions = Math.max(8, Math.round(normalizedSize / 500));
    grid = new THREE.GridHelper(normalizedSize, divisions, 0x8fa1b4, 0xc7d1db);
    grid.position.y = sceneDescriptor.groundLevel;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    scene.add(grid);
  }

  const ground = style.ground ? createGroundPlane(box, sceneDescriptor.groundLevel) : null;
  if (ground) scene.add(ground.object);

  let camera;
  if (projection === 'orthographic' && isElevationPreset(preset)) {
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100000);
    fitOrthographicCamera(camera, null, box, preset, { aspect: width / height });
  } else {
    camera = new THREE.PerspectiveCamera(42, width / height, 10, 100000);
    const direction = (PRESETS[preset] || PRESETS.plan_aligned).clone().normalize();
    const halfFovY = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfFovX = Math.atan(Math.tan(halfFovY) * camera.aspect);
    const distanceByHeight = Math.max(size.y, size.z) / (2 * Math.tan(halfFovY));
    const distanceByWidth = Math.max(size.x, size.z) / (2 * Math.tan(halfFovX));
    const distance = Math.max(distanceByHeight, distanceByWidth, (size.length() / 2) * 1.4) * 1.15;

    camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
    camera.lookAt(center);
    camera.near = Math.max(10, distance / 200);
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');

  scene.remove(root);
  // Materials are the palette's — disposed once, below, rather than per mesh.
  disposeScene(root, { disposeMaterials: false });
  if (grid) {
    grid.geometry?.dispose?.();
    grid.material?.dispose?.();
  }
  ground?.dispose();
  environment.dispose();
  disposeMaterialPalette(materialPalette);
  renderer.dispose();

  return dataUrl;
}
