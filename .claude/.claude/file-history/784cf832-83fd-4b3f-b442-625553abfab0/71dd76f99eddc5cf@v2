# iskrib_v3 Project Memory

## Architecture
- **Frontend:** React + Vite, BrowserRouter, Lexical rich text editor
- **Backend:** Express.js on port 3000, Supabase (PostgreSQL + Storage)
- **State:** React Query for caching, Context for auth
- **Styling:** CSS variables, glass morphism, Framer Motion animations

## Key Patterns
- Single `<LexicalComposer>` wraps entire app in `App.jsx` (uses shared `EDITOR_NODES`/`EDITOR_THEME` from `editorConfig.js`)
- New independent editors need their own `<LexicalComposer>` instance
- Shared editor config: `client/src/components/HomePage/Editor/editorConfig.js` (EDITOR_NODES, EDITOR_THEME, VIEWER_NODES)
- Editor packages: @lexical/list, @lexical/link, @lexical/markdown, @lexical/code (added Mar 2026)
- Editor features: Bold, Italic, Underline, Strikethrough, InlineCode, H1-H3, Quote, CodeBlock, BulletList, NumberedList, Checklist, HR, Links (auto+manual), Undo/Redo buttons, Markdown shortcuts, Image paste/drop, FloatingLinkEditor, FloatingSelectionToolbar
- Custom plugins dir: `client/src/components/HomePage/Editor/plugins/` (CodeHighlightPlugin, AutoLinkPlugin, FloatingLinkEditor, FloatingSelectionToolbar, PasteImagePlugin)
- `ToolbarForEdit.jsx` deleted — all editors use main `Toolbar.jsx`
- API calls use `fetch` with Bearer token auth, FormData for file uploads
- Backend validates via service layer, controllers are thin wrappers
- Controllers use `asyncHandler` wrapper from `server/utils/controllerHandler.js` (auto try/catch)
- Services throw `AppError` from `server/utils/AppError.js` (proper Error subclass with status/message)
- Shared validation: `server/utils/validation.js` (UUID_REGEX, USERNAME_REGEX, RESERVED_USERNAMES)
- Client API uses helpers from `client/API/apiHelpers.js` (publicGet, authedGet, authedJsonRequest, authedFormRequest)
- Profile customization stored in `profile_layout` JSON column on `users` table
- Image uploads: multer → Sharp (resize per bucket + WebP) → Supabase Storage
- `BUCKET_RESIZE_LIMITS` in routes.js: avatars 400x400, background 1920x1080, story-covers 800x1200, journal-images 1600x1600
- `getUserDataService` uses explicit `USER_PROFILE_SELECT` (excludes `interests_embedding`)
- QueryClient defaults: staleTime 5min, refetchOnWindowFocus false
- Share image routes use in-memory LRU cache (1h TTL, 200 entries)
- `getDynamicFloor()` in discoveryService cached with 5min TTL
- Query keys use `session?.user?.id` not `access_token` (prevents cache bust on token rotation)
- Feed queries use `JOURNAL_METADATA_WITH_COUNTS_SELECT` (no `content` field) — previews via `preview_text`/`thumbnail_url` columns
- `preview_text`/`thumbnail_url` persisted at write time in uploadService.js, backfilled via `server/scripts/backfillPreviews.js`
- Edit from profile fetches full content via `GET /journal/:id/content` (auth-required, owner-only)
- ContentView gate: `shouldFetchPost` checks `!statePostData?.content` to trigger fetch when navigating from feed
- `getJournalByIdService` still returns full `content` for single-post detail views
- `attachRepostSources` still returns `content` + `preview_text` + `thumbnail_url` for repost source rendering

## File Locations
- Routes: `server/routes/routes.js` (thin — all handlers in controllers)
- Sitemap routes: `server/routes/sitemapRoutes.js`
- Upload services: `server/services/uploadService.js`
- Notification service: `server/services/notificationService.js`
- Controllers: notificationController, opinionController, followController, inlineController (views, privacy, replies, username, streak)
- Utilities: `server/utils/AppError.js`, `server/utils/controllerHandler.js`, `server/utils/validation.js`
- URL utils (SITE_URL, makePostUrl): `server/utils/urlUtils.js`
- Client API: `client/API/Api.js`, `client/API/apiHelpers.js`
- SQL migrations: `server/sql/interaction_indexes.sql`, `server/sql/follow_counts.sql`, `server/sql/notification_count.sql`
- SEO config: `client/src/seo/seoConfig.js`
- SEO DOM helpers: `client/src/seo/seoUtils.js`
- SEO manager: `client/src/seo/SeoManager.jsx`
- Post SEO hook: `client/src/seo/usePostSeo.js`
- Profile SEO hook: `client/src/seo/useProfileSeo.js`
- Profile layout: `client/src/utils/profileLayout/`
- Profile page: `client/src/components/ProfilePage/`
- Visited profile: `client/src/components/VisitProfile/`
- Editor: `client/src/components/HomePage/Editor/`

## SEO Features (Feb 2026)
- Dynamic sitemaps: `/api/sitemap-index.xml`, `/api/sitemap-posts.xml`, `/api/sitemap-profiles.xml`
- Post pages get Article JSON-LD, proper og:type/title/description/image via `usePostSeo` hook
- Profile pages get Person JSON-LD via `useProfileSeo` hook
- `/@username` routes added alongside legacy `/visitProfile?userId=` (backward compatible)
- `username` column on `users` table (unique, case-insensitive)
- Backfill script: `server/scripts/backfillUsernames.js`
- Username endpoints: `GET /api/user/:username`, `GET /api/check-username/:username`, `POST /api/update-username`
- Signup flow includes username field (auto-suggested from name, real-time availability check)
- `handleClickProfile` accepts optional `clickedUsername` param for `/@username` navigation
- `seoConfig.js` DYNAMIC_PATTERNS support function-based seo (receives pathname)

## Notes Feature (Feb 2026)
- Added customizable notes section to profile pages
- Data in `profile_layout.notes` array, max 10 notes
- Dedicated endpoint `POST /updateProfileLayout` (avoids name/bio validation)
- Each note has its own LexicalComposer instance
- Components: ProfileNotesSection, NoteContainer, NoteStyleEditor, InlineNoteEditor, ReadOnlyNoteView

## Stories Feature (Feb 2026) - Phase 1+2
- Wattpad-style serialized content with chapters + paragraph-level comments
- DB tables: stories, chapters, story_comments, story_votes, reading_progress, story_library
- Migration SQL: `server/sql/stories.sql`
- Storage bucket: `story-covers`
- Backend: `server/services/storyService.js`, `chapterService.js`, `storyInteractService.js`
- Controllers: `server/controller/storyController.js`, `chapterController.js`, `storyInteractController.js`
- Routes: `server/routes/storyRoutes.js` (mounted in server.js via `/api`)
- Client API: `client/API/StoryApi.js`
- Hooks: `client/src/components/Stories/hooks/useStoryData.js`, `useStoryMutations.js`
- Components built (Phase 2): StoryDashboard, StoryEditor, StoryChapterManager, ChapterEditor
- Routes: `/home/stories/dashboard`, `/home/stories/new`, `/:storyId/edit`, `/:storyId/manage`, `/:storyId/chapter/:chapterId/edit`
- Sidebar "Stories" link added to Home.jsx (book icon)
- Future phases: StoryBrowser, StoryDetail, ChapterReader, paragraph comments, profile tabs, SEO

## Discovery Feature (Feb 2026) - Phase 1
- Related posts engine using pgvector cosine similarity + engagement + recency composite scoring
- SQL RPC: `find_related_posts` in `server/sql/discovery.sql`
- Backend: `server/services/discoveryService.js`, `server/controller/discoveryController.js`
- Route: `GET /journal/:journalId/related` (no auth required, public posts only)
- Client API: `getRelatedPosts()` in `client/API/Api.js`
- Component: `client/src/components/Discovery/RelatedPosts.jsx` + CSS
- Integrated into `ContentView.jsx` after `</article>` tag
- Confidence tiers: high (>=0.55, 5 results), medium (>=0.40, 3 results), low (>=0.30, 2 results)
- Dynamic similarity floor: <500 posts=0.25, <2K=0.30, 2K+=0.35
- Never shows <2 results or similarity scores; section hidden when no matches
- Future phases: Similar Thinkers (galaxy_edges), Topic Scaffolding, Writing Prompts

## Onboarding Wizard (Mar 2026)
- 5-step wizard replacing old profile editor modal + WelcomeMessage
- DB columns: `onboarding_completed`, `onboarding_completed_at`, `writing_interests`, `writing_goal` on `users` table
- Migration: `server/sql/onboarding.sql` (backfills existing users as onboarded)
- Backend: `completeOnboardingService` in `uploadService.js`, `completeOnboardingController` in `uploadController.js`
- Route: `POST /api/complete-onboarding` (requireAuth)
- `checkUserService` returns `onboarding_completed`; controller returns `onboardingCompleted` field
- Client API: `completeOnboarding()` in `Api.js`
- Components: `client/src/components/Onboarding/` — OnboardingWizard, steps/ (Welcome, ProfileSetup, Interests, FeatureShowcase, FirstAction), components/ (StepProgressBar, TypewriterText)
- CSS: `OnboardingWizard.css` — warm editorial luxury aesthetic (Playfair Display, Lora, amber accents, glass morphism)
- Home.jsx: `showOnboarding` state, `checkOnboarding` useEffect, `handleOnboardingComplete` callback
- `userExists` prop skips profile step (starts at step 2) for interrupted flows
- Final step CTA adapts to `writingGoal`: journal/publish→write, stories→story, explore→feed

## Mobile App UI Parity (Mar 2026)
- **Location:** `C:\Users\johnm\iskrib_mobile_app\apps\mobile\`
- **React Native 0.84.0** with React 19, monorepo under `apps/mobile/`
- **Theme system:** `src/theme/tokens.ts` (light/dark palettes), `ThemeProvider.tsx`, `useThemeStyles.ts`
- **Old `colors.ts` deleted** — all 20+ screens migrated to `useTheme()` hook
- **Typography:** 4 font families (Outfit, Lora, Lexend Deca, Playfair Display) in `assets/fonts/`, linked via `react-native.config.js`
- **Type scale:** `src/theme/typography.ts` — hero, h1-h3, body, ui, caption, button presets
- **Spacing/shadows:** `src/theme/spacing.ts` — spacing tokens, radii, platform-aware shadows
- **Icons:** `src/components/icons/Icon.tsx` — 20 SVG icons via react-native-svg (Heart, Comment, Bookmark, etc.)
- **Core components:** Avatar, PostCard+ActionBar, SearchInput, Chip, GlassCard, SkeletonLoader, EmptyState, Toast
- **LexicalRenderer:** `src/lib/content/LexicalRenderer.tsx` — walks Lexical JSON tree, renders native Text/View/Image
- **Auth screens:** Branded ISKRIB header, gold focus rings, username field on signup, ForgotPasswordScreen
- **Home feed:** PostCard integration, branded header, filter Chips, FAB write button
- **Profile:** Glass card stats, badge pills, colored header bg, avatar with badge ring
- **Notifications:** Avatar + icon overlay, unread gold dot, tap-to-navigate
- **Explore:** SearchInput, tab filters (All/Users/Posts), avatar user rows
- **RelatedPosts:** Horizontal scroll cards below post content
- **Tab bar:** Icons (Home/Compass/Book/Bell/User) with amber active tint
- **Nav types:** Extended with VisitProfile, EditProfile, Settings, FollowList
- **Completed phases:** 0 (Foundation), 1 (Auth), 2 (Feed), 3 (Content), 4A (Profile), 6 (Discovery/Notifs/Explore), 9C (Tab Icons)
- **Remaining phases:** 4B-D (VisitProfile, EditProfile, image picker), 5 (Social), 7 (Stories polish), 8 (Animations), 9A-B (Settings), 10 (Missing features)
