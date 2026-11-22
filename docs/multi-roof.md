# Many roofs: one roof per truss system (MR-1 … MR-3)

Status: specced 2026-11-21. Builder: Opus 5.5 (high). Auditor: Fable.

## 0. The report

"When I tried to add multiple trusses I can't add multiple roof for each truss, it will remove the first
one if I tried to add another one."

## 1. Cause (verified in source, reproduced with a reducer probe)

The project holds exactly one roof. Truss systems are a list; the roof is a single slot.

- `src/domain/models.js:53` — `roofSystem: null,` next to `trussSystems: [],`.
- `src/features/floorplan/store/floorplanReducer.js:597-598` — `ROOF_CREATE` overwrites the slot:
  `return updateRoofSystem(state, () => action.roofSystem);`
- `src/domain/projectStateHelpers.js:68-79` — `updateRoofSystem` reads and writes `state.project.roofSystem`.
- `floorplanReducer.js:637-642` — `ROOF_DELETE` carries no id and nulls the slot.
- The roof names its truss system in `roofSystem.trussAttachmentId` (the only authoritative link).

The UI follows the model:

- `Sidebar.jsx:535-570` shows the Roof "+" only while there is no roof.
- `PropertiesPanel.jsx:388-408` shows `RoofEmptyState` ("Create roof from truss") only while there is no roof.
- With a roof present, the only way to "give truss B a roof" is `TrussProperties.jsx:244-253, 528-532`
  ("Set as roof source") or the roof's "Truss Link" select (`RoofProperties.jsx:240-272`). Both dispatch
  `ROOF_UPDATE {trussAttachmentId: B}` on the one roof, which MOVES it. Truss A is left bare. That is
  the "first one is removed" the user sees.

Probe (the repo's real reducer, two truss systems): a second `ROOF_CREATE` replaces the first roof; a
`ROOF_UPDATE {trussAttachmentId: B}` keeps one roof id and moves it to B. The probe is at
`<scratchpad>/rooftest/two.probe.js` (see §8) and is the seed for the regression test.

A second trap sits next to it: `trussDrawHandler.js:13-29` adds a newly drawn truss to the SELECTED
truss system when no explicit target is set, and the handler selects each truss it draws (line 180). So
one drawing session produces one system with several truss runs, and a system can only ever carry one
roof (its shape comes from `instances[0]`, `src/truss/roofAttachment.js:212-216`). T-1 in MR-2 makes
that visible and gives a clear way to start a new system.

`docs/roof-truss-industrial.md` states one roof per project as a decision (§1 roof model, §5 colour,
decision 9: "if a second roof ever appears this must move to per-roof keys"). This spec supersedes it.

## 2. Decisions

1. **The unit is the truss system.** A truss system carries at most one roof; a roof is attached to at
   most one truss system. "A roof for each truss" means one per truss system. A roof per truss run
   (instance) is out of scope.
2. **The project holds a list**: `project.roofSystems: []`. `project.roofSystem` is removed, not kept
   as an alias. Schema 32 migrates old files.
3. **The roof workspace edits one roof at a time, the active roof** (`editor.activeRoofId`), exactly as
   the plan edits one active floor. Every existing single-roof component, handler and panel keeps
   taking one `roofSystem` and is handed the active roof. Other roofs are drawn as context and one
   click makes them active. This is what keeps the blast radius small: roof edge ids and geometry keys
   are derived per roof and are not guaranteed unique across roofs, so nothing resolves a roof
   sub-object across roofs by id unless this spec says so.
4. **Whole-building readers read every roof** (massing, takeoff, sections, elevations, sheets,
   documents, coordination, phases, 3D).
5. **Each roof has its own colours in 3D** (MR-3), and so does each truss system's gable closure. The
   shared palette mutation is replaced by per-owner material keys that are still mutated in place, so a
   colour edit still rebuilds no geometry.
6. **No dual shape, no silent fallbacks in readers.** One selector module is the only place that knows
   where roofs live.

## 3. Shared contract (all phases)

### 3.1 Selectors — new `src/domain/projectRoofs.js`

Dependency-free (imports nothing from roof or truss modules; both import it).

- `getProjectRoofs(project)` → `project.roofSystems`, or one shared frozen empty array.
- `getProjectRoof(project, roofId)` → roof or null.
- `getRoofForTrussSystem(project, trussSystemId)` → the roof whose `trussAttachmentId` is that id, or null.
- `findRoofOwner(project, objectType, objectId)` → the roof that is, or stores, that object.
  `objectType` ∈ `roofSystem | parapet | drain | roofOpening | roofPlane | roofEdge`. Stored objects
  only (a derived roof edge that was never stored has no owner; callers pass a roof id for those).
- `resolveActiveRoof(project, activeRoofId)` → that roof, else the first roof, else null. A stale id
  (deleted roof, undo, another project) therefore needs no cleanup effect.

Outside this module, migrations ≤ 31→32 and the legacy fold in `validate.js`, no source file reads
`.roofSystem` or `.roofSystems` off a project object. Functions that take ONE roof keep their
`roofSystem` parameter name.

### 3.2 Invariants

- Roof ids are unique.
- At most one roof per `trussAttachmentId`. Detached roofs (`trussAttachmentId: null`) are allowed, any
  number (deleting a truss system still leaves its roof detached, as today).
- An unchanged roof keeps its object identity through `syncProjectStructures`, and an unchanged list
  keeps its array identity (`reuseIfEqual` / `reuseArrayIfSameElements`, as trusses do).

### 3.3 Reducer actions

- `ROOF_CREATE {roofSystem}` appends. State is returned unchanged (no history entry) when the id
  already exists or when another roof already carries that `trussAttachmentId`.
- `ROOF_UPDATE {roofSystem: {id, …}}` updates that roof (logic of lines 600-635 unchanged, but
  `getRoofAttachmentElevation` is given the roof). A `trussAttachmentId` change onto a system that
  carries another roof returns state unchanged.
- `ROOF_DELETE {roofId}` removes that roof and clears stair roof access only for THAT roof's openings.
- `PARAPET_ADD`, `DRAIN_ADD`, `ROOF_OPENING_ADD`, `ROOF_PLANE_ADD`, `ROOF_EDGE_UPDATE`,
  `ROOF_EDGE_DELETE` carry `roofId`.
- `*_UPDATE` / `*_DELETE` of parapets, drains, openings and planes may carry `roofId`; without it the
  reducer uses `findRoofOwner`.
- One resolver in the reducer for all of the above: `action.roofId` → owner of the sub-object → the
  sole roof when the project has exactly one → otherwise no-op. The "sole roof" step exists so a call
  site nobody found degrades to today's behaviour instead of dropping an edit; every call site this
  spec lists still passes `roofId`.
- `updateRoofSystem(state, roofId, updater)` in `projectStateHelpers.js` replaces the slot helper.

### 3.4 Creation rules (`src/domain/roofModels.js`)

- `getAttachableRoofTrussSystems(project)` keeps its meaning (roof-ready systems).
- New `getRooflessRoofTrussSystems(project)` = roof-ready systems that carry no roof.
- `createRoofSystemForProject(project, {trussAttachmentId})`: a requested system that already has a
  roof returns null (never silently picks another); no request picks the first roofless roof-ready
  system; none returns null.
- Default name: `Roof` for the first, then `Roof 2`, `Roof 3` … skipping names in use.

## 4. MR-1 — the model, the store, persistence, every reader

After MR-1 the app must look and behave exactly as it does today (the UI still offers no second roof),
with the list underneath and the gate green.

1. `createProject` → `roofSystems: []`, no `roofSystem` key.
2. `projectRoofs.js` (§3.1), reducer (§3.3), creation rules (§3.4).
3. `syncProjectRoofSystems` (rename of `syncProjectRoofSystem`) syncs every roof with identity reuse.
4. `trussModels.js`:
   - `roofAttachmentId` (lines 712, 811-812) = id of `getRoofForTrussSystem(project, system.id)`.
   - `syncProjectTrussSystems` (849-858) detaches every roof whose truss system is gone, reusing the
     list when nothing changed.
   - `normalizePurlinSystem` (491-494) reads the covering of the roof attached to THAT system. For a
     system with no roof, use what a project with no roof gives today. Report whether this changes any
     stored value on the playground project.
5. `roofAttachment.js:61,71` and `roofEdgeKit.js:86-93`: remove the `= project?.roofSystem` default
   arguments; every caller passes the roof.
6. Persistence:
   - `migration_31_to_32.js`: `roofSystems = roofSystem ? [roofSystem] : []`, delete `roofSystem`.
     `CURRENT_SCHEMA_VERSION` 32, supported set, `migrations.test.js` (including the playground demo
     case: one roof in, one roof out, same id).
   - `validate.js`: loop the roofs for the existing repairs; fold a stray legacy `roofSystem` key into
     the list; regenerate duplicate roof ids; detach every roof after the first that claims the same
     truss system.
   - `documentSignature.js` hashes the list. Report whether an existing single-roof file's signature
     changes, and if it does, whether anything compares stored signatures across the upgrade.
7. Phases: `phaseFilter.js:86-100` filters the list per roof; `phaseAssignments.js` counts, clears and
   sanitises per roof.
8. Readers. Apply one of three rules to every remaining read and list each site with its rule in the
   report:
   - **(a) about a truss system** → the roof attached to that system
     (`endClosures.js`, `trussAdvice.js`, `trussSchedule.js`, `trussElevationGeometry.js`,
     `trussSectionGeometry.js`, `TrussScene/TrussRenderer`, the truss properties sections,
     `quantityTakeoff`'s closure layout). Functions that take a `roofSystem` and test
     `trussAttachmentId` themselves keep their signature; the caller passes that system's roof.
   - **(b) about the whole building** → every (phase-visible) roof, concatenated or summed, with
     element ids unique across roofs: `analysis/buildingMassing.js`, `quantityTakeoff.js` (areas and
     trims summed), `sections/scene.js`, `sections/viewDepth.js`, `elevations/scene.js`,
     `sheets/sources.js` (sources return `roofSystems`; plan, elevation and drainage sheets draw every
     roof in the one view; the schedule lists every roof, rows prefixed by roof name when there is more
     than one; "No roof system in this project." when the list is empty), `SheetViewportContent.jsx`,
     `roofDrainageCoordination.js` (counts aggregated, validation refs per roof),
     `equipmentCoordination.js:90` (inside ANY roof's boundary), `documentPackage.js` (sheet `A-201`
     once if any roof exists), `documentationRealization.js`, `professionalHandoff.js`,
     `professionalExchangeExport.jsx` (emit all roofs), `roofAccessGeometry.js` and
     `StairProperties.jsx` (openings of every roof; label `Roof name · opening` when there is more than
     one roof), `previewInspection.js` (find the object in any roof).
   - **(c) the roof being edited** → for MR-1 only, `getProjectRoofs(project)[0] || null` with the
     trailing comment `// MR-2: active roof`. Sites: reducer entity slices (396-401), `useFloorplan.js`
     (448, 466-470), `SvgCanvas.jsx` (167-169), `PropertiesPanel.jsx` (166, 172), `Sidebar.jsx` (173),
     `TrussProperties.jsx` (189), `ThreePreviewPanel.jsx` (369), `buildPreviewScene.js`,
     `ProjectLifecyclePanel.jsx`.
9. `buildingCommands.js`: `location === 'roof'` checks "no roofs"; `configureRoofDrainagePath` takes
   `command.roofId`, defaulting to the owner of `command.drainId`, then the first roof, and writes
   through the list.
10. Dispatch sites pass ids now: `ROOF_DELETE` (`PropertiesPanel.jsx:347-348`,
    `roofSelectHandler.js:344-345`) and the `roofId` on the add / edge actions
    (`roofParapetPlaceHandler.js`, `roofDrainPlaceHandler.js`, `roofOpeningPlaceHandler.js`,
    `RoofProperties.jsx:212`, the roof-edge panels, any other you find).
11. Tests: update every fixture that builds `{...project, roofSystem}`. Add
    `src/features/floorplan/store/multiRoof.test.js` on the real reducer:
    - two truss systems, `ROOF_CREATE` twice → two roofs, each system's instances carry their own
      `roofAttachmentId`;
    - a second roof for an already-roofed system, and a re-attach onto a roofed system, leave state
      and history untouched;
    - `ROOF_DELETE` of one leaves the other and only clears that roof's stair access;
    - undo / redo restore both;
    - a drain added with `roofId` B lands on B; a drain update without `roofId` finds its owner;
    - editing roof A keeps roof B's identity (`toBe`);
    - save → load round-trips two roofs; a schema-31 file with one roof loads with one.

Acceptance: gate (§7); the grep in §3.1 is clean; `grep -rn "MR-2: active roof" src` lists exactly the
rule (c) sites; the three existing roof verify scripts still pass.

## 5. MR-2 — many roofs in the editor and in 3D

### 5.1 Active roof

- `editor.activeRoofId` (initial null). `SET_ACTIVE_ROOF {roofId}`. `SELECT_OBJECT` with
  `objectType: 'roofSystem'` also sets it, in the editor reducer, so every route that selects a roof
  (sidebar, canvas, 3D pick, creation) activates it.
- All rule (c) sites resolve `resolveActiveRoof(project, activeRoofId)` (the phase-filtered project
  where they filtered before). The reducer's entity slices add `activeRoofId` to their source key.
  No `// MR-2` marker remains.
- `ThreePreviewPanel` pick: for a roof sub-object, set the active roof to its owner before selecting.

### 5.2 Roof plan canvas

- `RoofScene` (plan view) draws every other phase-visible roof under the active one as a quiet,
  non-interactive outline with its name (new small `RoofContextLayer`; boundary polygon only, hairline
  stroke, no fill handles). Elevation view in roof mode stays active-roof only.
- `roofSelectHandler`: the active roof is hit-tested first, exactly as today. On a miss, a click
  inside another visible roof makes it active and selects it (no drag starts). Several candidates:
  highest `baseElevation`, then smallest area. A miss on all deselects.
- Place tools (parapet, drain, opening) stay bound to the active roof. A click that misses it but
  lands in another roof sets the status message `That is <name>. Select it first to work on it.`

### 5.3 Adding and removing roofs

- **Truss properties** (`TrussProperties.jsx`), where the user hit the bug:
  - "Roof Link" readout: the attached roof's name, or `No roof`.
  - Replace "Set as roof source" with: `Add roof` when the system is roof-ready and has none
    (creates a roof for THIS system, `ROOF_CREATE`, status `Roof added to <system name>.`; the panel
    stays on the truss); `Open roof` when it has one (roof target, active, selected); disabled
    `Roof fit unavailable` otherwise. The button shows whether or not other roofs exist.
  - When the system has more than one truss run, add to the hint: `One roof covers every truss run in
this system and takes its shape from the first. For a separate roof, draw that truss as its own
system (Trusses + in the sidebar).`
- **Sidebar Roof section**: `count` = number of roofs; one card per roof (active one highlighted,
  click = roof target + select); under the cards one row per roofless roof-ready truss system,
  `Add roof to <system name>`; the header "+" is shown while such a row exists and acts on the first
  one. With no truss system roof-ready and no roofs, keep `Add truss system before roof`. Mind the
  sidebar's 180 px text budget (ellipsis, `title` with the full text).
- **Roof properties**: "Truss Link" options for systems that carry another roof are disabled and read
  `<name> (has a roof)`. `RoofEmptyState` (no roofs at all) keeps working and lists roofless systems.
- Delete (key or panel) removes the selected roof only; the active roof falls back by §3.1.

### 5.4 T-1: starting a new truss system is explicit

- Sidebar Trusses header "+" always starts a NEW system: take the type / material template from the
  selection as today, then `DESELECT`, then start the tool with `targetTrussSystemId: null`.
  "Draw another truss" in the truss panel stays the explicit way to add a run to a system. Toolbar
  and canvas entry points are unchanged.
- `trussDrawHandler` status after a draw: `Truss added to <system name>.` when it joined a system,
  `New truss system created above the selected beams.` otherwise.

### 5.5 3D layers

`src/three/scene/buildPreviewScene.js`:

- End closures get their own system's roof.
- A floor's `sourceKey.roofSystems` = the roofs attached to that floor's truss systems (an array;
  `sourceKeyEqual` compares arrays element by element).
- One pseudo-floor per phase-visible roof: `floorId: roof.id`, its own `sourceKey`
  `{roofSystem, trussSystem, groundElevation}`. Its floor (for `metadata.floorId` and for visibility
  under a floor scope) is the attached truss system's floor, or the top floor when detached.
- `roofLayerIds: string[]` replaces `roofLayerId`. Fix every reader that treats a `floors` entry as a
  storey (`ThreePreviewPanel.jsx:269`, `resolveWalkFloorContext`, anything else you find).
- Colours stay shared for this phase: appearance from the first roof.

### 5.6 Registry and tests

- `docs/state-machines/floorplan-editor.md`: the active roof (who sets it, the fallback) and the
  truss draw target rule. Read `docs/state-machines.md` first; no tables in the registry.
- Tests: `TrussProperties.dom.test.jsx` (Add roof dispatches `ROOF_CREATE` for this system while
  another roof exists; Open roof), `RoofProperties.dom.test.jsx` (taken options disabled), Sidebar rows,
  `roofSelectHandler.test.js` (switching roofs, place-tool message), `trussDrawHandler` status,
  `previewSceneCache.test.js` (two roof layers; editing roof A reuses roof B's group),
  `paintEditIdentity.test.js` still green.
- `scripts/verify-multi-roof.mjs`, in the style of `scripts/verify-roof-covering.mjs`: on the
  playground, get a second roof-ready truss system on screen (your choice of route; say which), add a
  roof to each from the truss panel, assert two roof cards in the sidebar, two roof layers in the 3D
  scene, and that the first roof is still there. Screenshot both.

## 6. MR-3 — each roof its own colours in 3D

Today nine shared palette keys draw every roof (`roof_metal`, `roof_tile`, `roof_membrane`,
`roof_slab`, `roofRidgeCap`, `roofTrim`, `roofGutter`, `roofDownpipe`, `roofSoffit`) and one
(`gableInfill`) every gable closure; `applyRoofAppearanceToPalette` (`materials.js:663-696`) recolours
those instances, and the first truss system's closure colour wins.

1. **Owner keys.** `ownerMaterialKey(baseKey, ownerId)` → `` `${baseKey}@${ownerId}` `` and
   `parseOwnerMaterialKey(key)`, next to `roofMaterialKeyForCovering` in
   `src/domain/roofCoveringCatalog.js`. Owner is the roof id for the nine roof keys and the truss
   system id for `gableInfill`.
2. **Where keys are rewritten.** Only in `buildPreviewScene.js`, on the roof layer's descriptors and
   on end-closure descriptors. `roof3dGeometry.js`, `roofEdgeKit.js` and `endClosures.js` keep emitting
   base keys, and their tests do not change.
3. **Materials.** `paletteMaterialFor` builds an owner material on first use by cloning the base key's
   material the way wall-finish materials are built (`cloneWithProceduralDetail`, `paletteKey`, tier
   on `userData`, `ownedByPalette`), in every palette (detailed, white model, classic, a sheet's own).
   An owner's `roofGutter` and `roofDownpipe` resolve to that owner's `roofTrim` instance. Base
   materials stay in the palette as clone sources and are never recoloured again.
4. **Appearance.** `resolveRoofAppearances(roofs, trussSystems)` →
   `{roofs: [{id, covering, trims, soffit}], closures: [{id, hex}]}`.
   `applyRoofAppearanceToPalette(palette, appearances)` writes each owner's materials (same colour /
   roughness / metalness rules as today) and remembers the last appearances on the palette, so an
   owner material built AFTER the effect ran is born with its owner's look. Still `{changed,
recompile}`; still no geometry rebuild on a colour edit.
5. **Everything keyed on a material key string** must understand owner keys: detail assignments, the
   white-model table, `viewMode.js` tiers, ghost and selection twins, batching, style switches, X-ray,
   night mode, pruning (drop owner materials whose roof or truss system is gone, the way unused wall
   finishes are pruned). Grep the preview folder for every base key and for direct
   `materialPalette[...materialKey]` indexing; list what you changed.
6. `ThreePreviewPanel.jsx:369-382`: key the effect on the whole appearances JSON; check what
   `roofColourHex` / `closureColourHex` feed and keep that correct for several roofs.
7. Update `docs/roof-truss-industrial.md` (§1 roof model, §5 colour, decision 9, §4.3 amendment) with
   one line each pointing here.

Acceptance: a unit test that two roofs with different covering colours resolve to two material
instances with those colours, that a colour edit on roof A leaves roof B's instance and every cached
group untouched, and that two truss systems' closures take their own colours; the verify script sets
two different roof colours and reads both back from the viewport; X-ray, white model and night mode
screenshots show both roofs; `verify-roof-covering.mjs`, `verify-gable-closure.mjs`,
`verify-truss-accuracy.mjs` still pass.

## 7. Gate (every phase)

- Record the baseline first: `npm test` and `npm run lint` on the tree as you find it (it carries a
  lot of uncommitted work; do not revert or "fix" unrelated files).
- After the phase: `npm test` with no new failures, `npm run lint` with 0 errors and no new warnings.
- The machine is short on memory: one vitest run at a time, one dev server at a time, stop the dev
  server you started.
- No commits, no pushes.

## 8. Notes for the builder

- The reducer probe that reproduces the bug is in the session scratchpad under `rooftest/`
  (`two.probe.js`, `vitest.config.mjs`); the auditor's brief gives the absolute path.
- Match the surrounding code: comment density, naming, CSS Modules, `InputField` / the properties
  panel kit, `useNumericDraft` for any number box.
- Report: files changed, each reader site with its rule, each judgment call, anything in this spec
  that turned out to be wrong, test and lint numbers before and after.

## 10. As built

### MR-1 (built by Opus 2026-11-21)

Deviations from the text above, all accepted by the auditor:

- **Document signature** (§4 item 6): hashing the list would have marked every issued sheet out of date
  on upgrade, because stored signatures are compared with the live one (`documentValidation.js`,
  `documentPackage.js`, `professionalExchange.js`). `documentSignature.js` still hashes under the key
  `roofSystem`: `null` for no roof, the roof for one, the list for several. Pinned in
  `migrations.test.js`.
- **Functions that draw several truss systems at once** (`buildTrussElevationElements`,
  `buildTrussSectionElements`, `TrussRenderer`) take `roofSystems` and pick each system's roof
  themselves; rule (a)'s "keep the signature" only fits functions about one system.
- `getProjectRoofs` returns the stored array (even when empty) so the syncs can keep its identity; the
  frozen shared list is only for a project with no key.
- `repairProjectRoofList` (`validate.js`) runs first on every load and holds the §3.2 invariants.
- `src/roof/roofElementScope.js` prefixes element ids with the roof id only when a view draws more than
  one roof, so single-roof drawings are byte-identical.
- `migration_14_to_15` wraps the old slot as a one-roof list around its `syncProjectTrussSystems` call.
- Refused or empty roof actions return the state untouched (no history entry).

Tightened in MR-2: a `roofId` that names no roof is a no-op for every roof action. The "sole roof"
step of §3.3 is for an action with NO `roofId` only (as built, a stale id fell through to it, so a
stale `ROOF_DELETE` could remove the one remaining roof).

### MR-2 (built by Opus 2026-11-21)

Deviations from the text above, for the auditor:

- **Which roof under a phase view.** The canvas and the resolved document pick the active roof in the
  WHOLE project (`resolveActiveRoof(project, id)`) and then look that roof up in the filtered one,
  rather than resolving in the filtered project: resolving there would silently edit a different roof
  on the canvas than the properties panel shows whenever the active one is phase-hidden. The floor and
  roof SECTION views ask whether every roof is hidden, not the active one.
- **A roof's storey** is one rule, `getRoofFloorId` in `projectRoofs.js` (system's floor, else the
  top floor), used by the 3D layer and by `previewInspection.js`, whose roof card said "top floor".
- **Truss system names.** Every drawn system used to be called `Truss System`, so two systems read
  "Add roof to Truss System" twice. `getNextTrussSystemName` (`trussModels.js`) names a drawn system
  `Truss System 2`, `3` … as roofs are named.
- **Sidebar "Add roof to …"** opens the new roof in the roof workspace; the truss panel's Add roof
  leaves the panel on the truss and only makes the new roof the active one (`SET_ACTIVE_ROOF`).
  Both go through `utils/addRoofEntry.js`.
- `leaveProject` resets `activeRoofId` (it names something in the outgoing project).
- `ThreePreviewPanel` publishes `data-roof-layers` (the visible roof layer ids) for the verify script.
- Route to a second truss system in `scripts/verify-multi-roof.mjs`: drawn through the UI (Trusses
  "+" and the top floor's y = 4000 / 9100 beams), then moved with Offset X so the roofs do not overlap.

### MR-3 (built by Opus 2026-11-21)

What landed, and where it differs from the text above:

- **Keys.** `ownerMaterialKey` / `parseOwnerMaterialKey`, `ROOF_OWNER_MATERIAL_KEYS`,
  `CLOSURE_OWNER_MATERIAL_KEYS` in `roofCoveringCatalog.js`; `parseOwnerMaterialKey` answers only for
  the ten base keys. `buildPreviewScene.js` (`withOwnerMaterialKey`) rewrites the roof layer's
  descriptors and the end-closure descriptors; nothing else does. A plain `roof` key is emitted by no
  descriptor and is not rewritten.
- **Aliases are resolved, not stored.** `paletteMaterialFor('roofGutter@A')` answers the instance kept
  under `roofTrim@A`; the palette holds one key per owner material, so pruning and disposal never meet
  an instance twice.
- **Every descriptor-keyed lookup** in `buildPreviewObjects.js` goes through `paletteMaterialFor` now
  (roof mesh, vertical polygon, segment, stair, door, fixture boxes and cylinders), not only the ones
  that can meet an owner key.
- **Tier**: `userData.tier = 'skin'` (`OWNER_MATERIAL_TIER`), pinned against `MATERIAL_TIERS` for
  every owner base key in `viewMode.test.js`; a hard-coded constant like the tonal screw heads',
  because `materials.js` cannot import `viewMode.js` (it imports `materials.js`).
- **Remembered appearances** live in a module `WeakMap` keyed by the palette rather than as a palette
  property, so nothing that walks the palette's values meets them.
- **Pruning** (`pruneOwnerMaterials`, called by the scene cache after the finish prune) drops every
  owner material no mesh in the scene draws with, with no cap: a deleted roof or truss system, a roof's
  old covering family after a kind change, a phase-hidden roof (built again, in its remembered look,
  when it is shown).
- **Acceptance wording.** "A colour edit leaves every cached group untouched" holds for roof B's layer
  and every floor that reads neither roof; roof A's own layer and the floor holding the truss systems
  key on the roof object (MR-2), so they get a new `THREE.Group`, but every mesh and geometry in them
  is carried over (`multiRoofMaterials.test.js`). Nothing is re-triangulated.
- **Root attributes.** `data-roof-colour` = the covering of the active roof (else the first);
  `data-closure-colour` = the infill of the truss system under it (else the first system's), so a
  one-roof project reads as before. New `data-roof-colours` / `data-closure-colours` list every
  owner as `id=#HEX`, in project order.
- **Viewport read-back.** The dev-only `__previewPerf.centers(kind)` entries carry `colour`, the
  mesh's own material colour; `verify-multi-roof.mjs` reads both roofs' colours off it in Solid,
  X-ray and Night. "White model" is the palette look of every model view, so its screenshot is the
  Shaded style (the flat white-model drawing) next to Realistic.
- `TrussEndClosuresSection`'s "first truss system's cladding colour" hint and its `colourShared`
  prop are gone.
- Sheets (`renderToImage.js`) still give their own palette no appearances, as before MR-3: their roofs
  draw in the base look (Shale Grey), which is unchanged.

## 9. Judgment calls the user may overrule

1. Roof per truss SYSTEM, not per truss run.
2. Deleting a truss system still leaves its roof behind, detached (unchanged behaviour).
3. A roof shows in 3D with the floor of its truss system (today: always with the top floor).
4. The Sidebar Trusses "+" always starts a new system.
5. Sheets draw every roof in one view; there is no per-roof sheet picker.
6. Place tools do not jump roofs; you select the other roof first.
