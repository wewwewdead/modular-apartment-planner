# Mobile Layout Redesign — Matching Reference Image 2

## Context
The "Warm Editorial" CSS redesign (Phases 1-11) is complete. The user's reference Image 2 shows a **mobile layout** that differs structurally from the current implementation. The current mobile layout hides the search bar, uses a 6-item bottom nav (Me/Home/Explore/Gallery/Notifications/Bookmarks), and has a floating "Write" FAB. The reference image shows a different mobile UX: a branded top header, visible search bar + inline Write button, a Freedom Wall banner pill, and a 5-item bottom nav (Home/Explore/Gallery/Freedom Wall/Universe). This requires **JSX + CSS changes** (not CSS-only).

---

## What Changes

### Current Mobile Layout
- **Bottom nav**: Me (profile avatar), Home, Explore, Gallery, Notifications, Bookmarks (6 items)
- **Search bar**: Hidden on mobile (`display: none`)
- **Write button**: Floating circular FAB (bottom-right)
- **Top header**: None — newsfeed-header with Writings/Opinions tabs (hidden behavior)
- **Mobile sidebar drawer**: Profile, Sign Out, Collections, Freedom Wall, Universe, Theme toggle

### Target Mobile Layout (Reference Image 2)
- **Top header**: "iskrib" brand text (left) + page context/icon (right)
- **Search row**: Visible search bar + "Write" button inline (replaces FAB)
- **Banner pill**: "Freedom Wall · Speak freely" below search
- **Cards**: Same structure, larger featured images
- **Bottom nav**: Home, Explore, Gallery, Freedom Wall, Universe (5 items)
- **Mobile sidebar drawer**: Profile, Notifications, Bookmarks, Collections, Theme toggle

---

## Implementation Steps

### Step 1: Update Bottom Nav — `MobileNavLink.jsx` + `mobilenavlink.css`

**MobileNavLink.jsx** changes:
- Remove `Me` (profile avatar) nav item
- Remove `Notifications` nav item
- Remove `Bookmarks` nav item
- Add `Freedom Wall` nav item (path: `/home/freedom-wall`)
- Add `Universe` nav item (path: `/universe`)
- Change `activeColor` from `'#5f92ff'` → `'#D4A853'`
- Final order: Home, Explore, Gallery, Freedom Wall, Universe

New SVG icons needed:
- **Freedom Wall**: Reuse SVG from `MobileSidebarLink.jsx` line 77-81 (wall/landscape icon)
- **Universe**: Reuse SVG from `MobileSidebarLink.jsx` line 88-99 (constellation icon), fix `#5f92ff` → `activeColor`

**mobilenavlink.css** changes:
- Adjust spacing for 5 items instead of 6 (slightly more room per item)
- No profile avatar rendering needed anymore

### Step 2: Add Mobile Top Header — New section in `PostCards.jsx` + `postcards.css`

Add a mobile-only header bar above the search bar in `PostCards.jsx`:
```jsx
<div className="mobile-top-header">
    <span className="mobile-brand-text">iskrib</span>
    <button className="mobile-header-profile-btn" onClick={onOpenSidebar}>
        <img src={user?.userData?.[0]?.image_url || '/assets/profile.jpg'} />
    </button>
</div>
```

This requires passing `clickOpenSidebar` down from `Home.jsx` → `PostCards` via the Outlet context or a prop.

**CSS** (`postcards.css` mobile section):
- `.mobile-top-header`: `display: none` on desktop, `display: flex` on mobile
- Sticky top, full width, branded "iskrib" in Playfair Display on left
- Profile avatar button on right (replaces "Me" in bottom nav)

### Step 3: Show Search Bar on Mobile + Inline Write Button

**PostCards.jsx** changes:
- Remove the `.feed-search-shell` class (which causes `display: none` on mobile)
- Add a "Write" button next to the search bar (visible only on mobile)
- The Write button calls the same `handleOpenTextEditor` from Home.jsx (needs prop/context)

**postcards.css** changes:
- Remove `.feed-search-shell { display: none; }` at mobile breakpoint
- Instead, restyle `.search-shell` for mobile: full width, below the mobile header
- Add `.mobile-write-btn` styling: compact pill button, amber accent, inline with search
- Hide the "Visit Freedom Wall" button on mobile (it's now in the bottom nav)

### Step 4: Add Freedom Wall Banner Pill

**PostCards.jsx** changes:
- Add a tappable banner pill between search and feed cards (mobile only):
```jsx
<div className="mobile-fw-banner" onClick={handleVisitFreedomWall}>
    <span>Freedom Wall</span>
    <span className="mobile-fw-banner-sub">Speak freely</span>
</div>
```

**postcards.css** changes:
- `.mobile-fw-banner`: `display: none` on desktop, styled pill on mobile
- Gold/amber gradient background, rounded corners, centered text

### Step 5: Update Mobile Sidebar Drawer — `MobileSidebarLink.jsx` + `mobilesidebarlink.css`

**MobileSidebarLink.jsx** changes:
- Remove Freedom Wall link (moved to bottom nav)
- Remove Universe link (moved to bottom nav)
- Add Notifications link (path: `/home/notifications`, with notif count badge)
- Add Bookmarks link (path: `/home/bookmark`)
- Keep: Profile, Sign Out, Collections, Theme toggle
- Fix `#5f92ff` → `#D4A853` for Universe icon color (cleanup, since we're removing it, but fix any remaining)

**mobilesidebarlink.css** changes:
- Add notification badge styling for the sidebar notification item
- Restyle items for the new set (Notifications + Bookmarks instead of Freedom Wall + Universe)

### Step 6: Update Write FAB → Hidden on Home Feed (Mobile)

**WriteJournalButton.jsx** / **writejournalbutton.css**:
- The FAB is still useful on pages that don't have the inline Write button (Explore, Gallery, etc.)
- On the home feed route (`/home`), hide the FAB since the inline Write button replaces it
- Option: Add a CSS class or route-based conditional to hide it on `/home`

### Step 7: Enlarge Mobile Card Images

**postcards.css** mobile section:
- Change `.card-image-banner { max-height: 160px }` → `max-height: 220px` to match reference's larger featured images
- This is a CSS-only tweak

### Step 8: Fix Leftover `#5f92ff` in JSX Files

**MobileNavLink.jsx** line 23:
- `const activeColor = '#5f92ff'` → `const activeColor = '#D4A853'`

**MobileSidebarLink.jsx** lines 88-98:
- All `#5f92ff` in Universe SVG → `#D4A853`

---

## Files Modified

| File | Type of Change |
|---|---|
| `client/src/components/mobileNavLink/MobileNavLink.jsx` | JSX: New nav items, remove old ones, fix accent color |
| `client/src/components/mobileNavLink/mobilenavlink.css` | CSS: 5-item layout, remove profile avatar styles |
| `client/src/components/HomePage/postCards/PostCards.jsx` | JSX: Mobile header, show search, Write button, FW banner |
| `client/src/components/HomePage/postCards/postcards.css` | CSS: Mobile header, search visible, Write button, FW banner, larger images |
| `client/src/components/MobileSidebarLink/MobileSidebarLink.jsx` | JSX: Remove FW/Universe, add Notifs/Bookmarks, fix accent |
| `client/src/components/MobileSidebarLink/mobilesidebarlink.css` | CSS: Notification badge, restyle items |
| `client/src/components/HomePage/Home.jsx` | JSX: Pass sidebar opener + editor opener to Outlet context |
| `client/src/components/WriteJournalButton/writejournalbutton.css` | CSS: Conditionally hide FAB on home feed |

---

## What Does NOT Change
- All backend code and API endpoints
- Desktop layout (sidebar, center, right sidebar)
- All routing and URL paths
- All state management and data fetching logic
- Auth flows (login, signup, modals)
- Editor component and behavior
- Profile pages, Explore, Gallery page structure
- Desktop sidebar

---

## Verification Plan
1. Start dev server (`npm run dev` in client)
2. Open Chrome DevTools → responsive mode (iPhone 14 / 390px width)
3. Verify mobile top header shows "iskrib" brand + profile avatar
4. Verify search bar is visible with inline "Write" button
5. Verify "Freedom Wall · Speak freely" banner pill appears
6. Verify bottom nav shows: Home, Explore, Gallery, Freedom Wall, Universe (5 items)
7. Tap each bottom nav item — verify navigation works
8. Tap profile avatar in header → verify mobile sidebar opens
9. Verify sidebar shows: Profile, Notifications, Bookmarks, Collections, Theme toggle
10. Verify no FAB appears on home feed (inline Write button replaces it)
11. Navigate to Explore/Gallery → verify FAB still appears there
12. Test dark/light theme toggle from sidebar
13. Test on desktop — verify no visual changes to desktop layout
