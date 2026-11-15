// An uploaded image made fit to print (docs/sketch-studio-fab-shop.md §9
// SM-3): at most 1024 px on its long side and at most 512 KB as a data URL
// (model.js PRINT_IMAGE_LIMIT, which the model validates), so it can live in
// the saved model. PNG first (it keeps transparency); when that is too big at
// a size, JPEG on white; then the next size down. Browser only (a canvas).
import { PRINT_IMAGE_LIMIT } from './model.js';

export const PRINT_IMAGE_SIDE = 1024;

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
const loadImage = (source) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The file is not an image this browser can draw.'));
    image.src = source;
  });

/**
 * `file` (a File or Blob) → { dataUrl, width, height, type ('png' | 'jpeg'),
 * bytes (the data URL's length) }. Options (tests): maxSide, maxBytes,
 * read(file) → data URL, load(url) → an image ({ width, height }), canvas() → a canvas.
 */
export async function printImage(
  file,
  {
    maxSide = PRINT_IMAGE_SIDE,
    maxBytes = PRINT_IMAGE_LIMIT,
    read = readAsDataUrl,
    load = loadImage,
    canvas = () => document.createElement('canvas'),
  } = {},
) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Choose an image file (PNG, JPEG, SVG, WebP).');
  const image = await load(await read(file));
  const long = Math.max(image.width, image.height);
  if (!(long > 0)) throw new Error('The image has no size.');
  let side = Math.min(maxSide, long);
  for (let attempt = 0; attempt < 10 && side >= 16; attempt++) {
    const scale = side / long;
    const width = Math.max(1, Math.round(image.width * scale)),
      height = Math.max(1, Math.round(image.height * scale));
    const draw = (background) => {
      const c = canvas();
      c.width = width;
      c.height = height;
      const g = c.getContext('2d');
      if (background) {
        g.fillStyle = background;
        g.fillRect(0, 0, width, height);
      }
      g.drawImage(image, 0, 0, width, height);
      return c;
    };
    const png = draw(null).toDataURL('image/png');
    if (png.length <= maxBytes) return { dataUrl: png, width, height, type: 'png', bytes: png.length };
    const jpeg = draw('#ffffff').toDataURL('image/jpeg', 0.85);
    if (jpeg.length <= maxBytes) return { dataUrl: jpeg, width, height, type: 'jpeg', bytes: jpeg.length };
    side = Math.round(side * 0.75);
  }
  throw new Error('The image cannot be brought under 512 KB: use a simpler one.');
}
