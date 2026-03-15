# @Mentions Feature

## Context
Users need a way to mention other users in their posts. Mentions are limited to people you follow, which prevents abuse and keeps autocomplete relevant. When mentioned, users receive a notification. Mentions are clickable links to profiles on both web and mobile.

## Implementation Steps

### Step 1: Backend — Search Following Users Endpoint
New endpoint so the autocomplete can search among people the author follows.

**`server/services/getService.js`** — Add `searchFollowingUsersService(userId, query, limit)`:
- Query `follows` table for `following_id` where `follower_id = userId`
- If no query: return all followed users (up to limit), ordered by name
- If query: ILIKE search on `name` and `username` within followed user IDs, deduplicate
- Returns `{ data: [{ id, name, username, image_url, badge }] }`

**`server/controller/getController.js`** — Add `searchFollowingUsersController`

**`server/routes/routes.js`** — Add `GET /users/following/search` (requireAuth)

**`client/API/Api.js`** — Add `searchFollowingUsers(token, query, limit)`

### Step 2: MentionNode (Custom Lexical DecoratorNode)
Follow the exact `ImageNode.jsx` pattern but inline.

**Create `client/src/components/HomePage/Editor/nodes/MentionNode.jsx`**:
- `DecoratorNode` subclass, type = `"mention"`
- Properties: `__mentionName`, `__mentionUserId`, `__mentionUsername`
- `isInline()` returns `true` (critical difference from ImageNode)
- `exportJSON()` → `{ type: "mention", version: 1, mentionName, mentionUserId, mentionUsername }`
- `importJSON()` → reconstructs node from serialized data
- `getTextContent()` → `@username` (for word count, copy/paste)
- `decorate()` → renders `<MentionComponent>` with profile navigation
- `createDOM()` → `<span class="mention-node">`
- Export helpers: `$createMentionNode()`, `$isMentionNode()`

**Create `client/src/components/HomePage/Editor/nodes/MentionComponent.jsx`**:
- Renders `<span class="mention-chip">@{name}</span>`
- Click navigates to profile using `handleClickProfile` from `client/helpers/handleClicks.js`
- When `isEditable=true` (in editor), clicks do nothing (no navigation while editing)

### Step 3: Register MentionNode
**`client/src/App.jsx`** (line 75): Add `MentionNode` to nodes array
**`client/src/components/HomePage/ContentViewer/ContentView.jsx`** (lines 412, 588): Add `MentionNode` to both read-only LexicalComposer nodes arrays

### Step 4: MentionPlugin (Autocomplete)
**Create `client/src/components/HomePage/Editor/nodes/Plugins/MentionPlugin.jsx`**:
- Uses `useLexicalComposerContext` (same pattern as `ImagePlugin.jsx`)
- `registerUpdateListener` detects `@` trigger via regex `/@([\w-]*)$/` on text before cursor
- Tracks query string after `@`, debounces API calls (200ms)
- Calls `searchFollowingUsers` API to fetch matching followed users
- Renders positioned dropdown (fixed position, calculated from DOM selection range)
- Keyboard navigation: Arrow up/down, Enter/Tab to select, Escape to dismiss
- On selection: replaces `@query` text with `MentionNode`, adds trailing space
- `onMouseDown` with `preventDefault` on dropdown items to prevent editor blur

**`client/src/components/HomePage/Editor/RichTextEditor.jsx`** (line 131): Add `<MentionPlugin />` after `<ImagePlugin />`

### Step 5: Mention Styles
**`client/src/components/HomePage/Editor/editor.css`** — Add:
- `.mention-chip`: inline, accent color, font-weight 600, subtle hover bg
- `.mention-chip--editing`: cursor default, lighter bg, no hover underline
- `.mention-dropdown`: fixed position, z-index 200, glass bg, rounded, shadow, max-height 280px with overflow scroll
- `.mention-dropdown-item`: flex row with avatar + name/username, hover highlight
- `.mention-dropdown-item--selected`: highlighted state for keyboard navigation
- Uses existing CSS vars (`--accent-purple`, `--bg-elevated`, `--border-light`, `--text-primary`, `--text-muted`)

### Step 6: Mention Notifications on Publish
**Create `server/utils/extractMentions.js`** — `extractMentionUserIds(contentJson)`:
- Walks Lexical JSON tree recursively
- Collects unique `mentionUserId` from nodes with `type === 'mention'`
- Returns array of user IDs

**`server/services/uploadService.js`** — Modify `uploadJournalContentService` (line 293):
- Change insert to `.select('id').single()` to get the new journal ID back
- After successful insert, call `extractMentionUserIds(content)`
- Batch insert notifications with `type: 'mention'`, `journal_id`, `sender_id`, `receiver_id`
- Filter out self-mentions, cap at 50 notifications, non-fatal (try/catch)

**`client/helpers/formatNoficationType.js`** — Add to `notificationTypeMap`:
- `mention: 'Mentioned you in a post'`

**`client/src/components/Notifications/notificationsCards.jsx`** — Add click handler for mention notifications:
- Navigate to the post (same as like/comment behavior, using `journal_id`)

### Step 7: Mobile LexicalRenderer
**`iskrib_mobile_app/apps/mobile/src/lib/content/LexicalRenderer.tsx`**:
- Add `mentionName`, `mentionUserId`, `mentionUsername` to `LexicalNode` interface
- Add `'mention'` case in `RenderInline`: render as `<Text>` with `accentAmber` color, `onPress` navigates to `VisitProfile` screen via `useNavigation`
- Import `useNavigation` from `@react-navigation/native`

## Files to Create
- `client/src/components/HomePage/Editor/nodes/MentionNode.jsx`
- `client/src/components/HomePage/Editor/nodes/MentionComponent.jsx`
- `client/src/components/HomePage/Editor/nodes/Plugins/MentionPlugin.jsx`
- `server/utils/extractMentions.js`

## Files to Modify
- `server/services/getService.js` — add searchFollowingUsersService
- `server/controller/getController.js` — add searchFollowingUsersController
- `server/routes/routes.js` — add GET /users/following/search
- `client/API/Api.js` — add searchFollowingUsers()
- `client/src/App.jsx` — register MentionNode (line 75)
- `client/src/components/HomePage/ContentViewer/ContentView.jsx` — register MentionNode (lines 412, 588)
- `client/src/components/HomePage/Editor/RichTextEditor.jsx` — add MentionPlugin (line 131)
- `client/src/components/HomePage/Editor/editor.css` — mention styles
- `server/services/uploadService.js` — extract mentions + create notifications on publish
- `client/helpers/formatNoficationType.js` — add 'mention' type text
- `client/src/components/Notifications/notificationsCards.jsx` — mention notification click handler
- `iskrib_mobile_app/apps/mobile/src/lib/content/LexicalRenderer.tsx` — mention rendering

## Key Reuse
- `ImageNode.jsx` pattern → MentionNode structure (DecoratorNode, exportJSON/importJSON, decorate)
- `ImagePlugin.jsx` pattern → MentionPlugin structure (useLexicalComposerContext)
- `handleClickProfile` from `client/helpers/handleClicks.js` → profile navigation in MentionComponent
- `searchUsersService` pattern from `server/services/getService.js` → searchFollowingUsersService (ILIKE search, dedup)
- Existing notification insert pattern from `interactService.js` → mention notifications
- `FormatNotificationType` map → add 'mention' entry

## Verification
1. Type `@` in editor → dropdown appears with followed users
2. Type a query → dropdown filters results
3. Arrow keys + Enter to select → MentionNode inserted inline
4. Save post → JSON contains `"type": "mention"` nodes with userId/username
5. View post in ContentView → mention renders as clickable link, navigates to `/@username`
6. Mentioned user receives notification with "Mentioned you in a post"
7. Click mention notification → navigates to the post
8. Mobile app → mention renders as tappable amber text, tapping navigates to VisitProfile
