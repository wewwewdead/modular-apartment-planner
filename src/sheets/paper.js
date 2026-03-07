export const PAPER_PRESETS = {
  A4_PORTRAIT: { key: 'A4_PORTRAIT', label: 'A4 Portrait', width: 210, height: 297 },
  A4_LANDSCAPE: { key: 'A4_LANDSCAPE', label: 'A4 Landscape', width: 297, height: 210 },
  A3_PORTRAIT: { key: 'A3_PORTRAIT', label: 'A3 Portrait', width: 297, height: 420 },
  A3_LANDSCAPE: { key: 'A3_LANDSCAPE', label: 'A3 Landscape', width: 420, height: 297 },
};

export function getPaperPreset(paperSize) {
  return PAPER_PRESETS[paperSize] || PAPER_PRESETS.A3_LANDSCAPE;
}

export function listPaperPresets() {
  return Object.values(PAPER_PRESETS);
}
