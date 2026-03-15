# Add Inline Search Bar to Home Feed

## Context
The Home feed currently has no search capability — just the "iskrib" brand header, filter chips, and the post feed. The web app has a search bar at the top of its Explore page. The user wants the same search experience available directly on the mobile Home feed, with inline results (not navigation to Explore).

Both HomeFeedScreen and ExploreScreen need the same search state + API calls + results UI, so we'll extract shared pieces to avoid duplication.

## Files

| File | Action | Purpose |
|---|---|---|
| `apps/mobile/src/hooks/useSearch.ts` | **Create** | Shared hook for search state + queries |
| `apps/mobile/src/components/SearchResultsView.tsx` | **Create** | Shared search results UI (tabs + users + posts) |
| `apps/mobile/src/screens/Home/HomeFeedScreen.tsx` | **Modify** | Add SearchInput + wire up search |
| `apps/mobile/src/screens/Home/ExploreScreen.tsx` | **Modify** | Refactor to use shared hook + component |

## Step 1 — Create `useSearch` hook

**File:** `apps/mobile/src/hooks/useSearch.ts`

Extract the search state pattern already in ExploreScreen into a reusable hook:
- `query` / `setQuery` state
- `activeTab` / `setActiveTab` state (`'all' | 'users' | 'posts'`)
- `normalizedQuery` memo, `isSearching` derived flag (length >= 2)
- Two `useQuery` calls with keys `['search-users', normalizedQuery]` and `['search-journals', normalizedQuery]`, conditionally enabled based on `activeTab`
- Returns: `{ query, setQuery, activeTab, setActiveTab, isSearching, normalizedQuery, users, journals }`

Reference: ExploreScreen lines defining `query`, `activeTab`, `usersQuery`, `journalsQuery` states.

## Step 2 — Create `SearchResultsView` component

**File:** `apps/mobile/src/components/SearchResultsView.tsx`

Port ExploreScreen's `renderSearchView()` into a standalone component. It's ~80 lines of JSX:
- Horizontal ScrollView with Chip tabs (All / Users / Posts)
- FlatList with `ListHeaderComponent` containing:
  - Users section: avatar rows with name + @handle
  - Posts section: PostCard for each journal
  - EmptyState when no results

**Props interface** — receives all data + callbacks so it stays pure/presentational:
```
activeTab, onTabChange, users, journals, normalizedQuery,
onUserPress, onPostPress, onAuthorPress,
onReact, onComment, onBookmark, onRepost, onEmbeddedPress
```

Reuses styles from ExploreScreen: `tabScrollView`, `tabRow`, `results`, `section`, `sectionTitle`, `userRow`, `userInfo`, `userName`, `userHandle`, `searchPostCard`.

The component needs a `renderPostCard` internal helper that creates `<PostCard>` with the right props, using the same pattern as ExploreScreen's `renderPostCard(j)`.

## Step 3 — Refactor ExploreScreen to use shared pieces

**File:** `apps/mobile/src/screens/Home/ExploreScreen.tsx`

- Replace inline `query`/`activeTab`/`usersQuery`/`journalsQuery` state with `useSearch()`
- Delete `renderSearchView()` function
- Replace `{isSearching ? renderSearchView() : renderDefaultView()}` with `{isSearching ? <SearchResultsView ...props /> : renderDefaultView()}`
- Thread existing handlers (`handleReact`, `handleBookmark`, `handleComment`, `handleRepost`, `handleAuthorPress`, navigation calls) as props to `SearchResultsView`
- Remove styles that moved into `SearchResultsView` (tabScrollView, tabRow, userRow, userInfo, userName, userHandle, searchPostCard) — keep results, section, sectionTitle since they're used by default view too

**This is a pure refactor — no behavior change.** Validates the shared abstractions work before touching HomeFeedScreen.

## Step 4 — Add search to HomeFeedScreen

**File:** `apps/mobile/src/screens/Home/HomeFeedScreen.tsx`

Changes:
1. **Add imports:** `SearchInput`, `Avatar`, `SearchResultsView`, `useSearch`, `useQuery` (from tanstack)
2. **Call hook:** `const { query, setQuery, activeTab, setActiveTab, isSearching, normalizedQuery, users, journals } = useSearch();`
3. **Add SearchInput to header** (below brand text):
   ```jsx
   <View style={styles.header}>
     <Text style={styles.brandText}>iskrib</Text>
     <SearchInput
       value={query}
       onChangeText={setQuery}
       placeholder="Search users or posts..."
       autoCapitalize="none"
       returnKeyType="search"
     />
   </View>
   ```
4. **Add `gap: spacing.md`** to `styles.header` so the search bar has spacing below the brand
5. **Conditionally hide chipRow + FlatList** when `isSearching`:
   ```jsx
   {isSearching ? (
     <SearchResultsView
       activeTab={activeTab}
       onTabChange={setActiveTab}
       users={users}
       journals={journals}
       normalizedQuery={normalizedQuery}
       onUserPress={(id, username) => navigation.navigate('VisitProfile', {userId: id, username})}
       onPostPress={(id) => navigation.navigate('PostDetail', {journalId: id})}
       onAuthorPress={handleAuthorPress}
       onReact={handleReact}
       onComment={handleComment}
       onBookmark={handleBookmark}
       onRepost={handleRepost}
       onEmbeddedPress={(id) => navigation.navigate('PostDetail', {journalId: id})}
     />
   ) : (
     <>
       <View style={styles.chipRow}>...</View>
       <FlatList ...existing feed... />
     </>
   )}
   ```
6. **Extract `handleAuthorPress`** from inside `renderItem` to a standalone function accepting `(item: JournalItem)` — same pattern as ExploreScreen. This is needed so it can be passed as a prop to `SearchResultsView`.

## Verification
1. Run the app on Android/iOS
2. **Home feed:** Confirm search bar appears below "iskrib" brand in header
3. **Type >= 2 chars:** Feed view replaced by search results with All/Users/Posts tabs
4. **Clear search:** Feed view returns with All/Journals chips
5. **Explore tab:** Confirm it still works identically (refactor didn't break anything)
6. **Search results interactions:** Tap a user → VisitProfile, tap a post → PostDetail, react/bookmark/comment/repost all work
