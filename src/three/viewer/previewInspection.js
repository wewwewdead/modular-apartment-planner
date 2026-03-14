import { formatMeasurement } from '@/annotations/format';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import { getColumnListLabel } from '@/domain/columnLabels';
import { getOrderedFloors } from '@/domain/floorModels';
import { getLandingDisplayLabel } from '@/domain/landingLabels';
import { getSlabDisplayLabel } from '@/domain/slabLabels';
import { getStairDisplayLabel } from '@/domain/stairLabels';
import { getRoofTypeLabel, roofPitchDirectionToAngle } from '@/domain/roofModels';
import { resolveTrussType } from '@/domain/trussModels';
import { beamLength } from '@/geometry/beamGeometry';
import { getTrussSystemPurlinTotalLength } from '@/geometry/trussGeometry';
import { findRoofOpeningById, normalizeRoofOpeningType } from '@/roof/openings';
import { resolveParapetLine } from '@/geometry/roofPlanGeometry';
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
  'roofSystem',
  'parapet',
  'drain',
  'roofOpening',
  'trussSystem',
  'trussInstance',
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
  roofSystem: 'Roof',
  parapet: 'Parapet',
  drain: 'Drain',
  roofOpening: 'Roof Opening',
  trussSystem: 'Truss System',
  trussInstance: 'Truss Instance',
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

function materialLabel(material) {
  return material ? material.charAt(0).toUpperCase() + material.slice(1) : '—';
}

function trussShapeLabel(value) {
  return String(value || '')
    .split('_')
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : '')
    .join(' ') || '—';
}

function trussSupportLabel(floor, beamId) {
  const beam = (floor?.beams || []).find((entry) => entry.id === beamId) || null;
  if (!beam || !floor) return '—';
  return getBeamDisplayLabel(beam, floor.columns || []);
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

function findObjectInRoof(roofSystem, selectedType, selectedId) {
  if (!roofSystem) return null;

  switch (selectedType) {
    case 'roofSystem':
      return roofSystem.id === selectedId ? roofSystem : null;
    case 'parapet':
      return (roofSystem.parapets || []).find((parapet) => parapet.id === selectedId) || null;
    case 'drain':
      return (roofSystem.drains || []).find((drain) => drain.id === selectedId) || null;
    case 'roofOpening':
      return (roofSystem.roofOpenings || []).find((opening) => opening.id === selectedId) || null;
    default:
      return null;
  }
}

function findObjectInTrusses(project, selectedType, selectedId) {
  if (selectedType === 'trussSystem') {
    const trussSystem = (project?.trussSystems || []).find((entry) => entry.id === selectedId) || null;
    return trussSystem ? { trussSystem, trussInstance: null } : null;
  }

  if (selectedType === 'trussInstance') {
    for (const trussSystem of project?.trussSystems || []) {
      const trussInstance = (trussSystem.trussInstances || []).find((entry) => entry.id === selectedId) || null;
      if (trussInstance) {
        return { trussSystem, trussInstance };
      }
    }
  }

  return null;
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
    case 'roofSystem':
      return object.name || 'Roof';
    case 'parapet':
      return object.name || `Parapet ${object.id.split('_').pop()}`;
    case 'drain':
      return object.name || `Drain ${object.id.split('_').pop()}`;
    case 'roofOpening':
      return object.name || `Roof Opening ${object.id.split('_').pop()}`;
    case 'trussSystem':
      return object.name || 'Truss System';
    case 'trussInstance': {
      const trussType = resolveTrussType(object.trussTypeId);
      return `${trussType.name} ${object.id.split('_').pop()}`;
    }
    default:
      return object?.id || TYPE_LABELS[selectedType] || 'Object';
  }
}

function rowsForObject(selectedType, object, floor, roofSystem = null) {
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
        { label: 'Roof Access', value: object.roofAccess?.roofOpeningId
          ? (findRoofOpeningById(roofSystem, object.roofAccess.roofOpeningId)?.name || 'Linked roof opening')
          : 'None' },
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
    case 'roofSystem':
      return [
        { label: 'Type', value: getRoofTypeLabel(object.roofType || 'flat') },
        mmRow('Base Elev.', object.baseElevation),
        mmRow('Slab Thick.', object.slabThickness),
        ...(object.roofType === 'flat'
          ? [{ label: 'Finish Slope', value: `${Number(object.finishSlope || 0).toFixed(1)}%` }]
          : object.roofType === 'custom'
            ? [
                { label: 'Roof Planes', value: String((object.roofPlanes || []).length) },
                { label: 'Ridges', value: String((object.ridges || []).length) },
                { label: 'Valleys', value: String((object.valleys || []).length) },
                { label: 'Hips', value: String((object.hips || []).length) },
              ]
          : [
              ...(object.trussAttachmentId ? [{
                label: 'Pitch Source',
                value: object.pitchSource === 'manual' ? 'Manual Slope' : 'Follow Truss',
              }] : []),
              { label: 'Roof Slope', value: `${Number(object.pitch?.slope || 0).toFixed(1)}%` },
              { label: 'Slope Dir.', value: `${Math.round(roofPitchDirectionToAngle(object.pitch?.direction))}°` },
              mmRow('Overhang', object.pitch?.overhang),
              ...(object.roofType === 'gable' ? [mmRow('Ridge Offset', object.pitch?.ridgeOffset)] : []),
            ]),
      ];
    case 'parapet': {
      const resolvedParapet = resolveParapetLine(object, roofSystem) || object;
      return [
        mmRow('Length', wallLength({ start: resolvedParapet.startPoint, end: resolvedParapet.endPoint })),
        mmRow('Height', object.height),
        mmRow('Thickness', object.thickness),
        { label: 'Mode', value: object.attachment?.type === 'roof_edge' ? 'Roof Edge' : 'Free' },
      ];
    }
    case 'drain':
      return [
        mmRow('Diameter', object.diameter),
        mmRow('Invert Offset', object.invertOffset),
      ];
    case 'roofOpening':
      return [
        { label: 'Type', value: normalizeRoofOpeningType(object.type || 'opening').toUpperCase() },
        areaRow('Area', Math.abs((object.boundaryPoints || []).reduce((sum, point, index, points) => {
          const next = points[(index + 1) % points.length];
          return sum + (point.x * next.y - next.x * point.y);
        }, 0) / 2)),
        mmRow('Curb Height', object.curbHeight),
      ];
    case 'trussSystem':
      {
        const purlinTotalLength = getTrussSystemPurlinTotalLength(object);
        return [
          { label: 'Floor', value: floor?.name || 'Unassigned' },
          mmRow('Base Elev.', object.baseElevation),
          { label: 'Rotation', value: `${Number(object.planRotationOffsetDegrees || 0).toFixed(1)}°` },
          { label: 'Instances', value: String((object.trussInstances || []).length) },
          { label: 'Purlins', value: object.purlinSystem?.enabled ? 'Enabled' : 'Disabled' },
          ...(object.purlinSystem?.enabled
            ? [
                mmRow('Purlin Spacing', object.purlinSystem.spacing),
                mmRow('Purlin Start', object.purlinSystem.startOffset),
                mmRow('Purlin End', object.purlinSystem.endOffset),
                mmRow('Purlin OH A', object.purlinSystem.overhangStart),
                mmRow('Purlin OH B', object.purlinSystem.overhangEnd),
                {
                  label: 'Purlin Total Length',
                  value: purlinTotalLength > 0 ? formatMeasurement(purlinTotalLength) : 'Single support only',
                },
                { label: 'Purlin Section', value: `${formatMeasurement(object.purlinSystem.width)} x ${formatMeasurement(object.purlinSystem.depth)}` },
                { label: 'Purlin Material', value: materialLabel(object.purlinSystem.material) },
              ]
            : []),
          { label: 'Roof Link', value: roofSystem?.trussAttachmentId === object.id ? (roofSystem.name || 'Active Roof Source') : 'Not Roof Source' },
        ];
      }
    case 'trussInstance': {
      const trussType = resolveTrussType(object.trussTypeId);
      return [
        { label: 'Type', value: trussType.name },
        { label: 'Family', value: trussShapeLabel(trussType.family) },
        { label: 'Shape', value: trussShapeLabel(trussType.shape || trussType.family) },
        { label: 'Roof Fit', value: trussType.attachedRoofType ? trussType.attachedRoofType.toUpperCase() : 'UNSUPPORTED' },
        { label: 'Material', value: materialLabel(object.material || trussType.material) },
        { label: 'Web Pattern', value: trussType.webPattern?.label || trussType.webPattern?.key || '—' },
        { label: 'Support A', value: trussSupportLabel(floor, object.supportBeamIds?.start) },
        { label: 'Support B', value: trussSupportLabel(floor, object.supportBeamIds?.end) },
        mmRow('Span', object.span),
        mmRow('Rise', object.rise),
        { label: 'Pitch', value: `${Number(object.pitch || 0).toFixed(1)}%` },
        mmRow('Spacing', object.spacing),
        { label: 'Count', value: String(object.count || 1) },
        mmRow('Bearing A', object.bearingOffsets?.start),
        mmRow('Bearing B', object.bearingOffsets?.end),
        mmRow('Overhang A', object.overhangs?.start),
        mmRow('Overhang B', object.overhangs?.end),
        { label: 'Roof Link', value: object.roofAttachmentId || 'None' },
      ];
    }
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
      rows: rowsForObject(selectedType, object, floor, project?.roofSystem || null),
    };
  }

  const roofObject = findObjectInRoof(project?.roofSystem, selectedType, selectedId);
  if (roofObject) {
    const topFloor = getOrderedFloors(project).slice(-1)[0] || null;

    return {
      id: selectedId,
      type: selectedType,
      floorId: topFloor?.id || null,
      floorName: project?.roofSystem?.name || 'Roof',
      title: titleForObject(selectedType, roofObject, topFloor || { columns: [] }),
      subtitle: `${project?.roofSystem?.name || 'Roof'} · ${TYPE_LABELS[selectedType]}`,
      rows: rowsForObject(selectedType, roofObject, topFloor || { columns: [] }, project?.roofSystem || null),
    };
  }

  const trussObject = findObjectInTrusses(project, selectedType, selectedId);
  if (trussObject?.trussSystem) {
    const floor = (project?.floors || []).find((entry) => entry.id === trussObject.trussSystem.floorId) || null;
    const object = trussObject.trussInstance || trussObject.trussSystem;

    return {
      id: selectedId,
      type: selectedType,
      floorId: trussObject.trussSystem.floorId,
      floorName: floor?.name || 'Truss',
      title: titleForObject(selectedType, object, floor || { columns: [] }),
      subtitle: `${trussObject.trussSystem.name || 'Truss System'} · ${TYPE_LABELS[selectedType]}`,
      rows: rowsForObject(selectedType, object, floor || { columns: [] }, project?.roofSystem || null),
    };
  }

  return null;
}
