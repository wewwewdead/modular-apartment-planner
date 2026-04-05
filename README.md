# Modular Apartment Planner

**Two tools. One browser. From architectural floorplans to CNC-ready cut lists.**

A browser-based suite of design tools for architects, builders, and makers. Draft multi-floor plans with full construction documentation, or sketch technical objects and ship them to the workshop as DXF/SVG/PDF. No accounts. No cloud. Runs entirely in your browser, including offline workshop use via the bundled service worker.

![Floorplan Editor](/docs/screenshots/floorplan-editor.png)

![Craftsman Studio](/docs/screenshots/craftsman-studio.png)

---

## Two Products, One Suite

| Product | For | Entry Point |
|---------|-----|-------------|
| **Floorplan Editor** | Architects, designers, space planners | `/floorplan` |
| **Craftsman Studio** | Woodworkers, makers, CNC/laser users | `/sketch` |

Both tools share the same millimeter-precise geometry engine, keyboard-first editing model, and offline-ready browser runtime.

---

## Floorplan Editor

Browser-based architectural design tool for multi-floor projects with live 3D preview, phase-based planning, and sheet documentation output.

### Key Features

- **Multi-Floor Projects** — Stack floors with custom elevation, floor-to-floor height, and level indexing
- **Full Drawing Toolkit** — Walls, doors, windows, rooms, columns, beams, stairs, landings, railings, slabs, dimensions, and fillets
- **Auto Room Detection** — Generate rooms directly from wall geometry with names, colors, and computed area
- **Phase-Based Planning** — Assign any object to a color-coded construction phase for sequencing, filtering, and bid packages
- **Live 3D Preview** — three.js-backed walk-through and inspect modes alongside the 2D canvas; maximize either view
- **Multi-View Rendering** — Plan, four elevations (Front/Rear/Left/Right), section cuts (auto-labeled A-A, B-B...), roof plan, drainage plan, and truss detail views
- **Fixtures & Furniture** — Pre-built fixtures for kitchens, baths, and living spaces with customizable placement
- **Sheet Documentation** — Compose sheets with title blocks, revision tables, notes, and multiple viewports; export to PDF or PNG at real scale
- **Roof & Truss Systems** — Model roof planes with slope, drainage, and parapets; attach truss systems with detail views
- **Dimensions & Annotations** — Linear dimensions, per-wall/room/overall toggles, and surveyor bearing notation
- **Project Persistence** — Save/load JSON project files via File Picker (with localStorage drafts and unsaved-change guards)

### Keyboard Shortcuts

| Category | Shortcuts |
|----------|-----------|
| **Draw** | V Select · W Wall · D Door · N Window · R Room · C Column · B Beam · T Stair · L Landing · H Railing · M Dimension · G Fillet · Q Section Cut · S Slab · P Parapet |
| **Edit** | Ctrl+Z Undo · Ctrl+Shift+Z Redo · Ctrl+C Copy · Ctrl+X Cut · Ctrl+V Paste · Delete Remove · Escape Cancel |
| **File** | Ctrl+S Save |
| **View** | Space+Drag Pan · Mouse Wheel Zoom · Fit to Content |

### Exports

- **JSON** — Full project save/load via File Picker API
- **PDF** — Sheet documents with title blocks, viewports, and revision history at true scale
- **PNG** — Raster sheet export for quick review or presentations

---

## Craftsman Studio

Sketch-to-shop design tool built for woodworkers, makers, and CNC/laser enthusiasts. Draw your project, assign real materials, get an instant bill of materials with costs, and export everything your workshop needs in one click.

### Key Features

- **Material Library** — 100+ stock definitions across plywood, MDF, lumber, metal, and acrylic with pricing metadata
- **Bill of Materials + Cost Estimator** — Auto-generated BOM with per-part costs (per m², per linear meter, or per piece)
- **Manufacturing Trust Indicators** — Exact geometry is used when available; approximate dimensions or costs are explicitly labeled in the BOM UI and exports
- **DXF Export** — CNC/laser-ready DXF R14 (AC1014) files with optional kerf compensation
- **SVG Export** — Clean vectors with explicit millimeter sizing for Inkscape, Illustrator, or laser software
- **PDF 1:1 Print** — Full-scale prints with a built-in verification ruler
- **One-Click Workshop ZIP** — DXF + SVG + cutting list + assembly instructions, all in one download
- **Smart Joints** — 7 joint types (butt, dado, rabbet, finger, dovetail, mortise & tenon, pocket screw) with auto-recommendations based on material and thickness
- **Cut-List Optimizer** — Sheet nesting with FFDH algorithm and visual layout diagram
- **Assembly Instructions** — Auto-generated step-by-step build guide with joint recommendations
- **Template Gallery** — 8 starter projects: bookshelf, workbench, storage box, shelving unit, cutting board, plant stand, tool cart, CNC test pattern
- **Offline Ready** — Service worker caching for workshop use without a network connection

### How to Use in the Workshop (5 Minutes)

1. **Open the app** — Navigate to `/sketch` or click "SketchStudio" from the home page
2. **Toggle Craftsman Mode** — Click the Craftsman toggle in the top bar
3. **Draw your parts** — Use rect, line, circle, and polyline tools. Each shape becomes a part in your BOM
4. **Assign materials** — Select a shape, pick a material from the sidebar (for example, "18mm Birch Plywood"). Costs update instantly, and approximate rows are labeled when the geometry cannot support an exact manufacturing value
5. **Export for the shop** — Hit **Workshop Package** in the export bar. You get a ZIP with:
   - `.dxf` — Send directly to your CNC or laser
   - `.svg` — Open in Inkscape for tweaks
   - `cutting-list.csv` — Open in any spreadsheet
   - `cutting-list.html` — BOM report with exact/approximate status
   - `assembly-instructions.html` — Step-by-step build guide

**Pro tips:**
- Enable **Kerf** in the export bar (default 0.2mm) before exporting for laser cutting
- Use the **Cut-List Optimizer** to see how your parts nest on standard sheets
- Check the BOM status labels before manufacturing; irregular profiles may export exact area/length with bounding-box dimensions, or approximate values when exact geometry is unavailable
- **PDF 1:1** prints at true scale. Set your print dialog to "Scale: 100%" and "Margins: None"

### Craftsman Studio Export Formats

| Format | Best For | How to Use |
|--------|----------|------------|
| **Workshop ZIP** | Everything at once | Click "Workshop Package" — contains all formats below |
| **DXF** | CNC routers, laser cutters | Import into your CAM software (VCarve, LightBurn, etc.) |
| **SVG** | Vector editing, vinyl cutters | Open in Inkscape or Illustrator |
| **PDF 1:1** | Verifying dimensions on paper | Print at 100% scale, measure the ruler to confirm |
| **CSV** | Spreadsheets, shop lists | Open in Excel, Google Sheets, or print |

**Kerf compensation:** Toggle "Kerf" in the export bar and set your blade/laser width (default 0.2mm). DXF export expands supported cut paths by half the kerf on each side.

**Approximate manufacturing data:** CSV, JSON, HTML, and in-app BOM rows surface whether dimensions or cost are approximate. Treat those rows as review items before cutting.

---

## Install & Run

```bash
# Clone the repository
git clone <your-repo-url>
cd "modular apartment planner"

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the landing page with both tools. Jump directly to:

- [http://localhost:5173/floorplan](http://localhost:5173/floorplan) — Floorplan Editor
- [http://localhost:5173/sketch](http://localhost:5173/sketch) — Craftsman Studio
- [http://localhost:5173/docs](http://localhost:5173/docs) — Documentation (this page)

### Build for Production

```bash
npm run build
npm run preview    # Preview the production build locally
```

The built files go to `dist/` — deploy to any static host (Netlify, Vercel, GitHub Pages, or your own server).

### Run Tests

```bash
npm test           # Run all tests once
npm run test:watch # Watch mode for development
```

### Lint & Format

```bash
npm run lint           # Check for lint issues
npm run format         # Auto-format all source files
npm run format:check   # Check formatting without changes
```

---

## Tech Stack

- **React 19** — UI framework
- **Vite 6** — Build tool and dev server
- **React Router 7** — Client-side routing
- **Three.js** — 3D rendering (Floorplan live preview)
- **JSZip** — Workshop ZIP generation (Craftsman Studio)
- **react-markdown + remark-gfm** — Documentation rendering
- **Vitest** — Testing framework
- **CSS Modules** — Scoped component styles
- **Service Worker** — Offline workshop caching

---

## Project Structure

```
src/
  app/                      # App shell, providers, error boundaries
  domain/                   # Shared domain models (walls, rooms, phases, floors)
  geometry/                 # Geometry primitives (point, line, polygon, walls)
  modules/
    floorplan/              # Floorplan Editor module
  features/
    sketchstudio/
      craftsman/            # Craftsman Studio feature
        components/         # Sidebar, export bar, panels
        export/             # DXF, SVG, PDF, ZIP exporters
        hooks/              # useSketchBOM
        utils/              # Parametric engine, nesting optimizer, BOM adapter
        data/               # Material catalog, joint library
        templates/          # 8 starter project templates
        styles/             # CSS modules
      hooks/                # useSketchStudio (orchestrator)
      utils/                # BOM utils, cost utils, export utils
  editor/handlers/          # Tool handlers (select, wall, door, window, ...)
  renderers/                # SVG renderers (walls, doors, windows, dimensions)
  ui/                       # Shared UI (Toolbar, Sidebar, PropertiesPanel)
  persistence/              # Save/load (JSON files + localStorage)
  pages/                    # Route pages (Home, Docs, Playground, SketchStudio)
  styles/                   # Design tokens and global CSS
```

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow existing code style — the project uses ESLint + Prettier (run `npm run lint` and `npm run format` before committing)
3. Add tests for new logic (see `craftsman/utils/*.test.js` and `craftsman/__tests__/` for examples)
4. Keep export content builders pure and testable — browser downloads and printing should stay in thin wrappers
5. Submit a PR with a clear description of what changed and why

---

## License

All rights reserved.
