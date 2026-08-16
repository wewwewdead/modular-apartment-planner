/**
 * When a sun study stops being a daylight study.
 *
 * `applySun` zeroes the ambient and hemisphere fills the moment a real sky is
 * lighting the scene, and the justification is sound while there is a sky: a
 * painted sky lights a shadow on its own, and a white fill burning on top of it
 * washes out the blue that says the lighting is real. Below the horizon that
 * justification quietly collapses. The sky keeps dimming — `skyIntensityScale`
 * is down to four per cent by −12° — and nothing takes over from it, so a study
 * dragged past sunset lands in a rig with no floor under it at all: less light
 * reaching the room than the *night* rig deliberately keeps, while the exposure
 * compensation is pinned at its 4× ceiling lifting a dying sky towards white
 * behind a building that has gone black.
 *
 * Night is not a different lighting model from a sun that has set. It is the
 * same one, arrived at from the other direction, and the two have to meet. This
 * is the fade that makes them meet.
 *
 * ## The window
 *
 * **Civil twilight, −6°**, is where the sky stops being a working light source:
 * the conventional definition is the limit at which outdoor activity can still
 * be carried on without artificial light, around 3.4 lux on the horizontal. Any
 * earlier and the fade would be putting a night rig under a sky that is still
 * doing real work.
 *
 * **Nautical twilight, −12°**, is where it is finished: the horizon is no longer
 * discernible against the sky, and horizontal illuminance is of the order of
 * 0.008 lux — some four hundred times less than at civil. Anything the sky is
 * still contributing below that is beneath the precision of every other figure
 * in this renderer.
 *
 * −12° is also where the preview's own sky model runs out: `SKY_KEYS` has no key
 * below it and `skyPalette` clamps there, so from that altitude down the painted
 * sky stops changing. Continuing to drive a daylight rig from it past that point
 * asserts something the model does not know.
 *
 * ## The curve
 *
 * Smoothstep, not a ramp. This is a crossfade between two rigs rather than a
 * physical quantity, and its ends are where the eye is most likely to catch it:
 * a linear blend changes the rate of change discontinuously at −6° and again at
 * −12°, and dragging the time dial through either shows the crease. Smoothstep
 * leaves both ends with zero slope, so the fade starts and finishes invisibly.
 *
 * Nothing here knows about three.js.
 */

/** Sky still working: the top of the fade. */
export const CIVIL_TWILIGHT_DEG = -6;

/** Sky finished: the bottom of the fade, and the floor of the preview's sky model. */
export const NAUTICAL_TWILIGHT_DEG = -12;

/**
 * How far the rig has crossed from daylight to night, 0..1, for a solar altitude
 * in **degrees**.
 *
 * Exactly 0 at and above civil twilight and exactly 1 at and below nautical, so
 * both endpoints can be relied on for identity rather than for closeness — the
 * whole point of the fade is that its bottom *is* the night rig, not something
 * near it.
 */
export function nightfallBlend(altitudeDeg) {
  const altitude = Number(altitudeDeg);
  // An unusable altitude is treated as daylight. Silently dimming the scene is
  // the worse of the two failures.
  if (!Number.isFinite(altitude)) return 0;
  if (altitude >= CIVIL_TWILIGHT_DEG) return 0;
  if (altitude <= NAUTICAL_TWILIGHT_DEG) return 1;

  const t = (altitude - CIVIL_TWILIGHT_DEG) / (NAUTICAL_TWILIGHT_DEG - CIVIL_TWILIGHT_DEG);
  return t * t * (3 - 2 * t);
}

/**
 * Linear interpolation that lands on its endpoints exactly.
 *
 * `from + (to - from) * 1` is not reliably `to` in floating point, and the
 * fixture adaptation depends on the blended rig comparing *equal* to the night
 * rig rather than nearly equal — an ulp of drift there is the difference between
 * a scale of 1 and a scale of 1.0000000001 on a lamp that must not move.
 */
export function mixNumber(from, to, amount) {
  if (!(amount > 0)) return from;
  if (amount >= 1) return to;
  return from + (to - from) * amount;
}

/**
 * Crossfade between two `0xRRGGBB` colours, per 8-bit sRGB channel.
 *
 * In the encoded space rather than in linear light, which is the same thing
 * `skyPalette` does when it slides the sky between its keys — and for the same
 * reason: these are look colours for a fill light, not radiometric quantities,
 * and interpolating them where they were authored keeps the fade on the path
 * between the two colours somebody actually chose. The endpoints are exact, so
 * the bottom of the fade is the night colour itself and not a rounding of it.
 */
export function mixSrgbHex(fromHex, toHex, amount) {
  if (!(amount > 0)) return fromHex;
  if (amount >= 1) return toHex;

  let blended = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    const from = (fromHex >> shift) & 0xff;
    const to = (toHex >> shift) & 0xff;
    blended |= Math.round(from + (to - from) * amount) << shift;
  }
  return blended >>> 0;
}
