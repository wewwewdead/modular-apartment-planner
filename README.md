# Craftsman Studio

**Sketch to shop — design, cost, and export for makers.**

Craftsman Studio is a browser-based design tool built for woodworkers, makers, and CNC/laser enthusiasts. Draw your project, assign real materials, get an instant bill of materials with costs, and export everything your workshop needs in one click.

No accounts. No cloud. Runs entirely in your browser — even offline on a tablet in the shop.

<!-- Screenshot placeholder: ![Craftsman Studio](docs/screenshots/craftsman-studio.png) -->

---

## Key Features

- **Material Library** — 23 real-world materials across plywood, MDF, lumber, metal, and acrylic with accurate pricing
- **Bill of Materials + Cost Estimator** — Auto-generated BOM with per-part costs (per m², per linear meter, or per piece)
- **DXF Export** — CNC/laser-ready DXF R13 files with optional kerf compensation
- **SVG Export** — Clean vectors for Inkscape, Illustrator, or laser software
- **PDF 1:1 Print** — Full-scale prints with a built-in verification ruler
- **One-Click Workshop ZIP** — DXF + SVG + cutting list + assembly instructions, all in one download
- **Parametric Variables** — Name your dimensions (`width=1200`) and reference them across parts (`=width/2`)
- **Smart Joints** — 7 joint types (butt, dado, rabbet, finger, dovetail, mortise & tenon, pocket screw) with auto-recommendations based on material and thickness
- **Cut-List Optimizer** — Sheet nesting with FFDH algorithm and visual layout diagram
- **Assembly Instructions** — Auto-generated step-by-step build guide with joint recommendations
- **Template Gallery** — 8 starter projects: bookshelf, workbench, storage box, shelving unit, cutting board, plant stand, tool cart, CNC test pattern
- **Offline Ready** — PWA with service worker — load once, use anywhere

---

## How to Use in the Workshop (5 Minutes)

1. **Open the app** — Navigate to `/sketch` or click "Sketch Studio" from the home page
2. **Toggle Craftsman Mode** — Click the Craftsman toggle in the top bar (it stays on across sessions)
3. **Draw your parts** — Use rect, line, circle, and polyline tools. Each shape becomes a part in your BOM
4. **Assign materials** — Select a shape, pick a material from the sidebar (e.g., "18mm Birch Plywood"). Costs update instantly
5. **Export for the shop** — Hit **Workshop Package** in the export bar. You get a ZIP with:
   - `.dxf` — Send directly to your CNC or laser
   - `.svg` — Open in Inkscape for tweaks
   - `cutting-list.csv` — Open in any spreadsheet
   - `cutting-list.html` — Pretty report, print and bring to the shop
   - `assembly-instructions.html` — Step-by-step build guide

**Pro tips:**
- Use **Parametric Variables** to make your design adjustable — change one number, all parts update
- Enable **Kerf** in the export bar (default 0.2mm) before exporting for laser cutting
- Use the **Cut-List Optimizer** to see how your parts nest on standard sheets
- **PDF 1:1** prints at true scale — use it to verify dimensions before cutting. Set your print dialog to "Scale: 100%" and "Margins: None"

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

Open [http://localhost:5173/sketch](http://localhost:5173/sketch) to launch Craftsman Studio.

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

## Export Guide

| Format | Best For | How to Use |
|--------|----------|------------|
| **Workshop ZIP** | Everything at once | Click "Workshop Package" — contains all formats below |
| **DXF** | CNC routers, laser cutters | Import into your CAM software (VCarve, LightBurn, etc.) |
| **SVG** | Vector editing, vinyl cutters | Open in Inkscape or Illustrator |
| **PDF 1:1** | Verifying dimensions on paper | Print at 100% scale, measure the ruler to confirm |
| **CSV** | Spreadsheets, shop lists | Open in Excel, Google Sheets, or print |

**Kerf compensation:** Toggle "Kerf" in the export bar and set your blade/laser width (default 0.2mm). DXF export will expand cut paths by half the kerf on each side.

---

## Tech Stack

- **React 19** — UI framework
- **Vite 6** — Build tool and dev server
- **Three.js** — 3D rendering (floor planner module)
- **JSZip** — Workshop ZIP generation
- **Vitest** — Testing framework
- **CSS Modules** — Scoped component styles
- **PWA** — Service worker for offline access

---

## Project Structure

```
src/
  features/sketchstudio/
    craftsman/              # Craftsman Studio feature
      components/           # Sidebar, export bar, panels
      export/               # DXF, SVG, PDF, ZIP exporters
      hooks/                # useSketchBOM
      utils/                # Parametric engine, nesting optimizer, BOM adapter
      data/                 # Material catalog, joint library
      templates/            # 8 starter project templates
      styles/               # CSS modules
    hooks/                  # useSketchStudio (orchestrator)
    utils/                  # BOM utils, cost utils, export utils
  core/                     # Shared utilities and UI
  modules/                  # Workspace modules
  pages/                    # Route pages
```

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow existing code style — the project uses ESLint + Prettier (run `npm run lint` and `npm run format` before committing)
3. Add tests for new logic (see `craftsman/utils/*.test.js` and `craftsman/__tests__/` for examples)
4. Keep exports pure and testable — no DOM dependencies in export logic
5. Submit a PR with a clear description of what changed and why

---

## License

All rights reserved.
