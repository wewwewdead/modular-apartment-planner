# Fix: Mobile App Receives No Notifications

## Context
Two issues: (1) the Notifications tab always shows empty because the API request is rejected, and (2) there's no real-time notification delivery — users only see notifications when they manually open the tab and pull to refresh.

---

## Part 1: Fix Empty Notification List (bug)

### Root Cause
Mobile sends `limit=30`, backend max is `20` → returns 400 → React Query catches silently → empty list.

### Fix
**File:** `apps/mobile/src/screens/Notifications/NotificationsScreen.tsx` (line 90)
```diff
- queryFn: () => mobileApi.getNotifications(token, null, 30),
+ queryFn: () => mobileApi.getNotifications(token, null, 20),
```

---

## Part 2: Supabase Realtime In-App Notifications (new feature)

Use Supabase Realtime `postgres_changes` to listen for new notification rows. When one arrives, invalidate the React Query cache (refreshes the list + count) and show a Toast banner.

### Step 1: Upgrade Supabase client
**File:** `apps/mobile/src/lib/supabase.ts`

Currently uses bare `AuthClient` from `@supabase/auth-js`. Switch to `createClient` from `@supabase/supabase-js` (already in package.json v2.97.0). This gives us both `supabase.auth` (same API) and `supabase.channel()` for realtime.

```ts
import { createClient } from '@supabase/supabase-js';
// configure with AsyncStorage, same auth options as today
```

The exported type changes from `{ auth: AuthClient }` to the full `SupabaseClient`. All `.auth` methods remain identical.

### Step 2: Update AuthProvider imports
**File:** `apps/mobile/src/features/auth/AuthProvider.tsx`

- Update to use the new `supabase` export (same `.auth` API, just a different client type)
- Import `Session`, `User`, `AuthChangeEvent` types from `@supabase/supabase-js` instead of `@supabase/auth-js`

### Step 3: Create realtime notifications hook
**New file:** `apps/mobile/src/hooks/useRealtimeNotifications.ts`

- Accepts `userId` (from auth session)
- Subscribes to `postgres_changes` on **both** tables:
  - `notifications` table — filter `receiver_id=eq.{userId}`, event `INSERT`
  - `notification_opinions` table — same filter + event
- On INSERT event:
  - Invalidate `['notifications', userId]` and `['notification-count', userId]` query keys
  - Call an `onNewNotification` callback (for showing toast)
- Cleans up subscription on unmount or userId change

### Step 4: Integrate in RootNavigator
**File:** `apps/mobile/src/navigation/RootNavigator.tsx`

- Create a small `LoggedInShell` wrapper component that renders `MainTabNavigator` children via `<Outlet>` pattern
- Inside `LoggedInShell`: call `useRealtimeNotifications(userId)` + manage Toast state
- Render `<Toast>` at the bottom of the shell (already have `Toast` component at `components/Toast.tsx`)
- This keeps the subscription alive on all tabs while logged in

### Step 5: Supabase Dashboard (manual — user action)
- Go to Supabase Dashboard → Database → Replication
- Enable Realtime on `notifications` and `notification_opinions` tables
- Ensure RLS policies allow authenticated users to SELECT rows where `receiver_id = auth.uid()`

---

## Files Modified
| File | Change |
|------|--------|
| `apps/mobile/src/screens/Notifications/NotificationsScreen.tsx` | Fix limit 30→20 |
| `apps/mobile/src/lib/supabase.ts` | Replace AuthClient with full createClient |
| `apps/mobile/src/features/auth/AuthProvider.tsx` | Update imports for new client type |
| `apps/mobile/src/hooks/useRealtimeNotifications.ts` | **New** — realtime subscription hook |
| `apps/mobile/src/navigation/RootNavigator.tsx` | Add LoggedInShell with realtime + toast |

## Verification
1. Open Notifications tab → list should now load (no longer empty)
2. Have another user like/comment on your post → notification should appear in real-time without refresh
3. Toast banner should appear briefly when a new notification arrives (on any screen)
4. Unread count badge should update in real-time
5. Web app still works unchanged (no backend changes)
