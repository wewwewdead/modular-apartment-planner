# Next Step: Server-Side Content Previews (Egress Phase 2)

## Context

The egress audit was just implemented. Fixes 1, 3-6, 8-14 are all done. The single biggest remaining win — **removing `content` (Lexical JSON, 5-100KB per post) from feed queries** — was deferred because the client parses `content` on every card render to extract preview text and thumbnails.

The good news: the server **already** calls `ParseContent()` at write time (for embedding generation) and discards the preview data. We just need to persist it.

**Estimated savings: 60-80% of remaining database egress.**

## What Was Already Done (Egress Phase 1)
- ✅ QueryClient defaults (staleTime 5min, no refetchOnWindowFocus)
- ✅ Removed broad `onSettled` invalidateQueries from like/bookmark/reaction mutations
- ✅ `SELECT *` → explicit columns on `users` table (excludes `interests_embedding`)
- ✅ Image resize per bucket (avatars 400x400, bg 1920x1080, etc.)
- ✅ Share image LRU cache (1hr TTL, 200 entries)
- ✅ checkUser → uses auth context userData instead of separate API call
- ✅ Story comments LIMIT 50/200
- ✅ getDynamicFloor 5min cache
- ✅ searchFollowingUsers bounded to 2000
- ✅ promptService COUNT instead of full row fetch
- ✅ Explore interests staleTime 30min, query key on user.id
- ✅ All query keys changed from access_token to user.id
- ✅ Follow count queries use select('id') instead of select('*')
- ⏳ CDN setup (infrastructure, not code — do separately)
- ⏳ **Content removal from feeds** (this plan)

## The Problem

Every feed card does this client-side:
```js
const parsed = ParseContent(journal.content);   // 5-100KB Lexical JSON
const previewText = parsed.slicedText;           // ≤215 chars
const thumbnail   = parsed.firstImage?.src;      // 1 URL string
```

8 components do this. The full `content` JSON travels from DB → server → client solely to derive ~300 bytes of display data.

## The Fix

### Step 1: Add columns to `journals` table
```sql
ALTER TABLE public.journals
ADD COLUMN IF NOT EXISTS preview_text TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
```

### Step 2: Persist previews at write time
In `server/services/uploadService.js`, the server already calls `ParseContent` at both create (L255-261) and update (L412-418). Capture the preview data:

```js
const parseData = parseTextContentSafely(resolvedContent);
const preview_text = parseData.slicedText || '';
const thumbnail_url = parseData.firstImage?.src || null;
```

Include `preview_text` and `thumbnail_url` in the insert/update payload.

### Step 3: Backfill existing posts
Write a one-time script that:
1. Selects all journals with `preview_text IS NULL` in batches of 100
2. Runs `ParseContent(content)` on each
3. Updates `preview_text` and `thumbnail_url`

File: `server/scripts/backfillPreviews.js`

### Step 4: Add to feed select constants
In `server/services/getService.js`, update the existing `JOURNAL_METADATA_SELECT` and `JOURNAL_METADATA_WITH_COUNTS_SELECT` to include the new columns:

```js
const JOURNAL_METADATA_SELECT = `
    id, user_id, title, preview_text, thumbnail_url,
    post_type, created_at, privacy, views,
    is_repost, repost_source_journal_id, repost_caption, prompt_id,
    users(${JOURNAL_USER_SELECT})
`;
```

### Step 5: Swap all feed queries to metadata select
Replace `JOURNAL_WITH_COUNTS_SELECT` → `JOURNAL_METADATA_WITH_COUNTS_SELECT` in:
- `getJournalsService` (public feed)
- `getUserJournalsService` (own profile)
- `getVisitedUserJournalsService` (visited profile)
- `getBookmarksService` (bookmarks list)
- `searchJournalsService` (search results)
- `attachRepostSources` (repost source fetch)

Remove `content` from RPC row mappings in:
- `getFollowingFeedService`
- `getForYouFeedService`
- `getMonthlyHottestJournalsService`

Remove `content` from explore interests service mapping.

Update SQL RPCs (deployment files):
- `following_feed.sql` — remove `content` from RETURNS TABLE and SELECT
- `personalized_feed.sql` — both `get_for_you_feed` and `get_interest_posts`
- `discovery.sql` — `find_related_posts`

### Step 6: Migrate 8 client components
Each component currently does `ParseContent(journal.content)`. Change to:
```js
// Before
const parsed = ParseContent(journal.content);
const previewText = parsed.slicedText;
const thumbnail = parsed.firstImage?.src;

// After
const previewText = journal.preview_text || '';
const thumbnail = journal.thumbnail_url || null;
```

Components to update (8 files):
| File | Notes |
|------|-------|
| `client/src/components/HomePage/postCards/PostCards.jsx` | Also handles repost_source preview. Still needs `wholeText` for reading time → derive from `preview_text` length or remove |
| `client/src/components/HomePage/postCards/ProfilePostCards/ProfilePostCards.jsx` | List + grid views. Edit flow still needs full content → fetched separately on edit click |
| `client/src/components/HomePage/postCards/ProfilePostCards/VisitedProfilePostCards.jsx` | List + grid views |
| `client/src/components/Bookmarks/Bookmarks.jsx` | Standard swap |
| `client/src/components/HomePage/explore/ExplorePage.jsx` | Hero card + runner cards |
| `client/src/components/HomePage/explore/InterestSections.jsx` | Interest section cards |
| `client/src/components/Notifications/notificationsCards.jsx` | Notification cards |
| `client/src/components/Notifications/UnreadNotificationCard.jsx` | Unread notification cards |

### Step 7: Keep `content` in single-post detail view
`getJournalByIdService` continues using `JOURNAL_WITH_COUNTS_SELECT` (includes `content`) — no change needed.

## Breaking Edge Cases (must fix as part of this change)

### A. Edit from ProfilePostCards — HARD BREAK
`ProfilePostCards.jsx` passes `journal.content` directly to `EditJournal`'s LexicalComposer. Without content in the feed cache, the editor opens blank.

**Fix:** Change `handleClickEdit` to fetch the full journal by ID before opening the editor:
```js
const handleClickEdit = async (e, journalId, journalTitle) => {
    e.stopPropagation();
    setShowSettings(null);
    const fullJournal = await getJournalById(journalId, userId);
    setJournalData({ content: fullJournal.content, id: journalId, title: journalTitle });
    setShowEditor(journalId);
};
```
This adds one small fetch (single post) only when the user explicitly clicks edit — not on every feed render. Acceptable latency.

### B. ContentView click-through — HARD BREAK
When clicking a post from any feed, `viewContent()` passes `journal.content` via `location.state`. ContentView checks `shouldFetchPost = !statePostData || !statePostData.postType` — since `postType` IS present, it skips the fetch and renders blank content.

**Fix:** Change ContentView's gate to also check for content presence:
```js
const shouldFetchPost = !!journalId && (!statePostData || !statePostData?.postType || !statePostData?.content);
```
When content is missing from state, ContentView will fetch the full journal by ID (which still returns content). This also makes the component more resilient.

Additionally, update all `viewContent` callers to stop passing `content` (since it won't exist in feed data):
- `PostCards.jsx` — remove content param from viewContent calls
- `ProfilePostCards.jsx` — remove content param
- `VisitedProfilePostCards.jsx` — remove content param

### C. Safe paths (no fix needed)
- **Direct URL navigation** to `/home/post/:id` — always fetches by ID ✅
- **Repost source viewer** in ContentView — `attachRepostSources` has its own SELECT with content ✅
- **Notifications** — uses independent `NOTIFICATION_JOURNAL_SELECT` with content ✅

### D. Minor: `wholeText` for reading time
`PostCards.jsx` passes `wholeText` to `CalculateText()` for reading time display. Can estimate from `preview_text` length or just remove the reading time indicator from feed cards (it's a minor detail).

### E. Repost sources in feed
`attachRepostSources` does its own SELECT including `content` — this stays as-is since repost source content is needed for the embedded repost card rendering in ContentView.

## Files Modified
| File | Change |
|------|--------|
| `server/sql/content_previews.sql` | New migration: ADD COLUMN preview_text, thumbnail_url |
| `server/services/uploadService.js` | Persist preview_text + thumbnail_url on create/update |
| `server/scripts/backfillPreviews.js` | New: one-time backfill script |
| `server/services/getService.js` | Swap to METADATA selects in all feed queries (NOT getJournalByIdService, NOT attachRepostSources) |
| `server/services/exploreInterestsService.js` | Remove content from mapping |
| `server/sql/following_feed.sql` | Remove content from RPC |
| `server/sql/personalized_feed.sql` | Remove content from both RPCs |
| `server/sql/discovery.sql` | Remove content from RPC |
| `client/.../ContentView.jsx` | Fix shouldFetchPost gate to check for content |
| `client/.../ProfilePostCards.jsx` | Edit handler fetches full journal by ID before opening editor |
| `client/.../PostCards.jsx` | Use preview_text/thumbnail_url, remove content from viewContent |
| `client/.../VisitedProfilePostCards.jsx` | Use preview_text/thumbnail_url, remove content from viewContent |
| `client/.../Bookmarks.jsx` | Use preview_text/thumbnail_url |
| `client/.../ExplorePage.jsx` | Use preview_text/thumbnail_url |
| `client/.../InterestSections.jsx` | Use preview_text/thumbnail_url |
| `client/.../notificationsCards.jsx` | Use preview_text/thumbnail_url (notifications have own SELECT, but can still use the new fields) |
| `client/.../UnreadNotificationCard.jsx` | Use preview_text/thumbnail_url |

## Verification
1. Run migration SQL in Supabase
2. Run backfill script — verify preview_text/thumbnail_url populated
3. Create a new post → verify preview_text and thumbnail_url saved
4. Browse all feed views, profile, bookmarks, explore, notifications
5. Check Network tab: feed API responses should be 60-80% smaller (no content field)
6. Click into a post → verify full content still loads in detail view
7. Edit a post from profile → verify editor still gets full content
