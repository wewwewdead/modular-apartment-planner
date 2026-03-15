# Plan: Nice Empty State for Explore Page (No Posts This Month)

## Context
The Explore page (`ExplorePage.jsx`) shows "Hottest posts" for the current UTC month via the `get_monthly_hottest_journals` RPC. At the start of a new month (e.g. March 1), when no public posts exist yet, the page shows a plain text line: *"No posts available right now."* — which feels bare. The goal is to replace this with a polished empty state that matches the app's design language.

## Changes

### 1. Replace the plain empty state in `ExplorePage.jsx`
**File:** `client/src/components/HomePage/explore/ExplorePage.jsx` (lines 461–469)

Replace the current `search-empty-state` div with a richer empty state block following the **collections empty state pattern** (the most polished pattern in the codebase):

- Glass-ring icon container with a flame SVG (reusing the existing `FlameIcon` component already defined at line 33)
- Title in Lexend Deca: **"No hot posts yet this month"**
- Subtitle: **"Be the first to publish something — your post could take the #1 spot."**
- Keep the existing `search-empty-state` for the search-specific messages ("No matching posts found." / "Search failed.")

Structure:
```jsx
{journals.length === 0 && (
    searchError ? (
        <div className="search-empty-state">Search failed. Please try again.</div>
    ) : isSearchMode ? (
        <div className="search-empty-state">No matching posts found.</div>
    ) : (
        <div className="explore-empty-state">
            <div className="explore-empty-icon-ring">
                <FlameIcon className="explore-empty-flame" />
            </div>
            <h3 className="explore-empty-title">No hot posts yet this month</h3>
            <p className="explore-empty-description">
                Be the first to publish something — your post could take the #1 spot.
            </p>
        </div>
    )
)}
```

### 2. Add empty state styles to `explore.css`
**File:** `client/src/components/HomePage/explore/explore.css`

Add styles following the existing collections empty state convention (`collection.css` lines 1000–1046):

```css
/* ── Explore empty state ── */
.explore-empty-state {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    min-height: 200px;
    gap: 0.6rem;
    padding: 2.5rem 1.5rem;
    text-align: center;
    border-radius: 14px;
}

.explore-empty-icon-ring {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background-color: var(--bg-glass);
    border: 0.5px solid var(--bg-glass-border);
    color: var(--text-faint);
    margin-bottom: 0.25rem;
}

.explore-empty-flame {
    width: 26px;
    height: 26px;
}

.explore-empty-title {
    font-family: "Lexend Deca", sans-serif;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0;
    letter-spacing: -0.01em;
}

.explore-empty-description {
    font-size: 0.8rem;
    color: var(--text-muted);
    max-width: 260px;
    line-height: 1.5;
    margin: 0;
}
```

## Files Modified
1. `client/src/components/HomePage/explore/ExplorePage.jsx` — replace empty state block (lines 461–469)
2. `client/src/components/HomePage/explore/explore.css` — add ~40 lines of empty state styles

## Reused Existing Code
- `FlameIcon` component (already defined in `ExplorePage.jsx` line 33)
- Collections empty state CSS pattern from `client/src/components/collections/collection.css`
- CSS variables: `--bg-glass`, `--bg-glass-border`, `--text-faint`, `--text-secondary`, `--text-muted`

## Verification
- Open the Explore page at `/home/explore` when no posts exist for the current month
- Confirm the glass-ring flame icon, title, and description render centered
- Toggle dark mode — verify it looks correct in both themes
- Search for something → confirm "No matching posts found." still uses the inline style
- Trigger a search error → confirm "Search failed." message still works
