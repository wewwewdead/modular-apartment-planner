# Fix: Reading progress not saving/restoring reliably (v3)

## Context
v2 fixes (A-D) were applied but progress still isn't reliably saved when users stop at the last paragraph, and scroll doesn't restore to the right spot when returning. Three remaining issues identified:

## Root Cause Analysis

### Issue 1: Save debounce is 3 seconds — too slow for quick exits
The scroll handler debounces `saveProgress` by 3 seconds. If a user scrolls to the last paragraph and navigates away within 3s, the debounced save gets **cleared** in cleanup. The unmount `saveProgress()` call DOES fire, but it's an async POST on an already-unmounting component — it races with StoryDetail's fetch.

### Issue 2: No save on page close / tab switch / browser back
`beforeunload` and `visibilitychange` events are not handled. If the user closes the tab, refreshes, or switches away, the debounce timer gets lost and no unmount cleanup runs.

### Issue 3: Restore relies on potentially stale `location.state`
`handleStartReading` in StoryDetail passes `story.reading_progress.scroll_position` via `location.state`. But this value comes from the cached `['story', storyId]` query, which may be stale if the previous ChapterReader's save POST was still in-flight when StoryDetail loaded. The restore effect trusts `location.state` first and only falls back to a fresh API fetch if it's missing.

## Plan

All changes in **`client/src/components/Stories/ChapterReader/ChapterReader.jsx`**

### Fix 1: Reduce debounce to 1 second
Change the scroll debounce from 3000ms to 1000ms so saves happen more frequently during active reading.

```js
progressTimerRef.current = setTimeout(saveProgress, 1000);
```

### Fix 2: Add `visibilitychange` and `beforeunload` listeners
Save immediately when the user switches tabs or closes/refreshes the page. Use `navigator.sendBeacon` for `beforeunload` (async fetch won't complete during page teardown).

```js
const handleVisibilityChange = () => {
    if (document.hidden) saveProgress();
};

const handleBeforeUnload = () => {
    if (!token || !storyId || !chapterId) return;
    const url = `/api/stories/${storyId}/progress`;
    const body = JSON.stringify({ chapter_id: chapterId, scroll_position: scrollRef.current });
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
};

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', handleBeforeUnload);

return () => {
    container.removeEventListener('scroll', handleScroll);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    saveProgress().then(() => {
        queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    });
};
```

**Auth constraint:** `sendBeacon` can't send auth headers and the backend requires Bearer token auth. So for `beforeunload`, use raw `fetch` with `keepalive: true` + auth headers — the browser will complete the request even after page teardown. For `visibilitychange`, just call the regular `saveProgress()`.

```js
const handleBeforeUnload = () => {
    if (!token || !storyId || !chapterId) return;
    const url = `${BASE_URL}/stories/${storyId}/progress`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ chapter_id: chapterId, scroll_position: scrollRef.current }),
        keepalive: true,
    });
};
```

Need to import `BASE_URL` from `apiHelpers.js`.

### Fix 3: Always fetch fresh progress on restore (don't trust location.state alone)
Change the restore effect to **always fetch from API** when the user has a token, ignoring potentially stale `location.state`. This eliminates the race condition where StoryDetail's cached progress is outdated.

```js
useEffect(() => {
    if (hasRestoredRef.current || !contentReady) return;
    hasRestoredRef.current = true;

    const restoreScroll = (position) => {
        if (!position || position <= 0) return;
        const container = getScrollContainer();
        let lastHeight = -1;
        const attemptScroll = (retries = 0) => {
            setTimeout(() => {
                const scrollableHeight = container.scrollHeight - container.clientHeight;
                if (scrollableHeight <= 0 && retries < 10) { attemptScroll(retries + 1); return; }
                if (scrollableHeight !== lastHeight && retries < 10) { lastHeight = scrollableHeight; attemptScroll(retries + 1); return; }
                if (scrollableHeight > 0) {
                    container.scrollTo({ top: scrollableHeight * position, behavior: 'instant' });
                }
                navigate(location.pathname, { replace: true, state: {} });
            }, 50);
        };
        attemptScroll();
    };

    if (token) {
        // Always fetch fresh progress — location.state may be stale
        getReadingProgress(token, storyId).then(progress => {
            if (progress?.chapter_id === chapterId && progress.scroll_position > 0) {
                restoreScroll(progress.scroll_position);
            } else if (location.state?.scrollPosition) {
                // Fallback to location.state if API returns nothing for this chapter
                restoreScroll(location.state.scrollPosition);
            }
        }).catch(() => {
            // Network error — fall back to location.state
            if (location.state?.scrollPosition) {
                restoreScroll(location.state.scrollPosition);
            }
        });
    } else if (location.state?.scrollPosition) {
        restoreScroll(location.state.scrollPosition);
    }
}, [contentReady]);
```

This way: API is the source of truth, location.state is just a fallback.

## Files to modify
- `client/src/components/Stories/ChapterReader/ChapterReader.jsx` — all 3 fixes

## Verification
1. Scroll to last paragraph, wait 2s, navigate back → "Continue Reading" scrolls to last paragraph
2. Scroll to middle, close tab, reopen → progress saved (check DB)
3. Scroll to bottom, switch tabs, switch back, navigate away → progress saved
4. Navigate chapter A → chapter B → back to chapter A → each restores correctly
5. Page refresh while reading → restores position on return
6. Read a new chapter for first time → starts at top (no stale restore)
