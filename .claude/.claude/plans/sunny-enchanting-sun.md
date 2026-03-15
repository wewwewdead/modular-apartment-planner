# Plan: Add Settings Link to Mobile Sidebar

## Context
The Settings page (`/home/settings`) for changing email/password is accessible from the desktop sidebar but missing from the mobile sidebar. Users on mobile have no way to reach Settings.

## File to Modify

`client/src/components/MobileSidebarLink/MobileSidebarLink.jsx`

## Implementation

Add a Settings menu item after the Collections item and before the theme toggle, following the exact same pattern as the existing items (Notifications, Bookmarks, Collections).

```jsx
<div onClick={() => navigatePath('/home/settings')} className='sidebar-mycollection-container'>
    <div className={location.pathname === '/home/settings' ? 'sidebar-my-collection-bttn-active' : 'sidebar-my-collection-bttn'}>
        Settings
        <svg xmlns="http://www.w3.org/2000/svg" width="28px" height="28px" viewBox="0 0 24 24" fill={location.pathname === '/home/settings' ? "#D4A853" : "#b6b6b6"}>
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z"/>
            <path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.04 7.04 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.05.24.26.42.49.42h4c.24 0 .44-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z"/>
        </svg>
    </div>
</div>
```

Details:
- **SVG icon:** Same gear icon used in the desktop sidebar (`Home.jsx` line 187)
- **Active color:** `#D4A853` (matches mobile sidebar convention for Notifications/Bookmarks)
- **Inactive color:** `#b6b6b6` (standard)
- **Placement:** Between Collections and Theme Toggle (line 98 → 99 in current file)
- **No CSS changes needed** — reuses existing `.sidebar-mycollection-container` and `.sidebar-my-collection-bttn` classes

## Verification
1. Open app on mobile (< 428px) or resize browser
2. Open the sidebar — Settings item visible between Collections and the theme toggle
3. Tap Settings — navigates to `/home/settings`, sidebar closes
4. Active state highlights gold when on `/home/settings`
