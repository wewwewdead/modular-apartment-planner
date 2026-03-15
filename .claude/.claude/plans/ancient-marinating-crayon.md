# Fix: For You feed not updating after interests change

## Context

After saving new writing interests in Settings, the For You feed still shows the same posts. Two bugs:

1. **Stale React Query cache** — `handleSaveInterests` only invalidates `['userData', userId]` but the For You feed uses query key `['journals-for-you', token]` (5-min staleTime). The cached feed is never cleared.
2. **Race condition** — `updateUserInterestsEmbedding` is fire-and-forget (no `await`), so the new embedding may not be in the DB when the feed refetches.

## Fix

### File: `client/src/components/SettingsPage/SettingsPage.jsx`

In `handleSaveInterests`, after the existing `invalidateQueries` call on ~line 90, add a second invalidation for the For You feed cache:

```js
queryClient.invalidateQueries({ queryKey: ['userData', session?.user?.id] });
queryClient.invalidateQueries({ queryKey: ['journals-for-you'] });  // ADD
```

### File: `server/services/uploadService.js`

In `updateInterestsService`, **await** the embedding update instead of fire-and-forget, so the response isn't sent until the new embedding is written:

```js
// Change from fire-and-forget:
updateUserInterestsEmbedding(userId, writingInterests)
    .catch(err => console.error(...));

// To awaited (but still non-fatal):
try {
    await updateUserInterestsEmbedding(userId, writingInterests);
} catch(err) {
    console.error('non-blocking interests embedding error:', err?.message || err);
}
```

This ensures the embedding is in the DB before the 200 response, so when the client invalidates the feed cache and refetches, it gets results based on the new embedding.

## Files modified (2)

1. `client/src/components/SettingsPage/SettingsPage.jsx` — add `['journals-for-you']` cache invalidation
2. `server/services/uploadService.js` — await embedding update in `updateInterestsService`

## Verification

1. Change interests in Settings, save
2. Navigate to For You tab — feed should show different posts matching new interests
3. No errors in server console
