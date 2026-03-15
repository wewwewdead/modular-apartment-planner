import { createAssembly } from './assemblyModels';
import { materializePartDefinition } from './templates/templateHelpers';

const SIDE_PLANE_DEF = {
  normal: { x: 1, y: 0, z: 0 },
  uAxis: { x: 0, y: 1, z: 0 },
  vAxis: { x: 0, y: 0, z: 1 },
  up: { x: 0, y: 0, z: 1 },
};

const FRONT_PLANE_DEF = {
  normal: { x: 0, y: 1, z: 0 },
  uAxis: { x: 1, y: 0, z: 0 },
  vAxis: { x: 0, y: 0, z: 1 },
  up: { x: 0, y: 0, z: 1 },
};

function addOffset(position = {}, offset = {}) {
  return {
    x: (Number(position.x) || 0) + (Number(offset.x) || 0),
    y: (Number(position.y) || 0) + (Number(offset.y) || 0),
    z: (Number(position.z) || 0) + (Number(offset.z) || 0),
  };
}

function buildBoatRibProfile(beam, height) {
  const halfBeam = beam / 2;
  return [
    { u: 0, v: 0 },
    { u: beam * 0.12, v: height * 0.18 },
    { u: beam * 0.28, v: height * 0.58 },
    { u: halfBeam, v: height },
    { u: beam * 0.72, v: height * 0.58 },
    { u: beam * 0.88, v: height * 0.18 },
    { u: beam, v: 0 },
    { u: beam * 0.74, v: height * 0.08 },
    { u: halfBeam, v: height * 0.2 },
    { u: beam * 0.26, v: height * 0.08 },
  ];
}

function buildWheelProfile(diameter) {
  const radius = diameter / 2;
  const center = radius;
  const ring = [];
  const segments = 10;

  for (let index = 0; index < segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    ring.push({
      u: center + Math.cos(angle) * radius,
      v: center + Math.sin(angle) * radius,
    });
  }

  return ring;
}

export const componentPresets = [
  {
    id: 'bed_leg',
    label: 'Bed Leg',
    category: 'bed',
    description: 'Single hardwood leg module for beds and benches.',
    recommendedCategories: ['bed', 'chair', 'table'],
    parts: [
      {
        type: 'leg',
        name: 'Bed Leg',
        role: 'bed_leg',
        props: {
          width: 80,
          depth: 80,
          height: 320,
          material: 'hardwood',
        },
      },
    ],
  },
  {
    id: 'bed_side_rail',
    label: 'Side Rail',
    category: 'bed',
    description: 'Long frame rail for mattress decks and bed frames.',
    recommendedCategories: ['bed'],
    parts: [
      {
        type: 'frame',
        name: 'Side Rail',
        role: 'bed_side_rail',
        props: {
          length: 2000,
          width: 32,
          height: 180,
          axis: 'x',
          material: 'hardwood',
        },
      },
    ],
  },
  {
    id: 'bed_slat',
    label: 'Slat',
    category: 'bed',
    description: 'Deck slat module for quick arrays across a bed frame.',
    recommendedCategories: ['bed', 'general'],
    parts: [
      {
        type: 'panel',
        name: 'Slat',
        role: 'bed_slat',
        props: {
          width: 70,
          depth: 1500,
          thickness: 20,
          material: 'softwood',
        },
      },
    ],
  },
  {
    id: 'headboard_panel',
    label: 'Headboard Panel',
    category: 'bed',
    description: 'Vertical headboard panel to anchor a bed assembly.',
    recommendedCategories: ['bed'],
    parts: [
      {
        type: 'panel',
        name: 'Headboard',
        role: 'headboard_panel',
        props: {
          width: 40,
          depth: 1600,
          thickness: 900,
          material: 'plywood',
          fill: 'rgba(184, 134, 11, 0.12)',
        },
      },
    ],
  },
  {
    id: 'boat_keel',
    label: 'Keel Beam',
    category: 'boat',
    description: 'Primary longitudinal keel beam for a small boat frame.',
    recommendedCategories: ['boat'],
    parts: [
      {
        type: 'frame',
        name: 'Keel',
        role: 'boat_keel',
        props: {
          length: 2200,
          width: 60,
          height: 120,
          axis: 'x',
          material: 'hardwood',
        },
      },
    ],
  },
  {
    id: 'boat_rib',
    label: 'Boat Rib',
    category: 'boat',
    description: 'Rib cross-section for repeating hull structure.',
    recommendedCategories: ['boat'],
    parts: [
      {
        type: 'solid',
        name: 'Rib',
        role: 'boat_rib',
        props: {
          material: 'hardwood',
          plane: SIDE_PLANE_DEF,
          extrusionDepth: 40,
          profilePoints: buildBoatRibProfile(1100, 620),
          fill: 'rgba(139, 105, 20, 0.08)',
        },
      },
    ],
  },
  {
    id: 'boat_bench',
    label: 'Bench Seat',
    category: 'boat',
    description: 'Seat bench module for rowboats and utility boats.',
    recommendedCategories: ['boat'],
    parts: [
      {
        type: 'panel',
        name: 'Bench',
        role: 'boat_bench',
        props: {
          width: 260,
          depth: 720,
          thickness: 35,
          material: 'hardwood',
        },
      },
    ],
  },
  {
    id: 'boat_hull_side',
    label: 'Hull Side',
    category: 'boat',
    description: 'Side shell panel for rough hull blocking.',
    recommendedCategories: ['boat'],
    parts: [
      {
        type: 'solid',
        name: 'Hull Side',
        role: 'boat_hull_side',
        props: {
          material: 'plywood',
          plane: FRONT_PLANE_DEF,
          extrusionDepth: 24,
          profilePoints: [
            { u: 0, v: 0 },
            { u: 380, v: 110 },
            { u: 1320, v: 360 },
            { u: 2220, v: 310 },
            { u: 2600, v: 0 },
            { u: 2120, v: 52 },
            { u: 1220, v: 96 },
            { u: 300, v: 40 },
          ],
          fill: 'rgba(70, 120, 160, 0.08)',
        },
      },
    ],
  },
  {
    id: 'car_wheel',
    label: 'Wheel',
    category: 'car',
    description: 'Octagonal wheel solid for arrays and chassis layouts.',
    recommendedCategories: ['car'],
    parts: [
      {
        type: 'solid',
        name: 'Wheel',
        role: 'car_wheel',
        props: {
          material: 'metal',
          plane: FRONT_PLANE_DEF,
          extrusionDepth: 220,
          profilePoints: buildWheelProfile(700),
          fill: 'rgba(90, 90, 90, 0.12)',
        },
      },
    ],
  },
  {
    id: 'car_chassis_rail',
    label: 'Chassis Rail',
    category: 'car',
    description: 'Longitudinal frame member for a vehicle base.',
    recommendedCategories: ['car'],
    parts: [
      {
        type: 'frame',
        name: 'Chassis Rail',
        role: 'car_chassis_rail',
        props: {
          length: 2800,
          width: 90,
          height: 150,
          axis: 'x',
          material: 'metal',
        },
      },
    ],
  },
  {
    id: 'car_axle',
    label: 'Axle Beam',
    category: 'car',
    description: 'Cross beam for front or rear axle placement.',
    recommendedCategories: ['car'],
    parts: [
      {
        type: 'frame',
        name: 'Axle',
        role: 'car_axle',
        props: {
          length: 1500,
          width: 70,
          height: 70,
          axis: 'y',
          material: 'metal',
        },
      },
    ],
  },
  {
    id: 'car_body_block',
    label: 'Body Block',
    category: 'car',
    description: 'Profile-based car body shell for fast blocking.',
    recommendedCategories: ['car'],
    parts: [
      {
        type: 'solid',
        name: 'Body',
        role: 'car_body',
        props: {
          material: 'plywood',
          plane: FRONT_PLANE_DEF,
          extrusionDepth: 1500,
          profilePoints: [
            { u: 0, v: 0 },
            { u: 520, v: 0 },
            { u: 920, v: 320 },
            { u: 1820, v: 660 },
            { u: 2520, v: 680 },
            { u: 3300, v: 540 },
            { u: 3960, v: 160 },
            { u: 4200, v: 0 },
            { u: 3560, v: 0 },
            { u: 3160, v: 80 },
            { u: 860, v: 90 },
            { u: 340, v: 0 },
          ],
          fill: 'rgba(184, 70, 70, 0.08)',
        },
      },
    ],
  },
  {
    id: 'car_seat_base',
    label: 'Seat Base',
    category: 'car',
    description: 'Simple seat base module for interior layout.',
    recommendedCategories: ['car'],
    parts: [
      {
        type: 'panel',
        name: 'Seat Base',
        role: 'car_seat_base',
        props: {
          width: 460,
          depth: 520,
          thickness: 140,
          material: 'plywood',
        },
      },
    ],
  },
];

const componentPresetMap = new Map(componentPresets.map((preset) => [preset.id, preset]));

export function getComponentPreset(presetId) {
  return componentPresetMap.get(presetId) || null;
}

export function getRecommendedComponentPresets(category) {
  if (!category) return componentPresets;
  return componentPresets.filter((preset) => (
    preset.category === category
    || (preset.recommendedCategories || []).includes(category)
  ));
}

export function instantiateComponentPreset(
  presetId,
  { objectId = null, positionOffset = null, name = null, sortIndex = 0 } = {}
) {
  const preset = getComponentPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown component preset: ${presetId}`);
  }

  const assembly = createAssembly(name || preset.label, {
    objectId,
    category: preset.category || 'general',
    description: preset.description || '',
    source: 'manual',
    sortIndex,
    componentPresetId: preset.id,
    componentLabel: preset.label,
    instanceMode: 'independent',
  });

  const offset = positionOffset || { x: 0, y: 0, z: 0 };
  const parts = (preset.parts || []).map((partDefinition, index) => (
    materializePartDefinition(partDefinition, {
      assemblyId: assembly.id,
      objectId,
      source: 'manual',
      locked: false,
      sortIndex: index,
      position: addOffset(partDefinition.props?.position, offset),
    })
  ));

  assembly.partIds = parts.map((part) => part.id);

  return {
    preset,
    assembly,
    parts,
  };
}
