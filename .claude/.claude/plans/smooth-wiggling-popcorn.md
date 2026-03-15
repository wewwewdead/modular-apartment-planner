# Fix: Toolbar Overflow Scrollable

## Context
The toolbar (`.toolbar` in `src/ui/Toolbar.module.css`) uses `display: flex` with many button groups. When the window is narrow, the content overflows and buttons are clipped/hidden since there's no scroll mechanism.

## Change
**File:** `src/ui/Toolbar.module.css`

Add `overflow-x: auto` to the `.toolbar` class so it scrolls horizontally when content overflows. Also add `flex-shrink: 0` on `.group` to prevent groups from compressing, and hide the scrollbar for a clean look (the global thin scrollbar styles will apply, but we can make it even more minimal).

```css
.toolbar {
  /* existing styles... */
  overflow-x: auto;
}

.group {
  /* existing styles... */
  flex-shrink: 0;
}
```

## Verification
1. Run `npm run dev`, resize the browser window narrower than toolbar content width
2. Confirm toolbar scrolls horizontally instead of clipping
3. Confirm scrollbar appearance is subtle (thin scrollbar from global styles)
4. Confirm no layout shift — toolbar height stays fixed at `--toolbar-height`
