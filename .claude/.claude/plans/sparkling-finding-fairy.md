# Temporal Vibe System - Implementation Plan

## Context

Posts on Iskrib are timestamped but visually identical regardless of when they were written. This feature styles post cards based on their `created_at` hour, giving the feed a "journey through time" feel as users scroll. The vibe logic lives in a separate hook file; only `PostCards.jsx` is updated to consume it.

## Files to Create

### 1. `client/src/components/HomePage/postCards/hooks/useVibeTheme.js`

Exports a **pure function** `getVibeForTimestamp(created_at)` (for use inside `.map()`) and a default `useVibeTheme` hook (for future single-card components).

**Time-of-day mapping** (uses `new Date(created_at).getHours()` - viewer's local time):
| Hours | Key | Name | Emoji |
|-------|-----|------|-------|
| 5-10 | `morning` | Morning Dew | `🌱` |
| 11-15 | `midday` | High Sun | `☀️` |
| 16-19 | `golden` | Golden Hour | `🌅` |
| 20-22 | `twilight` | Twilight | `🌆` |
| 23-4 | `moonlight` | Written in the Moonlight | `🌙` |

**Returns:**
```js
{ key, name, emoji, badgeText, className: 'vibe-morning', style: { '--vibe-gradient', '--vibe-border', '--vibe-badge-bg', '--vibe-badge-text', '--vibe-glow' } }
```

- `getVibeForTimestamp` is a plain function (not a hook) so it works inside `.map()` without violating rules of hooks
- `VIBE_CONFIG` object holds all 5 vibe definitions with color palettes
- No state, no effects - computationally trivial (one `new Date()` + comparisons)

### 2. `client/src/components/HomePage/postCards/vibeTheme.css`

Separate CSS file (~3KB) with:
- **`.vibe-badge`** - Absolute-positioned pill in top-right corner (glass morphism: `backdrop-filter: blur(6px)`, semi-transparent bg). Uses `--vibe-badge-bg` and `--vibe-badge-text` custom properties.
- **`.cards.vibe-*`** - Border override (`1.5px solid var(--vibe-border)`) + glow shadow (`box-shadow: 0 2px 12px var(--vibe-glow)`), enhanced on hover.
- **`.cards[class*="vibe-"]::before`** - 3px gradient accent line at top edge of card using `var(--vibe-gradient)`.
- **`.vibe-moonlight-stars`** - Absolute-positioned overlay with inline SVG data URI (scattered white circles, ~0.8KB encoded). `opacity: 0.12` light / `0.2` dark.
- **`[data-theme="dark"]` overrides** - Adjusted badge text colors, reduced glow opacity for dark backgrounds.
- **`@media (max-width: 480px)`** - Smaller badge sizing, thinner accent line.

**Color palettes per vibe:**
- Morning: soft green-to-cream gradient, sage border
- Midday: warm yellow-to-orange, gold border
- Golden: amber-to-terracotta, warm amber border
- Twilight: purple-to-pink, lavender border
- Moonlight: navy-to-steel-blue, steel blue border + starry overlay

## File to Modify

### 3. `PostCards.jsx` (3 surgical changes)

**a) Imports** (after line ~23):
```js
import { getVibeForTimestamp } from './hooks/useVibeTheme';
import './vibeTheme.css';
```

**b) Vibe computation** (inside `.map()`, after line ~697):
```js
const vibe = getVibeForTimestamp(journal.created_at);
```

**c) Card wrapper** (line ~700-712) - add className + style + badge + stars:
```jsx
<motion.div
    className={`cards${isCanvasPost ? ' is-canvas-card' : ''}${isRepost ? ' is-repost-card' : ''}${vibe ? ` ${vibe.className}` : ''}`}
    style={vibe?.style}
    key={journal.id}
    /* ...existing props... */
>
    {vibe && (
        <span className="vibe-badge">
            <span className="vibe-badge-emoji">{vibe.emoji}</span>
            {vibe.badgeText}
        </span>
    )}
    {vibe?.key === 'moonlight' && (
        <span className="vibe-moonlight-stars" aria-hidden="true" />
    )}
    {/* ...existing card content unchanged... */}
```

## Key Design Decisions

- **Pure function over hook in `.map()`**: Can't call hooks inside `.map()`, so `getVibeForTimestamp` is a plain function. The hook export is for potential future use in standalone card components.
- **CSS custom properties via `style` prop**: Each card sets its vibe colors as CSS vars, consumed by the CSS classes. This avoids duplicating color values in CSS.
- **`::before` accent line instead of `border-image`**: `border-image` breaks `border-radius`. A thin pseudo-element gradient line at the top is visually effective and compatible.
- **Inline SVG data URI for stars**: Avoids extra network request, under 1KB encoded.
- **Viewer's local time**: `new Date(utc_timestamp).getHours()` converts to viewer's timezone - the vibe reflects how the viewer perceives the time.

## Performance

- `getVibeForTimestamp` is cheaper than `ParseContent()` already called in the same `.map()`
- `created_at` is immutable per journal - same input, same output every render
- No hooks = no state subscriptions = no re-render triggers
- CSS custom properties on `style` prop are stable between renders (React won't diff/update)
- Total bundle impact: ~6KB uncompressed, ~2KB gzipped

## Verification

1. Start dev server, open the feed
2. Verify cards show different colored borders/badges based on their creation time
3. Toggle dark mode - check badge readability and glow adjustments
4. Check moonlight cards have subtle star texture
5. Resize to mobile (480px) - badge should shrink, accent line should thin
6. Verify canvas cards, repost cards, and regular cards all show vibes correctly
7. Check no console warnings about hooks rules violations
8. Scroll through feed - confirm no jank or layout shifts from vibe styling
