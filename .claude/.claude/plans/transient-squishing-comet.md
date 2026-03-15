# Fix Paragraph Click Highlighting — 3 Bugs in Recent Implementation

## Context
We just implemented `.pcl-active` class toggling + `clickedRef` logic, but clicking a paragraph still doesn't highlight it. Three bugs found in the code we just wrote.

## Files to Modify
1. `client/src/components/Stories/ChapterReader/ChapterReader.css`
2. `client/src/components/Stories/ChapterReader/ParagraphCommentLayer.jsx`

---

## Bug 1: CSS Specificity — `.pcl-active` loses to mobile `:hover` (PRIMARY)

The mobile `:hover` transparent rule has **higher specificity** than our `.pcl-active` rule:

| Selector | Specificity |
|----------|-------------|
| `.chapter-reader-content .editor-paragraph[data-paragraph-index]:hover` | 0-4-0 |
| `.chapter-reader-content .editor-paragraph.pcl-active` | 0-3-0 |

On mobile, tapping applies `:hover` state that persists. The transparent rule always wins → highlight never appears.

**Fix:** Add `[data-paragraph-index]` to the `.pcl-active` selector (→ 0-4-0) and move it **after** the mobile media query so source-order breaks the tie in our favor:

```css
/* Delete current .pcl-active block (line 268-271) */

/* After the @media (max-width: 768px) block, add: */
.chapter-reader-content .editor-paragraph[data-paragraph-index].pcl-active {
    background-color: var(--bg-selection);
}
```

## Bug 2: `handleBadgeLeave` ignores `clickedRef`

After clicking a paragraph to lock it, if the cursor passes over the badge and leaves it, `handleBadgeLeave` calls `scheduleLeave` → clears highlight after 450ms. The paragraph `leave` handler checks `clickedRef`, but `handleBadgeLeave` doesn't.

**Fix:** Add early return at top of `handleBadgeLeave`:
```js
const handleBadgeLeave = useCallback((idx, event) => {
    if (clickedRef.current) return;  // ← add this
    // ... rest unchanged
```

## Bug 3: Outside-click listener never registers after hover→click

The outside-click `useEffect` depends on `[hoveredIndex, containerRef]`. On desktop, `mouseenter` already sets `hoveredIndex` to `idx`. When the user then clicks, `setHoveredIndex(idx)` is the same value — React skips the re-render. The effect never re-runs, so the document click listener is never registered.

**Fix:** Add a `clickSeq` counter state. Increment it in the click handler to force the effect to re-run:

```js
const [clickSeq, setClickSeq] = useState(0);

// In paragraph click handler:
const click = () => {
    clearLeaveTimer();
    clickedRef.current = true;
    setHoveredIndex(idx);
    setClickSeq(c => c + 1);  // ← force effect re-run
};

// Update outside-click effect deps:
}, [hoveredIndex, clickSeq, containerRef]);
```

---

## Verification
1. **Mobile tap:** Tap paragraph → highlights + badge stays
2. **Badge leave after click (desktop):** Click paragraph, hover badge, leave badge → highlight persists
3. **Hover-then-click dismiss (desktop):** Hover → click → click outside → highlight dismisses
4. **Normal hover (desktop):** Hover without clicking → leave → highlight fades after 450ms as before
