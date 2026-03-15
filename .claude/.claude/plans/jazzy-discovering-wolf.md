# Feature: Phase Templates & Full User Customization

## Context

The phase system already has solid infrastructure: phases are data-driven objects (`id`, `name`, `order`, `color`, `visible`), objects reference by `phaseId`, and three filter modes work (all/single/cumulative). However:

1. **No template system** — every new project starts with a single "Base Design" phase
2. **No visibility toggle** — the `visible` field exists on phase objects but has no UI and the filter logic ignores it
3. **No template chooser** — `createProject()` is called directly with no opportunity to pick a starting phase set

This refactor adds phase templates (selectable at project creation and mid-project), a per-phase visibility toggle, and keeps the architecture open for future templates.

---

## Changes

### 1. `src/domain/phaseModels.js` — Add templates & instantiation helper (~30 lines)

**Add `PHASE_TEMPLATES` array** after `PHASE_COLORS`:

```js
export const PHASE_TEMPLATES = [
  {
    id: 'empty',
    name: 'Empty Project',
    description: 'A single blank phase to start from scratch.',
    phases: [{ name: 'Base Design', colorIndex: 0 }],
  },
  {
    id: 'construction',
    name: 'Construction Phases',
    description: 'Existing conditions, demolition, and new construction.',
    phases: [
      { name: 'Existing', colorIndex: 0 },
      { name: 'Demolition', colorIndex: 7 },
      { name: 'New Construction', colorIndex: 2 },
    ],
  },
  {
    id: 'renovation',
    name: 'Renovation Phases',
    description: 'Phased renovation from survey through final fit-out.',
    phases: [
      { name: 'As-Built Survey', colorIndex: 0 },
      { name: 'Demolition', colorIndex: 7 },
      { name: 'Structural', colorIndex: 4 },
      { name: 'MEP Rough-In', colorIndex: 5 },
      { name: 'Finishes', colorIndex: 2 },
    ],
  },
  {
    id: 'fit-out',
    name: 'Interior Fit-Out',
    description: 'Shell, partitions, and finishes for interior projects.',
    phases: [
      { name: 'Shell & Core', colorIndex: 0 },
      { name: 'Partitions', colorIndex: 1 },
      { name: 'Finishes & FF&E', colorIndex: 2 },
    ],
  },
];
```

**Add helper functions:**

```js
export function applyPhaseTemplate(template) {
  return template.phases.map((entry, index) =>
    createPhase(entry.name, index, PHASE_COLORS[entry.colorIndex % PHASE_COLORS.length])
  );
}

export function getDefaultTemplate() {
  return PHASE_TEMPLATES.find(t => t.id === 'empty') || PHASE_TEMPLATES[0];
}
```

Templates use `colorIndex` into `PHASE_COLORS` (not raw hex) to stay decoupled from the palette. Individual phase `id`s are generated fresh by `createPhase` on each instantiation.

---

### 2. `src/domain/phaseFilter.js` — Respect per-phase `visible` flag (~10 lines)

**`isObjectVisibleInPhase`** — add visibility check at the top:

```js
export function isObjectVisibleInPhase(obj, phases, activePhaseId, phaseViewMode) {
  if (obj.phaseId) {
    const objPhase = phases.find(p => p.id === obj.phaseId);
    if (objPhase && objPhase.visible === false) return false;
  }
  // ... existing logic unchanged
}
```

**`filterFloorByPhase`** — widen the early-return gate so hidden phases still get filtered even in `'all'` mode:

```js
const hasHiddenPhases = phases.some(p => p.visible === false);
if (phaseViewMode === PHASE_VIEW.ALL && !hasHiddenPhases) return floor;
// remove the old `if (!activePhaseId) return floor;` — keep it only when no hidden phases
if (!activePhaseId && !hasHiddenPhases) return floor;
```

**`filterProjectByPhase`** — same early-return widening:

```js
const phases = project.phases || [];
const hasHiddenPhases = phases.some(p => p.visible === false);
if (phaseViewMode === PHASE_VIEW.ALL && !hasHiddenPhases) return project;
if (!activePhaseId && !hasHiddenPhases) return project;
```

When all phases have `visible: true` (the default), behavior is identical to today.

---

### 3. `src/app/ProjectProvider.jsx` — Add `PHASE_APPLY_TEMPLATE` action (~20 lines)

New reducer case for applying a template mid-project. Nullifies all `phaseId` references since old phase IDs no longer exist:

```js
case 'PHASE_APPLY_TEMPLATE': {
  const phaseArrayKeys = [
    'walls', 'doors', 'windows', 'columns', 'beams', 'slabs',
    'stairs', 'landings', 'fixtures', 'rooms', 'railings',
  ];
  const nullifyPhase = (obj) => ({ ...obj, phaseId: null });
  return applyProjectUpdate(state, {
    ...state.project,
    updatedAt: new Date().toISOString(),
    phases: sortPhases(action.phases),
    floors: state.project.floors.map(floor => {
      const updated = { ...floor };
      for (const key of phaseArrayKeys) {
        if (updated[key]) updated[key] = updated[key].map(nullifyPhase);
      }
      return updated;
    }),
    sheets: (state.project.sheets || []).map(sheet => ({
      ...sheet,
      viewports: (sheet.viewports || []).map(vp => ({
        ...vp, phaseId: null, phaseViewMode: 'all',
      })),
    })),
  });
}
```

---

### 4. `src/app/App.jsx` — New project flow with template chooser (~15 lines changed)

- Import `PHASE_TEMPLATES`, `applyPhaseTemplate`, `getDefaultTemplate`
- Add state: `const [showNewProjectModal, setShowNewProjectModal] = useState(false)`
- Modify `handleNew` to show modal: `setShowNewProjectModal(true)` (keep the unsaved-changes guard)
- Add `handleCreateProject({ name, templateId })`:
  - Find template by id, fall back to default
  - Call `createProject(name)`, override `.phases` with `applyPhaseTemplate(template)`
  - Dispatch `PROJECT_NEW`, close modal
- Render `<NewProjectModal>` conditionally

---

### 5. `src/ui/NewProjectModal.jsx` — New file (~70 lines)

A modal using the existing `Modal` component. Contents:

- **Project name** text input (default "Untitled Project")
- **Template cards** rendered from `PHASE_TEMPLATES`: each shows name, description, and a row of colored dots with phase names. Selected card gets accent border.
- **Create / Cancel** buttons

Default selection: `'empty'` template. On Create, calls `onConfirm({ name, templateId })`.

---

### 6. `src/ui/NewProjectModal.module.css` — New file (~40 lines)

Styles for the template card grid. Uses existing CSS custom properties and follows the `modalCard` pattern from `Modal.module.css`.

---

### 7. `src/ui/Sidebar.jsx` — Visibility toggle + Apply Template button (~40 lines)

**Per-phase visibility toggle:**

Add an eye icon button in each `.phaseItem` row, between the name and the reorder arrows:

```jsx
<button
  type="button"
  className={styles.phaseVisibilityBtn}
  onClick={(e) => {
    e.stopPropagation();
    dispatch({ type: 'PHASE_UPDATE', phase: { id: phase.id, visible: !phase.visible } });
  }}
  title={phase.visible !== false ? 'Hide phase' : 'Show phase'}
>
  {/* eye-open or eye-closed SVG */}
</button>
```

Phase row gets dimmed style when `visible === false`: `styles.phaseItemHidden` (opacity 0.5).

**Apply Template:**

Add a small "Apply Template" dropdown below the view mode toggle. It lists `PHASE_TEMPLATES` by name. On selection, confirm ("This will replace all phases and unassign all objects. Continue?"), then dispatch `PHASE_APPLY_TEMPLATE` with `applyPhaseTemplate(selected)` and reset editor phase state.

Import `PHASE_TEMPLATES`, `applyPhaseTemplate` from `@/domain/phaseModels`.

---

### 8. `src/ui/Sidebar.module.css` — Add visibility toggle styles (~15 lines)

```css
.phaseVisibilityBtn { /* 22x22, transparent bg, centered flex, hover highlight */ }
.phaseItemHidden { opacity: 0.5; }
```

---

## Files Summary

| File | Action | Lines |
|------|--------|-------|
| `src/domain/phaseModels.js` | Modify | ~30 |
| `src/domain/phaseFilter.js` | Modify | ~10 |
| `src/app/ProjectProvider.jsx` | Modify | ~20 |
| `src/app/App.jsx` | Modify | ~15 |
| `src/ui/NewProjectModal.jsx` | **Create** | ~70 |
| `src/ui/NewProjectModal.module.css` | **Create** | ~40 |
| `src/ui/Sidebar.jsx` | Modify | ~40 |
| `src/ui/Sidebar.module.css` | Modify | ~15 |

**Total: ~240 lines across 8 files (6 modified, 2 new)**

---

## Implementation Order

1. **Phase templates data** (`phaseModels.js`) — pure additive, zero risk
2. **Visibility filter logic** (`phaseFilter.js`) — backward-compatible (all `visible` default to `true`)
3. **`PHASE_APPLY_TEMPLATE` action** (`ProjectProvider.jsx`) — new reducer case
4. **Visibility toggle UI** (`Sidebar.jsx`, `Sidebar.module.css`) — eye icon per phase
5. **Apply Template UI** (`Sidebar.jsx`) — dropdown in phase panel
6. **New Project Modal** (`NewProjectModal.jsx`, `NewProjectModal.module.css`, `App.jsx`) — template chooser on project creation

---

## Verification

1. **New project with template**: Click New -> pick "Construction Phases" -> 3 phases created (Existing, Demolition, New Construction) with correct colors
2. **New project empty**: Click New -> pick "Empty Project" -> single "Base Design" phase (matches old behavior)
3. **Cancel new project**: Click New -> Cancel -> nothing changes
4. **Visibility toggle**: Toggle eye icon on a phase -> objects from that phase disappear in canvas, 3D, and sheets; toggle back -> objects reappear
5. **Visibility in "all" mode**: Even in "All" view mode, hiding a phase hides its objects
6. **Apply template mid-project**: Click "Apply Template" in Sidebar -> confirm -> phases replaced, all objects become unassigned
7. **Phase CRUD still works**: Add/rename/recolor/reorder/delete phases as before
8. **Sheet viewports**: Phase filtering on viewports unaffected
9. **Old project load**: Projects without visibility or template data load fine (backfill handles defaults)
10. **3D preview**: Respects visibility toggles
