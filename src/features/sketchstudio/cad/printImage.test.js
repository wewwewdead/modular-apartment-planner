// An uploaded image fitted to print (docs/sketch-studio-fab-shop.md §9 SM-3):
// at most 1024 px and 512 KB, PNG first, then JPEG, then smaller. The canvas
// is a stand-in whose data URL length follows the pixel count.
import { describe, expect, it } from 'vitest';
import { printImage } from './printImage.js';

// A canvas whose PNG costs `png` characters per pixel and JPEG `jpeg`.
const fakeCanvas =
  ({ png, jpeg }, drawn = []) =>
  () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect() {},
        drawImage: (image, x, y, w, h) => drawn.push([w, h]),
        set fillStyle(value) {
          canvas.background = value;
        },
      }),
      toDataURL: (type) => {
        const per = type === 'image/png' ? png : jpeg;
        return `data:${type};base64,${'A'.repeat(Math.min(600000, Math.round(canvas.width * canvas.height * per)))}`;
      },
    };
    return canvas;
  };
const file = { type: 'image/png' };
const options = (image, rates, drawn) => ({
  read: async () => 'data:image/png;base64,source',
  load: async () => image,
  canvas: fakeCanvas(rates, drawn),
});

describe('printImage', () => {
  it('brings a large image down to 1024 px on its long side, as PNG when that fits', async () => {
    const drawn = [];
    const fitted = await printImage(file, options({ width: 1600, height: 1200 }, { png: 0.5, jpeg: 0.2 }, drawn));
    expect(fitted).toMatchObject({ width: 1024, height: 768, type: 'png' });
    expect(fitted.bytes).toBe(fitted.dataUrl.length);
    expect(fitted.bytes).toBeLessThanOrEqual(512 * 1024);
    expect(drawn[0]).toEqual([1024, 768]);
  });
  it('keeps a small image its size; falls back to JPEG, then to smaller sizes', async () => {
    expect(await printImage(file, options({ width: 300, height: 200 }, { png: 1, jpeg: 1 }))).toMatchObject({
      width: 300,
      height: 200,
      type: 'png',
    });
    const jpeg = await printImage(file, options({ width: 1024, height: 1024 }, { png: 2, jpeg: 0.4 }));
    expect(jpeg).toMatchObject({ width: 1024, type: 'jpeg' });
    const smaller = await printImage(file, options({ width: 2048, height: 1024 }, { png: 3, jpeg: 1 }));
    expect(smaller.width).toBeLessThan(1024);
    expect(smaller.bytes).toBeLessThanOrEqual(512 * 1024);
  });
  it('refuses a file that is not an image, and one that never fits', async () => {
    await expect(
      printImage({ type: 'text/plain' }, options({ width: 1, height: 1 }, { png: 1, jpeg: 1 })),
    ).rejects.toThrow(/Choose an image file/);
    await expect(printImage(file, options({ width: 4000, height: 4000 }, { png: 1e6, jpeg: 1e6 }))).rejects.toThrow(
      /cannot be brought under 512 KB/,
    );
  });
});
