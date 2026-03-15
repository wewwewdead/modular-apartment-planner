/**
 * Maps a 384-dim embedding vector to an RGB color object { r, g, b }.
 * Uses the first 3 dimensions (normalized via sigmoid) to derive Hue, Saturation, Lightness,
 * then converts HSL → RGB for direct use in canvas gradients.
 * Returns null if no valid embedding is provided.
 */
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

const hslToRgb = (h, s, l) => {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r, g, b;

    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
    };
};

const embeddingToColor = (embedding) => {
    if (!Array.isArray(embedding) || embedding.length < 3) return null;

    const h = sigmoid(embedding[0]) * 360;        // 0–360
    const s = 40 + sigmoid(embedding[1]) * 40;     // 40–80%
    const l = 30 + sigmoid(embedding[2]) * 30;     // 30–60%

    return hslToRgb(h, s, l);
};

export default embeddingToColor;
