# Display @username Handle on Profile Pages

## Context
The SEO phases (1-4) are complete. Usernames exist in the database and `/u/:username` routes work. The next step is to visually display the `@username` handle on both the user's own profile (MyProfile) and visited profiles (VisitProfile), so users can see and recognize their handle.

---

## Changes

### 1. `client/src/components/ProfilePage/components/ProfileHeroSection.jsx`
**Current:** Line 51 shows `userData?.user_email` below the name row.
**Change:** Replace email with `@username` handle. The `userData` object already contains the `username` field from Supabase.

```jsx
// Line 51: replace
<p className="profile-user-email">{userData?.user_email}</p>
// with
<p className="profile-user-handle">@{userData?.username}</p>
```

Only show if `userData?.username` exists (same guard pattern as email).

### 2. `client/src/components/VisitProfile/VisitProfile.jsx`
**Current:** Lines 277-287 show the name + badge but no handle.
**Change:** Add `@username` handle below the name row, inside `visited-profile-name-container`. Use `profileUsername` (already resolved on line 59) or fall back to `userData?.username`.

```jsx
// After the visited-profile-name-row div (line 286), add:
{(profileUsername || userData?.username) && (
    <p className="visited-profile-handle">@{profileUsername || userData?.username}</p>
)}
```

### 3. CSS Updates

**`client/src/components/ProfilePage/myprofile.css`** — Rename/update the `.profile-user-email` class (line 640) to `.profile-user-handle`:
```css
.profile-user-handle {
    margin: 0;
    padding: 0;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 500;
    opacity: 0.55;
}
```

**`client/src/components/VisitProfile/visitProfile.css`** — Add `.visited-profile-handle` style (similar muted style):
```css
.visited-profile-handle {
    margin: 0;
    padding: 0;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 500;
    opacity: 0.55;
}
```

---

## Files to Modify
| File | Change |
|------|--------|
| `client/src/components/ProfilePage/components/ProfileHeroSection.jsx` | Replace email with `@username` handle |
| `client/src/components/VisitProfile/VisitProfile.jsx` | Add `@username` below name row |
| `client/src/components/ProfilePage/myprofile.css` | Rename `.profile-user-email` → `.profile-user-handle` |
| `client/src/components/VisitProfile/visitProfile.css` | Add `.visited-profile-handle` class |

## Verification
1. Go to `/profile` — should see `@yourusername` below your display name
2. Go to `/u/someuser` — should see `@someuser` below their display name
3. If a user has no username yet, the handle line should not appear
