// A small generated logo for the control-box example (docs/sketch-studio-fab-
// shop.md §9 SM-4): a PNG data URL built in plain JS (no canvas, so the
// example also builds in node), the kind of image the print station keeps. A
// tiny PNG encoder (RGBA, deflate "stored" blocks: no compression needed for
// a 64 px image) and the logo itself, drawn by sampling shapes.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const adler32 = (bytes) => {
  let a = 1,
    b = 0;
  for (const v of bytes) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
};
const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
const chunk = (type, data) => {
  const body = [...ascii(type), ...data];
  return [...u32(data.length), ...body, ...u32(crc32(body))];
};

/** An RGBA image (Uint8Array, width × height × 4) as PNG bytes (zlib, stored blocks). */
export function encodePng(width, height, rgba) {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const zlib = [0x78, 0x01];
  for (let at = 0; at < raw.length || at === 0; at += 65535) {
    const block = raw.subarray(at, Math.min(raw.length, at + 65535));
    const last = at + 65535 >= raw.length ? 1 : 0;
    zlib.push(last, block.length & 255, block.length >>> 8, ~block.length & 255, (~block.length >>> 8) & 255, ...block);
    if (last) break;
  }
  zlib.push(...u32(adler32(raw)));
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
    ...chunk('IDAT', zlib),
    ...chunk('IEND', []),
  ]);
}

const base64 = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 4096) binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(binary);
};
/** PNG bytes as a data URL. */
export const pngDataUrl = (bytes) => `data:image/png;base64,${base64(bytes)}`;

const hex = (colour) => [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
const inPolygon = (x, y, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * The example's logo, `size` px square: a gentian-blue rounded square, a
 * white ring and an orange lightning bolt (a control box's "power" mark),
 * anti-aliased by 4 × 4 sampling. Returns a PNG data URL.
 */
export function controlBoxLogo(size = 64) {
  const blue = hex('#004f7c'),
    white = [255, 255, 255],
    orange = hex('#e25303');
  const bolt = [
    [0.56, 0.16],
    [0.3, 0.54],
    [0.47, 0.54],
    [0.4, 0.84],
    [0.7, 0.42],
    [0.53, 0.42],
  ];
  // The colour at a point of the unit square (null: transparent).
  const shade = (x, y) => {
    const r = 0.16,
      cx = Math.min(Math.max(x, r), 1 - r),
      cy = Math.min(Math.max(y, r), 1 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null;
    if (inPolygon(x, y, bolt)) return orange;
    const d = Math.hypot(x - 0.5, y - 0.5);
    if (d > 0.36 && d < 0.43) return white;
    return blue;
  };
  const rgba = new Uint8Array(size * size * 4);
  const n = 4;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < n; sy++)
        for (let sx = 0; sx < n; sx++) {
          const c = shade((px + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size);
          if (!c) continue;
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
          acc[3] += 1;
        }
      const at = (py * size + px) * 4;
      if (acc[3]) {
        rgba[at] = Math.round(acc[0] / acc[3]);
        rgba[at + 1] = Math.round(acc[1] / acc[3]);
        rgba[at + 2] = Math.round(acc[2] / acc[3]);
      }
      rgba[at + 3] = Math.round((acc[3] / (n * n)) * 255);
    }
  return pngDataUrl(encodePng(size, size, rgba));
}
