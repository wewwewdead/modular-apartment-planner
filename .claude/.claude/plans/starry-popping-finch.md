# Add Drafts Button to Mobile Sidebar

## Context
The desktop sidebar in `Home.jsx` has a Drafts link (`/home/drafts`), but the mobile sidebar (`MobileSidebarLink.jsx`) is missing it. This adds parity.

## Changes

### File: `client/src/components/MobileSidebarLink/MobileSidebarLink.jsx`

Add a Drafts nav item between Bookmarks and Analytics (matching desktop order). Uses the same SVG icon and route path as the desktop sidebar.

```jsx
<div onClick={() => navigatePath('/home/drafts')} className='sidebar-nav-container'>
    <div className={location.pathname === '/home/drafts' ? 'sidebar-nav-bttn-active' : 'sidebar-nav-bttn'}>
        Drafts
        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill={location.pathname === '/home/drafts' ? "#D4A853" : "#b6b6b6"}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            <polyline points="14 2 14 8 20 8" fill="none" stroke={location.pathname === '/home/drafts' ? "#D4A853" : "#b6b6b6"} strokeWidth="1"/>
            <line x1="16" y1="13" x2="8" y2="13" stroke={location.pathname === '/home/drafts' ? '#fff' : "#b6b6b6"} strokeWidth="2" strokeLinecap="round"/>
            <line x1="16" y1="17" x2="8" y2="17" stroke={location.pathname === '/home/drafts' ? '#fff' : "#b6b6b6"} strokeWidth="2" strokeLinecap="round"/>
        </svg>
    </div>
</div>
```

Insert after the Bookmarks `</div>` (line 82) and before the Analytics `<div>` (line 84).

No CSS changes needed — reuses existing `.sidebar-nav-container`, `.sidebar-nav-bttn`, and `.sidebar-nav-bttn-active` classes.

## Verification
1. Open mobile sidebar (< 480px) — Drafts appears between Bookmarks and Analytics
2. Tap Drafts — navigates to `/home/drafts` and sidebar closes
3. Active state: amber icon when on `/home/drafts`
4. Desktop — no change (mobile sidebar is `display: none` above 480px)
