# Reaction-Specific Notification Messages

## Context

When a user reacts to a post, the notification always shows "Reacted to your post" regardless of which emoji was used. The `reaction_type` column exists in the DB and is stored correctly, but:
1. The API query (`NOTIFICATION_JOURNAL_SELECT`) doesn't fetch `reaction_type`
2. `FormatNotificationType` has a single generic "Reacted to your post" entry

The user wants each reaction to have a unique notification message (e.g. "Clapped your post", "Loved your post") and show the matching emoji icon.

## Changes (3 files)

### 1. `server/routes/routes.js` — line 93

Add `reaction_type` to `NOTIFICATION_JOURNAL_SELECT`:

```
    type,
    reaction_type,     ← ADD THIS
    read,
```

### 2. `client/helpers/formatNoficationType.js`

Update to accept both `type` and `reaction_type`. When `type === 'reaction'`, return a reaction-specific message:

| reaction_type | Message |
|---|---|
| fire | Fired your post |
| heart | Loved your post |
| mind_blown | Was mind-blown by your post |
| clap | Clapped your post |
| laugh | Laughed at your post |
| sad | Was moved by your post |
| (fallback) | Reacted to your post |

Signature: `FormatNotificationType(type, reactionType)` — backward compatible, second arg optional.

### 3. `client/src/components/Notifications/notificationsCards.jsx` — line 273

Pass `notification?.reaction_type` as second argument:

```jsx
<p className="notif-type">{FormatNotificationType(displayType, notification?.reaction_type)}</p>
```

## Files Modified

1. `server/routes/routes.js:93` — add `reaction_type` to select
2. `client/helpers/formatNoficationType.js` — reaction-specific messages
3. `client/src/components/Notifications/notificationsCards.jsx:273` — pass `reaction_type`

## Verification

1. React with fire on someone's post → they see notification: "🔥 [name] Fired your post"
2. Switch reaction to clap → notification updates to: "👏 [name] Clapped your post"
3. Remove reaction → notification deleted
4. Old notification types (like, comment, follow, etc.) unchanged
