# Onboarding System for iskrib_v3

## Context
New users currently sign up, fill in a basic profile modal, see a single confetti message, and are dropped into the home feed with zero guidance. The app has a rich feature set (Write, Explore, Stories, Universe, Collections, Gallery, Opinions, Profile customization) that users never discover. This onboarding system will guide new users through features, encourage first actions, and provide helpful empty states throughout.

## Architecture Overview

**State management:** localStorage-based (no DB changes needed). A shared `useOnboardingState` hook + `OnboardingContext` tracks what the user has seen/completed. If localStorage is cleared, onboarding harmlessly replays — everything is skippable.

**Design language:** Matches existing aesthetic — warm gold/amber accents, glass morphism, Playfair Display headings, Lora body, Outfit UI text, Framer Motion spring animations.

---

## Part 1: Shared Infrastructure (build first)

### New files
- `client/src/hooks/useOnboardingState.js` — localStorage hook managing all onboarding state
- `client/src/Context/OnboardingContext.jsx` — context provider wrapping the hook
- `client/src/Context/useOnboarding.js` — `useContext` consumer hook
- `client/src/components/Onboarding/onboarding-shared.css` — shared CSS tokens (glass cards, buttons, dots, typography classes)

### Modified files
- `client/src/main.jsx` — wrap `<OnboardingProvider>` inside `<AuthProvider>`

### State shape
```js
{
  welcomeCompleted: false,
  tipsGlobalOff: false,
  tipsSeen: [],           // array of tip IDs
  checklistDismissed: false,
  checklist: {
    profile: false,
    firstPost: false,
    followWriter: false,
    exploreTrending: false,
    saveBookmark: false
  }
}
```

---

## Part 2: Enhanced Welcome Flow (replaces WelcomeMessage)

### What it does
After profile setup completes (line 312 in Home.jsx), a multi-step modal replaces the current confetti-only message with 5 slides:

1. **Personal welcome** — "Welcome to Iskrib, {name}" with user's avatar in a gold-ring circle, confetti on mount
2. **Write** — animated quill icon, "Write freely" — rich text, images, canvas
3. **Explore** — compass icon, "Discover voices" — trending posts, hot takes
4. **Stories** — book icon, "Tell your story" — serialized chapters
5. **Get Started** — two CTAs: "Write your first post" (opens editor) or "Explore posts" (goes to `/home/explore`)

Skip button always visible. Progress dots at bottom. Slide transitions via `AnimatePresence` with horizontal spring motion.

### New files (9)
- `client/src/components/Onboarding/WelcomeFlow/WelcomeFlow.jsx` — orchestrator
- `client/src/components/Onboarding/WelcomeFlow/WelcomeSlide.jsx` — animation wrapper
- `client/src/components/Onboarding/WelcomeFlow/ProgressDots.jsx` — dot indicator
- `client/src/components/Onboarding/WelcomeFlow/slides/WelcomePersonal.jsx`
- `client/src/components/Onboarding/WelcomeFlow/slides/FeatureWrite.jsx`
- `client/src/components/Onboarding/WelcomeFlow/slides/FeatureExplore.jsx`
- `client/src/components/Onboarding/WelcomeFlow/slides/FeatureStories.jsx`
- `client/src/components/Onboarding/WelcomeFlow/slides/GetStarted.jsx`
- `client/src/components/Onboarding/WelcomeFlow/welcomeflow.css`

### Modified files
- `client/src/components/HomePage/Home.jsx`:
  - Replace `setShowWelcomeMessage(true)` (line 312) with `setShowWelcomeFlow(true)`
  - Replace `<WelcomeMessage>` render (line 410-412) with `<WelcomeFlow>`
  - Wire `onAction` to open editor or navigate to explore

### Animation specs
| Element | Type | Stiffness | Damping |
|---------|------|-----------|---------|
| Modal enter | spring | 400 | 30 |
| Slide transition | spring | 300 | 28 |
| Avatar pulse | CSS keyframes | — | 2s loop |
| Confetti | canvas-confetti | — | 500ms delay |

---

## Part 3: Spotlight Tooltip System

### What it does
A reusable tooltip system that highlights UI elements for first-time users. Shows one tip at a time (not overwhelming), 2 seconds after page load. Each tip has a "Got it" dismiss button. Tips tracked in localStorage.

Tips on the home feed:
- **Write button** — "Tap here to create your first journal entry"
- **Explore link** — "Browse trending and hot posts"
- **Stories link** — "Read and write multi-chapter stories"
- **Universe link** — "Explore a 3D galaxy of all posts"

Uses `data-tip-target` DOM attributes on sidebar elements (no ref drilling).

### New files (4)
- `client/src/components/Onboarding/Spotlight/SpotlightTip.jsx` — positioned glass card near target element
- `client/src/components/Onboarding/Spotlight/SpotlightManager.jsx` — orchestrates which tip to show per page
- `client/src/components/Onboarding/Spotlight/tipDefinitions.js` — tip content config
- `client/src/components/Onboarding/Spotlight/spotlight.css`

### Modified files
- `client/src/components/SideBar/Sidebar.jsx` — add `data-tip-target` attributes to 4 link elements
- `client/src/components/HomePage/Home.jsx` — render `<SpotlightManager />` inside the home layout

---

## Part 4: Empty State Components

### What it does
Replace bare "no data" text with encouraging, branded empty states that include an action CTA.

| Location | Heading | CTA |
|----------|---------|-----|
| Following feed (no follows) | "Your feed is quiet" | "Discover writers" → `/home/explore` |
| Bookmarks (empty) | "Your bookmarks are empty" | "Explore posts" → `/home/explore` |
| Collections (empty) | "No collections yet" | "Create your first collection" |
| Profile posts (none) | "Your page is a blank canvas" | "Write something" → opens editor |
| Profile stories (none) | "No stories yet" | "Start your first story" |

### New files (2)
- `client/src/components/Onboarding/EmptyState/EmptyState.jsx` — reusable component (icon, heading, description, CTA)
- `client/src/components/Onboarding/EmptyState/emptystate.css`

### Modified files
- `client/src/components/Bookmarks/Bookmarks.jsx` — replace plain empty text
- `client/src/components/HomePage/postCards/PostCards.jsx` — add empty state for following feed
- `client/src/components/collections/Collection.jsx` — add empty state
- `client/src/components/ProfilePage/components/ProfileStoriesSection.jsx` — enhance empty state

---

## Part 5: Onboarding Checklist Widget

### What it does
A card at the top of the home feed (above DashboardBriefing) showing 5 milestones:

- [x] Complete your profile (auto-detected from user data)
- [ ] Write your first post
- [ ] Follow a writer
- [ ] Explore trending posts
- [ ] Save a bookmark

Progress bar with sage-to-amber gradient. Collapsible. Dismissable. Auto-hides when all 5 complete.

### Auto-completion tracking
- **Profile:** check `user.name && user.bio && user.image_url` on mount
- **First post:** trigger in editor submit success callback
- **Follow writer:** trigger in follow mutation `onSuccess`
- **Explore trending:** trigger when user visits `/home/explore`
- **Save bookmark:** trigger in bookmark mutation `onSuccess`

### New files (3)
- `client/src/components/Onboarding/Checklist/OnboardingChecklist.jsx`
- `client/src/components/Onboarding/Checklist/ChecklistItem.jsx`
- `client/src/components/Onboarding/Checklist/checklist.css`

### Modified files
- `client/src/components/HomePage/postCards/PostCards.jsx` — insert `<OnboardingChecklist>` above `<DashboardBriefing>`
- `client/src/utils/useMutation.js` — add `onSuccess` hooks in follow/bookmark mutations to update checklist

---

## Implementation Order

1. **Infrastructure** (Part 1) — hook, context, shared CSS, wire into main.jsx
2. **Welcome Flow** (Part 2) — highest impact for new signups
3. **Empty States** (Part 4) — quick wins, high visibility
4. **Checklist** (Part 5) — persistent guidance on home feed
5. **Spotlight Tips** (Part 3) — most complex, build last

## File Summary

| | New files | Modified files |
|---|---|---|
| Infrastructure | 4 | 1 |
| Welcome Flow | 9 | 1 |
| Spotlight Tips | 4 | 2 |
| Empty States | 2 | 4 |
| Checklist | 3 | 2 |
| **Total** | **22** | **~8 unique** |

## Verification
- Sign up with a new account → profile setup modal → WelcomeFlow slides appear with confetti
- Skip or complete the welcome flow → lands on home feed
- Checklist widget visible at top of feed with "Complete your profile" checked
- Click checklist items → navigate to relevant features
- Sidebar tooltips appear one-at-a-time after 2s delay on first visit
- Bookmarks/Collections/Profile pages show branded empty states with CTAs
- Dismiss checklist → it doesn't reappear
- Complete all 5 checklist items → widget auto-hides
- All components respect dark mode via CSS variables
- Mobile responsive (modals go full-width, checklist adapts)
