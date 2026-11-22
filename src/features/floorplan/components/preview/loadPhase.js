import { defineMachine } from '@/shared/machine';

/**
 * Where a preview pane is on its way to a picture, for the panel's loading
 * state (`createPreviewViewport` reports it through `setLoadStatusHandler`).
 *
 * - building: no world yet.
 * - compiling: a world is up and its programs are linking behind the frame
 *   hold; nothing of it is on the canvas.
 * - ready: a frame of the world is on the canvas.
 * - waking: back from a suspension, until the catch-up frame is drawn.
 * - lost: the WebGL context went. Nothing leaves it: the canvas is dead, and
 *   only disposing the viewport and building another (the panel's Try again,
 *   which remounts) brings a picture back.
 *
 * The events: COMPILE when a frame hold starts (`holdFramesUntil`), FRAME when
 * a frame of the world is drawn, WAKE when the viewport is woken, LOSE when the
 * canvas reports `webglcontextlost`.
 *
 * What the table leaves out is deliberate. A hold over a picture already on
 * screen holds that picture, which is not a loading state, so `ready` takes no
 * COMPILE; a pane put to sleep before its first picture keeps the phase it had,
 * so only `ready` takes WAKE; and `lost` takes nothing at all, so a compile or
 * a frame that lands after the loss cannot call the dead pane ready.
 */
export const previewLoadMachine = defineMachine({
  id: 'preview-load',
  initial: 'building',
  states: {
    building: { COMPILE: 'compiling', FRAME: 'ready', LOSE: 'lost' },
    compiling: { FRAME: 'ready', LOSE: 'lost' },
    ready: { WAKE: 'waking', LOSE: 'lost' },
    waking: { COMPILE: 'compiling', FRAME: 'ready', LOSE: 'lost' },
    lost: {},
  },
});
