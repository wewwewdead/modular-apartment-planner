# TODOS

## Craftsman Studio — Phase 1 DONE

Phase 1 shipped: Material Library (23 materials), BOM + Cost Estimator, DXF/SVG/PDF export, Craftsman Mode toggle. All in `src/features/sketchstudio/craftsman/`.

## Craftsman Studio — Phase 2 DONE

All Phase 2 features shipped:
- Kerf compensation toggle in export bar (default 0.2mm laser kerf)
- Per-linear-meter lumber pricing (materialCostUtils extended)
- Cut-list optimizer with visual sheet nesting diagram (FFDH algorithm)
- Smart joint library (7 joint types, auto-recommendation by material/thickness)
- Parametric variables system (named vars, expression evaluation, entity references)
- Assembly instructions generator (role-based step ordering, joint recommendations)

## Craftsman Studio — Phase 3 DONE

Phase 3 shipped: Enhanced Craftsman Mode UX (collapsible sections, localStorage, touch targets), Template Gallery (8 templates), One-Click Workshop ZIP Export (DXF+SVG+BOM+Assembly in ZIP), web app manifest.

## Craftsman Studio — Phase 4 Ideas

### Exploded Isometric View for Assembly
Visual step-by-step with parts pulled apart along isometric axes.

### Custom Material Editor
Let users add/edit materials in the catalog, persist to workspace.

### Project Templates
Pre-built parametric templates: bookshelf, workbench, storage box, etc.

### Cost Comparison Mode
Compare costs across material alternatives side-by-side.

### Multi-sheet DXF Export
One DXF per sheet from the nesting optimizer — ready for batch CNC.

## Design Review Findings (2026-04-04)

### Touch Target Sizes
All interactive elements across Floorplan and Sketch Studio are below the 44px minimum.
Floorplan toolbar: 34-36px, Sidebar: 20-26px, Sketch Studio: 28-32px.
Impact: accessibility violation, unusable on touch devices.

### Mobile Responsive Layout
Craftsman sidebar takes over entire viewport on mobile, hiding the drawing canvas.
Needs slide-out drawer or bottom sheet pattern instead of full-screen overlay.

### Cross-Page Theme Consistency
Homepage (cream), Floorplan (white/light), Sketch Studio (dark navy) — three different visual languages.
Consider unifying or creating a clear transition between themes.

### Sketch Studio Color Tokens
Sketch Studio uses hardcoded hex/rgba values instead of CSS custom properties.
Floorplan already uses variables.css tokens. Align Sketch Studio to use the same system.

### BOM Table React Key Collisions
Multiple entities with same name+material generate duplicate React keys, causing
console warnings and potential rendering issues.

### Template Gallery Previews
Templates show text-only descriptions. Add SVG thumbnail previews generated from template data.

## Hook Refactor — DONE

useSketchStudio.js split into 7 files (2,224 → 804 line coordinator + 6 sub-hooks). Completed 2026-04-01.

## Final Polish to Production — DONE

Completed 2026-04-02. All items shipped:
- .gitignore updated (.claude/, .codex-build/)
- Professional README.md with Craftsman Studio as hero feature
- ESLint (flat config) + Prettier + Husky + lint-staged
- 4 new Vitest test files (BOM pipeline, parametric resolution, DXF export, SVG export) — 26 new tests
- Error handling on all export buttons with toast notifications (replaced alert())
- PWA service worker for offline workshop use
- npm audit clean (picomatch fix)
- .env.example placeholder
