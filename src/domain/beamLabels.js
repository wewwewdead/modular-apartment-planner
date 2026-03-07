import { getColumnListLabel } from './columnLabels';

export function getBeamDisplayLabel(beam, columns = []) {
  const startColumn = columns.find((column) => column.id === beam.startRef?.id);
  const endColumn = columns.find((column) => column.id === beam.endRef?.id);

  if (startColumn && endColumn) {
    return `Beam ${getColumnListLabel(startColumn, columns)}-${getColumnListLabel(endColumn, columns)}`;
  }

  return `Beam ${beam.id.split('_').pop()}`;
}
