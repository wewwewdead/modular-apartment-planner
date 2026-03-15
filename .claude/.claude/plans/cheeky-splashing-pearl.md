# Fix: Opinions page inherits feed scroll position

## Context
When a user scrolls deep on the feed page (`/home`) and navigates to the opinions page (`/home/opinions`), the page stays at the same scroll position. This causes two problems:
1. The page doesn't start at the top
2. The `useInView` infinite scroll observer is already in the viewport, triggering multiple `fetchNextPage` calls and fetching too many opinions

**Root cause:** The actual scroll container is `.home-parent-container` (which has `overflow-y: auto` in `home.css`), NOT `window`. The current fix uses `window.scrollTo(0, 0)` which resets the wrong element.

## Plan

### Single change in `client/src/components/SidebarOpinions/OpinionssPage.jsx`

Replace `window.scrollTo(0, 0)` with a query for the actual scroll container:

```js
useLayoutEffect(() => {
    const scrollContainer = document.querySelector('.home-parent-container');
    if (scrollContainer) {
        scrollContainer.scrollTop = 0;
    } else {
        window.scrollTo(0, 0);
    }
}, [])
```

This resets the correct element's scroll position before the browser paints, so:
- The page starts at the top immediately (no flash)
- The `useInView` sentinel is below the fold, so it won't trigger premature fetches
- The `scrollReady` guard + `requestAnimationFrame` delay (already added) provides a second safety net

Keep the existing `scrollReady` gate on `fetchNextPage` as a belt-and-suspenders safeguard.

### File to modify
| File | Change |
|------|--------|
| `client/src/components/SidebarOpinions/OpinionssPage.jsx` | Fix `useLayoutEffect` to reset `.home-parent-container.scrollTop` instead of `window.scrollTo` |

### Verification
- Scroll deep on the feed page (`/home`)
- Click "Opinions" tab to navigate to `/home/opinions`
- Page should start at the top with no scroll flash
- Only the initial page of opinions should be fetched (not multiple pages)
