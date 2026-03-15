# Fix: Follow button not updating UI dynamically

## Context
After the security refactor (Phase 1E), the `getFollowsData` backend endpoint was changed to use `optionalAuth` middleware — it reads the logged-in user from the JWT via `req.userId` instead of trusting a `loggedInUserId` query param. However, the client-side `getFollowsData` API function was never updated: it still uses `publicGet` (no auth header), so the backend always sees the user as anonymous and `isFollowing` is always `false`.

Additionally, the `useFollowMutation` hook uses a 1-part query key `['followsData']` for its optimistic update, but the actual queries in `VisitProfile` and `ContentView` use a 3-part key `['followsData', userId, visitedUserId]`. This means the optimistic update and cache invalidation never target the correct cache entry.

## Bugs (2)

### Bug 1: `getFollowsData` sends no auth token → `isFollowing` always false
- **File:** `client/API/Api.js:185-186`
- Currently: `publicGet(...)` — no Authorization header sent
- Backend `optionalAuth` never sets `req.userId`, so `isFollowing` query is skipped
- **Fix:** Change to `authedGet` and accept a `token` parameter. Remove the now-unused `loggedInUserId` param from the URL (backend ignores it).

### Bug 2: `useFollowMutation` uses wrong query key → optimistic update misses cache
- **File:** `client/src/utils/useMutation.js:250-279`
- Mutation uses `['followsData']` but queries use `['followsData', userId, visitedUserId]`
- `getQueryData(['followsData'])` returns `undefined` because no exact match exists
- `setQueryData(['followsData'], ...)` writes to a key nobody reads
- `invalidateQueries(['followsData'])` does work (prefix match), but the optimistic update is broken
- **Fix:** Accept `followingId` in the mutation hook. Use `queryClient.setQueryData` with a predicate/filter that matches any `['followsData', *, followingId]` key. Or use `queryClient.setQueriesData` with a query filter.

## Changes

### 1. `client/API/Api.js` — Fix `getFollowsData` to send auth token
```js
// Before:
export const getFollowsData = (loggedInUserId, userIdToFollow) =>
    publicGet(`/getFollowsData?userId=${userIdToFollow}&loggedInUserId=${loggedInUserId}`, ...);

// After:
export const getFollowsData = (token, userIdToFollow) =>
    authedGet(token, `/getFollowsData?userId=${userIdToFollow}`, 'failed to fetch follows data');
```

### 2. `client/src/utils/useMutation.js` — Fix `useFollowMutation` query keys
```js
// Before:
export const useFollowMutation = (session) => {
    ...
    onMutate: async(data) => {
        await queryClient.cancelQueries(['followsData']);
        const previousData = queryClient.getQueryData(['followsData']);
        queryClient.setQueryData(['followsData'], (old) => { ... });
    },
    onError: (err, data, context) => {
        queryClient.setQueryData(['followsData'], context.previousData)
    },
    onSettled: () => {
        queryClient.invalidateQueries(['followsData']);
    }
}

// After — accept followingId, use setQueriesData with predicate:
export const useFollowMutation = (session, followingId) => {
    const queryClient = useQueryClient();
    const queryFilter = {
        queryKey: ['followsData'],
        predicate: (query) => query.queryKey[2] === followingId,
    };

    return useMutation({
        mutationFn: (data) => addFollows(data, session?.access_token),
        onMutate: async () => {
            await queryClient.cancelQueries(queryFilter);
            const allMatching = queryClient.getQueriesData(queryFilter);
            // optimistic: toggle isFollowing and adjust followersCount
            queryClient.setQueriesData(queryFilter, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    followersCount: old.isFollowing ? old.followersCount - 1 : old.followersCount + 1,
                    isFollowing: !old.isFollowing,
                };
            });
            return { allMatching };
        },
        onError: (_err, _data, context) => {
            // rollback all matched queries
            context?.allMatching?.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['followsData'] });
        },
    });
};
```

### 3. `client/src/components/VisitProfile/Visitprofile.jsx` — Update callsites
- Change `getFollowsData(queryKey[1], queryKey[2])` → `getFollowsData(session?.access_token, queryKey[2])`
- Change `useFollowMutation(session)` → `useFollowMutation(session, visitedUserId)`

### 4. `client/src/components/HomePage/ContentViewer/ContentView.jsx` — Update callsites
- Change `getFollowsData(queryKey[1], queryKey[2])` → `getFollowsData(session?.access_token, queryKey[2])`
- Change `useFollowMutation(session)` → `useFollowMutation(session, postData?.userId)`

## Files Modified
1. `client/API/Api.js` — `getFollowsData` signature change
2. `client/src/utils/useMutation.js` — `useFollowMutation` fix
3. `client/src/components/VisitProfile/Visitprofile.jsx` — callsite updates
4. `client/src/components/HomePage/ContentViewer/ContentView.jsx` — callsite updates

## Verification
1. Visit another user's profile → should show correct "Follow" / "Following" state
2. Click Follow → button should instantly flip to "Following", follower count +1
3. Click again (unfollow) → button flips back to "Follow", follower count -1
4. Refresh page → state persists correctly from server
5. View a post by someone you don't follow → Follow button in ContentView works the same way
