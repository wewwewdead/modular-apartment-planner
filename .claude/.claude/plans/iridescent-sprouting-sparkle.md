# UX Audit & Visual Redesign Plan — Modular Apartment Planner

## Context

The Modular Apartment Planner is a browser-based CAD tool (React 19, Vite, CSS Modules, SVG rendering). It has a solid feature set (walls, doors, windows, beams, stairs, roofs, trusses, phases, sheets, 3D preview) but its UI has accumulated density and polish gaps. The goal is to elevate it from functional to **premium minimal + delightful** — professional precision meets warm approachability — without removing any functionality.

---

## 1. UX Audit — 7 Biggest Problems

### P1: Toolbar Overflow & Hidden Tools (Critical)
The toolbar packs 30+ buttons into a single 56px row with `overflow-x: auto` and a nearly-invisible 3px scrollbar (`Toolbar.module.css:9-20`). Below ~1400px, tools clip off-screen. Users cannot see all available tools at once.

### P2: No Empty States or Onboarding (High)
New projects show a blank grid with no guidance. Empty sidebar sections render nothing or bare text like "Draw first truss above beams" (`Sidebar.jsx`) without icons or illustrations. No contextual help for first-time users.

### P3: Touch & Mobile Non-Functional (High)
All interaction uses `onMouseDown/Move/Up` events (`SvgCanvas.jsx`). No touch handlers. The 260px sidebar + 280px properties panel leave ~460px for canvas on a 1000px tablet. No breakpoint collapses side panels automatically.

### P4: Input Fields Too Compact for Precision Work (Medium-High)
All inputs are 28px tall / 12px font (`InputField.module.css:24-36`). For a CAD tool with millimeter-precision entry, this is uncomfortably small. The unit suffix is 10px and easy to miss.

### P5: Status Bar Has No Visual Hierarchy (Medium)
The status bar (`SvgCanvas.module.css:23-41`) dumps 6-10 items flat — coordinates, zoom, view mode, tool, phase — all in 11px JetBrains Mono at the same weight. Rapidly-changing cursor coords have the same prominence as the rarely-changing active tool.

### P6: Segmented Controls Undersized (Medium)
Model-target and view-mode segmented controls are 30px/11px (`Toolbar.module.css:144-171`). These are primary navigation but styled like secondary UI. Phase view toggle is even smaller at 24px (`Sidebar.module.css:342`). Active state contrast is insufficient.

### P7: No Panel or Section Transition Animations (Medium)
Sidebar sections toggle with no animation — content appears/disappears. Panel collapse uses `display: none` (`App.module.css:79-81`) causing jarring layout jumps. No skeleton/loading states anywhere.

---

## 2. Information Architecture Improvements

### Before: "Draw a wall on a new floor"
1. Open app → blank grid, no guidance
2. Search sidebar for "Floors" section
3. Click "+" to add floor
4. Hover 13 identical 34x34 toolbar icons to find "Wall"
5. Click wall icon, draw → no confirmation

### After: "Draw a wall on a new floor"
1. Open app → canvas shows subtle centered hint: "Press W to draw walls, or select a tool above"
2. Floor 1 auto-created and selected
3. Wall tool has persistent label visible at wider viewports
4. Click wall → status bar transforms: contextual pill badge shows "Wall" in active glow color
5. Draw wall → toast confirms with undo link

### Before: "Switch from Floor to Roof editing"
1. Find small 30px "Floor | Roof | Truss | Sheets" control in toolbar
2. Click → instant swap, no transition
3. Sidebar content changes abruptly → disorienting

### After:
1. Model-target control is 36px with stronger active styling
2. Click "Roof" → smooth crossfade (canvas opacity transition 0.2s)
3. Sidebar sections animate in with staggered fade (30ms delay per item)
4. If no roof exists, canvas shows empty-state message with action button

---

## 3. Visual Redesign Direction — Design System Token Updates

**Aesthetic**: Figma's clarity + Linear's smoothness + Apple's refinement. Light, calm, precise. Subtle glassmorphism for overlays, warm neutral surfaces, Prussian blue as the single strong accent.

### File: `src/styles/variables.css`

**New/modified tokens to add:**

```css
/* Glassmorphism surfaces */
--color-surface-glass: rgba(255, 255, 255, 0.72);
--color-surface-glass-border: rgba(255, 255, 255, 0.45);

/* Semantic status colors */
--color-info: #3B82F6;
--color-info-subtle: rgba(59, 130, 246, 0.08);
--color-success: #10B981;
--color-success-subtle: rgba(16, 185, 129, 0.08);
--color-warning: #F59E0B;
--color-warning-subtle: rgba(245, 158, 11, 0.08);

/* Softer interaction overlays */
--color-hover-overlay: rgba(0, 0, 0, 0.03);
--color-pressed-overlay: rgba(0, 0, 0, 0.06);

/* Enhanced shadows */
--shadow-glass: 0 4px 24px rgba(0, 0, 0, 0.06), inset 0 0.5px 0 rgba(255, 255, 255, 0.5);
--shadow-floating: 0 8px 40px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
--shadow-toolbar: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03);

/* Additional transitions */
--ease-in-out-soft: cubic-bezier(0.4, 0, 0.2, 1);
--duration-layout: 0.25s;
--duration-stagger: 30ms;

/* Intermediate spacing */
--space-6: 6px;
--space-10: 10px;

/* Contrast-fixed tertiary text */
--color-text-tertiary: #6E7280;  /* bumped from #94989F for WCAG AA */
```

**Modified layout values:**
```css
--toolbar-height: 52px;     /* was 56px - tighter, more canvas */
--sidebar-width: 256px;     /* was 260px - aligns to 8px grid */
--properties-width: 288px;  /* was 280px - aligns to 8px grid */
```

---

## 4. Component-Level UI Upgrades — Top 4

### 4A: Toolbar — Larger Controls + Wrap on Narrow Viewports
**File**: `src/ui/Toolbar.module.css`

Changes:
- Segmented buttons: height 30px → 34px, font 11px → 12px, padding 10px → 12px
- Active segmented button: add `color: var(--color-active-glow)` and stronger shadow with blue tint
- Dividers: gradient-based (`linear-gradient(180deg, transparent, rgba(0,0,0,0.08), transparent)`) instead of flat line; height 24px → 20px
- At `@media (max-width: 1100px)`: add `flex-wrap: wrap; overflow-x: visible; height: auto; min-height: 52px` to toolbar
- Phase view toggle in sidebar: height 24px → 28px

### 4B: Status Bar — Semantic Visual Hierarchy
**Files**: `src/renderers/SvgCanvas.module.css`, `src/renderers/SvgCanvas.jsx`

Changes:
- Height 26px → 30px
- Add new CSS classes:
  - `.statusCoords`: 10px, tertiary color, blueprint font (de-emphasized — changes constantly)
  - `.statusTool`: 11px, 600 weight, active-glow color, subtle pill background (`var(--color-active-glow-subtle)`), 2px 8px padding, 10px border-radius (prominent)
  - `.statusContext`: 11px, 500 weight, UI font, secondary color
- Update JSX (lines ~681-699) to apply semantic classes to each status item
- Add `role="status" aria-live="polite"` to status bar element

### 4C: Sidebar — Smooth Animated Section Collapse
**Files**: `src/ui/Sidebar.module.css`, `src/ui/Sidebar.jsx`

Changes:
- Replace `{!collapsed && children}` conditional rendering with CSS grid height animation:
  ```css
  .sectionContent { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0.25s ease; }
  .sectionContentCollapsed { grid-template-rows: 0fr; }
  .sectionContentInner { overflow: hidden; min-height: 0; }
  ```
- Wrap section children in `<div className={sectionContent}><div className={sectionContentInner}>...`
- Add staggered fade-in on items via `animation-delay` (0ms, 30ms, 60ms, ..., capped at n+10)
- Count badges: font 11px → 10px, weight 600 → 700, tighter padding

### 4D: InputField — Larger Touch Targets & Better Focus
**File**: `src/ui/InputField.module.css`

Changes:
- Input height: 28px → 32px
- Input font: 12px → 13px
- Input padding: 0 8px → 0 10px
- Focus state: blue glow `0 0 0 3px rgba(45, 95, 142, 0.10)` instead of teal, `background: #FFFFFF`
- Suffix: 10px → 11px, color from tertiary → secondary
- Label flex-basis: 80px → 84px (4px grid aligned), `line-height: 32px` to match input

---

## 5. Mobile & Responsive Fixes

### New Breakpoint: 1024px (Tablets)
**File**: `src/app/App.module.css`

```css
@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 0px 1fr 0px;
  }
  .sidebar, .properties {
    position: fixed;
    top: var(--toolbar-height);
    bottom: 0;
    z-index: 20;
    transform: translateX(-100%) / translateX(100%);
    transition: transform var(--duration-layout) var(--ease-out);
    box-shadow: var(--shadow-floating);
  }
  .sidebarVisible { transform: translateX(0); }
  .propertiesVisible { transform: translateX(0); }
}
```

### Panel Collapse Animation (All Sizes)
**File**: `src/app/App.module.css`

Replace `.panelHidden { display: none; }` with:
```css
.panelHidden {
  width: 0;
  overflow: hidden;
  padding: 0;
  border: none;
  transition: width var(--duration-layout) var(--ease-in-out-soft),
              padding var(--duration-layout) var(--ease-in-out-soft);
}
```

### Touch Support Foundation
**File**: `src/renderers/SvgCanvas.module.css` — add `touch-action: none` to `.svg`
**File**: `src/renderers/SvgCanvas.jsx` — change `onMouse*` to `onPointer*` events (pointer events include mouse+touch, same handler signatures)

---

## 6. Accessibility & Performance Wins

### Accessibility (WCAG 2.2 AA)
1. **Contrast fix**: `--color-text-tertiary` from #94989F → #6E7280 (ratio ~3.0 → ~4.7:1) — `variables.css:14`
2. **Reduced motion**: Add `@media (prefers-reduced-motion: reduce)` to `global.css` zeroing animation/transition durations
3. **Keyboard-focusable sidebar items**: Convert `.item` divs to `<button>` elements in `Sidebar.jsx`
4. **Status bar aria**: Add `role="status" aria-live="polite"` to status bar div in `SvgCanvas.jsx`

### Performance
1. **Cursor position re-render**: Extract status bar cursor display to a separate component that reads from a ref, preventing full SvgCanvas re-render on every mouse move
2. **3D preview skeleton**: Replace plain text `previewFallback` with shimmer animation in `App.module.css`:
   ```css
   .previewFallback::after {
     content: '';
     position: absolute;
     inset: 0;
     background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
     animation: shimmer 1.5s infinite;
   }
   ```
3. **Layout containment**: Add `contain: content` to `.section` in `Sidebar.module.css`

---

## 7. Implementation Roadmap — 2-Week Prioritized Plan

### Week 1: High Impact, Low Risk (CSS-first changes)

**Day 1-2: Design Tokens + InputField**
- `src/styles/variables.css` — all new tokens (colors, spacing, shadows, transitions, layout values)
- `src/ui/InputField.module.css` — height, font, suffix, focus state
- `src/ui/PropertiesPanel.module.css` — segment control sizing
- Files: 3 | Risk: Very low

**Day 2-3: Toolbar Segmented Controls + Dividers**
- `src/ui/Toolbar.module.css` — segmented height/font/active state, gradient dividers, flex-wrap at 1100px
- `src/ui/Sidebar.module.css` — phase view toggle height 24→28px
- Files: 2 | Risk: Low

**Day 3-4: Status Bar Redesign**
- `src/renderers/SvgCanvas.module.css` — new semantic CSS classes, height increase
- `src/renderers/SvgCanvas.jsx` — apply classes to status items, add aria attributes
- Files: 2 | Risk: Low

**Day 4-5: Sidebar Animated Collapse**
- `src/ui/Sidebar.module.css` — grid-based collapse animation, staggered fade-in
- `src/ui/Sidebar.jsx` — wrap section children in animation container
- Files: 2 | Risk: Medium (test with all section types)

### Week 2: Medium Impact, Higher Complexity

**Day 6-7: Panel Collapse Transitions**
- `src/app/App.module.css` — replace `display: none` with width-based collapse + transitions
- `src/app/App.jsx` — pass visibility classes at narrow widths
- Files: 2 | Risk: Medium

**Day 7-8: Responsive Breakpoints (1024px)**
- `src/app/App.module.css` — fixed-position panels with slide-in transforms
- `src/app/App.jsx` — manage panel visibility state for narrow viewports
- Files: 2 | Risk: Medium

**Day 8-9: Accessibility Pass**
- `src/styles/variables.css` — contrast fix (already done Day 1)
- `src/styles/global.css` — prefers-reduced-motion
- `src/ui/Sidebar.jsx` — convert item divs to buttons
- `src/renderers/SvgCanvas.jsx` — aria-live (already done Day 3)
- Files: 3 | Risk: Low

**Day 9-10: Performance + Polish**
- `src/renderers/SvgCanvas.jsx` — extract cursor display component to avoid re-renders
- `src/app/App.module.css` — shimmer skeleton for 3D preview fallback
- `src/ui/Sidebar.module.css` — `contain: content`
- `src/renderers/SvgCanvas.jsx` + `SvgCanvas.module.css` — pointer events for touch
- Files: 4 | Risk: Medium

### Totals
- **~12 files modified**, 0 new files
- **0 breaking changes** (all additive CSS or minimal JSX restructuring)
- **Highest single-impact change**: Toolbar segmented controls + wrap (Day 2-3)
- **Most delightful change**: Sidebar animated collapse with staggered items (Day 4-5)

---

## Critical Files

| File | Role |
|------|------|
| `src/styles/variables.css` | All design tokens — changes propagate everywhere |
| `src/styles/global.css` | Animations, scrollbars, focus, reduced-motion |
| `src/ui/Toolbar.module.css` | Segmented controls, tool palette, responsive wrap |
| `src/ui/Sidebar.module.css` | Section collapse, item animations, count badges |
| `src/ui/InputField.module.css` | Form input sizing and focus states |
| `src/renderers/SvgCanvas.module.css` | Status bar, toast, overlay controls |
| `src/renderers/SvgCanvas.jsx` | Status bar JSX, aria, pointer events, cursor extraction |
| `src/ui/Sidebar.jsx` | Section collapse wrapper, item button conversion |
| `src/app/App.module.css` | Layout grid, panel collapse, responsive, skeleton |
| `src/app/App.jsx` | Panel visibility state for responsive |

## Verification
- Visual: Open app at 1920px, 1366px, 1024px, 768px widths — verify toolbar wraps, panels collapse, no overflow
- Interaction: Click each tool, verify segmented controls feel responsive and readable
- Animation: Toggle sidebar sections — verify smooth grid-row collapse with staggered items
- Accessibility: Tab through toolbar and sidebar — verify focus ring on all interactive elements
- Performance: Open DevTools Performance tab, move mouse rapidly over canvas — verify no layout thrashing from cursor updates
