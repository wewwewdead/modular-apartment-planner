# Sketch Studio 3D workstation — grouping parts

Spec for **multi-selection and persistent part groups** in the Sketch Studio
"3D Model & workshop" pane (`src/features/sketchstudio/cad/`). Written
2026-11-07 after reading the code; to be built by Opus 5.5 (effort high);
audited against this document afterwards.

## 1. The ask, in the user's words

> can we allow to group selected parts in 3d model and workshop?

Read literally, that needs two things the workstation does not have: a way to
**select several parts**, and a **Group** command that keeps them together so
they move, turn, hide and copy as one: the welded frame of a table, the
carcass of a cabinet, a bracket with its bolts. The 2D drafting side of Sketch
Studio already has Ctrl+G / Ctrl+Shift+G grouping (§2.6). This spec brings the
same idea to the 3D pane so the two halves of the studio work the same way.

## 2. What the code does today (verified 2026-11-07 against source)

Read for this spec, per the research-before-spec rule: the workspace state and
tree (`CadWorkspace.jsx`), the viewport's picking, gizmo drag and optimistic
pose (`CadViewport.jsx`), placement maths (`movement.js`, `placement.js`), the
kernel's assembly placement (`kernel.js` `place`), connections
(`ConnectionEditor.jsx`), mates (`mate.js`), marks (`marks.js`), the model
schema and its repair passes (`model.js`, `utils/sketchDocumentUtils.js`), the
keyboard mappers (`rotateKeys.js`, `viewMode.js`, `hooks/useSketchKeyboard.js`)
and the 2D group implementation (`utils/groupUtils.js`).

### 2.1 Selection is one instance

- `CadWorkspace.jsx:213` holds `selectedId` (one instance id or `null`).
  `instance`, `part`, `feature` (`:309-311`), `attached`, `moveHint`
  (`:322-327`), `placeable` (`:378-390`) and every tool (holes, operations,
  mates, sketch-on-face, hardware) derive from it.
- `select(id)` (`:458-466`) resets the hole tool, operation draft, selected
  mark, sketch and feature, then sets `selectedId`. About fifteen other call
  sites call `setSelectedId` directly (operations, mate, starter models).
- The viewport reports a click as `selectionCallback.current(hit?.object.userData.instanceId || null)`
  (`CadViewport.jsx:1537`). No modifier key is read. `dblclick` is used only
  by the placement layer (`:1386`, `placementLayer.doubleClick()`).

### 2.2 The tree is flat

`CadWorkspace.jsx:1595-1750`: "PARTS & FEATURES" → `<details>` "Assembly · N
instances" lists `model.instances` in model order, one `.cad-tree-item`
button per instance (click = `select`, double-click / F2 = rename through
`renaming`, `commitRename` `:932-944`). The selected instance expands into its
feature list.

### 2.3 Moving and turning one part

- **Gizmo.** The attach effect (`CadViewport.jsx:1806-1847`) finds the
  selected `THREE.Group`, puts the shared `pivot` Object3D at the centre of
  its meshed bounds, attaches `TransformControls` to the pivot and stores
  `ctx.movingId`. On `mouseDown` (`:841-895`) `drag = { group, id, start,
groupStart, attach, ... }`. `objectChange` (`:896-941`) applies the
  snapped delta, or `showTurn` (`:779-790`) applies the turn, **to that one
  group's matrix**. Box snap uses `drag.box` (the part) against `drag.others`
  (every other visible part). Mark points riding on the part are excluded
  (`markSnapPoints(..., { exclude: ctx.movingId })`, `marks.js:168`).
  `mouseUp` (`:948-983`) calls `onMove(id, delta)` or
  `onRotate(id, turn, centre)`. A ring drag ghosts the part's start pose
  through `createRotateFeedback(layer, group, startMatrix, colour)`
  (`:2039`).
- **Commit.** `CadWorkspace.jsx:2022-2033`: `translateInstance` and
  `turnInstance` (`movement.js`). `turnSelected` (`:394-404`) is the 90° / ]
  / [ path: Local axis from `instanceAxis`, pivot from
  `viewport.getPivot()` (picked point) or `getInstanceBounds(selectedId)`
  centre. Flip H/V (`:1805-1828`) is `flipInstance(…, flipAxis(direction,
bounds), bounds, …)`.
- **Optimistic pose.** The pose effect (`CadViewport.jsx:1718-1761`) shows
  the committed placement before the worker rebuilds:
  `placementDelta(meshed, instance, …)` = `instanceMatrix(committed) ·
placementMatrix(meshed)⁻¹` (`:2159-2167`). Attached instances return
  identity: they wait for the rebuild. `marks.modelPoses` (`marks.js:47-63`)
  mirrors this rule for the Marks panel. The two must stay identical.

### 2.4 Attachments and what moves with what

`kernel.js:449-551` places instances. A non-`weld` connection
`{ from, to }` makes `from` follow `to`:

| type                                   | how the child's own `position` / `rotation` are used                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fixed`                                | applied first, then `offset`, then **the parent's whole placement**: the child's own pose is in the **parent's frame**                                                               |
| `concentric`                           | applied, then the smallest turn that lines the axis up with the target's axis, then a translation onto it: own translation cancels out; own rotation decides the spin about the axis |
| `align`, `face-offset` (no references) | applied, then one translation along a **world** axis so the bounding boxes line up                                                                                                   |
| `face-offset` with references          | applied, then a translation along the face normal                                                                                                                                    |

`weld` is a note and a location only; it never moves anything. More than one
non-weld attachment on an instance is an error (`:461`). `translateInstance`
refuses an attached instance (`movement.js`, "This part is attached…"), and
`placeable` is false for one (`attached`, `CadWorkspace.jsx:322`).

### 2.5 Other things a group touches

- **Visibility / isolate.** `instance.visible === false` hides a part
  (`CadViewport.jsx:1726`). The ribbon command "Hide / show" toggles the
  selected instance (`CadWorkspace.jsx:1248-1253`). `isolated` shows only
  `selectedId` (`:1726`).
- **Selected look.** `selectedLook` (`CadViewport.jsx:1739`) colours the
  selected part and, in X-ray, keeps it solid (`viewMode.bodyAppearance`).
- **Duplicate instance** (`CadWorkspace.jsx:1222-1234`): clones the instance,
  +100 mm in X, selects the copy.
- **Remove instance** (`:3076-3096`) → `removeInstance` (`model.js:113-127`),
  which cascades connections, marks and sheet references; `removePart` goes
  through it.
- **Mate** (`mate.js`, `CadWorkspace.jsx:827-878`): the first pick names the
  moving instance; `mateInstance` re-applies one rigid turn + translation from
  the instance's `base` pose.
- **Drawings / parts list / cut list** count instances (`partsList.js`,
  `fabrication.js`). `sheet.instanceIds` limits an assembly sheet to some
  instances (`kernel.js:681`, `engineeringSheet.js:30`). No UI creates one
  today except the pump example.
- **Keys.** `placementKeyAction` (`rotateKeys.js:32`) returns `null` for any
  Ctrl / Meta / Alt chord. The 2D keyboard hook handles Ctrl+Z / Ctrl+Y for
  both panes, then returns when `workspaceMode === 'model'`
  (`hooks/useSketchKeyboard.js:75`) **before** its own Ctrl+G
  (`:83`). So Ctrl+G, Ctrl+Shift+G and Ctrl+A are free in the 3D pane. Esc is
  owned by whichever tool is running (pick, operation, measure effects at
  `CadWorkspace.jsx:1397-1473`, viewport drag at `CadViewport.jsx:1015`).
- **Schema.** `CAD_VERSION = 1` (`model.js:4`). `normalizeModel` requires the
  version to match exactly, so new keys are added with defaults and no bump
  (the `marks` precedent). On load `sketchDocumentUtils.js:131` runs
  `removeEmptyParts(removeOrphanedConnections(normalizeModel(...)))`.
- **Kernel rebuilds on any model change** (`useCadModel.js`, keyed on model
  identity), renames and marks included. Grouping will rebuild too. That is
  the existing behaviour for every non-geometric edit and is not changed here.
- **Line endings.** `model.js` and `movement.js` are **CRLF**;
  `CadWorkspace.jsx`, `CadViewport.jsx` and the other cad files are LF. Keep
  each file's own.

### 2.6 The 2D sibling: `utils/groupUtils.js`

2D entities carry `meta.groupId` plus `meta.groupStack` (nesting). Ctrl+G
groups ≥ 2 selected entities. A selection already in a group pushes a new
level. Ctrl+Shift+G pops **one level**. Clicking any member selects the whole
group (`expandGroupedSelection`). A group left with fewer than two members
dissolves (`normalizeEntityGroupMemberships`). Duplicating a whole group
gives the copies a fresh group id. This spec keeps the same rules: Ctrl+G /
Ctrl+Shift+G, one level per ungroup, groups nest, a click takes the group,
and groups of one dissolve.

## 3. Decisions

### 3.1 Data model: named groups with parent pointers

```js
model.groups = [{ id: 'group-<uuid>', name: 'Group 1', parentId: null }]; // new, default []
instance.groupId = 'group-<uuid>'; // optional; absent = top level
```

- Parent pointers, not child lists. `removeInstance` and the kernel stay
  oblivious, and the tree order falls out of model order: a group is drawn at
  the position of its first member in `model.instances`. No reordering UI.
- Groups nest (`parentId`), like the 2D `groupStack`. The tree and the "open
  group" context (§3.3) work at any depth. Nothing else depends on depth.
- **No `CAD_VERSION` bump.** `emptyModel()` gains `groups: []`. Old saves get
  it through the existing `{ ...defaults, ...value }` spread. The kernel
  ignores both keys.
- `normalizeModel` validates structure and throws, like every other list:
  `groups` is a list with unique ids (add it to the key loop at
  `model.js:56`), `name` is a string, `parentId` is `null` or an existing
  group, there are no parent cycles, and every `instance.groupId` is absent or
  names an existing group.
- **Invariant enforced by operations, not by `normalizeModel`:** a group has
  at least two children (instances plus child groups), else it dissolves and
  its child moves up to the group's parent. That is
  `pruneGroups(model)`, run by `removeInstance` (so `removePart` too), by
  ungroup, and on load (append it to the chain at
  `sketchDocumentUtils.js:131`, so a hand-edited file with a dangling
  `groupId` is repaired, not refused). On load it also deletes `groupId`s
  that name no group and re-roots groups whose parent is missing. A
  structurally invalid file must never become unopenable.

### 3.2 Selection: a list of nodes, with `selectedId` derived

New workspace state replaces `selectedId`:

```js
const [selection, setSelection] = useState([]); // node ids: instance ids and/or group ids, in click order
const [openGroupId, setOpenGroupId] = useState(null); // the group being edited inside (§3.3); pane state, never saved
```

- `selectedId` becomes **derived**: the single selected node when it is an
  instance, else `null`. All existing code keyed on `selectedId`, `instance`,
  `part` and `feature` keeps working unchanged. A group or multi-selection
  simply has no `part`, so the single-part tools disable themselves exactly
  as with nothing selected.
- Keep a `setSelectedId(id)` shim (`id ? [id] : []`) so the ~15 existing
  call sites need no rewrite. `select(id)` (programmatic: add part, finish an
  operation, duplicate…) selects **exactly that node** and sets
  `openGroupId` to the node's parent group (or `null`). A tool that selects a
  part inside a group therefore opens the group instead of jumping to the
  outer group.
- `selection` is filtered against the current model on every render (ids that
  no longer exist drop out). Undo, Ctrl+Z, remove and load can remove
  nodes under it. If `openGroupId` no longer exists it falls back to `null`.
- Derived helpers (pure, in `groups.js`, §4.1): `memberIds` = leaf instance
  ids of the selection (recursive); `selectedGroup` = the single selected
  node when it is a group.

### 3.3 Picking rules: a click takes the group (SketchUp / Fusion style)

In the viewport, with no tool running (the existing early returns for pick /
hole / pivot / ring paths at `CadViewport.jsx:1490-1536` stay first):

| gesture                                                                 | result                                                                                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| click a part                                                            | select its **top node**: the outermost group containing it _below `openGroupId`_, or the instance itself                                                                        |
| Shift+click or Ctrl+click a part                                        | toggle its top node in `selection` (add / remove)                                                                                                                               |
| click empty space                                                       | clear `selection`; `openGroupId` unchanged                                                                                                                                      |
| double-click a part whose top node is a group                           | `openGroupId` = that group; select the next node down that contains the part (repeat to go deeper)                                                                              |
| click a part **outside** the open group                                 | close the context (`openGroupId = null`), then resolve as a normal click                                                                                                        |
| Esc (no tool running, not typing, not dragging, not `defaultPrevented`) | if `openGroupId`: close one level (`openGroupId` = its parent, `selection` = [the group just closed]); otherwise do nothing (Esc does not clear the selection today, keep that) |

The viewport keeps reporting raw instance ids. The workspace resolves groups:
`onSelect(instanceId, { toggle, open })`. The viewport sets `toggle` from
`event.shiftKey || event.ctrlKey || event.metaKey` on `pointerup`, and calls
`onSelect(id, { open: true })` from a **new** `dblclick` listener that runs
only when no placement / sketch / hole / measure / pivot pick is active (the
placement layer's own `dblclick` keeps priority). The two `pointerup`s of a
double-click select the group twice; then `dblclick` opens it. That is
intended.

**Open-group banner.** While `openGroupId` is set, the view toolbar shows a
chip: `Inside ‹Group name› · Close (Esc)`. Clicking it closes one level.
Other parts are **not** dimmed (follow-up).

**Tree.** Shift / Ctrl+click on a tree row toggles that node. A plain click
on a member row inside a group selects the member and sets `openGroupId` to
its parent group. All nodes in a selection must be **siblings** (same
parent). A toggle that would mix levels replaces the selection with the
clicked node instead, so Group always has a well-defined parent.

### 3.4 Group and Ungroup

- **Group** (Ctrl+G, Assemble ribbon "Group", Properties button): needs ≥ 2
  sibling nodes. Creates `{ id: uid('group'), name: nextGroupName(model),
parentId: <their common parent> }`, re-parents the selected instances
  (`groupId`) and groups (`parentId`) into it, and selects the new group.
  Names are "Group 1", "Group 2", …: the first unused, like `nextPartName`.
  Grouping never moves geometry.
- **Ungroup** (Ctrl+Shift+G, ribbon "Ungroup", Properties button): each
  selected group dissolves **one level**. Its children move to its parent and
  the group record is deleted. The selection becomes those children (siblings,
  so Ctrl+G regroups them).
- **Rename**: double-click or F2 on a group row in the tree (same `renaming`
  flow), and a "Group name" field in Properties.
- Grouping is never refused because of connections. A group whose members
  are attached to parts outside it is **anchored** (§3.5). It can still be
  hidden, isolated and removed, but not moved, and the Properties panel says
  why.

### 3.5 Moving a group rigidly

**The anchoring rule (one rule for move, turn, flip, keys, mate and
duplicate):** a selection is _movable as a body_ when no member has a
non-weld attachment to an instance **outside** the selection's members.
Otherwise it is anchored, and `moveHint` names the first offender:
`"‹member› is attached to ‹target› outside this group. Group them together or edit Connections / welds."`.
This extends today's single-part rule (an attached part cannot be moved)
without guessing.

**Which poses a rigid motion edits** (`rigidMovers(model, memberIds)`):
every member, **except** members `fixed`-attached to another member (their
pose is in the parent's frame, §2.4, so editing it would move them twice).
Members with `concentric`, `align` or `face-offset` attachments to in-group
targets **are** edited (translation and turn applied to their own pose):

- `concentric`: exact. The kernel's alignment turn conjugates with the group
  turn, so the result is rigid, spin included. Own translation cancels.
- `align` / `face-offset`: exact for translations and for turns about the
  alignment axis. For other turns the kernel re-solves the alignment along its
  **world** axis after the turn. That is correct for the connection as
  defined and is noted in the hint ("Aligned parts re-align along world Z
  after turning"). It is not "fixed".

`movement.js` gains `translateInstances(model, ids, delta)` and
`turnInstances(model, ids, turn, centre, parameters)`. They apply the
existing per-instance maths (expression-preserving translation, `cleanRotation`)
to each mover in one model update, **without** the attached refusal, which
the anchoring check has replaced. `translateInstance` / `turnInstance` keep
their behaviour and refusal for single parts.

**Pivot and gizmo.** For a group or multi-selection the pivot is the centre of
the **union of the displayed world boxes** of all visible members
(`Box3.setFromObject` per member group). That is what the user sees.
Rotation space is **World only**: a group has no axes of its own, so the
World/Local segmented control disables Local with the title "A group has no
axes of its own; World axes are used". "Rotate about: Picked point" works.
The picked pivot is stored in the frame of the selection's **anchor member**
(the first mover in model order), exactly as today's `ctx.pickedPivot` is
stored in a part's frame, so it stays on the same spot through later moves
and turns.

**Viewport drag** (`CadViewport.jsx`): `ctx.movingId` becomes the selection
key (the instance id, or the group id for a single group; for a
multi-selection, a synthetic `'selection'` key) plus `ctx.movingGroups` (the
`THREE.Group`s of **all** members, attached ones included, because they move
on screen). `drag.groups = [{ group, start }]`. `objectChange` / `showTurn` /
`cancelDrag` apply the same delta or turn matrix to each. Box snap:
`drag.box` = union box of the moving members, and `drag.others` excludes all
of them. `markSnapPoints` `exclude` accepts a `Set` of instance ids (keep the
single-id form working). The rotate ghost draws every member's edges (one
`rotate-ghost` per member; never dispose the shared geometry). `mouseUp`
calls `onMove(key, delta)` / `onRotate(key, turn, centre)` unchanged in
shape. The workspace maps the key to `rigidMovers`.

**Attached parts ride their root's pending pose.** Today an attached part
waits for the rebuild (`placementDelta` → identity), so after a group drag the
`fixed` children would visibly snap back to their old place until the worker
finishes. That is visible today too when a parent part is moved. Change
`placementDelta` (and its mirror `marks.modelPoses`, identically) to:
for an instance with a non-weld attachment, walk `from → to` until a free
instance (the **root**, guard against cycles) and use **the root's** delta
`instanceMatrix(root committed) · placementMatrix(root meshed)⁻¹`. At rest
the delta is identity, as before. During a pending rebuild the whole attached
chain moves rigidly with its root. This also fixes the single-part case.

**Numbers.** The Properties panel for a group / multi-selection shows the
union extent as an engraved readout (`Spans X a–b · Y … · Z … mm`, from the
snapshot instance bounds, with `· rebuilding` while not ready), and a **Move
by (mm)** row: three `NumericInput`s plus a **Move** button (Enter in a box
applies). It is deliberately **not** a live absolute-position field. An
absolute group position would be computed from bounds that lag the commit,
and live typing (Phase L) would then apply the same delta twice. A
delta-plus-button cannot double-apply. Inputs reset to 0 after Move.

**Keys and buttons that now work on a group:** M / R (gizmo), ] / [ and
Shift+] / Shift+[ (turn about Z / X through the union centre or picked
pivot), the X / Y / Z 90° buttons, Flip Horizontal / Vertical (`flipAxis`
on the union bounds, about the union centre). `placementKeyAction`'s
`selected` becomes `Boolean(part) || isBody` and `placeable` gets a group
branch with the same tool / exploded / busy gates as today.

### 3.6 Other commands on a selection

| command                                               | single part (unchanged)    | group / multi-selection                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hide / show                                           | toggles `instance.visible` | if any member is visible, hide all; else show all (writes each member's `visible`; no group-level flag, so the kernel, drawings and marks need no change)                                                                                                                                                                                                                   |
| Isolate                                               | shows `selectedId`         | shows all members (`isolated` filter uses the member set)                                                                                                                                                                                                                                                                                                                   |
| Duplicate                                             | clone +100 mm X            | clones every member, the nested group records (fresh ids, same names + " copy" on the top group), and the **internal** connections (both ends inside, ids remapped; welds included). Free movers +100 mm X, `fixed` children unchanged since they follow. Refused when anchored. Marks are not copied (same as a single duplicate today). The copy is selected.             |
| Remove                                                | Remove instance            | "Remove group · N parts": `removeInstance` for every member (cascades as today), then `pruneGroups`. Selection cleared.                                                                                                                                                                                                                                                     |
| Mate faces                                            | moves the picked instance  | the first pick resolves to its **top node** (§3.3). If that is a group, the mate moves all its movers rigidly from their `base` poses (generalise `mateInstance` to `mateNodes`; `mateTransform` is unchanged). The target must be outside the moving node's members ("Pick a face on a part outside this group"). An anchored group is refused with the anchoring message. |
| Holes, operations, features, sketch on face, hardware | as today                   | disabled: there is no single `part`, same as no selection                                                                                                                                                                                                                                                                                                                   |

`X-ray`: every member of the selection gets `selectedLook`, so it is solid
and selection blue. `Exploded view`: unchanged, still per instance.

### 3.7 What groups do _not_ do in this build

- No change to the kernel, drawings, cut list, parts list or STEP/DXF output.
  A group is an editing aid. The workshop ZIP `README` gains a `## Groups`
  section listing each group's name, parent and member instance ids
  (`exports.js`, next to `## Instances`), so the structure is not lost on
  export.
- No marquee (box) selection, no group-level transform record, no group
  colour, no dimming outside an open group, no "assembly sheet from group".
  These are in §11.

## 4. The build

### 4.1 `cad/groups.js` (new, pure, unit-tested in `groups.test.js`)

```
nodeParent(model, nodeId)            → groupId | null
isGroupId(model, id)                 → boolean
memberIds(model, nodeIds)            → string[]   leaf instance ids, model order, deduped
topNode(model, instanceId, openGroupId) → nodeId  (§3.3)
childNodes(model, groupId|null)      → { groups, instances }
treeRows(model)                      → nested rows for the tree (group at its first member's position)
nextGroupName(model)                 → 'Group N'
groupNodes(model, nodeIds)           → { model, groupId }   throws on < 2 or non-siblings
ungroupNodes(model, groupIds)        → { model, childIds }
pruneGroups(model)                   → model (same object when nothing changes)
anchoring(model, memberIds)          → null | { memberId, targetId }
rigidMovers(model, memberIds)        → string[]   (§3.5)
duplicateNodes(model, nodeIds, offset) → { model, nodeIds }
groupKeyAction(event, state)         → null | { type: 'group' | 'ungroup' | 'selectAll' | 'closeGroup' }
```

`groupKeyAction` mirrors `placementKeyAction`'s guards: editable target,
dragging, `defaultPrevented`, Alt → `null`. Ctrl/Meta+G with ≥ 2 nodes →
group; Ctrl/Meta+Shift+G with a group in the selection → ungroup; Ctrl/Meta+A
→ select all top-level nodes of the current context (not while a tool is
busy); Esc → closeGroup only when `openGroupId` and nothing busy. Call
`preventDefault` only when an action is returned (browser Ctrl+G = find next,
Ctrl+A = select page).

### 4.2 `model.js` (CRLF)

`emptyModel().groups = []`. Validation as §3.1. `removeInstance` ends with
`pruneGroups` (import from `groups.js`, or put `pruneGroups` in `model.js` and
re-export it; avoid an import cycle). Keep `removeInstance`'s output identical
for models without groups (existing tests deep-compare).

### 4.3 `movement.js` (CRLF)

`translateInstances`, `turnInstances` (§3.5). Single-instance functions are
unchanged.

### 4.4 `CadViewport.jsx`

New props `selectedIds` (all member ids; drives `selectedLook` and
`isolated`) and `movingKey` (selection key or `null`). `moveEnabled` keeps its
meaning. `onSelect(id, { toggle, open })`. Imperative API: add
`getBounds(ids)` → union world box of the displayed groups, or `null`.
`getInstanceBounds` stays. Drag generalisation, ghosts, snap exclusion and
`placementDelta` root rule as §3.5. Pivot for multi-member keys = union
centre. Local space is forced to World for them. Keep the
`[Mesh, LineSegments]` child order and the material cache contract
(`docs/sketch-studio-xray-mode.md`).

### 4.5 `marks.js`

`modelPoses` uses the same root rule as `placementDelta` (share one helper
if practical, e.g. `attachmentRoot(model, id)` in `groups.js` or `marks.js`).
`markSnapPoints` `exclude` accepts a `Set`.

### 4.6 `CadWorkspace.jsx`

- State (§3.2), `select` / `pick` / shim, selection filtering, `openGroupId`
  banner chip in `.cad-view-toolbar`.
- Tree: render `treeRows(model)`. A group row is a `.cad-tree-item
.cad-tree-group` with a disclosure caret (collapsed state is local UI
  state; a group containing the selection auto-expands), a new `Group` icon
  path (two overlapping squares), the name, and `<small>` "N parts · hidden"
  where applicable. Children are indented (`--cad-tree-depth` custom property,
  12 px per level). Member rows reuse the instance row markup unchanged
  (rename, feature list on single selection). Shift / Ctrl+click toggles.
- Properties for a group / multi-selection (render where the single-instance
  panel renders when `selectedId` is null and `selection.length`): heading
  ("Group" + name field, or "N parts selected"), the extent readout, the
  anchored hint, a member list (clicking one opens the group and selects it),
  **Move by**, and buttons Group / Ungroup / Hide|Show / Isolate / Duplicate
  / Remove (danger).
- Ribbon (Assemble): add "Group" and "Ungroup" after "Duplicate instance".
  "Duplicate instance", "Hide / show", "Isolate", "Move part" act on the
  selection (§3.6). Labels unchanged.
- `onMove` / `onRotate` / `turnSelected` / flips: a group or multi key goes
  through `rigidMovers` + `translateInstances` / `turnInstances`, guarded
  by `anchoring`. Single ids are unchanged.
- Mate generalisation (§3.6).
- `groupKeyAction` wired in the existing key effect (`:406-445`) before
  `placementKeyAction`.

### 4.7 `exports.js`

`## Groups` README section (§3.7).

### 4.8 CSS (`cad.css`)

Group row, indentation, caret, open-group chip. Use the existing tokens and
`.cad-tree-item` look. The chip uses the `.cad-segmented` / toolbar button
scale. The view toolbar already wraps at 1600 px when Measure is on (known
residual). Put the chip at the toolbar's **start** (after "Parts ›"), and
measure that the toolbar does not gain a second row at 1600 px with
nothing else on.

## 5. Order of work

1. `groups.js` + tests; `model.js` schema / prune / `removeInstance`; load
   repair in `sketchDocumentUtils.js`.
2. `movement.js` multi-instance functions + tests.
3. Workspace selection state + shim + filtering; tree rendering; Group /
   Ungroup / rename / keys. Make the existing DOM tests pass **before**
   touching the viewport.
4. Viewport: `selectedIds` look / isolate, click resolution, dblclick, union
   pivot, multi-group drag, snap, ghosts, root-delta `placementDelta` +
   `modelPoses`.
5. Properties panel, Hide / Isolate / Duplicate / Remove / Move by.
6. Mate on groups.
7. README export section, CSS, verification script.

## 6. Copy

| where                | text                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ribbon               | `Group`, `Ungroup` (titles: "Group the selected parts so they move together (Ctrl+G)", "Split the selected group one level (Ctrl+Shift+G)") |
| tree group row title | "Click to select the group · double-click or F2 to rename · Shift+click to add to the selection"                                            |
| banner               | `Inside {name} · Close (Esc)`                                                                                                               |
| multi heading        | `{n} parts selected` / `{n} items selected` when groups are mixed in                                                                        |
| remove               | `Remove group · {n} parts` / `Remove {n} parts`                                                                                             |
| anchored             | §3.5                                                                                                                                        |
| local disabled       | §3.5                                                                                                                                        |
| errors               | "Select at least two parts to group." · "Pick parts at the same level to group them." · "Pick a face on a part outside this group."         |

## 7. Tests (vitest, repo root)

- `groups.test.js`: every function in §4.1, including nesting depth 3,
  `topNode` with and without an open group, `pruneGroups` dissolving a
  one-child group into its parent, load repair of a dangling `groupId`,
  `rigidMovers` skipping a `fixed` child and keeping a `concentric` one,
  `anchoring` naming an outside target, `duplicateNodes` remapping internal
  connections and dropping outside welds, `groupKeyAction` guards (editable
  target, Alt, busy, no-op returns `null`).
- `model.test.js`: groups validation errors (duplicate id, unknown parent,
  cycle, unknown `groupId`); `removeInstance` on a two-member group dissolves
  it; old saves without `groups` normalise to `[]`.
- `movement.test.js`: `turnInstances` of two boards 90° about Z about their
  union centre equals the rigid result (positions and rotations); a
  parameter-expression position stays an expression after
  `translateInstances`.
- Kernel-backed (pattern of `kernel.test.js`): a group of a board + a tube
  `fixed`-attached to it, turned 90° via `turnInstances(rigidMovers(...))`:
  the tube's world bounds equal the rigid turn of its old bounds (±0.01 mm),
  and the same for a `concentric` pin in a hole.
- `marks.test.js`: `modelPoses` gives an attached child its root's delta.
- DOM (`CadWorkspace.groups.dom.test.jsx`, with the existing viewport mock):
  Shift+click two tree rows → Ctrl+G → the tree shows `Group 1` with two
  members; Ctrl+Shift+G restores the flat list; undo / redo round-trips; a
  selection whose group was undone falls back without errors; Properties
  shows the group panel; Remove group removes both instances.

## 8. Verification: `scripts/verify-cad-groups.mjs`

Playwright, Chrome headless, same shape as `verify-sketch-xray.mjs`
(`scripts/sketch-cad-steps.mjs`, `CAD_VERIFY_URL`, artifacts under
`artifacts/sketch-cad/groups/`, `verification.json` with named checks).

1. Fresh `/sketch` → `3D Model & workshop` → Design parameters → Cabinet →
   Apply & build (10 instances). Read saved poses from the model (never
   assume positions).
2. Click the left Side in the viewport, Shift+click the right Side and the
   Top. The tree shows three selected rows; Properties reads "3 parts selected".
3. Ctrl+G: tree shows `Group 1` with 3 members; the saved model has one group
   and three `groupId`s. Screenshot `01-grouped.png`.
4. Click the Top in the viewport: the **group** is selected (Properties heading
   "Group"). Drag the gizmo's X arrow +200 mm (typed `200` + Enter mid-drag
   via the HUD): all three instances' saved X positions grew by exactly 200;
   other instances unchanged; one undo step reverts all three.
5. During that drag, before release, sample the three members' displayed
   world boxes through the test hook: all moved by the same delta (rigid on
   screen). After release, sample again **before** `Model current`: no member
   jumped back (the root-delta rule; check with a part `fixed`-attached to the
   Top if the cabinet has one, else create one through Connections).
6. Press `]` with the group selected: the union box turns 15° about Z about
   its centre (compare displayed union centre before/after, ±0.5 mm).
7. Double-click the Top: banner `Inside Group 1`, Properties shows the Top as
   a single part (feature list visible). Esc: banner gone, group selected.
8. Hide / show on the group hides all three (saved `visible: false` on each).
   Isolate shows only them.
9. Duplicate: 6 instances in 2 groups; the copy's members +100 mm X.
   Ctrl+Shift+G on the copy: its three parts are top level, still selected.
10. Anchoring: attach a non-member to a member with a `fixed` connection the
    other way round (member `from`, outside part `to`). The group's Move part
    is disabled and the hint names both parts.
11. Mate: start Mate faces, click a face of a grouped part, then a face on an
    outside part. All members moved rigidly (pairwise distances unchanged
    ±0.01 mm).
12. Reload the saved document: groups survive; a hand-edited copy with a
    dangling `groupId` opens and is repaired (load path).
13. No `pageerror`; never a `.cad-error` except the expected anchored /
    mate refusals.

Stop the Vite server afterwards and confirm nothing listens on its port.

## 9. Constraints and process rules

- No commit. Stay in `src/features/sketchstudio/cad/`,
  `src/features/sketchstudio/utils/sketchDocumentUtils.js` (load repair only),
  `scripts/`, `docs/`.
- Keep each file's line endings (`model.js`, `movement.js` CRLF; the rest
  LF). Prettier style (2 spaces, single quotes, 120 columns).
- Never touch the kernel's placement maths. Groups must be invisible to
  `kernel.js` (it may receive the keys; it must not read them).
- `npm run lint` 0 errors; full `npm test` green from the repo root; report
  baseline and final counts. Known flaky: the 5 s
  `CadWorkspace.place.dom.test.jsx` hardware test under full-suite load;
  rerun it alone before calling it a regression.
- Do not rebuild sketch constraints, touch the 2D studio's grouping, or the
  floor-plan preview.
- Flag every judgment call with `file:line` anchors in §10. If a §3 decision
  turns out wrong in the running app, say so there and do the better thing.

## 10. Outcome (builder fills in)

Built 2026-11-07 by Opus 5.5 (effort high) in the §5 order. Not committed.
Anchors are `file:line` in the working copy as left (cad paths relative to
`src/features/sketchstudio/cad/`). `git diff` against the index also shows
older unstaged work in the same files (X-ray mode etc.); only the items below
are this build.

### 10.1 Files

| file                                          | what                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups.js` (new, LF)                         | §4.1 API: `nodeParent`, `ancestors`, `contains`, `isGroupId`, `isNode`, `memberIds`, `topNode`, `childNodes`, `treeRows`, `nextGroupName`, `groupNodes`, `ungroupNodes`, `anchoring` + `anchoredMessage`, `rigidMovers`, `attachmentRoot`, `duplicateNodes`, `groupKeyAction`, `GROUP_COPY`; re-exports `pruneGroups`                                                                                                                                                                                                                                                                                                |
| `model.js` (CRLF kept)                        | `emptyModel().groups = []` (`:24-27`), `'groups'` in the list/unique-id loop (`:63`), `validateGroups` (`:121`, called `:94`), `pruneGroups` (`:153`), `removeInstance` ends in `pruneGroups` (`:220`)                                                                                                                                                                                                                                                                                                                                                                                                               |
| `movement.js` (CRLF kept)                     | `turnInstances` (`:103`), `rotateInstancesAbout` (`:121`), `shiftedPosition` (`:184`, the old per-axis maths of `translateInstance`, now shared), `translateInstances` (`:196`); `turnInstance` / `translateInstance` keep their behaviour and refusal                                                                                                                                                                                                                                                                                                                                                               |
| `marks.js`                                    | `pendingDelta` (`:51`, the root rule, shared with the viewport), `modelPoses` uses it (`:68`), `markSnapPoints` `exclude` accepts a `Set` (`:184`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `mate.js`                                     | `mateNodes` (`:55`); `mateInstance` unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `CadWorkspace.jsx`                            | selection state + derivations (`:242-298`), anchoring / movers / bounds (`:390-414`), `placeable` group branch (`:455`), `turnSelected` group branch (`:474`), `groupKeyAction` before `placementKeyAction` (`:513`), select / toggle / pick / group / ungroup / select-all / hide / duplicate / remove / rename / Move by (`:557-662`), group mate (`:1044-1090`), `cancelMate` (`:1169`), group rename (`:1192`), ribbon Duplicate / Group / Ungroup / Hide (`:1473-1513`), tree (`:1878`), flips (`:2144`), Local disabled (`:2242`), viewport props (`:2345-2383`), banner (`:2428`), group panel (`:3243-3365`) |
| `CadViewport.jsx`                             | props `selectedIds` / `movingKey` (`:78`, `:139-144`), `getBounds(ids)` (`:158`), `cadGizmo().moving / movingIds` (`:383`), multi-group drag (`:874-923`, `moveGroups` `:2228`, `unionBox` `:2236`), per-member rotate ghosts (`createRotateFeedback` `:2127`), dblclick → open (`selectDouble` `:1409`), modifier click → toggle (`:1576-1581`), group picked pivot (`pickPivot` `:1591`), pose effect with `pendingDelta`, member look / isolate (`:1772-1814`), attach effect (`:1875-1913`); `placementDelta` and `IDENTITY` removed                                                                             |
| `exports.js`                                  | `groupsReadme` (`:89`) + `## Groups` after `## Instances` in the workshop ZIP's `ASSEMBLY.md`, its README (`:154`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `cad.css` (CRLF kept)                         | §4.8 rules (`:1197-1278`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `../utils/sketchDocumentUtils.js` (CRLF kept) | load repair (`:133`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| tests (new)                                   | `groups.test.js` (17), `groups.kernel.test.js` (2), `CadWorkspace.groups.dom.test.jsx` (5), `CadViewport.groups.dom.test.jsx` (5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| tests (changed)                               | `model.test.js` +3, `movement.test.js` +2 (CRLF kept), `marks.test.js` +1 and one changed expectation (§10.4 item 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `scripts/verify-cad-groups.mjs` (new)         | §8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 10.2 Tests and lint (repo root)

|                            | test files                           | tests                                  | lint                  |
| -------------------------- | ------------------------------------ | -------------------------------------- | --------------------- |
| baseline (before any edit) | 440: 438 passed, 1 failed, 1 skipped | 5362: 5359 passed, 2 failed, 1 skipped | 0 errors, 42 warnings |
| final                      | 444: 442 passed, 1 failed, 1 skipped | 5397: 5394 passed, 2 failed, 1 skipped | 0 errors, 42 warnings |

Both runs' two failures are the known flake: the 5 s timeouts of the two
`Hardware: …` tests in `CadWorkspace.place.dom.test.jsx` under full-suite
load. That file run alone passes 32/32, before and after. +35 tests = the 29
new-file tests above + 3 + 2 + 1. `scripts/verify-cad-groups.mjs` also lints
clean (`npx eslint`); `npm run lint` covers `src/` only.

### 10.3 Verification (`scripts/verify-cad-groups.mjs`)

`CAD_VERIFY_URL=http://localhost:5180/sketch node scripts/verify-cad-groups.mjs`,
Chrome headless, 1600 × 1000, against `npx vite --port 5180 --strictPort`
(stopped afterwards; nothing listens on 5180). Artifacts in
`artifacts/sketch-cad/groups/` (`01-grouped`, `02-inside-group`,
`03-isolated`, `04-anchored`, `05-mated`, `verification.json`). 21 checks, all
**pass**, none skipped:

1. §8.1 cabinet built, 10 instances; poses read from the saved model (left
   Side 0,0,0; right Side 800,500,0; Top 18,0,1782).
2. §8.2 left Side clicked in the left view, Shift+click the right Side (right
   view) and the Top (top view): three selected tree rows, "3 parts selected".
3. §8.3 Ctrl+G: tree row "Group 1" with 3 member rows; saved model has one
   group and three `groupId`s.
4. §8.5 setup: the cabinet has no connections, so the Stiffener is fixed to the
   Top through Connections → JSON (offset `['=0-t', 0, '=t-height']`), and it
   stays where it was (±0.01 mm).
5. §8.4 a click on the Top selects the group (heading "Group").
6. §8.5 mid-drag on the gizmo X arrow: the three members moved by one delta
   (238, 0, 0) on screen; the seven other parts did not move.
7. §8.4 typed 200 + Enter: saved X of the three members grew by exactly 200
   (`'=t'` → `'=(t)+(200)'`, `'=width'` → `'=(width)+(200)'`), every other
   saved position unchanged, rebuilt boxes +200 (±0.01 mm).
8. §8.5 sampled one frame after Enter while the status read "Rebuilding
   solids…": the members and the Stiffener fixed to the Top already sat at
   +200; the largest displayed change when the rebuild landed was 0 mm.
9. §8.4 one Undo reverts all three; the group stays.
10. §8.6 `]`: displayed union centre (400, 250, 900) before and after; XY
    extent 902.15 × 690.018 mm = the 15° turn of the 800 × 500 footprint
    (expected 902.15 × 690.018); rotations Z 15, −165, 15.
11. §8.7 double-click on the Top: banner "Inside Group 1 · Close (Esc)",
    Properties heading "Top", its feature list in the tree.
12. §4.8 the view toolbar stays 42.94 px high with the banner shown (the banner
    sits over the view at 689, 221, 173 × 29 px, clear of the view cube).
13. §8.7 Esc: banner gone, the group selected.
14. §8.8 Hide writes `visible: false` on the three members (and the viewport
    hides only them); Show restores; Isolate shows only the three.
15. §8.9 Duplicate (ribbon "Duplicate instance"): 13 instances, 6 grouped, 2
    groups ("Group 1 copy"), copies +100 mm in X (evaluated), the copy group
    selected.
16. §8.9 Ctrl+Shift+G on the copy: its three parts top level, still selected
    ("3 parts selected", three selected rows).
17. §8.10 the left Side fixed to the Plinth (member `from`, outside `to`): the
    panel's Move and Flip Horizontal disabled, no gizmo attached, hint "Side
    is attached to Plinth outside this group. Group them together or edit
    Connections / welds."
18. §8.11 Mate faces, front view: Top's front face, then (refused: "Pick a face
    on a part outside this group.") the left Side's front face, then the
    Plinth's front face: largest pairwise distance change between the three
    members 0 mm (evaluated saved positions); the outside parts unmoved.
19. §8.12 reload: the group survives (same id) in the saved model and the tree.
20. §8.12 a recovery copy hand-edited so the Plinth names `group-deleted-by-hand`
    opens; the Plinth's `groupId` is gone, Group 1 kept, no `.cad-error`.
21. §8.13 no `pageerror`; the only `.cad-error` seen was the expected mate
    refusal.

### 10.4 Judgment calls and deviations

1. **The open-group banner sits over the view, not in the toolbar**
   (`CadWorkspace.jsx:2428`, `cad.css:1230`). Built as specified at the
   toolbar's start, the verify run measured the toolbar going from 42.94 px to
   76.88 px at 1600 px with nothing else on ("Split drawing" wrapped). The
   chip copy cannot shrink to the ~100 px left, so it is an absolutely placed
   chip at the view's top centre (clear of the preview badge top-left and the
   view cube top-right). Same copy, class, aria-label and click.
2. **Load repair runs before validation too** (`sketchDocumentUtils.js:133`):
   `pruneGroups(… normalizeModel(pruneGroups(source.model)))`. Appending it
   after `normalizeModel` (§3.1) would never run on a dangling `groupId`:
   `normalizeModel` refuses it first. `pruneGroups` therefore accepts raw
   saves (a missing `groups` list counts as empty, `model.js:153`).
3. **A single-id selection is not filtered** (`CadWorkspace.jsx:266-273`):
   only multi-selections drop ids that no longer exist. A part added in a
   commit is selected in the same event (existing DOM tests read the viewport
   `selectedId` before the parent re-renders), and a stale single id matches
   nothing, as `selectedId` always did. A single stale group id therefore shows
   as an unmatched `selectedId`, which is harmless (no part, no gizmo).
4. **The `setSelectedId` shim also opens the node's parent group**
   (`CadWorkspace.jsx:289`), like `select`, so tool call sites (operations,
   cancel, starter models) land inside a group.
5. **`pruneGroups` lives in `model.js`** and `groups.js` re-exports it (the
   §4.2 option), so `model.js` never imports `groups.js`.
6. **One existing expectation changed** (`marks.test.js:437`): "reads poses
   from the committed model for the Marks panel" expected an attached part to
   wait for the rebuild ([11, 0, 0]); under the §3.5 root rule it rides its
   root's pending delta ([110, 1, 0]).
7. **`onSelect` keeps its one-argument call for a plain click**
   (`CadViewport.jsx:1576-1581`): `onSelect(id)`, and `onSelect(id, { toggle:
true })` only with Shift / Ctrl / Cmd (an existing test asserts
   `toHaveBeenCalledWith('board')`). The workspace handler treats both alike.
8. **Double-click opens only after a click that reached the selection**
   (`ctx.selectClick`, `CadViewport.jsx:1410`, `:1576`), so a double-click on
   the gizmo (its pointer-ups are consumed) never opens a group. It also stays
   out while placing, sketching, measuring, in hole mode or picking a pivot.
9. **The picked pivot's anchor member** (`CadViewport.jsx:1890`) is the first
   member in model order whose `attachmentRoot` is itself (free), not just the
   first mover: a concentric mover's own pose is not its world pose.
10. **Group / Ungroup keys wait while a tool runs and ignore key repeat**
    (`groups.js:291`), like the ribbon, which is disabled then.
11. **Ungroup selects the dissolved groups' children only** (§3.4); other
    nodes of a mixed selection drop out of it.
12. **The anchored group's "Move part" toolbar toggle is not disabled**,
    exactly as for a single attached part today: the gizmo is not attached,
    and the panel's Move, Flip Horizontal / Vertical and the X / Y / Z 90°
    buttons are disabled with the hint as their title. §8.10 checks those.
13. **Align copy**: "Aligned parts re-align along their connection's world axis
    after turning." (`CadWorkspace.jsx:3287`), shown only when a mover has an
    `align` or reference-free `face-offset` connection; the axis is the
    connection's, not always Z.
14. **README `## Groups`** (`exports.js:89`) lists each group's direct
    instances and child groups (plus its parent), so nesting is recoverable;
    "None." when there are none.
15. **Group mate keeps the Mate panel**: the first pick sets the selection
    directly (`CadWorkspace.jsx:1051`), not through `select`, which would
    close the panel (the single-part path did the same with `setSelectedId`).
16. **Group name** uses `ValueField asText` (live typing, Phase L), the same
    pattern as Part name; an empty name is refused.
17. A part attached _to_ a member from outside the group (here the Stiffener)
    does not move on screen during the drag (only members' groups do, §3.5);
    it follows on release through the root rule, as §8 check 8 shows.

Nothing in §3 / §4 was left out. `kernel.js` was not touched; the kernel
receives `groups` / `groupId` and never reads them.

## 11. Follow-ups (not this build)

- Marquee (box) selection in the viewport.
- Dim everything outside an open group, SketchUp style.
- Group axes: a stored group frame so Local rotation and a "group position"
  field make sense.
- "Assembly sheet from group" (`sheet.instanceIds` already exists) and
  sub-assembly rows in the parts list / workshop ZIP.
- Skip the kernel rebuild for non-geometric edits (rename, group, marks):
  key `useCadModel` on a geometry signature.
