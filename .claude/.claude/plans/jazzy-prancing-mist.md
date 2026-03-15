# Photoshop-Style Sidebar Layout for Canvas Editor

## Context
The current canvas editor has all tools in a horizontal bottom dock. The user wants a Photoshop-like layout: a narrow vertical toolbar on the left with tool/setting icons, and a right-side context panel for tool-specific controls (doodle palette, font picker, selection actions). On mobile, the sidebar is collapsible via a toggle button.

## Files to Modify
- `client/src/components/HomePage/Canvas/CanvasEditor.jsx` — restructure JSX layout
- `client/src/components/HomePage/Canvas/CanvasEditor.module.css` — new layout styles
- `client/src/components/HomePage/Editor/editor.css` — widen parent container for canvas mode

## New Layout

### Desktop (>820px)
```
editorRoot
  remixBanner (optional)
  editorLayout (flex-direction: row)
    sideToolbar (44px, vertical strip)
      [Select] [Aa] [Img] [Draw]
      ─── separator ───
      [1:1/4:5] [Grid] [Snap] [Theme]
    canvasColumn (flex: 1, column)
      stageShell (canvas + hud + minimap)
      loaderWrapper
      editorFooter (word count + share)
    contextPanel (~260px, conditional)
      snippetComposer | doodleControls | selectionPanel
```

### Mobile (<=820px)
```
editorRoot
  remixBanner (optional)
  editorLayout (column)
    canvasColumn
      stageShell
      loaderWrapper
      editorFooter
  sideToolbar → fixed left-edge overlay, toggled by a small button
  contextPanel → fixed bottom sheet overlay, slides up when a tool has context
```

## Implementation

### 1. Widen parent container (`editor.css`)
- `.editor-container.is-canvas-mode` max-width: `980px` → `1100px`

### 2. CSS changes (`CanvasEditor.module.css`)

**Modify `.editorRoot`:**
- Remove `padding-bottom: 9.3rem` (no longer needed since toolbar isn't a fixed bottom dock)

**New `.editorLayout`:**
- `display: flex; flex-direction: row; gap: 0.55rem; flex: 1; min-height: 0`
- On mobile (`max-width: 820px`): `flex-direction: column`

**New `.canvasColumn`:**
- `flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.7rem`

**New `.sideToolbar` (desktop):**
- `width: 44px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; padding: 0.5rem 0.2rem`
- Glass morphism: `border-radius: 16px; border: 1px solid var(--dock-border); background: var(--dock-bg); backdrop-filter: blur(15px) saturate(125%)`
- `align-self: flex-start` (doesn't stretch full height)

**New `.sideToolButton`:**
- `width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(20,24,29,0.14); background: rgba(255,255,255,0.45); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.82rem`
- Reuse `.toolButtonActive` glow for active state

**New `.sideToolSeparator`:**
- `width: 26px; height: 1px; background: rgba(20,24,29,0.12); margin: 0.2rem 0`

**New `.contextPanel` (desktop):**
- `width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.6rem`
- Same glass morphism as sideToolbar
- `overflow-y: auto; max-height: fit-content; align-self: flex-start`
- `border-radius: 16px`

**New `.contextPanelHeader`:**
- `font-size: 0.7rem; font-weight: 650; color: color-mix(in srgb, var(--atelier-ink) 72%, transparent); padding: 0 0.1rem`

**Mobile sidebar (<=820px):**
- `.sideToolbar` on mobile: `position: fixed; left: 0; top: 50%; transform: translateY(-50%); z-index: 26; width: 48px; border-radius: 0 16px 16px 0`
- Hidden by default, shown when `isMobileDockOpen` is true
- `.sideToolbarToggle`: `position: fixed; left: 0; top: 50%; transform: translateY(-50%); z-index: 25; width: 24px; height: 56px; border-radius: 0 10px 10px 0; background: var(--dock-bg); backdrop-filter: blur(10px); cursor: pointer` — a thin tab on the left edge

**Mobile context panel (<=820px):**
- `.contextPanel` on mobile: `position: fixed; bottom: 0; left: 0; right: 0; max-height: 50vh; z-index: 26; border-radius: 18px 18px 0 0; padding: 0.65rem; overflow-y: auto`

**Remove/deprecate:**
- `.toolbarDock`, `.mobileDock`, `.toolbarDockMinimized`, `.toolbarOrb`, `.toolbarOrbOpen`, `.doodleMiniBar` — no longer used
- Mobile `padding-bottom` overrides in `@media (max-width: 820px)` for `.editorRoot`

### 3. JSX restructure (`CanvasEditor.jsx`)

**Remove** the entire `toolbarDock` div (lines ~1485–1725) and its contents.

**Remove** `isDoodleDockMinimized` state and `showMinimizedDoodleDock` derived value.

**Wrap** `stageShell` + `loaderWrapper` + `editorFooter` inside a new `canvasColumn` div.

**Add** `editorLayout` wrapper containing: `sideToolbar` + `canvasColumn` + `contextPanel`.

**Left sidebar buttons** — compact square buttons with short text or unicode symbols:
- Select: `⇲` cursor icon
- Text: `Aa`
- Image: `▦`
- Doodle: `✎`
- Separator
- Aspect: `⬜` (toggles 1:1 ↔ 4:5, shows current)
- Grid: `▦` (grid icon)
- Snap: `⊞`
- Theme: `◐` (half-circle)

Each button uses `sideToolButton` class + `toolButtonActive` when active. `title` attribute for tooltip.

**Right context panel** — shows conditionally:
- When `isSnippetComposerOpen`: snippet input + add/cancel
- When `activeTool === "doodle"`: palette, size slider, undo/redo/clear
- When `selectedObject && activeTool === "select"`: font style carousel + resize/rotate/flip/front/back/remove
- Panel header shows: "Add Text" / "Doodle" / "Selection"
- When none of the above, panel is hidden entirely (no empty panel)

**Mobile toggle:**
- `isMobileDockOpen` reused for sidebar visibility
- Small tab button (`.sideToolbarToggle`) always visible on mobile left edge
- `handleCanvasPointerDown` already closes dock on mobile tap → keeps working
- Context panel visible on mobile whenever the relevant tool/selection is active (slides up from bottom)

### 4. Remove old toolbar zoom buttons
The bottom settings row had "Zoom -", "Zoom +", "Reset View" buttons. These are already in the HUD overlay (from the previous change), so they are removed from the sidebar settings.

## Verification
1. Desktop: left toolbar strip visible beside canvas, right panel appears when selecting a tool/object
2. Mobile: thin toggle tab on left edge, tap → sidebar slides in, tap canvas → closes
3. Mobile: context panel slides up from bottom when active tool has controls
4. Switch tools → right panel content updates accordingly
5. Dark/light theme → sidebars inherit theme via CSS variables
6. Canvas responsive sizing works (shellRef measures canvasColumn width)
7. Minimap + HUD zoom still correctly positioned within stageShell
8. Doodle drawing works correctly (no interaction conflicts with new layout)
9. Snippet composer input focuses correctly in the right panel
