# Fix: Reactions/likes/bookmarks not updating dynamically on Following & For You feeds

## Context
When a user reacts to a post on the Following (`/home/following`) or For You (`/home/for-you`) feeds, the UI doesn't update immediately — the user has to refresh to see their reaction. This works correctly on the home feed (`/home`).

**Root cause:** The three interaction mutation hooks (`useReactionMutation`, `useLikeMutation`, `useBookMarkMutation`) in `useMutation.js` perform optimistic cache updates on only 3 query keys:
- `['journals']` — home feed
- `['userJournals']` — own profile
- `['visitedProfileJournals']` — visited profiles

But the Following and For You feeds use different query keys:
- `['journals-following']`
- `['journals-for-you']`

These are never updated, so interactions appear frozen on those feeds.

## File to modify
`client/src/utils/useMutation.js`

## Changes
Add `['journals-following']` and `['journals-for-you']` to the `cancelQueries`, `getQueriesData`, and `setQueriesData` calls in all three mutation hooks:

### 1. `useBookMarkMutation` (lines 58-85)
Add to `cancelQueries`, `getQueriesData`, and `setQueriesData`:
```js
queryClient.cancelQueries({ queryKey: ['journals-following'] });
queryClient.cancelQueries({ queryKey: ['journals-for-you'] });
// ...
...queryClient.getQueriesData({ queryKey: ['journals-following'] }),
...queryClient.getQueriesData({ queryKey: ['journals-for-you'] }),
// ...
queryClient.setQueriesData({ queryKey: ['journals-following'] }, (old) => updateInfiniteJournalsCache(old, updater));
queryClient.setQueriesData({ queryKey: ['journals-for-you'] }, (old) => updateInfiniteJournalsCache(old, updater));
```

### 2. `useLikeMutation` (lines 153-180)
Same pattern — add the two missing query keys to `cancelQueries`, `getQueriesData`, and `setQueriesData`.

### 3. `useReactionMutation` (lines 390-433)
Same pattern — add the two missing query keys to `cancelQueries`, `getQueriesData`, and `setQueriesData`.

## Verification
1. Start the dev server
2. Navigate to `/home/following`
3. React to a post — the reaction count and icon should update instantly
4. Navigate to `/home/for-you` and repeat
5. Verify the home feed (`/home`) still works correctly
6. Test toggling reactions off, switching reaction types, and bookmarking/liking
