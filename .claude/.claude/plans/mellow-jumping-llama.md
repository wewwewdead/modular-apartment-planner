# Fix ExplorePage UI Bugs

## Context
The ExplorePage search UI has two bugs: the suggestions dropdown positions incorrectly when the search type toggle is visible, and the "Suggesting..." pill text uses the wrong loading state when searching people.

## Bug 1: Search suggestions dropdown appears below the type toggle instead of below the search bar

**Root cause:** The `.search-suggestions-dropdown` uses `position: absolute; top: calc(100% - 0.15rem)` relative to `.search-shell` (the nearest positioned ancestor via `position: sticky`). When the `.search-type-toggle` is also visible (which it always is when suggestions show), it adds height to the shell, pushing the dropdown below the toggle instead of directly below the search input.

**Fix:** In `ExplorePage.jsx`, wrap the `search-top-bar` and `search-suggestions-dropdown` in a `<div>` with `position: relative`. This makes the dropdown position relative to the wrapper (whose height = just the top-bar, since the dropdown is absolute and doesn't contribute), so `top: calc(100%)` correctly places it right below the search bar.

**File:** `client/src/components/HomePage/explore/ExplorePage.jsx` (lines 364-443)

```jsx
// Before:
<div className="search-shell" ref={searchShellRef}>
    <div className="search-top-bar">...</div>
    {showSuggestions && (<div className="search-suggestions-dropdown">...</div>)}
    {(condition) && (<div className="search-type-toggle">...</div>)}
</div>

// After:
<div className="search-shell" ref={searchShellRef}>
    <div style={{ position: 'relative' }}>
        <div className="search-top-bar">...</div>
        {showSuggestions && (<div className="search-suggestions-dropdown">...</div>)}
    </div>
    {(condition) && (<div className="search-type-toggle">...</div>)}
</div>
```

## Bug 2: "Suggesting..." pill shows wrong loading state for people search

**Root cause:** Line 392 uses `isSuggestionsLoading` (which tracks post suggestion loading) even when `searchType === "people"`. The correct variable is `isSugLoading` (line 273) which already switches between post/people loading states.

**Fix:** Change `isSuggestionsLoading` to `isSugLoading` on line 392.

**File:** `client/src/components/HomePage/explore/ExplorePage.jsx` (line 392)

```jsx
// Before:
{isSuggestionsLoading && showSuggestions ? "Suggesting..." : "Search"}

// After:
{isSugLoading && showSuggestions ? "Suggesting..." : "Search"}
```

## Files to modify
- `client/src/components/HomePage/explore/ExplorePage.jsx` — both fixes

## Verification
- Open the Explore page
- Type 2+ characters in the search input — suggestions dropdown should appear directly below the search bar, not below the Posts/People toggle
- Switch to "People" tab, type a query — the pill should show "Suggesting..." while people results load (not stuck on "Search")
