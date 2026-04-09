# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-04-09

### Added

- **Floorplan Editor** — Multi-floor architectural design with walls, doors, windows, rooms, columns, beams, stairs, landings, railings, slabs, fixtures, dimensions, section cuts, and sheet documentation
- **Live 3D Preview** — Three.js-backed walkthrough and inspect modes alongside the 2D SVG canvas
- **Roof & Truss Systems** — 8 roof types with slope, drainage, parapets; truss systems with detail views
- **Phase-Based Planning** — Color-coded construction phases for sequencing, filtering, and bid packages
- **Craftsman Studio** — Sketch-to-shop design tool with material library, BOM, cost estimation, DXF/SVG/PDF export
- **Smart Joinery** — 7 joint types (butt, dado, rabbet, finger, dovetail, mortise & tenon, pocket screw) with auto-recommendation via registry pattern
- **Cut-List Optimizer** — FFDH sheet nesting algorithm with visual layout diagram
- **Assembly Instructions** — Auto-generated step-by-step build guide with joint recommendations
- **Template Gallery** — 8 starter projects (bookshelf, workbench, storage box, shelving unit, cutting board, plant stand, tool cart, CNC test pattern)
- **Workshop ZIP Export** — One-click DXF + SVG + cutting list + BOM report + assembly instructions
- **Entity Grouping** — Nested group support with O(1) group/degroup operations
- **Parametric Variables** — Named variables, expression evaluation, and entity references
- **Full Offline PWA** — Self-hosted fonts, vite-plugin-pwa with precache manifest, works without network
- **Design System Documentation** — DESIGN.md with all color, typography, spacing, and shadow tokens
- **Accessibility** — ARIA attributes, focus-visible outlines, keyboard shortcuts for all tools

### Changed

- Architecture: moved renderers to feature-based structure (`src/features/floorplan/`)
- Performance: O(n) to O(1) group/degroup lookup operations
- Performance: version counter replaces JSON.stringify dirty tracking
- Performance: deferred constraint resolution during drags + memoized resolver
- Performance: React.memo boundaries on RightPanel, TopBar, StatusBar, CraftsmanSidebar
- UX: async ConfirmDialog replaces all window.confirm/alert calls
- UX: toast notifications replace alert() for all export failures
- Refactored useSketchStudio.js from 2,224-line monolith into coordinator + 11 sub-hooks
- Refactored joinery from switch-statement dispatch to per-type registry pattern
- Extracted domain commands and state helpers from ProjectProvider
- Self-hosted fonts (Instrument Serif, Manrope, JetBrains Mono) — no Google Fonts CDN dependency

### Fixed

- TV fixture negative height on thin wall-mounted units (width=2000, depth=100)
- Cut-list optimizer React key collisions when parts share name+material but differ in dimensions
- Joint ID counter collision on workspace reload (switched to crypto.randomUUID)
- Polyline kerf winding bug producing inward normals on CW polygons (parts came out undersized)
- Drag selection bug in floorplan editor
- Viewport dirty detection (pan/zoom no longer triggers unsaved-change indicator)
- WCAG contrast failure on `--dark-text-dim` (3.6:1 to 5.0:1 ratio)
- Nav touch targets below WCAG 44px minimum
- Hardcoded hex colors replaced with design system tokens
- `:focus` replaced with `:focus-visible` to prevent unnecessary focus rings on mouse click
- Raw `font-family: monospace` replaced with `var(--font-blueprint)` token
- Stale unit test asserting wrong DEFAULT_CATEGORY value
