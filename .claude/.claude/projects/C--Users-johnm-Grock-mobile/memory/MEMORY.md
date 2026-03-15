# Grock Mobile - Project Memory

## Architecture
- React Native 0.84.1, Android-only
- State: Zustand (`src/state/useAppStore.ts`) + SQLite (`src/storage/`)
- Navigation: `@react-navigation/native` v7 + `@react-navigation/native-stack` + `@react-navigation/bottom-tabs`
- Animations: `react-native-reanimated` 4.2.2
- Icons: `react-native-vector-icons` (MaterialCommunityIcons) - fonts.gradle added to android/app/build.gradle

## Navigation Structure (Post-Redesign)
- RootStack (native-stack): MainTabs | CartDetail | Paywall | History
- MainTabs (bottom-tabs): Home | Vault | Cart | Menu
- Custom tab bar: `src/components/navigation/GrockTabBar.tsx`
- Types: `src/navigation/types.ts` - `RootStackParamList`, `MainTabParamList`, composite types

## Theme System
- `src/theme/colors.ts` - Color tokens (warm palette: canvas, surface, brand, ink...)
- `src/theme/spacing.ts` - xs=4 through xxxl=32
- `src/theme/typography.ts` - headline/title/body/caption/label
- `src/theme/elevation.ts` - level0-3 Android elevation + shadow
- `src/theme/motion.ts` - Reanimated spring presets: snappy/gentle/bouncy/quick

## Shared Components (`src/components/`)
- AnimatedPressable, Card, Chip, SearchBar, ProgressBar, EmptyState, FloatingActionBar, SectionHeader

## Screen Component Organization
- `src/screens/home/components/` - HomeHeader, QuickActions, ActiveCartCard, HomeTabBar, etc.
- `src/screens/vault/components/` - VaultSearchBar, CategoryChipRow, VaultItemCard, VaultFAB, AddItemSheet, etc.
- `src/screens/cart/components/` - CartHero, BudgetBar, CartItemRow (swipe-to-fulfill), FulfillmentCheckmark, CartSummaryBar, etc.

## Key Domain
- `src/domain/models.ts` - Cart, CartItem (fulfillmentAnimationState 0-5, shouldShowCheckmark, shouldStrikethrough), Vault, Category, Item
- `src/lib/format.ts` - formatCurrency, formatDate, capitalize
- `computeDashboardSummary()`, `computeCartTotal()` for derived data

## Patterns
- List rendering: FlatList/SectionList + React.memo (no FlashList)
- All interactive elements use AnimatedPressable with scale/opacity spring
- Accessibility: roles, states, labels, live regions throughout
- Reanimated springs use ReduceMotion.System
