# Replace Post Card Settings (⋯) with Share Button

## Context
The `.user-post-settings` on each post card currently shows a three-dot (⋯) icon that opens a modal which only displays the post title — essentially a placeholder with no real functionality. The user wants to replace it with a share button that opens the existing `ShareMenu` component (copy link, share to X, share to Facebook, native share), matching the pattern already used in `ContentView.jsx`.

## Files to modify

1. **`client/src/components/HomePage/postCards/PostCards.jsx`** — JSX + imports + state
2. **`client/src/components/HomePage/postCards/postcards.css`** — minor style tweak for share menu positioning

## Changes

### 1. PostCards.jsx — Add imports (top of file, after line 24)
```js
import ShareMenu from "../../ShareMenu/ShareMenu";
import getShareUrl from "../../../utils/getShareUrl";
```

### 2. PostCards.jsx — Add share menu state (near line 43, alongside `postIdSettings`)
```js
const [shareMenuPostId, setShareMenuPostId] = useState(null);
```

### 3. PostCards.jsx — Replace `.user-post-settings` block (lines 955-967)

Replace the three-dot SVG + settings modal with a share icon + ShareMenu:
```jsx
<div className="user-post-settings">
    <svg
        onClick={(e) => {
            e.stopPropagation();
            setShareMenuPostId(shareMenuPostId === journal.id ? null : journal.id);
        }}
        xmlns="http://www.w3.org/2000/svg"
        height="24px"
        viewBox="0 0 24 24"
        width="24px"
        fill="currentColor"
    >
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
    </svg>
    {shareMenuPostId === journal.id && (
        <ShareMenu
            url={getShareUrl(journal.id)}
            title={journal.title || ''}
            onClose={() => setShareMenuPostId(null)}
        />
    )}
</div>
```

### 4. PostCards.jsx — Clean up unused settings code
- Remove `postIdSettings` state (line 43) and `setPostIdSettings`
- Remove `handleClickSettings` function (lines 312-315)
- Remove click-outside `useEffect` for `modalRef` (lines 438-449)
- Remove `modalRef` ref (line 36) — only if not used elsewhere
- Remove `motion` import dependency **only if** no other `<motion.div>` exists (it is used elsewhere, so keep it)

### 5. postcards.css — Update `.setting-modal` styles in mobile media query (line 1153-1159)
The `.setting-modal` CSS becomes unused. No changes needed — the ShareMenu has its own CSS (`sharemenu.css`). We can leave `.setting-modal` as dead CSS or remove it (low priority).

## What stays the same
- The `.user-post-settings` container div and its CSS positioning (including the absolute positioning we just added for mobile) remain unchanged
- The share icon SVG is the same one used in ContentView.jsx
- `ShareMenu` handles its own overlay, positioning, and close behavior

## Verification
1. Click the share icon on any post card — ShareMenu should appear with Copy link, Share to X, Share to Facebook, and native Share options
2. Click "Copy link" — URL is copied, menu closes
3. Click overlay or outside — menu closes
4. Mobile (`<480px`): share icon appears top-right of card footer, inline with author row (from previous CSS fix)
5. Desktop: share icon appears in its normal position in the card footer
6. No console errors or broken references to removed settings code
