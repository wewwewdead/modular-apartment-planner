import * as THREE from 'three';

/**
 * Compile every program a scene needs for the target it will actually be drawn
 * into, and resolve once the driver says they are ready.
 *
 * Two things `renderer.compileAsync` gets wrong for this viewport, which is why
 * it is not called directly:
 *
 *  - It compiles for whatever render target happens to be bound — between
 *    frames that is the canvas — while every frame here draws the scene into
 *    the progressive renderer's half-float offscreen target. A program's
 *    identity includes its output colour space and tone mapping, both of which
 *    differ between the two, so the warm-up compiled a set of screen variants
 *    that were never drawn with and left the real ones to compile on the frame
 *    that first needed them.
 *  - Its readiness poll assumes every material it started still has a
 *    program. An incremental rebuild that disposes a fixture's own lens
 *    material while the poll is running throws inside three's timer (`reading
 *    'isReady'` of undefined), and the promise never settles. Here a material
 *    that lost its program simply counts as done.
 *
 * Uses KHR_parallel_shader_compile where the driver has it (ANGLE on D3D11
 * does): the compile is issued up front and polled without blocking. Without it
 * the first poll waits a tick, as three's own does.
 *
 * `includeScene: false` compiles only the `extras` (still against the scene's
 * lights) and the `standalone` objects — for a caller that knows exactly which
 * new programs are coming, like a see-through mode's ghost twins, and has no
 * reason to re-derive a program key for every mesh already on screen.
 */
export function compileScenePrograms(
  renderer,
  scene,
  camera,
  renderTarget = null,
  { extras = [], standalone = [], includeScene = true } = {},
) {
  const previousTarget = renderer.getRenderTarget();
  let materials;
  try {
    renderer.setRenderTarget(renderTarget);
    materials = includeScene ? renderer.compile(scene, camera) : new Set();
    // Things the renderer draws that are not in the scene graph (the
    // background box), compiled against the scene's lights.
    for (const extra of extras) {
      for (const material of renderer.compile(extra, camera, scene)) materials.add(material);
    }
    // And things drawn on their own (a post-processing pass's full-screen
    // quad): no lights, which is part of their programs' identity too.
    for (const object of standalone) {
      for (const material of renderer.compile(object, camera)) materials.add(material);
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
  }

  return new Promise((resolve) => {
    const pending = new Set(materials);
    const check = () => {
      for (const material of pending) {
        const program = renderer.properties.get(material)?.currentProgram;
        if (!program || program.isReady()) pending.delete(material);
      }
      if (!pending.size) {
        resolve(scene);
        return;
      }
      setTimeout(check, 10);
    };
    if (renderer.extensions.get('KHR_parallel_shader_compile') !== null) check();
    else setTimeout(check, 10);
  });
}

/**
 * A stand-in for the box three draws a cube-map background with, built the way
 * three 0.183's WebGLBackground builds its own, so that compiling it here links
 * the very program the background will use.
 *
 * That box is created inside the renderer on the first frame with a cube
 * background and never enters the scene graph, so `renderer.compile(scene)`
 * cannot see it — and its link, waited on in the middle of that first frame,
 * was 300 ms of frozen page on a cold shader cache. Everything that feeds the
 * program's identity is mirrored: the ShaderLib source, the material flags, the
 * envMap property the renderer reads, tone mapping by the texture's transfer.
 * If three ever builds its box differently the only cost is the old one: the
 * program links on first use again.
 *
 * Returns null for anything that is not a cube texture. Keep the mesh alive as
 * long as the background: disposing its material would release the shared
 * program before the real box has used it.
 */
export function createBackgroundWarmup(background) {
  if (!background?.isCubeTexture) return null;
  const material = new THREE.ShaderMaterial({
    name: 'BackgroundCubeMaterial',
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.backgroundCube.uniforms),
    vertexShader: THREE.ShaderLib.backgroundCube.vertexShader,
    fragmentShader: THREE.ShaderLib.backgroundCube.fragmentShader,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    allowOverride: false,
  });
  Object.defineProperty(material, 'envMap', {
    get() {
      return this.uniforms.envMap.value;
    },
  });
  material.uniforms.envMap.value = background;
  material.toneMapped = THREE.ColorManagement.getTransfer(background.colorSpace) !== THREE.SRGBTransfer;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  return new THREE.Mesh(geometry, material);
}

/**
 * A stand-in for the material three converts an equirectangular background to
 * a cube map with (`WebGLCubeRenderTarget.fromEquirectangularTexture`, named
 * 'CubemapFromEquirect'), so the sun study's sky backdrop does not link it
 * inside the first frame that shows the sky.
 *
 * That material's shaders are written inline in three, not in ShaderLib, so
 * they are not copied here — a copy that drifted by one character would be a
 * different program. Instead three is asked to run its own conversion against
 * a renderer that only records what it was asked to draw, and the material it
 * drew with is cloned: the very source, flags and side three will use. Nothing
 * touches the GPU while that happens.
 *
 * Compile the result with no lights and a render target bound (the conversion
 * draws a bare mesh into a cube target), and keep it alive: three disposes its
 * own conversion material straight after use, and a program nothing else holds
 * is destroyed with it. Returns null if three's conversion ever stops going
 * through `renderer.render`; the cost is then the old one, a link on first use.
 */
export function createEquirectToCubeWarmup(renderer) {
  let captured = null;
  const recorder = {
    isWebGLRenderer: false,
    reversedDepthBuffer: false,
    autoClear: true,
    coordinateSystem: renderer.coordinateSystem,
    xr: { enabled: false },
    getRenderTarget: () => null,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget() {},
    clearDepth() {},
    render(scene) {
      if (!captured && scene?.material?.isShaderMaterial) captured = scene.material.clone();
    },
  };
  const source = new THREE.Texture();
  source.mapping = THREE.EquirectangularReflectionMapping;
  const cube = new THREE.WebGLCubeRenderTarget(1);
  try {
    cube.fromEquirectangularTexture(recorder, source);
  } catch {
    captured = null;
  } finally {
    cube.dispose();
    source.dispose();
  }
  if (!captured) return null;
  // The program does not depend on the texture; do not hold one.
  for (const uniform of Object.values(captured.uniforms || {})) {
    if (uniform?.value?.isTexture) uniform.value = null;
  }
  return captured;
}
