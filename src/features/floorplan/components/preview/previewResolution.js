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
