# Enhancement: Show reaction labels alongside emojis in analytics breakdown

## Context
The emoji fix from the previous task is already applied. Now the user wants the written label (e.g. "Amazing", "Love", "Mind-blown") displayed next to each emoji in the reaction breakdown rows.

`reactionConfig.js` already has a `label` field on each reaction type and a `REACTION_MAP` that maps type → full config object.

## Changes

### File: `client/src/components/Analytics/ReactionBreakdown.jsx`
1. Import `REACTION_MAP` from `reactionConfig.js` (already imports `getReactionEmoji`)
2. After the emoji `<span>`, add a label `<span>` showing `REACTION_MAP[item.type]?.label`

Current (line 22):
```jsx
<span className="analytics-breakdown-emoji">{getReactionEmoji(item.type)}</span>
```
After:
```jsx
<span className="analytics-breakdown-emoji">{getReactionEmoji(item.type)}</span>
<span className="analytics-breakdown-label">{REACTION_MAP[item.type]?.label}</span>
```

### File: `client/src/components/Analytics/AnalyticsDashboard.css`
Add a small style for `.analytics-breakdown-label` after the existing `.analytics-breakdown-emoji` rule (~line 208):
```css
.analytics-breakdown-label {
    font-size: 12px;
    color: var(--color-text-secondary);
    min-width: 70px;
}
```

## Verification
1. Navigate to `/home/analytics`
2. Scroll to "Reaction breakdown" section
3. Confirm each row shows emoji + label text (e.g. 🔥 Amazing, ❤️ Love, 🤯 Mind-blown)
