# Modular Apartment Planner - Project Memory

## Tech Stack
- React 19 + Vite 6, JavaScript (no TypeScript), CSS Modules, SVG rendering, localStorage persistence
- Path alias: `@/` -> `src/`

## Architecture
- **Domain models**: Plain JS objects via factory functions in `src/domain/models.js`
- **State**: Two React Contexts with useReducer - `ProjectProvider` (model data) + `EditorProvider` (UI/interaction state)
- **Coordinates**: All model values in millimeters. SVG uses translate+scale transform. Default zoom: 0.1
- **Editor tools**: Handler pattern - each tool is an object with `onMouseDown/Move/Up/KeyDown/getCursor`
- **Rendering**: SVG-based, z-order: Grid -> Rooms -> Walls -> Doors/Windows -> Dimensions -> Selection -> Preview

## Key File Locations
- Entry: `src/main.jsx`, `src/app/App.jsx`
- Models: `src/domain/models.js`, `src/domain/defaults.js`
- State: `src/app/ProjectProvider.jsx`, `src/app/EditorProvider.jsx`
- Geometry: `src/geometry/` (point, line, polygon, wallGeometry)
- Renderers: `src/renderers/` (SvgCanvas, WallRenderer, DoorRenderer, etc.)
- Editor handlers: `src/editor/handlers/` (selectHandler, wallDrawHandler, doorPlaceHandler, windowPlaceHandler)
- UI: `src/ui/` (Toolbar, Sidebar, PropertiesPanel, InputField, Modal)
- Persistence: `src/persistence/` (serialize, deserialize, storage)

## ID Format
`prefix_timestamp36_counter36` (e.g., `wall_m1abc_1`)

## Phase System
- Domain: `src/domain/phaseModels.js` (create, sort, reorder), `src/domain/phaseFilter.js` (filter logic)
- Hook: `src/hooks/usePhaseFilteredFloor.js`
- Project-level `phases` array; objects have optional `phaseId` property
- EditorProvider state: `activePhaseId`, `phaseViewMode` ('all'|'single'|'cumulative')
- ProjectProvider actions: PHASE_ADD, PHASE_UPDATE, PHASE_DELETE, PHASE_REORDER
- All 11 handlers set `phaseId` on created objects; Toolbar's Detect Rooms also sets it
- SvgCanvas uses filteredFloor for renderers, unfiltered floor for selection/previews
- 3D preview (ThreePreviewPanel) also filters via `filterProjectByPhase`

## Keyboard Shortcuts
V=Select, W=Wall, D=Door, N=Window, Escape=cancel, Delete=remove, Ctrl+S=save
