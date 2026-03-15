# Fix: VisitProfileScreen crash — hooks order violation

## Context
Visiting another user's profile causes a **red error screen** with:
> "React has detected a change in the order of Hooks called by VisitProfileScreen"

**Root cause:** In `VisitProfileScreen.tsx`, a `useMemo` hook (line 125, `backdropElement`) is placed **after** two early returns (lines 87-89 and 91-98). When the component first renders with `isLoading === true`, the early return at line 91 fires and `useMemo` never executes. On re-render when data arrives, `useMemo` runs — changing the hook count and violating React's Rules of Hooks.

## Plan

### 1. Move `useMemo(backdropElement)` before the early returns
**File:** `apps/mobile/src/screens/Profile/VisitProfileScreen.tsx`

Move the `backdropElement` `useMemo` block (current lines 125-165) to **before** line 87 (the `if (userId === user?.id)` guard), right after `useFollowMutation` at line 85. This ensures the hook always runs regardless of early returns.

### 2. Move `headerComponent` JSX before early returns (optional cleanup)
The `headerComponent` variable (lines 110-123) and `followButton` (lines 101-108) are plain JSX assignments (not hooks), so they don't violate rules of hooks. However, for clarity and to avoid future mistakes, we can leave them where they are since they're only used after the early returns.

## Files

| File | Change |
|------|--------|
| `apps/mobile/src/screens/Profile/VisitProfileScreen.tsx` | Move `useMemo(backdropElement)` before early returns |

## Verification
1. Navigate to another user's profile — should load without red error screen
2. Navigate to own profile via VisitProfile route — should redirect to Profile tab
3. Verify backdrop gradient/image renders correctly on visited profiles
