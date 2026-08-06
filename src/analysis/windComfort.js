/** City of London modified Lawson screening thresholds, m/s at 5% exceedance. */
export const WIND_COMFORT_CATEGORIES = Object.freeze([
  { id: 'frequentSitting', label: 'Frequent sitting', maximumSpeed: 2.5 },
  { id: 'occasionalSitting', label: 'Occasional sitting', maximumSpeed: 4 },
  { id: 'standing', label: 'Standing', maximumSpeed: 6 },
  { id: 'walking', label: 'Walking', maximumSpeed: 8 },
  { id: 'uncomfortable', label: 'Uncomfortable', maximumSpeed: Infinity },
]);

export const WIND_SAFETY_SPEED = 15;
export const COMFORT_EXCEEDANCE = 0.05;
export const SAFETY_EXCEEDANCE = 0.00022;

export function weibullMixtureCdf(speed, amplifications, windRose) {
  let probability = 0;
  for (let index = 0; index < windRose.length; index += 1) {
    const sector = windRose[index];
    const localScale = Math.max(0, amplifications[index]) * sector.weibullC;
    const cdf = localScale <= 1e-9 ? 1 : 1 - Math.exp(-Math.pow(Math.max(0, speed) / localScale, sector.weibullK));
    probability += sector.frequency * cdf;
  }
  return probability;
}

export function weibullMixtureQuantile(amplifications, windRose, probability) {
  if (!windRose.length || !(probability > 0) || !(probability < 1)) return 0;
  let low = 0;
  let high = 1;
  while (weibullMixtureCdf(high, amplifications, windRose) < probability && high < 200) high *= 2;
  for (let pass = 0; pass < 36; pass += 1) {
    const middle = (low + high) / 2;
    if (weibullMixtureCdf(middle, amplifications, windRose) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function comfortCategoryIndex(speed) {
  const index = WIND_COMFORT_CATEGORIES.findIndex((category) => speed <= category.maximumSpeed);
  return index >= 0 ? index : WIND_COMFORT_CATEGORIES.length - 1;
}

export function classifyComfortGrid({ sectorAmplifications, sectorCount, cellCount, obstacles, windRose }) {
  const comfortSpeed = new Float32Array(cellCount);
  const safetySpeed = new Float32Array(cellCount);
  const categories = new Uint8Array(cellCount);
  const unsafe = new Uint8Array(cellCount);
  const counts = new Uint32Array(WIND_COMFORT_CATEGORIES.length);
  const values = new Float64Array(sectorCount);
  let assessedCellCount = 0;
  let unsafeCellCount = 0;

  for (let cell = 0; cell < cellCount; cell += 1) {
    if (obstacles[cell]) continue;
    for (let sector = 0; sector < sectorCount; sector += 1) {
      values[sector] = sectorAmplifications[sector * cellCount + cell];
    }
    const comfort = weibullMixtureQuantile(values, windRose, 1 - COMFORT_EXCEEDANCE);
    const safety = weibullMixtureQuantile(values, windRose, 1 - SAFETY_EXCEEDANCE);
    const category = comfortCategoryIndex(comfort);
    comfortSpeed[cell] = comfort;
    safetySpeed[cell] = safety;
    categories[cell] = category;
    counts[category] += 1;
    assessedCellCount += 1;
    if (safety > WIND_SAFETY_SPEED) {
      unsafe[cell] = 1;
      unsafeCellCount += 1;
    }
  }

  return {
    comfortSpeed,
    safetySpeed,
    categories,
    unsafe,
    counts,
    assessedCellCount,
    unsafeCellCount,
    unsafeFraction: assessedCellCount ? unsafeCellCount / assessedCellCount : 0,
  };
}
