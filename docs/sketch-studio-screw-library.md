# Phase N — Screw library: 22 screw types, head styles, drives and points

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-11-01 by Fable after reading the
code and researching the standards (sources in §12); to be built by Opus;
audited by Fable against this document. It extends the Hardware library of
Phase J (`docs/sketch-studio-cut-placement.md` §3.4) and Phase M
(`docs/sketch-studio-hardware-holes.md`), whose engine, rules and vocabulary
apply unchanged unless this document says otherwise.

## 1. The problem, in the user's words

> Can we add different types of screws in the hardware library? Add all 22
> types of engineering screws. Research what the types of screw heads are.

Today the Hardware library knows nine kinds, and every screw is a "Hex bolt":
a hexagon head on a plain cylindrical shank. Verified in the code:

| What                                                                                                                                                                                                                                                                                                                               | Where                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `HARDWARE_TYPES` = bolt, nut, washer, standoff, clinch-nut, clinch-standoff, stud, rivet-nut, insert; `METRIC_THREADS` M2–M12 with pitch and tap drill                                                                                                                                                                             | `hardware.js` 5–25                                                                          |
| `hardwareDefaults(kind = 'bolt', size = 'M3')` builds the feature `{ id, type: 'hardware', kind, size, pitch, diameter, length, bodyDiameter, headDiameter, headHeight, boreDiameter, material, supplierCode, installationHole, minimumSheet, notes }`; `headDiameter: diameter * 2.3` is the "13.799999999999999" wart of Phase M | `hardware.js` 46–66                                                                         |
| `hardwareDimensions` validates the seven numeric fields (bore < body for non-shank kinds, head > shank for bolt/stud, flange ≥ body for clinch kinds); `hardwareNote` writes the BOM note; `createHardware` names the part `${HARDWARE_TYPES[kind]} ${size}`                                                                       | `hardware.js` 67–101                                                                        |
| `hardwareGeometry(f, parameters, own)`: seating plane Z = 0; bolt/stud = head (hex / round) above Z = 0 fused with a shank cylinder from 0 down to −length; nuts/spacers extend +Z and are bored                                                                                                                                   | `hardwareGeometry.js` 4–29                                                                  |
| kernel: `case 'hardware': next = hardwareGeometry(f, params, own)`; the concentric connection uses the hardware axis direction `[0, 0, −1]`                                                                                                                                                                                        | `kernel.js` 214–215, 488                                                                    |
| `HardwareFields` (field labels keyed by kind), `HardwarePanel` (type select, "Metric size" select over `METRIC_THREADS`, material, fields, Attach checkbox, Add hardware)                                                                                                                                                          | `HardwarePanel.jsx` 6–120                                                                   |
| `HardwareFields` is also rendered for a selected hardware feature in the tree and in Place                                                                                                                                                                                                                                         | `CadEditors.jsx` 229, `OperationPanel.jsx` 235                                              |
| `hardwareName` = `${HARDWARE_TYPES[kind]} ${size}`; `hardwareRadius` = max(headDiameter, bodyDiameter, diameter) / 2 for the rings and the hover ghost                                                                                                                                                                             | `placementHardware.js` 54–55, 296–303                                                       |
| BOM note from `hardwareNote`                                                                                                                                                                                                                                                                                                       | `fabrication.js` 41                                                                         |
| Browser scripts select `Hardware type` by **value** (`'bolt'`, `'standoff'`), `Metric size` by `'M6'`, and assert the part name `Hex bolt M6` and the HUD text `hole centre · Hex bolt M6 · Board / plate top · click to add`                                                                                                      | `scripts/verify-hardware-holes.mjs` 81–82, 108, 167; `scripts/verify-hole-hardware.mjs` 113 |

There is no canonical "22 types of screws" in the fastener literature (guides
list 18, 25, 26, 33 or 40); §3 fixes the 22 this library ships, chosen to cover
every family an engineer, a sheet-metal shop and a joiner meet, and to be
representable as a true solid with the replicad primitives already in use.
The user can swap any of them later.

## 2. Principles

1. **A screw is kind × head × drive × point, in the one `hardware` feature.**
   `kind` stays the family key (`HARDWARE_TYPES` grows from 9 to 31 entries);
   `head`, `drive`, `point` are new optional string fields with per-kind
   defaults and per-kind allowed lists. Heads and drives are the two axes the
   user asked to research; they are selectable where the standard family
   offers a choice (wood screws: countersunk / raised / round; self-drilling:
   hex washer / pan / countersunk; thumb: high / low), fixed otherwise.
2. **Defaults come from the standard where one exists**, per size, from the
   tables in §3–§5 (cited in §12), rounded to 2 decimals. Where a size lies
   outside the standard's table a stated proportional rule fills it and the BOM
   note says so. Everything stays an editable **schematic envelope**: no
   helical threads, no knurl teeth, no drill flutes, no cross-recess ramps; a
   drive is a schematic recess. The existing help text promise is extended, not
   broken.
3. **The seating-plane contract is unchanged.** Z = 0 is the seating plane;
   heads sit above Z = 0 and the shank runs into −Z, so `kernel.js` and every
   connection rule stay untouched. Flush heads (countersunk, raised countersunk,
   bugle) have their _top rim_ at Z = 0 and the cone below it; a set screw has
   its socket end at Z = 0 and its body below. In every case the tip is at
   Z = −length (−(length + threadLength) for a shoulder screw).
4. **The nine existing kinds do not change.** Same keys, labels, defaults
   (numerically, to 2 decimals — the `13.799999999999999` wart becomes `13.8`),
   geometry code path, BOM note text, part names, panel labels. Every Phase
   J/K/L/M script and test keeps passing without edits.
5. **Nothing new is persisted structurally.** New fields are optional
   properties of the feature; `CAD_VERSION` stays 1; a saved model without
   `head` resolves the family default. `hardwareRadius`, `hardwareName`, the
   Place/pick/Seat/Re-place machine, the BOM quantity logic are reused as is.

Rejected alternatives (do not build):

- A separate "Screws" panel or a second feature type — the hardware feature,
  its placement tool and its BOM path already do everything.
- Modelled helical threads or knurls — kernel cost, no downstream consumer.
- A free "head on any kind" matrix for machine screws — the user asked for
  types; pan, countersunk, raised countersunk, cheese, truss, hex flange,
  socket cap, button and countersunk socket **are** the types (§3), each with
  its own standard and defaults. The `head` field varies only where one
  standard family offers several heads.

## 3. The 22 screw kinds

Keys, labels (`HARDWARE_TYPES`), standards, size catalog (§5), default and
allowed heads (§4.1), default and allowed drives (§4.2), point (§4.3). Lengths
are under-head for headed screws and overall for flush heads and set screws.

| #   | key                   | label                                      | standard                                          | sizes               | head (allowed)                          | drive (allowed)                                                              | point                 | default length |
| --- | --------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------- | --------------------------------------- | ---------------------------------------------------------------------------- | --------------------- | -------------- |
| 1   | `socket-cap`          | Socket head cap screw                      | ISO 4762 / DIN 912                                | metric              | socket-cap                              | hex-socket (torx, pin-torx)                                                  | blunt                 | 20             |
| 2   | `button-head`         | Button head screw                          | ISO 7380-1                                        | metric              | button                                  | hex-socket (torx, pin-torx)                                                  | blunt                 | 16             |
| 3   | `countersunk-socket`  | Countersunk socket screw                   | ISO 10642 / DIN 7991                              | metric              | countersunk                             | hex-socket (torx, pin-torx)                                                  | blunt                 | 16             |
| 4   | `pan-head`            | Pan head machine screw                     | ISO 7045 / ISO 14583                              | metric              | pan                                     | phillips (pozidriv, torx, slot, square, pin-torx, spanner, one-way)          | blunt                 | 12             |
| 5   | `countersunk-machine` | Countersunk machine screw                  | ISO 7046 / ISO 14581 / DIN 965                    | metric              | countersunk                             | phillips (same list as 4)                                                    | blunt                 | 12             |
| 6   | `raised-countersunk`  | Raised countersunk (oval) machine screw    | ISO 7047 / DIN 966                                | metric              | raised-countersunk                      | phillips (same list as 4)                                                    | blunt                 | 12             |
| 7   | `cheese-head`         | Cheese head screw                          | ISO 1207 / DIN 84                                 | metric              | cheese (fillister)                      | slot (phillips, pozidriv, torx)                                              | blunt                 | 12             |
| 8   | `truss-head`          | Truss (mushroom) head screw                | JIS B 1111 / ASME B18.6.7M                        | metric              | truss                                   | phillips (same list as 4)                                                    | blunt                 | 12             |
| 9   | `hex-flange`          | Hex flange screw                           | DIN 6921 / EN 1665                                | metric              | hex-flange                              | none                                                                         | blunt                 | 20             |
| 10  | `shoulder`            | Shoulder screw                             | ISO 7379                                          | metric M5–M12 only  | socket-cap                              | hex-socket (torx)                                                            | blunt                 | 20 (shoulder)  |
| 11  | `set-screw`           | Socket set screw (grub screw)              | ISO 4026–4029 / DIN 913–916                       | metric              | none                                    | hex-socket (torx, slot)                                                      | flat (cone, dog, cup) | 2·d, min 6     |
| 12  | `thumb`               | Knurled thumb screw                        | DIN 464 / DIN 653                                 | metric              | knurled-high (knurled-low)              | none                                                                         | blunt                 | 16             |
| 13  | `wing`                | Wing screw                                 | DIN 316                                           | metric              | wing                                    | none                                                                         | blunt                 | 20             |
| 14  | `eye-bolt`            | Eye bolt                                   | DIN 444                                           | metric              | eye                                     | none                                                                         | blunt                 | 30             |
| 15  | `carriage`            | Carriage bolt (mushroom head, square neck) | DIN 603                                           | metric              | mushroom                                | none                                                                         | blunt                 | 40             |
| 16  | `tapping-pan`         | Pan head tapping screw                     | ISO 7049 / DIN 7981                               | tapping             | pan                                     | phillips (pozidriv, torx, slot, square, pin-torx)                            | sharp                 | 16             |
| 17  | `tapping-countersunk` | Countersunk tapping screw                  | ISO 7050 / DIN 7982 (raised: ISO 7051 / DIN 7983) | tapping             | countersunk (raised-countersunk)        | phillips (same list as 16)                                                   | sharp                 | 16             |
| 18  | `self-drilling`       | Self-drilling screw                        | DIN 7504 K / N / P, ISO 15480–15482               | tapping ST3.5–ST6.3 | hex-washer (pan, countersunk)           | none for hex-washer; phillips (pozidriv, torx, square) for pan / countersunk | drill                 | 19             |
| 19  | `wood`                | Wood screw                                 | DIN 7997 / DIN 7995 / DIN 7996                    | wood                | countersunk (raised-countersunk, round) | pozidriv (phillips, torx, slot, square)                                      | sharp                 | 40             |
| 20  | `chipboard`           | Chipboard screw                            | DIN 7505                                          | wood                | countersunk (raised-countersunk, pan)   | torx (pozidriv, phillips, square)                                            | sharp                 | 40             |
| 21  | `drywall`             | Drywall screw                              | DIN 18182-2                                       | drywall             | bugle                                   | phillips (square, torx)                                                      | sharp                 | 25             |
| 22  | `lag`                 | Lag / coach screw                          | DIN 571                                           | lag                 | hex (hex-washer)                        | none                                                                         | sharp                 | 60             |

Grouping in the panel (`<optgroup>`): **Bolts, nuts & spacers** = the nine
existing kinds in today's order; **Machine screws** = 4, 5, 6, 7, 8, 9;
**Socket screws** = 1, 2, 3, 10, 11; **Tapping & self-drilling** = 16, 17,
18; **Wood & construction** = 19, 20, 21, 22; **Special** = 12, 13, 14, 15.

Candidates deliberately _not_ among the 22 (list them in the docs as not
modelled, do not build): masonry/concrete screws, decking screws, hanger
bolts / dowel screws, Chicago screws (binding posts), hammer-drive screws,
MDF screws, structural/framing screws, SEMS (captive washer) screws,
thread-forming (Taptite) screws, security screws as a _kind_ (they are the
`pin-torx` / `spanner` / `one-way` drives on any screw).

### 3.1 Per-size defaults for the metric kinds (mm)

`d` = thread diameter, `p` = pitch (from `METRIC_THREADS`). Where a cell says
_rule_, the standard has no row for that size: use the rule and set
`estimated: true` on the resolved shape so `hardwareNote` can say "sizes
outside <standard> estimated".

**1 Socket head cap screw — ISO 4762** (dk = 1.5·d, k = d, socket s):

| size | M2  | M2.5 | M3  | M4  | M5  | M6  | M8  | M10 | M12 |
| ---- | --- | ---- | --- | --- | --- | --- | --- | --- | --- |
| dk   | 3.8 | 4.5  | 5.5 | 7   | 8.5 | 10  | 13  | 16  | 18  |
| k    | 2   | 2.5  | 3   | 4   | 5   | 6   | 8   | 10  | 12  |
| s    | 1.5 | 2    | 2.5 | 3   | 4   | 5   | 6   | 8   | 10  |

**2 Button head — ISO 7380-1** (M2/M2.5 rule: dk 1.9·d, k 0.55·d, s 0.65·d):

| size | M3   | M4  | M5   | M6   | M8  | M10  | M12 |
| ---- | ---- | --- | ---- | ---- | --- | ---- | --- |
| dk   | 5.7  | 7.6 | 9.5  | 10.5 | 14  | 17.5 | 21  |
| k    | 1.65 | 2.2 | 2.75 | 3.3  | 4.4 | 5.5  | 6.6 |
| s    | 2    | 2.5 | 3    | 4    | 5   | 6    | 8   |

**3 Countersunk socket — ISO 10642** (theoretical dk = 2.24·d, k = 0.62·d
(90° head: k = (dk − d)/2), s as ISO 7380; M2/M2.5 by the same rules):

| size | M3   | M4   | M5   | M6    | M8    | M10  | M12   |
| ---- | ---- | ---- | ---- | ----- | ----- | ---- | ----- |
| dk   | 6.72 | 8.96 | 11.2 | 13.44 | 17.92 | 22.4 | 26.88 |
| k    | 1.86 | 2.48 | 3.1  | 3.72  | 4.96  | 6.2  | 7.44  |
| s    | 2    | 2.5  | 3    | 4     | 5     | 6    | 8     |

**4 Pan head — ISO 7045** (M12 rule: dk 2·d, k 0.75·d):

| size | M2  | M2.5 | M3  | M4  | M5  | M6  | M8  | M10 |
| ---- | --- | ---- | --- | --- | --- | --- | --- | --- |
| dk   | 4   | 5    | 5.6 | 8   | 9.5 | 12  | 16  | 20  |
| k    | 1.6 | 2.1  | 2.4 | 3.1 | 3.7 | 4.6 | 6   | 7.5 |

**5 Countersunk machine — DIN 965 / ISO 7046** and **6 Raised countersunk —
ISO 7047** share dk and k; 6 adds the dome height f (M12 rule: dk 1.85·d,
k 0.5·d, f 0.23·d). The sources disagree for M8/M10 (ISO 7046 lists 15.8 /
18.3); keep the DIN 965 column below, flag it in the report.

| size       | M2  | M2.5 | M3   | M4  | M5  | M6  | M8   | M10 |
| ---------- | --- | ---- | ---- | --- | --- | --- | ---- | --- |
| dk         | 3.8 | 4.7  | 5.6  | 7.5 | 9.2 | 11  | 14.5 | 18  |
| k          | 1.2 | 1.5  | 1.65 | 2.2 | 2.5 | 3   | 4    | 5   |
| f (6 only) | 0.5 | 0.6  | 0.7  | 1   | 1.2 | 1.4 | 2    | 2.3 |

**7 Cheese head — ISO 1207** (M12 rule: dk 1.5·d, k 0.6·d); fillister head
option = cheese + a dome of 0.15·d on top:

| size | M2  | M2.5 | M3  | M4  | M5  | M6  | M8  | M10 |
| ---- | --- | ---- | --- | --- | --- | --- | --- | --- |
| dk   | 3.8 | 4.5  | 5.5 | 7   | 8.5 | 10  | 13  | 16  |
| k    | 1.4 | 1.8  | 2   | 2.6 | 3.3 | 3.9 | 5   | 6   |

**8 Truss head — JIS B 1111** (others rule: dk 2.3·d, k 0.62·d):

| size | M3  | M4  | M5   | M6  | M8   |
| ---- | --- | --- | ---- | --- | ---- |
| dk   | 6.9 | 9.4 | 11.8 | 14  | 17.8 |
| k    | 1.9 | 2.5 | 3.1  | 3.7 | 4.8  |

**9 Hex flange — DIN 6921** (s = hex across flats → `bodyDiameter`, dc =
flange Ø → `headDiameter`, k → `headHeight`; flange thickness c = 0.15·k, min
0.6; M2–M4 rule: s = ISO 4017 flats (4, 5, 7), dc 2.3·d, k 1.0·d):

| size | M5   | M6   | M8  | M10  | M12  |
| ---- | ---- | ---- | --- | ---- | ---- |
| s    | 8    | 10   | 13  | 15   | 16   |
| dc   | 11.8 | 14.2 | 18  | 22.3 | 26.6 |
| k    | 5.4  | 6.6  | 8.1 | 9.2  | 11.5 |

**10 Shoulder screw — ISO 7379** (size = thread; `bodyDiameter` = shoulder
Ø ds; `length` = shoulder length; `threadLength` fixed per size; head as a
socket cap):

| size         | M5  | M6   | M8   | M10 | M12 |
| ------------ | --- | ---- | ---- | --- | --- |
| ds           | 6.5 | 8    | 10   | 13  | 16  |
| dk           | 10  | 13   | 16   | 18  | 24  |
| k            | 4.5 | 5.5  | 7    | 9   | 11  |
| s            | 3   | 4    | 5    | 6   | 8   |
| threadLength | 9.5 | 11.5 | 13.5 | 16  | 18  |

**11 Set screw — ISO 4026 (flat) / 4027 (cone) / 4028 (dog) / 4029 (cup)**
(`bodyDiameter` = point Ø: dp for flat and dog, dz for cup, unused for cone;
`neckHeight` reused as dog length z; socket s; M2/M2.5 rule: s 0.5·d, dp
0.65·d, dz 0.5·d, z 0.6·d):

| size           | M3   | M4   | M5   | M6   | M8  | M10 | M12 |
| -------------- | ---- | ---- | ---- | ---- | --- | --- | --- |
| s              | 1.5  | 2    | 2.5  | 3    | 4   | 5   | 6   |
| dp (flat, dog) | 2    | 2.5  | 3.5  | 4    | 5.5 | 7   | 8.5 |
| dz (cup)       | 1.4  | 2    | 2.5  | 3    | 5   | 6   | 8   |
| z (dog)        | 1.75 | 2.25 | 2.75 | 3.25 | 4.3 | 5.3 | 6.3 |

**12 Thumb screw — DIN 464 (high) / DIN 653 (low)** (`headDiameter` = knurled
disc dk, `headHeight` = knurl height k, `bodyDiameter` = shoulder Ø ds,
`collarHeight` = h − k for the high type, 0 for the low type; M2/M2.5 rule dk
4·d, k 0.8·d, ds 2·d, h 2.5·d; M12 rule the same):

| size | M3  | M4  | M5   | M6  | M8  | M10 |
| ---- | --- | --- | ---- | --- | --- | --- |
| dk   | 12  | 16  | 20   | 24  | 30  | 36  |
| k    | 2.5 | 3.5 | 4    | 5   | 6   | 8   |
| ds   | 6   | 8   | 10   | 12  | 16  | 20  |
| h    | 7.5 | 9.5 | 11.5 | 15  | 18  | 23  |

**13 Wing screw — DIN 316** (`headDiameter` = wing span e, `headHeight` =
overall height h, `bodyDiameter` = collar Ø d2, `wingThickness` = g2, hub Ø d3,
collar height a; M2–M3 rule: e 4.5·d, h 2.2·d, d2 1.6·d, d3 1.4·d, g2 0.45·d,
a 0.5·d):

| size | M4  | M5  | M6  | M8   | M10  | M12  |
| ---- | --- | --- | --- | ---- | ---- | ---- |
| e    | 18  | 24  | 30  | 36   | 48   | 62   |
| h    | 8.5 | 11  | 15  | 18   | 23   | 31   |
| d2   | 6   | 8   | 10  | 13   | 17   | 20   |
| d3   | 5.5 | 7.5 | 9   | 10.5 | 14.5 | 17.5 |
| g2   | 1.7 | 2.3 | 2.7 | 3.6  | 4.6  | 5.6  |
| a    | 2.1 | 2.4 | 3   | 4    | 4.5  | 5.3  |

**14 Eye bolt — DIN 444 form B** (`headDiameter` = eye outer Ø d2,
`boreDiameter` = eye bore d1 = d, `headHeight` = eye thickness s; M2–M5 rule:
d2 2.3·d, s 1.15·d):

| size | M6  | M8  | M10 | M12 |
| ---- | --- | --- | --- | --- |
| d2   | 14  | 18  | 20  | 25  |
| d1   | 6   | 8   | 10  | 12  |
| s    | 7   | 9   | 12  | 14  |

**15 Carriage bolt — DIN 603** (`headDiameter` = dome dk, `headHeight` = k,
`bodyDiameter` = square neck width v = d, `neckHeight` = f; M5: 13 / 3.1 / 5 /
3; M2–M4 rule dk 2.6·d, k 0.55·d, v d, f 0.65·d):

| size | M6  | M8  | M10 | M12 |
| ---- | --- | --- | --- | --- |
| dk   | 16  | 20  | 24  | 30  |
| k    | 3.5 | 4.5 | 5   | 6.5 |
| v    | 6   | 8   | 10  | 12  |
| f    | 4   | 5   | 6   | 8   |

### 3.2 Per-size defaults for the tapping kinds (mm)

Sizes `ST2.9 … ST6.3` (§5). Pan (ISO 7049 / DIN 7981) and countersunk
(ISO 7050 / DIN 7982); the raised-countersunk option of 17 uses the countersunk
dk / k plus f = 0.23·d.

| size              | ST2.9 | ST3.5 | ST4.2 | ST4.8 | ST5.5 | ST6.3 |
| ----------------- | ----- | ----- | ----- | ----- | ----- | ----- |
| 16 pan dk         | 5.6   | 6.9   | 8.2   | 9.5   | 10.8  | 12.5  |
| 16 pan k          | 2.2   | 2.6   | 3.05  | 3.55  | 3.95  | 4.55  |
| 17 countersunk dk | 5.5   | 6.8   | 8.1   | 9.5   | 10.8  | 12.4  |
| 17 countersunk k  | 1.7   | 2.1   | 2.5   | 3     | 3.3   | 3.8   |

**18 Self-drilling — DIN 7504** (no ST2.9). K = hex washer: `bodyDiameter` =
hex across flats s, `headDiameter` = washer Ø dc, `headHeight` = k, washer
thickness c = 0.2·k; N = pan, P = countersunk; drill point Ø dp:

| size     | ST3.5      | ST4.2     | ST4.8     | ST5.5    | ST6.3       |
| -------- | ---------- | --------- | --------- | -------- | ----------- |
| K s      | 5.5        | 7         | 8         | 8        | 10          |
| K dc     | 8.3        | 8.8       | 10.5      | 11       | 13.5        |
| K k      | 3.4        | 4.1       | 4.3       | 5.4      | 5.9         |
| N dk / k | 7 / 2.6    | 8 / 3.1   | 9.5 / 3.7 | 11 / 4   | 12 / 4.6    |
| P dk / k | 7.3 / 2.35 | 8.4 / 2.6 | 9.3 / 2.8 | 10.3 / 3 | 11.3 / 3.15 |
| dp       | 2.8        | 3.6       | 4.1       | 4.8      | 5.8         |

### 3.3 Per-size defaults for wood, drywall and lag (mm)

**19 Wood screw — DIN 7997** (countersunk; raised option DIN 7995 same dk / k
plus f = 0.23·d; round option DIN 7996: same dk, k = 0.65·d) and **20 Chipboard
— DIN 7505** (countersunk dk = 2·d; pan option dk 2·d with k below; raised
option countersunk k + f 0.2·d):

| size                  | 3.0      | 3.5      | 4.0      | 4.5      | 5.0       | 6.0       |
| --------------------- | -------- | -------- | -------- | -------- | --------- | --------- |
| 19 dk                 | 5.6      | 6.5      | 7.5      | 8.3      | 9.2       | 11        |
| 19 k                  | 1.65     | 1.93     | 2.2      | 2.35     | 2.5       | 3         |
| 20 countersunk dk / k | 6 / 1.9  | 7 / 2.1  | 8 / 2.5  | 9 / 2.7  | 10 / 3    | 12 / 3.6  |
| 20 pan dk / k         | 6 / 2.37 | 7 / 2.72 | 8 / 2.92 | 9 / 3.15 | 10 / 3.65 | 12 / 4.25 |

**21 Drywall — DIN 18182-2 TN** (bugle; dk from supplier tables, the standard
caps dk at 8.5 for 3.5–4.2; k = 0.6·d):

| size | 3.5 | 3.9  | 4.2 | 4.8 |
| ---- | --- | ---- | --- | --- |
| dk   | 8   | 8.2  | 8.5 | 9   |
| k    | 2.1 | 2.35 | 2.5 | 2.9 |

**22 Lag / coach screw — DIN 571** (hex: `headDiameter` = across flats s;
hex-washer option adds a washer face Ø 1.6·s, thickness 0.15·k):

| size | 5   | 6   | 8   | 10  | 12  |
| ---- | --- | --- | --- | --- | --- |
| s    | 8   | 10  | 13  | 17  | 19  |
| k    | 3.5 | 4   | 5.5 | 7   | 8   |

## 4. Heads, drives, points

### 4.1 Head styles (`head`) — `HEAD_STYLES = { key: { label, flush, build } }`

Half-profiles are revolved about Z (`revolveProfile(points)` draws the
(r, z) polyline/arcs with `cad.draw()` on the `'XZ'` plane and calls
`.revolve()`; replicad 1.2.0 `Sketch.revolve(axis = [0, 0, 1], { origin })`
— confirm with a one-line node check before relying on the default axis, and
`own()` every intermediate shape as `hardwareGeometry.js` does). `dk` =
`headDiameter`, `k` = `headHeight`, `d` = `diameter`.

| key                  | label                      | geometry (schematic)                                                                                                                                                                                                                                                | Z extent       |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `hex`                | Hexagon                    | existing `hex(s, k)` prism (s = `headDiameter`)                                                                                                                                                                                                                     | 0 … k          |
| `hex-flange`         | Hexagon with flange        | `hex(s, k)` ∪ disc Ø dc × c, c = round2(0.15·k) min 0.6 (s = `bodyDiameter`, dc = `headDiameter`)                                                                                                                                                                   | 0 … k          |
| `hex-washer`         | Hexagon washer head        | `hex(s, k)` ∪ disc Ø dc × 0.2·k (self-drilling: s = `bodyDiameter`, dc = `headDiameter`; lag: s = `headDiameter`, dc = 1.6·s)                                                                                                                                       | 0 … k          |
| `socket-cap`         | Cylindrical (socket cap)   | cylinder Ø dk × k (a 0.1·dk 45° chamfer on the top edge is a _should_)                                                                                                                                                                                              | 0 … k          |
| `cheese`             | Cheese (flat cylinder)     | cylinder Ø dk × k                                                                                                                                                                                                                                                   | 0 … k          |
| `fillister`          | Fillister (domed cylinder) | cylinder Ø dk × k ∪ dome(dk, 0.15·d) on top                                                                                                                                                                                                                         | 0 … k + 0.15·d |
| `pan`                | Pan                        | revolve (0,0) → (dk/2,0) → (dk/2, 0.5k) → arc through (0.475·dk, 0.8k) to (0.4·dk, k) → (0, k)                                                                                                                                                                      | 0 … k          |
| `button`             | Button (dome)              | `dome(dk, k)`: spherical cap, base Ø dk, height k, sphere radius R = (dk²/4 + k²)/(2k) — revolve the arc or intersect `makeSphere` with a cylinder                                                                                                                  | 0 … k          |
| `truss`              | Truss (wide low dome)      | `dome(dk, k)`                                                                                                                                                                                                                                                       | 0 … k          |
| `round`              | Round (half dome)          | `dome(dk, k)`                                                                                                                                                                                                                                                       | 0 … k          |
| `mushroom`           | Mushroom (carriage)        | `dome(dk, k)` above + square neck box v × v × f below Z = 0 (v = `bodyDiameter`, f = `neckHeight`)                                                                                                                                                                  | −f … k         |
| `countersunk`        | Countersunk (flat, 90°)    | revolve (0,0) → (dk/2,0) → (d/2, −k) → (0, −k); flush                                                                                                                                                                                                               | −k … 0         |
| `raised-countersunk` | Raised countersunk (oval)  | countersunk cone ∪ `dome(dk, f)` above Z = 0 (f = `domeHeight`)                                                                                                                                                                                                     | −k … f         |
| `bugle`              | Bugle (drywall)            | revolve (0,0) → (dk/2,0) → **concave** arc through (d/2 + 0.12·(dk − d)/2, −0.7·k) to (d/2, −k) → (0, −k); flush; volume must be _less_ than the straight cone of the same dk, k                                                                                    | −k … 0         |
| `knurled-high`       | Knurled, high (DIN 464)    | shoulder cylinder Ø ds × c (ds = `bodyDiameter`, c = `collarHeight`) ∪ disc Ø dk × k on top; knurl not modelled                                                                                                                                                     | 0 … c + k      |
| `knurled-low`        | Knurled, low (DIN 653)     | disc Ø dk × k                                                                                                                                                                                                                                                       | 0 … k          |
| `wing`               | Wing                       | collar cylinder Ø d2 × a ∪ hub cylinder Ø d3 from a to h ∪ one box e × g2 × (h − a) centred on the axis from Z = a to h (e = `headDiameter`, h = `headHeight`, d2 = `bodyDiameter`, g2 = `wingThickness`, d3 = 0.9·d2, a = 0.2·h); rounded wing tips are a _should_ | 0 … h          |
| `eye`                | Eye (ring)                 | annulus outer Ø d2, bore Ø d1, extruded s along Y, standing in the XZ plane with its centre at Z = d2/2 (d2 = `headDiameter`, d1 = `boreDiameter`, s = `headHeight`); the shank cylinder is extended **up** to Z = (d2 − d1)/4 so the two solids overlap            | 0 … d2         |
| `none`               | No head                    | nothing                                                                                                                                                                                                                                                             | —              |

Shank: cylinder Ø d from Z = 0 (or from −f for `mushroom`) down to Z =
−length, then the point (§4.3). Shoulder screw: cylinder Ø ds from 0 to
−length, then cylinder Ø d from −length to −(length + threadLength). Set
screw: cylinder Ø d from 0 to −length with the point at the bottom and the
drive recess at the top.

### 4.2 Drives (`drive`, `driveSize`) — `DRIVES = { key: { label, cut } }`

A drive is a prism cut into the head top (the head's highest flat / the Z = 0
rim for flush heads / the Z = 0 end of a set screw), depth
`driveDepth = min(0.5·d, 0.7·k)` for `hex-socket`, `0.45·k` otherwise
(`0.5·d` capped at `0.7·length` for set screws). `driveSize` (mm) is the one
numeric field: across flats for `hex-socket` and `square`, point-to-point for
`torx` / `pin-torx`, recess span for `phillips` / `pozidriv`, slot width for
`slot` / `one-way`, hole pitch for `spanner`.

| key          | label               | cut                                                                                    | default `driveSize`                                                                                                                                                                                                |
| ------------ | ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `none`       | None (external)     | no cut                                                                                 | —                                                                                                                                                                                                                  |
| `slot`       | Slotted             | box driveSize × dk (full head width) × depth                                           | round1(0.2·d), min 0.6                                                                                                                                                                                             |
| `phillips`   | Phillips (cross)    | two perpendicular boxes, arm width round1(0.2·d), each `driveSize` long                | ISO 7045 m: M2 2.2, M2.5 2.7, M3 3.1, M4 4.6, M5 5.2, M6 6.8, M8 9, M10 10.2; else round1(0.6·dk)                                                                                                                  |
| `pozidriv`   | Pozidriv            | same cut as phillips (the four ribs are not modelled; the label and note say Pozidriv) | as phillips                                                                                                                                                                                                        |
| `torx`       | Torx (hexalobular)  | 12-vertex star prism: alternating radii A/2 and 0.72·A/2                               | ISO 10664 A by thread: M2 1.75, M2.5 2.4, M3 2.74, M4 3.86, M5 4.43, M6 5.52, M8 7.82, M10 8.83, M12 11.35; ST2.9/3.0 2.74, ST3.5/3.5 3.27, ST4.2/3.9/4.0 3.86, ST4.8/4.5/4.8 4.43, ST5.5/5.0 4.43, ST6.3/6.0 5.52 |
| `pin-torx`   | Security Torx (pin) | torx star cut, then a pin cylinder Ø 0.3·A of the same depth fused back                | as torx                                                                                                                                                                                                            |
| `hex-socket` | Hex socket          | hexagon prism across flats `driveSize`                                                 | table s per kind (§3.1); else round1(0.5·d)                                                                                                                                                                        |
| `square`     | Square (Robertson)  | square prism across flats `driveSize`                                                  | round1(0.55·d)                                                                                                                                                                                                     |
| `spanner`    | Spanner (two holes) | two cylinders Ø 0.15·dk at ±driveSize/2 on X                                           | round1(0.5·dk)                                                                                                                                                                                                     |
| `one-way`    | One-way (slot)      | same cut as `slot`                                                                     | as slot                                                                                                                                                                                                            |

`drive: 'none'` skips the cut (it is also the way to keep a bolt-count model
cheap). The drive is cut **after** the head and shank are fused.

### 4.3 Points (`point`) — `POINTS`

| key     | label           | geometry at the tip (tip at Z = −length)                                                                                                                                        | kinds                                                |
| ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `blunt` | Blunt           | flat end                                                                                                                                                                        | machine screws, thumb, wing, eye, carriage, shoulder |
| `sharp` | Sharp (gimlet)  | cone from Ø d at Z = −(length − 1.2·d) to the apex                                                                                                                              | tapping, wood, chipboard, drywall, lag               |
| `drill` | Drill point     | cylinder Ø dp from Z = −(length − 1.6·dp) to −(length − 0.3·dp), then a cone to the apex (dp = `bodyDiameter`? no — dp is its own default from §3.2, stored as `pointDiameter`) | self-drilling                                        |
| `flat`  | Flat (ISO 4026) | 45° chamfer from Ø d to Ø dp over (d − dp)/2, flat end                                                                                                                          | set screw                                            |
| `cone`  | Cone (ISO 4027) | 90° cone from Ø d to the apex (height d/2)                                                                                                                                      | set screw                                            |
| `dog`   | Dog (ISO 4028)  | cylinder Ø dp, length z (`neckHeight`) below the body                                                                                                                           | set screw                                            |
| `cup`   | Cup (ISO 4029)  | as `flat` with Ø dz, plus a conical recess Ø dz, depth 0.12·d (_should_; may ship as `flat` with the note "cup not modelled")                                                   | set screw                                            |

## 5. Sizes — `SIZE_CATALOGS` and `sizesFor(kind)`

| catalog   | keys                                                 | pitch (mm)                                                 | used by                              |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| `metric`  | `METRIC_THREADS` keys M2 … M12 (unchanged object)    | as today                                                   | kinds 1–9, 11–15 (10: M5 … M12 only) |
| `tapping` | `ST2.9`, `ST3.5`, `ST4.2`, `ST4.8`, `ST5.5`, `ST6.3` | 1.1, 1.3, 1.4, 1.6, 1.8, 1.8                               | 16, 17 (18 from ST3.5)               |
| `wood`    | `3.0`, `3.5`, `4.0`, `4.5`, `5.0`, `6.0`             | 1.35, 1.6, 1.8, 2.0, 2.2, 2.6                              | 19, 20                               |
| `drywall` | `3.5`, `3.9`, `4.2`, `4.8`                           | 1.6, 1.7, 1.8, 2.1 (coarse; fine thread = edit the pitch)  | 21                                   |
| `lag`     | `5`, `6`, `8`, `10`, `12`                            | 2.1, 2.5, 3.5, 4.5, 5.5 (approximate DIN 7998 wood thread) | 22                                   |

`threadFor(kind, size)` → `{ diameter, pitch }`; `diameter` = the number in
the key (`ST4.2` → 4.2). `defaultSize(kind)`: the nine existing kinds keep
`'M3'` (so `hardwareDefaults()` with no arguments is unchanged); metric screw
kinds `'M6'`; shoulder `'M6'`; tapping `'ST4.2'`; wood `'4.0'`; drywall
`'3.5'`; lag `'8'`. `hardwareDefaults(kind, size)` with a size that is not in
`sizesFor(kind)` uses `defaultSize(kind)` instead of throwing; the panel's
kind change passes the current size through this rule, so switching from a
bolt at M6 to a wood screw lands on 4.0 and switching back lands on M6.
`holePreset` and the tap-drill table stay metric-only and untouched.

## 6. Data

New optional fields on the `hardware` feature (absent ⇒ resolved default;
`resolveHardware(feature)` is the single place that fills them):

| field           | type                      | meaning                                               |
| --------------- | ------------------------- | ----------------------------------------------------- |
| `head`          | key of §4.1               | head style; default = the kind's first allowed head   |
| `drive`         | key of §4.2               | drive; default per kind                               |
| `driveSize`     | mm (number or expression) | §4.2                                                  |
| `point`         | key of §4.3               | default per kind                                      |
| `pointDiameter` | mm                        | drill point Ø (self-drilling)                         |
| `domeHeight`    | mm                        | f of raised countersunk heads and the fillister dome  |
| `threadLength`  | mm                        | shoulder screw thread length                          |
| `neckHeight`    | mm                        | carriage square-neck height f; set-screw dog length z |
| `collarHeight`  | mm                        | thumb screw (high) shoulder height h − k              |
| `wingThickness` | mm                        | wing screw g2                                         |

Existing numeric fields are reused with per-kind meaning (§3): `bodyDiameter`
= shoulder Ø / square-neck width / thumb shoulder Ø / wing collar Ø /
set-screw point Ø / hex across flats for `hex-flange` and `hex-washer` (self
drilling); `headDiameter` = dk / hex across flats (`hex`) / wing span / eye
outer Ø / flange Ø; `headHeight` = k / wing height / eye thickness;
`boreDiameter` = eye bore (eye-bolt only among the screws). Unused fields keep
their default numbers and are simply not shown or validated for that kind.

`hardwareDimensions(feature, parameters)` resolves every field the kind uses
and validates per kind with user-facing sentences in today's style: headed
kinds "The head must be wider than the shank."; countersunk heads additionally
need dk > d; shoulder "The shoulder must be wider than the thread."; set screw
"The point must be narrower than the thread."; eye "The eye bore must be
smaller than the eye."; wing "The wings must span wider than the collar.";
thumb "The knurled head must be wider than the shoulder."; carriage "The
square neck must be at least as wide as the thread."; every recessed drive
"The drive must fit inside the head." (driveSize < the head's top width: dk,
or the hex across flats, or d for a set screw). The nine existing kinds keep
their three existing rules verbatim.

`hardwareNote(f)` for a screw kind: `${label} ${standard}; ${size} × ${pitch}
× ${length} mm; ${head label} head` (only when the kind has > 1 head) `; ${drive
label} ${driveSize}` (when drive ≠ none) `; ${point label} point` (set screws
and self-drilling) `; sizes outside ${standard} estimated` (when `estimated`)
`; simplified envelope, no helical threads, schematic drive recess` + the
existing supplier / installation / minimum-sheet / notes suffixes verbatim.
The nine existing kinds keep today's note text byte for byte.

`createHardware` name stays `${HARDWARE_TYPES[kind]} ${size}` ("Socket head
cap screw M6", "Wood screw 4.0", "Lag / coach screw 8").

## 7. The panel (`HardwarePanel.jsx`)

- **Hardware type**: same `<select>` (label text unchanged, option values =
  keys), options in `<optgroup>`s per §3; the nine existing values first.
- **Metric size**: label text unchanged (scripts), options = `sizesFor(kind)`,
  shown as the key.
- **Head style** `<select>` only when `headsFor(kind).length > 1`; **Drive**
  `<select>` only when `drivesFor(kind).length > 1`; **Point** `<select>` only
  for set screws. Selects apply at once (no live-field debounce). Changing the
  head re-derives `headDiameter`, `headHeight`, `domeHeight`, `driveSize` for
  the new head (`withHead(feature, head)`), keeps length, material, supplier
  fields and typed notes; changing the drive re-derives `driveSize` only
  (`withDrive`); changing the point re-derives `bodyDiameter` / `neckHeight`
  (`withPoint`). The same helpers serve `HardwareFields` in the tree editor
  (`CadEditors.jsx` 229) and in Place (`OperationPanel.jsx` 235), so the
  selects appear there too.
- **Fields**: `hardwareFieldLabels(feature)` returns the ordered `[key, label]`
  list the kind/head needs; `HardwareFields` maps over it exactly as today,
  keeping `key={`${feature.id}-${key}`}` (Phase L: never key a `ValueField` on
  its value). Labels: `length` → "Shank length (mm)" for headed screws,
  "Overall length (mm)" for flush heads and set screws, "Shoulder length (mm)"
  for shoulder screws; `diameter` → "Thread diameter (mm)"; `headDiameter` →
  "Head diameter (mm)" / "Head across flats (mm)" (`hex`) / "Flange diameter
  (mm)" (`hex-flange`) / "Washer diameter (mm)" (`hex-washer`) / "Wing span
  (mm)" / "Eye outer diameter (mm)"; `headHeight` → "Head height (mm)" / "Wing
  height (mm)" / "Eye thickness (mm)" / "Knurl height (mm)"; `bodyDiameter` →
  "Hex across flats (mm)" / "Shoulder diameter (mm)" / "Square neck (mm)" /
  "Collar diameter (mm)" / "Point diameter (mm)"; `boreDiameter` → "Eye bore
  (mm)"; `driveSize` → "Drive size (mm)" (hidden when drive = none);
  `domeHeight` → "Dome height (mm)"; `threadLength` → "Thread length (mm)";
  `neckHeight` → "Neck height (mm)" / "Dog length (mm)"; `collarHeight` →
  "Shoulder height (mm)"; `wingThickness` → "Wing thickness (mm)";
  `pointDiameter` → "Drill point diameter (mm)"; `pitch` → "Thread pitch (mm)";
  then the four supplier fields as today. The nine existing kinds keep today's
  labels and order exactly.
- Help text (first `cad-help` in `HardwareFields`): "Generic editable envelope.
  Enter supplier dimensions for purchased hardware. Threads, knurls, drill
  flutes and clinching deformation are not modeled; drive recesses are
  schematic."
- All derived defaults go through `round2`.

## 8. Downstream consumers (touch or confirm each; report each)

| consumer                                                        | change                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hardwareGeometry.js`                                           | dispatch: `if (SCREW_KINDS[f.kind]) return screwGeometry(f, parameters, own)`; the existing nine-kind code below it **untouched**                                                                                                                                                                                                                                            |
| new `screwGeometry.js` (or a clearly separated section)         | `screwGeometry`, `revolveProfile`, `dome`, `hexPrism` (reuse / move the existing `hex`), `starPrism`, `cutDrive`, `pointSolid`                                                                                                                                                                                                                                               |
| `hardware.js` (+ optional `hardwareCatalog.js` for the tables)  | `SCREW_KINDS`, `HEAD_STYLES`, `DRIVES`, `POINTS`, `SIZE_CATALOGS`, `sizesFor`, `headsFor`, `drivesFor`, `pointsFor`, `threadFor`, `defaultSize`, `resolveHardware`, `withHead`, `withDrive`, `withPoint`, `hardwareFieldLabels`, extended `HARDWARE_TYPES`, `hardwareDefaults`, `hardwareDimensions`, `hardwareNote`; `holePreset`, `threadNote`, `createHardware` unchanged |
| `HardwarePanel.jsx`                                             | §7                                                                                                                                                                                                                                                                                                                                                                           |
| `placementHardware.js`, `placementCuts.js`                      | confirm unchanged: `hardwareName`, `hardwareRadius` (max of headDiameter / bodyDiameter / diameter — right for every new kind because `headDiameter` is the overall width), HUD text, hints                                                                                                                                                                                  |
| `kernel.js`                                                     | unchanged (CRLF per Phase M memory — verify with `git ls-files --eol`)                                                                                                                                                                                                                                                                                                       |
| `fabrication.js` 41                                             | unchanged call; note content from §6                                                                                                                                                                                                                                                                                                                                         |
| `drawings.js`                                                   | unchanged; confirm a sheet with a recessed-drive screw still renders (one test)                                                                                                                                                                                                                                                                                              |
| `ConnectionEditor.jsx`                                          | unchanged (lists hardware features as axes)                                                                                                                                                                                                                                                                                                                                  |
| `cad.css`                                                       | **CRLF in the working tree** (`git ls-files --eol` says `w/crlf`): do not touch; the new selects reuse `.cad-field`                                                                                                                                                                                                                                                          |
| `scripts/verify-hardware-holes.mjs`, `verify-hole-hardware.mjs` | unchanged and must pass                                                                                                                                                                                                                                                                                                                                                      |
| docs                                                            | §10                                                                                                                                                                                                                                                                                                                                                                          |

## 9. Errors and edge cases (handle and test)

- A saved hardware feature of a screw kind with no `head` / `drive` / `point`
  loads and builds with the kind defaults (`resolveHardware`).
- `hardwareDefaults('wood', 'M6')` → size `'4.0'`, no throw; `hardwareDefaults
('shoulder', 'M3')` → `'M6'`; `hardwareDefaults('self-drilling', 'ST2.9')` →
  `'ST4.2'`; `hardwareDefaults()` → today's bolt M3 object (field for field,
  `headDiameter` 6.9 → to 2 dp).
- `driveSize` ≥ head top width → "The drive must fit inside the head."; a set
  screw whose `driveDepth` would exceed 0.7·length is capped, not an error.
- A countersunk head with k ≥ length → "The head must be shorter than the
  screw." (otherwise the point would start above the rim).
- Place / rings: a set screw's ring radius = d/2; a wing screw's = e/2; an eye
  bolt's = d2/2.
- Head change in Place (`placement.hardware`) re-radiuses the rings (Phase M
  rule) — confirm, no new code expected.
- `hardwareDimensions` with parametric expressions (`'=w/4'`) in any new field
  evaluates through `positive(value, parameters, label)` like the old ones.

## 10. Delivery, tests and verification

Order of work (report each as **done / partial / not done**, never silently
drop one):

1. Catalog + rules (`hardware.js` / `hardwareCatalog.js`) with pure unit
   tests (no OCC) — `screwCatalog.test.js`.
2. Geometry (`screwGeometry.js`) with one OCC test building every kind —
   `screwGeometry.test.js`.
3. Panel + fields + the editor/Place paths; DOM tests.
4. Downstream confirmations (BOM note, kernel concentric seat of a countersunk
   screw in a hole row, drawings).
5. Docs + browser script. 6. Re-run every browser script.

Tests (Vitest, run from the **repo root**, never from inside `cad/`; measure
and report the baseline file/test counts for `src/features/sketchstudio/cad`
and for `npm test` **before** changing anything, then the final counts; last
known baseline 2026-11-01: cad 46 files / 507 tests, full 380 / 4647, lint 0
errors / 42 warnings):

- Unit, pure — `screwCatalog.test.js`: `Object.keys(SCREW_KINDS).length === 22`
  and every key is in `HARDWARE_TYPES`; the nine old keys and labels unchanged
  (snapshot the old object literally in the test); `sizesFor` per catalog;
  `defaultSize` fallbacks of §9; `hardwareDefaults('socket-cap', 'M6')` →
  `{ headDiameter: 10, headHeight: 6, driveSize: 5, drive: 'hex-socket',
head: 'socket-cap', point: 'blunt', length: 20 }`; `('countersunk-socket',
'M6')` → dk 13.44, k 3.72; `('button-head', 'M8')` → 14 / 4.4 / s 5;
  `('pan-head', 'M4')` → 8 / 3.1 / phillips 4.6; `('shoulder', 'M8')` →
  bodyDiameter 10, dk 16, k 7, threadLength 13.5, s 5; `('set-screw', 'M6')`
  → head none, point flat, bodyDiameter 4, driveSize 3, length 12;
  `('thumb', 'M6')` → 24 / 5 / ds 12 / collarHeight 10; `('wing', 'M6')` →
  30 / 15 / 10 / wingThickness 2.7; `('eye-bolt', 'M8')` → 18 / bore 8 /
  thickness 9; `('carriage', 'M8')` → 20 / 4.5 / v 8 / f 5;
  `('tapping-pan', 'ST4.2')` → 8.2 / 3.05 / pitch 1.4 / diameter 4.2 / sharp;
  `('self-drilling', 'ST4.8')` → hex-washer, bodyDiameter 8, dk 10.5, k 4.3,
  pointDiameter 4.1, drive none; `withHead(self-drilling, 'pan')` → dk 9.5, k
  3.7, drive phillips; `('wood', '4.0')` → 7.5 / 2.2 / pozidriv / pitch 1.8;
  `withHead(wood, 'round')` → k 2.6; `('chipboard', '5.0')` → 10 / 3 / torx
  4.43; `('drywall', '3.5')` → bugle 8 / 2.1 / pitch 1.6; `('lag', '8')` →
  hex 13 / 5.5 / drive none / sharp; the `estimated` flag true for
  `('button-head', 'M2')`, `('truss-head', 'M12')`, `('eye-bolt', 'M4')` and
  false for the table sizes; `hardwareDimensions` errors of §6/§9 (one test per
  message); `hardwareNote` for socket-cap M6 contains "ISO 4762", "M6 × 1 × 20
  mm", "Hex socket 5", and for the old bolt equals today's string exactly;
  every default of every kind × every size of its catalog × every allowed head
  passes `hardwareDimensions` (loop test); `hardwareFieldLabels` for the old
  nine equals today's label lists.
- Unit, OCC — `screwGeometry.test.js` (reuse the `beforeAll` init of
  `hardware.test.js`, 60 s): one model with all 22 kinds at `defaultSize`
  (default head/drive/point) → `createKernelSession` → every part volume > 0;
  bounds: z max = head top (k, h, c + k, d2, f) within 1e-3 and z max = 0
  (± 1e-3) for countersunk-socket, countersunk-machine, tapping-countersunk,
  drywall, set-screw; z min = −length (−(length + threadLength) for shoulder)
  within 1e-3; x extent = wing span for the wing, = dk for pan/button/cheese;
  y extent = eye thickness for the eye bolt. Specific checks: drive `none`
  volume > drive `hex-socket` volume for a socket cap M6; bugle volume <
  countersunk volume at the same dk, k, d; carriage volume > the same part
  with `neckHeight` 0.01; set-screw `cone` volume < `flat` volume < `dog`
  volume + body; a countersunk-socket M6 seated by a `concentric` connection in
  hole 2 of a 3-hole row (reuse the kernel.test.js Phase M plate) has its
  instance origin at that centre (extend the existing test, do not duplicate
  the fixture); `buildCutList` note for that part contains "ISO 10642";
  `sheetSvg` of a drawing containing a Torx pan head renders (string
  non-empty) — reuse the `rearCoverExample` pattern.
- DOM — `HardwarePanel.dom.test.jsx` (new): the type select has six
  `optgroup`s with the nine old options first; selecting `wood` lists the wood
  sizes with `4.0` selected, shows a "Head style" select with three options
  and a "Drive" select, and no "Point" select; selecting `set-screw` shows
  "Point" with four options and no head select; selecting `socket-cap` shows
  no head select and a "Drive" select; switching back to `bolt` restores
  today's fields in today's order with "Metric size" `M6` (the size survives
  because it is valid); changing Head style to `round` on a wood screw changes
  the "Head height (mm)" field value and keeps a typed "Shank length (mm)";
  `Add hardware` passes a feature with `head`, `drive`, `point` set. The
  existing `CadWorkspace.place.dom.test.jsx` "Add hardware without a hole to
  attach…" test keeps passing unchanged; one new case there: type `socket-cap`
  → Place → a face click → Apply → the committed part is "Socket head cap
  screw M6" with `features[0].drive === 'hex-socket'`.
- Existing suites stay green with **no edits**: `hardware.test.js`,
  `placementHardware.test.js`, `placementCuts.test.js`, `kernel.test.js`,
  `operations.test.js`, the Phase I–M DOM suites, `CadWorkspace.live.dom.test.jsx`.
- Browser (Playwright, Chrome, `CAD_VERIFY_URL=http://localhost:5180/sketch`,
  reuse `scripts/sketch-cad-steps.mjs`; recipe and rules in
  `scripts/verify-hardware-holes.mjs` — read saved positions, never assume the
  origin; the dev server may listen on `[::1]` only — use `localhost`; the New
  confirm is an in-app dialog): new **`scripts/verify-screw-library.mjs`** —
  board → Hole row (4 holes, pitch 50, as `verify-hole-row.mjs`) → Apply →
  Hardware library → `Hardware type` value `countersunk-socket`, `Metric size`
  `M6`, attach unchecked → Add hardware → heading "Place hardware" → top view
  → click holes 1 and 3 → HUD contains `hole centre · Countersunk socket screw
M6 · Board / plate top` → Enter → "Preview ready" → Apply → saved model:
  parts +1 named "Countersunk socket screw M6", `features[0]` has `head
'countersunk'`, `drive 'hex-socket'`, `driveSize 4`, two instances, two
  connections (`holeIndex` 2 on the second, none on the first) → then
  Hardware library → `wood`, size shows `4.0`, `Head style` → `round`, `Drive`
  → `torx` → Add hardware → click the board top away from the holes → Apply →
  part "Wood screw 4.0" with `head 'round'`, `drive 'torx'` → then `set-screw`
  M6, Point `cone` → Add → click the board top → Apply → part "Socket set screw
  (grub screw) M6" with `point 'cone'` → Undo × 3 → counts back → screenshots
  to `artifacts/sketch-cad/screw-library/` (one per added screw, isometric so
  the heads are visible). Then re-run **all** of: `verify-hardware-holes`,
  `verify-hole-row`, `verify-cut-placement`, `verify-hole-hardware`,
  `verify-direct-placement`, `verify-measure-marks`, `verify-start-sketch`,
  `verify-sketch-cad-editing`, `verify-sketch-cad`, `verify-sketch-cad-offline`
  (Chrome half; its Electron half fails since Phase H — report, do not chase).
- Docs: `docs/sketch-studio-cad.md` "Hardware and metric threads": replace
  the first paragraph ("**Hardware library** in Solid or Assemble adds hex
  bolts, nuts, washers, …") with: the six groups and the 22 screw kinds with
  their standards; the Head style / Drive / Point selects and when they
  appear; the size catalogs (metric, ST, wood 3.0–6.0, drywall, lag); that
  defaults come from the standard tables and sizes outside them are
  estimated and said so in the cut-list note; that drive recesses are
  schematic and threads/knurls/flutes are not modelled; flush heads (seating
  plane at the rim, no countersink is cut in the hole — a countersink hole
  option is not built); the not-modelled candidates list of §3. Plain prose,
  no marketing. `docs/sketch-studio-step-by-step.md` never adds hardware
  (grep "Add hardware" finds nothing) — say so and skip.

Process rules (from earlier phases):

- Do **not** commit; the tree holds uncommitted Phase G–M work the user will
  commit. Stay inside `src/features/sketchstudio/cad/`, `scripts/`, `docs/`
  unless wiring requires it; say so if you leave them.
- Match each existing file's line endings — check with `git ls-files --eol`
  for tracked files (as of this writing `hardware.js`, `hardwareGeometry.js`,
  `HardwarePanel.jsx`, `hardware.test.js`, `fabrication.js`, the docs are
  `w/lf`; `cad.css` is `w/crlf`; Phase M reports `CadViewport.jsx`,
  `kernel.js`, `model.js` CRLF) and a byte check for untracked ones; do not
  trust `grep -c $'\r$'` in Git Bash. New files LF.
- `utils/` imports are extensionless and Node cannot load them; keep any new
  Node-run script importing only `.js`-suffixed paths.
- Run `npm run lint` and the full `npm test` at the end; report exact counts.
  Stop any Vite server you start and confirm nothing listens on 5180.
- Flag every judgment call beyond this spec in the final report, with
  file:line anchors for each claim so the audit can verify them. Include in
  the report a table of all 22 kinds at `defaultSize` with the resolved
  `headDiameter`, `headHeight`, `bodyDiameter`, `driveSize`, `length` so the
  audit can compare it with §3.

## 11. Acceptance checklist (used for the audit)

- [ ] `Object.keys(SCREW_KINDS)` is exactly the 22 keys of §3 in that order;
      `HARDWARE_TYPES` has 31 entries, the nine old ones first and unchanged.
- [ ] `hardwareDefaults()` equals today's bolt M3 object (to 2 dp);
      `hardwareNote` and `hardwareFieldLabels` for the nine old kinds are
      unchanged; `hardwareGeometry` for the nine old kinds is the old code.
- [ ] Every kind × catalog size × allowed head builds a solid with volume > 0,
      head top / tip Z extents per §4, drive recess reduces volume, bugle is
      concave, flush heads top out at Z = 0.
- [ ] The panel groups the types, shows Head style / Drive / Point only where
      §7 says, keeps "Metric size" and "Hardware type" labels, falls back the
      size on kind change, re-derives dimensions on head/drive/point change,
      never keys a `ValueField` on its value.
- [ ] A countersunk socket screw seats in two holes of a row via the Phase M
      flow; its BOM note names ISO 10642; the camera does not move on Apply.
- [ ] `verify-screw-library.mjs` passes; the ten earlier browser scripts pass
      unchanged (offline: Chrome half).
- [ ] Lint 0 errors; full `npm test` green; counts reported before/after.
- [ ] Docs updated per §10; no commit; line endings preserved.

## 12. Sources used for the defaults

Standard tables as reproduced by distributors and reference sites (the
official ISO/DIN texts are paywalled; every value above is editable and the
help text says so): ISO 4762 — engineersedge.com/iso_socket_head_screw.htm;
ISO 7045 — engineersedge.com/iso_phillips_Pan_head_screw.htm; ISO 10642 —
westfieldfasteners.co.uk/Standards/ScrewBolt_SHCsk_M.html; ISO 7380-1 —
westfieldfasteners.co.uk/Standards/ScrewBolt-SHBtn-M.pdf and
fastenerdata.co.uk; ISO 1207 — ISO 1207:2011 Table 1 (iteh sample); DIN 965 /
ISO 7046 / ISO 7047 — fasteners.eu and westfieldfasteners.co.uk (M8/M10
disagree between sources); JIS B 1111 truss — cdefasteners.com and
nejireo.com; DIN 6921 — fasten.it/norms/norm/din_6921; ISO 7379 —
fasten.it/en/norms/norm/iso_7379; ISO 4026/4029 — westfieldfasteners.co.uk
GrubFlat / GrubCup tables; DIN 464 — fasten.it/en/norms/norm/din_464; DIN 316
— fasten.it/en/norms/norm/din_316 (column letters unlabeled; the mapping e =
span, h = height, d2 = collar, d3 = hub, g2 = wing thickness, a = collar
height is Fable's reading and is flagged); DIN 444 — fasten.it/norms/norm/
din_444 (form B column); DIN 603 — westfieldfasteners.co.uk/Standards/
ScrewBolt-CrgBlt-M.html (midpoints of max/min); DIN 7981 —
westfieldfasteners.co.uk tapping tables and a Würth ST4.8 listing; DIN 7982 —
keller-kalmbach.com listings (ST4.2, ST4.8) and globalfastener.com; DIN 7504
K/N/P — fasten.it/en/norms/norm/din_7504; DIN 7997 — fasten.it/norms/norm/
din_7997; DIN 7505 — fasten.it/norms/norm/din_7505 (head-form letters as the
page labels them; DIN's own A/B/C lettering may differ — the geometry does not
depend on the letter); DIN 18182 — fasten.it DIN 18182-1/-2 and
fastenerdata.co.uk (dk capped at 8.5 for 3.5–4.2); DIN 571 — fasten.it/norms/
norm/din_571 (2016 nominal s, k); ISO 10664 Torx A dimensions and ISO 7045
recess m — standard reference values; head and drive taxonomy —
fastenersuperstore.com head-styles guide, Wikipedia "Screw" (head shapes) and
"List of screw drives". Where a table was garbled or missing (M8/M10
countersunk, wing letters, drywall dk, wood/lag pitches, dog lengths, set-screw
lengths) the value is marked approximate here and the field is editable.
