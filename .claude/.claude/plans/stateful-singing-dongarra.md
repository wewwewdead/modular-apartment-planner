# Optimize "Save Draft?" Confirmation Dialog

## Context

The close confirmation dialog was just implemented across `Editor.jsx`, `RichTextEditor.jsx`, and `editor.css`. It works, but has several UX gaps and minor code inefficiencies that should be tightened up before shipping.

---

## Changes

### 1. Escape key + backdrop click to dismiss (`Editor.jsx`)

No keyboard dismiss support and no backdrop click handling. Both are standard UX patterns.

**Add `useEffect` for Escape key:**
```jsx
useEffect(() => {
    if (!showCloseConfirm) return;
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') handleConfirmDiscard();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
}, [showCloseConfirm, handleConfirmDiscard]);
```

**Add `onClick` on overlay div** (`handleConfirmDiscard`), with `e.stopPropagation()` on the inner card to prevent close when clicking the card itself.

### 2. Auto-focus "Save Draft" button on dialog open (`Editor.jsx`)

When the dialog appears, focus should land on the primary action button so keyboard users can immediately press Enter.

```jsx
const saveButtonRef = useRef(null);
useEffect(() => {
    if (showCloseConfirm) saveButtonRef.current?.focus();
}, [showCloseConfirm]);
```
Attach `ref={saveButtonRef}` to the "Save Draft" button.

### 3. Read editor state directly from Lexical on save (`Editor.jsx`)

Currently `handleConfirmSaveDraft` reads `editorStateRef.current.editorState` which could be stale if the last keystroke didn't trigger `onchange` yet. Read directly from the Lexical editor instance instead:

```jsx
const handleConfirmSaveDraft = useCallback(async () => {
    let currentEditorState;
    editor.read(() => {
        currentEditorState = JSON.stringify(editor.getEditorState().toJSON());
    });
    if (!currentEditorState || !session?.access_token) {
        handleCloseEditor();
        return;
    }
    // ... use currentEditorState instead of editorStateRef.current.editorState
```

### 4. Handle save failure with retry instead of silent close (`Editor.jsx`)

Current catch block silently closes the editor on save failure — data loss. Instead, keep the dialog open and show an error hint:

```jsx
const [saveError, setSaveError] = useState(false);

// In catch:
} catch (err) {
    console.error('Failed to save draft on close:', err);
    setSaveError(true);
    setIsSavingDraft(false);
}
```

Show a small error line in the dialog: `"Couldn't save. Try again?"` — keeps the dialog open so user can retry or explicitly discard.

### 5. Prevent double-click on close button (`Editor.jsx`)

Rapid double-click on X can trigger `handleCloseEditor` twice before dialog renders. Gate with an `isClosing` ref:

```jsx
const isClosingRef = useRef(false);

const handleCloseClick = useCallback(() => {
    if (isClosingRef.current) return;
    const { hasChanges, hasContent } = editorStateRef.current;
    if (hasChanges && hasContent) {
        setShowCloseConfirm(true);
    } else {
        isClosingRef.current = true;
        handleCloseEditor();
    }
}, [handleCloseEditor]);
```

### 6. Remove `editorStateRef` from `onchange` deps (`RichTextEditor.jsx`)

`editorStateRef` is a ref — stable across renders. Including it in the `useCallback` deps array is unnecessary and could cause extra re-creates of the callback. Remove it from line 212's dependency array. Also remove `title` since it's read at save time, not needed to recreate the callback.

**Before:** `[setWordCount, saveStatus, editorStateRef, title]`
**After:** `[setWordCount, saveStatus]`

### 7. Cancel pending auto-save when dialog save fires (`Editor.jsx`)

If user clicks "Save Draft" in the dialog, the 30s auto-save timer in RichTextEditor might still fire concurrently. Clear it by exposing `saveTimerRef` via `editorStateRef` or by adding a `cancelAutoSave` callback prop. Simplest: clear the timer ref from the parent:

Add to `editorStateRef` writes: `editorStateRef.current.saveTimerRef = saveTimerRef`

In `handleConfirmSaveDraft`:
```jsx
if (editorStateRef.current.saveTimerRef) {
    clearTimeout(editorStateRef.current.saveTimerRef.current);
}
```

### 8. Remove duplicate `queryClient.invalidateQueries` (`Editor.jsx`)

Line 110 in `Editor.jsx` calls `queryClient.invalidateQueries({queryKey: ['journal-drafts']})` — but `RichTextEditor.jsx:125` already does the same after every successful save. Since `handleConfirmSaveDraft` calls `saveDraft` directly (bypassing RichTextEditor's handler), the invalidation in Editor.jsx is needed. However, if user clicks "Save Draft" in footer first, then closes — the close-save would double-invalidate. This is harmless but worth noting: **keep as-is** (it's the correct place for the close-save flow).

---

## Files to Modify

| File | Change |
|------|--------|
| `Editor.jsx` | Escape key effect, backdrop click, auto-focus, read from Lexical directly, save error state, double-click guard, cancel auto-save |
| `RichTextEditor.jsx` | Remove `editorStateRef`/`title` from `onchange` deps, expose `saveTimerRef` via `editorStateRef` |
| `editor.css` | Add `.editor-close-confirm-error` style for the error hint text, add `cursor: pointer` on overlay |

---

## Verification

1. **Escape key** → dialog dismisses (same as Discard)
2. **Click overlay backdrop** → dialog dismisses
3. **Click inside card** → dialog stays open (stopPropagation)
4. **Dialog opens** → "Save Draft" button is focused, Enter key triggers save
5. **Simulate network error** → error message appears in dialog, user can retry or discard
6. **Rapid double-click X** → dialog shows once, no duplicate close calls
7. **Type fast, immediately click X** → saved content matches what was typed (Lexical read, not stale ref)
