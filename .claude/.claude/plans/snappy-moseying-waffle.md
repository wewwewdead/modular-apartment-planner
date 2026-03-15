# Plan: Add useMemo/useCallback Optimizations

## Context
The React client has zero `useMemo` usage (except one in ContentView.jsx) and limited `useCallback`. Multiple components re-derive arrays via `.flatMap()` on every render, and static data structures (icon arrays) are recreated needlessly. This plan adds targeted memoization to the highest-impact spots.

---

## Changes

### 1. Memoize `.flatMap()` on paginated data (7 files)

Every infinite-query component flattens `data.pages` into a single array on every render. These grow with each page load. Wrap each in `useMemo`.

| File | Line | Current | Memoized |
|------|------|---------|----------|
| `client/src/components/HomePage/postCards/PostCards.jsx` | 411 | `const feedJournals = activeFeedData?.pages?.flatMap(...)` | `useMemo(() => ..., [activeFeedData])` |
| `client/src/components/HomePage/postCards/ProfilePostCards/ProfilePostCards.jsx` | 304 | `const journals = data?.pages.flatMap(...)` | `useMemo(() => ..., [data])` |
| `client/src/components/HomePage/postCards/ProfilePostCards/VisitedProfilePostCards.jsx` | 68 | `const journals = journalData?.pages.flatMap(...)` | `useMemo(() => ..., [journalData])` |
| `client/src/components/Bookmarks/Bookmarks.jsx` | 106-107 | Two separate `.flatMap()` calls | Single `useMemo` returning `{ journals, totalBookmarks }` with dep `[data]` |
| `client/src/components/Notifications/notificationsCards.jsx` | 177 | `const notifications = data?.pages?.flatMap(...)` | `useMemo(() => ..., [data])` |
| `client/src/components/Stories/StoryDashboard/StoryDashboard.jsx` | 23 | `const stories = data?.pages?.flatMap(...)` | `useMemo(() => ..., [data])` |
| `client/src/components/Stories/StoryBrowser/StoryBrowser.jsx` | 92 | `const stories = data?.pages?.flatMap(...)` | `useMemo(() => ..., [data])` |
| `client/src/components/Stories/StoryLibrary/StoryLibrary.jsx` | 23 | `const stories = data?.pages?.flatMap(...)` | `useMemo(() => ..., [data])` |

Each file needs `useMemo` added to its React import.

### 2. Memoize derived search data in PostCards.jsx

**File:** `PostCards.jsx:412-416`

```
const searchedJournals = searchData?.data || [];
const searchedUsers = userSearchData?.data || [];
const suggestionItems = searchType === 'people' ? ... : ...;
```
Wrap `suggestionItems` in `useMemo` with deps `[searchType, userSuggestionData, suggestionData]`.

### 3. Memoize static `iconArray` in notification components

**Files:**
- `client/src/components/Notifications/UnreadNotificationCard.jsx` — lines 44-105
- `client/src/components/Notifications/notificationsCards.jsx` — has similar pattern

The `iconArray` contains static SVG elements but is recreated on every render. Move outside the component (module-level constant) since it has no dependencies on props/state.

### 4. Memoize `currentUtcMonthKey` in ExplorePage

**File:** `client/src/components/HomePage/explore/ExplorePage.jsx:208`
```
const currentUtcMonthKey = `${new Date().getUTCFullYear()}-${...}`;
```
Wrap in `useMemo(() => ..., [])` — the month won't change during a session.

### 5. Memoize `totalWords` in StoryDetail

**File:** `client/src/components/Stories/StoryDetail/StoryDetail.jsx:68`
```
const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
```
Wrap in `useMemo(() => ..., [chapters])`.

---

## Verification

1. Run `cd client && npx vite build` — confirm no import errors or build failures
2. Manual smoke test: navigate through feed, profile, bookmarks, notifications, stories — confirm data still renders correctly
3. Check React DevTools Profiler (optional) to confirm fewer unnecessary re-renders on scroll/pagination
