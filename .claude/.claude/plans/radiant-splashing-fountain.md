# Constellation Line Click → Connected Posts Panel

## Context

When a user clicks/taps a constellation line in the Universe, it currently highlights the line and dims everything else (`focusedConstellation` state), but shows no information about the two connected posts. The user wants a floating panel that displays both connected posts so they can read or fly to either one.

## Current Behavior

- Click constellation line → `handleConstellationFocus(link)` → sets `focusedConstellation`, dims other stars/lines
- Click empty space or press Escape → `handleDismissFocus()` → clears focus
- The `link` object contains: `star_id_a`, `star_id_b`, `a_title`, `b_title`, `label`, `user_id_a`, `user_id_b`, positions
- Full post data (author name, image, snippet) available via `posts.get(star_id)`

## Plan

### Step 1: Create `ConstellationPanel.jsx`

**File:** `client/src/components/Universe/components/ConstellationPanel.jsx`

A floating panel that shows both connected posts. Renders when `focusedConstellation` is set.

**Props:** `constellation`, `posts` (Map), `onClose`, `onReadPost`, `onFlyToStar`

**Layout:**
- Close button (×) top-right
- Constellation label at top (if exists), e.g. "Memories"
- Two post cards stacked vertically, each showing:
  - Author avatar + name
  - Post title
  - Two action buttons: "Read" and "Fly Here"
- Divider or connector icon between the two cards

**Data lookup:** `posts.get(constellation.star_id_a)` and `posts.get(constellation.star_id_b)` for full post data. Fall back to `constellation.a_title` / `constellation.b_title` if post not in map.

### Step 2: Add CSS in `Universe.module.css`

**Desktop (default):**
- `.constellationPanel` — positioned `right: 16px; top: 50%; transform: translateY(-50%)` — floating on the right, vertically centered
- Width: 300px, glass-morphism style matching existing panels
- Each post card: avatar row + title + action buttons

**Mobile (`@media max-width: 600px`):**
- Full-width panel at bottom: `left: 16px; right: 16px; bottom: 56px; top: auto; transform: none`
- Max-height capped with `overflow-y: auto`
- Uses `dvh` safe values matching existing mobile fixes

### Step 3: Wire into `Universe.jsx`

- Import `ConstellationPanel`
- Render it when `focusedConstellation` is truthy (alongside the existing dimming behavior)
- Pass: `constellation={focusedConstellation}`, `posts={posts}`, `onClose={handleDismissFocus}`
- `onReadPost={(postId) => navigate(`/home/post/${postId}`)}`
- `onFlyToStar={(starId) => { handleConstellationTravel(starId, focusedConstellation); handleDismissFocus(); }}`

Place it inside the `universeMode === 'strategic'` block, after the existing preview panels.

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/components/Universe/components/ConstellationPanel.jsx` | Panel showing two connected posts |

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/Universe/Universe.jsx` | Import + render ConstellationPanel when focusedConstellation is set |
| `client/src/components/Universe/Universe.module.css` | Styles for the panel (desktop right-side + mobile bottom) |

## Key Functions to Reuse

- `extractSnippet(post)` — already imported in Universe.jsx, extracts text preview from post
- `handleConstellationTravel(targetStarId, constellation)` — flies camera to a star
- `handleDismissFocus()` — clears focused constellation
- `posts.get(id)` — Map lookup for full post data (has `.users.name`, `.users.image_url`, `.title`, etc.)

## Verification

1. Click a constellation line → panel appears on the right (desktop) or bottom (mobile)
2. Panel shows both post titles, authors, avatars
3. "Read" navigates to the post page
4. "Fly Here" flies the camera to that star and closes the panel
5. Close button (×) or clicking empty space dismisses
6. On mobile (iPhone): panel is full-width at bottom, not cut off by Safari toolbar
7. Panel doesn't appear when in link mode
