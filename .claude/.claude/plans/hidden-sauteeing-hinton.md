# Fix: Mobile Paragraph Tap Not Triggering Comment Icon/Highlight

## Context
On mobile, tapping **some** paragraphs in ChapterReader doesn't show the highlight or comment icon badge. The issue is in `ParagraphCommentLayer.jsx`'s touch handling.

## Root Cause
The `handleTouchEnd` handler uses `document.elementFromPoint(touch.clientX, touch.clientY)` to find the tapped paragraph. This is unreliable on mobile because:

1. **`elementFromPoint` can return the wrong element** — on mobile browsers, coordinate-based hit testing in nested scrollable containers (`.home-parent-container` with `overflow-y: auto`) can return overlay elements or parent wrappers instead of the actual paragraph
2. **Visible badge anchors intercept** — paragraphs with existing comments have visible badge anchors (`pointer-events: auto`) with `padding-left: 20px` that extends into the paragraph area. `elementFromPoint` returns the badge anchor (not inside `.editor-paragraph`), so `getParagraphIndex` returns null
3. **Taps in line-height gaps** — with `line-height: 1.75` on mobile, tapping between lines can return the `ContentEditable` wrapper instead of the `<p>` element

Meanwhile, the `handleClick` handler already uses `e.target` (which works correctly because actual touch/pointer events respect `pointer-events: none`).

## Fix

### `client/src/components/Stories/ChapterReader/ParagraphCommentLayer.jsx`

**1. Replace `elementFromPoint` with `e.target` in `handleTouchEnd`**

Touch events set `e.target` to the element at the initial touch point (from `touchstart`), and this respects `pointer-events: none`. It's simpler and more reliable than coordinate-based lookup.

```jsx
const handleTouchEnd = (e) => {
    const idx = getParagraphIndex(e.target);
    if (idx == null) return;

    touchHandledRef.current = true;
    clearLeaveTimer();
    clickedRef.current = true;
    setHoveredIndex(idx);
    setClickSeq(c => c + 1);
};
```

### `client/src/components/Stories/ChapterReader/ChapterReader.css`

**2. Add `:active` pseudo-class for badge (mobile touch feedback)**

`:hover` doesn't fire on touch devices. Add `:active` so the badge gives visual feedback when tapped on mobile:

```css
.pcl-badge:hover,
.pcl-badge:active {
    /* existing hover styles */
}

.pcl-badge-active:hover,
.pcl-badge-active:active {
    /* existing hover styles */
}
```

**3. Add tap padding to paragraphs on mobile**

Make paragraphs easier to tap by adding slight padding on mobile:

```css
@media (max-width: 480px) {
    .chapter-reader-content .editor-paragraph[data-paragraph-index] {
        padding: 2px 0;
    }
}
```

## Files Modified
1. `client/src/components/Stories/ChapterReader/ParagraphCommentLayer.jsx` — fix touchend handler
2. `client/src/components/Stories/ChapterReader/ChapterReader.css` — add `:active` states and mobile padding

## Verification
1. Open a chapter on mobile (or mobile emulator)
2. Tap various paragraphs — each should highlight and show the comment badge
3. Tap paragraphs that already have comments — should still highlight
4. Tap the comment badge — should open the comment panel
5. Badge should show visual feedback (scale/color) when tapped
6. Desktop hover behavior should remain unchanged
