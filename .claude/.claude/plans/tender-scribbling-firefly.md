# Allow Guest Users to Read Posts

## Context
Currently, non-logged-in (guest) users can see the feed but clicking any post card shows the auth modal instead of navigating to the content. The goal is to let guests click post cards and read the full content, while still requiring login for interactions (like, comment, bookmark). Share should remain accessible without login.

## Changes

### 1. PostCards.jsx — Remove auth gate from `viewContent` (line 64-75)
**File:** `client/src/components/HomePage/postCards/PostCards.jsx`

Remove the `if(!session) return openAuthModal()` check (lines 66-68). Wrap the `mutateViews.mutate()` call in `if(session)` so views are only tracked for logged-in users. The navigation via `clickContent()` will proceed for everyone.

```js
const viewContent = (e, ...) => {
    e.stopPropagation();
    // REMOVED: if(!session) return openAuthModal();
    if(session) {
        const formadata = new FormData();
        formadata.append('journalId', journalId);
        mutateViews.mutate(formadata);
    }
    clickContent(e, ...)
}
```

### 2. ContentView.jsx — Add auth check to comment button (line 256-258)
**File:** `client/src/components/HomePage/ContentViewer/ContentView.jsx`

Add `if(!session) return openAuthModal()` to `hanldeClickComments` so guests see the auth modal instead of opening the comment overlay.

### 3. ContentView.jsx — Add auth check to follow button (line 245-248)
Add `if(!session) return openAuthModal()` inside `handleClickFollow` so guests are prompted to log in.

### 4. ContentView.jsx — Fix null-safety crashes for guest users
When `user` is undefined (guest), several property accesses will throw TypeError. Fix all unsafe accesses:

| Line(s) | Current | Fix |
|---------|---------|-----|
| 469 | `user?.userData?.[0].image_url`, `.name`, `.user_email` | `user?.userData?.[0]?.image_url`, `?.name`, `?.user_email` |
| 518 | `user?.userData[0].id` | `user?.userData?.[0]?.id` |
| 526 | `user?.userData[0].id` | `user?.userData?.[0]?.id` |
| 532 | `user?.userData?.[0].id` | `user?.userData?.[0]?.id` |
| 534 | `user?.userData?.[0].id` | `user?.userData?.[0]?.id` |
| 558 | `user?.userData?.[0].image_url`, `.name`, `.user_email` | `user?.userData?.[0]?.image_url`, `?.name`, `?.user_email` |

## Files to Modify
1. `client/src/components/HomePage/postCards/PostCards.jsx` — 1 change (remove auth gate from viewContent)
2. `client/src/components/HomePage/ContentViewer/ContentView.jsx` — ~8 changes (auth checks + null safety)

## What Stays the Same
- Like button: already has auth check in both PostCards and ContentView
- Bookmark button: already has auth check in both PostCards and ContentView
- Repost button: already has auth check in both PostCards and ContentView
- Share button: already works without auth (client-side only)
- Profile click on PostCards feed: stays auth-gated (user didn't request changing this)
- Backend routes: all interaction endpoints already have `requireAuth` middleware

## Verification
1. Open app without logging in
2. Confirm post cards are visible on the feed
3. Click a post card — should navigate to ContentView and show full post content
4. Click like/bookmark/comment buttons — should show auth modal
5. Click share button — should work without auth modal
6. Confirm no JS crashes in console when viewing as guest
