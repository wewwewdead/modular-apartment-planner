# Fix "Show Replies" Always Loading

## Context

After implementing recursive comment threading, clicking "Show replies" shows a loading spinner that never resolves. The `CommentThread` component calls `socialApi.getReplies(postId, comment.id)` which hits `/getComments?postId=...&parentId=...`. This endpoint likely doesn't handle the `parentId` parameter correctly on the backend (returns errors or empty data), and react-query's default 3 retries + apiClient's 2 retries create a spinner that lasts 2+ minutes before failing.

This was broken before our recursive changes too — the query was identical in the old code — but became noticeable now that recursive threading is the focus.

## File

`apps/mobile/src/screens/Home/PostDetailScreen.tsx`

## Approach: Client-Side Reply Tree

Instead of making a separate API call per comment to fetch replies, build the reply tree client-side from the already-loaded comments data. This avoids the broken `getReplies` endpoint entirely.

### 1. Increase comment fetch limit and pass full list to CommentThread

Change the `getComments` query to fetch more comments (100 instead of 20), and pass the full `comments` array as a prop to `CommentThread`:

```tsx
// In commentsQuery:
queryFn: () => socialApi.getComments(journalId, null, 100),

// In CommentThreadProps, add:
allComments: JournalComment[];
```

### 2. Derive replies from `allComments` instead of `useQuery`

Remove the `useQuery` for `comment-replies` inside `CommentThread`. Replace with:

```tsx
const replies = allComments.filter(c => c.parent_id === comment.id);
const replyCount = comment.reply_count ?? replies.length;
```

This gives instant expansion — no loading spinner, no API call per comment.

### 3. Remove `repliesQuery` loading/error states

Since replies come from already-loaded data, remove the `repliesQuery.isLoading` and `repliesQuery.isError` branches. The `isExpanded` toggle just shows/hides the already-available children.

### 4. Update call site

Pass `allComments={comments}` to the top-level `<CommentThread>`.

### 5. Update recursive calls

Each nested `<CommentThread>` also receives `allComments={allComments}` so it can find its own children.

### 6. Update addComment invalidation

When a new reply is posted, `queryClient.invalidateQueries({queryKey: ['journal-comments', journalId]})` already re-fetches all comments. Remove the `['comment-replies', parentId]` invalidation since that query no longer exists. Also auto-expand the parent so the new reply is visible.

---

## Verification

1. Click "Show replies" on a comment with replies — replies appear instantly (no spinner)
2. Reply to a reply — new reply appears nested under its parent after posting
3. Show/Hide at any depth — works independently at every level
4. Indentation — each level is visually indented with left border
5. Auth gating — Reply button only shows when logged in
