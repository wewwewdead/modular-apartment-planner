# Canvas Card Layout Reorganization

## Context
Canvas post cards in the feed currently show the artwork preview at the top, followed by title/text, then user info at the bottom. The user wants to match a new design (from screenshot) that puts user info at the top, title and excerpt text next, then the canvas artwork, a "CANVAS" label with optional description, and finally the footer with action icons + remix button. This only affects canvas post cards; text posts remain unchanged. A new optional "canvas description" field is also being added.

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/HomePage/postCards/PostCards.jsx` | Restructure canvas card JSX order |
| `client/src/components/HomePage/postCards/postcards.css` | New canvas card header/label/footer styles |
| `client/src/components/HomePage/postCards/CanvasPreview/canvaspreview.css` | Adjust border-radius (preview no longer first child) |
| `client/src/components/HomePage/Canvas/CanvasEditor.jsx` | Add description input + include in canvasDoc.meta |
| `client/src/utils/canvasDoc.js` | Parse description from meta, expose via getCanvasPreview |
| `client/src/components/HomePage/postCards/ProfilePostCards/ProfilePostCards.jsx` | Same layout restructure for list view canvas cards |
| `client/src/components/HomePage/postCards/ProfilePostCards/VisitedProfilePostCards.jsx` | Same layout restructure for list view canvas cards |

## Step 1: Add description to canvasDoc parser

**File:** `client/src/utils/canvasDoc.js`

In `parseCanvasDoc()` (line 125-128), add `description` to the returned meta:
```js
meta: {
    aspectRatio: parsed?.meta?.aspectRatio === '4:5' ? '4:5' : '1:1',
    gridEnabled: Boolean(parsed?.meta?.gridEnabled),
    theme: parsed?.meta?.theme === 'dark' ? 'dark' : 'light',
    description: typeof parsed?.meta?.description === 'string'
        ? parsed.meta.description.trim().slice(0, 120) : ''
}
```

Update `getCanvasPreview()` (line 148) to also return description:
```js
export const getCanvasPreview = (rawCanvasDoc, maxLength = 215) => {
    const parsed = parseCanvasDoc(rawCanvasDoc);
    const wholeText = parsed.snippets.map(s => s.text.trim()).filter(Boolean).join(' ');
    const slicedText = wholeText.length > maxLength ? `${wholeText.substring(0, maxLength)}...` : wholeText;
    return { wholeText, slicedText, description: parsed.meta.description || '' };
};
```

## Step 2: Add description input to Canvas Editor

**File:** `client/src/components/HomePage/Canvas/CanvasEditor.jsx`

- Add `description: ''` to `canvasMeta` state (line 1259-1264)
- Add a small text input in the editor footer area (line 1526-1538), next to the word count, for entering an optional description (placeholder: "Add a short description...")
- Max 120 characters, single line
- Include in `canvasDoc.meta` during save (line 1112-1115):
  ```js
  meta: {
      aspectRatio: canvasMeta.aspectRatio,
      gridEnabled: canvasMeta.gridEnabled,
      theme: canvasMeta.theme,
      description: canvasMeta.description?.trim() || ''
  }
  ```

## Step 3: Restructure canvas card JSX in PostCards.jsx

**File:** `client/src/components/HomePage/postCards/PostCards.jsx` (lines 531-672)

For canvas posts only (`isCanvasPost === true`), reorganize the card sections:

```
Current order:
  1. CanvasPreview (top)
  2. card-content (badge + title + text + remix btn)
  3. card-icons-container (user info + action icons + reading time + settings)

New order:
  1. canvas-card-header (user info: avatar + name + verified + date + settings dots)
  2. card-content (title + text preview — NO canvas badge here, NO remix btn here)
  3. CanvasPreview (artwork)
  4. canvas-card-label ("CANVAS · {description}")
  5. canvas-card-footer (action icons + remix btn)
```

Concrete JSX structure for canvas cards:
```jsx
<motion.div className="cards is-canvas-card">
    {/* 1. Header — user info (only for canvas posts) */}
    <div className="canvas-card-header">
        <div className="user-avatar-container {badgeClass}">
            <img className="user-info-avatar" src={...} />
        </div>
        <div className="user-name-container">
            <p className="user-newsfeed-name">{name}</p>
            <VerifiedBadge ... />
        </div>
        <span className="name-info-separator">·</span>
        <p className="user-post-date">{formatPostDate(...)}</p>
        <div className="canvas-card-header-spacer" />
        <div className="user-post-settings">{/* three-dot SVG */}</div>
    </div>

    {/* 2. Title + text */}
    <div className="card-content">
        <h2 className="feed-title">{truncatedTitle}</h2>
        <p className="feed-text-content">{previewText}</p>
    </div>

    {/* 3. Canvas artwork */}
    <CanvasPreview canvasDoc={journal?.canvas_doc} />

    {/* 4. Label */}
    <div className="canvas-card-label">
        <span className="canvas-type-badge">CANVAS</span>
        {canvasDescription && (
            <span className="canvas-card-description">· {canvasDescription}</span>
        )}
    </div>

    {/* 5. Footer — icons + remix */}
    <div className="card-icons-container">
        {/* like, comment, bookmark, view icons (same as current) */}
        <div className="canvas-card-actions">
            <button className="canvas-card-action-btn is-remix">Remix this Canvas</button>
        </div>
    </div>
</motion.div>
```

Non-canvas posts remain completely untouched — they keep the current layout.

## Step 4: CSS changes

### `postcards.css` — new classes

```css
/* Canvas card header — user info at top */
.canvas-card-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.75rem 1.15rem 0;
}
.canvas-card-header .user-post-settings {
    margin-left: auto;  /* push dots to right */
}

/* Canvas label row below artwork */
.canvas-card-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1.15rem 0;
}
.canvas-card-description {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Move remix button into footer — right-aligned */
.is-canvas-card .canvas-card-actions {
    margin-left: auto;
}
```

### `canvaspreview.css` — adjust border-radius

Canvas preview is no longer the first child, so remove `border-radius: 12px 12px 0 0` and set to `0` (or keep only if it's at the edges). The preview now sits mid-card:
```css
.is-canvas-card .canvas-preview {
    border-radius: 0;
}
```

## Step 5: Update Profile/Visit Profile card layouts

**ProfilePostCards.jsx** — list view canvas cards (lines 162-171) follow the same restructure as PostCards.jsx. Grid view stays unchanged (compact layout).

**VisitedProfilePostCards.jsx** — list view canvas cards follow the same restructure. Grid view stays unchanged.

Both files already import `CanvasPreview`, `getCanvasPreview`, `VerifiedBadge`, and `formatPostDate`, so no new imports needed.

## Verification

1. Start dev server (`npm run dev` in client/)
2. Create a canvas post with a description in the editor — verify description input appears and saves
3. View the feed — canvas card should show: user info at top > title > text > artwork > "CANVAS · description" > icons + remix button
4. View a text post — should be completely unchanged
5. Visit a profile page — list view canvas cards should match the new layout
6. Test mobile responsiveness at 480px breakpoint
7. Test with empty description — should show just "CANVAS" with no separator
8. Test with dark theme — verify colors work in both themes
