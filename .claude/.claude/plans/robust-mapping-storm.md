# Matter.js Physics Integration for Universe Stars

## Context

Stars in the Universe are currently **statically positioned** — they compute `baseX + galaxyDrift + pullOffset` once per render and don't move independently. Galaxy-level physics (force-directed layout) animates galaxy cluster positions via `useCosmicGravity`, but individual stars have no velocity, mass, or collision behavior.

This plan adds **star-level physics** using Matter.js so stars become living bodies with mass, velocity, air friction, semantic gravity, collisions, and interactive dragging — while keeping the existing galaxy-level physics unchanged.

---

## New Files

### 1. `client/src/components/Universe/physics/matterEngine.js`
Matter.js engine factory + configuration constants. Pure module, no React.

- `createStarEngine()` — creates `Matter.Engine` with `gravity: {x:0, y:0}`, `enableSleeping: true`
- `createStarBody(postId, x, y, radius, mass)` — `Matter.Bodies.circle` with `frictionAir: 0.02` (0.98 damping), `restitution: 0.4`, label = postId
- `createConstellationConstraint(bodyA, bodyB, similarity)` — soft spring between similar star pairs, length inversely proportional to similarity
- `getStarMass(likeCount)` — mass proportional to visual area: `PI * r^2 * 0.01` (range ~1.1 to ~4.5)
- `PHYSICS_CONFIG` — all tunable constants (anchorSpringK, semanticPullK, constraintStiffness, sleepThreshold, maxActiveBodies=300)

### 2. `client/src/components/Universe/physics/semanticForces.js`
Pure force computation functions, no React or Matter dependency.

- `buildSemanticMaps(starPulls, similarPairs)` — pre-processes server data into O(1) lookup Maps:
  - `starPullMap: Map<postId, [{galaxyUserId, similarity}]>` (from `starPulls`)
  - `pairMap: Map<postId, [{otherPostId, similarity}]>` (from `similarPairs`)
- `computeAnchorForce(bodyPos, anchorPos, springK)` — soft spring toward galaxy home position
- `computeSemanticPullForce(bodyPos, postId, starPullMap, galaxyPositions, pullK)` — cross-galaxy attraction from server similarity data

### 3. `client/src/components/Universe/hooks/useStarPhysics.js`
Main React hook — owns the Matter.js engine, body lifecycle, force application loop, drag system.

**Inputs:**
- `posts`, `activePostIds`, `galaxyPositions` (from existing hooks)
- `starPulls`, `similarPairs` (server gravity data from state)
- `isGalaxySettled` (from `useCosmicGravity`)
- `camera`, `zoom`, `stageSize` (for screen↔world coordinate conversion during drag)
- `enabled` flag

**Returns:**
- `starBodyPositions: Map<postId, {x, y}>` — current physics positions (updated every 3 frames)
- `isStarDragging: Ref<boolean>` — for camera hook coordination
- `handleStarPointerDown(postId, screenX, screenY)` — begin drag
- `handlePointerMove(screenX, screenY)` — update drag target
- `handlePointerUp()` — release drag

**RAF loop (runs continuously while enabled):**
1. Update anchor targets from latest `galaxyPositions` + per-star local offsets
2. For each awake body: apply anchor force + semantic pull force via `Body.applyForce`
3. `Engine.update(engine, 1000/60)` — fixed timestep
4. Push body positions to React state every `RENDER_EVERY=3` frames
5. Periodic cleanup of stale static bodies (every 10s)

**Body lifecycle** (effect on `activePostIds` change):
- New postId in active set → create Matter body at current static position (using existing `universe_x + galaxyDrift + pullOffset` formula), add to world
- PostId leaves active set → `Body.setStatic(body, true)` (sleeps, keeps in world)
- Bodies static for 30s+ outside active sectors → `World.remove` (caps memory)

**Constellation constraints** (effect on `similarPairs` change):
- Build `Constraint` between body pairs where both are active
- Length = `40 + (1 - similarity) * 120` (closer for higher similarity)
- When user drags a star, connected stars follow via these constraints

**Drag system:**
- `handleStarPointerDown` → creates a temporary `Constraint` from star body to a fixed world point at cursor position
- `handlePointerMove` → updates the constraint's fixed point (screen→world conversion)
- `handlePointerUp` → removes constraint, body retains velocity from drag motion
- Sets `isStarDragging.current = true` while active

### 4. `client/src/components/Universe/utils/coordConversion.js`
Screen↔world coordinate conversion (used by drag system).

- `screenToWorld(screenX, screenY, camera, zoom, stageSize)` — inverse of Konva layer transform at parallax=1.0
- `worldToScreen(worldX, worldY, camera, zoom, stageSize)` — forward transform

---

## Modified Files

### 5. `client/src/components/Universe/Universe.jsx`

- Import and call `useStarPhysics` after `useCosmicGravity` (~line 156)
- Pass `starBodyPositions` + drag handlers down to `InteractiveLayer`
- Modify `getComputedStarPosition` (line 174): check `starBodyPositions.get(post.id)` first, fall back to existing static formula
- Wire pointer events for drag: on `Stage` mouseDown/touchStart, check if target is a star → route to physics drag instead of camera pan
- Pass `isStarDragging` ref to `useUniverseCamera`

### 6. `client/src/components/Universe/hooks/useUniverseCamera.js`

- Accept `isStarDragging` ref as 3rd parameter
- Add early return in `handleMouseDown` (line 99): `if (isStarDragging?.current) return;`
- Add guard in `handleMouseMove` (line 112): `if (isStarDragging?.current) return;`

### 7. `client/src/components/Universe/layers/InteractiveLayer.jsx`

- Accept new props: `starBodyPositions`, `onStarDragStart`, `onStarDragMove`, `onStarDragEnd`
- Modify `computedStarPositions` useMemo (line 68): check `starBodyPositions?.get(post.id)` first, fall back to existing formula
- Pass drag props to `StarGroup` components

### 8. `client/src/components/Universe/components/StarGroup.jsx`

- Accept new props: `onPointerDown` (for drag initiation)
- Add `onMouseDown` + `onTouchStart` handlers to the bright core `Circle` (line 91) that call `onPointerDown` with `e.cancelBubble = true` to prevent stage-level camera pan
- Do NOT use Konva's `draggable` — physics engine controls position, not Konva

---

## How It All Fits Together

```
Server data (starPulls, similarPairs)
        │
        ▼
useStarPhysics hook
  ├─ Creates Matter.js bodies for active stars
  ├─ Applies semantic forces each frame (anchor + pull + constraints)
  ├─ Matter.Engine.update() handles velocity, collision, sleeping
  └─ Outputs starBodyPositions Map every 3 frames
        │
        ▼
InteractiveLayer
  ├─ computedStarPositions prefers physics position when available
  ├─ Falls back to static formula for stars without bodies
  └─ StarGroup renders at physics-driven coordinates
        │
        ▼
StarGroup
  └─ onPointerDown on core circle → triggers physics drag
      (cancels bubble → camera doesn't pan)
```

**Galaxy-level physics (useCosmicGravity)** continues unchanged — it moves galaxy centroids. Star physics reads the latest `galaxyPositions` each frame to compute anchor targets, so stars follow their galaxy's movement naturally.

---

## Key Design Decisions

1. **Matter.js for velocity/collision, custom code for semantic forces** — Matter.js doesn't have N-body gravity built in. We use it as a velocity integrator + collision solver, and apply custom `Body.applyForce()` calls for the semantic gravity.

2. **No raw embeddings needed on client** — all force data comes from server-provided `starPulls` (post→galaxy attraction, sim≥0.4) and `similarPairs` (post→post bonds, sim≥0.9). Pre-processed into O(1) Maps.

3. **Anchor spring keeps stars near their galaxy** — soft force `k=0.0015` toward `galaxyAnimatedPos + localOffset`. Semantic forces can overcome this at high similarity, allowing stars to drift toward related galaxies.

4. **Drag uses temporary Constraint, not Konva draggable** — physics engine stays the single source of truth for position. Dragged star retains velocity on release ("throwing" feel). Connected stars follow via constellation constraints.

5. **Body lifecycle matches sector partitioning** — only stars in the 3×3 active sector window get awake physics bodies (max ~300). Bodies outside are set to static, then destroyed after 30s. This keeps the simulation lightweight.

---

## Verification

1. **Install**: `cd client && npm install matter-js` — confirm it appears in package.json
2. **Visual check**: Stars should appear in their existing positions initially, then gently drift into constellation clusters as forces take effect
3. **Drag test**: Click and drag a star — it should move with physics feel, connected stars should follow via constraints, camera should NOT pan
4. **Release test**: "Throw" a star — it should glide and slow down due to frictionAir (0.98 damping)
5. **Collision test**: Drag two stars into each other — they should bounce (restitution 0.4)
6. **Sleep test**: Stars that stop moving should go to sleep (check with Matter.js debug or console log) — CPU should not increase over time
7. **Pan/zoom test**: Camera pan, wheel zoom, pinch zoom, flyTo, minimap navigation should all still work correctly
8. **Performance**: Monitor frame rate with ~200 active stars — should stay above 50fps
