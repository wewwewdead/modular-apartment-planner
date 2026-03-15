# Upgrade Rocket Mode: True 3D Omnidirectional Flight + Dynamic Labels

## Context
The current Rocket Mode uses a pseudo-3D trick: the camera has a 2D position `{x, y}` and a single heading angle (yaw only). Stars have a fake `z` depth value that gets decremented each frame to simulate forward motion. This means you can only fly "forward" and turn left/right — no looking up/down, no turning around, no true 3D freedom.

**Goal:** Replace the fake z-subtraction model with real 3D camera math (position `{x,y,z}` + yaw/pitch rotation), so you can fly in any direction. Add dynamic star labels that fade in as you approach.

## Files to Modify (no new files)

### 1. `client/src/components/Universe/hooks/useRocketMode.js` — Full rewrite of internals

**State changes:**
- `rocketPosRef {x,y}` → `camPosRef {x, y, z}` — 3D position
- `headingRef` (single angle) → `yawRef` + `pitchRef` (two Euler angles)
- `keysRef {w,s,a,d}` → `{w, s, a, d, q, e}` — add pitch keys
- Each star: add `worldZ` (real 3D coordinate), `viewZ` (computed per-frame), `_rotX1`/`_rotY2` (cached view-space coords)

**New helper — `getForwardVector(yaw, pitch)`:**
```
x = sin(yaw) * cos(pitch)
y = sin(pitch)
z = cos(yaw) * cos(pitch)
```

**Key bindings:**
- W/S = throttle (forward/brake) — unchanged
- A/D + ArrowLeft/Right = yaw (horizontal turn)
- Q/E + ArrowUp/Down = pitch (vertical look up/down)
- Pitch clamped to ±89° to prevent gimbal lock

**`enter()` changes:**
- Camera starts at `{x: galaxyCenter.x, y: galaxyCenter.y, z: 0}`, yaw=0, pitch=0
- Each star gets `worldZ` via seeded RNG in `±SPAWN_DIST` (±800 from camera)
- Stars distributed in 3D volume, not just a 2D plane

**`tick()` rewrite — true 3D math per frame:**
1. **Rotation:** A/D adjust yaw by `YAW_RATE=0.035`, Q/E adjust pitch by `PITCH_RATE=0.025`, clamp pitch
2. **Velocity:** W accelerates, S brakes, else friction — same as before
3. **Position:** `cam += getForwardVector(yaw, pitch) * velocity` — moves along 3D look direction
4. **View transform for every star** (one loop, pre-compute yaw/pitch trig once):
   - Translate: `rel = star.world - cam`
   - Yaw rotation (around Y): `rotX1 = relX*cosYaw + relZ*sinYaw`, `rotZ1 = -relX*sinYaw + relZ*cosYaw`
   - Pitch rotation (around X): `rotY2 = relY*cosPitch - rotZ1*sinPitch`, `viewZ = relY*sinPitch + rotZ1*cosPitch`
   - Cache `star.viewZ`, `star._rotX1`, `star._rotY2` on the star object for the renderer
5. **Recycling:** When `viewZ < MIN_VIEW_Z` (behind camera), respawn ahead using forward vector + random spread
6. **Sort by `viewZ`** descending every 5 frames (far → near, painter's algorithm)
7. **Target detection:** Project all stars to screen coords, find closest to center

**`project()` rewrite — uses cached view-space coords:**
```
if (star.viewZ <= MIN_VIEW_Z) return null;  // behind camera
focalLength = stageWidth * 0.6             // ~80° FOV
projX = cx + (star._rotX1 / star.viewZ) * focalLength
projY = cy - (star._rotY2 / star.viewZ) * focalLength  // negate Y for screen coords
scale = focalLength / star.viewZ
```
Returns `null` for stars behind camera — renderer must handle this.

**`sortStars()` change:** Compare `star.viewZ` instead of old `star.z`

**Constants changes:**
- Remove: `MIN_Z`, `MAX_Z`, `SPAWN_Z_RANGE`, `TURN_RATE`
- Add: `YAW_RATE=0.035`, `PITCH_RATE=0.025`, `PITCH_MAX=89°`, `MIN_VIEW_Z=0.5`, `SPAWN_DIST=800`, `RECYCLE_Z=1200`, `LABEL_Z_MAX=800`
- Export `LABEL_Z_MAX` as named export for RocketLayer to import

---

### 2. `client/src/components/Universe/layers/RocketLayer.jsx` — Labels + null handling

**Changes to sceneFunc:**

**Speed lines → converging streaks:**
- Lines now go from outer ring **toward** center (not outward) to simulate tunnel-vision forward motion
- Outer radius: `200 + speedRatio * 300`, inner radius: `40 + speedRatio * 60`

**Star rendering — null guard:**
- `project()` now returns `null` for behind-camera stars → add `if (!projected) continue;`
- Rest of star glow/core rendering stays the same

**New: Dynamic star labels (after each star's glow, when close):**
- Condition: `viewZ < LABEL_Z_MAX` (800 units)
- `labelOpacity = (1 - viewZ / LABEL_Z_MAX) * (1 - speedRatio * 0.8)` — fades in on approach, fades out at high speed
- Title: bold, white, `ctx.fillText()`, font size scaled by `focalLength * star.radius / viewZ * 0.015` clamped 10–18px
- Author: smaller, blue-tinted, drawn below title
- Positioned below the star glow (`projY + drawR * 1.8 + fontSize`)
- This is automatic "billboarding" — canvas 2D text always faces the camera

**Import `LABEL_Z_MAX` from the hook file.**

---

### 3. `client/src/components/Universe/components/RocketHUD.jsx` — Pitch indicator + updated hints

- Add `pitch` state, poll `rocketMode.pitch.current` at 10Hz alongside speed/target
- Add pitch indicator display (shows degrees + arrow when |pitch| > 5°)
- Update controls hint: `W/S Throttle` | `A/D Yaw` | `Q/E Pitch` | `ENTER Read` | `ESC Exit`

---

### 4. `client/src/components/Universe/Universe.module.css` — Minor addition

- Add `.rocketPitch` class: absolute top-right, monospace, semi-transparent

---

### 5. `client/src/components/Universe/Universe.jsx` — No changes needed

The hook API (`enter()`, `exit()`, `getTargetedPost()`, `getSpeedRatio()`) stays identical. Universe.jsx never accesses the renamed internal refs directly.

## Implementation Order
1. `useRocketMode.js` — rewrite constants, refs, enter(), exit(), tick(), sortStars(), project()
2. `RocketLayer.jsx` — null guard, converging speed lines, label rendering
3. `RocketHUD.jsx` — pitch state + updated controls
4. `Universe.module.css` — `.rocketPitch` class
5. Build verification

## Verification
1. Enter Rocket Mode via galaxy → "Explore Galaxy"
2. Press W — fly forward, stars approach from all directions (not just ahead)
3. Press A/D — yaw left/right, stars rotate horizontally
4. Press Q/E — pitch up/down, stars rotate vertically (can look up at stars above)
5. Rotate 180° — see stars you passed receding behind you
6. Fly toward a star cluster — labels (title + author) fade in as you approach
7. Labels disappear at high speed (opacity reduced)
8. Speed lines converge toward center (tunnel effect)
9. Targeting bracket still works, Enter navigates to post
10. ESC returns to strategic mode cleanly
