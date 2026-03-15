# Plan: Add Canvas Preview to Gallery Cards

## Context
The Canvas Gallery screen was just built with PostCard, infinite scroll, and sort chips — but every canvas card shows empty: no image, no text preview. This is because canvas posts store their visual content in `canvas_doc` (snippets, images, doodles), NOT in the Lexical `content` field. The existing `extractPlainText(content)` and `extractBannerImage(content, images)` both return empty for canvas posts. We need to read `canvas_doc` and render actual canvas artwork in the card banner area.

## Approach
- Add `canvas_doc` to the `JournalItem` type so the field is accessible
- Add a `bannerContent` React node prop to `PostCard` so we can render a custom canvas preview in the banner slot
- Build a new `CanvasPreview` component using plain RN `<View>` + `<Text>` + `<Image>` with absolute positioning, plus `react-native-svg` `<Polyline>` for doodles (both libraries already installed)
- Add a `getCanvasPlainText` helper to extract text from `canvas_doc.snippets` for the body preview
- Wire it all up in `CanvasScreen.tsx`

## Files to Modify

### 1. `apps/mobile/src/lib/api/mobileApi.ts` — add canvas_doc types
Add these types after the existing `UserPreview` type:
```ts
export type CanvasDocMeta = {
  aspectRatio?: '1:1' | '4:5';
  gridEnabled?: boolean;
  theme?: 'light' | 'dark';
};
export type CanvasSnippet = {
  id: string; text: string; x: number; y: number;
  rotation?: number; zIndex?: number; fontStyle?: string;
  scaleX?: number; sizeScale?: number;
};
export type CanvasImage = {
  id: string; src: string; x: number; y: number;
  width: number; height: number; rotation?: number;
  zIndex?: number; scaleX?: number;
};
export type CanvasDoodle = {
  id: string; points: number[]; color?: string; size?: number;
};
export type CanvasDoc = {
  meta?: CanvasDocMeta; snippets?: CanvasSnippet[];
  images?: CanvasImage[]; doodles?: CanvasDoodle[];
};
```
Add to `JournalItem`: `canvas_doc?: CanvasDoc | string | null;`

### 2. `apps/mobile/src/lib/utils/journalHelpers.ts` — add canvas helpers
Add two functions:
- `parseCanvasDoc(raw)` — safely parses string or returns object, returns `CanvasDoc | null`
- `getCanvasPlainText(raw)` — extracts all `snippets[].text`, joins with spaces, trims

### 3. `apps/mobile/src/components/PostCard/PostCard.tsx` — add bannerContent prop
- Add `bannerContent?: React.ReactNode` to `PostCardProps`
- In the non-repost render path, change the banner area to: `{bannerContent ?? (bannerImage ? <Image .../> : null)}`

### 4. `apps/mobile/src/components/CanvasPreview/CanvasPreview.tsx` — NEW file
A lightweight read-only canvas preview component:

**Props**: `canvasDoc: CanvasDoc | string | null`, `width: number`

**Rendering layers** (inside an `overflow: hidden` View):
1. Background color from `meta.theme` (dark: `#1A1A1A`, light: `#FAFAFA`)
2. Images as absolutely positioned `<Image>` components, sorted by zIndex
3. Text snippets as absolutely positioned `<Text>` components, sorted by zIndex
4. Doodles as an `<Svg>` overlay with `<Polyline>` elements

**Font mapping** (web fontStyle → app bundled font):
| fontStyle | App font |
|-----------|----------|
| `handwritten` | `fonts.brand.semiBoldItalic` (PlayfairDisplay-SemiBoldItalic) |
| `serif` / `mono` | `fonts.serif.regular` (Lora-Regular) |
| `bold` | `fonts.ui.bold` (Outfit-Bold) |
| `serifDisplay` | `fonts.brand.semiBold` (PlayfairDisplay-SemiBold) |

**Font size**: `baseFontSize * sizeScale * (previewWidth / 560)`, clamped 6–48px. Base sizes: bold=34, handwritten=32, other=30. The 560 divisor matches the web's logical stage width.

**Position math**: All `x/y/width/height` in canvas_doc are normalized 0–1 floats. Multiply by `previewWidth` and `previewHeight` at render time. Preview height = `min(180, width / aspectRatio)`.

**Empty canvas**: If no snippets, images, or doodles → return `null` (no banner rendered, card degrades to title-only like a text post).

### 5. `apps/mobile/src/screens/Advanced/CanvasScreen.tsx` — wire it up
- Import `CanvasPreview`, `parseCanvasDoc`, `getCanvasPlainText`, `useWindowDimensions`
- Compute `cardWidth = windowWidth - spacing.lg * 2`
- In `renderItem`:
  - Replace `extractPlainText(item.content)` with `getCanvasPlainText(item.canvas_doc)` for body preview
  - Replace `extractBannerImage(...)` with `<CanvasPreview canvasDoc={item.canvas_doc} width={cardWidth} />`
  - Pass `bannerContent` prop instead of `bannerImage` to PostCard
  - Skip bannerContent for empty canvas docs (no snippets/images/doodles)

## Verification
1. `npx tsc --noEmit --project apps/mobile/tsconfig.json` — no new errors
2. Canvas cards show visual preview: background color, positioned text, images, doodle strokes
3. Text body preview shows concatenated snippet text (not empty)
4. Empty canvas posts degrade gracefully (no blank banner)
5. All existing HomeFeedScreen PostCard rendering unaffected (bannerImage path still works)
