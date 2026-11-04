import { pointInPolygon } from '@/geometry/polygon';
import { ROOM_COLOR } from './defaults';

/**
 * Which kind of space a room is, for the presentation plan's floor tint.
 *
 * Not a classification the model depends on — the lifecycle panel owns
 * `useCategory` / `spaceType` — only the colour family a rendered plan paints
 * the floor in: warm for where people sleep and live, blue for where water is,
 * grey for where people pass through.
 */
export const ROOM_ZONES = Object.freeze({
  PRIVATE: 'private',
  WET: 'wet',
  CIRCULATION: 'circulation',
  SHARED: 'shared',
  OUTDOOR: 'outdoor',
  UNASSIGNED: 'unassigned',
});

/** The five a user can pick; `unassigned` is what "nothing says" resolves to. */
export const SELECTABLE_ROOM_ZONES = Object.freeze([
  ROOM_ZONES.PRIVATE,
  ROOM_ZONES.WET,
  ROOM_ZONES.CIRCULATION,
  ROOM_ZONES.SHARED,
  ROOM_ZONES.OUTDOOR,
]);

const ZONE_LABELS = {
  [ROOM_ZONES.PRIVATE]: 'Private / living',
  [ROOM_ZONES.WET]: 'Wet (kitchen, T&B)',
  [ROOM_ZONES.CIRCULATION]: 'Circulation',
  [ROOM_ZONES.SHARED]: 'Shared',
  [ROOM_ZONES.OUTDOOR]: 'Outdoor',
  [ROOM_ZONES.UNASSIGNED]: 'Unassigned',
};

const VALID_ZONES = new Set(Object.values(ROOM_ZONES));

const SPACE_TYPE_ZONES = {
  living: ROOM_ZONES.PRIVATE,
  bedroom: ROOM_ZONES.PRIVATE,
  living_sleeping: ROOM_ZONES.PRIVATE,
  rentable_space: ROOM_ZONES.PRIVATE,
  bathroom: ROOM_ZONES.WET,
  kitchen: ROOM_ZONES.WET,
  shared_corridor: ROOM_ZONES.CIRCULATION,
};

const USE_CATEGORY_ZONES = {
  rentable: ROOM_ZONES.PRIVATE,
  circulation: ROOM_ZONES.CIRCULATION,
  service: ROOM_ZONES.WET,
  shared: ROOM_ZONES.SHARED,
  parking: ROOM_ZONES.OUTDOOR,
};

// Order matters only between lists; within a list any hit wins. Wet before
// private so "Owner's T&B" is a bathroom, not an owner's room; circulation
// before private so "Unit entry" is a hall.
const NAME_KEYWORDS = [
  [ROOM_ZONES.WET, ['t&b', 'toilet', 'bath', 'cr', 'kitchen', 'kit', 'laundry', 'utility', 'wash']],
  [ROOM_ZONES.CIRCULATION, ['hall', 'corridor', 'entry', 'entrance', 'lobby', 'stair', 'landing', 'passage', 'foyer']],
  [ROOM_ZONES.OUTDOOR, ['balcony', 'terrace', 'deck', 'garden', 'yard']],
  [ROOM_ZONES.PRIVATE, ['bed', 'living', 'unit', 'rental', 'owner', 'studio', 'dining', 'study']],
];

function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9&]+/)
    .filter(Boolean);
}

/**
 * A keyword matches a whole word, or the start of one — "bedroom" and "beds"
 * hit "bed", "kitchenette" hits "kitchen" — but never the middle of one. Two
 * letter keywords must be the whole word, so "cr" is a comfort room and not
 * "crafts".
 */
function matchesKeyword(tokens, keyword) {
  if (keyword.length <= 2) return tokens.includes(keyword);
  return tokens.some((token) => token.startsWith(keyword));
}

export function zoneFromName(name) {
  const tokens = nameTokens(name);
  if (!tokens.length) return null;
  for (const [zone, keywords] of NAME_KEYWORDS) {
    if (keywords.some((keyword) => matchesKeyword(tokens, keyword))) return zone;
  }
  return null;
}

/**
 * The zone a room's floor is tinted as, from the most to the least deliberate
 * statement about it: an explicit zone, the program's space type, its use
 * category, and finally what the room is called.
 */
export function resolveRoomZone(room) {
  if (!room) return ROOM_ZONES.UNASSIGNED;
  if (room.zone && VALID_ZONES.has(room.zone)) return room.zone;
  if (room.spaceType && SPACE_TYPE_ZONES[room.spaceType]) return SPACE_TYPE_ZONES[room.spaceType];
  if (room.useCategory && USE_CATEGORY_ZONES[room.useCategory]) return USE_CATEGORY_ZONES[room.useCategory];
  return zoneFromName(room.name) || ROOM_ZONES.UNASSIGNED;
}

export function zoneLabel(zone) {
  return ZONE_LABELS[zone] || ZONE_LABELS[ROOM_ZONES.UNASSIGNED];
}

/**
 * A colour someone chose, as opposed to the default every room is born with.
 * Only a chosen one overrides the zone tint; the default is ignored exactly as
 * it always has been.
 */
export function hasCustomRoomColor(room) {
  const color = String(room?.color || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
  return color.toLowerCase() !== ROOM_COLOR.toLowerCase();
}

/** The presentation fill for a room: its custom colour, or its zone's tint. */
export function resolveRoomPresentationFill(room, zoneFills) {
  if (hasCustomRoomColor(room)) return room.color;
  const zone = resolveRoomZone(room);
  return zoneFills[zone] || zoneFills[ROOM_ZONES.UNASSIGNED];
}

/**
 * A name for a freshly detected room, read off what is standing in it — so a
 * loop of walls around a bed is a Bedroom rather than "Room 3", and the zone
 * resolver has something to read. Only ever used for a room that has no name
 * yet; a room someone has named keeps its name through every reconcile.
 *
 * A bed outranks everything (a studio with a WC in the corner is still where
 * someone sleeps); wet fixtures name a wet room only when no living furniture
 * shares it; a stair names the hall it stands in. Null when nothing says.
 */
export function suggestRoomName(points, floor) {
  if (!Array.isArray(points) || points.length < 3 || !floor) return null;
  const inside = (fixture) =>
    Number.isFinite(fixture?.x) &&
    Number.isFinite(fixture?.y) &&
    pointInPolygon({ x: fixture.x, y: fixture.y }, points);
  const types = new Set((floor.fixtures || []).filter(inside).map((fixture) => fixture.fixtureType));
  const has = (...names) => names.some((name) => types.has(name));
  const living = has('sofa', 'tv', 'table');

  if (has('bed')) return 'Bedroom';
  if (has('toilet', 'shower', 'lavatory') && !living) return 'T&B';
  if (has('kitchenTop') && !living) return 'Kitchen';
  if (living) return 'Living';
  const stairInside = (floor.stairs || []).some(
    (stair) => stair?.startPoint && pointInPolygon(stair.startPoint, points),
  );
  if (stairInside) return 'Stair hall';
  return null;
}
