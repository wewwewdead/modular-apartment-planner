# Show Canvas Posts in Homepage Feed with Distinct UI

## Context
Canvas posts are currently **filtered out** of the homepage feed (line 378-379 in PostCards.jsx). The card rendering code already supports canvas posts (CanvasPreview, action buttons, `is-canvas-card` class), but they never appear because of the filter. We need to remove the filter, add a subtle badge, and enhance the visual differentiation.

## Changes

### 1. Remove Canvas Filters (PostCards.jsx)

**Lines 378-388** - Remove the `.filter(canvas)` from both feed and search, delete `hasOnlyCanvasSearchMatches`:
```js
// Before:
const feedJournals = (...).filter((journal) => journal?.post_type !== 'canvas');
const rawSearchedJournals = searchData?.data || [];
const searchedJournals = rawSearchedJournals.filter((journal) => journal?.post_type !== 'canvas');
const hasOnlyCanvasSearchMatches = ...;

// After:
const feedJournals = data?.pages?.flatMap((page) => page.data || []) || [];
const searchedJournals = searchData?.data || [];
```

### 2. Remove Canvas-Only Search UI (PostCards.jsx)

- **Lines 432-440**: Delete the "Canvas matches found in Gallery" hint button
- **Lines 493-514**: Simplify empty state - remove `is-canvas-only` class and `hasOnlyCanvasSearchMatches` ternary branch:
```jsx
<div className="search-empty-state">
    {searchError ? 'Search failed. Please try again.'
     : isSearchMode ? 'No matching posts found.'
     : 'No post available...'}
</div>
```

### 3. Add Canvas Badge (PostCards.jsx ~line 548)

Add a sage-colored badge with a pen-nib SVG icon before the title inside `.feed-title-content`:
```jsx
{isCanvasPost && (
    <span className="canvas-type-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
        </svg>
        Canvas
    </span>
)}
```

### 4. Canvas Badge & Card CSS

**canvaspreview.css** - Add after line 101:
- `.canvas-type-badge` - Sage-tinted pill: uppercase, 0.62rem, `color-mix(sage 12%, bg-secondary)` background, sage border
- `.canvas-type-badge svg` - 11px icon
- Hover state intensifies background/border
- **Top accent bar** (`::before`): 3px gradient stripe (sage -> sage+purple blend) at card top, 0.7 opacity -> 1 on hover

**postcards.css** - Add after ~line 503:
- `.cards.is-canvas-card .feed-title-content` - flex row with gap for badge + title alignment

**Mobile (480px)** - Smaller badge font/padding

## Files Modified
1. `client/src/components/HomePage/postCards/PostCards.jsx` - Remove filter, cleanup search-canvas logic, add badge JSX
2. `client/src/components/HomePage/postCards/CanvasPreview/canvaspreview.css` - Badge styles, top accent bar, mobile
3. `client/src/components/HomePage/postCards/postcards.css` - Canvas card title flex layout

## Verification
1. Start dev server, navigate to homepage feed
2. Confirm canvas posts now appear mixed with journal posts
3. Verify canvas cards show: CanvasPreview thumbnail, sage gradient top bar, "Canvas" badge next to title, "Expand to Doodle" + "Remix" buttons
4. Verify journal cards are unchanged
5. Test search - canvas results should appear inline (no gallery redirect hint)
6. Toggle dark mode - badge and accent bar should adapt
7. Test on mobile viewport (< 480px) - badge should scale down
