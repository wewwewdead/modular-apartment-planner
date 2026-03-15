# Fix: Reaction icon not visible in `.cv-actions`

## Context
After the previous round of SVG fill fixes (`#5e5e5eff` → `var(--icon-default)`), the reaction/like icon in ContentView's `.cv-actions` bar still doesn't show. The user confirmed: the `.cv-action-btn` div exists in the DOM but no icon renders inside it.

## Root Cause
The ReactionButton SVG has `fill="none"` on the outer `<svg>` element, with `fill="var(--icon-default)"` only on the `<path>` children. Every other **working** SVG icon in `.cv-actions` puts `fill="var(--icon-default)"` directly on the `<svg>` element:

```
WORKING (comment/share/bookmark):  <svg fill="var(--icon-default)"> or paths inherit
BROKEN  (ReactionButton):          <svg fill="none"> + <path fill="var(--icon-default)">
```

The `fill="none"` on the SVG propagates down through the `<g>` wrappers. While individual path `fill` attributes should theoretically override, this structure fails in practice.

## Fix — `client/src/components/Reactions/ReactionButton.jsx`

Change the `<svg>` element's `fill` from `"none"` to `"var(--icon-default)"`, and remove the now-redundant `fill` on each `<path>` (paths inherit from the SVG parent). This matches the exact pattern of all other working icons:

**Before:**
```jsx
<svg className="svg-like" ... fill="none">
    <g id="style=fill">
    <g id="like">
    <path id="Subtract" ... fill="var(--icon-default)"/>
    <path id="rec" ... fill="var(--icon-default)"/>
```

**After:**
```jsx
<svg className="svg-like" ... fill="var(--icon-default)">
    <g id="style=fill">
    <g id="like">
    <path id="Subtract" ... />
    <path id="rec" ... />
```

Note: The `postcards.css` hover rule `.like-button:hover .svg-like path { fill: rgb(255, 116, 116); }` will continue to work — it targets the paths directly and overrides the inherited fill on hover.

## File to modify
- `client/src/components/Reactions/ReactionButton.jsx` (lines 124-129)

## Verification
1. Open a post in ContentView → thumbs-up icon visible in `.cv-actions` bar
2. Check PostCards feed → same icon visible on each card
3. Hover the icon in PostCards → turns pink (hover rule still works)
4. Click the icon → emoji replaces the SVG, count updates
