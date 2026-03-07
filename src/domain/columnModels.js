import { GRID_MINOR } from './defaults';
import { createColumn } from './models';

export function duplicateColumn(column, offset = GRID_MINOR) {
  return createColumn(
    column.x + offset,
    column.y + offset,
    column.width,
    column.depth,
    {
      height: column.height,
      rotation: column.rotation,
      type: column.type,
      name: column.name,
      showLabel: column.showLabel,
    }
  );
}
