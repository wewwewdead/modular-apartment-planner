# Fix oversized tab chips on ExploreScreen

## Context
The All / Users / Posts filter chips on the Explore screen look oversized. The shared `Chip` component uses `paddingHorizontal: 16` and `paddingVertical: 8` — too chunky for tab-style filter chips. The `StoryBrowserScreen` already works around this by using its own inline styles (`paddingHorizontal: 10, paddingVertical: 6`).

## Approach
Add an optional `size` prop to the `Chip` component (`'sm' | 'md'`, default `'md'`). Use `size="sm"` in `ExploreScreen`. This keeps existing usages unchanged.

## Files to edit

### 1. `apps/mobile/src/components/Chip.tsx`
- Add `size?: 'sm' | 'md'` to `ChipProps` (default `'md'`)
- `sm`: `paddingHorizontal: 10`, `paddingVertical: 4`, `fontSize: 12`
- `md`: current values (`paddingHorizontal: 16`, `paddingVertical: 8`, `fontSize: 13`)

### 2. `apps/mobile/src/screens/Home/ExploreScreen.tsx`
- Pass `size="sm"` to each `<Chip>` in the search tab row (line ~314)

## Verification
- Explore tab chips render smaller and more proportionate
- HomeFeedScreen chips unchanged (still use default `md`)
- No TypeScript errors
