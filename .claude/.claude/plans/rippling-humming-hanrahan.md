# Add Ring Badges to Dashboard Prompt Avatar Strip

## Context
The avatar strip in the dashboard prompt section already deduplicates by `user_id` and slices to 10. However, avatars render as plain `<img>` tags without the ring badge glow that legend/OG users get in the modal. The ring badge CSS (`.prompt-response-avatar-wrap`, `.pr-ring-legend`, `.pr-ring-og`) already exists in `DashboardBriefing.css` (lines 550-604) and is used in `PromptResponsesModal.jsx`. We just need to reuse it.

## File to Change

### `client/src/components/DashboardBriefing/PromptSection.jsx`

Wrap each avatar `<img>` in a `<div>` with the existing ring class, same pattern as `PromptResponsesModal.jsx` line 94:

**Current code (lines 39-47):**
```jsx
{avatars.map((r, i) => (
    <img
        key={r.id}
        src={r.users?.image_url || '/assets/profile.jpg'}
        alt=""
        className="dashboard-prompt-avatar"
        style={{ zIndex: avatars.length - i }}
    />
))}
```

**New code:**
```jsx
{avatars.map((r, i) => (
    <div
        key={r.id}
        className={`dashboard-prompt-avatar-wrap${
            r.users?.badge === 'legend' ? ' pr-ring-legend' :
            r.users?.badge === 'og' ? ' pr-ring-og' : ''
        }`}
        style={{ zIndex: avatars.length - i }}
    >
        <img
            src={r.users?.image_url || '/assets/profile.jpg'}
            alt=""
            className="dashboard-prompt-avatar"
        />
    </div>
))}
```

### `client/src/components/DashboardBriefing/DashboardBriefing.css`

Add a new `.dashboard-prompt-avatar-wrap` class (after `.dashboard-prompt-avatar`, around line 372) that mirrors `.prompt-response-avatar-wrap` but sized for the 32px thumbnail avatars:

```css
.dashboard-prompt-avatar-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
}
```

The existing `.pr-ring-legend` and `.pr-ring-og` selectors target any element with those classes, but they're currently scoped to `.prompt-response-avatar-wrap.pr-ring-*`. We need to add matching selectors for the new wrapper:

```css
.dashboard-prompt-avatar-wrap.pr-ring-legend {
    border: 2px solid #FFD700;
    box-shadow:
        0 0 4px 1px rgba(255, 215, 0, 0.4),
        0 0 8px 2px rgba(255, 215, 0, 0.25);
    animation: pr-glow-legend 2s ease-in-out infinite alternate;
}

.dashboard-prompt-avatar-wrap.pr-ring-og {
    border: 2px solid #9B59FF;
    box-shadow:
        0 0 4px 1px rgba(155, 89, 255, 0.4),
        0 0 8px 2px rgba(155, 89, 255, 0.25);
    animation: pr-glow-og 2s ease-in-out infinite alternate;
}
```

Note: Slightly reduced glow spread vs the modal version since these are smaller thumbnails in a tight strip.

## No other changes needed
- Deduplication by `user_id` already in place (lines 6-11)
- Slice to 10 already in place (line 11)
- `users.badge` field already returned by the API (`promptService.js` selects `users(id, name, image_url, badge)`)
- Existing `@keyframes pr-glow-legend` and `pr-glow-og` animations are reused

## Verification
1. Dashboard avatar strip shows distinct circles with small gaps (no overlap)
2. Legend users have gold glowing ring border
3. OG users have purple glowing ring border
4. Regular users have no ring (plain avatar)
5. Still max 10 avatars, one per unique user
