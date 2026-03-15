# Add "Delete Item" to Vault

## Context

The Vault screen lets users add and select items but has **no way to delete them**. The domain model already has full soft-delete infrastructure (`Item.isDeleted`, `Item.deletedAt`, `Item.deletedFromCategoryName`, `Vault.deletedItems[]`) but the repository, store, and UI layers were never wired up.

## Approach

**Swipe-left-to-delete** on `VaultItemCard`, mirroring the swipe-right-to-fulfill pattern already used in `CartItemRow`. Red background reveals a trash icon. Exceeding threshold triggers an `Alert.alert` confirmation, then soft-deletes. Also clears the item from `draftSelections` if selected.

## Changes (4 files)

### 1. `src/storage/repository.ts` — add `deleteItem()` method

Add a new `deleteItem(itemId: string)` method to `AppRepository`:
- Use `this.mutate()` (same pattern as other methods)
- Find the item across all categories
- Set `isDeleted = true`, `deletedAt = now`, `deletedFromCategoryName = category.name`
- Remove item from `category.items` array
- Push item to `vault.deletedItems` array
- Return early if item not found

### 2. `src/state/useAppStore.ts` — add `deleteItem` action

- Add `deleteItem: (itemId: string) => Promise<void>` to `AppStoreState` interface
- Implementation: call `appRepository.deleteItem(itemId)`, set appState, also remove from `draftSelections` if present

### 3. `src/screens/vault/components/VaultItemCard.tsx` — add swipe-to-delete gesture

Transform from static `View` to swipeable row (same pattern as `CartItemRow`):
- Add `onDelete` prop
- Wrap in `GestureDetector` with `Gesture.Pan()` — **left swipe** only (`Math.min(0, translationX)`)
- Red background reveal (trash icon from MaterialCommunityIcons) behind the row, aligned right
- Threshold at -120px triggers `onDelete` callback
- Spring back to 0 on release
- Accessibility: add `onLongPress` to trigger delete as fallback for TalkBack users

### 4. `src/screens/vault/VaultScreen.tsx` — wire up delete

- Pull `deleteItem` from store
- Add `handleDeleteItem` with `Alert.alert` confirmation ("Delete item?", "This will remove {name} from your vault.")
- Pass `onDelete` to `VaultItemCard`
- Wrap `SectionList` in `GestureHandlerRootView` (needed for gesture detection)

## Key patterns to reuse

- **Swipe gesture**: `CartItemRow.tsx` lines 39-51 — `Gesture.Pan()` + `runOnJS` + `withSpring` snap-back
- **Reveal background**: `CartItemRow.tsx` lines 62-65 — absolute positioned, opacity driven by translateX
- **Soft-delete model fields**: `Item.isDeleted`, `Item.deletedAt`, `Item.deletedFromCategoryName` (already on the interface)
- **`Vault.deletedItems`** array (already exists, initialized empty)
- **Repository `mutate()`**: `repository.ts` line 53 — load → clone → mutate → persist pattern
- **Store action pattern**: e.g. `addItem` at line 87 in `useAppStore.ts`

## Verification

1. `npx tsc --noEmit` — zero errors
2. `npx jest` — domain tests pass
3. Manual: swipe left on a vault item → red trash reveal → release past threshold → confirmation alert → item disappears from list
4. Manual: item with draft selection → delete → confirm selection badge gone
5. TalkBack: long-press on item triggers delete confirmation
