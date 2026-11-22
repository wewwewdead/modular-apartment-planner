import { IS_DESKTOP_APP } from '@/platform/desktopApp';

/**
 * How many pixels the preview renders, and where it spends them.
 *
 * Two different resolutions, because the preview has two different jobs.
 *
 * The *canvas* — the default framebuffer, the thing the compositor puts on the
 * screen — never wants more pixels than the display physically has. Everything
 * past `devicePixelRatio` is scaled back down by the OS before it reaches a
 * lit pixel, so on a 1.25× panel a 2.5× canvas is four times the fill rate for
 * an image the monitor then throws three quarters of away. That is a fine
 * trade for a still image and a terrible one for a frame that has to land in
 * 16 ms.
 *
 * The *refine* resolution is where supersampling belongs. Once the camera
 * stops, the accumulation buffers are rendered at the higher ratio and the
 * final blit to the canvas averages them down (see `applyRenderScale` in
 * `createProgressiveRenderer`). Same pixels rendered as before, same settled
 * image — but now only on the frames nobody is waiting for, and with a
 * downsample filter this code chooses rather than one the compositor picks.
 *
 * The browser build supersamples by 1, i.e. not at all: a tab has to assume it
 * is sharing an unknown GPU, and the accumulation's sub-pixel jitter already
 * antialiases the settled image on its own.
 */

/** Ratio of the canvas itself. Never more than the display can show. */
export function canvasPixelRatio(devicePixelRatio) {
  return Math.min(devicePixelRatio || 1, 2);
}

/**
 * Ratio the accumulation buffers are rendered at once the camera settles.
 *
 * Capped at 3 rather than left at 2× the device ratio: on a 4K/2× panel the
 * uncapped figure is 16 megapixels per sample, which does not buy a visibly
 * better image, it just buys fewer samples inside the same refine budget.
 */
export function refinePixelRatio(devicePixelRatio, isDesktop = IS_DESKTOP_APP) {
  const ratio = devicePixelRatio || 1;
  return isDesktop ? Math.min(ratio * 2, 3) : canvasPixelRatio(ratio);
}

/**
 * Refine resolution as a multiple of the canvas, which is the form the
 * renderer actually needs: it sizes the offscreen targets from the canvas's
 * own pixel count, so an exactly-2.0 factor makes the present blit an exact
 * four-texel box filter. At the desktop's usual 1.25× panel this is exactly 2.
 */
export function refineSupersample(devicePixelRatio, isDesktop = IS_DESKTOP_APP) {
  return refinePixelRatio(devicePixelRatio, isDesktop) / canvasPixelRatio(devicePixelRatio);
}

/**
 * The most pixels one refinement sample is ever rendered at.
 *
 * The supersample factor is a multiple of the canvas, so the pixel count grows
 * with the square of the window: a 2560×1440 window at the usual desktop
 * ratio asks for 14.7 megapixels a sample, a 4K one for 33 — and the offscreen
 * chain at that size is several gigabytes of render targets on a GPU that may
 * not have them, for an image the canvas then averages back down. Capped at
 * 16, the 1440p window is untouched and the 4K one gets a slightly smaller
 * supersample.
 */
export const REFINE_PIXEL_CAP = 16e6;

/**
 * The supersample factor a refine actually renders at: `supersample`, unless
 * that would put more than `cap` pixels in one sample. Never below 1 — the
 * settled image is never rendered below the canvas's own resolution.
 */
export function cappedRefineSupersample(supersample, canvasPixels, cap = REFINE_PIXEL_CAP) {
  if (!(supersample > 1) || !(canvasPixels > 0)) return supersample;
  return Math.max(1, Math.min(supersample, Math.sqrt(cap / canvasPixels)));
}

/**
 * Multisample count for the scene target at a given render scale (render
 * pixels per canvas pixel, per axis).
 *
 * A 2× refine already has four rendered pixels in every canvas pixel, and 8×
 * MSAA on each was 32 samples of memory and resolve bandwidth per canvas pixel.
 * 4× there is half the scene target's size and still crisper than the moving
 * frame it follows — which matters, because the first refine sample is shown
 * on its own and must never look worse than that frame.
 *
 * Measured, as the RMS residual of a tilted silhouette's recovered edge
 * (lower is crisper; no antialiasing at all is 0.29 px): the 8× moving frame
 * 0.039 px; the first 2× sample with 8× MSAA 0.013, with 4× 0.027, with 2× 0.063.
 * Two samples per pixel put only four distinct horizontal positions in each
 * canvas pixel, so sample zero came out measurably worse than the frame before it
 * — eight coverage samples per canvas pixel on paper, not in effect — and the
 * 2× that a count of samples per canvas pixel suggests is not used. After 16
 * accumulated samples 4× and 8× agree to 0.0003 px.
 *
 * Every other scale keeps the 8× it always had: every moving frame, the refine
 * of the browser build and of a walk (scale 1, so they never reallocate for
 * this), and the 1.5× refine of a 2× display, where 4× measured worse than 8×
 * on the first sample (0.063 against 0.052).
 */
export function multisampleCountFor(scale, preferred = 8) {
  if (scale >= 2) return Math.min(preferred, 4);
  return preferred;
}

/**
 * Estimated GPU memory of the preview's offscreen chain, in bytes, for the
 * render size given. An estimate: drivers pad and may allocate lazily, but the
 * proportions are what decide whether a big window fits.
 *
 * Per rendered pixel: the scene target — half-float RGBA (8 bytes) and 24-bit
 * depth (4) per multisample, plus its resolved colour texture and the resolve
 * framebuffer's depth (12); the composer's write buffer — as much again when it
 * is a clone of the scene target, 8 when it is a plain half-float target; GTAO's
 * three targets (36: occlusion and denoise with depth, normals with a depth
 * texture); the accumulation (8).
 */
export function estimateOffscreenBytes({ width, height, samples, plainWriteBuffer = true }) {
  const pixels = Math.max(0, width) * Math.max(0, height);
  const sceneTarget = samples > 0 ? 12 * samples + 12 : 12;
  const writeBuffer = plainWriteBuffer ? 8 : sceneTarget;
  const occlusion = 36;
  const accumulation = 8;
  return pixels * (sceneTarget + writeBuffer + occlusion + accumulation);
}
