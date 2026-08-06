const formatterCache = new Map();
const validityCache = new Map();
const civilDateOffsetsCache = new Map();

function formatterFor(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  const normalized = timeZone.trim();
  if (validityCache.has(normalized)) return validityCache.get(normalized);
  try {
    formatterFor(normalized).format(new Date(0));
    validityCache.set(normalized, true);
    return true;
  } catch {
    validityCache.set(normalized, false);
    return false;
  }
}

/** Civil clock fields for an absolute instant in an IANA timezone. */
export function zonedClockParts(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !isValidTimeZone(timeZone)) return null;
  const values = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    minutes: values.hour * 60 + values.minute,
  };
}

/** Minutes east of UTC at an instant, including the zone's DST rule. */
export function timeZoneOffsetMinutesAt(date, timeZone) {
  const parts = zonedClockParts(date, timeZone);
  if (!parts) return null;
  const civilAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const instantToSecond = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((civilAsUtc - instantToSecond) / 60000);
}

function civilSerial(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
}

function sameCivilMinute(parts, target) {
  return (
    parts?.year === target.year &&
    parts.month === target.month &&
    parts.day === target.day &&
    parts.hour === target.hour &&
    parts.minute === target.minute
  );
}

/**
 * Convert a civil time in an IANA zone to an absolute instant.
 *
 * Repeated fall-back times choose the earlier occurrence. A time inside a
 * spring-forward gap moves to the first valid civil minute after the gap,
 * matching the "compatible" behaviour of Temporal and ordinary calendars.
 */
export function zonedDateTimeToInstant({ year, month, day, minutes = 0, timeZone }) {
  if (!isValidTimeZone(timeZone)) return null;
  const wholeMinutes = Math.max(0, Math.round(minutes));
  const target = {
    year,
    month,
    day,
    hour: Math.floor(wholeMinutes / 60),
    minute: wholeMinutes % 60,
    second: 0,
  };
  const naiveUtc = civilSerial(target);

  // Sampling on both sides catches every normal and DST offset without a
  // bundled timezone database: Intl is the browser's authoritative tzdb.
  const offsetCacheKey = `${timeZone}|${year}-${month}-${day}`;
  let offsets = civilDateOffsetsCache.get(offsetCacheKey);
  if (!offsets) {
    const found = new Set();
    for (const deltaHours of [-36, -12, 0, 12, 36]) {
      const probe = new Date(naiveUtc + deltaHours * 3600000);
      const offset = timeZoneOffsetMinutesAt(probe, timeZone);
      if (Number.isFinite(offset)) found.add(offset);
    }
    offsets = [...found];
    civilDateOffsetsCache.set(offsetCacheKey, offsets);
  }

  // Almost every civil day has exactly one UTC offset. Once the date-level
  // probes establish that there is no transition nearby, conversion is just
  // arithmetic; formatting the candidate back through Intl on every time-
  // scrubber step is both redundant and surprisingly expensive under load.
  if (offsets.length === 1) return new Date(naiveUtc - offsets[0] * 60000);

  const exact = offsets
    .map((offset) => new Date(naiveUtc - offset * 60000))
    .filter((candidate) => sameCivilMinute(zonedClockParts(candidate, timeZone), target))
    .sort((a, b) => a.getTime() - b.getTime());
  if (exact.length) return exact[0];

  // The requested minute is in a DST gap. Search only the transition window
  // and choose the closest valid civil time after it.
  const approximateOffset = timeZoneOffsetMinutesAt(new Date(naiveUtc), timeZone) || 0;
  const approximate = naiveUtc - approximateOffset * 60000;
  let compatible = null;
  let smallestCivilDelta = Infinity;
  for (let delta = -180; delta <= 180; delta += 1) {
    const candidate = new Date(approximate + delta * 60000);
    const parts = zonedClockParts(candidate, timeZone);
    const civilDelta = civilSerial(parts) - naiveUtc;
    if (civilDelta >= 0 && civilDelta < smallestCivilDelta) {
      compatible = candidate;
      smallestCivilDelta = civilDelta;
    }
  }
  return compatible;
}
