import { formatMeasurement } from '@/annotations/format';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import { getColumnListLabel } from '@/domain/columnLabels';
import { getLandingDisplayLabel } from '@/domain/landingLabels';
import { getSlabDisplayLabel } from '@/domain/slabLabels';
import { getStairDisplayLabel } from '@/domain/stairLabels';
import { beamLength } from '@/geometry/beamGeometry';
import { slabArea } from '@/geometry/slabGeometry';
import { stairRun, stairTotalRise } from '@/geometry/stairGeometry';
import { railingLength } from '@/geometry/railingGeometry';
import { wallLength } from '@/geometry/wallGeometry';

const INSPECTABLE_TYPES = new Set([
  'wall',
  'beam',
  'column',
  'slab',
  'stair',
  'landing',
  'door',
  'window',
  'fixture',
  'railing',
]);

const TYPE_LABELS = {
  wall: 'Wall',
  beam: 'Beam',
  column: 'Column',
  slab: 'Slab',
  stair: 'Stair',
  landing: 'Landing',
  door: 'Door',
  window: 'Window',
  fixture: 'Fixture',
  railing: 'Railing',
};

const FIXTURE_TYPE_LABELS = {
  kitchenTop: 'Kitchen Top',
  toilet: 'Toilet',
  lavatory: 'Lavatory',
  table: 'Table',
  tv: 'TV',
  sofa: 'Sofa',
};

function mmRow(label, value) {
  return { label, value: formatMeasurement(value || 0) };
}

function areaRow(label, value) {
  return { label, value: `${(Math.abs(value || 0) / 1_000_000).toFixed(2)} m²` };
}

function findObjectInFloor(floor, selectedType, selectedId) {
  switch (selectedType) {
    case 'wall':
      return floor.walls?.find((wall) => wall.id === selectedId) || null;
    case 'beam':
      return (floor.beams || []).find((beam) => beam.id === selectedId) || null;
    case 'column':
      return (floor.columns || []).find((column) => column.id === selectedId) || null;
    case 'slab':
      return (floor.slabs || []).find((slab) => slab.id === selectedId) || null;
    case 'stair':
      return (floor.stairs || []).find((stair) => stair.id === selectedId) || null;
    case 'landing':
      return (floor.landings || []).find((landing) => landing.id === selectedId) || null;
    case 'door':
      return floor.doors?.find((door) => door.id === selectedId) || null;
    case 'window':
      return floor.windows?.find((windowItem) => windowItem.id === selectedId) || null;
    case 'fixture':
      return (floor.fixtures || []).find((fixture) => fixture.id === selectedId) || null;
    case 'railing':
      return (floor.railings || []).find((r) => r.id === selectedId) || null;
    default:
      return null;
  }
}

function titleForObject(selectedType, object, floor) {
  switch (selectedType) {
    case 'beam':
      return getBeamDisplayLabel(object, floor.columns || []);
    case 'column':
      return getColumnListLabel(object, floor.columns || []);
    case 'slab':
      return getSlabDisplayLabel(object);
    case 'stair':
      return getStairDisplayLabel(object);
    case 'landing':
      return getLandingDisplayLabel(object);
    case 'wall':
    case 'door':
    case 'window':
      return `${TYPE_LABELS[selectedType]} ${object.id.split('_').pop()}`;
    case 'fixture':
      return FIXTURE_TYPE_LABELS[object.fixtureType] || 'Fixture';
    case 'railing': {
      const typeLabel = object.type ? object.type.charAt(0).toUpperCase() + object.type.slice(1) : 'Railing';
      return `${typeLabel} Railing ${object.id.split('_').pop()}`;
    }
    default:
      return object?.id || TYPE_LABELS[selectedType] || 'Object';
  }
}

function rowsForObject(selectedType, object, floor) {
  switch (selectedType) {
    case 'wall':
      return [
        mmRow('Length', wallLength(object)),
        mmRow('Thickness', object.thickness),
        mmRow('Height', object.height),
      ];
    case 'beam':
      return [
        mmRow('Span', beamLength(object, floor.columns || [])),
        mmRow('Width', object.width),
        mmRow('Depth', object.depth),
      ];
    case 'column':
      return [
        mmRow('Width', object.width),
        mmRow('Depth', object.depth),
        mmRow('Height', object.height),
      ];
    case 'slab':
      return [
        mmRow('Thickness', object.thickness),
        mmRow('Elevation', object.elevation),
        areaRow('Area', slabArea(object)),
      ];
    case 'stair':
      return [
        mmRow('Width', object.width),
        mmRow('Run', stairRun(object)),
        mmRow('Total Rise', stairTotalRise(object)),
      ];
    case 'landing':
      return [
        mmRow('Width', object.width),
        mmRow('Depth', object.depth),
        mmRow('Thickness', object.thickness),
      ];
    case 'door':
      return [
        mmRow('Width', object.width),
        mmRow('Height', object.height),
        mmRow('Sill', object.sillHeight),
      ];
    case 'window':
      return [
        mmRow('Width', object.width),
        mmRow('Height', object.height),
        mmRow('Sill', object.sillHeight),
      ];
    case 'fixture':
      return [
        mmRow('Width', object.width),
        mmRow('Depth', object.depth),
      ];
    case 'railing':
      return [
        mmRow('Length', railingLength(object)),
        mmRow('Height', object.height),
        mmRow('Width', object.width),
        { label: 'Type', value: object.type ? object.type.charAt(0).toUpperCase() + object.type.slice(1) : '—' },
      ];
    default:
      return [];
  }
}

export function isPreviewInspectableType(selectedType) {
  return INSPECTABLE_TYPES.has(selectedType);
}

export function getPreviewInspection(project, selectedType, selectedId) {
  if (!selectedId || !isPreviewInspectableType(selectedType)) return null;

  for (const floor of project?.floors || []) {
    const object = findObjectInFloor(floor, selectedType, selectedId);
    if (!object) continue;

    return {
      id: selectedId,
      type: selectedType,
      floorId: floor.id,
      floorName: floor.name,
      title: titleForObject(selectedType, object, floor),
      subtitle: `${floor.name} · ${TYPE_LABELS[selectedType]}`,
      rows: rowsForObject(selectedType, object, floor),
    };
  }

  return null;
}
