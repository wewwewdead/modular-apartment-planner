# Fix: Italic formatting not visually rendering in editor

## Context
When users select text and click the italic toolbar button (or toggle italic and start typing), the button correctly highlights as active but the text doesn't visually appear italic.

## Root Cause
In `client/src/index.css` line 9, `:root` declares `font-synthesis: none;`. This prevents the browser from synthesizing faux italic for fonts that don't have a real italic variant. The editor content inherits Outfit (which has no italic face), so `font-style: italic` has no visible effect.

## Fix
**File:** `client/src/components/HomePage/Editor/editor.css`

Add `font-synthesis: style` to `.editor-input` to allow the browser to synthesize italic rendering within the editor, while keeping the global `font-synthesis: none` intact for the rest of the app:

```css
.editor-input {
    font-synthesis: style;
}
```

## Verification
1. Open the editor, type text, select it, click italic — text should visually slant
2. Toggle italic on, start typing — new text should appear italic
3. Verify bold and underline also render correctly
4. Confirm rest of the app UI (outside editor) is unaffected
