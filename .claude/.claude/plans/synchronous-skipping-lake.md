# Fix: Comment Modal Focus Causes Page Scroll

## Context
When the comment modal opens, the `useEffect` on line 78-88 of `comments.jsx` calls `textAreaFocusRef.current.focus()` after a 500ms delay. This causes the browser to scroll the page down to bring the textarea into view, which is the real source of the scroll-to-bottom bug on mobile.

## File to Modify
- `client/src/components/comments/comments.jsx` (line 82)

## Change
Replace:
```js
textAreaFocusRef.current.focus();
```
With:
```js
textAreaFocusRef.current.focus({ preventScroll: true });
```

`preventScroll: true` is a standard `HTMLElement.focus()` option that focuses the element without scrolling it into view. Well-supported across all modern browsers.

## Verification
1. Open a post and click the comment button on mobile (or DevTools 375px)
2. Confirm the textarea receives focus (cursor visible, keyboard opens)
3. Confirm the page does NOT scroll down when the modal opens
