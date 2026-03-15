# Share Button Feature — Social Sharing with Rich Previews

## Context
Users want to share posts from iskrib to Facebook, X (Twitter), and other platforms. When shared, the link should show a rich preview card (title, description, image). Non-logged-in users clicking the shared link should be able to read the post, but interactions (like, comment, bookmark) trigger the AuthModal.

**Key challenge**: The app uses HashRouter (`/#/home/post/:id`) — social media bots can't crawl hash URLs or execute JavaScript. The Express server is API-only. To get rich preview cards, we need a **server-side share route** that serves HTML with OG meta tags.

---

## Architecture

### How it works
1. User clicks **Share** on a post → share menu opens (Copy Link, X, Facebook, or native Web Share API on mobile)
2. The shared URL is `{BACKEND_URL}/share/post/{journalId}`
3. When a **social media bot** crawls that URL → it gets HTML with `og:title`, `og:description`, `og:image`, `twitter:card` meta tags → rich preview card
4. When a **real user** clicks that link → the page auto-redirects to `https://iskrib.com/#/home/post/{journalId}` → ContentView loads the post
5. ContentView already works for unauthenticated users; interactions trigger `openAuthModal()`

---

## Implementation

### 1. Server: Share route with OG meta tags
**File: `server/server.js`** — Add `GET /share/post/:journalId` route (before the API router mount)

The route:
- Fetches journal data from Supabase: `id, title, content, post_type, canvas_doc, created_at, users(name, image_url)`
- Extracts plain text (first ~160 chars) from the Lexical JSON content for `og:description`
- Extracts first image URL from Lexical content for `og:image` (fallback: site logo)
- Serves HTML with:
  - Full OG meta tags (`og:title`, `og:description`, `og:image`, `og:type=article`, `og:url`)
  - Twitter Card meta tags (`twitter:card=summary_large_image`, `twitter:title`, etc.)
  - `<meta http-equiv="refresh" content="0; url=https://iskrib.com/#/home/post/{journalId}">` for browser redirect
  - Minimal visible content (title + "Redirecting to Iskryb...") as fallback

**Helper: `extractTextFromLexical(contentJson)`**
- Parse the Lexical JSON string
- Recursively walk `root.children` → extract `.text` from text nodes
- Join with spaces, trim to ~160 chars for description
- Also find first `image` node's `src` for og:image
- Defined inline in the route handler (small utility, no separate file needed)

### 2. Client: ShareMenu component
**File: `client/src/components/ShareMenu/ShareMenu.jsx`** (NEW)

Props: `{ url, title, onClose }`

- Compact dropdown positioned near the share button
- Options:
  - **Copy link** — copies `url` to clipboard, shows "Copied!" feedback
  - **Share to X** — opens `https://x.com/intent/tweet?url={url}&text={title}` in new tab
  - **Share to Facebook** — opens `https://www.facebook.com/sharer/sharer.php?u={url}` in new tab
  - **Native share** (mobile only) — uses `navigator.share({ url, title })` when available
- Click outside closes the menu
- Minimal styling, consistent with existing UI (uses CSS variables)

**File: `client/src/components/ShareMenu/sharemenu.css`** (NEW)

### 3. Client: Integrate share button into ContentView
**File: `client/src/components/HomePage/ContentViewer/ContentView.jsx`**

- Import `ShareMenu` and `useState` for share menu visibility
- Add a `getShareUrl(journalId)` helper that constructs `{BACKEND_URL}/share/post/{journalId}` using the API base URL
- Add share button to BOTH action bars (normal post view AND repost view), next to existing buttons
- On click: toggle `showShareMenu` state; if not logged in, still allow sharing (sharing doesn't require auth)
- Render `<ShareMenu>` positioned relative to the share button when `showShareMenu` is true

### 4. Client: Share URL utility
**File: `client/src/utils/getShareUrl.js`** (NEW)

```js
const getShareUrl = (journalId) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
    const base = backendUrl
        ? backendUrl.replace(/\/+$/, '')
        : `${window.location.origin}/api`;
    return `${base}/share/post/${journalId}`;
};
export default getShareUrl;
```

---

## Files to Modify/Create

| File | Action | Change |
|------|--------|--------|
| `server/server.js` | Modify | Add `GET /share/post/:journalId` route with OG tags HTML |
| `client/src/utils/getShareUrl.js` | Create | Utility to construct share URL |
| `client/src/components/ShareMenu/ShareMenu.jsx` | Create | Share dropdown component |
| `client/src/components/ShareMenu/sharemenu.css` | Create | ShareMenu styles |
| `client/src/components/HomePage/ContentViewer/ContentView.jsx` | Modify | Add share button + ShareMenu to both action bars |

## Existing Code to Reuse
- `seoConfig.js` → `SITE_URL` (`https://iskrib.com`) for redirect target
- `apiBaseUrl.js` → `VITE_BACKEND_URL` pattern for constructing share URLs
- Supabase client in `server/services/supabase.js` for fetching journal data
- Existing `cv-action-btn` CSS class for the share button styling
- `useAuth` context → `openAuthModal` for unauthenticated interaction gates (already in ContentView)

---

## Verification

1. Start the server, navigate to `http://localhost:3000/share/post/{some-journal-id}` in browser
   - Should see OG meta tags in page source
   - Should auto-redirect to `https://iskrib.com/#/home/post/{journalId}` (or localhost equivalent)
2. Test share button in ContentView → copy link, open in incognito → post should load, interactions show AuthModal
3. Test "Share to X" → should open X intent with correct URL and title
4. Test "Share to Facebook" → should open Facebook share dialog
5. Validate OG tags: paste the share URL into [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) or [Twitter Card Validator](https://cards-dev.twitter.com/validator) — should show title, description, and image
6. Test mobile native share (if available)
