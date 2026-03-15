# Project Memory

## Architecture
- [Shared Server](server-shared.md) — The backend at `iskrib_v3/server/` is shared by both the web app and mobile app. All server changes must be backward-compatible with the web app.

## Feature Parity (Web → Mobile) — Implemented 2026-03-05
All 15 features from the web app have been implemented in the mobile app:

### New Files Created (21 total)
- `src/hooks/useFollowMutation.ts` — Reusable follow toggle mutation
- `src/screens/Social/FollowListScreen.tsx` — Followers/Following list
- `src/components/FeedTabBar.tsx` — All/Following/For You tab bar
- `src/components/DailyPromptCard.tsx` — Daily writing prompt card
- `src/screens/Settings/SettingsScreen.tsx` — Settings with theme toggle
- `src/screens/Editor/DraftsScreen.tsx` — Draft management
- `src/lib/api/opinionsApi.ts` — Opinions API module
- `src/components/OpinionCard.tsx` — Reusable opinion card
- `src/screens/Opinions/OpinionsFeedScreen.tsx` — Opinions feed
- `src/screens/Opinions/OpinionDetailScreen.tsx` — Opinion with replies
- `src/screens/Opinions/OpinionEditorScreen.tsx` — Create opinion (280 char)
- `src/screens/Profile/ProfileOpinionsTab.tsx` — User opinions tab
- `src/screens/Profile/ProfileMediaTab.tsx` — 3-column image grid
- `src/screens/Home/PromptResponsesScreen.tsx` — Prompt responses list
- `src/components/InterestSection.tsx` — Horizontal interest scroll
- `src/components/StreakDisplay.tsx` — Enhanced streak component
- `src/lib/api/analyticsApi.ts` — Analytics API module
- `src/screens/Analytics/AnalyticsDashboardScreen.tsx` — Analytics dashboard
- `src/components/WeeklyRecapModal.tsx` — Weekly recap modal
- `src/screens/Onboarding/OnboardingScreen.tsx` — Multi-step onboarding
- `src/screens/Profile/ProfileCustomizeScreen.tsx` — Font color + background

### Key Modified Files
- `src/lib/api/mobileApi.ts` — Added ~15 new API functions
- `src/lib/api/socialApi.ts` — Added toggleFollow, getFollowsData
- `src/navigation/types.ts` — Added 8 new route types
- `src/navigation/RootNavigator.tsx` — Registered all new screens
- `src/screens/Profile/ProfileTabBar.tsx` — Extended to 4 tabs (writings/stories/opinions/media)
- `src/screens/Home/HomeFeedScreen.tsx` — Feed tabs + weekly recap + daily prompt
- `src/screens/Profile/ProfileScreen.tsx` — Drafts/Analytics links, 4-tab support
- `src/screens/Profile/VisitProfileScreen.tsx` — Functional follow button
- `src/screens/Home/PostDetailScreen.tsx` — Post delete for own posts
- `src/screens/Editor/JournalEditorScreen.tsx` — Privacy toggle + draft save
- `src/screens/Home/ExploreScreen.tsx` — Interest sections
- `src/screens/Profile/ProfileHeroSection.tsx` — Longest streak display
- `src/screens/Profile/EditProfileScreen.tsx` — Customize link

### Pre-existing TS Errors (not from this change)
- `preview_text` property missing on JournalItem type (4 files)
- SignUpScreen argument mismatch
- postType null vs undefined in PostCard
