# Move Following / For You / Stories Buttons into Mobile Bottom Nav

## Context
The Following, For You, and Stories feed-filter buttons currently live inline in PostCards.jsx as a `search-nav-row`. On mobile (≤480px), this row competes for vertical space with the feed content. Moving these into the MobileNavLink floating bottom bar consolidates all mobile navigation into one place, giving a cleaner mobile UX.

## Files to Modify

| File | Action |
|------|--------|
| `client/src/components/mobileNavLink/MobileNavLink.jsx` | Add 3 new nav items |
| `client/src/components/mobileNavLink/mobilenavlink.css` | Adjust for 4-5 items |
| `client/src/components/HomePage/postCards/postcards.css` | Hide `search-nav-row` on mobile |

## Changes

### 1. `MobileNavLink.jsx` — Add nav items

- Destructure `user` from `useAuth()` (already imports it, currently only uses `session` and `openAuthModal`)
- Compute `hasInterests` from `user?.userData?.[0]?.writing_interests`
- Add 3 entries to the `navLinks` array between Home and Explore:
  - **Following** → `/home/following` (people icon, 22px)
  - **For You** → `/home/for-you` (smiley icon, 22px) — **conditionally included** only when `hasInterests`
  - **Stories** → `/home/stories` (book icon, 22px)
- Use same SVG icons from PostCards.jsx but scaled to 22px (slightly smaller than Home/Explore's 24px to fit 5 items)
- Active detection already works via `location.pathname === link.path`
- Final order: **Home → Following → For You? → Stories → Explore**

### 2. `mobilenavlink.css` — Fit more items

- Reduce icon container padding slightly for 5-item layout
- Shrink font size from `0.54rem` to `0.5rem` to avoid wrapping
- Optionally reduce item padding from `0.25rem 0.5rem` to `0.2rem 0.35rem`

### 3. `postcards.css` — Hide inline row on mobile

Add inside the existing `@media (max-width: 480px)` block:
```css
.search-nav-row {
    display: none;
}
```
This keeps the search-nav-row visible on desktop/tablet but hides it on mobile where the bottom bar takes over.

## Verification
1. Desktop (>480px): search-nav-row still appears inline above the feed, bottom nav bar not visible
2. Mobile (≤480px): bottom nav shows Home, Following, [For You], Stories, Explore — search-nav-row is hidden
3. Tapping Following navigates to `/home/following`, button highlights amber
4. For You only appears when user has `writing_interests`
5. Stories navigates to `/home/stories`
