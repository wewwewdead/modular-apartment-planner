# gstack

- Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.
- Available gstack skills:
  - `/plan-ceo-review` - CEO-level plan review
  - `/plan-eng-review` - Engineering plan review
  - `/review` - Code review
  - `/ship` - Ship code
  - `/browse` - Web browsing
  - `/qa` - Quality assurance
  - `/setup-browser-cookies` - Set up browser cookies
  - `/retro` - Retrospective

# Craftsman Studio

- **Location:** `src/features/sketchstudio/craftsman/`
- **Toggle:** `craftsmanMode` boolean in `ui` state slice, toggled via TOGGLE_CRAFTSMAN_MODE action
- **Material assignment:** Entities have optional `materialId` and `thickness` properties. Reducer actions: SET_ENTITY_MATERIAL, SET_ENTITY_THICKNESS
- **Material catalog:** `craftsman/data/materials.js` — 23 materials, 5 categories. `getMaterialById()`, `buildMaterialPricingDict()`
- **BOM:** `craftsman/hooks/useSketchBOM.js` uses `craftsman/utils/entityBomAdapter.js` to bridge entities to existing `bomUtils.js`/`materialCostUtils.js`
- **Exports:** `craftsman/export/dxfExport.js` (DXF R13), `svgExport.js` (standalone SVG mm), `pdfExport.js` (browser print with ruler)
- **UI:** CraftsmanSidebar replaces RightPanel when active. ExportBar appears at bottom. CraftsmanToggle in TopBar.
- **Constants:** Pure helpers extracted from useSketchStudio to `hooks/sketchConstants.js`
