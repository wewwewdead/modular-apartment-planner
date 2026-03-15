# Fix ReactionButton Not Showing on Old Posts in ContentView

## Context
The ReactionButton component exists in ContentView.jsx but is invisible for old posts (posts with likes but no reactions). New posts show the icon correctly. Root cause: a **parameter position mismatch** in `handleCLickContent` caused by a dead `canvasDoc` parameter.

## Root Cause

`client/helpers/handleClicks.js:handleCLickContent` has an unused `canvasDoc` parameter at position 17:
```
(..., badge, postType, canvasDoc, userReaction, reactionCount)
                                  ^^^^^^^^^ dead param — nobody passes this
```

But `PostCards.jsx:viewContent` skips `canvasDoc` and passes `userReaction` at position 17:
```
clickContent(..., badge, postType, userReaction, reactionCount)
```

This means `reactionCount` (a number like `5` for old posts with likes) lands in the `userReaction` slot. In ContentView, `hasReaction = !!5` → `true`, so it tries to render `getReactionEmoji(5)` which returns `''` — an empty invisible span instead of the thumbs-up SVG.

New posts work because their `like_count` is `0`, so `reactionCount = 0`, `!!0 = false`, and the SVG renders.

## Fix

### 1. `client/helpers/handleClicks.js` — Remove dead `canvasDoc` parameter
- Remove `canvasDoc = null` from the function signature (line 29)
- Remove `canvasDoc: canvasDoc` from the state object (line 58)
- This realigns `userReaction` and `reactionCount` to their correct positions

## Verification
- Click an OLD post (one that has likes) from the feed → ContentView should show the thumbs-up reaction icon
- Click a NEW post → same, icon should show
- Hover/long-press the reaction button → picker should appear
- Verify the reaction count displays correctly
