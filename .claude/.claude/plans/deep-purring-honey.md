# Add Glowing Badge Ring to RelatedPosts Avatar

## Context
The RelatedPosts cards show author avatars but don't display the glowing ring effect for "legend" and "og" badge holders, unlike PostCards which does. The `user_badge` data is already available on the post object.

## Changes

### 1. `client/src/components/Discovery/RelatedPosts.jsx` (lines 67-75)
Wrap the avatar img/placeholder in a container div with conditional ring classes, same pattern as PostCards.jsx line 896-898:

```jsx
{/* Before */}
{post.user_image_url ? (
    <img src={post.user_image_url} alt="" className="rp-card-avatar" />
) : (
    <div className="rp-card-avatar rp-card-avatar-placeholder" />
)}

{/* After */}
<div className={`rp-card-avatar-container${post.user_badge === 'legend' ? ' avatar-ring-legend' : post.user_badge === 'og' ? ' avatar-ring-og' : ''}`}>
    {post.user_image_url ? (
        <img src={post.user_image_url} alt="" className="rp-card-avatar" />
    ) : (
        <div className="rp-card-avatar rp-card-avatar-placeholder" />
    )}
</div>
```

### 2. `client/src/components/Discovery/RelatedPosts.css`
Add ring styles + keyframes after `.rp-card-avatar-placeholder` (after line 147):

```css
.rp-card-avatar-container {
    flex-shrink: 0;
    border-radius: 50%;
    line-height: 0;
}
.rp-card-avatar-container.avatar-ring-legend {
    border: 2px solid #FFD700;
    box-shadow:
        0 0 6px 1px rgba(255, 215, 0, 0.5),
        0 0 12px 2px rgba(255, 215, 0, 0.35),
        0 0 20px 4px rgba(255, 215, 0, 0.2);
    animation: rp-glow-legend 2s ease-in-out infinite alternate;
}
.rp-card-avatar-container.avatar-ring-og {
    border: 2px solid #9B59FF;
    box-shadow:
        0 0 6px 1px rgba(155, 89, 255, 0.5),
        0 0 12px 2px rgba(155, 89, 255, 0.35),
        0 0 20px 4px rgba(155, 89, 255, 0.2);
    animation: rp-glow-og 2s ease-in-out infinite alternate;
}
@keyframes rp-glow-legend {
    from { box-shadow: 0 0 6px 1px rgba(255,215,0,0.5), 0 0 12px 2px rgba(255,215,0,0.35), 0 0 20px 4px rgba(255,215,0,0.2); }
    to   { box-shadow: 0 0 8px 2px rgba(255,215,0,0.6), 0 0 16px 4px rgba(255,215,0,0.4), 0 0 24px 6px rgba(255,215,0,0.25); }
}
@keyframes rp-glow-og {
    from { box-shadow: 0 0 6px 1px rgba(155,89,255,0.5), 0 0 12px 2px rgba(155,89,255,0.35), 0 0 20px 4px rgba(155,89,255,0.2); }
    to   { box-shadow: 0 0 8px 2px rgba(155,89,255,0.6), 0 0 16px 4px rgba(155,89,255,0.4), 0 0 24px 6px rgba(155,89,255,0.25); }
}
```

## Verification
- Open a post in Related Posts that has an author with a "legend" or "og" badge
- The avatar should show a glowing gold (legend) or purple (og) ring, matching the PostCards feed
- Non-badge authors should have no ring
