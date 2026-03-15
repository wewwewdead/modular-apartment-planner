# Fix Ring Badge on RelatedPosts Avatar

## Context
The ring badge was added but isn't rendering as a circle or glowing. The root cause: `.rp-card-avatar-container` is missing the `display: flex`, `align-items: center`, `justify-content: center`, and `width/height: fit-content` properties that the working PostCards pattern uses (`.user-avatar-container` in `postcards.css:393-398`).

## Changes

### `client/src/components/Discovery/RelatedPosts.css`
Fix `.rp-card-avatar-container` to match the PostCards container pattern:

```css
.rp-card-avatar-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    height: fit-content;
    border-radius: 50%;
    flex-shrink: 0;
}
```

No changes needed to the ring classes (`.rp-avatar-ring-legend`, `.rp-avatar-ring-og`) — the `border` + `box-shadow` approach is correct and matches the notifications/comments pattern.

No JSX changes needed — the container wrapper is already in place.

## Verification
- View a post whose author has `badge = 'legend'` or `'og'` — avatar should show a circular glowing ring
- Authors without a badge should render identically to before
