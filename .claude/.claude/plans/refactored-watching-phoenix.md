# Mobile App UI/UX Parity with iskrib_v3 Web App

## Context

The iskrib mobile app (`C:\Users\johnm\iskrib_mobile_app`) is a React Native 0.84.0 prototype with 20 screens and a working API layer, but its UI is minimal — cold blue-grey dark-only palette, no custom fonts, no icons, no avatars/images, and plain text post cards. The web app (`C:\Users\johnm\iskrib_v3`) has a polished editorial aesthetic with warm beige/gold colors, four custom typefaces, glass morphism, badge glow effects, banner images, emoji reactions, and dozens of refined UI patterns.

This plan transforms the mobile app to match the web's UI/UX across all features, implemented in phases.

---

## Phase 0: Design System Foundation

Everything depends on this. Build the shared tokens, theme provider, typography, icons, and core primitives.

### 0A. Theme System (Light + Dark)

**Create `src/theme/tokens.ts`** — translate web CSS variables from `client/src/index.css` into two palette objects:

| Token | Light | Dark |
|-------|-------|------|
| bgPrimary | `#FAF9F6` | `#0C0C0C` |
| bgSecondary | `#F3F1ED` | `#141414` |
| bgElevated | `#FFFFFF` | `#1A1A18` |
| bgCard | `#FEFEFE` | `#161614` |
| textPrimary | `#1A1612` | `#F0EBE3` |
| textSecondary | `#6B6560` | `#B0A89E` |
| textMuted | `#A8A29E` | `#6B6560` |
| accentGold | `#C4943E` | `#D4A853` |
| accentAmber | `#D4A853` | `#E0BA6A` |
| accentSage | `#8A9E7A` | `#9AB08A` |
| borderLight | `rgba(120,100,80,0.12)` | `rgba(255,240,210,0.06)` |
| danger | `#DC2626` | `#EF4444` |

**Create `src/theme/ThemeProvider.tsx`** — React context with:
- `theme: 'light' | 'dark'` state, persisted to AsyncStorage
- Defaults to device `Appearance.getColorScheme()`
- `useTheme()` hook returns `{ colors, theme, toggleTheme }`

**Create `src/theme/useThemeStyles.ts`** — helper so screens do `const s = useThemeStyles(makeStyles)` where `makeStyles = (c: Palette) => StyleSheet.create({...})`, memoized by theme.

**Modify:**
- `App.tsx` — wrap with `<ThemeProvider>`
- `RootNavigator.tsx` — derive `navTheme` from `useTheme()` instead of hardcoded `DarkTheme`
- **Delete** `src/theme/colors.ts` after all 20 screens are migrated to `useTheme()`

### 0B. Typography

Download 4 font families (Google Fonts TTF) into `apps/mobile/assets/fonts/`:
- **Outfit** (Regular, Medium, SemiBold, Bold) — UI text, buttons
- **Lora** (Regular, Italic, Bold) — body/reading content (serif)
- **Lexend Deca** (SemiBold, Bold) — post titles, headings
- **Playfair Display** (SemiBold, SemiBoldItalic) — brand "iskrib"

Link via `react-native.config.js` + `npx react-native-asset`.

**Create `src/theme/typography.ts`** — font family constants + type scale presets (`hero`, `h1`, `h2`, `body`, `ui`, `caption`, `button`).

### 0C. Spacing & Shadows

**Create `src/theme/spacing.ts`** — `spacing` (xs=4 through xxl=32), `radii` (sm=6 through pill=999), `shadows` (card, elevated, modal).

### 0D. Icon System

**Create `src/components/icons/`** — SVG icon components using `react-native-svg` (already a transitive dependency via Skia). Priority icons: Heart, Comment, Bookmark, Repost, Search, Bell, Home, Compass, Book, User, Pen, Settings, ArrowLeft, MoreDots, Share.

Alternative: install `react-native-vector-icons` (Feather set).

### 0E. Core UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `Avatar` | `src/components/Avatar.tsx` | Round image with optional badge glow ring (gold=legend, purple=OG) |
| `PostCard` | `src/components/PostCard/PostCard.tsx` | Banner image + user row + title + body preview + action bar |
| `ActionBar` | `src/components/PostCard/ActionBar.tsx` | Like/comment/bookmark/repost icons with counts |
| `CachedImage` | `src/components/CachedImage.tsx` | Image with shimmer placeholder (use `react-native-fast-image`) |
| `SearchInput` | `src/components/SearchInput.tsx` | Styled input with search icon |
| `Chip` | `src/components/Chip.tsx` | Pill-shaped filter button with gold gradient border |
| `GlassCard` | `src/components/GlassCard.tsx` | Translucent card (BlurView on iOS, rgba fallback on Android) |
| `SkeletonLoader` | `src/components/SkeletonLoader.tsx` | Shimmer loading placeholder |
| `EmptyState` | `src/components/EmptyState.tsx` | Centered icon + text for empty lists |
| `Toast` | `src/components/Toast.tsx` | Bottom toast notification |

**Upgrade existing:** `Screen.tsx` (add theme support), `PrimaryButton.tsx` (gold colors, icon support).

### New Dependencies for Phase 0
- `react-native-fast-image` — cached image loading
- `react-native-linear-gradient` — shimmer animations, gradient backgrounds
- Font files (Outfit, Lora, Lexend Deca, Playfair Display)
- Optional: `@react-native-community/blur` (iOS glass morphism)

---

## Phase 1: Auth Screens Polish

**Modify `src/screens/Auth/LoginScreen.tsx`:**
- Brand header: "ISKRIB" in Playfair Display + gold underline
- Tagline in Lora italic
- Warm gold focus rings on inputs (matching web `.auth-input:focus`)
- Themed primary button (dark bg in light mode, gold bg in dark mode)
- Add "Forgot password?" link

**Modify `src/screens/Auth/SignUpScreen.tsx`:**
- Add username field with real-time availability check (`GET /api/check-username/:username`)
- Auto-suggest username from name (matching web signup flow)
- Same visual styling as login

**Create `src/screens/Auth/ForgotPasswordScreen.tsx`:**
- Email input + submit using `supabase.auth.resetPasswordForEmail()`
- Add to `AuthStackParamList`

---

## Phase 2: Home Feed Visual Upgrade

**Modify `src/screens/Home/HomeFeedScreen.tsx`:**
- Replace inline card rendering with `<PostCard>` component
- Extract banner image URL from journal content/images
- Quick-action buttons → horizontal `<Chip>` row with gold gradient borders
- Branded header (Playfair Display "iskrib" logo)
- FAB (Floating Action Button) for "Write" in bottom-right corner
- Pull-to-refresh with themed gold indicator

**Create `src/components/PostCard/RepostCard.tsx`:**
- "UserName reposted" header badge
- Optional caption
- Embedded original post card (bordered, indented)

**Performance:** Add `react-native-fast-image` for banner images and avatars, `estimatedItemSize` on FlatList.

---

## Phase 3: Content Rendering (Lexical JSON → Native Views)

**Create `src/lib/content/LexicalRenderer.tsx`:**
Recursive React Native component that walks the Lexical JSON tree and renders native `Text`/`View`/`Image` elements:
- `paragraph` → `<Text>` with Lora serif body styling
- `heading` (h1-h3) → `<Text>` with Lexend Deca heading styling
- `quote` → `<View>` with left gold border + italic text
- `text` format flags → bold (1), italic (2), underline (4), strikethrough (8)
- `image` → `<CachedImage>` with proper sizing
- `link` → `<Text>` pressable, opens URL
- `linebreak` → newline character

This replaces the current `extractPlainText()` approach used in `HomeFeedScreen.tsx` and `lexical.ts`.

**Modify `src/screens/Home/PostDetailScreen.tsx`:**
- Use `<LexicalRenderer>` for post body
- Banner image hero at top
- Author section: large Avatar + name + badge + username
- Relative date formatting
- Full action bar with icons
- Comments section with avatars

---

## Phase 4: Profile Screens

### 4A. ProfileScreen Overhaul
**Modify `src/screens/Profile/ProfileScreen.tsx`:**
- Background color/gradient header (from `profile_layout`)
- Large avatar (120px) with badge ring
- Name + badge + username + bio (Lora serif)
- Stats row: posts, followers, following (in GlassCard)
- Tab navigation: Posts | Stories | Bookmarks
- Edit profile button + Settings gear icon
- Move sign out to Settings

### 4B. Visit Profile Screen
**Create `src/screens/Profile/VisitProfileScreen.tsx`:**
- Same layout as own profile but with Follow/Unfollow button
- Navigate here from tapping user avatars/names app-wide
- Add to `RootStackParamList`: `VisitProfile: { userId: string; username?: string }`

### 4C. Edit Profile Screen
**Create `src/screens/Profile/EditProfileScreen.tsx`:**
- Avatar change (image picker), name, username (availability check), bio
- Background color picker (gradient palette matching web)

### 4D. Image Upload Infrastructure
**Install `react-native-image-picker`**
**Create `src/lib/imagePicker.ts`** — wrapper handling permissions, camera/gallery selection, returns `{ uri, type, fileName }` for FormData upload.

**Add to API layer (`mobileApi.ts`):**
- `updateUserProfile(token, formData)` — `POST /update-user-data`
- `updateProfileLayout(token, layout)` — `POST /updateProfileLayout`
- `uploadBackground(token, formData)` — `POST /uploadBackground`
- `getUserByUsername(username)` — `GET /user/:username`

---

## Phase 5: Social Features

### 5A. Reactions/Emoji System
**Create `src/components/Reactions/ReactionPicker.tsx`** — horizontal emoji row, appears on long-press of like button.
**Create `src/components/Reactions/ReactionSummary.tsx`** — chips showing emoji + count on posts.
**Add to `socialApi.ts`:** `addReaction()`, `getReactions()`

### 5B. Following/Followers
**Create `src/screens/Profile/FollowListScreen.tsx`** — tabs: Followers | Following, each row: avatar + name + follow button.
**Add to `socialApi.ts`:** `getFollowers()`, `getFollowing()`, `toggleFollow()`

### 5C. Collections
**Create `src/screens/Collections/CollectionsScreen.tsx`** — list of user's collections.
**Create `src/screens/Collections/CollectionDetailScreen.tsx`** — posts in collection.
**Add to `socialApi.ts`:** `getCollections()`, `createCollection()`, `addToCollection()`, `deleteCollection()`

---

## Phase 6: Discovery & Engagement

### 6A. Related Posts
**Create `src/components/Discovery/RelatedPosts.tsx`** — shows below post content in PostDetailScreen, horizontal scroll of 2-5 compact cards.
**Add to `mobileApi.ts`:** `getRelatedPosts(journalId)` — `GET /journal/:journalId/related`

### 6B. Notifications Upgrade
**Modify `src/screens/Notifications/NotificationsScreen.tsx`:**
- Unread gold dot indicator, distinct background for unread
- Avatar + icon overlay (heart for like, speech bubble for comment)
- Tap → navigate to relevant post/profile
- Swipe to delete (gesture handler Swipeable)
- Badge count on bottom tab icon

### 6C. Explore Screen Upgrade
**Modify `src/screens/Home/ExploreScreen.tsx`:**
- Styled SearchInput with icon
- User results as profile rows (avatar + name + follow button)
- Journal results as mini PostCards
- Tab filters: All | Users | Posts

---

## Phase 7: Stories UI Polish

**Modify `StoryBrowserScreen.tsx`:** Cover images, 2-column grid, gold filter chips, trending section.
**Modify `StoryDetailScreen.tsx`:** Cover image hero, author row with avatar, chapter list with progress indicators, vote/library buttons.
**Modify `StoryChapterReaderScreen.tsx`:** Full-screen reading mode, `<LexicalRenderer>` for content, progress bar, prev/next chapter nav.

---

## Phase 8: Visual Effects & Animations

### 8A. Glass Morphism
**Create `src/components/GlassView.tsx`** — iOS: `@react-native-community/blur` BlurView, Android: semi-transparent View with elevation fallback.

### 8B. Animations (React Native Reanimated — already installed)
- Post card entrance: staggered `FadeInDown`
- Like button: scale bounce on tap
- Skeleton shimmer: animated LinearGradient
- Tab transitions: horizontal slide
- Pull-to-refresh: custom gold spinner

### 8C. Badge Glow Effects
- Animated ring behind legend (gold) and OG (purple) avatars using Reanimated animated shadows or `react-native-svg` pulsing ring.

---

## Phase 9: Settings & Navigation Updates

### 9A. Settings Screen
**Create `src/screens/Settings/SettingsScreen.tsx`:**
- Theme toggle (light/dark switch)
- Account settings (change password, email)
- Notification preferences
- Sign out (moved from Profile)
- App version

### 9B. Navigation Updates
**Modify `src/navigation/types.ts`** — add new routes:
```
VisitProfile, EditProfile, FollowList, Settings, ForgotPassword,
Collections, CollectionDetail, Opinions, OpinionDetail
```

### 9C. Bottom Tab Icons
**Modify `RootNavigator.tsx`** — replace text-only tab labels with icon + label:
Home (house), Explore (compass), Stories (book), Notifications (bell + badge count), Profile (user)

---

## Phase 10: Missing Feature Buildout

### 10A. Opinions Feature
**Create `src/screens/Opinions/OpinionsScreen.tsx`** — feed of short-form opinions.
**Create `src/screens/Opinions/OpinionEditorScreen.tsx`** — create opinion with character limit.
**Add to `socialApi.ts`:** `getOpinions()`, `addOpinion()`, `getOpinionReplies()`, `addOpinionReply()`

### 10B. Freedom Wall Upgrade
**Modify `FreedomWallScreen.tsx`** — styled cards matching web's chalk-board aesthetic, type filter pills, submit new entry.

### 10C. Universe Visualization Upgrade
**Modify `UniverseScreen.tsx`** — use React Native Skia (already installed) for styled post nodes with title labels, pan/zoom, tap to view.

### 10D. Gallery View
**Create/Modify `CanvasScreen.tsx`** — grid of canvas/media posts with thumbnails, filter by type.

### 10E. Writing Prompts & Streaks
Daily prompt card on home feed, streak badge on profile.
**Add to `mobileApi.ts`:** `getTodayPrompt()`, `getUserStreak()`

---

## Implementation Order & Dependencies

```
Phase 0  ← everything depends on this
  ├─ Phase 1 (Auth)
  ├─ Phase 2 (Home Feed) ← needs PostCard, Avatar, ActionBar, CachedImage
  ├─ Phase 3 (Content) ← LexicalRenderer, can parallel with Phase 2
  └─ Phase 9C (Tab Icons)

Phase 2+3 done
  ├─ Phase 4 (Profiles) ← needs image picker
  ├─ Phase 6 (Discovery)
  └─ Phase 7 (Stories)

Phase 4 done
  ├─ Phase 5 (Social)
  └─ Phase 9A (Settings)

Phase 5+6+7 done
  └─ Phase 8 (Effects) ← apply across all screens
  └─ Phase 10 (Missing features)
```

---

## New Dependencies Summary

| Package | Purpose | Phase |
|---------|---------|-------|
| `react-native-fast-image` | Cached image loading | 0E |
| `react-native-linear-gradient` | Gradients, shimmer | 0E |
| `react-native-image-picker` | Photo selection for uploads | 4D |
| `@react-native-community/blur` | iOS glass morphism | 8A |
| Font files (Outfit, Lora, Lexend Deca, Playfair Display) | Typography | 0B |
| *Already installed:* `react-native-reanimated` | Animations | 8B |
| *Already installed:* `react-native-gesture-handler` | Swipe gestures | 6B |
| *Already installed:* `@shopify/react-native-skia` | Universe viz | 10C |
| *Already installed:* `react-native-svg` | Icons | 0D |

---

## Key Files Modified (Summary)

| File | Phase | Change |
|------|-------|--------|
| `src/theme/colors.ts` | 0A | **Delete** — replaced by tokens.ts + ThemeProvider |
| `App.tsx` | 0A | Wrap with ThemeProvider |
| `src/navigation/RootNavigator.tsx` | 0A, 9B, 9C | Dynamic theme, new routes, tab icons |
| `src/navigation/types.ts` | 9B | Add ~8 new route types |
| `src/screens/Auth/LoginScreen.tsx` | 1 | Full redesign |
| `src/screens/Auth/SignUpScreen.tsx` | 1 | Add username, redesign |
| `src/screens/Home/HomeFeedScreen.tsx` | 2 | PostCard integration, FAB, chips |
| `src/screens/Home/PostDetailScreen.tsx` | 3 | LexicalRenderer, action bar, comments |
| `src/screens/Home/ExploreScreen.tsx` | 6C | Search styling, tabs |
| `src/screens/Profile/ProfileScreen.tsx` | 4A | Full profile page rebuild |
| `src/screens/Notifications/NotificationsScreen.tsx` | 6B | Read/unread, avatars, swipe |
| `src/screens/Stories/*.tsx` (7 files) | 7 | Cover images, chapter reader |
| `src/screens/Advanced/FreedomWallScreen.tsx` | 10B | Styled cards |
| `src/screens/Advanced/UniverseScreen.tsx` | 10C | Skia rendering |
| `src/lib/api/mobileApi.ts` | 4, 6, 10 | New endpoint functions |
| `src/lib/api/socialApi.ts` | 5 | Reactions, follows, collections |
| `src/lib/content/lexical.ts` | 3 | Expanded to LexicalRenderer |
| `src/components/Screen.tsx` | 0E | Theme support |
| `src/components/PrimaryButton.tsx` | 0E | Gold colors, icon support |

**~15 new files** created across components, screens, theme, and utils.

---

## Verification

After each phase:
1. Run `npx react-native run-android` / `run-ios` to verify no build errors
2. Visually compare each modified screen side-by-side with the web app (same account)
3. Test theme toggle switches all colors correctly
4. Test all navigation flows (tap user → VisitProfile, tap post → PostDetail, etc.)
5. Test API integration (like, comment, bookmark, follow, etc.)
6. Test edge cases: empty states, loading states, error states, long text, missing images
