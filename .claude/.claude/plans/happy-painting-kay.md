# Fix Profile Share Route Bugs

## Context
The profile share feature was implemented but has 3 bugs:
1. **Wrong redirect URL** — uses `/@username` but client routes use `/u/username`
2. **SVG text not rendering** — Sharp's librsvg doesn't support CSS `<style>` blocks with classes or `rgba()` fill values in SVG, so name/username/bio appear invisible
3. **Background image may silently fail** — errors are swallowed; also need to handle gradient-only backgrounds

## Bug Details

### Bug 1: Wrong URL pattern (`/@` → `/u/`)
**File:** `server/server.js` line ~587
```js
// CURRENT (wrong):
const clientProfileUrl = `${SITE_URL}/@${encodeURIComponent(username)}`;
// CORRECT:
const clientProfileUrl = `${SITE_URL}/u/${encodeURIComponent(username)}`;
```
The client router (`App.jsx:101`) defines `path='/u/:username'`. There is no `/@username` route. The `og:url`, canonical, and redirect all point to a non-existent route.

### Bug 2: SVG text invisible in Sharp
**File:** `server/server.js` lines ~543-555

Sharp renders SVG via librsvg which has limited CSS support:
- `<style>` blocks with CSS classes → **not reliably supported**
- `rgba()` as SVG `fill` value → **not supported** in librsvg (SVG 1.1)

**Fix:** Replace CSS classes with inline SVG attributes. Replace `rgba()` with `fill` + `fill-opacity`:
```xml
<!-- BEFORE (broken) -->
<style>.name { font-family: sans-serif; fill: rgba(255,255,255,0.7); }</style>
<text class="name">...</text>

<!-- AFTER (works) -->
<text font-family="sans-serif" font-size="48" font-weight="700" fill="white" text-anchor="middle">...</text>
<text font-family="sans-serif" font-size="28" fill="white" fill-opacity="0.7" text-anchor="middle">...</text>
```

### Bug 3: Background extraction needs gradient handling
**File:** `server/server.js` lines ~462-478

The `background` column stores either:
- **Image:** `{ backgroundImage: "url(https://...)", backgroundSize: "cover", ... }`
- **Gradient:** `{ background: "#2A7B9B", backgroundImage: "linear-gradient(90deg, ...)" }`

Current code extracts `url()` from `backgroundImage` — this correctly fails for gradients (falls through to dark fallback). But we should also render the gradient as the base layer when there's no image URL.

## Changes

### 1. Fix redirect URL in HTML share route
**File:** `server/server.js`
- Change `/@${encodeURIComponent(username)}` → `/u/${encodeURIComponent(username)}`
- Affects: `clientProfileUrl`, which feeds `og:url`, canonical, meta refresh, JS redirect

### 2. Fix SVG text rendering in image share route
**File:** `server/server.js`
- Remove the `<style>` block entirely
- Use inline SVG attributes on each `<text>` element:
  - `font-family`, `font-size`, `font-weight` as attributes
  - `fill="white"` with `fill-opacity="0.7"` instead of `rgba()`
  - Keep `text-anchor="middle"` as attribute

### 3. Render gradient backgrounds as base layer
**File:** `server/server.js`
- When `backgroundImage` contains `linear-gradient(...)` (no `url()`), render the gradient as an SVG base layer instead of the dark fallback
- Parse the gradient string and create an SVG `<linearGradient>` — OR simpler: just use the `background` (solid color) property as a flat color fill when no image URL is found, since librsvg also has limited gradient parsing
- Simplest approach: if `bgStyle.background` is a hex color and no image URL, use that as the base layer color

## File Modified
| File | Change |
|------|--------|
| `server/server.js` | Fix URL pattern, fix SVG inline styles, handle gradient backgrounds |

## Verification
1. Visit `http://localhost:3000/share/u/{username}/image` — should see 1200x630 JPEG with visible name, @handle, bio text
2. Visit `http://localhost:3000/share/u/{username}` — HTML page should redirect to `/u/{username}` (not `/@username`)
3. Test with user who has: background image, gradient background, no background
4. Paste share URL into Facebook/Twitter debugger to confirm OG preview works
