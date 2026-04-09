# Modular Apartment Planner

> Two tools. One browser. From architectural floorplans to CNC-ready cut lists.

A browser-based suite of design tools for architects, builders, and makers. Draft multi-floor plans with full construction documentation, or sketch technical objects and ship them to the workshop as DXF/SVG/PDF. No accounts. No cloud. Works entirely offline.

<!-- Replace with your recorded GIF: docs/screenshots/hero-demo.gif -->

![Floorplan Editor](docs/screenshots/floorplan-editor.png)

---

## What You Get

| Product              | For                                   | Entry Point  |
| -------------------- | ------------------------------------- | ------------ |
| **Floorplan Editor** | Architects, designers, space planners | `/floorplan` |
| **Craftsman Studio** | Woodworkers, makers, CNC/laser users  | `/sketch`    |

Both tools share the same millimeter-precise geometry engine, keyboard-first editing model, and offline-ready browser runtime.

---

## Floorplan Editor

Browser-based architectural design tool for multi-floor projects with live 3D preview, phase-based planning, and sheet documentation output.

<!-- Replace with your recorded GIF: docs/screenshots/floorplan-quickstart.gif -->

![Floorplan Editor](docs/screenshots/floorplan-editor.png)

### Features

- **Multi-Floor Projects** — Stack floors with custom elevation, floor-to-floor height, and level indexing
- **Full Drawing Toolkit** — Walls, doors, windows, rooms, columns, beams, stairs, landings, railings, slabs, dimensions, and fillets
- **Auto Room Detection** — Generate rooms directly from wall geometry with names, colors, and computed area
- **Phase-Based Planning** — Assign any object to a color-coded construction phase for sequencing, filtering, and bid packages
- **Live 3D Preview** — Three.js-backed walk-through and inspect modes alongside the 2D canvas; maximize either view
- **Multi-View Rendering** — Plan, four elevations (Front/Rear/Left/Right), section cuts (auto-labeled A-A, B-B...), roof plan, drainage plan, and truss detail views
- **Fixtures & Furniture** — Pre-built fixtures for kitchens, baths, and living spaces with customizable placement
- **Sheet Documentation** — Compose sheets with title blocks, revision tables, notes, and multiple viewports
- **Roof & Truss Systems** — Model roof planes with slope, drainage, and parapets; attach truss systems with detail views
- **Dimensions & Annotations** — Linear dimensions, per-wall/room/overall toggles, and surveyor bearing notation

### Quick Start (2 minutes)

1. Open `/floorplan` or click the **Floorplan Editor** card on the homepage
2. Press `W` to select the Wall tool
3. Click to place wall start, click again for end. Draw 4 walls to form a room.
4. Press `D` for Door, click on any wall to place it
5. Press `N` for Window, click on another wall
6. Press `V` to switch to Select, click objects to edit properties in the sidebar
7. Toggle the 3D preview to walk through your design

### Keyboard Shortcuts

| Category | Shortcuts                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Draw** | `V` Select, `W` Wall, `D` Door, `N` Window, `R` Room, `C` Column, `B` Beam, `T` Stair, `L` Landing, `H` Railing, `M` Dimension, `G` Fillet, `Q` Section Cut, `S` Slab, `P` Parapet |
| **Edit** | `Ctrl+Z` Undo, `Ctrl+Shift+Z` Redo, `Ctrl+C` Copy, `Ctrl+X` Cut, `Ctrl+V` Paste, `Delete` Remove, `Escape` Cancel                                                                  |
| **File** | `Ctrl+S` Save                                                                                                                                                                      |
| **View** | `Space+Drag` Pan, `Mouse Wheel` Zoom                                                                                                                                               |

### Exports

- **JSON** — Full project save/load via File Picker API
- **PDF** — Sheet documents with title blocks, viewports, and revision history at true scale
- **PNG** — Raster sheet export for quick review or presentations

---

## Craftsman Studio

Sketch-to-shop design tool built for woodworkers, makers, and CNC/laser enthusiasts. Draw your project, assign real materials, get an instant bill of materials with costs, and export everything your workshop needs in one click.

<!-- Replace with your recorded GIF: docs/screenshots/craftsman-quickstart.gif -->

![Craftsman Studio](docs/screenshots/craftsman-studio.png)

### Features

- **Material Library** — 100+ stock definitions across plywood, MDF, lumber, metal, and acrylic with pricing metadata
- **Bill of Materials + Cost Estimator** — Auto-generated BOM with per-part costs (per m2, per linear meter, or per piece)
- **Manufacturing Trust Indicators** — Exact geometry is used when available; approximate dimensions or costs are explicitly labeled
- **DXF Export** — CNC/laser-ready DXF R14 files with optional kerf compensation
- **SVG Export** — Clean vectors with explicit millimeter sizing for Inkscape, Illustrator, or laser software
- **PDF 1:1 Print** — Full-scale prints with a built-in verification ruler
- **One-Click Workshop ZIP** — DXF + SVG + cutting list + assembly instructions, all in one download
- **Smart Joints** — 7 joint types (butt, dado, rabbet, finger, dovetail, mortise & tenon, pocket screw) with auto-recommendations
- **Cut-List Optimizer** — Sheet nesting with FFDH algorithm and visual layout diagram
- **Assembly Instructions** — Auto-generated step-by-step build guide with joint recommendations
- **Template Gallery** — 8 starter projects: bookshelf, workbench, storage box, shelving unit, cutting board, plant stand, tool cart, CNC test pattern

### Quick Start (5 minutes)

1. Open `/sketch` or click **Craftsman Studio** from the homepage
2. Toggle **Craftsman Mode** in the top bar
3. Draw your parts with rect, line, circle, and polyline tools. Each shape becomes a part in your BOM.
4. Select a shape, pick a material from the sidebar (e.g., "18mm Birch Plywood"). Costs update instantly.
5. Hit **Workshop Package** in the export bar to get a ZIP with DXF, SVG, cutting list, BOM report, and assembly instructions.

**Pro tips:**

- Enable **Kerf** in the export bar (default 0.2mm) before exporting for laser cutting
- Use the **Cut-List Optimizer** to see how your parts nest on standard sheets
- **PDF 1:1** prints at true scale. Set your print dialog to "Scale: 100%" and "Margins: None"

### Export Formats

| Format           | Best For                      | How to Use                          |
| ---------------- | ----------------------------- | ----------------------------------- |
| **Workshop ZIP** | Everything at once            | Click "Workshop Package"            |
| **DXF**          | CNC routers, laser cutters    | Import into VCarve, LightBurn, etc. |
| **SVG**          | Vector editing, vinyl cutters | Open in Inkscape or Illustrator     |
| **PDF 1:1**      | Verifying dimensions on paper | Print at 100% scale                 |
| **CSV**          | Spreadsheets, shop lists      | Open in Excel or Google Sheets      |

---

## Works Offline

Install as a PWA from your browser's address bar. All fonts, assets, and app code are cached locally. Your projects live in your browser's localStorage.

No server. No account. No tracking.

---

## Development

```bash
# Clone and install
git clone <your-repo-url>
cd "modular apartment planner"
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the landing page. Jump directly to:

- [localhost:5173/floorplan](http://localhost:5173/floorplan) — Floorplan Editor
- [localhost:5173/sketch](http://localhost:5173/sketch) — Craftsman Studio

```bash
# Build for production
npm run build
npm run preview          # Preview the production build

# Tests
npm test                 # Run all tests once
npm run test:watch       # Watch mode

# Code quality
npm run lint             # ESLint check
npm run format           # Prettier auto-format
```

Deploy the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages, or your own server).

---

## Tech Stack

- **React 19** + **Vite 6** — UI framework and build tool
- **Three.js** — 3D rendering for live floorplan preview
- **React Router 7** — Client-side routing with lazy-loaded workspaces
- **JSZip** — Workshop ZIP generation
- **Vitest** — Testing framework
- **CSS Modules** — Scoped component styles
- **vite-plugin-pwa** — Service worker and offline caching
- **ESLint + Prettier + Husky** — Code quality and formatting

---

## Project Structure

```
src/
  app/                          # App shell, providers, error boundaries
  domain/                       # Domain models (walls, rooms, phases, floors, roofs, trusses)
  geometry/                     # Geometry engine (point, line, polygon, wall, roof, stair)
  features/
    floorplan/                  # Floorplan Editor
      components/
        renderers/              # ~65 SVG renderers (walls, doors, rooms, etc.)
        preview/                # Three.js 3D preview panel
      context/                  # FloorplanContext provider
      hooks/                    # useFloorplan orchestrator
    floorplanner/               # Floorplan workspace shell
    sketchstudio/
      craftsman/                # Craftsman Studio feature
        components/             # Sidebar, export bar, panels
        export/                 # DXF, SVG, PDF, ZIP exporters
        hooks/                  # useSketchBOM
        utils/                  # Nesting optimizer, BOM adapter
        data/                   # Material catalog
        templates/              # 8 starter project templates
      hooks/                    # useSketchStudio coordinator + sub-hooks
      utils/                    # BOM utils, cost utils, expression engine
  editor/handlers/              # 22 tool handlers (select, wall, door, window, ...)
  persistence/                  # Save/load (JSON files + localStorage + migrations)
  pages/                        # Route pages (Home, Docs, Playground)
  styles/                       # Design tokens, fonts, global CSS
  ui/                           # Shared UI (Modal, ConfirmDialog, ToolbarIcons)
```

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow existing code style (ESLint + Prettier, run `npm run lint` and `npm run format` before committing)
3. Add tests for new logic (see `craftsman/utils/*.test.js` and `craftsman/__tests__/` for examples)
4. Keep export content builders pure and testable
5. Submit a PR with a clear description of what changed and why

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
