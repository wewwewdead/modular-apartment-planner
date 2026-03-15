# Fix: Change notification badge color from red to amber

## Context
The notification badge (red circle with unread count) on the Notifications tab icon uses the React Navigation theme's `notification` color, which is currently set to `colors.danger` (red). This clashes with the app's amber/gold accent theme. The user wants it to match the rest of the app.

## Change

**File:** `apps/mobile/src/navigation/RootNavigator.tsx` (line 189)

Change:
```tsx
notification: colors.danger,
```
To:
```tsx
notification: colors.accentAmber,
```

This single change updates the badge color from red (`#EF4444` dark / `#DC2626` light) to amber (`#E0BA6A` dark / `#D4A853` light), matching the app's accent color used throughout the UI.

## Verification
- Rebuild and run the app on device/emulator
- Navigate to the Notifications tab — the badge circle should now be amber/gold instead of red
