# Google Maps-style FlyTo Animation + Arrival Pulse

## Context
Clicking a galaxy name or star should trigger a cinematic camera flight — zoom out, glide across the universe, zoom in to center on the target. Currently galaxy clicks fly but with a basic animation, and star clicks don't fly at all. The star "pulse" is just an instant scale toggle (1 → 1.8 snap). We need a smooth parabolic flight with interaction blocking and a proper spring-bounce arrival pulse.

---

## Files to Modify

### 1. `client/src/components/Universe/hooks/useUniverseCamera.js`

**Add refs for stable flyTo (no stale closures):**
- `isFlying` ref — gates all drag/wheel/touch handlers during flight
- `cameraRef` / `zoomRef` — mirrors of state, read by flyTo so deps can be `[]`

**Rewrite `flyTo(targetX, targetY, targetZoom, onComplete)`:**
- Accept optional `onComplete` callback, fired when flight lands
- Duration: 1.8s fixed (cinematic)
- Easing: cubic ease-in-out
- Parabolic zoom arc: zoom out proportional to distance at midpoint, zoom in on arrival
- Sets `isFlying.current = true` at start, `false` on finish
- Cancels any in-progress flight (without calling old onComplete)
- Deps: `[]` (reads from refs, stable reference)

**Guard interaction handlers:**
- `handleMouseDown`: early return if `isFlying.current`
- `handleWheel`: early return if `isFlying.current` (after preventDefault)
- `handleTouchMove`: early return if `isFlying.current`

**Cleanup on unmount:**
- `useEffect` cleanup cancels any running rAF and resets isFlying

**Export:** add `isFlying` to the return object

### 2. `client/src/components/Universe/Universe.jsx`

**Destructure `isFlying`** from hook.

**Rewrite `handleStarClick(post)`:**
- Block if `isFlying.current` is true
- Set selectedPost, clear galaxy state
- Call `flyTo(post.universe_x, post.universe_y, 1.2, onComplete)`
- In `onComplete`: set `pulsingId` → clear after 700ms

**Rewrite `handleGalaxyClick(galaxy)`:**
- Block if `isFlying.current` is true
- Keep existing behavior (flyTo + fetch profile)

### 3. `client/src/components/Universe/components/StarGroup.jsx`

**Replace instant scale toggle with animated Konva.Tween pulse:**
- Add `useRef, useEffect` imports + `import Konva from 'konva'`
- Add `groupRef` on the outer `<Group>` and `tweenRef` for cleanup
- Remove inline `scaleX={isPulsing ? 1.8 : 1}` / `scaleY`
- Add `useEffect` watching `isPulsing`:
  - Phase 1: Tween scale 1 → 1.8, 350ms, `ElasticEaseOut` (spring overshoot)
  - Phase 2 (onFinish): Tween scale 1.8 → 1, 250ms, `EaseOut` (settle)
  - Cleanup: destroy tween on unmount or isPulsing change

### 4. `client/src/components/Universe/layers/InteractiveLayer.jsx`
**No changes needed** — isPulsing prop contract unchanged.

---

## Animation Timeline (Star Click)

```
0ms        Click → flyTo starts, interactions blocked
0-1800ms   Parabolic flight (zoom out → glide → zoom in)
~1800ms    Land → interactions re-enabled → onComplete fires
~1810ms    setPulsingId → StarGroup useEffect triggers
~1810-2160 Phase 1 Tween: elastic scale up to 1.8
~2160-2410 Phase 2 Tween: ease back to 1.0
~2500ms    pulsingId cleared
```

---

## Edge Cases
- **Click during flight:** Ignored (isFlying guard)
- **Already centered star:** Short distance → 800ms min duration, minimal zoom arc
- **Unmount during flight:** useEffect cleanup cancels rAF
- **Tween on unmounted StarGroup:** useEffect cleanup destroys tween

---

## Verification
1. Click a star → camera flies with zoom-out arc, centers on star, star pulses on arrival
2. Click a galaxy name → camera flies, galaxy preview panel appears
3. During flight, drag/wheel/pinch/clicks are all blocked
4. After landing, all interactions work normally
5. Rapid clicking doesn't cause glitches (blocked during flight)
6. Pulse is a smooth spring bounce, not an instant snap
