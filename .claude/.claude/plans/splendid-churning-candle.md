# Fix: Color popover clipped on mobile

## Context
On mobile (≤640px), the `.color-popover` is invisible because it's trapped inside `.editor-mode-shell` which has `overflow: hidden`. The toolbar (containing the color picker) is rendered by `EditorInner` inside `.editor-mode-shell`, so the popover can never escape.

## Root Cause
DOM hierarchy:
```
.editor-mode-shell (overflow: hidden)     ← Editor.jsx line 178
  .toolbar-wrapper                         ← RichTextEditor.jsx line 260
    .toolbar (overflow-x: auto on mobile)
      .toolbar-color-picker
        .color-popover                     ← clipped by both ancestors
```

## Fix: Move toolbar outside `.editor-mode-shell`

Move the `<ToolBar>` + wrapper rendering from `RichTextEditor.jsx` up into `Editor.jsx`, placing it **before** `.editor-mode-shell`. This removes the popover from the overflow clipping context entirely.

### File 1: `client/src/components/HomePage/Editor/Editor.jsx`
1. Add `import ToolBar from './Toolbar'`
2. Move `<div className="toolbar-wrapper"><ToolBar .../></div>` to render **before** `<div className="editor-mode-shell">` (around line 178)
3. Pass `addUploadedImagePath={addUploadedImagePath}` (already available as `addUploadedImagePath` state + `addUploadedImagePath` callback — note: the prop name used by ToolBar is `addUploadedImagePath`)

### File 2: `client/src/components/HomePage/Editor/RichTextEditor.jsx`
1. Remove the `<div className="toolbar-wrapper"><ToolBar .../></div>` block (lines 259-262)
2. Remove the `ToolBar` import (line 22) since it's no longer used here

### File 3: `client/src/components/HomePage/Editor/editor.css`
1. Revert the z-index mobile override added earlier (restore original state)
2. Also add the upward-flip override for `.color-popover` in the mobile media query — the popover still drops downward into `.toolbar`'s `overflow-x: auto` on mobile:
```css
.color-popover {
    bottom: calc(100% + 6px);
    top: auto;
}
```

New DOM hierarchy:
```
.editor-container
  .toolbar-wrapper                    ← now outside shell, no overflow clipping
    .toolbar
      .color-popover                  ← free to render above
  .editor-mode-shell (overflow: hidden)
    .editor-shell
      (editor content)
```

## Verification
1. Open editor in devtools at 375px width
2. Scroll toolbar to color buttons, tap text color — popover appears above toolbar, fully visible
3. Tap highlight — same
4. Swatches clickable, apply color to text
5. Desktop (>640px) — popover drops downward as before, unchanged
6. All toolbar buttons still functional (they use Lexical context, which wraps `Editor.jsx`)
