// What a part is to the shop (shopParts.js, docs/sketch-studio-shop-floor.md
// §5.4): made here, bought in or a fastener; the fasteners' shop names, what
// a product holds that is not made here, and a bought-in item as a part.
import { describe, expect, it } from 'vitest';
import { emptyModel, normalizeModel, sameKernelInput } from './model.js';
import { createHardware, hardwareDefaults } from './hardware.js';
import {
  boughtInItem,
  fastenerLabel,
  instanceKind,
  isFabricated,
  isHardware,
  isPurchased,
  notMadeHere,
} from './shopParts.js';

const plate = {
  id: 'plate',
  name: 'Plate',
  material: 'SPCC cold-rolled steel',
  features: [{ id: 'plate-f', type: 'sheetmetal', sketchId: 's1', thickness: 1.5, stock: 'spcc', bends: [] }],
};
const at = (id, partId) => ({ id, partId, name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true });
// A plate, a bought-in display and two M4 screws.
function kit() {
  const screw = createHardware(hardwareDefaults('pan-head', 'M4'));
  const display = boughtInItem({ name: 'Display', width: 200, depth: 20, height: 120, reference: 'DSP-1' });
  return normalizeModel({
    ...emptyModel(),
    sketches: [
      { id: 's1', name: 'Plate', plane: 'XY', profile: { type: 'rectangle', width: 200, height: 150, origin: [0, 0] } },
    ],
    parts: [plate, display.part, screw.part],
    instances: [
      at('ip', 'plate'),
      { ...display.instance, id: 'id' },
      { ...screw.instance, id: 's1' },
      { ...screw.instance, id: 's2' },
    ],
  });
}

describe('what a part is to the shop', () => {
  it('tells a part made here from a bought-in item and a fastener', () => {
    const model = kit();
    const [made, bought, screw] = model.parts;
    expect([isFabricated(made), isFabricated(bought), isFabricated(screw), isFabricated(null)]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect([isPurchased(bought), isPurchased(made)]).toEqual([true, false]);
    expect([isHardware(screw), isHardware(bought)]).toEqual([true, false]);
    expect(['ip', 'id', 's1'].map((id) => instanceKind(model, id))).toEqual(['fabricated', 'bought', 'fastener']);
  });
  it('reads fasteners as the shop names them', () => {
    expect(fastenerLabel(createHardware(hardwareDefaults('pan-head', 'M4')).part)).toBe('M4 × 12 pan head');
    expect(fastenerLabel(createHardware(hardwareDefaults('nut', 'M4')).part)).toBe('M4 hex nut');
    expect(fastenerLabel(createHardware(hardwareDefaults('socket-cap', 'M6')).part)).toBe('M6 × 20 socket head cap');
  });
  it('lists what is not made here by label and count, bought-in items first', () => {
    const model = kit();
    expect(notMadeHere(model, ['s1', 'ip', 'id', 's2'])).toEqual([
      { label: 'Display (bought in)', count: 1 },
      { label: 'M4 × 12 pan head', count: 2 },
    ]);
    expect(notMadeHere(model, ['ip'])).toEqual([]);
  });
});

describe('a bought-in item', () => {
  it('is a box part with its colour and reference, its footprint centred on the drop point, on the ground', () => {
    const { part, instance } = boughtInItem(
      { name: ' Fan ', width: 80, depth: 25, height: 80, colour: '#112233', reference: 'F-80' },
      [100, 50, 7],
    );
    expect(part).toMatchObject({
      name: 'Fan',
      material: 'Bought in',
      purchased: { colour: '#112233', reference: 'F-80' },
    });
    expect(part.features[0]).toMatchObject({ type: 'box', width: 80, depth: 25, height: 80 });
    expect(instance).toMatchObject({ partId: part.id, position: [60, 37.5, 0], rotation: [0, 0, 0] });
    expect(boughtInItem({ width: 1, depth: 1, height: 1 }).part.name).toBe('Bought-in item');
  });
  it('refuses a size that is not above zero and a colour that is not one', () => {
    expect(() => boughtInItem({ width: 0, depth: 1, height: 1 })).toThrow('Width must be greater than zero.');
    expect(() => boughtInItem({ width: 1, depth: 1, height: -2 })).toThrow('Height must be greater than zero.');
    expect(() => boughtInItem({ width: 1, depth: 1, height: 1, colour: 'red' })).toThrow('Choose the item’s colour.');
  });
  it('is a part, so adding one rebuilds the solids; the file validates its colour', () => {
    const model = kit();
    const { part, instance } = boughtInItem({ name: 'Lock', width: 30, depth: 30, height: 10 });
    expect(
      sameKernelInput(model, { ...model, parts: [...model.parts, part], instances: [...model.instances, instance] }),
    ).toBe(false);
    expect(() =>
      normalizeModel({ ...model, parts: [...model.parts, { ...part, purchased: { colour: 'blue', reference: '' } }] }),
    ).toThrow(`Invalid bought-in item: ${part.id}`);
  });
});
