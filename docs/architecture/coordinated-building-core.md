# Coordinated Building Core

The canonical project model connects site, levels, structural intent, apartment types, systems, assumptions, and
documentation. Existing floor-owned geometry remains supported while the application migrates incrementally toward a
normalized building graph.

## Canonical ownership

```text
Project
├── Building
│   ├── Brief
│   ├── Site
│   ├── levelIds ───────────────► Project.floors[*]
│   ├── Unit types and instances
│   ├── Systems
│   │   ├── Structural
│   │   │   ├── Grid systems
│   │   │   └── Column stacks ─► Floor.columns[*]
│   │   ├── Plumbing
│   │   ├── Electrical
│   │   └── Envelope
│   └── Assumptions
├── Floors and model geometry
└── Documentation
```

`Floor.columns[*].stackId` is the authoritative forward relationship. A column stack stores its intended plan origin
and a synchronized reverse index of `{ floorId, columnId }` references. Moving one floor's column therefore does not
silently redefine the stack: the coordination engine can report the geometric offset.

## Trust boundary

Every object or result uses one of three confidence labels:

- `modeled`: geometry or design intent exists.
- `checked`: a named deterministic rule evaluated explicit inputs.
- `engineer_verified`: external professional approval; the application never assigns this automatically.

Coordination issues include a stable rule ID, severity, entity references, the exact inputs used, result kind, and a
`professionalReviewRequired` flag. Structural coordination checks do not calculate capacity and must never be presented
as “structurally safe.”

## First enforced relationships

- Building level references mirror the ordered project floor IDs.
- Columns belong to explicit vertical stacks.
- A stack contains at most one column per level.
- Columns are checked against the stored stack origin with a configurable tolerance.
- Multi-level stacks are checked for skipped intermediate levels.
- Both beam ends must reference columns that exist on the beam's level.
- A beam cannot start and end at the same column.

## Migration strategy

Schema 16 introduces the building core without discarding the proven floor geometry model. Migration groups legacy
columns once, preferring matching column names and otherwise matching rounded position and section dimensions. It then
persists the resulting `stackId`; runtime validation never has to rediscover vertical intent from spatial coincidence.

Site boundaries, derived buildable envelopes, and linked apartment definitions now extend the migrated graph. New kernel
features must continue adding explicit relationships rather than independent canvas-only shapes.

## Domain command boundary

Structural kernel mutations use commands rather than reducer-specific object patches. Each command returns the next
immutable project, intentional domain changes, synchronized derived changes, introduced and resolved validation issues,
and exact undo information. Rejected commands are true model no-ops with structured error codes.

The first command set covers structural-grid generation, planned column stacks, explicit column-to-stack assignment,
instance or whole-stack column movement, and beam creation between valid same-level column supports. Grid-linked stack
origins are derived from the referenced axes, including grid rotation, so the grid is model authority rather than a
documentary overlay.

The visible structural workflow now configures a regular numbered/lettered grid with metric spacing, origin, and
rotation. Updating a grid recalculates the intended origins of linked column stacks but deliberately leaves modeled
column geometry unchanged; displaced columns therefore produce explicit alignment findings instead of moving silently.

`PopulateGridColumnStacks` creates stable stack identities at every active grid intersection and can create modeled
column instances across selected levels in one undoable command. Repeating it is idempotent. Column width and depth are
recorded as modeling assumptions, and command consequences explicitly state that engineering capacity was not verified.
The plan overlay renders axes, bubbles, planned stacks, aligned stacks, and measurable offsets from the same structural
graph.

## Site feasibility boundary

The persisted site model stores the property polygon, north angle, road-edge references, and one explicit configured
setback per boundary edge. The buildable envelope and area ledger are derived rather than saved, preventing stale output
after a site or building edit.

Automatic setback geometry currently supports simple convex lots through inward half-plane clipping. Concave lots are
retained but produce a manual-envelope warning; the kernel does not guess a potentially incorrect offset. Lot area and
modeled slab areas are geometry-exact. Buildable area is identified as a derivation from configured setback assumptions,
while rentable area and efficiency remain unavailable until rooms are classified. All site conflicts retain the
professional-review requirement because configured setbacks are not a permitting determination.

The initial site-editing workflow uses one atomic `ConfigureRectangularSite` command. Metric width and depth, model
origin, north angle, road frontage, and front/rear/left/right setback assumptions are committed together, producing one
undo snapshot and one validation transition. The stored `lotSetup` preserves the user's parametric rectangle inputs;
the property polygon and edge relationships remain the canonical geometry used by downstream derivations.

In plan view, the property boundary, road edge, configured setback labels, north indicator, and derived buildable
envelope are rendered from the same site model. The overlay is documentary and non-interactive for this increment; it
does not duplicate or persist separate drawing geometry.

## Apartment program boundary

The building owns a project brief, space program, reusable unit types, and unit instances. A unit type describes design
intent: target area, required space types, permitted counts, and a revision. An instance identifies its type and floor,
records the source revision it last accepted, and can be explicitly detached for a special case.

`Floor.rooms[*].unitInstanceId` is the authoritative unit-membership relationship. The corresponding
`unitInstance.roomIds` list is a synchronized reverse index, so persistence repair and validation do not infer apartment
membership from overlapping geometry. Raw floor duplication clears room membership and requirement references; copied
rooms cannot accidentally remain part of an instance on another floor.

Updating a unit type never silently rewrites room or wall geometry. Linked instances instead become outdated, and the
validator reports both revision staleness and measurable divergence in space types or room areas. The eventual
propagation workflow must be an explicit, previewable domain command with its own undo record.

### Beta geometry-backed unit definitions

`UnitType.geometryTemplate` now stores revisioned walls, rooms, hosted openings, and fixtures in unit-local millimetres.
`UnitInstance.placement` supplies an explicit origin and rotation, while generated plan entities carry
`unitInstanceId`, `unitTemplateKey`, and `unitTemplateGenerated` ownership metadata. Stable generated IDs make repeated
propagation idempotent. The command refuses to overwrite manually mapped target rooms; an intentional exception must be
detached instead. Capturing a new type revision makes other linked instances visibly outdated until propagation brings
them current.

The template is not an independent drawing. Materialized entities are ordinary floor-model entities, so plan, 3D,
quantities, validation, schedules, and sheets continue to consume the same coordinated model.

Room use is classified independently from its geometric boundary as rentable, circulation, service, shared, or parking.
The area ledger aggregates these classifications and labels each value by provenance. Classification commands require an
explicit detach when a room is moved out of a unit, preserving referential integrity.

Apartment checks currently cover broken relationships, cross-floor membership, required-space counts, unit area targets,
linked-instance divergence, planned unit counts, and the initial two-to-four-storey product envelope. These are
deterministic coordination checks, not assertions of code compliance or professional approval.

The Spaces lifecycle now provides a guided typical-unit workflow. One atomic command creates or revises the reusable
unit definition, named room requirements, target area range, planned count, parking target, and aligned project-brief
count. A separate idempotent command creates stable linked instances across selected levels. Neither command draws or
moves room boundaries.

Detected rooms are mapped explicitly to a same-level unit instance and named space requirement. Shared circulation,
service, parking, and other non-rentable rooms are classified independently. Unassigning a room clears both the forward
membership and synchronized instance reverse index, so area and divergence checks always use the same relationship
graph.

## Next kernel increments

The application shell now exposes Brief, Site, Spaces, Structure, Systems, Validate, Quantities, and Documents as the
primary building lifecycle. Stage status is computed from canonical or derived model data. Brief edits pass through the
domain command layer, while the other initial stage panels report the current coordination basis and clearly identify
capabilities that are not yet modeled.

The detailed object tree remains available below the lifecycle panel as the drafting navigator. The canvas status bar
continuously reports the number of coordination findings, making model health visible without presenting the absence of
current findings as professional approval.

The next increments should model stair clearance envelopes and introduce category-specific circulation and environmental
validation. Each increment should continue extending the same graph rather than adding independent canvas-only shapes.

## Stair coordination boundary

Stair checks compare modeled width, riser height, tread depth, total rise, run, the `2R + T` relationship, and explicit
from/to level elevations against a named configurable alpha assumption profile. Findings retain every input and the
profile source; they are comfort and consistency checks rather than Philippine code approval.

Until a stair clearance envelope can be intersected with slabs, beams, landings, and openings, every modeled stair
receives an explicit `HEADROOM_NOT_VERIFIED` finding. This prevents otherwise coordinated plan geometry from being
misrepresented as a completed vertical check.

## Wet-core coordination boundary

Plumbing shafts are first-class vertical entities with a plan origin, modeled opening dimensions, contiguous served
levels, and a configured fixture-planning distance. `fixture.plumbingShaftId` is authoritative; each shaft's
`fixtureRefs` collection is a synchronized reverse index. Floor duplication preserves fixture geometry but clears the
service relationship so a copied fixture cannot silently attach to a shaft that does not serve the new level.

Wet fixtures can be assigned explicitly through a deterministic nearby-fixture command. Checks report unassigned wet
fixtures, missing shafts, unsupported levels, vertical discontinuity, and geometry-exact distances beyond the configured
planning limit. The plan overlay uses the same model for shaft openings, planning zones, and fixture links. These are
early routing relationships, not pipe sizing, drainage design, or hydraulic calculations.

## Quantity and cost boundary

The quantity profile belongs to the canonical building and stores only explicit estimating assumptions: currency,
reinforcement allowance, user-entered unit rates, and optional manual items. No market prices or structural reinforcement
design values are silently supplied. `ConfigureQuantityProfile` updates these assumptions atomically and causes the same
derived model used by the lifecycle shell to recalculate.

The live takeoff currently derives structural concrete, net masonry wall area, formwork contact area, floor finishes,
paint area, roofing area, doors, windows, and plumbing-fixture counts. Column, beam, and slab concrete comes directly
from modeled dimensions; beam length resolves through its support-column references. Wall openings are deducted from
masonry and paint areas. Roof plane slope converts projected area to modeled surface area.

Every takeoff row carries one of four provenance labels: exact from geometry, derived from a configured assembly,
rule-of-thumb allowance, or manually entered. Floor-finish area uses room geometry when available and visibly changes to
an assembly derivation if it must fall back to slab area. Reinforcement remains zero and flagged until the user enters an
explicit kg/m³ allowance. Unresolved beam supports are reported and contribute no invented length.

Costs are calculated only for rows with user-entered rates. The interface calls the result a partial estimate whenever
any visible row remains unpriced and reports price coverage alongside the total. Takeoff and cost outputs are feasibility
information for estimator, supplier, architect, and engineer review—not purchase orders, bids, or construction approval.

## Spatial and environmental coordination boundary

The Alpha spatial profile is a named product assumption set, not a Philippine code library. It currently records a
corridor-width assumption, room-boundary matching tolerance, a cross-ventilation direction threshold, and the room types
that should be checked for natural-ventilation potential. Each resulting finding retains the profile ID, source, measured
geometry, and configured threshold.

Opening checks use the actual host-wall position and width. They report openings outside their wall, overlapping openings
on one wall, and geometry-exact plan intersections between doors or windows and columns. These checks prevent documentary
openings from silently occupying structural geometry; they do not verify lintels, reinforcement, or structural capacity.

Circulation width is presently measured using the minimum polygon projection. This is reliable for the rectangular and
rotated-rectangular corridors targeted by the Alpha scenario but does not detect every local pinch point in a complex
concave corridor. The method name is retained in the finding evidence so the result cannot be mistaken for a complete
accessibility analysis.

Natural-ventilation potential requires a modeled window on a wall adjacent to exactly one detected room. Cross-ventilation
potential requires exterior windows in sufficiently different directions relative to the room centroid. The Validate
stage reports both coverage ratios and flags required room types with no modeled route. These are early tropical-design
signals; they do not calculate effective openable area, pressure, airflow, daylight, mechanical exhaust, or regulatory
compliance.

## Preliminary document package boundary

The Documents lifecycle derives a twelve-item handoff manifest from the current model: project basis, site plan, floor
plans, roof plan, elevations, section, structural layouts, opening schedule, area schedule, quantity summary, validation
report, and coordinated 3D view. Each item reports whether its required model basis exists before package generation.

`GeneratePreliminaryDrawingPackage` creates a stable, idempotent Alpha sheet set and preserves sheets the user created
outside that package. Generated sheet and viewport IDs are deterministic. Re-running the command replaces only the prior
Alpha-generated set, so reports and drawings do not accumulate duplicate revisions.

Site-development sheets use the same property, road, north, setback, buildable-envelope, and ground-plan geometry as the
live model. Model-derived report viewports render project assumptions, room/area schedules, door/window schedules,
quantity/cost provenance, and current validation findings directly into the sheet/export pipeline. Plans, elevations,
sections, and 3D viewports continue to use the existing coordinated geometry sources.

Every generated sheet records a deterministic signature of the building, floors, roof, and truss model. Later model
changes produce a `DOC.GENERATED_PACKAGE_OUTDATED` finding until the user regenerates the package. Empty sheets and broken
floor or section-cut viewport references are also checked. Sheet notes and reports state that the package is preliminary,
for professional review, and not a permit set, construction approval, or structural-safety certification.

## Gamma structural-coordination boundary

Beams and slabs now carry explicit coordination intent instead of relying only on drawing coincidence. A beam records
whether it is typical, cantilevered, or a transfer condition, plus an optional project-specific planning-span assumption
and a required reason for transfer intent. A slab stores stable references to supporting beams, walls, or columns; its
openings are hosted geometry with their own identity and purpose. Raw floor duplication deliberately clears slab-support
references because supports on the source level are not valid relationships on the new level.

The structural screen checks beam planning spans, cantilever declarations and lengths, transfer documentation, slab
support completeness, broken support references, slab planning spans, opening containment, opening/beam intersections,
opening proximity to columns, and unsupported explicitly load-bearing walls. Every finding exposes the configured input,
measured result, assumption source, and professional-review boundary. These checks coordinate modeled relationships; they
do not compute loads, member capacity, reinforcement, deflection, wind, seismic response, soil bearing, or foundations.

The conceptual load-path graph is likewise relational only. It shows column-stack continuity, beam-to-column support,
and slab-to-support links from stored model references. It never contains forces, reactions, capacities, utilization, or
the phrase “structurally safe.” Missing relationships remain visible as unsupported nodes rather than being inferred away.

Slab openings now remain continuous through plan display, 3D extrusion holes, quantity deductions, structural
validation, and preliminary documentation. Structural sheets use a discipline-specific `structural_plan` source and a
model-derived structural schedule instead of reusing a generic architectural plan. Both outputs carry an explicit note
that they are coordination aids and not capacity design.

## Delta services, vertical, and egress boundary

The canonical systems graph now owns plumbing shafts, electrical riser zones, drainage planning routes, modeled exits,
and explicit room-to-exit routes. Each vertical entity stores its footprint and served levels. Each drainage route stores
plan geometry, source shaft, level, invert elevations, and a named minimum-slope assumption. Each egress route stores its
room and exit relationships, path points, and configured planning-distance limit. These are persisted relationships, not
independent markup lines.

`CoordinateVerticalServiceOpenings` is an explicit, idempotent command. It locates the slab containing a vertical
service origin on each upper served level and creates a stable hosted opening with a reverse `serviceRef`. The validator
requires both the reference and measurable footprint overlap. Copying or duplicating slabs clears service references so
new geometry cannot silently remain attached to the original riser. The openings pass through plan display, 3D voids,
structural conflict checks, and quantity deductions from the same geometry.

Drainage checks verify that a route references an existing shaft and level, begins inside the shaft footprint, contains
a usable plan path, falls in the intended direction, and meets its configured planning-slope assumption. No pipe sizes,
flows, fixture-unit calculations, venting, cleanouts, connection approval, or hydraulic performance are inferred.

Egress checks verify same-level room/exit references, start and end geometry, measured path length, and whether each wall
crossing occurs through a modeled door. The distance profile is a transparent product assumption, not a Philippine fire
code determination. Exits are modeled design intent; they are not automatically classified as compliant exits.

A stair may now reference a specific opening in its destination-level slab. The kernel derives the portion of the stair
run that needs the configured clear height beneath the slab and compares that envelope with the hosted opening. Existing
beam-crossing checks remain independent, so an opening alone cannot hide a low beam. Passing both checks means only that
the currently modeled geometry was evaluated; it is not accessibility, code, or professional approval.

Live plan overlays and `services_plan` sheet sources show wet shafts, electrical risers, drainage routes, exits, and
egress paths. The preliminary package adds services plans and a model-derived services schedule only when that model
basis exists. All outputs state that trade design, fire-code approval, and permitting remain professional work.

## Epsilon Philippine feasibility-economics boundary

The canonical quantity profile now owns three explicit feasibility inputs: source-dated Philippine price profiles,
configured assembly definitions, and named budget/rental scenarios. Price profiles separate material, labor, and
equipment components for every takeoff rate key and record region, locality, source label, and source date. The product
does not ship concealed market rates or treat an old price as current. The owner or estimator supplies and maintains the
pricing basis.

Assemblies apply transparent material waste and separate material, labor, and equipment factors to the existing
geometry-derived quantities. Each priced row retains its geometry provenance, pricing basis, component-cost breakdown,
assembly ID, scenario ID, price-profile ID, and source metadata. Legacy flat rates remain readable for backward
compatibility, but new scenarios use the relational profile-and-assembly path.

Feasibility scenarios add configured contingency, professional fees, permit and other allowances, monthly gross rent,
vacancy, and operating-expense assumptions. The derived model reports direct construction cost, total project cost,
cost per gross square metre, net operating income, gross and net yield, simple payback, budget variance, and dominant
cost drivers. If any non-zero modeled quantity lacks a rate, project cost and dependent budget/yield/payback metrics are
withheld instead of presenting a misleading complete result.

Scenario comparison is read-only design intelligence. It calculates configured cost deltas and item-level saving
opportunities without changing walls, structure, systems, finishes, or any other geometry. A lower configured price is
not presented as an approved substitution; supplier, estimator, design, durability, and professional review remain
required.

The Quantities lifecycle stage edits the source basis, component rates, assemblies, and scenarios and shows their live
derived metrics. The preliminary package adds a feasibility deliverable and model-derived report viewport whenever
scenarios exist. Those reports are explicitly feasibility outputs—not bids, appraisals, lending recommendations,
investment advice, purchase orders, or professional cost certifications.

## Zeta professional-handoff and revision boundary

The canonical building now contains a documentation graph for professional review items and immutable review-revision
snapshots. The existing building assumption register is normalized into traceable records with a stable ID, category,
statement, named source, source date, status, entity references, and the `checked` trust label. Missing provenance is a
deterministic handoff finding rather than an invisible gap.

Professional review items store discipline, priority, open/resolved/handoff status, the request or comment, resolution,
author information, entity references, and trust state. An item starts as `modeled`. Closing it requires an explicit
resolution. Open actions remain visible in continuous validation and in the handoff register.

The application cannot produce `engineer_verified` status from geometry or a passing rule. That label is accepted only
through the explicit external-verification command, which requires the user to attest that an outside review occurred
and record professional name, profession, license or registration, date, and reviewed scope. Generated reports state
that this is user-recorded evidence and that signed source documents control. The app does not validate licenses,
signatures, professional standing, or approval authority.

A review revision captures an immutable inventory and fingerprint of the coordination model: project/site basis,
levels, architectural and structural entities, unit relationships, services, price and assembly inputs, scenarios,
roof, and trusses. Review metadata itself is excluded from that fingerprint, so capturing the baseline does not make it
immediately stale. Later additions, removals, and changes are reported by stable entity identity; no attempt is made to
interpret whether a change is acceptable.

The Documents lifecycle exposes assumption entry, review requests and resolutions, external-evidence recording, and
review-revision capture. When a handoff basis exists, the preliminary package adds G-003 with the model-derived
assumption/review/revision register. The active revision code, issue date, description, and preparer appear consistently
in every generated sheet title block. These outputs improve communication and traceability; they are not digital seals,
professional signatures, permit submissions, or construction authorization.

## Eta site-access, equipment, and roof-drainage boundary

The canonical site graph now owns parking bays and vehicle-access centerlines with stable bay-to-route relationships.
The Site lifecycle stage creates a regular early-planning layout, relates every bay to its road access, and reports the
program target beside the modeled count. Deterministic checks cover bay dimensions, property containment, overlap,
ground-floor building collisions, route width, road-frontage connection, route containment, and whether an assigned
route physically reaches its bay. This is not swept-path simulation, traffic engineering, accessibility approval, or a
Philippine parking-code determination.

The systems graph now separates electrical panel zones and electrical points, water-tank and pump reservations, and air-
conditioning outdoor-unit zones. Each zone owns a host location, footprint, clearance, capacity or unit-count intent,
and served-level relationships. Electrical points reference a specific modeled panel. Checks verify host containment,
floor references, configured clearance, and straight-line point-to-panel planning distance. They do not size equipment,
circuits, conductors, breakers, tanks, pumps, pipes, refrigerant lines, or electrical loads.

Roof drains now retain explicit catchment-plane references, discharge destination, and plan route. Flat roofs are checked
for a configured finish-slope assumption, at least one modeled drain, boundary containment, valid outlet relationship,
and route endpoint agreement. Sloped roofs continue to derive gutter and downspout geometry from roof-edge roles. These
results are coordination intent only and do not calculate rainfall intensity, catchment flow, pipe capacity, overflow,
storm return period, or drainage-code compliance.

Parking and service reservations render in live plans and generated sheets from the same canonical model. The package
adds a site-access schedule and, where present, an A-202 roof-drainage coordination sheet. Electrical points contribute
an exact modeled count to takeoff; excavation remains a transparent rule-of-thumb volume derived from ground-slab area
and an owner-configured planning depth. Both retain their provenance and pricing basis.

Revision snapshots inventory parking bays, access routes, equipment zones, and electrical points independently, so
professional reviewers can distinguish added, removed, and changed coordination objects. Passing Eta proves only that
these modeled relationships agree geometrically with the configured assumptions. Licensed architects, engineers,
trade designers, estimators, and permitting professionals remain responsible for verification and final design.

## Theta deterministic program-to-test-fit boundary

The canonical building now owns a test-fit profile, stable generated alternatives, and explicit selected and accepted
option relationships. The profile records apartment depth, shared-corridor width, stair and wet-core reservations,
structural-bay target, floor-to-floor height, and an optional planning cost per square metre. Site boundary and setbacks,
brief storeys and budget, apartment unit targets, modeled parking count, and this profile form a deterministic input
signature. Any later change makes the prior alternative visibly outdated instead of silently reusing stale geometry.

The composer currently compares single-loaded and double-loaded apartment arrangements. Each alternative owns
level-specific unit, corridor, stair-core, and wet-core blocks; a proposed structural grid; footprint, gross, rentable,
circulation, and service areas; efficiency; maximum grid span; optional planning cost and budget variance; traceable
findings; and a transparent score. Cost is withheld until the owner supplies an explicit rate and remains labeled a
rule-of-thumb allowance. No concealed market price or generated structural calculation is used.

Generation is read-only with respect to authored floor geometry. Acceptance is a separate undoable domain command and
is blocked when the alternative is stale, extends outside the checked buildable envelope, or a floor contains manually
authored geometry. A successful acceptance materializes provisional rooms, boundary walls, slabs, linked apartment
instances, a proposed structural grid, and a continuous wet-service shaft. These objects use the same canonical model
as plan, 3D, area, quantity, validation, revision, and document outputs.

The Spaces lifecycle stage exposes assumptions, comparison previews, scores, costs, findings, selection, and acceptance.
The preliminary package includes a deterministic test-fit comparison report, and revision snapshots inventory the
profile, every alternative, and the selection/acceptance state. Passing Theta means that the first modeled apartment
basis is reproducible and traceable from owner inputs. It does not mean the layout satisfies architecture, accessibility,
fire, structural, plumbing, electrical, parking, permitting, or professional-design requirements.

## Iota apartment-design closure boundary

The accepted test fit can now be converted, through one guarded and undoable command, from planning blocks into actual
apartment rooms, partitions, hosted doors and windows, representative furniture and wet fixtures, a stair for each level
transition, stair and plumbing slab openings, and explicit room-to-stair/exit routes. Generated entities retain stable
references to the accepted test fit and apartment-design state. Regeneration removes only prior Iota-generated detail
and refuses to overwrite unrelated authored architecture.

The apartment-design profile records service-band and bathroom dimensions, opening widths, room-adjacency length,
fixture clearances, stair geometry, headroom, travel-distance intent, daylight-glazing ratio, accessibility-intent
widths, and solar orientations that require review. The profile and accepted test fit form a deterministic signature;
changing either produces an outdated-design warning rather than silently treating old detail as current.

Continuous checks evaluate every required room adjacency—including each bedroom independently—fixture clearance inside
its assigned room, fixture-to-fixture clearance conflicts, habitable-room glazing ratio, site-north-relative solar
orientation, modeled unit egress relationships, accessibility-intent corridor and entry widths when requested in the
brief, and whether every vertical transition has an actual stair. Existing spatial rules continue to report door-swing,
natural-ventilation, and cross-ventilation geometry. These are transparent configured rules and geometric results, not
Philippine code determinations.

The same detailed model feeds plan overlays, 3D preview objects, opening and area schedules, exact modeled counts in the
quantity takeoff, egress and vertical checks, professional revision fingerprints, persistence, and the preliminary
package. Q-001 adds an apartment-design quality report covering adjacency, clearance, daylight/orientation,
cross-ventilation potential, and circulation-path status.

Passing Iota proves that the initial two-storey, four-studio scenario has a reproducible architectural coordination
basis whose dependent outputs agree. Furniture remains a clearance probe, egress paths are modeled intent, solar and
daylight results are geometric potential, and accessibility widths are owner-configured intent. Licensed architects,
engineers, trade designers, accessibility specialists, and permitting authorities must verify and finalize the design.

## Kappa coordinated structural-realization boundary

The structural system now owns a persisted realization profile and state tied to the accepted test fit and current
apartment-design signature. The profile records modeled column and beam dimensions; the state records stable generated
stack, column, and beam references, opening-driven omitted grid segments, and the explicit absence of a foundation
basis. Grid, level, slab-boundary, slab-opening, apartment-design, and member-assumption inputs form a deterministic
signature, so changed inputs make the structural basis visibly outdated.

One guarded, undoable command converts the accepted proposed grid into a column stack at every grid intersection,
continuous column geometry on every level, and beams between adjacent grid supports. Every beam stores two same-level
column references. Before accepting a beam segment, the materializer checks its plan outline against modeled stair and
service openings. A crossing segment is omitted and recorded as an unresolved trimming/framing condition rather than
silently producing a beam-opening collision. Regeneration replaces only prior Kappa-generated frame objects and refuses
to overwrite manually authored columns, beams, or populated stacks.

Every slab persists inferred beam and existing loadbearing-wall support references. The conceptual load-path diagram
then connects slabs to supports, beams to columns, and upper columns to the stack member below. It remains a relationship
diagram only: no gravity or lateral loads, tributary areas, reactions, member forces, capacity, or safety conclusion is
created. Columns terminate at the lowest modeled level with an explicit foundation-not-modeled warning.

Continuous structural validation now distinguishes a door/window that geometrically intersects a column from an
opening that is merely within the configured review clearance. Existing checks continue to cover unsupported beam ends,
stack alignment and continuity, planning spans, slab supports, slab-opening containment, slab-opening/beam conflicts,
transfer intent, and stair/beam headroom.

The same realized frame appears in structural plans, live conceptual load-path overlays, coordinated 3D, concrete and
formwork quantities, structural schedules, professional revision fingerprints, persistence, and preliminary documents.
Q-001 adds a structural-realization basis report describing continuity, supports, opening bypasses, load-path
relationships, and the foundation boundary.

Passing Kappa proves that the accepted Iota apartment basis and its modeled RC frame agree as deterministic geometry and
relationships. Modeled member sizes remain planning assumptions. Licensed structural engineers must determine loads,
analysis model, material strengths, member sizes, reinforcement, connections, foundations, seismic and wind design,
soil parameters, code compliance, and structural safety.

## Lambda coordinated building-systems-realization boundary

The building systems graph now owns a persisted realization profile and state tied to the accepted test fit, current
apartment-design signature, and current Kappa structural-realization signature. One guarded command converts that basis
into a continuous electrical-riser reservation, structurally clear upper-level penetration, one panel reservation per
level, linked representative electrical points per apartment, a straight-line branch-drainage intent for every assigned
wet fixture, water-tank and pump reservations, and aggregate air-conditioning outdoor-unit zones.

The materializer uses stable IDs and replaces only prior Lambda-generated objects. It refuses to overwrite manually
authored routes, risers, panels, points, or equipment zones. Electrical-riser candidates are searched inside the shared
corridor and rejected when their required penetration falls outside a slab or intersects a modeled column, beam, or
existing slab opening. Generated openings retain explicit electrical-riser references; every electrical point retains
its panel, room, unit, and level relationship; every drainage branch retains its fixture and shaft relationship.

Continuous validation checks the accepted, apartment, and structural source signatures; generated-reference integrity;
vertical opening relationships; drainage path, source, and configured slope intent; equipment host containment and
clearance; point-to-panel relationships and planning distance; and all existing structural opening collisions. A later
change to apartments, fixtures, shafts, slabs, columns, beams, levels, or Lambda assumptions makes the realization
visibly outdated.

The same canonical systems objects appear in live services overlays, M-series sheets, the coordinated 3D preview,
exact modeled electrical-point quantities, services schedules, revision fingerprints, persistence, professional
handoff, and the Q-001 Lambda realization-basis report. The report states every source relationship and limitation.

Passing Lambda proves early geometric and relational coordination only. Drainage routes are straight-line plan intent;
points are representative owner-configured counts; equipment shapes are reservations. No pipe sizing, hydraulic or
vent calculation, electrical load or circuit design, conductor or breaker sizing, equipment selection, refrigerant
routing, fire-protection design, code compliance, permit approval, or construction authorization is performed.
Licensed architects and plumbing, electrical, mechanical, fire-protection, structural, and permitting professionals
must verify and finalize the systems design.

## Mu coordinated quantity-and-cost-realization boundary

The canonical building now owns a persisted Mu profile and accepted cost state tied to the accepted test fit and the
current Lambda systems signature. Quantity assumptions, all source-dated price profiles, explicit assemblies, every
feasibility scenario, owner budget, rental target, and geometry-derived takeoff basis form one deterministic input
signature. Any later model, rate, assembly, budget, rent, or scenario change marks the accepted baseline outdated.

Acceptance is guarded. Lambda must be current; the active scenario must use a named, dated Philippine price source
with region; every non-zero quantity must have complete material, labor, and equipment pricing; and every used takeoff
category must reference an explicit assembly. The accepted state snapshots line-item quantities, provenance, inputs,
assembly IDs, component rates, estimated costs, scenario economics, budget variance, NOI, net yield, and simple payback.

Alternative configured scenarios produce traceable value-engineering candidates only when their comparable line item
is cheaper. Each candidate retains baseline and alternative scenario references, quantity, rate delta, estimated
saving, and a decision status. Shortlisting does not change geometry or accept a substitution; professional design,
supplier, estimator, and constructability review remains required.

The Quantities lifecycle exposes baseline currency, assembly coverage, accepted totals, scenario snapshots, candidate
decisions, and current/outdated status. Q-001 adds the accepted Mu basis, while professional revision fingerprints and
persistence retain the exact baseline that was presented for review.

Passing Mu proves that modeled architecture, structure, services, assembly quantities, configured prices, owner budget,
and rental assumptions agree at one traceable point in time. It is an owner feasibility estimate—not a contractor bid,
bill of quantities certified by a quantity surveyor, appraisal, lending recommendation, investment advice, purchase
order, accepted material substitution, or construction-cost guarantee. Qualified estimators, suppliers, contractors,
architects, engineers, and other licensed professionals must verify scope, specifications, rates, allowances, market
conditions, tax, procurement, and final cost.

## Nu coordinated professional-documentation-realization boundary

The canonical building now owns a persisted Nu documentation profile and issue state. Nu is tied to the current Mu
signature, accepted test fit, immutable active review revision, and document-model signature. The issue record freezes
sheet metadata, viewport sources and scales, deliverable readiness, derived-annotation counts, and every deterministic
finding disclosed when the package was issued. Model, assumption, price, revision, or coordinated-system changes make
the issue visibly outdated.

Issuance is guarded. The package requires the project/site basis; plans for every level; elevations and a referenced
building section; structural and services plans for every level; room, opening, structural, services, quantity,
feasibility, Mu, and validation reports; coordinated 3D; professional-handoff records; unique sheet numbers; complete
issue metadata; valid viewport geometry and floor references; and canonical derived dimensions and object tags on each
modeled floor. Roof and parking deliverables become required when those scopes are configured.

The issued Q-001 package includes a Nu issue register alongside Alpha-through-Mu reports. Each sheet carries the active
review revision code, issue date, preparer, and preliminary-review notes. Deterministic warnings and errors are included
as disclosed review findings rather than hidden or interpreted as approved. Reissuing is explicit and replaces only
the prior Nu-generated package; unrelated user-authored sheets remain untouched.

Passing Nu proves that one identifiable professional-review issue was generated consistently from the same coordinated
architectural, structural, services, quantity, cost, assumption, and revision basis. It does not prove drafting-code
compliance, completeness for a particular permitting office, professional authorship, digital sealing, architectural
or engineering approval, tender completeness, construction authorization, or as-built accuracy. Licensed architects,
engineers, quantity surveyors, trade professionals, contractors, and permitting authorities must review, revise, sign,
seal, and authorize the appropriate final documents.

## Xi professional interoperability and review-exchange boundary

The canonical building now owns a persisted Xi exchange profile and an append-only register of published exchanges.
Each exchange freezes the complete current Nu issue into a machine-readable handoff manifest: source model, Mu, Nu,
and revision signatures; every issued sheet and viewport; disclosed findings; annotation basis; deliverables; artifact
paths; and explicit trust boundaries. Publishing is guarded: a current, unaltered Nu issue is required.

The browser export path renders all frozen issue sheets through the same sheet renderer into one vector multi-page PDF.
It also produces one metric AutoCAD R12 DXF per issued sheet, preserving architectural, structural, services, site,
roof, and report layers where the source view provides model geometry. The ZIP exchange includes those artifacts,
`handoff-manifest.json`, reviewer markups, external responses, and the comparison with the preceding Xi issue. DXF is
a portable coordination export; the application does not claim IFC conformance or certification.

Reviewer markups retain their exchange, issued-sheet, optional viewport and sheet-coordinate references, author,
organization, date, discipline, source file, and comment. External professional responses are separate preserved
evidence records linked to a markup. Recording a name, profession, registration number, disposition, or response never
changes the model's confidence to engineer-verified and never grants a seal, permit acceptance, or approval.

Issue comparison is deterministic and operates on immutable exchange snapshots. It reports added, removed, and
changed sheets and disclosed findings, plus model- and revision-signature changes. Passing Xi proves that an issued Nu
basis can move through a traceable professional review loop without losing provenance. It does not prove that a
recipient opened the files, that CAD translation is lossless, that an authority accepted a submission, or that a
licensed professional approved the design.
