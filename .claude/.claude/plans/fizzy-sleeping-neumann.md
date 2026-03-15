# Fix skeleton/content width — add `width: 100%` to Outlet wrapper

## Context
The `<motion.div>` wrapping `<Outlet>` inside `center-bar-holder-container` in Home.jsx has no width set. This causes child content (including `FeedCardSkeleton`) to not fill the container's full width.

## Change

### Home.jsx (line ~329) — add `style={{ width: '100%' }}` to the motion.div

**File:** `client/src/components/HomePage/Home.jsx`

```jsx
// Before
<motion.div
    key={location.pathname}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
>

// After
<motion.div
    key={location.pathname}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
    style={{ width: '100%' }}
>
```

## Verification
1. Set `if(true)` in PostCards.jsx to force skeleton display
2. Skeleton cards should fill the full width of `center-bar-holder-container`
3. Revert `if(true)` back to `if(isLoading)` after confirming
