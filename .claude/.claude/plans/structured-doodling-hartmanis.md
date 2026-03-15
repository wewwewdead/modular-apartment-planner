# Paragraph-Level Comments for Chapter Reader

## Context
Phases 1-3 of the Stories feature are complete (database, backend, CRUD frontend, browser, detail, reader). The backend for paragraph comments is already fully built — `story_comments` table, API endpoints, services, and client API functions all exist. What's missing is the **frontend UI**: comment badges on paragraphs, a slide-in comment panel, and React Query hooks. This plan implements the Wattpad-style inline commenting experience.

---

## What Already Exists (no changes needed)

| Layer | Status | Details |
|-------|--------|---------|
| Database | Done | `story_comments` table with `paragraph_index`, `paragraph_fingerprint`, `parent_id` |
| Backend routes | Done | `GET /chapters/:chapterId/comments`, `GET /chapters/:chapterId/comment-counts`, `POST /chapters/:chapterId/comments` |
| Backend services | Done | `getCommentsService` (with nested replies), `getCommentCountsService` (returns `{index: count}` map), `addCommentService` (300 char max) |
| Client API | Done | `getChapterComments()`, `getChapterCommentCounts()`, `addChapterComment()` in `StoryApi.js` |

---

## Implementation Steps

### Step 1: Add Comment Hooks

**Modify `client/src/components/Stories/hooks/useStoryData.js`**
- Add import: `getChapterComments`, `getChapterCommentCounts` from StoryApi
- Add `useChapterCommentCounts(chapterId, token)` — fetches `{0: 3, 2: 1, 5: 7}` map
- Add `useChapterComments(chapterId, paragraphIndex, token)` — enabled only when `paragraphIndex !== null`
- Both use `refetchOnWindowFocus: false`, `staleTime: 30000`

**Modify `client/src/components/Stories/hooks/useStoryMutations.js`**
- Add import: `addChapterComment` from StoryApi
- Add `useAddChapterComment(token)` — on success, invalidates both `chapterComments` and `chapterCommentCounts` queries

### Step 2: Create ParagraphCommentLayer Component

**Create `client/src/components/Stories/ChapterReader/ParagraphCommentLayer.jsx`**

This overlay detects Lexical-rendered paragraphs and shows comment badges:
- Accepts `containerRef` (pointing to `.chapter-reader-body`), `commentCounts`, `onParagraphClick`
- Uses `MutationObserver` on the container to detect when `.editor-paragraph` elements appear after Lexical renders
- Scans paragraphs: assigns `data-paragraph-index` attributes, computes fingerprints (`textContent.substring(0, 100)`)
- Skips empty paragraphs (where `textContent.trim()` is empty)
- Uses `offsetTop` for positioning (no scroll listener needed since `.chapter-reader-body` has `position: relative`)
- Renders badge buttons positioned absolutely in the right margin
- Badge shows on hover (all paragraphs) or permanently (paragraphs with comments)
- Badge displays comment bubble SVG icon + count number
- Uses Framer Motion for fade-in/out

### Step 3: Create ChapterCommentCard Component

**Create `client/src/components/Stories/ChapterReader/ChapterCommentCard.jsx`**

Individual comment display, following the existing `comments/commentsCards.jsx` pattern:
- Avatar (22px circle) + name (clickable via `handleClickProfile`) + `VerifiedBadge` + date (`formatPostDate`)
- Comment body text
- Reply button (only on top-level comments)
- "Show/Hide N replies" toggle
- Replies rendered with left indent (20px) and thread line
- 2-level threading only (replies can't have sub-replies)
- Uses `AnimatePresence` for reply expand/collapse

**Reuse from codebase:**
- `handleClickProfile` from `helpers/handleClicks`
- `VerifiedBadge` from `components/Badge/VerifiedBadge`
- `formatPostDate` from `helpers/formatDateString`

### Step 4: Create CommentPanel Component

**Create `client/src/components/Stories/ChapterReader/CommentPanel.jsx`**

Slide-in panel for viewing and adding comments:
- **Desktop (>768px):** Fixed panel, slides from right, 380px wide
- **Mobile (<=768px):** Bottom sheet, slides up, 70vh height, with drag handle
- Simple inline `useState` + `resize` listener for mobile detection (no external hook needed)

**Panel structure:**
1. Backdrop overlay (semi-transparent + blur, click to close)
2. Header: "Comments" title + close button
3. Paragraph preview: accent bar + truncated paragraph text (3-line clamp)
4. Comment list: scrollable area with `ChapterCommentCard` components
5. Empty state when no comments
6. Input area (logged-in users only): reply indicator, textarea, Post button, character counter (X/300)

**Animation:** Spring entrance (`damping: 25, stiffness: 200`), quick tween exit (`0.2s`) — matching existing `CommentSection` pattern

**Optimistic updates on submit:**
- Immediately append comment to query cache
- Increment count in `chapterCommentCounts` cache
- On error, invalidate both queries to restore correct state

### Step 5: Integrate into ChapterReader

**Modify `client/src/components/Stories/ChapterReader/ChapterReader.jsx`**
- Add `ref` to `.chapter-reader-body` div
- Add state: `activeComment` = `{ paragraphIndex, fingerprint, text }` or `null`
- Fetch comment counts: `useChapterCommentCounts(chapterId, token)`
- Render `ParagraphCommentLayer` inside `.chapter-reader-body` (sibling to LexicalComposer)
- Render `CommentPanel` wrapped in `AnimatePresence` when `activeComment` is set
- Reset `activeComment` to null when `chapterId` changes (chapter navigation)

### Step 6: CSS Styles

**Modify `client/src/components/Stories/ChapterReader/ChapterReader.css`**

Add styles for three groups using distinct prefixes:

**`pcl-` (Paragraph Comment Layer):**
- `.chapter-reader-body` gets `position: relative`
- Badge layer: absolute positioned, right margin (-44px offset on desktop, -6px on mobile)
- Badges: glass morphism background (`var(--bg-glass)`, `backdrop-filter: blur(12px)`), `var(--border-light)` border
- Hover: accent amber border + color + subtle glow shadow
- Active (has comments): permanent accent color
- Mobile media query: smaller badges, icon-only

**`cp-` (Comment Panel):**
- Backdrop: fixed overlay, `var(--bg-overlay)`, `backdrop-filter: blur(2px)`, z-index 200
- Desktop panel: fixed right, 380px wide, full height, `var(--bg-elevated)`, z-index 201
- Mobile panel: fixed bottom, full width, 70vh, rounded top corners
- Header: flexbox, `var(--font-ui)`, 0.9rem, 700 weight
- Paragraph preview: `var(--bg-selection)` background, accent bar left border, serif font, 3-line clamp
- Comment list: flex-1, scrollable, thin scrollbar
- Input area: border-top, textarea with `var(--bg-pill)` background, pill submit button with `var(--accent-amber)`
- Character counter: faint text, amber at 280+, red at 300

**`ccc-` (Chapter Comment Card):**
- Card: padding, border-bottom divider
- Reply indentation: 20px margin-left, 2px thread line
- User row: avatar 22px, name clickable with hover underline, dot separator, faint date
- Body: serif font, 0.84rem
- Action buttons: no background, muted text, hover amber + pill background

---

## Files Summary

| File | Action |
|------|--------|
| `hooks/useStoryData.js` | Modify — add 2 query hooks |
| `hooks/useStoryMutations.js` | Modify — add 1 mutation hook |
| `ChapterReader/ParagraphCommentLayer.jsx` | Create |
| `ChapterReader/ChapterCommentCard.jsx` | Create |
| `ChapterReader/CommentPanel.jsx` | Create |
| `ChapterReader/ChapterReader.jsx` | Modify — add ref, state, integrate components |
| `ChapterReader/ChapterReader.css` | Modify — add all comment styles |

---

## Verification
1. Open a chapter with published content → paragraph badges should appear on hover
2. Click a badge → comment panel slides in from right (desktop) or bottom (mobile)
3. Panel shows the paragraph text preview at top
4. Post a comment → appears immediately (optimistic), persists on reload
5. Reply to a comment → appears nested under parent with thread line
6. Badge count updates after posting
7. Close panel → badge count still visible on paragraphs with comments
8. Navigate to next chapter → panel closes, badges update for new chapter
9. Test dark mode: toolbar visible, badges contrast properly, panel readable
10. Test mobile: bottom sheet panel, smaller badges, no hover (tap only)
