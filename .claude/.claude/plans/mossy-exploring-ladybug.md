# Remove Stamps & Margins from CanvasViewer

## Context
Stamps (emoji reactions) and margin items (community doodles, sticky notes) are interactive community features on canvas posts. The user no longer wants these interactions during viewing. The entire feature — UI, API, realtime, and database tables — should be removed.

**Key finding:** Stamps and margins are ONLY used in `CanvasViewer.jsx`. The `CanvasEditor`, `CanvasSurface`, and `CanvasPreview` components don't use them. The author's own built-in doodles (from `parsedCanvasDoc.doodles`) are separate and rendered by `CanvasSurface` — those stay.

---

## Step 1: Rewrite `CanvasViewer.jsx` (massive reduction)

**File:** `client/src/components/HomePage/Canvas/CanvasViewer.jsx`

Remove everything related to stamps, margins, doodling, live doodle broadcasting, and the toolbar. What remains is a simple read-only canvas renderer:

**Remove:**
- All stamp/margin API imports (line 4)
- `useAuth` import (line 5) — no longer needed (no auth-gated interactions)
- `supabase` import (line 6) — no realtime channel needed
- `useMutation`/`useQueryClient` from react-query import (line 3) — only keep `useQuery` if nothing is queried, or remove entirely
- `STAMP_ICONS`, `STAMP_SIZE`, `STAMP_FONT_SIZE`, `PROFILE_SIZE`, `STICKY_*`, `DOODLE_*`, `LIVE_DOODLE_*`, `OPTIMISTIC_*`, `REALTIME_*` constants
- `clamp`, `createOptimisticId`, `toTimestamp`, `sortByCreatedAt`, `sanitizeNormalizedPoints`, `getNameInitial` helpers
- `useLoadedImage`, `useEmojiImage`, `emojiCanvasCache` hooks
- `StampNode` component
- All state: `activeStampType`, `activeTool`, `draggingStampType`, `isDropActive`, `doodleColor`, `doodleSize`, `isDrawing`, `currentDoodlePoints`, `liveDoodlesByClient`, `isMobileDockOpen`
- All refs: `viewerClientIdRef`, `realtimeChannelRef`, `currentDoodlePointsRef`, `pendingDoodlePayloadRef`, `doodleBroadcastTimerRef`, `lastDoodleBroadcastAtRef`
- Both `useQuery` hooks (stamps + margins) and all query keys
- All `useCallback` cache helpers, normalize helpers, realtime handlers
- All mutations (`addStampMutation`, `deleteStampMutation`, `addMarginMutation`, `deleteMarginMutation`)
- All handler functions (stamp placement, doodle drawing, drag/drop, pointer events)
- The entire realtime channel `useEffect` (lines 598-732)
- Live doodle stale-sweep interval
- The 3 extra `<Layer>` blocks rendering stamps, doodles, and stickies
- The entire toolbar dock (`toolbarDock`, `toolbarPanel`, `toolbarOrb`)
- The footer showing stamp/doodle counts

**Keep:**
- `shellRef`, `stageRef`
- `shellWidth` state + ResizeObserver effect
- `isMobileViewport` state + media query effect (may still be useful for layout)
- `parsedCanvasDoc`, `sortedObjects` memos
- `stageWidth`, `stageHeight`, `doodleStrokeScale` calculations
- `CanvasSurface` rendering with snippets, images, and author doodles
- Basic shell/frame structure

The component will shrink from ~1460 lines to ~120-150 lines.

---

## Step 2: Remove API functions from `client/API/Api.js`

**File:** `client/API/Api.js`

Delete these 6 functions:
- `addCanvasStamp` (line ~490-506)
- `getCanvasStamps` (line ~508-527)
- `deleteCanvasStamp` (line ~529-548)
- `getCanvasMargins` (line ~568-587)
- `addCanvasMargin` (line ~589-605)
- `deleteCanvasMargin` (line ~607-626)

---

## Step 3: Remove server routes

**File:** `server/routes/routes.js`

Delete these 6 routes (lines 162-168), keeping the `canvas/remix` route (line 165):
```
router.post('/canvas/stamps', ...)        // line 162
router.get('/canvas/stamps', ...)         // line 163
router.delete('/canvas/stamps/:stampId', ...) // line 164
router.get('/canvas/margins', ...)        // line 166
router.post('/canvas/margins', ...)       // line 167
router.delete('/canvas/margins/:marginId', ...) // line 168
```

Remove the stamp/margin controller imports from line 13 (keep `createCanvasRemixController`).

---

## Step 4: Clean up server controller

**File:** `server/controller/canvasController.js`

Delete these 6 controllers:
- `addCanvasStampController` (lines 11-31)
- `getCanvasStampsController` (lines 33-44)
- `deleteCanvasStampController` (lines 46-57)
- `getCanvasMarginsController` (lines 76-87)
- `addCanvasMarginController` (lines 89-105)
- `deleteCanvasMarginController` (lines 107-118)

Keep `createCanvasRemixController` (lines 59-74).

Update imports to only import `createCanvasRemixService`.

---

## Step 5: Clean up server service

**File:** `server/services/canvasService.js`

Delete these functions and their helpers:
- `normalizeStampPayload` (line 12)
- `normalizeMarginPayload` (line 26)
- `validateDoodlePayload` (line 62)
- `validateStickyPayload` (line 91)
- `assertCanvasJournalAccess` — keep ONLY if `createCanvasRemixService` uses it
- `addCanvasStampService` (line 150)
- `getCanvasStampsService` (line 258)
- `deleteCanvasStampService` (line 275)
- `getCanvasMarginsService` (line 382)
- `addCanvasMarginService` (line 399)
- `deleteCanvasMarginService` (line 434)

Delete related constants: `ALLOWED_STAMP_TYPES`, `ALLOWED_MARGIN_ITEM_TYPES`, `STAMP_SELECT`, `MARGIN_SELECT`, `MAX_DOODLE_POINTS`, `MAX_STICKY_TEXT_LENGTH`.

Keep `createCanvasRemixService` and anything it depends on.

---

## Step 6: Supabase table cleanup (manual by user)

The correct table names are:
- **`canvas_stamps`** — yes, delete this
- **`canvas_margin_items`** — yes, delete this (not "canvas_table_margins")

Run in Supabase SQL editor:
```sql
DROP TABLE IF EXISTS canvas_stamps;
DROP TABLE IF EXISTS canvas_margin_items;
```

**Note:** Do this AFTER deploying the code changes, so no running code references the tables.

---

## Verification
1. Run the dev server (`npm run dev` or equivalent)
2. Open a canvas post — it should render the canvas content (snippets, images, author doodles) with no toolbar, no stamps, no margin doodles/stickies
3. Confirm no console errors about missing API endpoints or functions
4. Verify the canvas remix feature still works (separate from stamps/margins)
