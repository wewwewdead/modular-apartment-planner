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

### Touch Target Sizes — IMPROVED
Increased site-wide: BOM buttons 18→28px, toolbar icons 34→40px, sidebar buttons 20-26→28-32px,
Sketch Studio file/toggle buttons 26→32px. Still below 44px WCAG ideal in dense areas.

### Mobile Responsive Layout — IMPROVED
Craftsman sidebar now capped at 40vh on mobile with scroll overflow. Canvas visible above.
Future: full slide-out drawer pattern for better mobile UX.

### Cross-Page Theme Consistency — INTENTIONAL
Homepage (cream), Floorplan (white/light), Sketch Studio (dark navy) — three visual languages.
This is an intentional design choice: light themes for 2D drafting/planning, dark theme for
the technical workshop environment. Common in CAD/design tools (Figma, Fusion 360).
Future work: add user preference toggle for dark/light mode across all workspaces.

### Sketch Studio Color Tokens — PARTIALLY DONE
Added --dark-* token system to variables.css. Migrated 70+ hardcoded values in craftsman.module.css
to tokens. Remaining: ~70 minor color values in craftsman, sketchstudio.css still needs migration.

### BOM Table React Key Collisions — FIXED
Keys now use entity IDs instead of partName-material-index.

### Template Gallery Previews — DONE
Each template card now shows an SVG wireframe icon (TemplateThumbnail.jsx).

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
