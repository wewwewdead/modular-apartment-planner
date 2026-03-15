/**
 * Pure math functions for client-side gravity simulation.
 * Zero DOM/React dependencies and worker-ready.
 */

const EPSILON = 1e-8;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toFiniteNumber = (value) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};

const normalizeMaxEdges = (value, fallback) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const toEmbeddingArray = (value) => {
    if (value == null) return null;

    let source = null;

    if (Array.isArray(value)) {
        source = value;
    } else if (ArrayBuffer.isView(value)) {
        source = Array.from(value);
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) source = parsed;
            } catch {
                source = null;
            }
        }

        if (!source) {
            source = trimmed
                .replace(/[[\]()]/g, '')
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);
        }
    }

    if (!source || source.length === 0) return null;

    const numeric = new Array(source.length);
    for (let i = 0; i < source.length; i++) {
        const n = Number(source[i]);
        if (!Number.isFinite(n)) return null;
        numeric[i] = n;
    }
    return numeric;
};

export const normalizeEmbedding = (vector) => {
    const arr = toEmbeddingArray(vector);
    if (!arr || arr.length === 0) return null;

    let normSq = 0;
    for (let i = 0; i < arr.length; i++) {
        normSq += arr[i] * arr[i];
    }
    if (normSq <= EPSILON) return null;

    const invNorm = 1 / Math.sqrt(normSq);
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        out[i] = arr[i] * invNorm;
    }
    return out;
};

export const cosineSimilarity = (a, b) => {
    const arrA = toEmbeddingArray(a);
    const arrB = toEmbeddingArray(b);
    if (!arrA || !arrB || arrA.length === 0 || arrA.length !== arrB.length) {
        return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < arrA.length; i++) {
        const va = arrA[i];
        const vb = arrB[i];
        if (!Number.isFinite(va) || !Number.isFinite(vb)) return 0;
        dot += va * vb;
        normA += va * va;
        normB += vb * vb;
    }

    if (normA <= EPSILON || normB <= EPSILON) return 0;

    const sim = dot / Math.sqrt(normA * normB);
    if (!Number.isFinite(sim)) return 0;
    return clamp(sim, -1, 1);
};

export const computeGalaxyCentroids = (posts = []) => {
    const sumByUser = new Map();
    const postCountByUser = new Map();

    for (const post of posts) {
        const userId = post?.users?.id ?? post?.user_id;
        if (!userId) continue;

        const embedding = toEmbeddingArray(post?.embeddings);
        if (!embedding) continue;

        if (!sumByUser.has(userId)) {
            sumByUser.set(userId, new Float64Array(embedding.length));
            postCountByUser.set(userId, 0);
        }

        const sum = sumByUser.get(userId);
        if (!sum || sum.length !== embedding.length) continue;

        for (let i = 0; i < embedding.length; i++) {
            sum[i] += embedding[i];
        }
        postCountByUser.set(userId, (postCountByUser.get(userId) || 0) + 1);
    }

    const centroidByUser = new Map();
    for (const [userId, sum] of sumByUser.entries()) {
        const count = postCountByUser.get(userId) || 0;
        if (count <= 0) continue;

        const mean = new Array(sum.length);
        for (let i = 0; i < sum.length; i++) {
            mean[i] = sum[i] / count;
        }

        const normalized = normalizeEmbedding(mean);
        if (normalized) centroidByUser.set(userId, normalized);
    }

    return { centroidByUser, postCountByUser };
};

export const computeSectorKey = (x, y, sectorSize = 2000) => {
    const fx = toFiniteNumber(x);
    const fy = toFiniteNumber(y);
    const size = Math.max(1, Number(sectorSize) || 2000);
    if (fx == null || fy == null) return null;

    const sx = Math.floor(fx / size);
    const sy = Math.floor(fy / size);
    return `${sx}:${sy}`;
};

export const getNeighborSectorKeys = (centerKey) => {
    if (typeof centerKey !== 'string') return [];
    const [sxRaw, syRaw] = centerKey.split(':');
    const sx = Number(sxRaw);
    const sy = Number(syRaw);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return [];

    const keys = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            keys.push(`${sx + dx}:${sy + dy}`);
        }
    }
    return keys;
};

export const buildSectorIndex = (items, getCoords, sectorSize = 2000) => {
    const index = new Map();
    if (!Array.isArray(items) || typeof getCoords !== 'function') return index;

    for (const item of items) {
        const coords = getCoords(item);
        if (!coords) continue;
        const key = computeSectorKey(coords.x, coords.y, sectorSize);
        if (!key) continue;

        if (!index.has(key)) index.set(key, []);
        index.get(key).push(item);
    }

    return index;
};

export const computeGalaxySimilarityEdges = (
    centroidByUser,
    activeUserIds,
    threshold = 0.3,
    maxEdges = 500
) => {
    if (!(centroidByUser instanceof Map) || centroidByUser.size < 2) return [];

    const users = activeUserIds
        ? Array.from(activeUserIds).filter((id) => centroidByUser.has(id))
        : Array.from(centroidByUser.keys());

    if (users.length < 2) return [];

    const minSimilarity = Number.isFinite(Number(threshold)) ? Number(threshold) : 0.3;
    const edges = [];

    for (let i = 0; i < users.length; i++) {
        for (let j = i + 1; j < users.length; j++) {
            const userA = users[i];
            const userB = users[j];
            const sim = cosineSimilarity(centroidByUser.get(userA), centroidByUser.get(userB));
            if (sim >= minSimilarity) {
                edges.push({ user_a: userA, user_b: userB, similarity: sim });
            }
        }
    }

    edges.sort((a, b) => b.similarity - a.similarity);
    const limit = normalizeMaxEdges(maxEdges, 500);
    return edges.length > limit ? edges.slice(0, limit) : edges;
};

const clampOffsetMagnitude = (offset, maxOffset) => {
    const limit = Math.max(0, Number(maxOffset) || 0);
    if (limit === 0) return { dx: 0, dy: 0 };

    const mag = Math.sqrt(offset.dx * offset.dx + offset.dy * offset.dy);
    if (mag <= limit || mag <= EPSILON) return offset;

    return {
        dx: (offset.dx / mag) * limit,
        dy: (offset.dy / mag) * limit,
    };
};

export const computeGalaxyForces = (positions, targets, edges, options = {}) => {
    const forces = new Map();
    if (!(positions instanceof Map) || positions.size === 0) return forces;

    const springK = Number.isFinite(Number(options.springK)) ? Number(options.springK) : 0.06;
    const edgeStrength = Number.isFinite(Number(options.edgeStrength)) ? Number(options.edgeStrength) : 0.0004;
    const idealDistanceScale = Number.isFinite(Number(options.idealDistanceScale))
        ? Number(options.idealDistanceScale)
        : 3000;
    const repulsion = Number.isFinite(Number(options.repulsion)) ? Number(options.repulsion) : 3e6;
    const maxRepulsionDistance = Number.isFinite(Number(options.maxRepulsionDistance))
        ? Number(options.maxRepulsionDistance)
        : 10000;

    const activeIds = options.activeIds
        ? new Set(Array.from(options.activeIds).filter((id) => positions.has(id)))
        : new Set(positions.keys());
    const ids = Array.from(activeIds);
    if (ids.length === 0) return forces;

    for (const id of ids) {
        forces.set(id, { fx: 0, fy: 0 });
    }

    // 1) Spring toward targets (used as fallback when server targets exist).
    if (targets instanceof Map && targets.size > 0) {
        for (const id of ids) {
            const pos = positions.get(id);
            const target = targets.get(id);
            if (!pos || !target) continue;
            const f = forces.get(id);
            f.fx += (target.x - pos.x) * springK;
            f.fy += (target.y - pos.y) * springK;
        }
    }

    // 2) Similarity edges.
    if (Array.isArray(edges) && edges.length > 0) {
        for (const edge of edges) {
            const userA = edge?.user_a;
            const userB = edge?.user_b;
            if (!activeIds.has(userA) || !activeIds.has(userB)) continue;

            const posA = positions.get(userA);
            const posB = positions.get(userB);
            if (!posA || !posB) continue;

            const fA = forces.get(userA);
            const fB = forces.get(userB);
            if (!fA || !fB) continue;

            const similarity = clamp(Number(edge?.similarity) || 0, -1, 1);
            const dx = posB.x - posA.x;
            const dy = posB.y - posA.y;
            const distSq = Math.max(dx * dx + dy * dy, 1);
            const dist = Math.sqrt(distSq);
            const idealDist = idealDistanceScale * (1 - Math.max(0, similarity));
            const strength = Math.max(0, similarity) * edgeStrength * (dist - idealDist);
            const fx = (dx / dist) * strength;
            const fy = (dy / dist) * strength;

            fA.fx += fx;
            fA.fy += fy;
            fB.fx -= fx;
            fB.fy -= fy;
        }
    }

    // 3) Pairwise repulsion.
    const maxRepulsionDistanceSq = maxRepulsionDistance * maxRepulsionDistance;
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = positions.get(ids[i]);
            const b = positions.get(ids[j]);
            if (!a || !b) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSqRaw = dx * dx + dy * dy;
            if (!Number.isFinite(distSqRaw) || distSqRaw > maxRepulsionDistanceSq) continue;

            const distSq = Math.max(distSqRaw, 1);
            const dist = Math.sqrt(distSq);
            const force = repulsion / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            const fA = forces.get(ids[i]);
            const fB = forces.get(ids[j]);
            fA.fx -= fx;
            fA.fy -= fy;
            fB.fx += fx;
            fB.fy += fy;
        }
    }

    return forces;
};

export const computeStarPullOffsets = (
    starPulls,
    galaxyTargets,
    starBases,
    pullStrength = 120,
    maxOffset = 80
) => {
    const offsets = new Map();
    if (!Array.isArray(starPulls) || starPulls.length === 0) return offsets;
    if (!(galaxyTargets instanceof Map) || !(starBases instanceof Map)) return offsets;

    const resolvedPullStrength = Number.isFinite(Number(pullStrength)) ? Number(pullStrength) : 120;

    for (const pull of starPulls) {
        const postId = pull?.post_id;
        const galaxyId = pull?.galaxy_user_id;
        const similarity = Number(pull?.similarity);
        if (!postId || !galaxyId || !Number.isFinite(similarity) || similarity <= 0.4) continue;

        const galaxy = galaxyTargets.get(galaxyId);
        const base = starBases.get(postId);
        if (!galaxy || !base) continue;

        const dx = galaxy.x - base.x;
        const dy = galaxy.y - base.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const strength = (similarity - 0.4) * resolvedPullStrength;
        const fx = (dx / dist) * strength;
        const fy = (dy / dist) * strength;

        if (!offsets.has(postId)) {
            offsets.set(postId, { dx: 0, dy: 0 });
        }
        const offset = offsets.get(postId);
        offset.dx += fx;
        offset.dy += fy;
    }

    for (const [postId, offset] of offsets.entries()) {
        offsets.set(postId, clampOffsetMagnitude(offset, maxOffset));
    }

    return offsets;
};

export const computeStarPullOffsetsFromEmbeddings = ({
    posts = [],
    galaxyCentroids = new Map(),
    galaxyPositions = new Map(),
    activePostIds = null,
    activeGalaxyIds = null,
    minSimilarity = 0.4,
    pullStrength = 120,
    maxOffset = 80,
    maxGalaxyLinks = 6,
} = {}) => {
    const offsets = new Map();
    if (!Array.isArray(posts) || posts.length === 0) return offsets;
    if (!(galaxyCentroids instanceof Map) || galaxyCentroids.size === 0) return offsets;
    if (!(galaxyPositions instanceof Map) || galaxyPositions.size === 0) return offsets;

    const minSim = Number.isFinite(Number(minSimilarity)) ? Number(minSimilarity) : 0.4;
    const resolvedPullStrength = Number.isFinite(Number(pullStrength)) ? Number(pullStrength) : 120;
    const topGalaxyLimit = normalizeMaxEdges(maxGalaxyLinks, 6);

    const galaxyIds = activeGalaxyIds
        ? Array.from(activeGalaxyIds).filter((id) => galaxyCentroids.has(id) && galaxyPositions.has(id))
        : Array.from(galaxyCentroids.keys()).filter((id) => galaxyPositions.has(id));

    if (galaxyIds.length === 0) return offsets;

    for (const post of posts) {
        const postId = post?.id;
        if (!postId) continue;
        if (activePostIds && !activePostIds.has(postId)) continue;

        const ownerId = post?.users?.id ?? post?.user_id;
        const postEmbedding = normalizeEmbedding(post?.embeddings);
        if (!postEmbedding) continue;

        const baseX = toFiniteNumber(post?.universe_x) ?? toFiniteNumber(post?.display_x);
        const baseY = toFiniteNumber(post?.universe_y) ?? toFiniteNumber(post?.display_y);
        if (baseX == null || baseY == null) continue;

        const candidates = [];
        for (const galaxyId of galaxyIds) {
            if (!galaxyId || galaxyId === ownerId) continue;

            const centroidEmbedding = galaxyCentroids.get(galaxyId);
            const galaxyPos = galaxyPositions.get(galaxyId);
            if (!centroidEmbedding || !galaxyPos) continue;

            const sim = cosineSimilarity(postEmbedding, centroidEmbedding);
            if (sim < minSim) continue;

            candidates.push({ sim, galaxyPos });
        }

        if (candidates.length === 0) continue;
        candidates.sort((a, b) => b.sim - a.sim);

        let dxSum = 0;
        let dySum = 0;
        const limit = Math.min(candidates.length, topGalaxyLimit);
        for (let i = 0; i < limit; i++) {
            const { sim, galaxyPos } = candidates[i];
            const dx = galaxyPos.x - baseX;
            const dy = galaxyPos.y - baseY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const strength = (sim - minSim) * resolvedPullStrength;
            dxSum += (dx / dist) * strength;
            dySum += (dy / dist) * strength;
        }

        offsets.set(postId, clampOffsetMagnitude({ dx: dxSum, dy: dySum }, maxOffset));
    }

    return offsets;
};

export const computeConstellationPullOffsets = (
    constellations,
    starPositions,
    options = {}
) => {
    const offsets = new Map();
    if (!Array.isArray(constellations) || constellations.length === 0) return offsets;
    if (!(starPositions instanceof Map) || starPositions.size === 0) return offsets;

    const restLength = Number.isFinite(options.restLength) ? options.restLength : 200;
    const stiffness = Number.isFinite(options.stiffness) ? options.stiffness : 0.03;
    const maxMagnitude = Number.isFinite(options.maxMagnitude) ? options.maxMagnitude : 120;

    for (const link of constellations) {
        const posA = starPositions.get(link.star_id_a);
        const posB = starPositions.get(link.star_id_b);
        if (!posA || !posB) continue;

        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - restLength;

        const fx = (dx / dist) * displacement * stiffness;
        const fy = (dy / dist) * displacement * stiffness;

        // Accumulate for star A (pull toward B)
        if (!offsets.has(link.star_id_a)) {
            offsets.set(link.star_id_a, { dx: 0, dy: 0 });
        }
        const oA = offsets.get(link.star_id_a);
        oA.dx += fx;
        oA.dy += fy;

        // Accumulate for star B (pull toward A)
        if (!offsets.has(link.star_id_b)) {
            offsets.set(link.star_id_b, { dx: 0, dy: 0 });
        }
        const oB = offsets.get(link.star_id_b);
        oB.dx -= fx;
        oB.dy -= fy;
    }

    // Clamp magnitudes
    for (const [postId, offset] of offsets.entries()) {
        const mag = Math.sqrt(offset.dx * offset.dx + offset.dy * offset.dy);
        if (mag > maxMagnitude) {
            offsets.set(postId, {
                dx: (offset.dx / mag) * maxMagnitude,
                dy: (offset.dy / mag) * maxMagnitude,
            });
        }
    }

    return offsets;
};

export const computeSemanticBridges = (
    posts,
    computedStarPositions,
    threshold = 0.9,
    maxPairs = 120
) => {
    if (!Array.isArray(posts) || posts.length < 2) return [];
    if (!(computedStarPositions instanceof Map)) return [];

    const minSimilarity = Number.isFinite(Number(threshold)) ? Number(threshold) : 0.9;
    const limit = normalizeMaxEdges(maxPairs, 120);

    const enriched = [];
    for (const post of posts) {
        const postId = post?.id;
        if (!postId || !computedStarPositions.has(postId)) continue;
        const embedding = normalizeEmbedding(post?.embeddings);
        if (!embedding) continue;
        enriched.push({ postId, embedding });
    }

    if (enriched.length < 2) return [];

    const pairs = [];
    for (let i = 0; i < enriched.length; i++) {
        for (let j = i + 1; j < enriched.length; j++) {
            const similarity = cosineSimilarity(enriched[i].embedding, enriched[j].embedding);
            if (similarity > minSimilarity) {
                pairs.push({
                    post_a: enriched[i].postId,
                    post_b: enriched[j].postId,
                    similarity,
                });
            }
        }
    }

    pairs.sort((a, b) => b.similarity - a.similarity);
    return pairs.length > limit ? pairs.slice(0, limit) : pairs;
};
