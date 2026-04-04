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
- **Templates:** `craftsman/templates/` — 8 starter projects (bookshelf, workbench, storage box, shelving, cutting board, plant stand, tool cart, CNC test). Registry in `index.js`, gallery UI in `TemplateGallery.jsx`
- **Workshop ZIP Export:** `craftsman/export/workshopExport.js` — one-click ZIP with DXF + SVG + BOM CSV + BOM HTML + Assembly HTML. Uses jszip.
- **localStorage:** Craftsman mode preference persists across sessions via localStorage
- **Touch-friendly:** CSS `@media (pointer: coarse)` overrides for 44px+ touch targets on tablets
- **Collapsible Sections:** Sidebar panels collapse/expand to manage vertical space

# Dev Tooling & Quality

- **ESLint:** `eslint.config.js` (flat config, React + hooks, prettier compat). Run: `npm run lint`
- **Prettier:** `.prettierrc` (single quotes, trailing commas, 2-space, 120 width). Run: `npm run format`
- **Husky + lint-staged:** Pre-commit hook auto-formats and lints staged files
- **Tests:** `npm test` runs Vitest. Test files in `craftsman/utils/*.test.js` (3 existing) and `craftsman/__tests__/` (4 new: BOM pipeline, parametric resolution, DXF export, SVG export)
- **PWA:** Service worker at `public/sw.js`, registered in `src/main.jsx`. Network-first with cache fallback for offline workshop use
- **Error handling:** ExportBar uses toast notifications (not alert()) for all export failures

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
