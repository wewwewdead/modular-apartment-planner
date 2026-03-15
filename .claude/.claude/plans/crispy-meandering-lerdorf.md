# Fix: Mention chip navigates to VisitProfile instead of own profile

## Context
When a logged-in user clicks a `.mention-chip` that references **themselves**, they are sent to the VisitProfile page instead of their own profile (`/profile` → MyProfile.jsx). The root cause is a wrong property access on the `user` object.

## Root Cause
**File:** `client/src/components/HomePage/Editor/nodes/MentionComponent.jsx:12`

```js
handleClickProfile(navigate)(e, user?.id, mentionUserId, mentionUsername);
//                              ^^^^^^^^ BUG: always undefined
```

`user` from `useAuth()` is the React Query data with shape `{ userData: [{ id, name, ... }] }` (set at `Authcontext.jsx:139`). There is no top-level `.id` property — the actual user ID lives at `user?.userData?.[0]?.id`.

Since `undefined !== mentionUserId` is always true, the `loggedInUserId === clickedUserId` check in `handleClickProfile` never matches, so it always falls through to the visit-profile route.

Every other component in the app uses the correct path:
- `PostCards.jsx` → `user?.userData?.[0]?.id`
- `commentsCards.jsx` → `user?.userData[0].id`
- `ContentView.jsx` → `user?.userData?.[0]?.id`
- `ExplorePage.jsx` → `user?.userData?.[0]?.id`

## Fix
**One-line change** in `MentionComponent.jsx:12`:

```js
// Before:
handleClickProfile(navigate)(e, user?.id, mentionUserId, mentionUsername);

// After:
handleClickProfile(navigate)(e, user?.userData?.[0]?.id, mentionUserId, mentionUsername);
```

## Files Modified
- `client/src/components/HomePage/Editor/nodes/MentionComponent.jsx` (line 12)

## Verification
1. Log in, create/view a post that @mentions yourself
2. Click the mention chip → should navigate to `/profile` (MyProfile)
3. Click a mention chip for a different user → should navigate to `/u/{username}` (VisitProfile)
4. When not logged in, clicking any mention chip should navigate to visit profile as before
