# Fix: `.ov-reply-input` too wide in nested replies

## Context
In the SidebarOpinions panel, when replying to a nested reply, the `.ov-reply-input` textarea stretches too wide, overflowing its container.

## Root Cause
The layout chain for nested reply inputs is:

```
.rc-thread  (padding-left: depth * 1rem)
  └─ .rc-reply  (flex row)
      └─ .rc-content  (flex: 1, min-width: 0) ✓ constrained
          └─ .rc-inline-composer  (flex column, overflow: hidden — but NO min-width: 0)
              └─ .ov-reply-input  (flex: 1)
```

`.rc-inline-composer` (line 1167) is a flex child of `.rc-content` but lacks `min-width: 0`. In flexbox, children default to `min-width: auto`, which prevents them from shrinking below their content size. The textarea inside expands beyond the available width at deeper nesting levels.

## Fix

### File: `client/src/components/SidebarOpinions/sidebarOpinions.css` (line 1167)
Add `min-width: 0` to `.rc-inline-composer`:

```css
.rc-inline-composer {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    overflow: hidden;
    padding-top: 0.25rem;
    min-width: 0;
}
```

This lets `.rc-inline-composer` shrink properly within the flex chain, so `.ov-reply-input` stays within bounds at any nesting depth.

## Verification
- Open an opinion with nested replies, click "Reply" on a deeply nested reply — input should not overflow
- Top-level reply input in opinionViewer should remain unchanged
- Resize sidebar / mobile — no horizontal overflow
