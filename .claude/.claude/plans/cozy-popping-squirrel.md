# Add Skeleton Loading State to Draft List

## Context
The DraftList page flickers on visit because the loading state is just plain text ("Loading drafts..."). Replacing it with skeleton placeholder cards will eliminate the visual jump.

## Changes

### 1. `client/src/components/HomePage/Editor/DraftList/DraftList.jsx` (lines 67-74)
Replace the plain text loading state with 3 skeleton draft item placeholders:

```jsx
if (isLoading) {
    return (
        <div className="draft-list-container">
            <h2 className="draft-list-title">Drafts</h2>
            <div className="draft-list-items">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="draft-skeleton-item">
                        <div className="draft-skeleton-content">
                            <div className="draft-skeleton-title" />
                            <div className="draft-skeleton-date" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

### 2. `client/src/components/HomePage/Editor/DraftList/DraftList.css`
Add skeleton styles at end of file, matching the shimmer pattern used in `RelatedPosts.css`:

- `.draft-skeleton-item` — same padding/layout as `.draft-list-item`
- `.draft-skeleton-title` — 60% width, 12px height bar with shimmer
- `.draft-skeleton-date` — 30% width, 10px height bar with shimmer (delayed)
- `@keyframes draft-shimmer` — opacity pulse 0.4 to 0.8 (same as `rp-shimmer`)

## Verification
- Visit the drafts page — should see 3 shimmer rows instead of "Loading drafts..." text
- Once loaded, skeleton replaced by actual draft items or empty state (no flicker)
