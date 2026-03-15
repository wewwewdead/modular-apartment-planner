# Embedding-Based Galaxy Gravity + Minimap

## Context

Currently, galaxy/star positions in the Universe are **hash-based** — `userHomeCoords(userId)` maps a userId to a deterministic point in [-25000, 25000], and posts spiral around it via `spiralLayout(index)`. Content has zero influence on position. Meanwhile, 384-dim embeddings (gte-small, normalized) already exist on every post in the `journals.embeddings` column, used only for semantic search.

**Goal**: Use embeddings to make similar content cluster spatially — tech posts near tech, poetry near poetry. When a new user joins, their galaxy visibly "flies" toward related galaxies. Add a minimap for navigation.

## Architecture Decision: Hybrid Server/Client

- **Gravity A (Galaxy-to-Galaxy)**: Runs **server-side** as a batch job. This is a global computation requiring ALL galaxy centroids — can't be done per-viewport. Force-directed layout positions galaxy centers; results stored in DB.
- **Gravity B (Star-to-Galaxy)**: Runs **client-side** with visible physics animation. Individual stars pull toward similar galaxy centroids. Server pre-computes similarity scores so the client never receives raw embedding vectors.
- **Data transfer**: Only similarity scores flow to the client (not 384-dim vectors). This keeps payloads small.

---

## Phase 1: Database Schema

**File**: `server/sql/galaxy_gravity.sql` (new)

```sql
-- 1. Galaxy centroids table
CREATE TABLE IF NOT EXISTS public.galaxy_centroids (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    mean_embedding vector(384),
    galaxy_x FLOAT,           -- settled galaxy center X
    galaxy_y FLOAT,           -- settled galaxy center Y
    post_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Galaxy similarity edges
CREATE TABLE IF NOT EXISTS public.galaxy_edges (
    user_a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    similarity FLOAT NOT NULL,
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)
);

-- 3. Settled star positions on journals
ALTER TABLE public.journals
ADD COLUMN IF NOT EXISTS settled_x FLOAT,
ADD COLUMN IF NOT EXISTS settled_y FLOAT;

-- 4. Index for viewport queries on settled coords
CREATE INDEX IF NOT EXISTS journals_settled_coords_idx
ON public.journals (settled_x, settled_y)
WHERE settled_x IS NOT NULL AND settled_y IS NOT NULL AND privacy = 'public';

-- 5. RPC: viewport query using COALESCE(settled, universe) positions
CREATE OR REPLACE FUNCTION public.get_universe_posts_viewport(
    vp_min_x FLOAT, vp_max_x FLOAT,
    vp_min_y FLOAT, vp_max_y FLOAT,
    max_count INT DEFAULT 200
)
RETURNS TABLE (
    id BIGINT, title TEXT, content TEXT, post_type TEXT,
    canvas_doc JSONB, created_at TIMESTAMPTZ,
    display_x FLOAT, display_y FLOAT,
    user_id UUID, user_name TEXT, user_image_url TEXT, user_badge TEXT,
    like_count BIGINT
)
LANGUAGE sql STABLE AS $$
    SELECT j.id, j.title, j.content, j.post_type, j.canvas_doc, j.created_at,
           COALESCE(j.settled_x, j.universe_x) AS display_x,
           COALESCE(j.settled_y, j.universe_y) AS display_y,
           u.id, u.name, u.image_url, u.badge,
           COALESCE(lc.cnt, 0)
    FROM public.journals j
    LEFT JOIN public.users u ON u.id = j.user_id
    LEFT JOIN LATERAL (SELECT count(*) AS cnt FROM public.likes WHERE journal_id = j.id) lc ON true
    WHERE j.privacy = 'public'
      AND COALESCE(j.settled_x, j.universe_x) BETWEEN vp_min_x AND vp_max_x
      AND COALESCE(j.settled_y, j.universe_y) BETWEEN vp_min_y AND vp_max_y
    ORDER BY j.created_at DESC
    LIMIT GREATEST(max_count, 1);
$$;

-- 6. RPC: find similar post pairs for semantic bridges
CREATE OR REPLACE FUNCTION public.find_similar_post_pairs(
    post_ids BIGINT[],
    threshold FLOAT DEFAULT 0.9,
    max_pairs INT DEFAULT 50
)
RETURNS TABLE (post_a BIGINT, post_b BIGINT, similarity FLOAT)
LANGUAGE sql STABLE AS $$
    SELECT a.id, b.id, 1 - (a.embeddings <=> b.embeddings)
    FROM public.journals a
    JOIN public.journals b ON b.id > a.id
    WHERE a.id = ANY(post_ids) AND b.id = ANY(post_ids)
      AND a.embeddings IS NOT NULL AND b.embeddings IS NOT NULL
      AND 1 - (a.embeddings <=> b.embeddings) >= threshold
    ORDER BY 3 DESC
    LIMIT max_pairs;
$$;

-- 7. RPC: compute star-to-galaxy pulls for visible posts
CREATE OR REPLACE FUNCTION public.get_star_galaxy_pulls(
    post_ids BIGINT[],
    min_similarity FLOAT DEFAULT 0.4,
    max_pulls INT DEFAULT 500
)
RETURNS TABLE (post_id BIGINT, galaxy_user_id UUID, similarity FLOAT)
LANGUAGE sql STABLE AS $$
    SELECT j.id, gc.user_id, 1 - (j.embeddings <=> gc.mean_embedding)
    FROM public.journals j
    CROSS JOIN public.galaxy_centroids gc
    WHERE j.id = ANY(post_ids)
      AND j.embeddings IS NOT NULL
      AND gc.mean_embedding IS NOT NULL
      AND j.user_id != gc.user_id
      AND 1 - (j.embeddings <=> gc.mean_embedding) >= min_similarity
    ORDER BY 3 DESC
    LIMIT max_pulls;
$$;
```

---

## Phase 2: Server — Galaxy Settle Service

**File**: `server/services/galaxySettleService.js` (new)

Core algorithm with 4 steps:

### Step 1: `recomputeAllCentroids()`
- Query all distinct `user_id` from `journals` where `privacy='public'` and `embeddings IS NOT NULL`
- For each user: `SELECT AVG(embeddings)::vector(384)` + post count
- UPSERT into `galaxy_centroids`

### Step 2: `recomputeGalaxyEdges()`
- Fetch all centroids with `mean_embedding IS NOT NULL`
- Since embeddings are **normalized** (gte-small + `normalize: true`), cosine similarity = dot product
- For each pair (i < j): `similarity = dot(a.mean_embedding, b.mean_embedding)`
- Filter to `similarity >= 0.25`
- Batch UPSERT into `galaxy_edges`, delete edges below threshold

### Step 3: `settleGalaxyPositions()` — Force-directed layout
- Initial positions: `userHomeCoords(userId)` (existing hash-based)
- Forces:
  - **Repulsion**: All pairs, inverse-square: `F = REPULSION_K * (countA + countB) / dist²`
  - **Attraction**: Edge pairs, spring: `F = ATTRACTION_K * similarity * (dist - idealDist)` where `idealDist = 2000 * (1 - similarity)`
  - **Boundary**: Soft wall at ±25000
- Cooling: `temperature` starts at 1.0, decays by `0.97` per iteration
- Damping: velocity multiplied by `0.9` each step
- Convergence: max 200 iterations or max displacement < 1.0
- Write settled `galaxy_x, galaxy_y` to `galaxy_centroids`

### Step 4: `settleStarPositions()`
- For each galaxy: fetch its posts + edges to other galaxies
- Each post's base position = `galaxy_center + spiralLayout(index)`
- Gravity B pull: for each neighboring galaxy centroid, if `post_similarity > 0.4`:
  - Pull strength = `(similarity - 0.4) * STAR_PULL_MAX` (max ~80px offset)
  - Direction = toward that galaxy centroid
  - Sum all pulls, clamp total offset to ±80px
- Write `settled_x, settled_y` to `journals`

### Step 5: `incrementalSettleForUser(userId)`
- Called after post creation (non-fatal)
- Recomputes just this user's centroid + edges
- Re-settles this user's galaxy position + immediate neighbors
- Re-settles this user's star positions

---

## Phase 3: Server — Route Changes

**File**: `server/routes/routes.js`

### Modify `GET /universe/posts` (lines 144-171)
Replace inline Supabase query with the `get_universe_posts_viewport` RPC. Add galaxy centroids, edges, and similar pairs to response:

```js
// 1. Posts via RPC (uses COALESCE for settled/universe coords)
const { data: posts } = await supabase.rpc('get_universe_posts_viewport', {
    vp_min_x: fMinX, vp_max_x: fMaxX,
    vp_min_y: fMinY, vp_max_y: fMaxY,
    max_count: parsedLimit
});

// 2. Galaxy centroids in/near viewport (with padding)
const { data: centroids } = await supabase
    .from('galaxy_centroids')
    .select('user_id, galaxy_x, galaxy_y, post_count')
    .not('galaxy_x', 'is', null)
    .gte('galaxy_x', fMinX - 1000).lte('galaxy_x', fMaxX + 1000)
    .gte('galaxy_y', fMinY - 1000).lte('galaxy_y', fMaxY + 1000);

// 3. Galaxy edges for visible galaxies
const visibleUserIds = [...new Set((centroids || []).map(c => c.user_id))];
const { data: edges } = await supabase
    .from('galaxy_edges')
    .select('user_a, user_b, similarity')
    .or(`user_a.in.(${visibleUserIds.join(',')}),user_b.in.(${visibleUserIds.join(',')})`)
    .gte('similarity', 0.3);

// 4. Similar post pairs for semantic bridges
const postIds = (posts || []).map(p => p.id);
let similarPairs = [];
if (postIds.length > 1 && postIds.length <= 500) {
    const { data } = await supabase.rpc('find_similar_post_pairs', {
        post_ids: postIds, threshold: 0.9, max_pairs: 50
    });
    similarPairs = data || [];
}

// 5. Star-to-galaxy pulls for client-side Gravity B animation
let starPulls = [];
if (postIds.length > 0) {
    const { data } = await supabase.rpc('get_star_galaxy_pulls', {
        post_ids: postIds, min_similarity: 0.4, max_pulls: 500
    });
    starPulls = data || [];
}

return res.json({ data: posts || [], centroids: centroids || [],
    edges: edges || [], similarPairs, starPulls });
```

### New `POST /universe/settle` (admin-only)
Triggers full `runFullSettle()` batch job.

### Modify `uploadService.js` (after line 318)
Add non-fatal call to `incrementalSettleForUser(userId)` after post creation.

---

## Phase 4: Client — Pure Math Functions (Worker-Ready)

**File**: `client/src/components/Universe/utils/cosmicPhysics.js` (new)

All pure functions, zero DOM/React dependencies, easily movable to a Web Worker.

```js
/** Cosine similarity for normalized vectors (= dot product) */
export const cosineSimilarity = (a, b) => { /* dot product loop */ };

/** Mean of array of embedding vectors */
export const computeCentroid = (embeddings) => { /* element-wise average */ };

/** Sector key for spatial partitioning (2000px blocks) */
export const sectorKey = (x, y, size = 2000) =>
    `${Math.floor(x / size)},${Math.floor(y / size)}`;

/** 9-sector neighborhood */
export const getNearbySectors = (sx, sy) => { /* 3x3 grid */ };

/** Build sector index from positioned items */
export const buildSectorIndex = (items, getX, getY, sectorSize = 2000) => { /* Map<key, item[]> */ };

/** Compute Gravity B forces for stars given their pulls and galaxy positions
 *  Returns Map<postId, {fx, fy}> */
export const computeStarForces = (starPulls, galaxyPositions, starPositions, sectorIndex) => {
    // For each pull: direction from star toward galaxy centroid, weighted by similarity
    // Sector pruning: only compute for stars in current + adjacent sectors
};

/** Apply forces with cooling/damping, return new positions
 *  Pure: (positions, forces, temperature, damping) => newPositions */
export const applyForces = (positions, forces, temperature, damping, maxDisp = 80) => {
    // newPos = oldPos + force * temperature * damping
    // Clamp total displacement from base position to maxDisp
};
```

---

## Phase 5: Client — Gravity Hook

**File**: `client/src/components/Universe/hooks/useCosmicGravity.js` (new)

Manages the client-side Gravity B simulation:

```js
export default function useCosmicGravity(posts, starPulls, galaxyPositions) {
    // State: Map<postId, {x, y}> of current animated positions
    // Ref: temperature (starts 1.0, decays by 0.95 per frame)
    // Ref: isSettled (stops animation when true)

    // On mount or when starPulls change:
    // 1. Initialize positions from post.display_x/display_y
    // 2. Build sector index
    // 3. Start requestAnimationFrame loop:
    //    a. computeStarForces(starPulls, galaxyPositions, positions, sectorIndex)
    //    b. applyForces(positions, forces, temperature, DAMPING)
    //    c. temperature *= COOLING_RATE (0.95)
    //    d. If maxDisplacement < 0.5 or temperature < 0.01 → settled
    //    e. Set state with new positions
    // 4. On settled: debounced save to server (placeholder RPC call)

    return { positions, isSettled };
    // positions: Map<postId, {x, y}> — InteractiveLayer reads from this
}
```

**Physics constants**:
- `COOLING_RATE = 0.95` — temperature halves every ~14 frames (~230ms at 60fps)
- `DAMPING = 0.85` — friction per frame
- `STAR_PULL_STRENGTH = 120` — max pull force
- `MAX_DISPLACEMENT = 80` — stars can't move more than 80px from base position
- Simulation typically settles in 30-60 frames (~0.5-1 second)

---

## Phase 6: Client — Semantic Bridges

**File**: `client/src/components/Universe/layers/InteractiveLayer.jsx` (modify)

Add a new `<Shape>` element before star rendering:

- Receives `similarPairs` prop and `posts` (Map for position lookup)
- For each pair with similarity > 0.9: draw a faint quadratic bezier curve
- Glow: `rgba(150, 200, 255, 0.1)`, `shadowBlur: 4`
- Slight perpendicular arc offset for visual appeal
- `listening={false}`, `perfectDrawEnabled={false}` for performance

---

## Phase 7: Client — Galaxy Connection Lines (Similarity-Based)

**File**: `client/src/components/Universe/utils/galaxyVisuals.js` (modify)

Update `drawGalaxyVisuals(ctx, galaxies, edges)` signature:
- When `edges` array is provided: draw connections based on similarity (opacity/width scaled by similarity)
- When no edges: fall back to existing distance-based connections (lines 150-181)
- This replaces the arbitrary 5000-unit distance threshold with meaningful semantic connections

---

## Phase 8: Client — Minimap

**File**: `client/src/components/Universe/components/UniverseMinimap.jsx` (new)

HTML `<canvas>` overlay (not inside Konva Stage):
- Size: 160x160px, bottom-left corner (avoids conflict with preview panels on the right)
- Background: `rgba(10, 14, 26, 0.85)` with border-radius
- Draws colored dots for each galaxy (using `getStarColor(userId)`)
- Draws white rectangle for current viewport bounds
- Click-to-navigate: converts minimap click to world coordinates, calls `flyTo()`
- Coordinate mapping: world [-25000, 25000] → minimap [0, 160]

**File**: `client/src/components/Universe/Universe.module.css` (modify)
- Add `.minimap` positioning styles
- Shift minimap when preview panels are open

**File**: `client/src/components/Universe/Universe.jsx` (modify)
- Render `<UniverseMinimap>` with `galaxies, camera, zoom, stageSize, onNavigate={flyTo}`

---

## Phase 9: Integration — Universe.jsx

**File**: `client/src/components/Universe/Universe.jsx` (modify)

Key changes:
1. **New state**: `centroids` (Map), `galaxyEdges`, `similarPairs`, `starPulls`
2. **Updated fetch handler**: Destructure new fields from API response
3. **Galaxy derivation**: Use `centroid.galaxy_x/galaxy_y` when available, fallback to `userHomeCoords()`
4. **Gravity hook**: `const { positions } = useCosmicGravity(postArray, starPulls, centroidPositions)`
5. **Pass to InteractiveLayer**: `positions`, `similarPairs`, `galaxyEdges`
6. **Post position resolution**: `positions.get(post.id) ?? {x: post.display_x, y: post.display_y}`

**File**: `client/API/Api.js` (modify)
- `getUniversePosts` return type now includes `centroids`, `edges`, `similarPairs`, `starPulls`
- No signature change; response shape expands

---

## File Summary

### New Files (6)
| File | Purpose |
|------|---------|
| `server/sql/galaxy_gravity.sql` | Schema + RPCs for galaxy gravity system |
| `server/services/galaxySettleService.js` | Server-side force-directed settle algorithm |
| `server/scripts/runGalaxySettle.js` | Standalone script to trigger full settle |
| `client/src/components/Universe/utils/cosmicPhysics.js` | Pure math functions (worker-ready) |
| `client/src/components/Universe/hooks/useCosmicGravity.js` | Client-side physics simulation hook |
| `client/src/components/Universe/components/UniverseMinimap.jsx` | Corner minimap component |

### Modified Files (6)
| File | Changes |
|------|---------|
| `server/routes/routes.js` (L144-171) | Replace inline query with RPC; add centroids/edges/pulls to response |
| `server/services/uploadService.js` (after L318) | Add incremental settle call after post creation |
| `client/API/Api.js` (L1329-1347) | Response shape expands (no signature change) |
| `client/src/components/Universe/Universe.jsx` | New state, gravity hook, minimap, updated galaxy derivation |
| `client/src/components/Universe/layers/InteractiveLayer.jsx` | Semantic bridges Shape, similarity-based connections, gravity positions |
| `client/src/components/Universe/Universe.module.css` | Minimap styles |

---

## Verification

1. **SQL**: Run `galaxy_gravity.sql` in Supabase SQL editor; verify tables/RPCs created
2. **Settle**: Run `node server/scripts/runGalaxySettle.js`; verify `galaxy_centroids` has positions, `journals` has `settled_x/y` values
3. **API**: Hit `GET /universe/posts?minX=-25000&maxX=25000&minY=-25000&maxY=25000` and verify response includes `centroids`, `edges`, `similarPairs`, `starPulls`
4. **Visual**: Load `/universe` — galaxies should cluster by topic; stars should briefly animate from base positions to settled positions
5. **Bridges**: Zoom in to see faint glowing arcs between semantically similar stars
6. **Minimap**: Confirm galaxy dots appear, viewport rect moves with camera, click-to-navigate works
7. **New post**: Create a post, reload universe — new star should settle near similar content
