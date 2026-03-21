# TODOS

## Phase 8 Preparation

### Split useSketchStudio hook into composable sub-hooks
**Priority:** Medium
**Effort:** human: ~2 days / CC: ~30 min

The `useSketchStudio.js` hook is 1,957 lines — a single orchestration point for the entire SketchStudio workspace. As Phase 8+ adds nesting, constraints, and costing features, this will grow past 2500 lines and become hard to maintain.

**Proposed split:**
- `useObjectDraft` — object draft CRUD, field commits, save/load/clear
- `useSketchCanvas` — pointer events, pan, zoom, tool dispatch
- `usePartManagement` — part creation, parametric templates, generators, feature assignment
- `useExport` — validation, export, send-to-floor-planner

**Why:** Better testability, clearer ownership boundaries, easier navigation.
**Risk:** Shared state dependencies between sub-hooks need careful extraction.
**Depends on:** Nothing. Can be done anytime before Phase 8 features land.
**Added:** 2026-03-21 via /plan-eng-review
