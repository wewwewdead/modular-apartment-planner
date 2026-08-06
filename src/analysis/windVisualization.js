export const WIND_AMPLIFICATION_RAMP = Object.freeze([
  { stop: 0, color: [51, 88, 164] },
  { stop: 0.5, color: [94, 153, 201] },
  { stop: 1, color: [103, 181, 111] },
  { stop: 1.5, color: [242, 190, 65] },
  { stop: 2, color: [219, 91, 59] },
  { stop: 3, color: [137, 38, 50] },
]);

export const WIND_COMFORT_COLORS = Object.freeze([
  [144, 151, 160],
  [70, 130, 190],
  [73, 165, 103],
  [235, 190, 54],
  [205, 64, 55],
]);

export function windRampColor(amplification) {
  const value = Math.max(0, amplification);
  for (let index = 1; index < WIND_AMPLIFICATION_RAMP.length; index += 1) {
    const previous = WIND_AMPLIFICATION_RAMP[index - 1];
    const current = WIND_AMPLIFICATION_RAMP[index];
    if (value > current.stop) continue;
    const t = (value - previous.stop) / (current.stop - previous.stop || 1);
    return previous.color.map((channel, channelIndex) =>
      Math.round(channel + (current.color[channelIndex] - channel) * t),
    );
  }
  return WIND_AMPLIFICATION_RAMP[WIND_AMPLIFICATION_RAMP.length - 1].color;
}

export function windCellColor(study, index) {
  const grid = study?.grid;
  if (!grid) return [0, 0, 0];
  if (grid.unsafe?.[index]) return [205, 35, 45];
  if (study.mode === 'comfort') {
    return WIND_COMFORT_COLORS[grid.categories[index]] || WIND_COMFORT_COLORS[WIND_COMFORT_COLORS.length - 1];
  }
  return windRampColor(grid.amplification[index]);
}
