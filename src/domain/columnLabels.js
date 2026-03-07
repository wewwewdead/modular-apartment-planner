export function getColumnAutoLabel(column, columns = []) {
  const index = columns.findIndex((entry) => entry.id === column.id);
  return index === -1 ? '' : `C${index + 1}`;
}

export function getColumnDisplayLabel(column, columns = []) {
  if (!column?.showLabel) return '';
  const customName = column.name?.trim();
  if (customName) return customName;
  return getColumnAutoLabel(column, columns);
}

export function getColumnListLabel(column, columns = []) {
  const displayLabel = getColumnDisplayLabel(column, columns);
  if (displayLabel) return displayLabel;
  return column.name?.trim() || `Column ${column.id.split('_').pop()}`;
}
