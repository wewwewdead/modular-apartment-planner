function formatMm(value) {
  return `${Math.round(value)} mm`;
}

function buildPartInspection(project, selectedId) {
  const part = project.parts.find((entry) => entry.id === selectedId);
  if (!part) return null;
  if (part.type === 'dimension' || part.type === 'cutout' || part.type === 'hole') return null;

  const object = part.objectId
    ? (project.objects || []).find((entry) => entry.id === part.objectId)
    : null;
  const assembly = part.assemblyId
    ? project.assemblies.find((entry) => entry.id === part.assemblyId)
    : null;

  const subtitle = object?.name || assembly?.name || 'Unassigned';
  const rows = [];

  switch (part.type) {
    case 'panel':
      rows.push({ label: 'Width', value: formatMm(part.width) });
      rows.push({ label: 'Depth', value: formatMm(part.depth) });
      rows.push({ label: 'Thickness', value: formatMm(part.thickness) });
      break;
    case 'leg':
      rows.push({ label: 'Width', value: formatMm(part.width) });
      rows.push({ label: 'Depth', value: formatMm(part.depth) });
      rows.push({ label: 'Height', value: formatMm(part.height) });
      if (part.profile) rows.push({ label: 'Profile', value: part.profile });
      break;
    case 'frame':
      rows.push({ label: 'Length', value: formatMm(part.length) });
      rows.push({ label: 'Width', value: formatMm(part.width) });
      rows.push({ label: 'Height', value: formatMm(part.height) });
      if (part.axis) rows.push({ label: 'Axis', value: part.axis.toUpperCase() });
      break;
    default:
      if (part.width) rows.push({ label: 'Width', value: formatMm(part.width) });
      if (part.depth) rows.push({ label: 'Depth', value: formatMm(part.depth) });
      if (part.height) rows.push({ label: 'Height', value: formatMm(part.height) });
  }

  return { id: part.id, title: part.name || `Part (${part.type})`, subtitle, rows };
}

function buildObjectInspection(project, selectedId) {
  const object = (project.objects || []).find((entry) => entry.id === selectedId);
  if (!object) return null;

  const dimensions = object.dimensions || {};
  const rows = [];
  if (dimensions.width) rows.push({ label: 'Width', value: formatMm(dimensions.width) });
  if (dimensions.depth) rows.push({ label: 'Depth', value: formatMm(dimensions.depth) });
  if (dimensions.height) rows.push({ label: 'Height', value: formatMm(dimensions.height) });
  rows.push({ label: 'Assemblies', value: String((object.assemblyIds || []).length) });
  rows.push({ label: 'Parts', value: String((object.partIds || []).length) });

  return {
    id: object.id,
    title: object.name,
    subtitle: object.templateType ? `${object.templateType} object` : 'custom object',
    rows,
  };
}

export function getSketchInspection(project, selectedId, selectedType) {
  if (!selectedId) return null;
  if (selectedType === 'object') return buildObjectInspection(project, selectedId);
  return buildPartInspection(project, selectedId);
}
