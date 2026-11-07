/*
 * The one size every prefiltered environment in the preview is built at.
 *
 * A material's program carries the environment map's cube-UV size in its
 * identity (three turns it into the CUBEUV_* defines), and the PMREM generator
 * rebuilds its blur filters whenever the size changes. So when the studio room
 * was prefiltered at 256 and the web build's sky — a 512-wide canvas, which
 * three prefilters at width / 4 — at 128, switching the sun study on gave every
 * lit material a new program and linked them all, with the filters, inside the
 * first sky frame: 0.8 s of frozen page. One size, shared, and the switch is a
 * texture swap.
 */
export const ENVIRONMENT_PREFILTER_SIZE = 256;

/**
 * The sky canvas that prefilters at that size: three sizes an equirectangular
 * prefilter at `image.width / 4` (PMREMGenerator._fromTexture), and an
 * equirectangular image is twice as wide as it is tall.
 */
export const SKY_CANVAS_WIDTH = ENVIRONMENT_PREFILTER_SIZE * 4;
export const SKY_CANVAS_HEIGHT = SKY_CANVAS_WIDTH / 2;
