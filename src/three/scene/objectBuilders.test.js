import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDoor, createFloor, createRailing, createSlab, createStair, createWall } from '@/domain/models';
import { buildFloorPreviewObjects } from './objectBuilders';
import { buildPreviewScene } from './buildPreviewScene';
import { createWallDetailing } from '@/domain/wallDetailing';
import { createMaterialPalette, disposeMaterialPalette } from '@/features/floorplan/components/preview/materials';

describe('buildFloorPreviewObjects', () => {
  it('lifts a wall standing on a beam off the slab in 3D', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.elevation = 0;
    // A wall sitting on a 450 plinth beam, 2100 tall: it must occupy
    // 450..2550, not 0..2100.
    floor.walls = [{ ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200, { height: 2100 }), baseOffset: 450 }];

    const wallBox = buildFloorPreviewObjects(floor).find((object) => object.kind === 'wall');

    expect(wallBox.baseElevation).toBeCloseTo(450, 6);
    expect(wallBox.bounds.minElevation).toBeCloseTo(450, 6);
    expect(wallBox.bounds.maxElevation).toBeCloseTo(2550, 6);
  });

  it('runs a bypass wall past its deck and up to the floor above', () => {
    const floor = createFloor('First Floor', 1);
    floor.elevation = 3000;
    floor.walls = [{ ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200, { height: 2100 }), framingMode: 'bypass' }];
    floor.slabs = [
      createSlab(
        floor.id,
        [
          { x: -500, y: -500 },
          { x: 4500, y: -500 },
          { x: 4500, y: 500 },
          { x: -500, y: 500 },
        ],
        250,
        3000,
      ),
    ];

    const wallBox = buildFloorPreviewObjects(floor).find((object) => object.kind === 'wall');

    // 250 below its own floor, up to the floor above — not 3000..5100.
    expect(wallBox.bounds.minElevation).toBeCloseTo(2750, 6);
    expect(wallBox.bounds.maxElevation).toBeCloseTo(6000, 6);
  });

  it('carries slab openings into the coordinated 3D prism descriptor', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.slabs = [
      createSlab(
        floor.id,
        [
          { x: 0, y: 0 },
          { x: 5000, y: 0 },
          { x: 5000, y: 4000 },
          { x: 0, y: 4000 },
        ],
        150,
        0,
        {
          openings: [
            {
              id: 'opening_1',
              purpose: 'stair',
              boundaryPoints: [
                { x: 1000, y: 1000 },
                { x: 2000, y: 1000 },
                { x: 2000, y: 2000 },
                { x: 1000, y: 2000 },
              ],
            },
          ],
        },
      ),
    ];

    const slabDescriptor = buildFloorPreviewObjects(floor).find((entry) => entry.kind === 'slab');

    expect(slabDescriptor.holes).toEqual([
      [
        { x: 1000, y: 1000 },
        { x: 2000, y: 1000 },
        { x: 2000, y: 2000 },
        { x: 1000, y: 2000 },
      ],
    ]);
  });

  it('mounts electrical devices on the wall face at their mount height', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 });
    floor.walls = [wall];
    floor.electricalDevices = [
      { id: 'elec_1', wallId: wall.id, offset: 2000, deviceType: 'switch-3way', side: 'right', mountHeight: 1200 },
      { id: 'elec_2', wallId: wall.id, offset: 3000, deviceType: 'outlet-220v', side: 'left', mountHeight: 300 },
      { id: 'elec_3', wallId: 'wall_gone', offset: 100, deviceType: 'outlet', side: 'right', mountHeight: 300 },
    ];

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.kind === 'electricalDevice');

    expect(descriptors.map((entry) => entry.id)).toEqual(['elec_1', 'elec_2']);
    const [threeWay, range] = descriptors;

    // wall runs along +x, so 'right' (+perp) is +y and 'left' is -y in plan
    expect(threeWay.center.x).toBeCloseTo(2000);
    expect(threeWay.center.y).toBeGreaterThan(wall.thickness / 2);
    expect(range.center.x).toBeCloseTo(3000);
    expect(range.center.y).toBeLessThan(-wall.thickness / 2);

    // plate is centred on the mount height and rides the opaque plate material
    expect(threeWay.baseElevation + threeWay.size.y / 2).toBeCloseTo(1200);
    expect(range.baseElevation + range.size.y / 2).toBeCloseTo(300);
    expect(threeWay.materialKey).toBe('electricalPlate');
    expect(threeWay.metadata.sourceId).toBe('elec_1');

    // each device carries its type and mounting face so the 3D builder can
    // shape sockets/toggles per type and aim them at the served room
    expect(threeWay.geometry).toBe('electricalDevice');
    expect(threeWay.deviceType).toBe('switch-3way');
    expect(threeWay.faceSign).toBe(1);
    expect(range.deviceType).toBe('outlet-220v');
    expect(range.faceSign).toBe(-1);
  });

  it('carries the selected board-wall assembly into the 3D material and metadata', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, {
      assembly: { preset: 'plywood', framing: { material: 'timber', spacing: 400 } },
    });
    floor.walls = [wall];

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.kind === 'wall');
    const core = descriptors.find((entry) => entry.metadata.assemblySide === 'core');
    const interior = descriptors.find((entry) => entry.metadata.assemblySide === 'interior');
    const exterior = descriptors.find((entry) => entry.metadata.assemblySide === 'exterior');
    expect(core.materialKey).toBe('wallFramingTimber');
    expect(interior.materialKey).toBe('wallPlywood');
    expect(exterior.materialKey).toBe('wallPlywood');
    expect(core.metadata.wallAssembly).toMatchObject({
      preset: 'plywood',
      system: 'framed',
      framing: { material: 'timber', spacing: 400 },
    });
  });

  it('keeps mixed inside and outside board materials distinct in 3D', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, {
        assembly: {
          preset: 'mixed_board',
          interior: { material: 'plywood', thickness: 12, layerCount: 1 },
          exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
        },
      }),
    ];

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.kind === 'wall');
    const interior = descriptors.find((entry) => entry.metadata.assemblySide === 'interior');
    const exterior = descriptors.find((entry) => entry.metadata.assemblySide === 'exterior');
    expect(interior.materialKey).toBe('wallPlywood');
    expect(exterior.materialKey).toBe('wallFiberCement');
    expect(interior.center.y).toBeLessThan(0);
    expect(exterior.center.y).toBeGreaterThan(0);
  });

  it('renders detailed panels, framing members, gaps, and fasteners as real 3D descriptors', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
    });
    wall.assembly.detailing = createWallDetailing({
      enabled: true,
      sides: {
        interior: {
          enabled: true,
          layout: { boardWidth: 1000, boardHeight: 1500, horizontalGap: 10, verticalGap: 10 },
        },
      },
    });
    floor.walls = [wall];

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.metadata.wallId === wall.id);

    expect(descriptors.some((entry) => entry.metadata.wallDetailKind === 'panel')).toBe(true);
    expect(descriptors.some((entry) => entry.metadata.wallDetailKind === 'framing')).toBe(true);
    expect(descriptors.some((entry) => entry.metadata.wallDetailKind === 'fastener')).toBe(true);
    expect(descriptors.some((entry) => entry.geometry === 'fastener')).toBe(true);
    expect(descriptors.find((entry) => entry.geometry === 'fastener')).toMatchObject({
      radius: 4,
      depth: 1.5,
      materialKey: 'wallFiberCement',
    });
    expect(descriptors.filter((entry) => entry.metadata.wallDetailKind === 'panel').length).toBeGreaterThan(2);
  });

  it('frames a bypass wall over its whole span in 3D and carries the deck on a ledger', () => {
    const floor = createFloor('First Floor', 1);
    floor.elevation = 3000;
    floor.floorToFloorHeight = 3000;
    const wall = {
      ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, {
        height: 2100,
        assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
      }),
      framingMode: 'bypass',
    };
    wall.assembly.detailing = createWallDetailing({ enabled: true, sides: { interior: { enabled: true } } });
    floor.walls = [wall];
    floor.slabs = [
      createSlab(
        floor.id,
        [
          { x: -500, y: -500 },
          { x: 4500, y: -500 },
          { x: 4500, y: 500 },
          { x: -500, y: 500 },
        ],
        250,
        3000,
      ),
    ];

    const framing = buildFloorPreviewObjects(floor).filter((entry) => entry.metadata.wallDetailKind === 'framing');
    const studs = framing.filter((entry) => entry.metadata.framingKind === 'stud');

    // The board skins have always run 2750..6000 here. The studs used to stop at
    // 2750 + 2100, leaving full-height cladding over a frame that ended short.
    expect(studs.length).toBeGreaterThan(0);
    expect(Math.min(...studs.map((entry) => entry.bounds.minElevation))).toBeCloseTo(2750, 6);
    expect(Math.max(...studs.map((entry) => entry.bounds.maxElevation))).toBeCloseTo(6000, 6);

    const ledger = framing.find((entry) => entry.metadata.framingKind === 'ledger');
    expect(ledger.bounds.minElevation).toBeCloseTo(2750, 6);
    expect(ledger.bounds.maxElevation).toBeCloseTo(3000, 6);
    // Ledgers are boxes in the framing material, so they fold into the batch the
    // studs already use rather than minting a bucket of their own.
    expect(ledger.materialKey).toBe(studs[0].materialKey);
  });

  it('places an outside-face panel on fiber cement at the same wall-local U position', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: {
        preset: 'mixed_board',
        interior: { material: 'plywood', thickness: 12, layerCount: 1 },
        exterior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
      },
    });
    wall.assembly.detailing = createWallDetailing({
      enabled: true,
      activeSide: 'exterior',
      sides: {
        exterior: {
          enabled: true,
          layout: {
            mode: 'custom',
            customPanels: [{ id: 'left-facade-panel', u: 100, v: 0, width: 900, height: 1200 }],
          },
        },
      },
    });
    floor.walls = [wall];

    const panel = buildFloorPreviewObjects(floor).find(
      (entry) => entry.metadata.wallDetailElementId === 'left-facade-panel',
    );

    expect(panel).toMatchObject({
      center: { x: 550 },
      materialKey: 'wallFiberCement',
      metadata: { assemblySide: 'exterior', boardMaterial: 'fiber_cement' },
    });
    expect(panel.center.y).toBeGreaterThan(0);
  });

  it('rebuilds detailed 3D descriptors from customized panels, framing, and screws', () => {
    const floor = createFloor('Ground Floor', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
    });
    wall.assembly.detailing = createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true } },
    });
    floor.walls = [wall];

    const generated = buildFloorPreviewObjects(floor).filter((entry) => entry.metadata.wallId === wall.id);
    const nextWall = {
      ...wall,
      assembly: {
        ...wall.assembly,
        detailing: createWallDetailing({
          enabled: true,
          framing: {
            mode: 'custom',
            members: [
              {
                id: 'custom-stud',
                kind: 'stud',
                orientation: 'vertical',
                u0: 475,
                u1: 525,
                v0: 0,
                v1: 3000,
                depth: 75,
              },
            ],
          },
          sides: {
            interior: {
              enabled: true,
              layout: {
                mode: 'custom',
                customPanels: [{ id: 'custom-panel', u: 100, v: 200, width: 900, height: 1200 }],
              },
              fasteners: {
                mode: 'custom',
                manual: [{ id: 'custom-screw', u: 500, v: 600 }],
              },
            },
          },
        }),
      },
    };
    const nextFloor = { ...floor, walls: [nextWall] };
    const customized = buildFloorPreviewObjects(nextFloor).filter((entry) => entry.metadata.wallId === wall.id);
    const panels = customized.filter((entry) => entry.metadata.wallDetailKind === 'panel');
    const framing = customized.filter((entry) => entry.metadata.wallDetailKind === 'framing');
    const fasteners = customized.filter((entry) => entry.metadata.wallDetailKind === 'fastener');

    expect(customized).not.toEqual(generated);
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({
      size: { x: 900, y: 1200 },
      // The bare panel id, like framing and fasteners below: this is what the
      // wall editor selects by, and the 3D highlight is driven off its selection.
      metadata: { wallDetailElementId: 'custom-panel', assemblySide: 'interior' },
    });
    expect(framing).toHaveLength(1);
    expect(framing[0].metadata.wallDetailElementId).toBe('custom-stud');
    expect(fasteners).toHaveLength(1);
    expect(fasteners[0].metadata.wallDetailElementId).toBe('custom-screw');

    nextWall.assembly.detailing.sides.interior.layout.customPanels = [
      {
        id: 'traced-panel',
        outlinePoints: [
          { u: 100, v: 200 },
          { u: 1000, v: 200 },
          { u: 1000, v: 900 },
          { u: 500, v: 1400 },
          { u: 100, v: 900 },
        ],
      },
    ];
    const traced = buildFloorPreviewObjects(nextFloor).find(
      (entry) => entry.metadata.wallDetailElementId === 'traced-panel',
    );
    expect(traced).toMatchObject({ geometry: 'wallPanel', depth: 6 });
    expect(traced.outline).toHaveLength(5);
  });

  it('rakes a railing drawn along a stair so it follows the run instead of floating flat', () => {
    const floor = createFloor('Ground Floor', 0);
    // Stair at origin running +x: 10 risers x 175mm rise, 250mm treads -> run 2500, total rise 1750
    const stair = createStair({ x: 0, y: 0 }, 1000, 10, 175, 250, { angle: 0 });
    floor.stairs = [stair];
    // Railing drawn along the stair's edge (y = halfWidth)
    const railing = createRailing({ x: 0, y: 500 }, { x: 2500, y: 500 });
    floor.railings = [railing];

    const descriptor = buildFloorPreviewObjects(floor).find((entry) => entry.kind === 'railing');

    // Base follows the nosing pitch line: first nosing top (175) up to the stair's total rise (1750)
    expect(descriptor.slopeRise).toBeCloseTo(1575, 5);
    expect(descriptor.baseElevation).toBeCloseTo((175 + 1750) / 2, 5);
    expect(descriptor.bounds.minElevation).toBeCloseTo(175, 5);
    expect(descriptor.bounds.maxElevation).toBeCloseTo(1750 + railing.height, 5);
  });

  it('keeps a railing away from any stair flat at floor level', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.stairs = [createStair({ x: 0, y: 0 }, 1000, 10, 175, 250, { angle: 0 })];
    const railing = createRailing({ x: 0, y: 3000 }, { x: 2500, y: 3000 });
    floor.railings = [railing];

    const descriptor = buildFloorPreviewObjects(floor).find((entry) => entry.kind === 'railing');

    expect(descriptor.slopeRise || 0).toBe(0);
    expect(descriptor.baseElevation).toBe(0);
  });

  it('rakes an upper-floor railing over a stairwell along the stair arriving from the floor below', () => {
    // Stair on the ground floor: 10 x 300mm risers over 250mm treads -> arrives exactly at 3000
    const ground = createFloor('Ground Floor', 0);
    ground.elevation = 0;
    const stair = createStair({ x: 0, y: 0 }, 1000, 10, 300, 250, { angle: 0 });
    ground.stairs = [stair];

    // Railing drawn on the upper floor, over the stairwell, along the flight
    const upper = createFloor('Second Floor', 1);
    upper.elevation = 3000;
    const railing = createRailing({ x: 0, y: 500 }, { x: 2500, y: 500 });
    upper.railings = [railing];

    const scene = buildPreviewScene({ floors: [ground, upper] }, {});
    const upperFloor = scene.floors.find((entry) => entry.floorId === upper.id);
    const descriptor = upperFloor.objects.find((entry) => entry.kind === 'railing');

    // Elevations come from the stair's own floor base, not the railing's floor
    expect(descriptor.bounds.minElevation).toBeCloseTo(300, 5);
    expect(descriptor.slopeRise).toBeCloseTo(2700, 5);
    expect(descriptor.baseElevation).toBeCloseTo((300 + 3000) / 2, 5);
  });

  it('prefers the railing floor own stair over stairs from other floors', () => {
    const ground = createFloor('Ground Floor', 0);
    ground.elevation = 0;
    ground.stairs = [createStair({ x: 0, y: 0 }, 1000, 10, 300, 250, { angle: 0 })];

    // Stacked stairwell: the upper floor has its own stair on the same footprint
    const upper = createFloor('Second Floor', 1);
    upper.elevation = 3000;
    upper.stairs = [createStair({ x: 0, y: 0 }, 1000, 10, 300, 250, { angle: 0 })];
    upper.railings = [createRailing({ x: 0, y: 500 }, { x: 2500, y: 500 })];

    const scene = buildPreviewScene({ floors: [ground, upper] }, {});
    const upperFloor = scene.floors.find((entry) => entry.floorId === upper.id);
    const descriptor = upperFloor.objects.find((entry) => entry.kind === 'railing');

    // Rakes from the upper floor's own base (3000 + first nosing), not from below
    expect(descriptor.bounds.minElevation).toBeCloseTo(3300, 5);
  });

  it('rebuild key for every floor tracks all floors stairs so cross-floor railings invalidate the cache', () => {
    const ground = createFloor('Ground Floor', 0);
    ground.elevation = 0;
    ground.stairs = [createStair({ x: 0, y: 0 }, 1000, 10, 300, 250, { angle: 0 })];
    const upper = createFloor('Second Floor', 1);
    upper.elevation = 3000;
    upper.railings = [createRailing({ x: 0, y: 500 }, { x: 2500, y: 500 })];

    const before = buildPreviewScene({ floors: [ground, upper] }, {});

    // Immutable stair edit on the ground floor (as the reducers do)
    const editedGround = { ...ground, stairs: [{ ...ground.stairs[0], numberOfRisers: 12 }] };
    const after = buildPreviewScene({ floors: [editedGround, upper] }, {});

    const upperKeyBefore = before.floors.find((entry) => entry.floorId === upper.id).sourceKey;
    const upperKeyAfter = after.floors.find((entry) => entry.floorId === upper.id).sourceKey;

    // The upper floor's sourceKey must change even though the upper floor itself
    // is untouched — its railing geometry depends on the ground floor's stair.
    expect(upperKeyBefore.stairSources).not.toEqual(upperKeyAfter.stairSources);
  });
});

describe('rainscreen facades in 3D', () => {
  function rainscreenFloor() {
    const floor = createFloor('Ground Floor', 0);
    floor.walls = [
      createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, {
        height: 5400,
        assembly: { preset: 'fiber_cement', exterior: { material: 'rainscreen' } },
      }),
    ];
    return floor;
  }

  it('builds the facade as separate cassettes on the module grid, not one board box', () => {
    const floor = rainscreenFloor();

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.kind === 'wall');
    const cassettes = descriptors.filter((entry) => entry.metadata.boardMaterial === 'rainscreen');

    // Seven across by three up over the wall's resolved span, plus the core and
    // the fibre-cement lining, which are still one box each.
    expect(cassettes).toHaveLength(21);
    expect(descriptors).toHaveLength(23);
    expect(cassettes.every((entry) => entry.geometry === 'box' && entry.size.z === 8)).toBe(true);
    expect(cassettes.filter((entry) => entry.size.x === 900 && entry.size.y === 1800)).toHaveLength(12);

    // The gaps are the point: consecutive cassettes in a course are 10 mm apart
    // along the wall, so the shadow line survives into the render.
    const course = cassettes
      .filter((entry) => entry.baseElevation === 0)
      .sort((left, right) => left.center.x - right.center.x);
    expect(course).toHaveLength(7);
    expect(course[1].center.x - course[0].center.x).toBe(910);
    expect(course.map((entry) => entry.baseElevation + entry.size.y)).toEqual(Array(7).fill(1800));
  });

  it('cycles a fixed set of three shared corten tones, and no more', () => {
    const palette = createMaterialPalette();
    const cassettes = buildFloorPreviewObjects(rainscreenFloor()).filter(
      (entry) => entry.metadata.boardMaterial === 'rainscreen',
    );

    const keys = [...new Set(cassettes.map((entry) => entry.materialKey))];
    expect(keys.length).toBeLessThanOrEqual(3);
    // Every tone is a real palette entry — a typo here would silently build the
    // whole facade with an undefined material.
    expect(keys.every((key) => palette[key] instanceof THREE.Material)).toBe(true);
    // And they are three distinct shared instances, not three names for one.
    expect(new Set(keys.map((key) => palette[key].uuid)).size).toBe(keys.length);
    disposeMaterialPalette(palette);
  });

  it('gives the same wall the same tones every build, so a drag carries the meshes over', () => {
    const floor = rainscreenFloor();

    const first = buildFloorPreviewObjects(floor);
    const second = buildFloorPreviewObjects(floor);

    // Deep equality is what the preview's descriptor cache tests, so it is what
    // the tone cycling has to survive. Anything drawn from a random source
    // re-rolls here and re-triangulates the whole facade on every frame.
    expect(second).toEqual(first);
    expect(second.map((entry) => entry.materialKey)).toEqual(first.map((entry) => entry.materialKey));
  });

  it('marks a door opening as door geometry carrying its type and swing side', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.elevation = 0;
    floor.walls = [createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200, { height: 2400 })];
    const door = createDoor(floor.walls[0].id, 1500, 900, 'right', 'sliding');
    door.height = 2100;
    door.sillHeight = 0;
    floor.doors = [door];

    const descriptor = buildFloorPreviewObjects(floor).find((entry) => entry.kind === 'door');

    // The preview builds hardware from these — a bare box is not a door.
    expect(descriptor).toMatchObject({ geometry: 'door', doorType: 'sliding', openDirection: 'right' });
  });

  it('drops the cassettes a door swallows and cuts the ones it laps', () => {
    const floor = rainscreenFloor();
    const door = createDoor(floor.walls[0].id, 1360, 1000);
    door.height = 2100;
    door.sillHeight = 0;
    floor.doors = [door];

    const cassettes = buildFloorPreviewObjects(floor).filter((entry) => entry.metadata.boardMaterial === 'rainscreen');

    // 21 modules less the one inside the doorway. Two of the survivors are
    // notched at a corner rather than cut clean through, and an L is two boxes —
    // the same split the schematic skins take around an opening.
    expect(new Set(cassettes.map((entry) => entry.metadata.panelLabel)).size).toBe(20);
    expect(cassettes).toHaveLength(22);
    expect(cassettes.some((entry) => entry.id.includes('grid-c1-r0'))).toBe(false);

    const jamb = cassettes.filter((entry) => entry.id.includes('grid-c0-r0'));
    expect(jamb).toHaveLength(1);
    expect(jamb[0].size.x).toBe(860);
    expect(jamb[0].center.x).toBe(430);

    // Nothing is left standing in the doorway itself.
    const doorway = cassettes.filter(
      (entry) =>
        entry.center.x > 860 &&
        entry.center.x < 1860 &&
        entry.baseElevation < 2100 &&
        entry.baseElevation + entry.size.y > 0,
    );
    expect(doorway).toEqual([]);
  });

  it('leaves a fibre-cement wall building exactly the three boxes it always built', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.walls = [
      createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, { height: 2700, assembly: { preset: 'fiber_cement' } }),
    ];
    const wallId = floor.walls[0].id;

    const descriptors = buildFloorPreviewObjects(floor).filter((entry) => entry.kind === 'wall');

    // Pinned rather than compared to a sibling: subdividing a board that is not
    // a rainscreen would be a silent regression everywhere else in the app.
    expect(descriptors).toHaveLength(3);
    expect(descriptors.map((entry) => entry.id)).toEqual([
      `${wallId}-segment-1:core`,
      `${wallId}-segment-1:interior`,
      `${wallId}-segment-1:exterior`,
    ]);
    expect(descriptors.map((entry) => entry.materialKey)).toEqual([
      'wallFramingSteel',
      'wallFiberCement',
      'wallFiberCement',
    ]);
    expect(descriptors.map((entry) => entry.size)).toEqual([
      { x: 6000, y: 2700, z: 75 },
      { x: 6000, y: 2700, z: 6 },
      { x: 6000, y: 2700, z: 6 },
    ]);
    expect(descriptors.map((entry) => entry.center.y)).toEqual([0, -40.5, 40.5]);
  });
});

/**
 * The 3D preview has to move a wall that is built off the line it was drawn on.
 * It did for the plain box a solid wall is, and for the core-and-skins a framed
 * wall gets, because those are built from `renderWall`. It did NOT for a wall
 * anyone had actually detailed: studs, boards and screws are laid out in the
 * wall's own u/v and were being placed back on the DRAWN axis, so pushing a
 * facade 500 out left its whole frame standing where the wall used to be while
 * the plan showed it moved.
 *
 * Everything below compares one wall against the same wall on its axis, so a
 * displacement of exactly the offset — and nothing else changing — is the
 * assertion, whichever representation the wall happens to draw as.
 */
describe('a wall built off the axis it was drawn on', () => {
  const OFFSET = 500;

  // A wall running along +x puts +perpendicular on +y, so a positive offset is
  // a body displaced in +y and in +y only.
  function wallsFor(offset, options, previewOptions = {}) {
    const floor = createFloor('Ground Floor', 0);
    // Pinned so two builds can be compared descriptor for descriptor — every
    // one of them carries the floor's id in its metadata.
    floor.id = 'floor_1';
    floor.elevation = 0;
    floor.walls = [
      {
        ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 150, { height: 2400, ...options }),
        id: 'wall_1',
        outboardOffset: offset,
      },
    ];
    return buildFloorPreviewObjects(floor, previewOptions).filter((entry) => entry.metadata?.wallId === 'wall_1');
  }

  /** Where a descriptor sits in plan, whatever kind of solid it describes. */
  function planPoint(descriptor) {
    if (descriptor.center) return descriptor.center;
    if (descriptor.origin) return descriptor.origin;
    const points = descriptor.outline || [];
    return {
      x: points.reduce((total, point) => total + point.x, 0) / points.length,
      y: points.reduce((total, point) => total + point.y, 0) / points.length,
    };
  }

  /** Every piece the wall draws as, displaced by the offset and by nothing else. */
  function expectDisplaced(options, previewOptions) {
    const onAxis = wallsFor(0, options, previewOptions);
    const outboard = wallsFor(OFFSET, options, previewOptions);

    expect(onAxis.length).toBeGreaterThan(0);
    // Same pieces, same order, same names: an offset moves the wall, it does
    // not re-describe it.
    expect(outboard.map((entry) => entry.id)).toEqual(onAxis.map((entry) => entry.id));

    onAxis.forEach((before, index) => {
      const after = outboard[index];
      expect(planPoint(after).x).toBeCloseTo(planPoint(before).x, 6);
      expect(planPoint(after).y).toBeCloseTo(planPoint(before).y + OFFSET, 6);
      expect(after.bounds.minY).toBeCloseTo(before.bounds.minY + OFFSET, 6);
      expect(after.bounds.maxY).toBeCloseTo(before.bounds.maxY + OFFSET, 6);
      expect(after.baseElevation).toBeCloseTo(before.baseElevation, 6);
    });

    return { onAxis, outboard };
  }

  it('moves the single box a solid wall draws as', () => {
    const { onAxis } = expectDisplaced({ assembly: { preset: 'chb' } });

    expect(onAxis).toHaveLength(1);
    expect(onAxis[0].geometry).toBe('box');
  });

  it('moves the core and both skins a framed wall draws as', () => {
    const { onAxis } = expectDisplaced({ assembly: { preset: 'fiber_cement' } });

    expect(onAxis.map((entry) => entry.metadata.assemblySide)).toEqual(['core', 'interior', 'exterior']);
  });

  it('moves every stud, board and screw a detailed wall draws as', () => {
    const detailing = createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true }, exterior: { enabled: true } },
    });
    const { onAxis } = expectDisplaced({ assembly: { preset: 'fiber_cement', detailing } });

    // The three things the detailed path builds, all of them laid out in the
    // wall's own u/v and all of them previously left behind on the drawn axis.
    const kinds = new Set(onAxis.map((entry) => entry.metadata.wallDetailKind));
    expect(kinds.has('framing')).toBe(true);
    expect(kinds.has('panel')).toBe(true);
    expect(kinds.has('fastener')).toBe(true);
  });

  it('moves a rainscreen facade cassette by cassette', () => {
    const { onAxis } = expectDisplaced({
      assembly: { preset: 'fiber_cement', exterior: { material: 'rainscreen' } },
    });

    expect(onAxis.filter((entry) => entry.metadata.boardMaterial === 'rainscreen').length).toBeGreaterThan(1);
  });

  it('moves the frame left exposed by a stripped board face', () => {
    const { onAxis } = expectDisplaced(
      { assembly: { preset: 'mixed_board' } },
      {
        hiddenBoardSides: new Map([['wall_1', ['interior']]]),
      },
    );

    expect(onAxis.some((entry) => entry.metadata.framingKind === 'stud')).toBe(true);
  });

  it('draws a wall nobody has offset exactly as it drew it before the field existed', () => {
    const detailing = createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true }, exterior: { enabled: true } },
    });
    const options = { assembly: { preset: 'fiber_cement', detailing } };
    const legacy = wallsFor(undefined, options);

    expect(wallsFor(0, options)).toEqual(legacy);
  });
});

/**
 * Cladding run past the end of the wall, in 3D.
 *
 * The corner between two bypass-framed walls never closed because each wall's
 * boards stopped at its own end. These pin the two things that make it close:
 * the board boxes reach beyond the wall, and the frame inside them does not
 * follow — a stud running past its own plate would be a framing error, not a
 * facade decision.
 */
describe('a board run past the end of its wall', () => {
  const LAP = 137;

  function wallsFor(overhang, options, previewOptions = {}) {
    const floor = createFloor('Ground Floor', 0);
    floor.id = 'floor_1';
    floor.elevation = 0;
    const assembly = options.assembly;
    floor.walls = [
      {
        ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 150, {
          height: 2400,
          ...options,
          assembly: overhang
            ? {
                ...assembly,
                interior: { ...assembly.interior, ...overhang },
                exterior: { ...assembly.exterior, ...overhang },
              }
            : assembly,
        }),
        id: 'wall_1',
      },
    ];
    return buildFloorPreviewObjects(floor, previewOptions).filter((entry) => entry.metadata?.wallId === 'wall_1');
  }

  const boards = (entries) => entries.filter((entry) => entry.metadata.boardMaterial);
  const spanOf = (entries) => [
    Math.min(...entries.map((entry) => entry.bounds.minX)),
    Math.max(...entries.map((entry) => entry.bounds.maxX)),
  ];

  it('extends the board boxes of a plain framed wall and leaves the core where it was', () => {
    const options = { assembly: { preset: 'fiber_cement' } };
    const flush = wallsFor(null, options);
    const lapped = wallsFor({ overhangStart: LAP, overhangEnd: LAP }, options);

    expect(spanOf(boards(flush))).toEqual([0, 6000]);
    expect(spanOf(boards(lapped))).toEqual([-LAP, 6000 + LAP]);
    // The structural core is untouched at both ends. That is the whole contract:
    // this is cladding, and the frame it hangs on has not grown.
    const core = lapped.filter((entry) => entry.metadata.assemblySide === 'core');
    expect(spanOf(core)).toEqual([0, 6000]);
  });

  it('extends detailed panels while every framing member stops at the wall', () => {
    const detailing = createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true }, exterior: { enabled: true } },
    });
    const lapped = wallsFor(
      { overhangStart: LAP, overhangEnd: LAP },
      { assembly: { preset: 'fiber_cement', detailing } },
    );

    const panels = lapped.filter((entry) => entry.metadata.wallDetailKind === 'panel');
    const framing = lapped.filter((entry) => entry.metadata.wallDetailKind === 'framing');
    expect(panels.length).toBeGreaterThan(0);
    expect(framing.length).toBeGreaterThan(0);
    expect(spanOf(panels)).toEqual([-LAP, 6000 + LAP]);
    expect(spanOf(framing)).toEqual([0, 6000]);
  });

  /*
   * The wall as the user actually had it: the boards on one face drawn by hand
   * and the grid on the other set out to a board size they chose themselves.
   * Neither is the stock layout, and neither may be what decides whether the
   * corner closes — a lap that only worked on an untouched wall would be a lap
   * nobody could use, because a wall worth detailing has been detailed.
   */
  it('extends a face whose boards were drawn by hand and one whose grid was resized', () => {
    const detailing = createWallDetailing({
      enabled: true,
      sides: {
        interior: {
          enabled: true,
          layout: { boardWidth: 900, boardHeight: 1800, horizontalGap: 10, verticalGap: 10 },
        },
        exterior: {
          enabled: true,
          layout: {
            mode: 'custom',
            customPanels: [
              { id: 'left', u: 0, v: 0, width: 3000, height: 2400 },
              { id: 'right', u: 3000, v: 0, width: 3000, height: 2400 },
            ],
          },
        },
      },
    });
    const lapped = wallsFor({ overhangEnd: LAP }, { assembly: { preset: 'fiber_cement', detailing } });
    const panelsOn = (side) =>
      lapped.filter((entry) => entry.metadata.wallDetailKind === 'panel' && entry.metadata.assemblySide === side);

    expect(spanOf(panelsOn('interior'))).toEqual([0, 6000 + LAP]);
    expect(spanOf(panelsOn('exterior'))).toEqual([0, 6000 + LAP]);
    // Only the board standing on the wall end grew: the joint the user drew at
    // 3000 is still at 3000, because an overhang laps a corner rather than
    // re-setting-out the face behind it.
    expect(panelsOn('exterior').map((entry) => entry.bounds.minX)).toEqual([0, 3000]);
  });

  it('extends a rainscreen facade cassette by cassette', () => {
    const options = { assembly: { preset: 'fiber_cement', exterior: { material: 'rainscreen' } } };
    const flush = wallsFor(null, options);
    const lapped = wallsFor({ overhangStart: LAP }, options);
    const cassettes = (entries) => entries.filter((entry) => entry.metadata.boardMaterial === 'rainscreen');

    expect(Math.min(...cassettes(lapped).map((entry) => entry.bounds.minX))).toBeCloseTo(-LAP, 6);
    // A new column of cassettes rather than one stretched box — the joints are
    // the facade, and they stay on their pitch.
    expect(cassettes(lapped).length).toBeGreaterThan(cassettes(flush).length);
  });

  it('runs a board past a wall the openings have already broken into segments', () => {
    const floor = createFloor('Ground Floor', 0);
    floor.id = 'floor_1';
    const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 150, {
      height: 2400,
      assembly: {
        preset: 'fiber_cement',
        interior: { material: 'fiber_cement', overhangEnd: LAP },
        exterior: { material: 'fiber_cement', overhangEnd: LAP },
      },
    });
    wall.id = 'wall_1';
    floor.walls = [wall];
    const door = createDoor(wall.id, 3000, 900);
    door.height = 2100;
    floor.doors = [door];

    const built = buildFloorPreviewObjects(floor).filter((entry) => entry.metadata?.wallId === 'wall_1');
    const skins = boards(built);

    // A wall in three pieces still has exactly two outer ends. The doorway in
    // the middle is a hole in the cladding, not an end of it.
    expect(skins.length).toBeGreaterThan(2);
    expect(spanOf(skins)).toEqual([0, 6000 + LAP]);
    expect(skins.filter((entry) => entry.bounds.maxX > 6000)).toHaveLength(2);
  });

  it('draws a wall nobody has lapped exactly as it drew it before the field existed', () => {
    const detailing = createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true }, exterior: { enabled: true } },
    });
    const options = { assembly: { preset: 'fiber_cement', detailing } };

    expect(wallsFor({ overhangStart: 0, overhangEnd: 0 }, options)).toEqual(wallsFor(null, options));
  });
});
