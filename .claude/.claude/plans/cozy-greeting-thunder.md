# Remove Collections Feature

## Context

Removing the Collections page and all related code. Collections let users group journals into named sets. The feature lives across 8 component files, 7 API functions, inline route handlers in `routes.js`, and two DB tables (`collections`, `collection_journal`). All server-side collection logic is inline in routes.js (no dedicated controller/service files).

## Files to DELETE entirely

| File | What it is |
|---|---|
| `client/src/components/collections/Collection.jsx` | Main collections page |
| `client/src/components/collections/CollectionCards.jsx` | Collection card grid |
| `client/src/components/collections/CollectionJournalCards.jsx` | Journals inside a collection |
| `client/src/components/collections/collectionOlderPost.jsx` | Older post picker modal |
| `client/src/components/collections/CollectionViewer.jsx` | Visited profile collections |
| `client/src/components/collections/NotCollectedJournals.jsx` | Not-collected picker modal |
| `client/src/components/collections/ViewUserCollections.jsx` | View another user's collection journals |
| `client/src/components/collections/collection.css` | All collection styles |

## Files to EDIT (surgical removals)

### 1. `client/src/App.jsx`
- Remove 4 lazy imports: `Collections`, `CollectionJournals`, `CollectionViewer`, `ViewUserCollection`
- Remove 5 routes:
  - `/visitProfile/visitedCollections` (line 107)
  - `/u/:username/collections` (line 115)
  - `/home/userCollections` (line 129)
  - `/home/collections` (line 133)
  - `/home/collectionCards` (line 134)

### 2. `client/src/components/HomePage/Home.jsx`
- Remove the Collections link object from `authLinks` array (lines 136–151, the `path: '/home/collections'` object)

### 3. `client/src/components/ProfilePage/constants/profileSidebarLinks.jsx`
- Remove the Collections link object from the returned array (lines 75–90)

### 4. `client/src/components/ProfilePage/constants/profileTabs.js`
- Remove line 4: `{ label: "Collections", path: "/home/collections" },`

### 5. `client/src/components/VisitProfile/Visitprofile.jsx`
- Remove Collections entry from `useNewUrls` tab list (line 72)
- Remove Collections entry from legacy tab list (line 79)

### 6. `client/src/components/MobileSidebarLink/MobileSidebarLink.jsx`
- Remove the "My collections" nav block (lines 84–98)
- Do NOT remove the shared CSS classes (`sidebar-mycollection-container`, etc.) — still used by Bookmarks/Settings items

### 7. `client/API/Api.js`
- Remove 7 functions: `addCollections`, `getCollections`, `getCollectionJournals`, `getNotCollectedJournals`, `addJournalCollection`, `deleteCollection`, `updateCollectionPrivacy`

### 8. `client/src/utils/useMutation.js`
- Remove `updateCollectionPrivacy` from the import (line 3)
- Remove entire `useUpdateCollectionPrivacyMutation` export (lines 382–420)

### 9. `client/src/seo/seoConfig.js`
- Line 10: Reword `"...publish journals, share opinions, and organize collections."` → `"...publish journals, share opinions, and read stories."`
- Line 20: Reword `"...share opinions, and build collections..."` → `"...share opinions, and read stories..."`
- Line 78: Reword `"...share opinions, and curate collections."` → `"...share opinions, and read stories."`

### 10. `server/routes/routes.js`
- Remove 3 constants: `COLLECTION_SELECT_COLUMNS` (lines 122–129), `COLLECTION_JOURNALS_SELECT` (lines 130–143), `NOT_COLLECTED_JOURNAL_SELECT` (line 144)
- Remove 7 inline route handlers (lines 675–998):
  - `POST /addCollections`
  - `POST /updateCollection`
  - `GET /getCollections`
  - `GET /getCollectionJournals`
  - `GET /getNotCollectedPost`
  - `DELETE /deleteCollection/:collectionId`
  - `POST /updatePrivacyCollection`

## Supabase SQL to DROP

Run in Supabase SQL Editor. Drop FK-dependent table first.

```sql
-- 1. Drop junction table first (it has FK to collections)
DROP TABLE IF EXISTS collection_journal;

-- 2. Drop main collections table
DROP TABLE IF EXISTS collections;
```

## Implementation Order

1. Delete `client/src/components/collections/` folder (8 files)
2. Edit all client files (App.jsx, Home.jsx, profileSidebarLinks.jsx, profileTabs.js, Visitprofile.jsx, MobileSidebarLink.jsx, Api.js, useMutation.js, seoConfig.js)
3. Edit `server/routes/routes.js` (remove constants + 7 route handlers)
4. Provide SQL migration for user to run in Supabase

## Verification

1. `npm run dev` in `client/` — app starts, no import errors
2. Sidebar links — no Collections link in desktop sidebar, profile sidebar, mobile sidebar, or profile tabs
3. Visit profile tabs — no Collections tab
4. `/home/collections` route returns blank / 404 (no crash)
5. Run SQL in Supabase SQL Editor — tables dropped cleanly
