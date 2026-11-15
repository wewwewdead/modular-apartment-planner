// The shop's records as report rows (docs/sketch-studio-fab-shop.md §9 SM-3):
// each finish and print with the numbers the stations show, for the cutting
// list panel and the trailing rows of the cut list CSV (fabrication.js
// cutListCsv). A model without finishes or prints gets no rows, so its
// outputs stay as they were. Nothing here reaches STEP or STL.
import { nodeName } from './groups.js';
import { meshArea, paintNumbers } from './paintStation.js';
import { FINISH_GLOSS_NAMES, PRINT_METHOD_NAMES } from './shopCatalog.js';

const round = (value, digits = 3) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

/**
 * { finishes, prints } rows for `model` as built in `snapshot` (null when the
 * model has none of them). A finish's area comes from its instance's mesh.
 */
export function shopRecordRows(model, snapshot) {
  const finishes = model.finishes || [],
    prints = model.prints || [];
  if (!finishes.length && !prints.length) return null;
  const name = (id) => nodeName(model, id);
  return {
    finishes: finishes.map((finish) => {
      const mesh = snapshot?.instances?.find((i) => i.id === finish.instanceId)?.mesh;
      const numbers = paintNumbers({
        area: mesh ? meshArea(mesh) : NaN,
        kind: finish.kind,
        thickness: finish.thickness,
      });
      return {
        id: finish.id,
        parts: name(finish.instanceId),
        kind: finish.kind,
        name: finish.name || '',
        colour: finish.colour,
        gloss: FINISH_GLOSS_NAMES[finish.gloss] || finish.gloss || '',
        thickness: finish.thickness,
        area: round(numbers.area, 4),
        mass: round(numbers.mass, 4),
      };
    }),
    prints: prints.map((print) => ({
      id: print.id,
      parts: name(print.instanceId),
      method: PRINT_METHOD_NAMES[print.method] || print.method,
      kind: print.kind,
      artwork: print.kind === 'text' ? print.text : 'Image',
      colour: print.kind === 'text' ? print.colour : '',
      width: round(print.width, 2),
      height: round(print.height, 2),
    })),
  };
}
