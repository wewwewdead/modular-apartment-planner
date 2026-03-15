# Plan: Scalable #1 Hottest Post Tracker (pg_cron)

## Context
The current hottest tracker uses `setInterval` in Node.js — this breaks with multiple server instances (duplicate notifications, race conditions) and wastes resources by fetching all journals to JS memory. The Freedom Wall feature already uses `pg_cron` + `pg_advisory_xact_lock` — we follow the same proven pattern to make the hottest tracker run entirely in Postgres.

## Why pg_cron over setInterval
- **No duplicate execution**: Runs once in Postgres regardless of how many Express instances exist
- **No race conditions**: `pg_advisory_xact_lock` prevents concurrent runs
- **Faster scoring**: SQL aggregation instead of fetching all rows to JS memory
- **Zero Node.js overhead**: Server process doesn't manage timers or do background work
- **Already proven**: Same pattern as `freedom_wall_cron.sql`

---

## Step 1: Replace `hottest_tracker.sql` with pg_cron function

**File:** `server/sql/hottest_tracker.sql`

Replace the current simple CREATE TABLE with a full migration that includes:

1. **Table** (already exists — keep as-is, add index)
2. **Index** on `journals(privacy, created_at)` for fast monthly filtering at scale
3. **Postgres function** `check_hottest_post_tracker()`:
   - `pg_advisory_xact_lock(hashtext('hottest_post_tracker'))` — prevents concurrent runs
   - Single SQL query: JOIN journals with COUNT from likes/comments/bookmarks, filter by `privacy='public'` and current month, compute hot score, ORDER BY score DESC, LIMIT 1
   - SELECT existing tracker row for this month
   - If same `journal_id` → do nothing
   - If different:
     - INSERT `hottest_post_replaced` notification for old holder
     - UPSERT new #1 into `hottest_tracker`
     - INSERT `hottest_post` notification for new holder
4. **pg_cron schedule**: every 5 minutes (`*/5 * * * *`)

Hot score formula (same as JS): `(views * 6) + (likes * 3) + (comments * 2) + (bookmarks * 2)`

---

## Step 2: Remove Node.js tracker code

**File:** `server/services/getService.js`
- Delete the entire `checkHottestPostTracker` exported function (~100 lines)

**File:** `server/server.js`
- Remove `import { checkHottestPostTracker }` line
- Remove the `setInterval` block and initial call in `app.listen`

---

## Files to modify
| # | File | Change |
|---|------|--------|
| 1 | `server/sql/hottest_tracker.sql` | Rewrite — add index, PL/pgSQL function, pg_cron schedule |
| 2 | `server/services/getService.js` | Delete `checkHottestPostTracker` function |
| 3 | `server/server.js` | Remove import + setInterval block |

Client-side files (`formatNoficationType.js`, `notificationsCards.jsx`, `UnreadNotificationCard.jsx`) are **already done** from the previous implementation — no changes needed.

## Verification
1. Run the new SQL in Supabase SQL editor (drops and recreates the function + cron job)
2. Clear `hottest_tracker` table and any test `hottest_post` / `hottest_post_replaced` notifications
3. Manually invoke: `SELECT check_hottest_post_tracker();` in Supabase SQL editor
4. Verify `hottest_tracker` has a row for the current month with the correct #1 journal
5. Verify `notifications` has a `hottest_post` entry for that author
6. Inflate a different post's views: `UPDATE journals SET views = 999999 WHERE id = '<other_id>';`
7. Run `SELECT check_hottest_post_tracker();` again
8. Verify old author got `hottest_post_replaced` and new author got `hottest_post`
9. Confirm cron is scheduled: `SELECT * FROM cron.job WHERE jobname = 'hottest-post-tracker';`
10. Restart server — no tracker logs should appear (it's all in Postgres now)
