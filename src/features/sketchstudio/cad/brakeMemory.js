// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5):
// the punch of the last hit made on this computer, and the way round it was
// clamped, so a new station visit starts with it. This computer's alone, in
// localStorage (never in the model: `fabrication.shop` stays the machine,
// laser and sheet). Sharp punches only: a radius punch belongs to its bend.
// An unknown key, a value that does not parse or a storage that throws falls
// back to the station's own default (brakeStation.js brakeSessionDefaults).
import { PUNCHES } from './shopCatalog.js';

export const BRAKE_PUNCH_KEY = 'sketchstudio.brake.punch';

const storage = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const sharp = (key) => typeof key === 'string' && Object.hasOwn(PUNCHES, key) && !PUNCHES[key].round;

/** The punch last clamped, { punch, reverse }, or null (nothing stored, or nothing usable). */
export function rememberedPunch() {
  try {
    const raw = storage()?.getItem(BRAKE_PUNCH_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && sharp(value.punch) ? { punch: value.punch, reverse: value.reverse === true } : null;
  } catch {
    return null;
  }
}

/** A hit committed with `punch` (a key), clamped `reverse`: remembered, when it is a sharp punch. */
export function rememberPunch({ punch, reverse = false }) {
  if (!sharp(punch)) return;
  try {
    storage()?.setItem(BRAKE_PUNCH_KEY, JSON.stringify({ punch, reverse: Boolean(reverse) }));
  } catch {
    // A storage that refuses (full, private mode) only loses the convenience.
  }
}

/** Forget the punch (tests start from the station's default). */
export function forgetPunch() {
  try {
    storage()?.removeItem(BRAKE_PUNCH_KEY);
  } catch {
    // As above.
  }
}
