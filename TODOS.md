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

## Design Review Findings (2026-04-06)

### Nav Touch Targets — FIXED by /design-review on main, 2026-04-06
Desktop nav links were ~25px tall, mobile menu links ~35px. Both below WCAG 44px minimum.
Increased padding to 10px vertical, added min-height: 44px on mobile. Commit f77bc20.

### Homepage Sketch Card Hardcoded Colors — FIXED by /design-review on main, 2026-04-06
WorkspaceCards.module.css sketch card used 6 hardcoded hex values instead of --dark-* tokens.
Replaced with CSS variables from the design system. Commit 18d08b0.

### Border Radius Token Gap — FIXED by /design-review on main, 2026-04-06
Cards used 16px radius but design system maxed at 12px. Added --radius-xl: 16px. Commit a96871e.

### Unused Spacing Tokens — FIXED by /design-review on main, 2026-04-06
Removed --space-6 and --space-10 (never used, broke the spacing scale). Commit df4c375.

### WCAG Contrast Fix — FIXED by /design-review on main, 2026-04-06
--dark-text-dim was #666 on #1e2433 (3.6:1 ratio, below WCAG AA 4.5:1). Changed to #8a8a8a
(~5.0:1). Used throughout Craftsman for secondary text. Commit f1edd7a.

### Craftsman :focus → :focus-visible — FIXED by /design-review on main, 2026-04-06
5 input selectors used :focus instead of :focus-visible, showing unnecessary focus rings on
mouse click. Aligned with rest of app. Commit 2513040.

### Craftsman monospace token — FIXED by /design-review on main, 2026-04-06
3 places used raw font-family: monospace instead of var(--font-blueprint). Joint panel icons
and parametric names now render in JetBrains Mono matching the rest of Sketch Studio. Commit edad4ca.

### Feature Grid Icon Pattern — DEFERRED
FeatureGrid.module.css 3-column grid with 36px icon-wrap + label matches AI Slop pattern #2/#3.
Borderline: items are compact and functional, not decorative SaaS card grids. Accept unless redesigning.

### Spacing Tokens Unadopted — DEFERRED (cross-model consensus)
Craftsman (0/95 values) and sketchstudio.css (0/~150 values) use raw px instead of
var(--space-*) tokens. Only floorplan UI files reference the spacing scale. A bulk
find-replace would fix Craftsman since values align with the scale. Larger effort for
sketchstudio.css which mixes domain-specific sizes.

### Hardcoded Colors in sketchstudio.css — DEFERRED (cross-model consensus)
~60-70 hardcoded hex values in SVG entity styling (lines 697-900+) and right panel text
(lines 972-1298). These should be tokenized as domain-specific dark-ss tokens. Large effort
but prevents drift when adjusting the dark theme.

### Breakpoint Consolidation — DEFERRED (cross-model consensus)
9 different breakpoint values used across the codebase (480, 640, 720, 768, 900, 920, 1024,
1100, 1200). Should consolidate to 3-4 canonical values with documentation. CSS custom
properties can't be used in @media queries, but a canonical set in variables.css comments
would prevent drift.

### Type Scale Tokens — DEFERRED (cross-model consensus)
23 distinct font sizes with no scale tokens (--text-xs through --text-5xl). Every font-size
is a magic number. Adding type scale tokens would eliminate ~100+ raw declarations.

### Touch Targets Below 44px — DEFERRED (partial)
Nav links fixed. Still below 44px: Modal close (28px), SvgCanvas overlay zoom (28px),
sidebar section add/floor buttons (32px), 3D mode toggle (26px). Floorplan toolbar buttons
drop to 30px at 1100px breakpoint. No pointer:coarse overrides on floorplan or 3D panel.

## Design Review Findings (2026-04-04)

### Touch Target Sizes — DONE
Floorplan toolbar icons 44px, segmented buttons 40px. Sidebar buttons 32px.
Sketch Studio file/icon/toggle 36px. BOM action buttons 32px. All meet or approach WCAG 44px.

### Mobile Responsive Layout — DONE
Mobile sidebar is a CSS bottom sheet with drag handle. Collapsed by default (44px peek),
expands on hover/focus-within. Canvas gets 60vh minimum. No JS needed.

### Cross-Page Theme Consistency — INTENTIONAL
Homepage (cream), Floorplan (white/light), Sketch Studio (dark navy) — three visual languages.
This is an intentional design choice: light themes for 2D drafting/planning, dark theme for
the technical workshop environment. Common in CAD/design tools (Figma, Fusion 360).
Future work: add user preference toggle for dark/light mode across all workspaces.

### Sketch Studio Color Tokens — DONE
Craftsman module: zero hardcoded hex colors (was 140+). Sketch Studio: all text, borders,
backgrounds, focus rings migrated to --dark-* tokens. Only SVG rendering colors remain hardcoded.

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

## QA Findings (2026-04-05)

### TV Fixture Negative Height — FIXED by /qa on main, 2026-04-05
FixtureRenderer.jsx TV bezel inset was `width * 0.04`, subtracted from depth. Thin wall-mounted
TVs (width=2000, depth=100) produced negative rect height and a console error. Fixed to use
`Math.min(width, depth) * 0.04`. Commit 86542e1 + regression tests at a0d7994.

### Cut-List Optimizer React Key Collisions — FIXED by /qa on main, 2026-04-05
nestingOptimizer.js `getPartId` used `partName-material-quantityIndex` and ignored dimensions.
BOM rows that share partName+material but differ in width/height (CNC Nesting Test template
ships two "Small B" parts in birch-plywood-3) produced identical IDs that React used as keys in
NestingPanel's placement render. Fixed by including width×height in the part ID. Commit f5b1fb9 +
regression tests at 787c13d.

### Stale Unit Test — FIXED by /review on main, 2026-04-05
Test asserted `DEFAULT_CATEGORY === 'furniture'` but source exports `'custom'`. Aligned the
test with the source value; three production callsites already use 'custom' as the default.
Commit f74bf55.

## Review Findings (2026-04-05)

### Joint ID Counter Collision — FIXED by /review on main, 2026-04-05
nextJointCounter started at 1 on every page load and was never seeded from loaded joints.
Loading a saved workspace with joint-3, joint-4 then adding a new joint produced joint-1 —
colliding with any existing joint-1. Switched to crypto.randomUUID. Commit 43f237d.

### Polyline Kerf Winding Bug — FIXED by /review on main, 2026-04-05
dxfExport.js polyline kerf normal formula (-dy, dx) produced INWARD normals for CW-in-screen
polygons (joinery profiles). Parts came out undersized. Verified with a regression test that
shrinks from 100 to 99.29 pre-fix. Added signed-area-based winding detection. Commit b90a031.

### JointPanel Performance — FIXED by /review on main, 2026-04-05
Two keystroke-path wins: replaced JSON.stringify equality with shallow-equal in the
autoDefaults sync effect, and narrowed defaultSeedJoint useMemo deps from full formState
object to the 8 fields buildSeedJoint actually reads. Prevents per-keystroke joinery
pipeline re-runs. Commit 303f587.

## Deferred from Review (P1)

### Polyline Kerf Magnitude — DEFERRED
Kerf formula displaces each vertex by halfKerf along the bisector diagonal rather than
computing per-edge parallel offsets. For 90-deg corners this yields ~halfKerf * sqrt(2)
total range expansion instead of kerf. Parts are ~30% undersized on 90-deg corners.
Direction is correct (see "Polyline Kerf Winding Bug" above), but proper polygon
offsetting would require intersecting offset edges.

### Missing Unit Tests for Joinery Modules — DEFERRED
2,680 lines of new joinery logic (jointGeometryUtils 1017 lines, jointResolvers 652 lines,
jointValidationUtils 367 lines, jointDefaults 346 lines) have no direct unit test files.
Integration coverage exists via sketchJoineryUtils.test.js (+736 lines), but individual
helpers can regress silently while integration tests still pass. Add per-module test files
before the next major joinery refactor.

### Parallel Joint Catalogs — DEFERRED
craftsman/data/joints.js exports JOINTS with IDs [finger, dovetail, pocket-hole, biscuit,
rabbet, dado, butt], while joinery/jointTypes.js ships JOINT_TYPES = [butt, dado, rabbet,
mortise_tenon, dowel, pocket_screw, tab_slot]. Only recommendJoint from the former is
consumed (by assemblyGenerator.js:8); getJointById, computeFingerJointParams, and the
JOINTS array are unused. Reconcile by migrating assemblyGenerator to the new registry
(adding metadata like minThickness, strength, difficulty, cncFriendly) and deleting the
old data file.

### JointPanel.jsx Component Extraction — DEFERRED
File is 801 lines with 4+ components (JointStatus, JointForm ~400 lines, ExistingJointList,
JointPanel) in one file. Extract into separate files for readability. Non-blocking.

### Joinery Module Splits — DEFERRED
jointGeometryUtils.js is 1017 lines with 20+ helpers + resolveJointGeometry orchestrator
(~184 lines, 5 levels of nesting). jointResolvers.js is 652 lines mixing vector math,
edge geometry, and contact resolution. Split each into 2-3 focused files before adding
new joint types.

### Joint-Type Switch Duplication — DEFERRED
The same JOINT_TYPES switch is repeated across 7 sites (jointDefaults.js x3,
jointGeometryUtils.js, jointValidationUtils.js, joinery/index.js, JointPanel.jsx).
Adding a new joint type requires touching all 7. Replace with a registry/strategy
table in jointTypes.js (each joint type entry carries its own defaults/geometry/
validator/summary functions).

### Additional Correctness Edge Cases — DEFERRED
- parseSerializedJointReference splits on ':' with 3-arg destructure — entityIds with
  colons silently truncate. Fix: split(':', 3) + slice(3).join(':'), OR reject colons
  in entityId creation.
- cloneJoint = normalizeJoint, which mints new IDs when input lacks one. Separate
  cloneJoint (preserve id, throw if missing) from normalizeJoint.
- toFiniteNumber(v, 0) silently coerces malformed input to 0, masking validation errors.
  Surface parse failures via warnings instead.

## Architecture Audit (2026-04-06)

### TODO 1: Hook Coordinator Refactor — DONE (2026-04-06)
useSketchStudio.js reduced to 260 lines (target ~300). Split into 11 sub-hooks.

### TODO 2: Joint Registry Refactor — DONE (2026-04-07)
Registry pattern in place. Each of 7 types carries normalizeParameters, computeDefaults,
validate, buildGeometry, summary, supportsAutoOverlapDepth. Old craftsman/data/joints.js
deleted. Per-type tests in joinery/types/__tests__/. Pipeline seam tests added for
jointResolvers, jointGeometryUtils, jointValidationUtils, jointDefaults.

### TODO 3: Component Extraction — DONE (2026-04-07)
JointPanel split into JointPanel (161) + JointForm (451). RightPanel split into
RightPanel (~120) + ConstraintForm + ConstraintsSection + SelectionActions.
Behavioral tests added for ConstraintsSection.

### TODO 4: Math Utility Tests — DONE (2026-04-06)
filletUtils.test.js (162 lines) and sketchExpressionUtils.test.js (132 lines) added.

### TODO 5: Small Fixes Bundle — DONE (2026-04-07)
parametricEngine moved to utils/. cloneJoint separated from normalizeJoint (throws on
missing id). toFiniteNumber warns on NaN. BOM gated behind craftsmanMode. BOM computed
once in SketchStudioLayout. clearSketchRecovery called after save.

### TODO 6: Render Performance — DONE (2026-04-07)
React.memo boundaries added to RightPanel, TopBar, StatusBar, CraftsmanSidebar.
handleOpenSketch stabilized with useCallback. Codex outside voice showed reducer split
would not help without memoization — memo boundaries address the actual render propagation.
Profile with React DevTools on complex templates to verify. Full reducer split deferred
unless profiling shows remaining overhead.

### TODO 7: Viewport Persistence Fix — DONE (2026-04-07)
Viewport excluded from dirty-check serialization. Pan/zoom no longer triggers JSON.stringify
of full workspace. Viewport still saved to file and crash recovery via separate path.
alert() calls replaced with error state + Toast rendering.

### Remaining from previous reviews

#### Polyline Kerf Magnitude — DEFERRED
Kerf formula displaces each vertex by halfKerf along the bisector diagonal rather than
computing per-edge parallel offsets. For 90-deg corners this yields ~halfKerf * sqrt(2).
Proper polygon offsetting would require intersecting offset edges.

#### Joinery Module Splits — DEFERRED
jointGeometryUtils.js is 770 lines. jointResolvers.js is 652 lines. Consider splitting
before adding new joint types. Pipeline seam tests now cover public APIs.

## 3D Preview Pipeline — Phase 2 (only if Phase 1 doesn't hit 60fps)

### Geometry Merging — Transparent Material Exclusion
**What:** When adding BufferGeometryUtils.mergeGeometries by material key, transparent
materials (window, roofOpening, railing_glass) must be excluded from merging and rendered
as individual meshes.
**Why:** Three.js sorts transparent objects per-mesh for correct alpha blending. Merging
transparent meshes into one large mesh breaks this sort order, causing visual artifacts
(objects behind glass rendering in front, or glass rendering opaque).
**Context:** Phase 1 shipped shared materials + render-on-demand + selection separation.
Phase 2 adds geometry merging. The merge loop should check `material.transparent` and skip
those groups. Transparent objects stay as individual meshes with proper sort order.

### Geometry Merging — renderToImage API Boundary
**What:** `buildPreviewObjectRoot()` is also used by `renderToImage.js` for screenshot
export. If Phase 2 changes buildPreviewObjectRoot to return merged geometry + pick scene,
renderToImage needs updating or a separate non-merged code path.
**Why:** renderToImage doesn't need a pick scene or selection overlays. Coupling it to
viewport-only concerns (merged geometry, pick scene) would be unnecessary complexity.
**Context:** Options: (A) Add an `options.merge` flag to buildPreviewObjectRoot that
renderToImage passes as false. (B) Extract a separate `buildPreviewObjectsForExport()`
that skips merging. (C) Have renderToImage call the unmerged builder directly.
