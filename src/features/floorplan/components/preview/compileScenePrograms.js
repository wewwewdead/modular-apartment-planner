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
 */
export function compileScenePrograms(renderer, scene, camera, renderTarget = null) {
  const previousTarget = renderer.getRenderTarget();
  let materials;
  try {
    renderer.setRenderTarget(renderTarget);
    materials = renderer.compile(scene, camera);
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
