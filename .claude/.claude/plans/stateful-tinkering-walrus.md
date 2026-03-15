# Distance Tracker — "Lightyears from Home"

## Context

The Universe view shows raw coordinates (`-10230, -24979`) in the bottom-left corner, but this has no emotional weight. Adding a "distance from home" tracker gives the user a sense of scale and adventure as they explore — the further they pan, the bigger the number grows, making the universe feel vast and their journey meaningful.

## Approach

Replace the raw `.coordsLabel` with a distance tracker that shows how far the user is from their home galaxy in "lightyears" (1 world unit = 1 lightyear for simplicity). When the user is near home, it says something cozy; as they pan away, the number grows dramatically.

## Implementation

### File: `client/src/components/Universe/Universe.jsx`

**Compute home position** — the user's "home" is already resolved as `ownGalaxyTarget` (from `galaxy_centroids` or `userHomeCoords` fallback). For logged-out users, home is `{x: 0, y: 0}`.

**Compute distance** — new `useMemo` deriving Euclidean distance from `centerWorld` to home:
```js
const distanceFromHome = useMemo(() => {
    const home = ownGalaxyTarget || { x: 0, y: 0 };
    const dx = centerWorld.x - home.x;
    const dy = centerWorld.y - home.y;
    return Math.round(Math.sqrt(dx * dx + dy * dy));
}, [centerWorld, ownGalaxyTarget]);
```

**Replace `.coordsLabel` JSX** — swap the raw coords for the distance display:
```jsx
<div className={styles.distanceTracker}>
    {distanceFromHome < 50
        ? 'Home'
        : `${distanceFromHome.toLocaleString()} Lightyears from Home`}
</div>
```

### File: `client/src/components/Universe/Universe.module.css`

**Replace `.coordsLabel` with `.distanceTracker`** — same position (bottom-left, above minimap), slightly upgraded styling:
- Slightly larger font for readability (12px vs 11px)
- Same glass morphism background
- Same mobile override (moves to top-right)
- `pointer-events: none` preserved

## Files Summary

| File | Action | Change |
|---|---|---|
| `client/src/components/Universe/Universe.jsx` | Modify | Add `distanceFromHome` memo, replace coordsLabel with distance tracker |
| `client/src/components/Universe/Universe.module.css` | Modify | Rename `.coordsLabel` → `.distanceTracker`, tweak font size |

## Verification

1. Log in, navigate to Universe — should show "Home" when near your galaxy
2. Pan away — number grows: "1,234 Lightyears from Home"
3. Use minimap to jump far — number jumps to large values (e.g. "35,000 Lightyears from Home")
4. Log out, visit Universe — distance measured from origin (0,0)
5. Mobile: tracker appears in top-right corner
