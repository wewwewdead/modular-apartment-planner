import { STAR_COLORS } from './starUtils';

/**
 * Union-Find to group constellation links into connected components (chains).
 * Returns an array of chains, where each chain is an array of constellation link objects.
 */
export const computeConstellationChains = (constellations) => {
    if (!Array.isArray(constellations) || constellations.length === 0) return [];

    const parent = new Map();
    const rank = new Map();

    const find = (x) => {
        if (!parent.has(x)) {
            parent.set(x, x);
            rank.set(x, 0);
        }
        if (parent.get(x) !== x) {
            parent.set(x, find(parent.get(x)));
        }
        return parent.get(x);
    };

    const union = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA === rootB) return;

        const rankA = rank.get(rootA) || 0;
        const rankB = rank.get(rootB) || 0;
        if (rankA < rankB) {
            parent.set(rootA, rootB);
        } else if (rankA > rankB) {
            parent.set(rootB, rootA);
        } else {
            parent.set(rootB, rootA);
            rank.set(rootA, rankA + 1);
        }
    };

    // Build union-find over star IDs
    for (const link of constellations) {
        union(link.star_id_a, link.star_id_b);
    }

    // Group links by their chain root
    const chainMap = new Map();
    for (const link of constellations) {
        const root = find(link.star_id_a);
        if (!chainMap.has(root)) {
            chainMap.set(root, []);
        }
        chainMap.get(root).push(link);
    }

    return Array.from(chainMap.values());
};

/**
 * Assigns a consistent color from STAR_COLORS to each chain.
 * Returns a Map<constellationId, colorHex>.
 */
export const assignChainColors = (chains) => {
    const colorMap = new Map();

    chains.forEach((chain, i) => {
        const color = STAR_COLORS[i % STAR_COLORS.length];
        for (const link of chain) {
            colorMap.set(link.id, color);
        }
    });

    return colorMap;
};
