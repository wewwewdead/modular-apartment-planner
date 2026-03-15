# Fix: Mention Notifications — CHECK Constraint Blocking Insert

## Context
The previous round of changes (diagnostic logging, `updateJournalService` mention handling, `MentionPlugin` in `EditJournal.jsx`) are all working correctly. Server logs confirm mention extraction succeeds and the insert is attempted, but it fails because the `notifications_type_check` CHECK constraint on the `notifications` table does **not** include `'mention'` as a valid value. This constraint was created directly in Supabase (not in any version-controlled SQL file).

**Error from logs:**
```
new row for relation "notifications" violates check constraint "notifications_type_check"
```

The Supabase Realtime subscription in `AuthContext.jsx` listens for all INSERTs on `notifications` filtered by `receiver_id` — it does NOT filter by `type`, so once the insert succeeds, realtime will work automatically.

## Fix: Single SQL Migration

### `server/sql/add_mention_notification_type.sql` (new file)

Drop the existing CHECK constraint and re-create it with `'mention'` added to the allowed values list. The known types used across the codebase are:
- `like`, `comment`, `reply`, `repost`, `follow`, `reaction`
- `hottest_post`, `hottest_post_replaced`
- `constellation_request`, `constellation_accepted`
- `mention` ← **new**

```sql
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'reply', 'repost', 'follow', 'reaction',
    'hottest_post', 'hottest_post_replaced',
    'constellation_request', 'constellation_accepted',
    'mention'
  ));
```

**Run this in the Supabase SQL Editor** (same pattern as other files in `server/sql/`).

## Verification
1. Run the SQL migration in Supabase SQL Editor
2. Create a new post with an @mention → server logs should show `[mentions] new post: inserted 1 notification(s)`
3. Log in as the mentioned user → notification appears with "@" icon and "Mentioned you in a post"
4. Edit a post, add a new @mention → same result
