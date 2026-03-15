# Plan: Canvas Post Card — Visual Thumbnail Preview

## Context
Currently, canvas posts and journal posts share the same card layout in the feed. Canvas cards only differ by having "Expand to Doodle" / "Remix" buttons and no image thumbnail. The goal is to make canvas cards visually distinct by rendering a **mini preview** of the canvas layout (text snippets + images positioned as they appear on the actual canvas) as a thumbnail at the top of the card — making them look like artwork cards.

## Files to Create
1. **`client/src/components/HomePage/postCards/CanvasPreview/CanvasPreview.jsx`** — Lightweight HTML/CSS preview component
2. **`client/src/components/HomePage/postCards/CanvasPreview/canvaspreview.css`** — Styles for the preview + canvas card accent

## Files to Modify
3. **`client/src/components/HomePage/postCards/PostCards.jsx`** — Main feed: add CanvasPreview, add `is-canvas-card` class
4. **`client/src/components/HomePage/postCards/ProfilePostCards/ProfilePostCards.jsx`** — Profile feed (grid + list): same integration
5. **`client/src/components/HomePage/postCards/ProfilePostCards/VisitedProfilePostCards.jsx`** — Visited profile feed (grid + list): same integration

## Implementation Details

### 1. CanvasPreview Component (`CanvasPreview.jsx`)
- Calls existing `parseCanvasDoc()` from `client/src/utils/canvasDoc.js` to normalize data
- Renders a `position: relative` container with `aspect-ratio` matching the canvas meta (1:1 or 4:5)
- Background matches canvas theme: light (`#FAFAFA`) or dark (`#1A1A1A`)
- Subtle grid dot pattern overlay (matching the canvas editor look)
- **Snippets**: absolute-positioned `<span>` elements using `left: x*100%`, `top: y*100%`, with `rotation`, `scaleX`, `sizeScale` via CSS transform. Font mapping mirrors `FONT_BRUSHES` from CanvasViewer:
  - `serif` → Georgia, `mono` → Courier New, `handwritten` → Comic Sans MS, `bold` → Trebuchet MS
- **Images**: absolute-positioned `<img>` elements with `left: x*100%`, `top: y*100%`, `width: w*100%`
- **x/y are top-left origin** (matching Konva behavior) — no translate(-50%,-50%) needed
- All elements sorted by `zIndex` for correct layering
- Empty canvas: shows subtle "Canvas" label fallback
- Non-interactive (`pointer-events: none`, `aria-hidden="true"`)
- `max-height: 220px` (matching existing `card-image-banner`)

### 2. Canvas Card Accent Styling (`canvaspreview.css`)
- `.cards.is-canvas-card` gets a subtle purple-tinted border using `color-mix(in srgb, var(--accent-purple) 30%, var(--border-card))`
- Hover state: purple-tinted glow shadow
- Works in both light and dark themes via existing CSS variables
- Mobile responsive: `max-height: 160px` at `≤480px`

### 3. Integration in Feed Components
In all 3 card components (PostCards, ProfilePostCards, VisitedProfilePostCards):
- Import `CanvasPreview`
- Add `is-canvas-card` class to the card wrapper when `isCanvasPost`
- Render `<CanvasPreview canvasDoc={journal?.canvas_doc} />` where `card-image-banner` goes (before card-content), only for canvas posts
- For profile grid views: slot the preview into `postcards-grid-img-wrap`

## Verification
1. Create or have existing canvas posts with various content (text only, images only, both, empty)
2. Check the main feed (`/home`) — canvas cards should show the preview thumbnail with purple accent border
3. Check profile page — both grid and list views should show the preview
4. Check visited profile — same
5. Toggle dark/light mode — canvas preview background should respect the canvas theme
6. Check mobile viewport (≤480px) — preview should cap at 160px height
7. Click on the canvas preview — should navigate to full canvas viewer (existing click handler on card)
