# Fix 3D Preview Image Missing from PDF/PNG Sheet Export

## Context

The 3D preview viewport renders into sheets using an SVG `<image>` element with a PNG data URL (`href`). This works on-screen but produces blank output when exporting to PDF or PNG because the custom export pipeline in `src/export/sheetExport.js` doesn't handle `<image>` elements.

The export code uses a whitelist approach — `walkElement()` (PDF) and `drawElementToCanvas()` (PNG) only handle `svg`, `g`, `rect`, `line`, `polygon`, `polyline`, `path`, and `text`. The `<image>` tag falls into the `default` case which just recurses into children (images have none), so the image is silently skipped.

## File to Modify

**`src/export/sheetExport.js`** — the only file that needs changes.

## Approach

1. **Pre-load images** before export starts (async) — scan SVG for `<image>` elements, decode data URLs into `HTMLImageElement` objects and JPEG byte arrays
2. **PDF export** — embed images as PDF Image XObjects with `/DCTDecode` (JPEG), reference via `Do` operator
3. **PNG export** — draw pre-loaded images onto canvas via `context.drawImage()`

### Step-by-step changes

#### 1. Add `preloadSvgImages(svgElement)` async helper

Scans for all `<image>` elements, loads each `href` data URL into an `HTMLImageElement`, draws onto a temp canvas to get JPEG bytes (via `canvas.toDataURL('image/jpeg')`), returns a `Map<href, { img, width, height, jpegBytes }>`.

#### 2. Add `renderImage(builder, element, imageMap)` for PDF

- Reads `href`, `x`, `y`, `width`, `height` from the SVG `<image>` element
- Looks up pre-loaded JPEG data from imageMap
- Calls `builder.addImage(jpegBytes, pixelWidth, pixelHeight)` → gets back an image name like `Im1`
- Emits PDF commands: `q`, `cm` matrix to position/scale, `/<name> Do`, `Q`

#### 3. Add `drawImageToCanvas(context, element, imageMap)` for PNG

- Reads `href`, `x`, `y`, `width`, `height` from the SVG `<image>` element
- Looks up pre-loaded `HTMLImageElement` from imageMap
- Calls `context.drawImage(img, x, y, width, height)`

#### 4. Extend `PdfBuilder` class

- Add `this.images = []` in constructor
- Add `addImage(jpegBytes, pixelWidth, pixelHeight)` method — stores image data, returns reference name (`Im1`, `Im2`, etc.)
- Modify `finish()`:
  - Create Image XObjects after alpha objects, before content stream
  - Each image XObject: `<< /Type /XObject /Subtype /Image /Width W /Height H /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length L >> stream [jpeg bytes] endstream`
  - Add `/XObject << /Im1 N 0 R ... >>` to page Resources dictionary
  - Adjust object numbering: font → alpha objects → image objects → content stream

#### 5. Add `image` case to `walkElement()` switch

```js
case 'image':
  renderImage(builder, element, imageMap);
  break;
```

Pass `imageMap` as third argument through `walkElement` and its callers.

#### 6. Add `image` case to `drawElementToCanvas()` switch

```js
case 'image':
  drawImageToCanvas(context, element, imageMap);
  break;
```

Pass `imageMap` as third argument through `drawElementToCanvas` and its callers.

#### 7. Wire up in export functions

- `buildVectorPdfFromSvg(svgElement, paperSize, imageMap)` — pass imageMap to walkElement
- `renderSvgToCanvas(svgElement, dpi, imageMap)` — pass imageMap to drawElementToCanvas
- `exportActiveSheetAsPdf` — call `await preloadSvgImages(svgElement)` before `buildVectorPdfFromSvg`
- `exportActiveSheetAsPng` — call `await preloadSvgImages(svgElement)` before `renderSvgToCanvas`

## Image format rationale

Using JPEG with `/DCTDecode` because:
- PDF natively supports JPEG streams — no decoding needed, just embed raw bytes
- Much smaller than raw RGB (1600×1000 image: ~200KB JPEG vs ~4.8MB raw RGB)
- `canvas.toDataURL('image/jpeg', 0.92)` is synchronous and available in all browsers
- The 3D preview is a rendered scene — JPEG compression artifacts are imperceptible

## Verification

1. Create a sheet with a 3D Preview viewport (Source dropdown → "3D Preview")
2. Verify the preview renders on-screen in the sheet
3. Export as PDF → open PDF, confirm 3D preview image is visible and correctly positioned
4. Export as PNG → open PNG, confirm 3D preview image is visible
5. Test with a sheet containing mixed viewports (plan + 3D preview + section) — all should export
6. Test with no 3D preview viewports — export should work unchanged (empty imageMap)
