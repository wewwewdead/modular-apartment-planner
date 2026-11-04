import { describe, expect, it } from 'vitest';
import { ROOM_COLOR } from './defaults';
import {
  ROOM_ZONES,
  SELECTABLE_ROOM_ZONES,
  hasCustomRoomColor,
  resolveRoomPresentationFill,
  resolveRoomZone,
  suggestRoomName,
  zoneFromName,
  zoneLabel,
} from './roomZones';

const FILLS = {
  private: '#p',
  wet: '#w',
  circulation: '#c',
  shared: '#s',
  outdoor: '#o',
  unassigned: '#u',
};

function room(fields = {}) {
  return { name: 'Room 1', color: ROOM_COLOR, zone: null, spaceType: null, useCategory: null, ...fields };
}

describe('resolveRoomZone — the order of authority', () => {
  it('takes an explicit zone over everything else', () => {
    expect(resolveRoomZone(room({ zone: 'outdoor', spaceType: 'bathroom', name: 'Bedroom' }))).toBe('outdoor');
  });

  it('ignores an explicit zone that is not a zone', () => {
    expect(resolveRoomZone(room({ zone: 'garage', spaceType: 'bathroom' }))).toBe('wet');
  });

  it('reads the program space type before the use category and the name', () => {
    expect(resolveRoomZone(room({ spaceType: 'bathroom', useCategory: 'rentable', name: 'Bedroom' }))).toBe('wet');
    expect(resolveRoomZone(room({ spaceType: 'kitchen' }))).toBe('wet');
    expect(resolveRoomZone(room({ spaceType: 'bedroom' }))).toBe('private');
    expect(resolveRoomZone(room({ spaceType: 'living' }))).toBe('private');
    expect(resolveRoomZone(room({ spaceType: 'living_sleeping' }))).toBe('private');
    expect(resolveRoomZone(room({ spaceType: 'rentable_space' }))).toBe('private');
    expect(resolveRoomZone(room({ spaceType: 'shared_corridor' }))).toBe('circulation');
  });

  it('falls back to the use category', () => {
    expect(resolveRoomZone(room({ useCategory: 'rentable', name: 'Hall' }))).toBe('private');
    expect(resolveRoomZone(room({ useCategory: 'circulation' }))).toBe('circulation');
    expect(resolveRoomZone(room({ useCategory: 'service' }))).toBe('wet');
    expect(resolveRoomZone(room({ useCategory: 'shared' }))).toBe('shared');
    expect(resolveRoomZone(room({ useCategory: 'parking' }))).toBe('outdoor');
  });

  it('falls back to keywords in the name, and to unassigned when nothing says', () => {
    expect(resolveRoomZone(room({ name: "Owner's Unit" }))).toBe('private');
    expect(resolveRoomZone(room({ name: 'T&B' }))).toBe('wet');
    expect(resolveRoomZone(room({ name: 'Entrance' }))).toBe('circulation');
    expect(resolveRoomZone(room({ name: 'Balcony' }))).toBe('outdoor');
    expect(resolveRoomZone(room({ name: 'Room 4' }))).toBe('unassigned');
    expect(resolveRoomZone(null)).toBe('unassigned');
  });
});

describe('zoneFromName', () => {
  it('matches the start of a word, not the middle of one', () => {
    expect(zoneFromName('Master Bedroom')).toBe('private');
    expect(zoneFromName('Kitchenette')).toBe('wet');
    expect(zoneFromName('Stairwell')).toBe('circulation');
    // "cr" is a comfort room only as a whole word — not "Crafts".
    expect(zoneFromName('CR')).toBe('wet');
    expect(zoneFromName('Crafts')).toBeNull();
  });

  it('lets a wet word win over a private one in the same name', () => {
    expect(zoneFromName("Owner's T&B")).toBe('wet');
    expect(zoneFromName('Unit Kitchen')).toBe('wet');
  });

  it('every keyword family the spec names resolves', () => {
    for (const name of ['bed', 'living', 'unit', 'rental', 'owner', 'studio', 'dining', 'study']) {
      expect(zoneFromName(name), name).toBe('private');
    }
    for (const name of ['t&b', 'toilet', 'bath', 'cr', 'kitchen', 'kit', 'laundry', 'utility', 'wash']) {
      expect(zoneFromName(name), name).toBe('wet');
    }
    for (const name of ['hall', 'corridor', 'entry', 'entrance', 'lobby', 'stair', 'landing', 'passage', 'foyer']) {
      expect(zoneFromName(name), name).toBe('circulation');
    }
    for (const name of ['balcony', 'terrace', 'deck', 'garden', 'yard']) {
      expect(zoneFromName(name), name).toBe('outdoor');
    }
  });
});

describe('the custom colour override', () => {
  it('ignores the colour every room is born with', () => {
    expect(hasCustomRoomColor(room())).toBe(false);
    expect(hasCustomRoomColor(room({ color: ROOM_COLOR.toLowerCase() }))).toBe(false);
    expect(resolveRoomPresentationFill(room({ name: 'Bedroom' }), FILLS)).toBe('#p');
  });

  it('lets a colour someone chose override the zone tint', () => {
    const custom = room({ name: 'Bedroom', color: '#336699' });
    expect(hasCustomRoomColor(custom)).toBe(true);
    expect(resolveRoomPresentationFill(custom, FILLS)).toBe('#336699');
  });

  it('paints an unresolved room in the unassigned tint', () => {
    expect(resolveRoomPresentationFill(room({ name: 'Room 9' }), FILLS)).toBe('#u');
  });
});

describe('zone labels', () => {
  it('names every selectable zone, and only five of them are selectable', () => {
    expect(SELECTABLE_ROOM_ZONES).toHaveLength(5);
    expect(SELECTABLE_ROOM_ZONES).not.toContain(ROOM_ZONES.UNASSIGNED);
    for (const zone of Object.values(ROOM_ZONES)) expect(zoneLabel(zone)).toBeTruthy();
  });
});

describe('suggestRoomName — naming a new room after what stands in it', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 3000 },
    { x: 0, y: 3000 },
  ];
  const at = (fixtureType, x = 1500, y = 1500) => ({ fixtureType, x, y });

  it('lets a bed outrank the WC in the corner of a studio', () => {
    expect(suggestRoomName(square, { fixtures: [at('toilet'), at('bed')] })).toBe('Bedroom');
  });

  it('names a wet room only when nothing to live in shares it', () => {
    expect(suggestRoomName(square, { fixtures: [at('toilet'), at('shower')] })).toBe('T&B');
    expect(suggestRoomName(square, { fixtures: [at('lavatory'), at('sofa')] })).toBe('Living');
    expect(suggestRoomName(square, { fixtures: [at('kitchenTop')] })).toBe('Kitchen');
  });

  it('names a stair hall, and says nothing about an empty room', () => {
    expect(suggestRoomName(square, { stairs: [{ startPoint: { x: 100, y: 100 } }] })).toBe('Stair hall');
    expect(suggestRoomName(square, { fixtures: [at('bed', 9000, 9000)] })).toBeNull();
    expect(suggestRoomName(square, {})).toBeNull();
  });
});
