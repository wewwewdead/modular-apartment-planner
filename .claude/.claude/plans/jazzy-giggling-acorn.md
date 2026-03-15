# Collapsible Categories on Vault Screen

## Context

The Vault screen displays items grouped by category using a `SectionList` with sticky headers. When the vault has many categories with many items, it's hard to quickly navigate. Adding the ability to tap a category header to collapse/expand its items will improve navigation and reduce visual clutter.

---

## Approach

Use local component state (`Set<string>` of collapsed category UIDs) in `VaultScreen`. When a category is collapsed, pass an empty `data` array to the `SectionList` for that section. The section header gets an `onPress` handler and a chevron icon that animates rotation between expanded (down) and collapsed (right).

**Why local state:** Collapse state is ephemeral UI state — it resets on screen remount, which is the expected behavior. No need to persist in Zustand or SQLite.

**Why empty `data` array (not filtering sections):** SectionList still renders the sticky header for collapsed sections, allowing the user to tap to re-expand. Removing the section entirely would hide the header.

---

## Files Modified (3)

### 1. `src/components/SectionHeader.tsx`

Add optional collapse support:

- New props: `onPress?: () => void`, `collapsed?: boolean`
- When `onPress` is provided, wrap the container in `AnimatedPressable`
- Add a chevron icon (MaterialCommunityIcons `chevron-down`) to the right side, before the count badge
- Animate chevron rotation: `0deg` when expanded, `-90deg` when collapsed, using `withSpring(motion.snappy)`
- Import `AnimatedPressable`, `Animated` from reanimated, `useAnimatedStyle`/`withSpring`/`useSharedValue`, `motion`, and `MaterialCommunityIcons`

```
Layout when onPress provided:
[stripe] [title]                [chevron ▾] [count badge]
```

The chevron uses a Reanimated shared value driven by the `collapsed` prop. Rotation transitions smoothly via `withSpring`.

### 2. `src/screens/vault/components/VaultSectionHeader.tsx`

- Add props: `onToggle: () => void`, `collapsed: boolean`
- Pass through to `SectionHeader` as `onPress={onToggle}` and `collapsed={collapsed}`

### 3. `src/screens/vault/VaultScreen.tsx`

- Add state: `const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())`
- Add toggle handler:
  ```ts
  const toggleCollapse = useCallback((categoryId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);
  ```
- In the `sections` useMemo, after building each section, replace `data` with `[]` if `collapsedIds.has(cat.uid)`
- Update `renderSectionHeader` to pass `onToggle` and `collapsed` to `VaultSectionHeader`
- Remove `getItemLayout` optimization (variable section heights make it inaccurate with collapsible sections)

---

## Verification

1. Tap a category header — items should collapse with the chevron rotating to point right
2. Tap again — items re-expand, chevron rotates back down
3. Collapsed state should persist while scrolling (sticky headers still visible)
4. Search filtering should still work correctly on both collapsed and expanded categories
5. Multiple categories can be collapsed independently
6. Adding an item to a collapsed category should work (the sheet doesn't depend on collapse state)
