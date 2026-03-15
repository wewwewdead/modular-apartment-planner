# Fix Freedom Wall Stickers & Stamps

## Context
Two bugs on the Freedom Wall:
1. **Stickers are empty** — the `freedom_wall_stickers` DB table was created but never seeded. The dropdown shows "No stickers" and nothing can be placed. User wants local emoji-based stickers instead.
2. **Stamps don't appear** — the code flow looks correct but stamps fail silently. Most likely the API call errors (e.g. no active week, DB error) and the optimistic update rolls back with no user feedback. Need to add error visibility.

## Files to Modify
1. `client/src/components/HomePage/freedomWall/FreedomWallPage.jsx` — main changes
2. `client/src/components/HomePage/freedomWall/freedomWall.css` — sticker grid styling
3. `server/services/freedomWallService.js` — update sticker payload sanitizer

## Changes

### 1. Replace database-backed stickers with local emoji stickers
**File:** `FreedomWallPage.jsx`

- Add `STICKER_OPTIONS` constant with emoji stickers (distinct from stamps — larger icons like animals, objects, food):
  ```js
  const STICKER_OPTIONS = {
      dog: "🐶", cat: "🐱", bear: "🐻", unicorn: "🦄",
      rocket: "🚀", rainbow: "🌈", sun: "🌞", moon: "🌙",
      flower: "🌸", tree: "🌳", pizza: "🍕", guitar: "🎸"
  };
  ```
- **Remove**: `StickerNode` component (image-based), `useLoadedImage` hook, `getFreedomWallStickers` query, `stickerAssetMap`, sticker useEffect, `Image as KonvaImage` import, `getFreedomWallStickers` import
- **New `StickerNode`**: renders emoji via `<Text>` (like `StampNode` but with bigger default size ~64px instead of 34px)
- **Replace** sticker `<select>` with emoji button grid (reuse `.fw-stamp-grid` / `.fw-stamp-btn` pattern)
- **Update** `handlePlaceItem` for stickers: store `sticker` key (emoji key) instead of `stickerId`
- **Update** `selectedStickerId` state → `selectedSticker` (default `"dog"`)
- **Update** sticker rendering in items loop to use new emoji-based StickerNode, looking up emoji from `STICKER_OPTIONS[payload.sticker]`

### 2. Fix stamps not appearing — add error feedback
**File:** `FreedomWallPage.jsx`

- Add a `wallError` state to show transient error messages
- In `createItemMutation.onError`, set `wallError` with the error message (clear after 4s via setTimeout)
- Render error message near the footer so users see "Failed to place item" instead of silent failure
- This will surface the actual reason stamps (or any items) fail to appear

### 3. Update sticker backend validation
**File:** `server/services/freedomWallService.js`

- Update `sanitizeStickerPayload` to accept `sticker` field (emoji key string) instead of only `stickerId`:
  ```js
  const sticker = payload?.sticker || payload?.stickerId || "";
  ```
  This keeps backward compatibility with any existing sticker items while supporting the new emoji format.

### 4. Clean up CSS
**File:** `freedomWall.css`

- Add `.fw-sticker-grid` styles (flex wrap grid for emoji sticker buttons) — can reuse `.fw-stamp-grid` and `.fw-stamp-btn` patterns, just with slightly larger buttons (36px)

## Verification
1. Start dev server, navigate to Freedom Wall
2. Select "Sticker" tool → should show emoji grid with 12 options
3. Click canvas → emoji sticker should appear at click location, sized larger than stamps
4. Select "Stamp" tool → click canvas → stamp should appear (if it errors, the error message should now be visible near the footer)
5. Drag/delete owned items → should work
6. Check browser console for any API errors on stamp/sticker creation
