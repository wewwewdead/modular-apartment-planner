# Fix: Mobile paragraph highlight off-by-one in ChapterReader

## Context
On mobile, tapping a paragraph in `ParagraphCommentLayer` highlights the **paragraph above** the tapped one and shows the comment icon at the wrong position. Desktop works correctly.

## Root Cause Analysis
The component attaches individual `mouseenter`/`mouseleave`/`click` event listeners to each `.editor-paragraph` DOM node. On mobile, browsers generate **synthetic mouse events** after a tap (`mouseenter` → `mousedown` → `mouseup` → `click`). The `mouseenter` fires first and can target a slightly different element than `click` due to how mobile browsers calculate synthetic event coordinates from the touch area. Since `mouseenter` immediately sets `hoveredIndex` (triggering a React render that makes the badge visible with `pointer-events: auto`), the subsequent `click` can be intercepted by the now-visible badge overlay, compounding the off-by-one.

Additionally, badge positioning uses `el.offsetTop`/`el.offsetHeight` which are cached once during `scanParagraphs` and can become stale after layout shifts (font loading, images, etc.).

## Fix — `ParagraphCommentLayer.jsx`

### 1. Switch to event delegation for click/tap handling
Replace individual `click` handlers on each paragraph with a single delegated listener on the container. Use `e.target.closest('.editor-paragraph[data-paragraph-index]')` to identify which paragraph was tapped. This is more reliable because it uses the actual click target rather than closured indices.

### 2. Add `touchend` handler for mobile precision
Add a `touchend` listener on the container that:
- Gets touch coordinates from `e.changedTouches[0]`
- Uses `document.elementFromPoint(clientX, clientY)` for precise hit-testing
- Calls `.closest('.editor-paragraph[data-paragraph-index]')` to find the paragraph
- Sets a flag to ignore the subsequent synthetic `click` (prevent double-firing)

### 3. Replace `offsetTop` with `getBoundingClientRect()` for badge positioning
Instead of caching `el.offsetTop` and `el.offsetHeight`, compute positions relative to the container using:
```js
const containerRect = container.getBoundingClientRect();
const elRect = el.getBoundingClientRect();
const top = elRect.top - containerRect.top + container.scrollTop;
const height = elRect.height;
```
This is immune to intermediate positioned ancestors and handles dynamic layout changes.

### 4. Keep `mouseenter`/`mouseleave` for desktop hover (no change needed)
Desktop hover behavior works correctly and should remain as-is.

## Files to Modify
- `client/src/components/Stories/ChapterReader/ParagraphCommentLayer.jsx` — all changes are in this single file

## Verification
1. **Mobile**: Open ChapterReader on mobile (or Chrome DevTools mobile emulation), tap paragraphs, verify correct paragraph highlights and badge appears at the correct position
2. **Desktop**: Hover over paragraphs, verify badge still appears on hover, click works to open comment panel
3. **Edge cases**: Test with chapters containing images, headings mixed with paragraphs, and short single-line paragraphs
