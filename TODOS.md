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

## Hook Refactor — DONE

useSketchStudio.js split into 7 files (2,224 → 804 line coordinator + 6 sub-hooks). Completed 2026-04-01.
