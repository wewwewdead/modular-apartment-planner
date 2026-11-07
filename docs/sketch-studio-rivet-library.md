# Phase O — Rivet library: 15 industrial rivet kinds, set / as-supplied states

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-11-07 by Fable after reading
the Phase J/M/N hardware code and researching the rivet standards (sources in
§13); to be built by Opus 5.5; audited by Fable against this document. It
extends the Hardware library of Phase J (`docs/sketch-studio-cut-placement.md`
§3.4), Phase M (`docs/sketch-studio-hardware-holes.md`) and Phase N
(`docs/sketch-studio-screw-library.md`), whose engine, rules and vocabulary
apply unchanged unless this document says otherwise. Read the Phase N spec
first: this phase is built the same way (catalog tables → rules → one revolved
profile per kind → panel choices → BOM note), reusing its helpers.

## 1. The problem, in the user's words

> On the Sketch Studio 3D workshop, can you add rivets there? Like pop rivets,
> blind rivets etc — all kinds of industrial rivets. Do research of it to know
> what kind of rivets, then add it to the hardware library.

Today the Hardware library has no rivet at all except the Phase J "Rivet nut"
(`rivet-nut`), which is a PEM-style flanged bush that extends **+Z** above the
seating plane like a nut (`hardwareGeometry.js` 26–31) — it never models the
blind side. Verified in the code (all `w/lf`, see §11):

| What                                                                                                                                                                                                                                                                                                                                                                        | Where                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `SCREW_KINDS` (22 kinds, `kindOf(label, standard, catalog, heads, drives, points, length, sizes?)`), `HARDWARE_TYPES` = nine Phase J kinds + the 22 screw labels (31 entries), `HARDWARE_GROUPS` (six optgroups)                                                                                                                                                            | `hardware.js` 28–224                           |
| `HEAD_STYLES { key: { label, flush } }` (19 keys), `DRIVES`, `POINTS`, `SIZE_CATALOGS` (metric / tapping / wood / drywall / lag), `catalogOf`, `sizesFor`, `headsFor`, `pointsFor`, `drivesFor`, `defaultSize`, `validSize`, `threadFor`                                                                                                                                    | `hardware.js` 226–303                          |
| `row(kind, size, d, rule)` — the standard's row or the proportional rule flagged `estimated`; `shapeFor` per kind; `screwDefaults`; `resolveHardware` (fills head/drive/point for old saves); `withHead` / `withDrive` / `withPoint` (re-derive only dependent keys)                                                                                                        | `hardware.js` 305–571                          |
| `screwUses` → `SCREW_FIELD_ORDER` filter; `screwDimensions` validation sentences; `hardwareDefaults` (screw branch, then the Phase J branch); `hardwareDimensions` dispatch; `hardwareFieldLabels`; `screwNote` / `hardwareNote`; `createHardware` names the part `${HARDWARE_TYPES[kind]} ${size}`                                                                         | `hardware.js` 573–825                          |
| `SCREW_TABLES` built by `table(sizes, columns)`; `round1`, `round2`; the non-metric thread catalogs                                                                                                                                                                                                                                                                         | `hardwareCatalog.js`                           |
| `screwGeometry.js` exports `revolveProfile`, `domeArc`, `dome`, `arcPoints`, `panRim`, `hexPrism`, `starPrism`; `headProfile` (switch on `v.head`), `shankSteps`, `cutDrive`; seating plane Z = 0, heads above, shank into −Z, flush rims at Z = 0                                                                                                                          | `screwGeometry.js`                             |
| `hardwareGeometry.js` dispatches `SCREW_KINDS` first, then the Phase J nine                                                                                                                                                                                                                                                                                                 | `hardwareGeometry.js` 5–8                      |
| `HardwarePanel.jsx`: `Choice` select (applies at once), `HardwareFields` (Head style / Drive / Point selects only where > 1 option; `ValueField` keyed `${feature.id}-${key}`), `HardwarePanel` (`changeKind` with `lastSizes` per catalog, `changeSize` re-applies head/drive/point)                                                                                       | `HardwarePanel.jsx`                            |
| `hardwareName` = `${HARDWARE_TYPES[kind]} ${size}` (HUD); `hardwareRadius` = max(headDiameter, bodyDiameter, diameter) / 2 (rings, ghost), 5 when sizes do not resolve                                                                                                                                                                                                      | `placementHardware.js` 54–55, 296–303          |
| kernel: `case 'hardware'` → `hardwareGeometry`; concentric axis `[0, 0, −1]` for hardware                                                                                                                                                                                                                                                                                   | `kernel.js` 214–215, 488 (CRLF — do not touch) |
| BOM note from `hardwareNote`                                                                                                                                                                                                                                                                                                                                                | `fabrication.js` 41                            |
| Tests pinning the counts: `Object.keys(HARDWARE_TYPES)` length **31**, six group labels (`screwCatalog.test.js` 77–96); 31 options in the type select (`HardwarePanel.dom.test.jsx` 44); the "builds each hardware family" test builds every `HARDWARE_TYPES` kind in one kernel session, 5 s default timeout, 3.7–4.7 s under load at 31 kinds (`hardware.test.js` 87–104) | tests                                          |
| `MaterialSelect` built-ins include `Aluminum`, `Steel`, `Stainless steel`, `Nylon`                                                                                                                                                                                                                                                                                          | `MaterialSelect.jsx` 5–34                      |
| Baseline 2026-11-07 (before this phase): cad **51 files / 585 tests**, all passing (32 s)                                                                                                                                                                                                                                                                                   | `npx vitest run src/features/sketchstudio/cad` |

Siblings read for this spec (the research-the-area rule): the Phase N screw
pipeline (tables → rules → profile), the Phase M Place/pick/Seat machine
(unchanged here), the Phase J rivet-nut geometry (kept as is), the BOM note
path, and the drawing/sheet path (no change needed: a rivet is a solid like a
screw).

**What a rivet is, for this library.** Unlike a screw, a rivet has two shapes:
_as supplied_ (the body with its mandrel / pin / plain tail) and _installed_
(the near-side head on the sheet, the body in the hole across a **grip**
thickness, and a formed **blind-side upset** — a bulb, a shop head, a rolled
lip, folded petals, a swaged collar). The installed shape is what an assembly
needs; the as-supplied shape is what a catalog shows. Both are modelled, one
`state` field apart.

## 2. Principles

1. **A rivet is kind × head × state (× body shape for rivet nuts/studs), in
   the one `hardware` feature.** `kind` stays the family key (`HARDWARE_TYPES`
   grows from 31 to **46**); `head` reuses the Phase N field with seven new
   `HEAD_STYLES` keys; `state` (`'set'` | `'unset'`) and `body` (`'round'` |
   `'hex'`, rivet nuts and studs only) are new optional string fields;
   `grip` and the blind-side sizes are new optional numeric fields (§6).
   Rivets have no drive and no point (`drivesFor` → `[]`, `pointsFor` → `[]`).
2. **Defaults come from the standard where one exists** (ISO 15977–15984 /
   DIN 7337 blind rivets, ISO 15973–15976 closed end, DIN 660 / 661 / 662 /
   674 / 124 / 302 solid rivets, DIN 7338 semi-tubular, DIN 7340 tubular,
   MS20470 / MS20426 aircraft heads), per size, from §3–§4 (cited in §13),
   rounded to 2 decimals; a size outside the table uses the kind's proportional
   rule and is flagged `estimated` like Phase N. Kinds with **no published
   table** (structural, drive, peel, multi-grip, split, self-piercing,
   lockbolt, push rivet, rivet nut / stud) use manufacturer-typical
   proportional rules and say so in the BOM note (`tabled: false`). Everything
   stays an editable **schematic envelope**: no helical threads, no grooves,
   no knurls, no petal curl, no clinching deformation of the sheet; the upset
   is a solid of revolution (or one prism for petals / legs).
3. **The seating-plane contract is unchanged.** Z = 0 is the near-side sheet
   face; protruding heads sit above it (top at `headHeight`, plus the dome of
   a raised countersunk head, plus a stud's thread, plus a raised pin when
   `unset`); flush heads have their rim at Z = 0 and the cone below; the body
   runs into −Z. `kernel.js`, every connection rule and the Phase M Place /
   pick / Seat machine stay untouched. The `grip` is measured from Z = 0 down;
   the upset starts at Z = −grip.
4. **The 31 existing kinds do not change.** Same keys, labels, defaults,
   geometry code paths, BOM notes, part names, panel labels (the Phase J
   `rivet-nut` included — the new `blind-rivet-nut` is the real blind-side
   one; the doc says which is which). Every Phase J–N script and test keeps
   passing; the only permitted edits to existing tests are the count
   updates listed in §10 and an explicit timeout on the family-build test.
5. **Nothing new is persisted structurally.** New fields are optional
   properties of the feature; `CAD_VERSION` stays 1; a saved rivet without
   `state` resolves `'set'`; `hardwareRadius`, `hardwareName`, the BOM
   quantity logic are reused as is.
6. **Cost rule: one revolve per rivet, at most two Booleans.** Every head +
   body + upset is ONE closed (r, z) half profile revolved once (the Phase N
   `revolveProfile`); hollow bodies are profiles that do not touch the axis
   (revolve of an offset closed polygon = a ring solid, no bore cut). The
   extras: the broken-mandrel recess (one cut, or in-profile via the sphere
   formula — Opus's choice), the as-supplied mandrel (one fused cylinder +
   mandrel head), peel petals (one 4-arm prism fused), split legs (one box
   fused when set, one slot box cut when unset), hex rivet-nut body (one hex
   prism fused + one bore cut). Torus arcs stay out of profiles (Phase N
   rule): domes are spherical caps (`domeArc`), the pan rim uses `panRim`.

Rejected alternatives (do not build):

- A separate "Rivets" panel or feature type — the hardware feature, its
  placement tool and its BOM path already do everything.
- A grip-range lookup that picks the body length for the user — the grip
  tables differ per manufacturer; §3 lists the ISO 15977 ranges in the doc for
  reference, the fields stay editable, and validation only checks that the
  upset fits (§6).
- Modelling the sheets' deformation, the mandrel's grooves, knurled tubular
  heads, or the far-side countersink.
- Changing the Phase J `rivet-nut` to the rivet convention — it would break
  the byte-identical Phase J contract; it stays and is documented as the
  PEM-style bush.

## 3. The 15 rivet kinds — `RIVET_KINDS` (in this order, after the 22 screws)

| #   | key                | label (`HARDWARE_TYPES`)                | standard string                              | catalog · sizes                         | heads (first = default)                                                             | default material |
| --- | ------------------ | --------------------------------------- | -------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- | ---------------- |
| 1   | `blind-open`       | Blind rivet, open end (pop rivet)       | ISO 15977–15984 / DIN 7337                   | `blind` · all 8                         | `dome`, `countersunk-120`, `large-flange`                                           | Aluminum         |
| 2   | `blind-closed`     | Blind rivet, closed end (sealed)        | ISO 15973–15976 / ISO 16585                  | `blind` · 3.2, 4.0, 4.8, 6.4            | `dome`, `countersunk-120`                                                           | Aluminum         |
| 3   | `blind-multigrip`  | Blind rivet, multi-grip                 | ISO 15977 type, multi-grip (manufacturer)    | `blind` · 3.2, 4.0, 4.8, 6.4            | `dome`, `large-flange`, `countersunk-120`                                           | Aluminum         |
| 4   | `blind-peel`       | Blind rivet, peel type                  | manufacturer (POP / Gesipa peel)             | `blind` · 3.2, 4.0, 4.8, 6.4            | `dome`, `large-flange`                                                              | Aluminum         |
| 5   | `blind-structural` | Structural blind rivet (locked mandrel) | manufacturer (Monobolt / Magna-Lok / Hemlok) | `structural` · 4.8, 6.4, 9.5, 12.7      | `dome`, `countersunk-120`                                                           | Steel            |
| 6   | `blind-drive`      | Hammer drive rivet (pin rivet)          | manufacturer (drive / pin rivet tables)      | `blind` · 3.2, 4.0, 4.8, 6.4            | `dome`                                                                              | Aluminum         |
| 7   | `solid`            | Solid rivet                             | DIN 660 / 661 / 662 / 674 (ISO 1051)         | `solid` · all 14                        | `round`, `countersunk`, `raised-countersunk`, `pan`, `universal`, `countersunk-100` | Steel            |
| 8   | `semi-tubular`     | Semi-tubular rivet                      | DIN 7338                                     | `tube` · 3, 4, 5, 6, 8, 10              | `flat`, `truss`                                                                     | Steel            |
| 9   | `tubular`          | Tubular rivet                           | DIN 7340                                     | `tube` · all 8                          | `flat`, `round`                                                                     | Brass            |
| 10  | `split`            | Split (bifurcated) rivet                | manufacturer (gauge tables)                  | `solid` · 2, 2.5, 3, 4, 5               | `round`, `countersunk`                                                              | Steel            |
| 11  | `self-piercing`    | Self-piercing rivet (SPR)               | manufacturer (Henrob / Böllhoff)             | `spr` · 3.3, 5.3                        | `countersunk`, `flat`                                                               | Steel            |
| 12  | `blind-rivet-nut`  | Blind rivet nut (rivnut)                | manufacturer (PEM / Böllhoff tables)         | `metric` · M3, M4, M5, M6, M8, M10, M12 | `flat`, `reduced`, `countersunk`; body `round` / `hex`                              | Steel            |
| 13  | `blind-rivet-stud` | Blind rivet stud                        | manufacturer (rivet stud tables)             | `metric` · M4, M5, M6, M8               | `flat`, `reduced`; body `round` / `hex`                                             | Steel            |
| 14  | `lockbolt`         | Lockbolt (pin + swaged collar)          | manufacturer (Huck C6L / Magna-Grip)         | `structural` · all 5                    | `dome`, `countersunk-100`                                                           | Steel            |
| 15  | `push-rivet`       | Plastic push rivet (panel clip)         | manufacturer (trim-panel rivets)             | `push` · 5, 6, 6.3, 8, 10               | `flat`                                                                              | Nylon            |

Named in the doc as **not modelled** (do not build): grooved rivets (expand in
the hole, no visible upset — a plain blind rivet stands in), explosive and
friction-lock aerospace rivets, Cherry-type bulbed aerospace rivets (use
`blind-structural`), pull-through / T-rivets, huck-type collar variants beyond
the one flange, rivet washers and backing plates, hollow-wall anchors,
hot-driven structural rivets ≥ 20 mm beyond the 16 mm row.

New `HARDWARE_GROUPS` optgroups appended after "Special" (6 → **9**):

- **Blind rivets**: `blind-open`, `blind-closed`, `blind-multigrip`,
  `blind-peel`, `blind-structural`, `blind-drive`
- **Solid, tubular & special rivets**: `solid`, `semi-tubular`, `tubular`,
  `split`, `self-piercing`, `lockbolt`, `push-rivet`
- **Blind rivet nuts & studs**: `blind-rivet-nut`, `blind-rivet-stud`

### 3.1 Blind rivets — per-size defaults (mm)

`blind` catalog keys and diameters: `2.4`, `3.0`, `3.2`, `4.0`, `4.8`, `5.0`,
`6.0`, `6.4` (no pitch). Columns: `domeDk`/`domeK` (ISO 15977 protruding
head, mid of DIN 7337 A min/max), `cskDk`/`cskK` (120° countersunk, ISO
15978 / DIN 7337 B), `lfDk`/`lfK` (large flange, manufacturer nominal), `dm`
(mandrel Ø, ISO 15977 d1), `l` (default body length from the standard length
series 6/8/10/12/16/20/25/30), `g` (default grip = mid of the ISO 15977 grip
range for that length), `ml` (mandrel protrusion above the head, as supplied).

**`blind-open`** (all 8 sizes; `tabled: true`)

| size | domeDk | domeK | cskDk | cskK | lfDk | lfK | dm   | l   | g   | ml  |
| ---- | ------ | ----- | ----- | ---- | ---- | --- | ---- | --- | --- | --- |
| 2.4  | 4.8    | 0.8   | 4.8   | 0.55 | 7.0  | 1.0 | 1.55 | 6   | 2   | 27  |
| 3.0  | 6.0    | 1.0   | 6.0   | 0.9  | 9.0  | 1.1 | 2.0  | 8   | 4   | 27  |
| 3.2  | 6.5    | 1.0   | 6.0   | 0.9  | 9.5  | 1.2 | 2.0  | 8   | 4   | 27  |
| 4.0  | 8.0    | 1.3   | 7.5   | 1.0  | 12.0 | 1.5 | 2.45 | 10  | 5   | 27  |
| 4.8  | 9.5    | 1.5   | 9.0   | 1.2  | 16.0 | 1.9 | 2.95 | 10  | 5   | 27  |
| 5.0  | 9.5    | 1.6   | 9.0   | 1.2  | 16.0 | 1.9 | 2.95 | 10  | 5   | 27  |
| 6.0  | 12.0   | 2.0   | 11.0  | 1.5  | 18.0 | 2.3 | 3.5  | 12  | 4.5 | 30  |
| 6.4  | 13.0   | 2.2   | 12.0  | 1.6  | 19.0 | 2.5 | 3.9  | 12  | 4.5 | 30  |

Rule for the blind family (bulb, every size): `bulbDiameter` = 1.5·d,
`bulbHeight` = 0.65·d (round2). Reference, for the doc only (ISO 15977 grip
ranges by body length): 3.2 → 6: 1–3, 8: 3–5, 10: 5–6.5, 12: 6.5–8.5, 16:
8.5–12.5, 20: 12.5–16.5, 25: 16.5–21; 4.0 and 4.8 → 6: 1.5–2.5, 8: 2.5–4, 10:
4–6, 12: 6–8, 16: 8–12, 20: 12–15, 25: 15–20, 30: 20–25; 6.4 → 12: 3–6, 16:
6–10, 20: 10–14, 25: 14–18, 30: 18–23.

**`blind-closed`** (3.2, 4.0, 4.8, 6.4; `tabled: true`): the same `domeDk`,
`domeK`, `cskDk`, `cskK`, `dm` rows as `blind-open`; `l` = 8, 9.5, 11, 14;
`g` = 2.5, 4, 4.5, 6; `ml` as above. The tail is closed: the body end is a
spherical cap of height 0.3·d (derived, no field) in both states.

**`blind-multigrip`** (3.2, 4.0, 4.8, 6.4; `tabled: false` — the heads copy
the `blind-open` rows, the lengths are manufacturer-typical): `l` = 9.5, 11,
13, 16; `g` = 4, 4.5, 5, 7; `ml` as above; bulb rule `bulbDiameter` = 1.45·d,
`bulbHeight` = 1.1·d (two lobes, §4).

**`blind-peel`** (3.2, 4.0, 4.8, 6.4; `tabled: false`): heads copy the
`blind-open` `dome` and `large-flange` rows; `dm` as above; `l` = 9, 12, 15,
18; `g` = 2, 3, 4, 5; `ml` as above; petals: `bulbDiameter` (petal span) =
2.8·d, `bulbHeight` (petal thickness) = max(0.4, 0.15·d).

**`blind-structural`** (`structural` catalog restricted to 4.8, 6.4, 9.5,
12.7; `tabled: false`; rules: `domeDk` = 2.1·d, `domeK` = 0.45·d, `cskDk` =
1.97·d, `cskK` = (cskDk − d) / (2·tan 60°), `dm` = 0.62·d, `bulbDiameter` =
1.5·d, `bulbHeight` = 0.7·d, `ml` = 30) with explicit `l` / `g`:

| size | l    | g   |
| ---- | ---- | --- |
| 4.8  | 11   | 4   |
| 6.4  | 14.5 | 5   |
| 9.5  | 20   | 8   |
| 12.7 | 26   | 10  |

**`blind-drive`** (3.2, 4.0, 4.8, 6.4; `tabled: false`; rules `domeDk` =
2·d, `domeK` = 0.43·d, pin `dm` = 0.45·d, flare `bulbDiameter` = 1.3·d, pin
proud when unset `ml` = 0.6·d) with `l` = 6, 8, 10, 12 and `g` = 2.5, 3, 4,
4.5. No `bulbHeight` field: the flare runs from −grip to −length (§4).

### 3.2 Solid, tubular and special rivets (mm)

`solid` catalog keys: `1`, `1.2`, `1.6`, `2`, `2.5`, `3`, `3.5`, `4`, `5`,
`6`, `8`, `10`, `12`, `16`. **`solid`** (`tabled: true`; 10–16 from DIN 124 /
DIN 302 and IS 1929, approximate; values marked `*` are the proportional rule
where the DIN table has no row — stored in the row, not flagged):

| size | round dk (DIN 660) | round k | csk dk (DIN 661 / 302, 90°) | csk k | oval dk (DIN 662) | oval k | oval dome w | pan dk (DIN 674) | pan k |
| ---- | ------------------ | ------- | --------------------------- | ----- | ----------------- | ------ | ----------- | ---------------- | ----- |
| 1    | 1.8                | 0.6     | 1.8                         | 0.4   | 2.0\*             | 0.5\*  | 0.33\*      | 2.25\*           | 0.5\* |
| 1.2  | 2.1                | 0.7     | 2.1                         | 0.45  | 2.4\*             | 0.6\*  | 0.4\*       | 2.7\*            | 0.6\* |
| 1.6  | 2.8                | 1.0     | 2.8                         | 0.6   | 3.2\*             | 0.8\*  | 0.53\*      | 3.6              | 0.8   |
| 2    | 3.5                | 1.2     | 3.5                         | 0.75  | 4.0\*             | 1.0\*  | 0.67\*      | 4.5              | 1.0   |
| 2.5  | 4.4                | 1.5     | 4.4                         | 0.95  | 5.0               | 1.2    | 0.8         | 5.6              | 1.3   |
| 3    | 5.2                | 1.8     | 5.2                         | 1.1   | 6.0               | 1.5    | 1.0         | 6.8              | 1.5   |
| 3.5  | 6.2                | 2.1     | 6.2                         | 1.35  | 7.0\*             | 1.8\*  | 1.17\*      | 7.8              | 1.8   |
| 4    | 7.0                | 2.4     | 7.0                         | 1.5   | 8.0               | 2.1    | 1.4         | 9.0              | 2.0   |
| 5    | 8.8                | 3.0     | 8.8                         | 1.9   | 10.0              | 2.5    | 1.7         | 11.2             | 2.5   |
| 6    | 10.5               | 3.6     | 10.5                        | 2.25  | 12.0              | 3.0    | 2.0         | 13.5             | 3.0   |
| 8    | 14.0               | 4.8     | 14.0                        | 3.0   | 16.0\*            | 4.0\*  | 2.67\*      | 18.0\*           | 4.0\* |
| 10   | 16.0               | 7.0     | 16.0                        | 3.0   | 20.0\*            | 5.0\*  | 3.33\*      | 22.5\*           | 5.0\* |
| 12   | 19.0               | 8.4     | 19.0                        | 3.5   | 24.0\*            | 6.0\*  | 4.0\*       | 27.0\*           | 6.0\* |
| 16   | 25.0               | 11.0    | 25.0                        | 4.5   | 32.0\*            | 8.0\*  | 5.33\*      | 36.0\*           | 8.0\* |

Rules (every size): `universal` dk = 1.9·d, k = 0.425·d (MS20470);
`countersunk-100` dk = 1.8·d, k = 0.336·d (MS20426: (dk − d) / (2·tan 50°));
default `grip` = 1.5·d, `length` = 3·d (the "grip + 1.5·d" shop rule), shop
head `bulbDiameter` = 1.5·d, `bulbHeight` = 0.5·d.

**`semi-tubular`** (DIN 7338, `tube` catalog restricted to 3, 4, 5, 6, 8, 10;
`tabled: true`): `flat` dk = 5.5, 7.5, 9.5, 11.5, 15.5, 18; k = 0.8, 1, 1,
1.2, 1.2, 1.4; `truss` rule dk = 1.9·d, k = 0.4·d; tube bore `boreDiameter`
(d4) = 1.7, 2.7, 3.5, 4.2, 6, 7.5; `boreDepth` (t) = 3.5, 4, 4, 6, 8, 10;
`length` = 6, 8, 10, 12, 16, 20; `grip` = length − 0.6·d (the 55 % clinch
allowance); rolled lip `bulbDiameter` = 1.45·d, `bulbHeight` = 0.3·d.

**`tubular`** (DIN 7340, `tube` catalog: `2`, `2.5`, `3`, `4`, `5`, `6`,
`8`, `10`; `tabled: false`): `flat` (form A) dk = 1.5·d, k = 0.2·d; `round`
(form B, knurl not modelled) dk = 1.5·d, k = 0.4·d; wall 0.1·d →
`boreDiameter` = 0.8·d through the whole length (no `boreDepth` field);
`length` = 5, 6, 8, 10, 12, 15, 20, 25; `grip` = length − 0.6·d; lip rule as
semi-tubular.

**`split`** (`solid` catalog restricted to 2, 2.5, 3, 4, 5; `tabled: false`):
`round` and `countersunk` dk = 1.9·d, k = 0.45·d; `length` = 4·d; `grip` =
length − 1.2·d; legs: slot 0.2·d wide, each leg (d − slot)/2 = 0.4·d thick
(`bulbHeight`), d wide, (length − grip) long, span `bulbDiameter` = 3.4·d.

**`self-piercing`** (`spr` catalog `3.3`, `5.3`; `tabled: false`):
`countersunk` dk = 5.5, 7.75, k = 0.7, 1.05 (sits flush, cone below); `flat`
dk = 1.45·d, k = 0.2·d; `boreDiameter` = 0.55·d, `boreDepth` = 0.6·length;
`length` = 5, 6; `grip` = 0.8·length (the tail stays inside the bottom
sheet); flare `bulbDiameter` = 1.4·d from −0.75·grip to −length (no
`bulbHeight` field).

**`blind-rivet-nut`** (`metric`, sizes M3–M12; `tabled: false`, manufacturer
tables agree to ±1 mm): thread `diameter` and `pitch` from `METRIC_THREADS`;
`boreDiameter` = thread Ø (threads not modelled); `body` = `'round'` (Ø) or
`'hex'` (across flats, same number):

| size | bodyDiameter | flat dk | flat k | reduced dk | reduced k | csk dk | csk k | length | grip |
| ---- | ------------ | ------- | ------ | ---------- | --------- | ------ | ----- | ------ | ---- |
| M3   | 5            | 7       | 0.8    | 6          | 0.5       | 6.5    | 0.75  | 9      | 1.0  |
| M4   | 6            | 9       | 1.0    | 7          | 0.6       | 9      | 1.5   | 11     | 1.5  |
| M5   | 7            | 10      | 1.0    | 8          | 0.6       | 10     | 1.5   | 12.5   | 1.5  |
| M6   | 9            | 13      | 1.5    | 10         | 0.8       | 12     | 1.5   | 14.5   | 2.0  |
| M8   | 11           | 16      | 1.5    | 12         | 1.0       | 14.5   | 1.75  | 17     | 2.5  |
| M10  | 13           | 17      | 1.5    | 14         | 1.0       | 17     | 2.0   | 20     | 3.0  |
| M12  | 16           | 20      | 2.0    | 17         | 1.2       | 20     | 2.0   | 24     | 3.5  |

Bulge rule: `bulbDiameter` = 1.3·bodyDiameter, `bulbHeight` =
0.35·bodyDiameter. (The countersunk head is 90°: k = (dk − body)/2.)

**`blind-rivet-stud`** (`metric`, M4, M5, M6, M8; `tabled: false`): body 6,
7, 9, 11; `flat` dk 9, 10, 13, 16 / k 1, 1, 1.5, 1.5; `reduced` dk 7, 8, 10,
12 / k 0.6, 0.6, 0.8, 1.0; `length` (body below the flange) 8, 9, 11, 13;
`threadLength` (stud above the flange, +Z) 10, 12, 16, 20; `grip` 1.5, 1.5,
2.0, 2.5; stud Ø = thread `diameter`; bulge rule as the nut; `body` round /
hex.

**`lockbolt`** (`structural` catalog `4.8`, `6.4`, `8.0`, `9.5`, `12.7`;
`tabled: false`): `dome` dk = 1.8·d, k = 0.4·d; `countersunk-100` dk = 1.8·d,
k = 0.336·d; pin Ø = d; swaged collar `bulbDiameter` = 1.55·d,
`bulbHeight` (collar height) = 1.2·d, collar flange Ø 2.1·d × 0.3·d thick
(derived, against the sheet); `grip` = 4, 6, 8, 10, 12; `length` (pin under
the head, as supplied, incl. pintail) = grip + 3.7·d.

**`push-rivet`** (`push` catalog keys `5`, `6`, `6.3`, `8`, `10` = panel
hole Ø; `tabled: false`): `flat` head dk = 2.5·d, k = 0.2·d; pin head Ø 1.5·d
× 0.35·d tall on top of the head (derived), pin stem `mandrelDiameter` =
0.5·d; `length` = 2·d; `grip` = 0.4·length; expanded legs `bulbDiameter` =
1.4·d from −grip to −length (no `bulbHeight`); pin raised when unset `ml` =
0.8·d.

## 4. Geometry — `rivetGeometry.js` (new), `rivetGeometry(f, parameters, own)`

Dispatch: `hardwareGeometry.js` gains `if (RIVET_KINDS[f.kind]) return
rivetGeometry(f, parameters, own);` right after the screw line; nothing else
there changes. Import `revolveProfile`, `domeArc`, `arcPoints`, `panRim`,
`hexPrism` from `screwGeometry.js` (all exported; do not edit that file beyond
adding an export if one is missing). Every intermediate shape goes through
`own()`.

### 4.1 Heads — seven new `HEAD_STYLES` keys (+ reused ones)

| key               | label                          | flush | profile (from the axis at the top, outward and down to (d/2, zStart)) |
| ----------------- | ------------------------------ | ----- | --------------------------------------------------------------------- |
| `dome`            | Dome (protruding)              | no    | spherical cap `domeArc(dk, k)` → (d/2, 0)                             |
| `large-flange`    | Large flange                   | no    | the same cap (flatter because dk is larger)                           |
| `countersunk-120` | Countersunk 120° (blind rivet) | yes   | (dk/2, 0) → (d/2, −k); zStart = −k                                    |
| `countersunk-100` | Countersunk 100° (aircraft)    | yes   | same shape, its own k                                                 |
| `universal`       | Universal (MS20470)            | no    | spherical cap                                                         |
| `flat`            | Flat (thin disc)               | no    | (dk/2, k) → (dk/2, 0) → (d/2, 0) (the Phase N `cheese` shape)         |
| `reduced`         | Reduced flange (semi-flush)    | no    | as `flat`                                                             |

Reused as they are, with their Phase N profiles: `round` (DIN 660 snap head),
`pan` (DIN 674 flat-round, `panRim`), `raised-countersunk` (DIN 662 oval: cone
k + dome `domeHeight`, flush), `countersunk` (90°, flush), `truss`. Screw code
never receives the new keys (allowed lists), and `isFlush` keeps working
through `HEAD_STYLES[head].flush`.

### 4.2 Bodies and upsets, per kind and state

Notation: d = `diameter`, L = `length`, g = `grip`, B = `bulbDiameter`, h =
`bulbHeight`, dm = `mandrelDiameter`, ml = `mandrelLength`, k = `headHeight`,
top = the head's top Z (k; `domeHeight` for a raised countersunk head; 0 for
flush heads). "Shank" = cylinder r = d/2 from zStart down.

| kind               | `set` (installed)                                                                                                                                                                                                                                                                                                                                                                                              | `unset` (as supplied)                                                                                                                                                                              | zmin set / unset         | zmax                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------- |
| `blind-open`       | shank 0 → −g; bulb: (d/2, −g) → (B/2, −g − 0.3h) → (B/2, −g − 0.7h) → (d/2, −g − h) → (0, −g − h) (4 lines; a barrel, not a torus); broken-mandrel recess Ø dm, 0.4·k deep, in the head top (one cut, or in-profile)                                                                                                                                                                                           | shank 0 → −L, flat end; mandrel: cylinder Ø dm from −(L + 0.6·dm) to top + ml, plus the mandrel head Ø min(d − 0.2, 1.3·dm) × 0.6·dm tall under the body end — fused (two solids, one `fuse` each) | −(g + h) / −(L + 0.6·dm) | top (set) / top + ml (unset) |
| `blind-closed`     | as open, but the body end is a spherical cap (`domeArc(d, 0.3·d)` mirrored downward) on the bulb's bottom instead of the flat (0, −g − h); recess as open                                                                                                                                                                                                                                                      | shank 0 → −L with the cap end; the mandrel stem only (its head is inside the closed cup): Ø dm from −0.5·L to top + ml                                                                             | −(g + h) / −L            | top / top + ml               |
| `blind-multigrip`  | two lobes: (d/2, −g) → (B/2, −g − 0.25h) → (0.55·d, −g − 0.5h) → (B/2, −g − 0.75h) → (d/2, −g − h) → (0, −g − h); recess as open                                                                                                                                                                                                                                                                               | as open                                                                                                                                                                                            | −(g + h) / −(L + 0.6·dm) | top / top + ml               |
| `blind-peel`       | shank 0 → −g − h (the stub), flat end; four petals folded flat against the blind face: ONE 4-arm prism (the Phase N `crossPrism` shape: arm half-width 0.25·d, span B) from Z = −g − h to −g, fused; recess as open                                                                                                                                                                                            | as open (plain body, mandrel)                                                                                                                                                                      | −(g + h) / −(L + 0.6·dm) | top / top + ml               |
| `blind-structural` | as open with h = 0.7·d; the locked pin end is recessed only 0.15·k                                                                                                                                                                                                                                                                                                                                             | as open (pin Ø dm, ml = 30)                                                                                                                                                                        | −(g + h) / −(L + 0.6·dm) | top / top + ml               |
| `blind-drive`      | shank 0 → −g; flare: (d/2, −g) → (B/2, −L) → (0, −L); the pin top is a disc Ø dm standing 0.1 mm proud of the head top (in the profile: start at (0, top + 0.1) → (dm/2, top + 0.1) → (dm/2, z of the dome at r = dm/2) → continue the cap; or a fused cylinder)                                                                                                                                               | straight shank 0 → −L (no flare); pin proud by ml: cylinder Ø dm from top − 0.5·k to top + ml, fused                                                                                               | −L / −L                  | top + 0.1 / top + ml         |
| `solid`            | shank 0 → −g; shop head: (d/2, −g) → (B/2, −g) → (B/2, −g − 0.6h) → (0.6·d, −g − h) → (0, −g − h)                                                                                                                                                                                                                                                                                                              | shank 0 → −L, flat end                                                                                                                                                                             | −(g + h) / −L            | top                          |
| `semi-tubular`     | shank 0 → −g; rolled lip: (d/2, −g) → (B/2, −g) → (B/2, −g − h) → (boreDiameter/2, −g − h) → (boreDiameter/2, −g − 0.5h) → (0, −g − 0.5h) (the lip is a ring; the bore stops inside it)                                                                                                                                                                                                                        | shank 0 → −L; bore Ø `boreDiameter`, `boreDepth` deep from the tail: profile … (d/2, −L) → (bore/2, −L) → (bore/2, −L + boreDepth) → (0, −L + boreDepth)                                           | −(g + h) / −L            | top                          |
| `tubular`          | as semi-tubular; through bore: the profile does not touch the axis (inner edge r = bore/2 from the head top to the lip) — the head is also a ring                                                                                                                                                                                                                                                              | hollow tube with the head, through bore (ring profile)                                                                                                                                             | −(g + h) / −L            | top                          |
| `split`            | shank 0 → −g, flat end; two legs: ONE box X ∈ [−B/2, B/2], Y ∈ [−d/2, d/2], Z ∈ [−g − h, −g], fused                                                                                                                                                                                                                                                                                                            | shank 0 → −L; slot: box X ∈ [−d, d], Y ∈ [−0.1·d, 0.1·d], Z ∈ [−L − 0.01, −0.25·L], cut                                                                                                            | −(g + h) / −L            | top                          |
| `self-piercing`    | shank 0 → −0.75·g; flare (d/2, −0.75·g) → (B/2, −L) → (0, −L) (solid: the flare fills the bore)                                                                                                                                                                                                                                                                                                                | shank 0 → −L with the bore Ø `boreDiameter`, `boreDepth` deep from the tail                                                                                                                        | −L / −L                  | top                          |
| `blind-rivet-nut`  | ring profile (inner edge r = boreDiameter/2 the whole height): flange 0 → k (Ø dk), body Ø `bodyDiameter` 0 → −g, bulge (body/2, −g) → (B/2, −g − 0.3h) → (B/2, −g − 0.7h) → (body/2, −g − h) → (body/2, −L) → (bore/2, −L); `hex`: the revolved profile is flange + bulge + the section below the bulge; the hex prism (AF = bodyDiameter) from −g to 0 is fused; then one bore cut Ø bore through everything | the same without the bulge (straight body to −L); hex: prism −L → 0 then bore cut                                                                                                                  | −L / −L                  | k                            |
| `blind-rivet-stud` | solid profile: (0, k + T) → (d/2, k + T) → (d/2, k) → (dk/2, k) → (dk/2, 0) → (body/2, 0) → bulge as the nut → (body/2, −L) → (0, −L) (T = `threadLength`); hex as the nut without the bore cut                                                                                                                                                                                                                | the same without the bulge                                                                                                                                                                         | −L / −L                  | k + T                        |
| `lockbolt`         | one profile: head → pin (d/2, 0) → (d/2, −g) → collar flange (1.05·B/2 … use F = 2.1·d: (F/2, −g) → (F/2, −g − 0.3·d) → (B/2, −g − 0.3·d) → (B/2, −g − h) → (0, −g − h) (the pintail is broken flush with the collar end)                                                                                                                                                                                      | head + pin to −L (no collar; the note says "collar not shown as supplied")                                                                                                                         | −(g + h) / −L            | top                          |
| `push-rivet`       | one profile: pin head (0, k + 0.35·d) → (0.75·d, k + 0.35·d) → (0.75·d, k) → head (dk/2, k) → (dk/2, 0) → body (d/2, 0) → (d/2, −g) → legs (B/2, −g − 0.3·(L − g)) → (B/2, −L + 0.2·(L − g)) → (d/2, −L) → (0, −L)                                                                                                                                                                                             | pin raised by ml: pin head top at k + 0.35·d + ml with the stem Ø dm visible from k to k + ml; straight legs (d/2, −g) → (d/2, −L)                                                                 | −L / −L                  | k + 0.35·d / k + 0.35·d + ml |

Flush heads (`countersunk`, `countersunk-120`, `countersunk-100`,
`raised-countersunk`): the shank starts at zStart = −k (the cone bottom) and
`grip`, `length` are measured from Z = 0 as for every other kind (so g > k
is required, §6). The recess for a flush head is cut from Z = 0 (its top is
the sheet plane). For a `raised-countersunk` solid rivet the recess does not
apply (solid rivets have none).

Every profile is drawn in the order "axis at the top → head outline → body
→ upset → axis at the bottom" so it is a simple closed polygon; the Phase N
rule applies: no torus arcs (bulbs and lips are polylines, domes are
`domeArc` caps). Reuse `prism`-style helpers from `screwGeometry.js` by
exporting them (`prism`, `crossPrism`, `box`, `cylinder` are module-private
there today — export them rather than copying; that is the one permitted edit
to `screwGeometry.js`).

## 5. Sizes — `SIZE_CATALOGS` additions and `sizesFor`

| catalog      | keys                                                                            | `diameter` | pitch                         | default size |
| ------------ | ------------------------------------------------------------------------------- | ---------- | ----------------------------- | ------------ |
| `blind`      | `2.4`, `3.0`, `3.2`, `4.0`, `4.8`, `5.0`, `6.0`, `6.4`                          | the key    | none (no `pitch` field)       | `4.8`        |
| `solid`      | `1`, `1.2`, `1.6`, `2`, `2.5`, `3`, `3.5`, `4`, `5`, `6`, `8`, `10`, `12`, `16` | the key    | none                          | `4`          |
| `tube`       | `2`, `2.5`, `3`, `4`, `5`, `6`, `8`, `10`                                       | the key    | none                          | `4`          |
| `structural` | `4.8`, `6.4`, `8.0`, `9.5`, `12.7`                                              | the key    | none                          | `6.4`        |
| `spr`        | `3.3`, `5.3`                                                                    | the key    | none                          | `5.3`        |
| `push`       | `5`, `6`, `6.3`, `8`, `10`                                                      | the key    | none                          | `6`          |
| `metric`     | unchanged                                                                       |            | as today (rivet nuts / studs) | `M6`         |

`threadFor(kind, size)` returns `{ diameter, pitch: undefined }` for the
pitch-less catalogs; `hardwareDefaults` omits the `pitch` key for them (no
`pitch: undefined` property — `screwCatalog.test.js` 'strip' style snapshots
must not see a new key on old kinds, and `hardwareNote` must not print
"undefined"). `sizes` restrictions per kind as in §3. `defaultSize(kind)` per
the table; the panel's remembered-size-per-catalog rule (Phase N) applies to
the new catalogs unchanged. `hardwareDefaults(kind, size)` with a size outside
`sizesFor(kind)` falls back to `defaultSize(kind)` (Phase N §5 rule).

## 6. Data, validation, note

New optional fields on the `hardware` feature (absent ⇒ resolved default;
`resolveHardware(feature)` fills them for rivet kinds exactly as it fills
head / drive / point for screws):

| field             | type              | meaning                                                                                                                                                      |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `state`           | `'set'`/`'unset'` | installed (default) / as supplied                                                                                                                            |
| `body`            | `'round'`/`'hex'` | rivet nut and stud body shape (default `'round'`)                                                                                                            |
| `grip`            | mm                | clamped thickness measured from Z = 0 down; the upset starts at −grip                                                                                        |
| `bulbDiameter`    | mm                | blind-side upset Ø: bulb / shop head / rolled lip / petal span / leg span / flare / collar Ø / expanded legs                                                 |
| `bulbHeight`      | mm                | upset height below −grip: bulb / shop head / lip / petal thickness / leg thickness / collar height (absent for `blind-drive`, `self-piercing`, `push-rivet`) |
| `mandrelDiameter` | mm                | mandrel / pin / stem Ø (blind kinds, drive, structural, push rivet)                                                                                          |
| `mandrelLength`   | mm                | mandrel / pin protrusion above the head when `unset`                                                                                                         |
| `boreDepth`       | mm                | tube bore depth from the tail (semi-tubular, self-piercing)                                                                                                  |

Reused fields with rivet meaning: `diameter` = body Ø (thread Ø for rivet
nuts / studs); `length` = body length from Z = 0 to the as-supplied tail
(lockbolt: pin length incl. pintail; stud: body below the flange);
`headDiameter`, `headHeight`, `domeHeight` (oval solid rivet) as Phase N;
`bodyDiameter` = rivet nut / stud body Ø or hex AF; `boreDiameter` = tube
bore / rivet-nut thread bore; `threadLength` = stud length above the flange;
`pitch` only for rivet nuts / studs. Unused fields keep their defaults and are
not shown or validated.

`rivetDimensions(feature, parameters)` (inside `hardwareDimensions`, dispatched
before the Phase J branch) resolves the used fields through `positive(value,
parameters, label)` and validates, in this order, with these sentences:

- headed kinds (every rivet): headDiameter ≤ diameter → "The head must be
  wider than the shank." (rivet nut / stud: headDiameter < bodyDiameter for
  `flat` / `reduced` → "The flange must be at least as wide as the body.";
  `countersunk` → headDiameter ≤ bodyDiameter → "The head must be wider than
  the body."; bodyDiameter ≤ diameter → "The body must be wider than the
  thread.")
- flush heads: headHeight > grip → "The head must not be deeper than the
  grip." (equality is allowed: the M4 / M5 countersunk rivet-nut defaults sit
  at k = grip = 1.5 and must build — the upset then starts right at the cone
  bottom)
- grip ≥ length → "The grip must be shorter than the rivet." (every kind;
  lockbolt: grip + bulbHeight ≥ length → "The pin must reach past the
  collar.")
- kinds with `bulbHeight` and a consumed tail (`blind-open`, `blind-closed`,
  `blind-multigrip`, `blind-structural`, `solid`, `semi-tubular`, `tubular`):
  bulbHeight > length − grip → "The upset must fit in the rivet tail."
- bulbDiameter ≤ diameter (bodyDiameter for nuts / studs) → "The upset must be
  wider than the body."
- mandrelDiameter ≥ diameter → "The mandrel must be narrower than the body."
  (push rivet: "The pin must be narrower than the body.")
- boreDiameter ≥ diameter → "The bore must be smaller than the rivet body.";
  boreDepth ≥ length → "The bore must be shorter than the rivet."
- The Phase N rule "`hardwareDimensions` with parametric expressions
  (`'=w/4'`) in any field evaluates through `positive`" holds for every new
  field.

`hardwareNote(f)` for a rivet kind, in this order, `; `-joined, empty parts
dropped: `${label} ${standard}` · `${size} × ${length} mm` (rivet nut: `${size}
× ${pitch} × ${length} mm`; stud: `${size} × ${pitch}, body ${length} mm, stud
${threadLength} mm`) · `${head label} head` (only when the kind offers > 1
head) · `${body} body` (nut / stud: "round body" / "hexagon body") · `grip
${grip} mm, installed` or `grip ${grip} mm, as supplied` · `mandrel Ø${dm}`
(kinds with a mandrel field; drive / push rivet: `pin Ø${dm}`) · `sizes
outside ${standard} estimated` (when `estimated`, tabled kinds) or
`proportional defaults, no standard table` (tabled: false kinds) · `collar not
shown as supplied` (lockbolt, unset) · `simplified envelope: blind-side upset
schematic, no threads, grooves or knurls` + the existing supplier /
installation / minimum-sheet / notes suffixes verbatim. Numbers through
`shown` (round2). The 31 existing kinds keep today's notes byte for byte.

`createHardware` name stays `${HARDWARE_TYPES[kind]} ${size}` ("Blind rivet,
open end (pop rivet) 4.8", "Solid rivet 4", "Blind rivet nut (rivnut) M6").

`withHead(feature, head)` works for rivet kinds (re-derives `headDiameter`,
`headHeight`, `domeHeight`); new `withState(feature, state)` sets only
`state`; new `withBody(feature, body)` sets only `body`. `withDrive` /
`withPoint` return a rivet feature unchanged.

## 7. The panel (`HardwarePanel.jsx`)

- **Hardware type**: the three new optgroups appended (§3). **Metric size**:
  label unchanged (scripts); options = `sizesFor(kind)` shown as the key
  (`4.8`, `M6`, …).
- **Head style** select as Phase N (only when > 1 head). New **State** select
  (`Choice`, label "State", options `STATES = { set: { label: 'Installed
(set)' }, unset: { label: 'As supplied (unset)' } }`) for every rivet kind;
  new **Body** select (label "Body", `BODIES = { round: { label: 'Round body'
}, hex: { label: 'Hexagon body' } }`) for `blind-rivet-nut` and
  `blind-rivet-stud` only. No Drive / Point selects for rivets.
- `changeSize` keeps the chosen head, state and body across a size change
  (extend the Phase N re-apply chain with `withState` / `withBody`).
- **Fields** (`hardwareFieldLabels`, rivet branch, in this order, only the
  keys the kind/state uses): `length` → "Body length (mm)" (flush heads:
  "Overall length (mm)"; lockbolt: "Pin length (mm)"; stud: "Body length below
  flange (mm)"), `grip` → "Grip / clamped thickness (mm)", `diameter` → "Body
  diameter (mm)" (nut / stud: "Thread diameter (mm)"; push rivet: "Panel hole
  diameter (mm)"), `headDiameter` → "Head diameter (mm)" (`large-flange`:
  "Flange diameter (mm)"; nut / stud: "Flange diameter (mm)"), `headHeight` →
  "Head height (mm)" (nut / stud: "Flange thickness (mm)"), `domeHeight` →
  "Dome height (mm)" (oval solid rivet), `bodyDiameter` → "Body diameter (mm)"
  / "Body across flats (mm)" (hex), `boreDiameter` → "Tube bore diameter
  (mm)" (nut: "Thread bore (mm)"), `boreDepth` → "Tube bore depth (mm)",
  `threadLength` → "Stud length above flange (mm)", `mandrelDiameter` →
  "Mandrel diameter (mm)" (drive / push: "Pin diameter (mm)"),
  `mandrelLength` → "Mandrel protrusion (mm)" (drive / push: "Pin protrusion
  (mm)") **shown only when state = unset**, `bulbDiameter` → "Bulb diameter
  (mm)" (solid: "Shop head diameter (mm)"; semi-tubular / tubular: "Rolled lip
  diameter (mm)"; peel: "Petal span (mm)"; split: "Leg span (mm)"; drive /
  self-piercing: "Flared tail diameter (mm)"; lockbolt: "Collar diameter
  (mm)"; push: "Expanded leg diameter (mm)"; nut / stud: "Bulge diameter
  (mm)"), `bulbHeight` → "Bulb height (mm)" (solid: "Shop head height (mm)";
  lip: "Rolled lip height (mm)"; peel: "Petal thickness (mm)"; split: "Leg
  thickness (mm)"; lockbolt: "Collar height (mm)"; nut / stud: "Bulge height
  (mm)") **shown only when state = set**, `pitch` → "Thread pitch (mm)" (nut
  / stud); then the four supplier fields as today. `ValueField`s keyed
  `${feature.id}-${key}` (Phase L rule — never on the value).
- Help text (first `cad-help` in `HardwareFields`) becomes: "Generic editable
  envelope. Enter supplier dimensions for purchased hardware. Threads, knurls,
  drill flutes, rivet grooves and clinching deformation are not modeled;
  drive recesses and blind-side upsets are schematic." (one sentence added;
  grep the DOM tests for the old text first and update the one assertion if
  any).
- All derived defaults go through `round2`.

## 8. Downstream consumers (touch or confirm each; report each)

| consumer                                                                                    | change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hardwareGeometry.js`                                                                       | one dispatch line for `RIVET_KINDS`; the rest **untouched**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| new `rivetGeometry.js`                                                                      | `rivetGeometry`, `rivetHeadProfile`, per-kind body/upset steps (§4)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `screwGeometry.js`                                                                          | only `export` keywords on `prism`, `crossPrism`, `box`, `cylinder` (if needed)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `hardware.js`                                                                               | `RIVET_KINDS`, `STATES`, `BODIES`, seven `HEAD_STYLES` keys, `SIZE_CATALOGS` + `DEFAULT_SIZES` additions, `catalogOf`/`sizesFor`/`headsFor`/`defaultSize`/`threadFor` aware of rivets, `rivetDefaults`, `resolveHardware`, `withHead` (rivets), `withState`, `withBody`, `rivetUses`, `rivetDimensions`, `hardwareDefaults` (rivet branch before the Phase J branch), `hardwareFieldLabels` (rivet branch), `rivetNote` in `hardwareNote`, `HARDWARE_TYPES` (46), `HARDWARE_GROUPS` (9) |
| `hardwareCatalog.js`                                                                        | `RIVET_TABLES` (§3.1–3.2 rows via `table()`), the six new catalogs                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `HardwarePanel.jsx`                                                                         | §7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `placementHardware.js`, `placementCuts.js`                                                  | confirm unchanged: `hardwareName`, `hardwareRadius` (max of headDiameter / bodyDiameter / diameter — rings the near-side head for every rivet; the blind-side span is deliberately not ringed), HUD text, hints                                                                                                                                                                                                                                                                         |
| `kernel.js`, `model.js`, `CadViewport.jsx`, `cad.css`                                       | unchanged (CRLF files — verify with `git ls-files --eol`)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `fabrication.js` 41, `drawings.js`, `ConnectionEditor.jsx`                                  | unchanged; one test that a sheet with a set blind rivet renders                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `scripts/verify-screw-library.mjs`, `verify-hardware-holes.mjs`, `verify-hole-hardware.mjs` | unchanged and must pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| docs                                                                                        | §10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 9. Errors and edge cases (handle and test)

- A saved rivet feature without `state` / `body` / `grip` / bulb fields loads
  and builds with the kind defaults (`resolveHardware`).
- `hardwareDefaults('blind-open', 'M6')` → size `'4.8'`, no throw;
  `('solid', '4.8')` → `'4'`; `('blind-rivet-nut', 'M2')` → `'M6'`;
  `('lockbolt', '3.2')` → `'6.4'`; `hardwareDefaults()` → today's bolt M3
  object unchanged.
- `grip` ≥ `length` and the other §6 rules: one test per sentence.
- A flush rivet head needs grip ≥ headHeight (the shank starts at −k).
- Rings: `hardwareRadius` of a set `blind-open` 4.8 dome = 4.75; of a
  `lockbolt` 6.4 = 5.76 (head 11.52 / 2, not the collar); of a
  `blind-rivet-nut` M6 flat = 6.5.
- State change in Place (`placement.hardware`) rebuilds the preview (Phase M
  rule — confirm, no new code expected).
- The family-build test (`hardware.test.js` 87) now builds 46 kinds: give it
  an explicit timeout of 20 s (`it(name, fn, 20000)`) — the one permitted edit
  in that file — and report its measured time alone and under the suite.

## 10. Delivery, tests and verification

Order of work (report each as **done / partial / not done**, never silently
drop one):

1. Catalog + rules (`hardware.js` / `hardwareCatalog.js`) with pure unit
   tests (no OCC) — new `rivetCatalog.test.js`.
2. Geometry (`rivetGeometry.js`) with one OCC test building every kind × state
   — new `rivetGeometry.test.js`.
3. Panel + fields + the editor/Place paths; DOM test updates.
4. Downstream confirmations (BOM note, kernel concentric seat of a countersunk
   blind rivet in a hole row, drawings).
5. Docs + browser script. 6. Re-run every browser script.

Tests (Vitest, run from the **repo root**, never from inside `cad/`; measure
and report the baseline file/test counts for `src/features/sketchstudio/cad`
and for `npm test` **before** changing anything, then the final counts;
baseline 2026-11-07 for cad: 51 files / 585 tests):

- Unit, pure — `rivetCatalog.test.js`: `Object.keys(RIVET_KINDS)` is exactly
  the 15 keys of §3 in that order; `Object.keys(HARDWARE_TYPES)` has 46
  entries, the 31 old first and unchanged (snapshot the old entries
  literally); `HARDWARE_GROUPS` has nine labels, the first six unchanged, every
  kind grouped once; `headsFor` per kind as §3; `drivesFor` / `pointsFor` →
  `[]` for every rivet; `sizesFor` per catalog and the restricted kinds;
  `defaultSize` fallbacks of §9; `hardwareDefaults('blind-open', '4.8')` → `{
head: 'dome', state: 'set', headDiameter: 9.5, headHeight: 1.5,
mandrelDiameter: 2.95, length: 10, grip: 5, bulbDiameter: 7.2, bulbHeight:
3.12, mandrelLength: 27 }` and no `pitch` key; `withHead(…, 'countersunk-120')`
  → 9 / 1.2; `withHead(…, 'large-flange')` → 16 / 1.9; `('blind-closed',
'6.4')` → 13 / 2.2 / dm 3.9 / length 14 / grip 6; `('blind-multigrip', '4.8')`
  → length 13, grip 5, bulbHeight 5.28; `('blind-peel', '4.0')` → bulbDiameter
  11.2, bulbHeight 0.6; `('blind-structural', '6.4')` → dk 13.44, k 2.88, dm
  3.97, length 14.5, grip 5, bulbHeight 4.48; `('blind-drive', '4.8')` → dk
  9.6, k 2.06, dm 2.16, length 10, grip 4, bulbDiameter 6.24, no bulbHeight;
  `('solid', '4')` → round 7 / 2.4, grip 6, length 12, bulb 6 / 2;
  `withHead(solid 4, 'countersunk')` → 7 / 1.5; `'raised-countersunk'` → 8 /
  2.1 / domeHeight 1.4; `'pan'` → 9 / 2; `'universal'` → 7.6 / 1.7;
  `'countersunk-100'` → 7.2 / 1.34; `('semi-tubular', '4')` → flat 7.5 / 1,
  bore 2.7, boreDepth 4, length 8, grip 5.6, lip 5.8 / 1.2; `('tubular', '4')`
  → 6 / 0.8, bore 3.2, length 10, grip 7.6; `('split', '3')` → 5.7 / 1.35,
  length 12, grip 8.4, span 10.2, leg 1.2; `('self-piercing', '5.3')` → csk
  7.75 / 1.05, bore 2.92, boreDepth 3.6, length 6, grip 4.8, flare 7.42;
  `('blind-rivet-nut', 'M6')` → body 9, flat 13 / 1.5, bore 6, pitch 1,
  length 14.5, grip 2, bulge 11.7 / 3.15, body `'round'`; `withHead(…,
'countersunk')` → 12 / 1.5; `withBody(…, 'hex')` → body `'hex'`, numbers
  unchanged; `('blind-rivet-stud', 'M6')` → body 9, 13 / 1.5, length 11,
  threadLength 16, grip 2; `('lockbolt', '6.4')` → dk 11.52, k 2.56, collar
  9.92 / 7.68, grip 6, length 29.68; `('push-rivet', '6')` → dk 15, k 1.2, dm
  3, length 12, grip 4.8, legs 8.4, mandrelLength 4.8; `estimated` is false
  for every size of every tabled kind (each tabled kind has a row for every
  size it offers, so the flag only becomes true for a size injected from an
  old save outside the catalog — test one such feature resolves to the
  default size instead); `tabled: false` kinds' notes contain "proportional
  defaults, no standard table"; `hardwareDimensions` errors of §6
  (one test per message); `hardwareNote('blind-open' 4.8 set)` contains "ISO
  15977", "4.8 × 10 mm", "Dome (protruding) head", "grip 5 mm, installed",
  "mandrel Ø2.95"; the old 31 notes unchanged (reuse the Phase N snapshot
  approach); every default of every kind × every size × every head × both
  states × both bodies passes `hardwareDimensions` (loop test);
  `hardwareFieldLabels` shows `mandrelLength` only when unset and `bulbHeight`
  only when set; `hardwareRadius` cases of §9.
- Unit, OCC — `rivetGeometry.test.js` (reuse the `beforeAll` init of
  `hardware.test.js`, 60 s): one model with all 15 kinds at `defaultSize`,
  default head, `set` → `createKernelSession` → every part volume > 0 and
  bounds: zmax = top per §4 (k for dome / flat / universal / round / pan;
  0 for flush; k + T for the stud; k + 0.35·d for the push rivet; top + 0.1
  for the drive rivet) within 1e-3; zmin = −(grip + bulbHeight) for the
  consumed-tail kinds, −length for drive / self-piercing / nut / stud / push;
  x extent = bulbDiameter for the peel (petal span) and split (leg span) and
  lockbolt (collar flange 2.1·d) kinds, = headDiameter for the others except
  the push rivet (head 2.5·d). A second model with all 15 `unset`: zmin =
  −(length + 0.6·dm) for open / multigrip / peel / structural, −length for the
  rest; zmax = top + mandrelLength for the mandrel kinds, k + 0.35·d + ml for
  the push rivet. Specific checks: a set blind rivet's volume < the same
  rivet unset (the mandrel adds material); the hex rivet nut (M6, set) spans
  2·AF/√3 = 10.39 across the corners on one axis and AF = 9 across the flats
  on the other (`hexPrism` puts a corner on +X as in Phase J — assert the
  axes you measure and say which), while the round one spans the bulge
  11.7 on both; the tubular rivet has a through hole (a ray along the
  axis hits nothing: check with a small cylinder intersection volume ≈ 0, or
  volume < the solid rivet of the same size); every head of the multi-head
  kinds builds; a countersunk-120 blind rivet 4.8 seated by a `concentric`
  connection in hole 2 of a 3-hole row (reuse the Phase M/N kernel test
  fixture) has its instance origin at that centre; `buildCutList` note for
  that part contains "ISO 15977"; `sheetSvg` of a drawing containing a set
  blind rivet renders (string non-empty).
- DOM — `HardwarePanel.dom.test.jsx`: update the two counts (31 → 46 options,
  six → nine optgroups) and add: selecting `blind-open` lists the eight blind
  sizes with `4.8` selected, shows "Head style" (3 options) and "State" (2),
  no "Drive" / "Point" / "Body"; selecting `blind-rivet-nut` shows "Head
  style" (3), "State", "Body" (2) and a "Thread pitch (mm)" field; switching
  State to "As supplied (unset)" replaces "Bulb height (mm)" with "Mandrel
  protrusion (mm)" and keeps a typed "Grip / clamped thickness (mm)"; switching
  back to `bolt` restores today's fields; `Add hardware` passes a feature with
  `head`, `state` set. `CadWorkspace.place.dom.test.jsx`: one new case — type
  `blind-open` → Place → a face click → Apply → the committed part is "Blind
  rivet, open end (pop rivet) 4.8" with `features[0].state === 'set'`.
- Existing suites stay green with **no edits** except the two DOM counts, the
  `screwCatalog.test.js` assertions `toHaveLength(31)` → 46 and the six-label
  list → nine, and the family-build timeout (§9).
- Browser (Playwright, Chrome, `CAD_VERIFY_URL=http://localhost:5180/sketch`,
  reuse `scripts/sketch-cad-steps.mjs`; the recipe and rules of
  `scripts/verify-screw-library.mjs` apply — read saved positions, never
  assume the origin; `localhost`; the New confirm is an in-app dialog): new
  **`scripts/verify-rivet-library.mjs`** — board → Hole row (4 holes, pitch
  50, as the screw script) → Apply → Hardware library → `Hardware type` value
  `blind-open`, `Metric size` `4.8`, attach unchecked → Add hardware → "Place
  hardware" → top view → click holes 1 and 3 → HUD contains `hole centre ·
Blind rivet, open end (pop rivet) 4.8 · Board / plate top` → Enter → "Preview
  ready" → Apply → saved model: parts +1 named "Blind rivet, open end (pop
  rivet) 4.8", `features[0]` has `head 'dome'`, `state 'set'`, `grip 5`, two
  instances, two connections (`holeIndex` 2 on the second) → then `solid`,
  size shows `4`, Head style → `countersunk`, State → `unset` → Add hardware →
  click the board top away from the holes → Apply → part "Solid rivet 4" with
  `head 'countersunk'`, `state 'unset'` → then `blind-rivet-nut` M6, Body →
  `hex` → Add → click the board top → Apply → part "Blind rivet nut (rivnut)
  M6" with `body 'hex'` → Undo × 3 → counts back → screenshots to
  `artifacts/sketch-cad/rivet-library/` (one per added rivet, isometric,
  zoomed so the head and — for the set blind rivet, from below (a bottom or
  front view) — the bulb are visible). Then re-run **all** of:
  `verify-screw-library`, `verify-hardware-holes`, `verify-hole-row`,
  `verify-cut-placement`, `verify-hole-hardware`, `verify-direct-placement`,
  `verify-measure-marks`, `verify-start-sketch`, `verify-sketch-cad-editing`,
  `verify-sketch-cad`, `verify-sketch-cad-offline` (Chrome half; its Electron
  half fails since Phase H — report, do not chase).
- Docs: `docs/sketch-studio-cad.md` "Hardware and metric threads": change
  "bolts, nuts, spacers and 22 kinds of screw" to "…, 22 kinds of screw and 15
  kinds of rivet"; add the three rivet groups to the grouped list with their
  standards; a paragraph on the **State** select (installed = head, body
  across the grip and a schematic blind-side upset; as supplied = plain body
  with its mandrel / pin), the **Grip** field and the ISO 15977 grip-range
  reference of §3.1; the **Body** select for rivet nuts / studs; that the
  Phase J "Rivet nut" is the PEM-style bush and "Blind rivet nut (rivnut)" is
  the blind-side one; the not-modelled list of §3. Plain prose, no marketing.
  `docs/sketch-studio-step-by-step.md` never adds hardware — say so and skip.

Process rules (from earlier phases):

- Do **not** commit; the tree holds uncommitted Phase G–N and November work
  the user will commit. Stay inside `src/features/sketchstudio/cad/`,
  `scripts/`, `docs/` unless wiring requires it; say so if you leave them.
- Match each existing file's line endings — check with `git ls-files --eol`
  for tracked files (`hardware.js`, `hardwareCatalog.js`, `screwGeometry.js`,
  `hardwareGeometry.js`, `HardwarePanel.jsx`, `screwCatalog.test.js`, the docs
  are `w/lf`; `cad.css`, `CadViewport.jsx`, `kernel.js`, `model.js` are CRLF —
  do not touch them) and a byte check for untracked ones; do not trust
  `grep -c $'\r$'` in Git Bash. New files LF.
- `utils/` imports are extensionless and Node cannot load them; keep any new
  Node-run script importing only `.js`-suffixed paths.
- Run `npm run lint` and the full `npm test` at the end; report exact counts.
  Stop any Vite server you start and confirm nothing listens on 5180.
- Flag every judgment call beyond this spec in the final report, with
  file:line anchors for each claim so the audit can verify them. Include in
  the report a table of all 15 kinds at `defaultSize` (default head, set)
  with the resolved `headDiameter`, `headHeight`, `length`, `grip`,
  `bulbDiameter`, `bulbHeight`, `mandrelDiameter` so the audit can compare it
  with §3, plus the family-build test's time.

## 11. Acceptance checklist (used for the audit)

- [ ] `Object.keys(RIVET_KINDS)` is exactly the 15 keys of §3 in that order;
      `HARDWARE_TYPES` has 46 entries, the 31 old ones first and unchanged;
      nine optgroups, the first six unchanged.
- [ ] `hardwareDefaults()` equals today's bolt M3 object; notes, labels and
      geometry of the 31 old kinds unchanged (the Phase J `rivet-nut`
      included).
- [ ] Every kind × catalog size × allowed head × both states (× both bodies)
      builds a solid with volume > 0 and the Z extents of §4; the as-supplied
      state is heavier than the installed one for mandrel kinds; tubular is
      hollow.
- [ ] One revolve per rivet, at most two Booleans (count them per kind in the
      report); the family-build test's time reported.
- [ ] The panel groups the types, shows Head style / State / Body only where
      §7 says, keeps "Metric size" and "Hardware type" labels, falls back the
      size on kind change, re-derives on head change, shows mandrel protrusion
      only when unset and the upset height only when set, never keys a
      `ValueField` on its value.
- [ ] A countersunk-120 blind rivet seats in two holes of a row via the Phase
      M flow; its BOM note names ISO 15977 and the grip; the camera does not
      move on Apply.
- [ ] `verify-rivet-library.mjs` passes; the eleven earlier browser scripts
      pass unchanged (offline: Chrome half).
- [ ] Lint 0 errors; full `npm test` green; counts reported before/after.
- [ ] Docs updated per §10; no commit; line endings preserved.

## 12. Why these fifteen (the research, in short)

Every rivet guide (3ERP, Gesipa, Hanson, JLC, Prestige Stamp, Rapmaf) sorts
rivets by _access_ (two-sided: solid, semi-tubular, tubular, split, lockbolt;
one-sided: every blind kind) and by _how the blind side forms_ (bulb, locked
mandrel, peel petals, driven pin, multi-grip lobes, closed cup). The fifteen
cover each of those mechanisms once, plus the two threaded blind inserts
(rivet nut, rivet stud), the automotive self-piercing rivet and the plastic
panel rivet. Blind-rivet dimensions follow ISO 15977 (AlA/St) — the 15978 /
15979–15984 variants differ only in material and head, which are material
and head choices here; DIN 7337 is withdrawn in favour of them. Solid rivets
follow DIN 660 / 661 / 662 / 674 (ISO 1051) with DIN 124 / 302 for 10–16 mm.
The manufacturer-table kinds carry no standard number on purpose.

## 13. Sources used for the defaults

Standard tables as reproduced by distributors and reference sites (the
official ISO/DIN texts are paywalled; every value is editable and the help
text says so): ISO 15977 head / mandrel / grip tables — induskart.co.in
"Types of rivets and riveted joints" (reproduces DIN EN ISO 15977:2011) and
fasten.it DIN EN ISO 15977; DIN 7337 A/B — fasten.it/en/norms/norm/din_7337
(withdrawn 1991, columns unlabeled: d2 min/max read as head Ø, K as head
height, W as mandrel-related, M 27 as mandrel protrusion), fastenerdata.co.uk
DIN 7337 B, metalcom.cz DIN 7337 B, danetreworkshop.co.uk countersunk sizes
(notes the 9.0 vs 9.5 head disagreement at 4.8); large-flange and multi-grip
lengths — manufacturer listings (Gesipa, POP); closed end — ISO 15973 / 15975
/ 16585 scopes (iteh samples), keller-kalmbach ISO 15973 listing; structural —
Huck Magna-Lok brochure (4.8 / 6.4 / 9.5 / 12.7), Byler Rivet Monobolt 1/4"
(head .525 × .114, grip .080–.625); drive rivets — hansonrivet.com steel drive
rivets (1/4" body, .500 head, .107 height), jlrivet.com; peel — rivetsonline
peel type blind rivets, sarjo automotive peel; solid — fasten.it DIN 660
(2012 table), engineeringhardware.com DIN 661, fasteners.eu DIN 662 and DIN
674, induskart IS 2998 / IS 1929 (10–16 mm); semi-tubular — fasteners.eu DIN
7338 (d2, k, d4, t, hole table); tubular — DIN 7340 listings
(fastenersclearinghouse, ettinger, fasenco: form A flat / form B knurled
round, d 1–10, 4 × 0.4 wall, 4 → Ø 6 head, 8 → Ø 12); split — dtpsupplies
bifurcated table (3 → 5.5 head, 3.86 → 7.93), rivet.com clinch allowance
55 %; self-piercing — Wielander & Schill / Böllhoff SPR listings (3.3 and
5.3 × 4–9), Henrob C-type 7.75 head; rivet nuts — pemnet.com rivet nut hole
chart (5.1 / 6.1 / 7.1 / 9.1 / 11.1 / 13.1 / 16.1), rivetfix.com size / grip
charts, engineeringhardware M6 rivet nut, TR Fastenings flange / countersunk
table, autoriv hex tables; lockbolt — blindrivetsupply / imperialsupplies Huck
C6L and Magna-Grip collar listings (1/4" collar h 7.37–8.13, 5/16" flange
15.47–16.28, wide flange .850–1.010), Böllhoff Huck catalog; push rivets —
uxcell / Auveco 6 mm panel rivet listings (head 15, pin head 9.5, stem 12);
rivet taxonomy — 3erp.com, gesipa.co.uk, hansonrivet.com "Know your rivets",
jlccnc.com, firstmold.com, prestige-stamp.com, partmfg.com, rapmaf.com.
Where sources disagreed (4.8 countersunk head 9.0 vs 9.5, closed-end lengths,
structural heads, rivet-nut M6 holes 9.0–10.2) the value chosen is noted as
approximate above and the field is editable.
